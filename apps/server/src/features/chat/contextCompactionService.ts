import type { LlmProvider } from '../../providers/llm/provider';
import { CONTEXT_COMPACTION_SYSTEM_PROMPT } from '../../config/prompts';
import { wordCount } from './historyCompactionService';

const COMPACTED_CONTEXT_MAX_CHARS = 2500;
const COMPACTED_CONTEXT_MAX_TOKENS = 600;

export interface ContextCompactionResult {
  context: string;
  compacted: boolean;
}

export async function compactContext(
  context: string,
  budgetWords: number,
  provider: LlmProvider,
  model: string,
  baseUrl?: string,
): Promise<ContextCompactionResult> {
  const unchanged: ContextCompactionResult = { context, compacted: false };

  if (budgetWords <= 0) return unchanged;
  if (wordCount(context) <= budgetWords) return unchanged;

  try {
    const summaryPromise = provider.generateAnswer({
      systemPrompt: CONTEXT_COMPACTION_SYSTEM_PROMPT,
      context,
      question: 'Write the compressed version of the reference material above.',
      model,
      baseUrl,
      temperature: 0,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxTokens: COMPACTED_CONTEXT_MAX_TOKENS,
      history: [],
    });

    const summary = await Promise.race([
      summaryPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Context compaction timeout')), 3500)),
    ]);

    const cleaned = summary.trim().slice(0, COMPACTED_CONTEXT_MAX_CHARS);
    return cleaned ? { context: cleaned, compacted: true } : unchanged;
  } catch {
    return unchanged;
  }
}
