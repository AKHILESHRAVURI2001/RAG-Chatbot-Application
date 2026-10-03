import type { LlmProvider, ConversationTurn } from '../../providers/llm/provider';
import { QUERY_REWRITE_SYSTEM_PROMPT } from '../../config/prompts';

const HISTORY_EXCERPT_CHARS = 400;
const REWRITE_MAX_TOKENS = 60;
// The rewrite only improves the search query, so it must never hold up the answer for long. A normal rewrite takes ~1 s.
const REWRITE_WAIT_MS = 1200;

/**
 * What to search for when the AI rewrite is late or fails: the visitor's previous question followed by this one.
 * "and what about overseas buyers?" alone finds little; with the earlier question it finds the right pages — and it
 * costs nothing, so the answer never waits for the rewrite.
 */
export function fallbackSearchQuery(message: string, history: ConversationTurn[]): string {
  const previousQuestion = [...history].reverse().find((turn) => turn.role === 'user')?.content.trim();
  return previousQuestion ? `${previousQuestion.slice(0, 200)} ${message}`.trim() : message;
}

function renderHistory(history: ConversationTurn[]): string {
  return history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content.slice(0, HISTORY_EXCERPT_CHARS)}`)
    .join('\n');
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function rewriteFollowUpQuery(
  provider: LlmProvider,
  model: string,
  message: string,
  history: ConversationTurn[],
  baseUrl?: string,
): Promise<string> {
  if (history.length === 0) return message;
  const fallback = fallbackSearchQuery(message, history);
  try {
    const rewritePromise = provider.generateAnswer({
      systemPrompt: QUERY_REWRITE_SYSTEM_PROMPT,
      context: `Conversation so far:\n${renderHistory(history)}`,
      question: message,
      model,
      baseUrl,
      temperature: 0,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxTokens: REWRITE_MAX_TOKENS,
      history: [],
    });
    const rewritten = await withTimeout(rewritePromise, REWRITE_WAIT_MS, fallback);
    const cleaned = rewritten.trim().replace(/^["']|["']$/g, '');
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}
