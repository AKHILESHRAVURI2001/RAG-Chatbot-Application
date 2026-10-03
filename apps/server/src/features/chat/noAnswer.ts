import type { LlmRequestLogDTO } from '../../shared';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { unansweredQuestionsRepo } from '../../db/queries/unansweredQuestions.queries';
import defaultSettings from '../../config/defaultSettings.json';
import { trimHistory } from './promptAssembly';
import type { Turn } from './turn';
import type { Knowledge } from './knowledgeRetrieval';

/**
 * When the bot can't (or shouldn't) write an AI answer: show the closest related content, or say it has no answer
 * — and, in both "nothing found" cases, record the question so an admin can add the answer later (Unanswered Qs).
 */

function buildChunkFallbackAnswer(
  chunks: Array<{ title: string | null; sourceRef: string | null; content: string; similarity: number }>,
  customIntro?: string,
): string {
  const intro =
    customIntro && customIntro.trim()
      ? customIntro.trim()
      : defaultSettings.prompt.chunkFallbackIntroMessage;

  const seenKeys = new Set<string>();
  const items: string[] = [];

  for (const c of chunks) {
    const title = c.title?.trim() || 'Related Article';
    const isHttpLink = c.sourceRef && (c.sourceRef.startsWith('http://') || c.sourceRef.startsWith('https://'));
    const dedupeKey = isHttpLink ? c.sourceRef!.trim().toLowerCase() : title.toLowerCase();

    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    if (isHttpLink) {
      items.push(`* [${title}](${c.sourceRef})`);
    } else {
      const excerpt = c.content.trim().replace(/\s+/g, ' ').slice(0, 160);
      items.push(`* **${title}**: ${excerpt}${excerpt.length >= 160 ? '…' : ''}`);
    }
  }

  return `${intro}\n\n${items.join('\n')}`;
}

/** The configured "I don't have that information" reply, with any dangling "at https://" fragments removed. */
export function noContextMessage(turn: Turn): string {
  const raw = turn.prompt.noContextMessage || 'I do not have that information.';
  return raw.replace(/\s*at\s+https?:\/\/?(\s|$)/gi, '.').replace(/https?:\/\/?(\s|$)/gi, '').trim();
}

/** Saves the question for the admin's "Unanswered Qs" list (unless the admin turned that logging off). */
export async function recordUnanswered(turn: Turn, k: Knowledge, reason: Parameters<typeof unansweredQuestionsRepo.record>[0]['reason']): Promise<void> {
  if (turn.llm.enableUnansweredQuestionsLogging === false) return;
  await unansweredQuestionsRepo.record({
    question: turn.message,
    sessionId: turn.sessionId,
    conversationId: turn.conversationId,
    reason,
    similarityScore: k.maxSimilarity,
    contextChunks: k.chunkSnippets,
  });
}

/** The log record for a turn where the AI was skipped, so Chat Logs can show why. */
export function buildNoMatchAuditRequest(turn: Turn, k: Knowledge, reasonStr: string): LlmRequestLogDTO {
  const { message, llm: llmSettings, prompt: promptSettings, cache: cacheSettings } = turn;
  const { searchQuery, history, rawContext, matchingChunks, relevantChunks, maxSimilarity, vectorMatchesAudit, autoCompactProgress } = k;
  const isContinuation = turn.isFollowUp;
  return {
    provider: llmSettings.provider,
    model: llmSettings.model,
    ...(llmSettings.provider === 'custom' ? { baseUrl: llmSettings.customBaseUrl } : {}),
    systemPrompt: promptSettings.systemPrompt,
    context: rawContext,
    question: message,
    ...(searchQuery !== message ? { searchQuery } : {}),
    temperature: llmSettings.temperature,
    topP: llmSettings.topP,
    frequencyPenalty: llmSettings.frequencyPenalty,
    presencePenalty: llmSettings.presencePenalty,
    maxTokens: llmSettings.maxTokens,
    history: isContinuation ? trimHistory(history, llmSettings.maxHistoryCharsPerTurn) : [],
    isContinuation,
    ...(isContinuation && k.compactedSummary ? { historySummary: k.compactedSummary } : {}),
    ...(autoCompactProgress ? { autoCompactProgress } : {}),
    pipelineAudit: {
      skippedReason: reasonStr,
      stagesChecked: [
        { stage: 'Stage 0: Restricted Words', status: 'miss' },
        { stage: 'Stage 1: Exact Cache', status: 'miss' },
        { stage: 'Stage 2: FAQ Search', status: 'miss' },
        { stage: 'Stage 3: Question Chunks', status: 'miss' },
        { stage: 'Stage 4: Semantic Cache', status: 'miss' },
        {
          stage: 'Stage 5: Vector Knowledge Search',
          status: matchingChunks.length > 0 ? 'hit' : 'miss',
          details: relevantChunks.length > 0
            ? `Top candidate similarity ${((maxSimilarity ?? 0) * 100).toFixed(0)}% vs threshold ${(cacheSettings.contextThreshold * 100).toFixed(0)}%`
            : 'No vector chunks found in database',
        },
      ],
      vectorMatches: vectorMatchesAudit,
    },
  };
}

