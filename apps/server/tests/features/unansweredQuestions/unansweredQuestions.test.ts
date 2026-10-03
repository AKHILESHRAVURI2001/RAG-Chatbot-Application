import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pool } from '../../../src/db/pool';
import { unansweredQuestionsRepo } from '../../../src/db/queries/unansweredQuestions.queries';

vi.mock('../../../src/db/pool', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../../src/db/autoMigrate', () => ({
  ensureDbSchema: vi.fn().mockResolvedValue(undefined),
}));

describe('unansweredQuestionsRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records an unanswered question successfully', async () => {
    (pool.query as any).mockResolvedValueOnce({
      rows: [
        {
          id: 'uq-1',
          question: 'What are the refund policies?',
          session_id: 'session-123',
          conversation_id: 'conv-123',
          reason: 'no_context_found',
          similarity_score: 0.22,
          context_chunks: [{ title: 'Terms', similarity: 0.22 }],
          created_at: new Date('2026-09-29T12:00:00Z'),
        },
      ],
    });

    const result = await unansweredQuestionsRepo.record({
      question: 'What are the refund policies?',
      sessionId: 'session-123',
      conversationId: 'conv-123',
      reason: 'no_context_found',
      similarityScore: 0.22,
      contextChunks: [{ title: 'Terms', similarity: 0.22 }],
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('uq-1');
    expect(result?.question).toBe('What are the refund policies?');
    expect(result?.reason).toBe('no_context_found');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('lists unanswered questions with filtering and pagination', async () => {
    (pool.query as any)
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'uq-1',
            question: 'What are the refund policies?',
            session_id: 'session-123',
            conversation_id: 'conv-123',
            reason: 'no_context_found',
            similarity_score: 0.22,
            context_chunks: null,
            created_at: new Date('2026-09-29T12:00:00Z'),
          },
        ],
      });

    const result = await unansweredQuestionsRepo.list({
      limit: 10,
      offset: 0,
      search: 'refund',
      reason: 'no_context_found',
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].question).toBe('What are the refund policies?');
  });

  it('deletes a single unanswered question by ID', async () => {
    (pool.query as any).mockResolvedValueOnce({ rowCount: 1 });

    const deleted = await unansweredQuestionsRepo.deleteById('uq-1');
    expect(deleted).toBe(true);
    expect(pool.query).toHaveBeenCalledWith('delete from unanswered_questions where id = $1', ['uq-1']);
  });

  it('deletes all unanswered questions', async () => {
    (pool.query as any).mockResolvedValueOnce({ rowCount: 5 });

    const deletedCount = await unansweredQuestionsRepo.deleteAll();
    expect(deletedCount).toBe(5);
    expect(pool.query).toHaveBeenCalledWith('delete from unanswered_questions');
  });

  it('returns statistics breakdown by reason', async () => {
    (pool.query as any)
      .mockResolvedValueOnce({ rows: [{ total: 10 }] })
      .mockResolvedValueOnce({
        rows: [
          { reason: 'no_context_found', count: 6 },
          { reason: 'insufficient_answer', count: 4 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 8 }] });

    const stats = await unansweredQuestionsRepo.getStats();
    expect(stats.total).toBe(10);
    expect(stats.byReason).toEqual({
      no_context_found: 6,
      insufficient_answer: 4,
    });
    expect(stats.last7Days).toBe(8);
  });
});
