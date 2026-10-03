import { describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '../../../src/providers/llm/provider';
import { compactContext } from '../../../src/features/chat/contextCompactionService';

/** A fresh provider + spy per call — tests never share mock call history. */
function fakeProvider(answer: string | (() => string)): LlmProvider {
  return {
    name: 'fake',
    isConfigured: () => true,
    generateAnswer: vi.fn(async () => (typeof answer === 'function' ? answer() : answer)),
  };
}

describe('compactContext', () => {
  it('leaves short context alone — no call, no compaction', async () => {
    const provider = fakeProvider('should never be used');
    const result = await compactContext('short context', 100, provider, 'gpt-4o-mini');
    expect(result).toEqual({ context: 'short context', compacted: false });
    expect(provider.generateAnswer).not.toHaveBeenCalled();
  });

  it('is off entirely when budgetWords is 0, however long the context is', async () => {
    const provider = fakeProvider('should never be used');
    const longContext = 'word '.repeat(500);
    const result = await compactContext(longContext, 0, provider, 'gpt-4o-mini');
    expect(result).toEqual({ context: longContext, compacted: false });
    expect(provider.generateAnswer).not.toHaveBeenCalled();
  });

  it('compacts context once it crosses the budget, and marks the result as compacted', async () => {
    const provider = fakeProvider('The compressed reference material.');
    const longContext = 'word '.repeat(500); // 500 words
    const result = await compactContext(longContext, 100, provider, 'gpt-4o-mini');
    expect(result).toEqual({ context: 'The compressed reference material.', compacted: true });
    expect(provider.generateAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ context: longContext, temperature: 0, history: [] }),
    );
  });

  it('hard-trims a compacted result that ignores the length instruction', async () => {
    const provider = fakeProvider(() => 'x'.repeat(5000));
    const result = await compactContext('word '.repeat(500), 100, provider, 'gpt-4o-mini');
    expect(result.compacted).toBe(true);
    expect(result.context.length).toBeLessThanOrEqual(2500);
  });

  it('falls back to the original context, unchanged, when the compaction call fails', async () => {
    const provider: LlmProvider = {
      name: 'fake',
      isConfigured: () => true,
      generateAnswer: vi.fn(async () => {
        throw new Error('LLM unavailable');
      }),
    };
    const longContext = 'word '.repeat(500);
    const result = await compactContext(longContext, 100, provider, 'gpt-4o-mini');
    expect(result).toEqual({ context: longContext, compacted: false });
  });

  it('falls back to the original context when the model returns an empty response', async () => {
    const provider = fakeProvider('   ');
    const longContext = 'word '.repeat(500);
    const result = await compactContext(longContext, 100, provider, 'gpt-4o-mini');
    expect(result).toEqual({ context: longContext, compacted: false });
  });
});
