import type { UnansweredQuestionChunkSnippet } from '../../shared';
import { documentsRepo } from '../../db/queries/documents.queries';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { embedText } from '../../providers/embedding/resolve';
import { getLlmProvider } from '../../providers/llm';
import { normalizeQuestion } from '../../utils/hash';
import { rewriteFollowUpQuery } from './queryRewriteService';
import { compactHistory, historyWords } from './historyCompactionService';
import { buildContext } from './promptAssembly';
import type { Turn } from './turn';

/** What the bot found in your content for this question, plus the conversation context to send with it. */
export interface Knowledge {
  /** What was actually searched for (a follow-up is rewritten into a standalone question). */
  searchQuery: string;
  /** Earlier turns to send to the AI (already trimmed to the history limit). */
  history: Awaited<ReturnType<typeof compactHistory>>['keptTurns'];
  /** A recap standing in for older turns, when the conversation was long. */
  compactedSummary: string | null;
  autoCompactProgress?: { wordsSoFar: number; budgetWords: number };
  /** Every chunk the search returned. */
  relevantChunks: Awaited<ReturnType<typeof documentsRepo.searchSimilarChunks>>;
  /** The chunks similar enough to count as context. */
  matchingChunks: Knowledge['relevantChunks'];
  /** The chunks that actually fit into the prompt. */
  usedChunks: Knowledge['relevantChunks'];
  rawContext: string;
  maxSimilarity: number | null;
  chunkSnippets: UnansweredQuestionChunkSnippet[];
  /** The top matches with their scores, for the Chat Logs "why this answer" view. */
  vectorMatchesAudit: Array<{ title: string | null; similarity: number; threshold: number; passedThreshold: boolean; sourceRef: string | null; snippet: string }>;
}

/**
 * Prepares everything the AI (or the "no answer" reply) needs: folds a long conversation into a recap, turns a
 * follow-up like "and what about overseas buyers?" into a searchable question, and searches your content.
 */
export async function retrieveKnowledge(
  turn: Turn,
  embedding: number[],
  /** A content search for the question as typed that is already running (see fastPath.ts); used when no rewrite changes the query. */
  prefetchedSearch?: ReturnType<typeof documentsRepo.searchSimilarChunks>,
): Promise<Knowledge> {
  const { message, conversationId, previousSummary, recentTurns, llm: llmSettings, cache: cacheSettings, options } = turn;
  const isFollowUp = turn.isFollowUp;
  const provider = getLlmProvider(llmSettings.provider);

  const compacted =
    provider.isConfigured() && llmSettings.autoCompactHistoryWords > 0
      ? await compactHistory({
          previousSummary,
          turns: recentTurns,
          budgetWords: llmSettings.autoCompactHistoryWords,
          provider,
          model: llmSettings.model,
          baseUrl: llmSettings.customBaseUrl,
        })
      : { summary: previousSummary, keptTurns: recentTurns };

  if ('persist' in compacted && compacted.persist) {
    await conversationsRepo.setSummary(conversationId, compacted.persist.summary, compacted.persist.until);
  }

  turn.compacted = Boolean(compacted.summary);

  const autoCompactProgress =
    llmSettings.autoCompactHistoryWords > 0
      ? { wordsSoFar: historyWords(previousSummary, recentTurns), budgetWords: llmSettings.autoCompactHistoryWords }
      : undefined;

  const history = llmSettings.historyLimit > 0 ? compacted.keptTurns.slice(-llmSettings.historyLimit) : [];

  const isGreetingOrGeneral = /^(hi|hello|hey|greetings|help|who are you|what can you do|how are you|are you help me|thanks|thank you|bye)$/i.test(message.trim().replace(/[^a-zA-Z\s]/g, ''));
  const containsAmbiguousPronoun = /\b(it|that|this|they|them|these|those|there|he|she|him|her|its|their|which one)\b/i.test(message);
  const isConversationalContinuation = /\b(tell\s*me|know|more|details|explain|show|give|what\s*(about|else|is|are)|how\s*(much|about|many)|then|yes|sure|okay|ok)\b/i.test(message);
  const shouldRewrite = isFollowUp && llmSettings.rewriteFollowUpQueries && !isGreetingOrGeneral && provider.isConfigured() && (containsAmbiguousPronoun || isConversationalContinuation);
  const rewriteHistory = compacted.summary
    ? [{ role: 'assistant' as const, content: `[Earlier in this conversation] ${compacted.summary}` }, ...history]
    : history;

  const searchQuery = shouldRewrite
    ? await rewriteFollowUpQuery(provider, llmSettings.model, message, rewriteHistory, llmSettings.customBaseUrl)
    : message;

  const searchEmbedding = searchQuery !== message ? await embedText(normalizeQuestion(searchQuery) || searchQuery) : embedding;

  const enableDocumentSearch = llmSettings.enableDocumentSearch !== false;
  const relevantChunks = !enableDocumentSearch
    ? []
    : await (searchQuery === message && prefetchedSearch
        ? prefetchedSearch
        : documentsRepo.searchSimilarChunks(searchEmbedding, 5, options.documentId, options.tag, searchQuery || message));

  const matchingChunks = relevantChunks.filter((c) => c.similarity >= cacheSettings.contextThreshold);
  const { context: rawContext, includedChunks: usedChunks } = buildContext(matchingChunks, llmSettings.maxContextChars);

  const maxSimilarity = relevantChunks.length > 0 ? Math.max(...relevantChunks.map((c) => c.similarity)) : null;
  const chunkSnippets: UnansweredQuestionChunkSnippet[] = relevantChunks.slice(0, 3).map((c) => ({
    title: c.title,
    similarity: Number(c.similarity.toFixed(3)),
    sourceRef: c.sourceRef,
    snippet: c.content.trim().slice(0, 150),
  }));

  const vectorMatchesAudit = relevantChunks.slice(0, 5).map((c) => ({
    title: c.title,
    similarity: Number(c.similarity.toFixed(3)),
    threshold: cacheSettings.contextThreshold,
    passedThreshold: c.similarity >= cacheSettings.contextThreshold,
    sourceRef: c.sourceRef,
    snippet: c.content.trim().slice(0, 150),
  }));

  return {
    searchQuery,
    history,
    compactedSummary: compacted.summary ?? null,
    autoCompactProgress,
    relevantChunks,
    matchingChunks,
    usedChunks,
    rawContext,
    maxSimilarity,
    chunkSnippets,
    vectorMatchesAudit,
  };
}
