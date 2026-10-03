import type { LlmProvider, ConversationTurn } from '../../providers/llm/provider';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { settingsRepo } from '../../db/queries/settings.queries';
import { getLlmProvider } from '../../providers/llm';
import { HISTORY_COMPACTION_SYSTEM_PROMPT } from '../../config/prompts';

const KEEP_VERBATIM = 4;
const SUMMARY_MAX_CHARS = 1200;
const SUMMARY_MAX_TOKENS = 300;
export const COMPACTION_MESSAGE_FETCH_LIMIT = 500;

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function historyWords(summary: string | null, turns: { content: string }[]): number {
  return wordCount(summary ?? '') + turns.reduce((sum, t) => sum + wordCount(t.content), 0);
}

function render(turns: ConversationTurn[]): string {
  return turns.map((t) => `${t.role === 'user' ? 'Visitor' : 'Assistant'}: ${t.content}`).join('\n');
}

export interface CompactionInput {
  previousSummary: string | null;
  turns: (ConversationTurn & { createdAt: Date })[];
  budgetWords: number;
  provider: LlmProvider;
  model: string;
  baseUrl?: string;
  force?: boolean;
}

export interface CompactionResult {
  summary: string | null;
  keptTurns: (ConversationTurn & { createdAt: Date })[];
  persist?: { summary: string; until: Date };
}

export async function compactHistory({
  previousSummary,
  turns,
  budgetWords,
  provider,
  model,
  baseUrl,
  force,
}: CompactionInput): Promise<CompactionResult> {
  const unchanged: CompactionResult = { summary: previousSummary, keptTurns: turns };

  if (!force) {
    if (budgetWords <= 0) return unchanged;
    if (historyWords(previousSummary, turns) <= budgetWords) return unchanged;
  }

  const toFold = turns.slice(0, Math.max(0, turns.length - KEEP_VERBATIM));
  if (toFold.length === 0) return unchanged;

  const keptTurns = turns.slice(toFold.length);
  const priorSection = previousSummary ? `Recap of the conversation so far:\n${previousSummary}\n\n` : '';

  try {
    const summaryPromise = provider.generateAnswer({
      systemPrompt: HISTORY_COMPACTION_SYSTEM_PROMPT,
      context: `${priorSection}Messages to fold into the recap:\n${render(toFold)}`,
      question: 'Write the updated recap of everything above.',
      model,
      baseUrl,
      temperature: 0,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxTokens: SUMMARY_MAX_TOKENS,
      history: [],
    });

    const summary = await Promise.race([
      summaryPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Compaction timeout')), 3500)),
    ]);

    const cleaned = summary.trim().slice(0, SUMMARY_MAX_CHARS);
    if (!cleaned) return unchanged;

    return {
      summary: cleaned,
      keptTurns,
      persist: { summary: cleaned, until: toFold[toFold.length - 1].createdAt },
    };
  } catch {
    return unchanged;
  }
}

export class ManualCompactError extends Error {}

export interface ManualCompactResult {
  summary: string;
  wordsBefore: number;
  wordsAfter: number;
}

export async function manualCompactConversation(conversationId: string): Promise<ManualCompactResult> {
  const state = await conversationsRepo.getSummaryState(conversationId);
  if (!state) throw new ManualCompactError('Conversation not found.');

  const llmSettings = await settingsRepo.getLlm();
  const provider = getLlmProvider(llmSettings.provider);
  if (!provider.isConfigured()) {
    throw new ManualCompactError(`The "${llmSettings.provider}" provider has no API key configured.`);
  }

  const turns = await conversationsRepo.getRecentMessages(conversationId, COMPACTION_MESSAGE_FETCH_LIMIT, state.summaryUntil);
  const wordsBefore = historyWords(state.summary, turns);

  const result = await compactHistory({
    previousSummary: state.summary,
    turns,
    budgetWords: 0,
    provider,
    model: llmSettings.model,
    force: true,
  });

  if (!result.persist) {
    throw new ManualCompactError(
      turns.length === 0
        ? 'Nothing to compact yet — this conversation has no uncompacted history.'
        : 'Not enough history to compact — recent turns are always kept verbatim.',
    );
  }

  await conversationsRepo.setSummary(conversationId, result.persist.summary, result.persist.until);
  return { summary: result.persist.summary, wordsBefore, wordsAfter: historyWords(result.summary, result.keptTurns) };
}
