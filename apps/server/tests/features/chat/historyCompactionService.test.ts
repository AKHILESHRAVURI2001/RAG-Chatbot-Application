import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '../../../src/providers/llm/provider';

vi.mock('../../../src/db/queries/conversations.queries', () => ({
  conversationsRepo: { getSummaryState: vi.fn(), getRecentMessages: vi.fn(), setSummary: vi.fn() },
}));
vi.mock('../../../src/db/queries/settings.queries', () => ({ settingsRepo: { getLlm: vi.fn() } }));
vi.mock('../../../src/providers/llm', () => ({ getLlmProvider: vi.fn() }));

import { conversationsRepo } from '../../../src/db/queries/conversations.queries';
import { settingsRepo } from '../../../src/db/queries/settings.queries';
import { getLlmProvider } from '../../../src/providers/llm';
import { compactHistory, historyWords, manualCompactConversation, ManualCompactError, wordCount } from '../../../src/features/chat/historyCompactionService';

function turn(role: 'user' | 'assistant', content: string, daysAgo: number) {
  return { role, content, createdAt: new Date(Date.now() - daysAgo * 86_400_000) };
}

/** A fresh provider + spy per call — tests never share mock call history. */
function fakeProvider(answer: string | (() => string)): LlmProvider {
  return {
    name: 'fake',
    isConfigured: () => true,
    generateAnswer: vi.fn(async () => (typeof answer === 'function' ? answer() : answer)),
  };
}

/** Two old, heavy turns (candidates for folding) followed by four recent, light ones (always kept verbatim — see KEEP_VERBATIM). */
function sixTurns() {
  return [
    turn('user', 'word '.repeat(200), 5),
    turn('assistant', 'word '.repeat(200), 5),
    turn('user', 'word '.repeat(200), 4),
    turn('assistant', 'word '.repeat(200), 4),
    turn('user', 'What about the deposit?', 0),
    turn('assistant', 'You need 10% down.', 0),
  ];
}

describe('wordCount / historyWords', () => {
  it('counts whitespace-separated words, treating blank text as zero', () => {
    expect(wordCount('  ')).toBe(0);
    expect(wordCount('one two   three')).toBe(3);
  });

  it('adds the summary word count to every turn word count', () => {
    const turns = [turn('user', 'a b c', 1), turn('assistant', 'd e', 1)];
    expect(historyWords(null, turns)).toBe(5);
    expect(historyWords('x y', turns)).toBe(7);
  });
});

