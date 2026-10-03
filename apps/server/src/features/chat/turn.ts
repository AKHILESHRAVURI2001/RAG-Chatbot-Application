import type { AnswerSource, CacheSettings, ChatResponse, LlmRequestLogDTO, LlmSettings, PromptSettings } from '../../shared';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { settingsRepo } from '../../db/queries/settings.queries';
import { SessionBlockedError } from '../../utils/errors';
import { hashQuestion } from '../../utils/hash';
import { env } from '../../config/env';
import { COMPACTION_MESSAGE_FETCH_LIMIT } from './historyCompactionService';
import { stripRelatedArticles } from './promptAssembly';
import { enforceSessionQuota } from './sessionLimits';
import type { Respond } from './answerPipelineStages';

export interface AnswerOptions {
  skipQuota?: boolean;
  documentId?: string;
  tag?: string;
  bypassCache?: boolean;
  channel?: 'text' | 'voice';
}

export type HistoryTurn = Awaited<ReturnType<typeof conversationsRepo.getRecentMessages>>[number];

/**
 * Everything the stages of one chat turn need to know, decided once at the start. Stages read it; they don't each
 * re-load settings or re-derive "is this a follow-up?". (`compacted` is the one thing a later stage may set.)
 */
export interface Turn {
  sessionId: string;
  message: string;
  hash: string;
  channel: 'text' | 'voice';
  options: AnswerOptions;
  conversationId: string;
  startedAt: number;
  /** Settings with the voice agent's overrides already applied when this is a voice turn. */
  llm: LlmSettings;
  prompt: PromptSettings;
  cache: CacheSettings;
  ttlSeconds: number;
  previousSummary: string | null;
  recentTurns: HistoryTurn[];
  isFollowUp: boolean;
  isScoped: boolean;
  /** Follow-ups, scoped widgets and bypass requests must not be answered from (or saved to) the caches. */
  skipFastPath: boolean;
  /** Set when earlier turns were folded into a recap; reported back to the widget. */
  compacted: boolean;
  /** Sends the final answer: records the assistant message in the background and builds the response. */
  respond: Respond;
}

/**
 * Loads what a turn needs and refuses it if it isn't allowed: blocked sessions, and visitors over their message
 * limit, never get further than this. The visitor's message is saved (in the background) right away so it always
 * counts toward their quota — even if a cache answers it.
 */
export async function startTurn(sessionId: string, rawMessage: string, options: AnswerOptions = {}): Promise<Turn> {
  const startedAt = Date.now();
  const message = rawMessage.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!message) throw new Error('Empty message');

  const channel = options.channel ?? 'text';

  const [found, limitsSettings, baseLlmSettings, cacheSettings, basePromptSettings, voiceSettings] = await Promise.all([
    conversationsRepo.findOrCreateBySession(sessionId),
    settingsRepo.getLimits(),
    settingsRepo.getLlm(),
    settingsRepo.getCache(),
    settingsRepo.getPrompt(),
    channel === 'voice' ? settingsRepo.getVoice() : Promise.resolve(null),
  ]);

  const { id: conversationId, blocked } = found;
  const previousSummary = found.summary ?? null;
  const summaryUntil = found.summaryUntil ?? null;

  if (blocked) throw blockedError(found.blockedUntil);

  const llm: LlmSettings = voiceSettings
    ? {
        ...baseLlmSettings,
        ...(voiceSettings.overrideTuning
          ? {
              temperature: voiceSettings.temperature,
              maxTokens: voiceSettings.maxTokens,
              topP: voiceSettings.topP,
              frequencyPenalty: voiceSettings.frequencyPenalty,
              presencePenalty: voiceSettings.presencePenalty,
              historyLimit: voiceSettings.historyLimit,
              maxContextChars: voiceSettings.maxContextChars,
              maxHistoryCharsPerTurn: voiceSettings.maxHistoryCharsPerTurn,
              rewriteFollowUpQueries: voiceSettings.rewriteFollowUpQueries,
              autoCompactHistoryWords: voiceSettings.autoCompactHistoryWords,
              autoCompactContextWords: voiceSettings.autoCompactContextWords,
            }
          : {}),
      }
    : baseLlmSettings;

  const prompt: PromptSettings = voiceSettings
    ? {
        ...basePromptSettings,
        systemPrompt: voiceSettings.systemPrompt || basePromptSettings.systemPrompt,
        noContextMessage: voiceSettings.noContextMessage || basePromptSettings.noContextMessage,
      }
    : basePromptSettings;

  // The quota check and the history read don't depend on each other, so they run together (one round trip instead of two).
  // If the quota check rejects, the history result is simply discarded.
  const [, fetchedTurns] = await Promise.all([
    enforceSessionQuota(conversationId, message, limitsSettings, Boolean(options.skipQuota)),
    conversationsRepo.getRecentMessages(conversationId, COMPACTION_MESSAGE_FETCH_LIMIT, summaryUntil),
  ]);
  const recentTurns = fetchedTurns.map((t) => (t.role === 'assistant' ? { ...t, content: stripRelatedArticles(t.content) } : t));
  const isFollowUp = previousSummary !== null || recentTurns.length > 0;
  const isScoped = Boolean(options.documentId) || Boolean(options.tag);

  // Saving the transcript must not delay the visitor's answer: each save runs in the background, and the assistant's
  // row waits for the user's row first so the two always land in the right order. A failed save is logged, not thrown.
  const userMessageSaved: Promise<unknown> = (async () => {
    await conversationsRepo.addMessage(conversationId, 'user', message, undefined, undefined, undefined, channel);
  })().catch((err) => console.error('[chatService] Failed to save the user message:', err?.message ?? err));

  const turn: Turn = {
    sessionId,
    message,
    hash: hashQuestion(message),
    channel,
    options,
    conversationId,
    startedAt,
    llm,
    prompt,
    cache: cacheSettings,
    ttlSeconds: cacheSettings.ttlSeconds > 0 ? cacheSettings.ttlSeconds : env.CACHE_TTL_SECONDS,
    previousSummary,
    recentTurns,
    isFollowUp,
    isScoped,
    skipFastPath: isFollowUp || isScoped || Boolean(options.bypassCache),
    compacted: false,
    respond: async (answer: string, source: AnswerSource, llmRequest?: LlmRequestLogDTO): Promise<ChatResponse> => {
      const responseTimeMs = Date.now() - startedAt;
      void userMessageSaved
        .then(() => conversationsRepo.addMessage(conversationId, 'assistant', answer, source, llmRequest, responseTimeMs, channel))
        .catch((err) => console.error('[chatService] Failed to save the assistant message:', err?.message ?? err));
      return { answer, source, conversationId, compacted: turn.compacted };
    },
  };
  return turn;
}

function blockedError(blockedUntil: string | Date | null | undefined): SessionBlockedError {
  if (blockedUntil && new Date() < new Date(blockedUntil)) {
    const remainingMs = Math.max(0, new Date(blockedUntil).getTime() - Date.now());
    const remainingMins = Math.ceil(remainingMs / (60 * 1000));
    const timeStr =
      remainingMins >= 60
        ? `${Math.floor(remainingMins / 60)}h ${remainingMins % 60 > 0 ? `${remainingMins % 60}m` : ''}`.trim()
        : `${remainingMins} minute${remainingMins === 1 ? '' : 's'}`;
    return new SessionBlockedError(`This chat is temporarily paused. It will automatically unlock in ${timeStr}. Please try again later.`);
  }
  return new SessionBlockedError('This chat has been closed. Please contact us another way if you still need help.');
}
