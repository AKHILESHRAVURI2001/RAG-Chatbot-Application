import type { LlmRequestLogDTO } from '../../shared';
import { buildFullPromptText } from '../../shared';
import { getLlmProvider } from '../../providers/llm';
import { withRetry } from '../../utils/retry';
import { NO_ANSWER_TOKEN, NO_ANSWER_INSTRUCTION } from '../../config/prompts';
import { apiKeyOverrides, maskKey } from '../../config/apiKeyOverrides';
import { wordCount } from './historyCompactionService';
import { compactContext } from './contextCompactionService';
import { buildRelatedArticles, withRelatedArticles, stripRelatedArticles, trimHistory, shouldSuggestArticles, detectTriggerCategories } from './promptAssembly';
import { rememberAnswer } from './rememberAnswer';
import { answerWithoutLlm, buildNoMatchAuditRequest, noContextMessage, recordUnanswered } from './noAnswer';
import type { Turn } from './turn';
import type { Knowledge } from './knowledgeRetrieval';

/**
 * The last stage: ask the AI to answer from the retrieved content, then tidy and remember the answer.
 * (Failure and "nothing found" cases are handled in noAnswer.ts.)
 */
export async function generateAnswer(turn: Turn, k: Knowledge, embedding: number[]) {
  const { message, respond, llm: llmSettings, prompt: promptSettings, cache: cacheSettings } = turn;
  const { rawContext, matchingChunks, usedChunks, relevantChunks, maxSimilarity } = k;
  const isContinuation = turn.isFollowUp;
  const cleanNoContext = noContextMessage(turn);
  const provider = getLlmProvider(llmSettings.provider);

  if (llmSettings.llmEnabled === false) {
    return answerWithoutLlm(turn, k, 'unconfigured', 'LLM is disabled by admin. Serving knowledge-base response only.');
  }

  if (!provider.isConfigured()) {
    return answerWithoutLlm(turn, k, 'unconfigured', `The selected LLM provider "${llmSettings.provider}" has no API key configured.`);
  }

  // Short-circuit for fresh questions with no relevant knowledge-base context.
  if (matchingChunks.length === 0 && !isContinuation) {
    await recordUnanswered(turn, k, 'no_context_found');
    const auditReq = buildNoMatchAuditRequest(turn, k,
      `AI skipped: Max vector similarity (${((maxSimilarity ?? 0) * 100).toFixed(0)}%) was below the context threshold (${(cacheSettings.contextThreshold * 100).toFixed(0)}%) on a fresh query.`,
    );
    return respond(cleanNoContext, 'no-match', auditReq);
  }

  const contextCompaction =
    llmSettings.autoCompactContextWords > 0
      ? await compactContext(rawContext, llmSettings.autoCompactContextWords, provider, llmSettings.model, llmSettings.customBaseUrl)
      : { context: rawContext, compacted: false };

  const llmRequest = buildLlmRequest(turn, k, contextCompaction.context, contextCompaction.compacted);

  const promptWords = wordCount(buildFullPromptText(llmRequest));
  llmRequest.promptWords = promptWords;

  let answer: string;
  try {
    // The Gemini provider already retries and fails over between models internally; wrapping it in another retry
    // multiplied a slow/overloaded call into a minute-long wait. Other providers keep one outer retry.
    answer = await withRetry(() => provider.generateAnswer(llmRequest), { retries: provider.name === 'gemini' ? 0 : 1, baseDelayMs: 300 });
    if (!answer || !answer.trim()) {
      throw new Error(`The "${llmSettings.provider}" provider returned an empty response. Please try again.`);
    }
  } catch (err: any) {
    console.warn(`[chatService] LLM provider "${llmSettings.provider}" failed:`, err?.message || err);
    return answerWithoutLlm(turn, k, 'error', err?.message);
  }

  const answerWords = wordCount(answer);
  llmRequest.answerWords = answerWords;
  llmRequest.totalWords = promptWords + answerWords;

  if (answer.trim() === NO_ANSWER_TOKEN) {
    await recordUnanswered(turn, k, usedChunks.length === 0 ? 'no_context_found' : 'insufficient_answer');
    return respond(cleanNoContext, 'no-match', llmRequest);
  }

  if (promptSettings.showRelatedArticles !== false) {
    const isSuggested = shouldSuggestArticles(answer, usedChunks.length);
    const queryIntent = detectTriggerCategories(`${message} ${answer}`);
    const relatedArticles = buildRelatedArticles(usedChunks, isSuggested ? relevantChunks : [], queryIntent);
    answer = withRelatedArticles(answer, relatedArticles, isSuggested);
  }

  rememberAnswer(turn, embedding, answer, llmRequest);

  return respond(answer, 'llm', llmRequest);
}


/** The record of exactly what was sent to the AI (shown in Chat Logs), built once and filled in as the call completes. */
function buildLlmRequest(turn: Turn, k: Knowledge, context: string, contextCompacted: boolean): LlmRequestLogDTO {
  const { message, llm: llmSettings, prompt: promptSettings } = turn;
  const { searchQuery, history, usedChunks, vectorMatchesAudit, autoCompactProgress } = k;
  const isContinuation = turn.isFollowUp;
  const configuredKeys = apiKeyOverrides.getAll(llmSettings.provider);
  const activeKeyMasked = configuredKeys[0] ? maskKey(configuredKeys[0]) : undefined;
  return {
    provider: llmSettings.provider,
    apiKeyMasked: activeKeyMasked,
    apiKeyIndex: configuredKeys.length > 0 ? 1 : undefined,
    keyCount: configuredKeys.length,
    systemPrompt: `${promptSettings.systemPrompt}${NO_ANSWER_INSTRUCTION}`,
    context,
    question: message,
    model: llmSettings.model,
    ...(llmSettings.provider === 'custom' ? { baseUrl: llmSettings.customBaseUrl } : {}),
    temperature: llmSettings.temperature,
    topP: llmSettings.topP,
    frequencyPenalty: llmSettings.frequencyPenalty,
    presencePenalty: llmSettings.presencePenalty,
    maxTokens: llmSettings.maxTokens,
    history: isContinuation ? trimHistory(history, llmSettings.maxHistoryCharsPerTurn) : [],
    ...(searchQuery !== message ? { searchQuery } : {}),
    contextChunks: usedChunks.map((c) => ({
      title: c.title,
      words: c.content.trim() ? c.content.trim().split(/\s+/).length : 0,
      similarity: Number(c.similarity.toFixed(3)),
    })),
    isContinuation,
    ...(isContinuation && k.compactedSummary ? { historySummary: k.compactedSummary } : {}),
    ...(autoCompactProgress ? { autoCompactProgress } : {}),
    ...(contextCompacted ? { contextCompacted: true } : {}),
    pipelineAudit: {
      stagesChecked: [
        { stage: 'Stage 0: Restricted Words', status: 'miss' },
        { stage: 'Stage 1: Exact Cache', status: 'miss' },
        { stage: 'Stage 2: FAQ Search', status: 'miss' },
        { stage: 'Stage 3: Question Chunks', status: 'miss' },
        { stage: 'Stage 4: Semantic Cache', status: 'miss' },
        { stage: 'Stage 5: Vector Knowledge Search', status: 'hit', details: `Included ${usedChunks.length} matching knowledge chunk(s)` },
        { stage: 'Stage 6: LLM Generation', status: 'hit', details: `Executed ${llmSettings.provider} (${llmSettings.model})` },
      ],
      vectorMatches: vectorMatchesAudit,
    },
  };
}
