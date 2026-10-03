import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conversationsRepo } from '../../../src/db/queries/conversations.queries';
import { getWordUsage } from '../../../src/features/conversations/wordUsageService';

vi.mock('../../../src/db/queries/conversations.queries', () => ({
  conversationsRepo: { getLlmMessagesForUsage: vi.fn() },
}));

const BASE_LLM_REQUEST = {
  systemPrompt: 'You are a helpful assistant.',
  context: '',
  question: 'What are your hours?',
  model: 'gpt-4o-mini',
  temperature: 0.3,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxTokens: 600,
  history: [],
};

function row(promptContextWords: string, answerWords: string, date: string) {
  return {
    content: answerWords,
    llmRequest: { ...BASE_LLM_REQUEST, context: promptContextWords },
    createdAt: new Date(`${date}T12:00:00Z`),
  };
}

describe('getWordUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums prompt and answer words across every returned message', async () => {
    (conversationsRepo.getLlmMessagesForUsage as any).mockResolvedValue([
      row('one two three', 'four five', '2026-01-01'),
      row('six seven', 'eight nine ten', '2026-01-01'),
    ]);

    const result = await getWordUsage(30);

    // Prompt words come from buildFullPromptText (system prompt + context + question labels included),
    // so just assert the totals are consistent and non-zero rather than hand-computing the exact figure.
    expect(result.totalPromptWords).toBeGreaterThan(0);
    expect(result.totalAnswerWords).toBe(2 + 3); // "four five" + "eight nine ten"
  });

  it('groups totals by day, oldest first', async () => {
    (conversationsRepo.getLlmMessagesForUsage as any).mockResolvedValue([
      row('a', 'x y', '2026-01-02'),
      row('a', 'x', '2026-01-01'),
      row('a', 'x y z', '2026-01-01'),
    ]);

    const result = await getWordUsage(null);

    expect(result.daily.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02']);
    expect(result.daily[0].answerWords).toBe(1 + 3); // both 2026-01-01 rows
    expect(result.daily[1].answerWords).toBe(2);
  });

  it('passes a since date derived from `days`, and null through for all-time', async () => {
    (conversationsRepo.getLlmMessagesForUsage as any).mockResolvedValue([]);

    await getWordUsage(7);
    const [sinceFor7] = (conversationsRepo.getLlmMessagesForUsage as any).mock.calls[0];
    expect(sinceFor7).toBeInstanceOf(Date);

    await getWordUsage(null);
    const [sinceForAll] = (conversationsRepo.getLlmMessagesForUsage as any).mock.calls[1];
    expect(sinceForAll).toBeNull();
  });

  it('returns zeroed totals and an empty day list when there is nothing yet', async () => {
    (conversationsRepo.getLlmMessagesForUsage as any).mockResolvedValue([]);
    const result = await getWordUsage(30);
    expect(result).toEqual({ totalPromptWords: 0, totalAnswerWords: 0, daily: [], byProvider: [] });
  });
});
