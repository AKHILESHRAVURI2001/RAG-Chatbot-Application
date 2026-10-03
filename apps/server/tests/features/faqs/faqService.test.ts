import { beforeEach, describe, expect, it, vi } from 'vitest';
// vi.mock calls are hoisted above these imports by vitest's transform, so the
// static imports below still resolve to the mocked modules.
import { faqsRepo } from '../../../src/db/queries/faqs.queries';
import { redisCache } from '../../../src/cache/redis';
import { faqService } from '../../../src/features/faqs/faqService';

vi.mock('../../../src/db/queries/faqs.queries', () => ({
  faqsRepo: {
    list: vi.fn(),
    create: vi.fn(async (question: string, answer: string) => ({ id: 'faq-1', question, answer, isActive: true, createdAt: 'now', updatedAt: 'now' })),
    update: vi.fn(async (id: string, question: string, answer: string, isActive: boolean) => ({ id, question, answer, isActive, createdAt: 'now', updatedAt: 'now' })),
    delete: vi.fn(),
    findBestMatch: vi.fn(),
  },
}));

vi.mock('../../../src/cache/redis', () => ({
  redisCache: { flushAll: vi.fn(), get: vi.fn(), set: vi.fn() },
}));

vi.mock('../../../src/providers/embedding/resolve', () => ({
  embedText: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('faqService.create', () => {
  it('rejects a blank question', async () => {
    await expect(faqService.create('   ', 'an answer')).rejects.toThrow(/question cannot be empty/);
    expect(faqsRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a blank answer', async () => {
    await expect(faqService.create('a question', '   ')).rejects.toThrow(/answer cannot be empty/);
  });

  it('trims whitespace, stores the FAQ, and flushes the cache', async () => {
    const faq = await faqService.create('  What are your hours?  ', '  9-5  ');
    expect(faqsRepo.create).toHaveBeenCalledWith('What are your hours?', '9-5', [0.1, 0.2, 0.3]);
    expect(redisCache.flushAll).toHaveBeenCalledTimes(1);
    expect(faq.question).toBe('What are your hours?');
  });
});

describe('faqService.update', () => {
  it('rejects blank input the same way create does', async () => {
    await expect(faqService.update('faq-1', '', 'answer', true)).rejects.toThrow(/question cannot be empty/);
    expect(faqsRepo.update).not.toHaveBeenCalled();
  });
});

describe('faqService.importJson', () => {
  it('skips blank entries instead of aborting the whole batch, and flushes the cache once', async () => {
    const result = await faqService.importJson([
      { question: 'Q1', answer: 'A1' },
      { question: '   ', answer: 'A2' },
      { question: 'Q3', answer: '' },
      { question: 'Q4', answer: 'A4' },
    ]);
    expect(result.created).toHaveLength(2);
    expect(result.skipped).toBe(2);
    expect(faqsRepo.create).toHaveBeenCalledTimes(2);
    expect(redisCache.flushAll).toHaveBeenCalledTimes(1);
  });

  it('does not touch the cache at all when every entry is blank', async () => {
    const result = await faqService.importJson([{ question: '', answer: '' }]);
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(redisCache.flushAll).not.toHaveBeenCalled();
  });
});