describe('compactHistory', () => {
  it('leaves history untouched when under budget', async () => {
    const provider = fakeProvider('unused');
    const turns = [turn('user', 'hello', 1), turn('assistant', 'hi there', 1)];
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 800, provider, model: 'gpt-4o-mini' });
    expect(result.summary).toBeNull();
    expect(result.keptTurns).toBe(turns);
    expect(result.persist).toBeUndefined();
    expect(provider.generateAnswer).not.toHaveBeenCalled();
  });

  it('is a no-op when budgetWords is 0 (the admin off switch), however long the history is', async () => {
    const provider = fakeProvider('unused');
    const turns = sixTurns();
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 0, provider, model: 'gpt-4o-mini' });
    expect(result.keptTurns).toBe(turns);
    expect(provider.generateAnswer).not.toHaveBeenCalled();
  });

  it('folds older turns into a recap once the word budget is exceeded, keeping the newest turns verbatim', async () => {
    const provider = fakeProvider('Recap: the visitor asked about pricing.');
    const turns = sixTurns();
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 100, provider, model: 'gpt-4o-mini' });

    expect(result.summary).toBe('Recap: the visitor asked about pricing.');
    // The newest 4 messages (2 turns) survive verbatim; the older 2 are folded.
    expect(result.keptTurns).toHaveLength(4);
    expect(result.keptTurns[0].content).toBe('word '.repeat(200));
    expect(result.keptTurns[3].content).toBe('You need 10% down.');
    expect(result.persist).toEqual({ summary: 'Recap: the visitor asked about pricing.', until: turns[1].createdAt });
  });

  it('carries a prior recap forward as context when compacting again', async () => {
    const provider = fakeProvider('Updated recap.');
    const turns = sixTurns();
    await compactHistory({ previousSummary: 'Earlier recap here.', turns, budgetWords: 50, provider, model: 'gpt-4o-mini' });
    expect(provider.generateAnswer).toHaveBeenCalledTimes(1);
    const [{ context }] = (provider.generateAnswer as any).mock.calls[0];
    expect(context).toContain('Earlier recap here.');
  });

  it('never folds the newest turns even when the whole history is short', async () => {
    const provider = fakeProvider('unused');
    const turns = [turn('user', 'word '.repeat(500), 0), turn('assistant', 'word '.repeat(500), 0)];
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 10, provider, model: 'gpt-4o-mini' });
    expect(result.keptTurns).toBe(turns);
    expect(result.persist).toBeUndefined();
    expect(provider.generateAnswer).not.toHaveBeenCalled();
  });

  it('fails soft to the untouched history when the summarizing call throws', async () => {
    const failing: LlmProvider = {
      name: 'fake',
      isConfigured: () => true,
      generateAnswer: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const turns = sixTurns();
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 10, provider: failing, model: 'gpt-4o-mini' });
    expect(result.summary).toBeNull();
    expect(result.keptTurns).toBe(turns);
    expect(result.persist).toBeUndefined();
  });

  it('falls back to the full history when the model returns an empty recap', async () => {
    const empty = fakeProvider('   ');
    const turns = sixTurns();
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 10, provider: empty, model: 'gpt-4o-mini' });
    expect(result.keptTurns).toBe(turns);
    expect(result.persist).toBeUndefined();
  });

  it('hard-trims a recap that ignores the length instruction', async () => {
    const huge = fakeProvider(() => 'x'.repeat(5000));
    const turns = sixTurns();
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 10, provider: huge, model: 'gpt-4o-mini' });
    expect(result.summary?.length).toBeLessThanOrEqual(1200);
  });

  it('force compacts even when well under budget — the admin "Compact now" action', async () => {
    const provider = fakeProvider('Forced recap.');
    const turns = sixTurns(); // well under any generous budget
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 100_000, provider, model: 'gpt-4o-mini', force: true });
    expect(result.summary).toBe('Forced recap.');
    expect(provider.generateAnswer).toHaveBeenCalledTimes(1);
  });

  it('force still does nothing when there are no turns old enough to fold', async () => {
    const provider = fakeProvider('unused');
    const turns = [turn('user', 'hi', 0), turn('assistant', 'hello', 0)]; // fewer than KEEP_VERBATIM
    const result = await compactHistory({ previousSummary: null, turns, budgetWords: 100_000, provider, model: 'gpt-4o-mini', force: true });
    expect(result.keptTurns).toBe(turns);
    expect(provider.generateAnswer).not.toHaveBeenCalled();
  });
});

describe('manualCompactConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (settingsRepo.getLlm as any).mockResolvedValue({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('throws when the conversation does not exist', async () => {
    (conversationsRepo.getSummaryState as any).mockResolvedValue(null);
    await expect(manualCompactConversation('missing')).rejects.toThrow(ManualCompactError);
  });

  it('throws a clear error when the active provider has no API key configured', async () => {
    (conversationsRepo.getSummaryState as any).mockResolvedValue({ summary: null, summaryUntil: null });
    (getLlmProvider as any).mockReturnValue({ name: 'openai', isConfigured: () => false, generateAnswer: vi.fn() });
    await expect(manualCompactConversation('conv-1')).rejects.toThrow(/no API key configured/);
  });

  it('folds the whole fetched history into a recap and persists it, reporting the word counts', async () => {
    (conversationsRepo.getSummaryState as any).mockResolvedValue({ summary: null, summaryUntil: null });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(sixTurns());
    (getLlmProvider as any).mockReturnValue({ name: 'openai', isConfigured: () => true, generateAnswer: vi.fn(async () => 'The whole-chat recap.') });

    const result = await manualCompactConversation('conv-1');

    expect(result.summary).toBe('The whole-chat recap.');
    expect(result.wordsAfter).toBeLessThan(result.wordsBefore);
    expect(conversationsRepo.setSummary).toHaveBeenCalledWith('conv-1', 'The whole-chat recap.', expect.any(Date));
  });

  it('throws instead of silently no-op-ing when the conversation is too short to compact', async () => {
    (conversationsRepo.getSummaryState as any).mockResolvedValue({ summary: null, summaryUntil: null });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([turn('user', 'hi', 0), turn('assistant', 'hello', 0)]);
    (getLlmProvider as any).mockReturnValue({ name: 'openai', isConfigured: () => true, generateAnswer: vi.fn() });

    await expect(manualCompactConversation('conv-1')).rejects.toThrow(ManualCompactError);
    expect(conversationsRepo.setSummary).not.toHaveBeenCalled();
  });
});