/** The AI is switched off, unconfigured or failed: serve related content if there is any, otherwise a "no answer" reply. */
export async function answerWithoutLlm(
  turn: Turn,
  k: Knowledge,
  failureReason: 'unconfigured' | 'error',
  errorDetail?: string,
) {
  const { message, sessionId, conversationId, channel, startedAt, respond, llm: llmSettings, prompt: promptSettings, cache: cacheSettings } = turn;
  const { relevantChunks, matchingChunks, maxSimilarity, chunkSnippets, vectorMatchesAudit } = k;
  const cleanNoContext = noContextMessage(turn);
  const showChunkFallback = llmSettings.showChunkFallbackWhenLlmUnavailable !== false;
  const showChunkFallbackWhenLlmEnabled = Boolean(llmSettings.showChunkFallbackWhenLlmEnabled);
  const fallbackMinSimilarity = llmSettings.chunkFallbackMinSimilarity ?? 0.48;
  const fallbackMaxResults = llmSettings.chunkFallbackMaxResults ?? 3;
  const noMatchAudit = (reasonStr: string) => buildNoMatchAuditRequest(turn, k, reasonStr);

  const allowFallback = failureReason === 'unconfigured'
    ? (llmSettings.showChunkFallbackWhenLlmUnavailable !== false)
    : (showChunkFallbackWhenLlmEnabled || showChunkFallback);

  const effFallbackThreshold = Math.min(cacheSettings.contextThreshold, fallbackMinSimilarity, 0.35);
  const candidateChunks = allowFallback
    ? relevantChunks.filter((c) => c.similarity >= effFallbackThreshold)
    : [];

  if (candidateChunks.length > 0) {
    const topFallbackChunks = candidateChunks.slice(0, fallbackMaxResults);
    const fallbackAnswer = buildChunkFallbackAnswer(topFallbackChunks, promptSettings.chunkFallbackIntroMessage);

    const fallbackLlmRequest: LlmRequestLogDTO = {
      provider: 'chunk-fallback',
      systemPrompt: `Knowledge-base fallback (LLM ${failureReason}: ${errorDetail || 'unavailable'})`,
      context: topFallbackChunks.map((c) => c.content).join('\n---\n'),
      question: message,
      model: 'vector-relevance-fallback',
      temperature: 0,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxTokens: 0,
      history: [],
      contextChunks: topFallbackChunks.map((c) => ({
        title: c.title,
        words: c.content.trim() ? c.content.trim().split(/\s+/).length : 0,
        similarity: Number(c.similarity.toFixed(3)),
      })),
      pipelineAudit: {
        skippedReason: `LLM ${failureReason} (${errorDetail || 'error'}). Served matching knowledge-base chunks directly.`,
        stagesChecked: [
          { stage: 'Stage 0: Restricted Words', status: 'miss' },
          { stage: 'Stage 1: Exact Cache', status: 'miss' },
          { stage: 'Stage 2: FAQ Search', status: 'miss' },
          { stage: 'Stage 3: Question Chunks', status: 'miss' },
          { stage: 'Stage 4: Semantic Cache', status: 'miss' },
          { stage: 'Stage 5: Vector Knowledge Fallback', status: 'hit', details: `Found ${topFallbackChunks.length} matching knowledge chunk(s)` },
        ],
        vectorMatches: vectorMatchesAudit,
      },
    };

    return respond(fallbackAnswer, 'chunk-fallback', fallbackLlmRequest);
  }

  // No relevant chunks found above threshold (or chunk fallback disabled)
  const reason = failureReason === 'unconfigured'
    ? (matchingChunks.length === 0 ? 'no_context_found' : 'llm_unresponsive')
    : (matchingChunks.length === 0 ? 'no_context_found' : 'llm_failed_no_chunks');

  await recordUnanswered(turn, k, reason);

  if (!allowFallback && failureReason === 'error') {
    const userFacingError = 'Please try again after some time.';
    await conversationsRepo.addMessage(conversationId, 'assistant', `[error] ${userFacingError}`, undefined, undefined, Date.now() - startedAt, channel);
    throw new Error(errorDetail || userFacingError);
  }

  const auditReq = noMatchAudit(
    failureReason === 'unconfigured'
      ? `AI skipped: Provider "${llmSettings.provider}" is unconfigured or LLM master switch is OFF.`
      : `AI skipped: Provider error (${errorDetail || 'failed'}).`,
  );
  return respond(cleanNoContext, 'no-match', auditReq);
}
