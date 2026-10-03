import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../../../src/db/pool';
import { conversationsRepo } from '../../../src/db/queries/conversations.queries';

vi.mock('../../../src/db/pool', () => ({ pool: { query: vi.fn() } }));

function row(role: 'user' | 'assistant', content: string, secondsAgo: number) {
  return { role, content, created_at: new Date(Date.now() - secondsAgo * 1000) };
}

/** getRecentMessages fetches newest-first, then reverses — rows here are given oldest-first for readability and reversed before mocking. */
function mockRawRows(rowsOldestFirst: ReturnType<typeof row>[]) {
  (pool.query as any).mockResolvedValue({ rows: [...rowsOldestFirst].reverse() });
}

describe('conversationsRepo.getRecentMessages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a clean alternating history when nothing went wrong', async () => {
    mockRawRows([row('user', 'hi', 40), row('assistant', 'hello', 39), row('user', 'bye', 10), row('assistant', 'goodbye', 9)]);
    const result = await conversationsRepo.getRecentMessages('conv-1', 10);
    expect(result.map((r) => r.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(result.map((r) => r.content)).toEqual(['hi', 'hello', 'bye', 'goodbye']);
  });

  it('omits a question whose answer errored out, instead of leaving it as a dangling user turn', async () => {
    // A question that failed, then a question that succeeded — Gemini and
    // Anthropic both reject history that doesn't strictly alternate starting
    // with 'user'; two adjacent 'user' rows (which is what a naive
    // error-filter leaves behind) breaks that live.
    mockRawRows([
      row('user', 'What is X?', 40),
      row('assistant', '[error] The AI provider failed to respond.', 39),
      row('user', 'What is Y?', 10),
      row('assistant', 'Y is this.', 9),
    ]);
    const result = await conversationsRepo.getRecentMessages('conv-1', 10);
    expect(result.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(result.map((r) => r.content)).toEqual(['What is Y?', 'Y is this.']);
  });

  it('omits a question that never got any reply at all (a mid-pipeline crash that never reached the error-logging catch)', async () => {
    mockRawRows([row('user', 'orphaned question', 40), row('user', 'What is Y?', 10), row('assistant', 'Y is this.', 9)]);
    const result = await conversationsRepo.getRecentMessages('conv-1', 10);
    expect(result.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(result[0].content).toBe('What is Y?');
  });

  it('never returns history starting with an assistant turn, however messy the raw log is', async () => {
    mockRawRows([
      row('assistant', 'orphan reply with no question', 50), // shouldn't normally happen, but must not corrupt the result
      row('user', 'q1', 40),
      row('assistant', '[error] failed', 39),
      row('user', 'q2', 30),
      row('assistant', '[error] failed', 29),
      row('user', 'q3', 20),
      row('assistant', 'a3', 19),
    ]);
    const result = await conversationsRepo.getRecentMessages('conv-1', 10);
    expect(result[0]?.role ?? 'assistant').not.toBe('assistant');
    expect(result.map((r) => r.content)).toEqual(['q3', 'a3']);
  });

  it('keeps only whole pairs when the configured limit is odd, rather than cutting one in half', async () => {
    mockRawRows([row('user', 'q1', 40), row('assistant', 'a1', 39), row('user', 'q2', 20), row('assistant', 'a2', 19)]);
    const result = await conversationsRepo.getRecentMessages('conv-1', 3); // odd
    expect(result.map((r) => r.role)).toEqual(['user', 'assistant']); // 1 whole pair, not a trailing fragment
    expect(result.map((r) => r.content)).toEqual(['q2', 'a2']);
  });

  it('returns an empty array (not everything) when the limit rounds down to zero pairs', async () => {
    mockRawRows([row('user', 'q1', 40), row('assistant', 'a1', 39)]);
    const result = await conversationsRepo.getRecentMessages('conv-1', 1); // floor(1/2) === 0 pairs
    expect(result).toEqual([]);
  });

  it('passes the `since` watermark through as a query parameter', async () => {
    mockRawRows([]);
    const since = new Date('2026-01-01T00:00:00Z');
    await conversationsRepo.getRecentMessages('conv-1', 10, since);
    const [, params] = (pool.query as any).mock.calls[0];
    expect(params).toEqual(['conv-1', 40, since]); // rawLimit = limit*2 + 20
  });
});

describe('conversationsRepo.setBlocked & findOrCreateBySession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets permanent block when duration is omitted', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: 1 });
    const result = await conversationsRepo.setBlocked('conv-1', true);
    expect(result.blocked).toBe(true);
    expect(result.blockedUntil).toBeNull();
    expect(result.blockReason).toBe('admin_manual');

    const [sql, params] = (pool.query as any).mock.calls[0];
    expect(sql).toContain('update conversations set blocked = $2, blocked_until = $3, block_reason = $4');
    expect(params[0]).toBe('conv-1');
    expect(params[1]).toBe(true);
    expect(params[2]).toBeNull();
  });

  it('sets temporary time-based block when duration is provided', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: 1 });
    const result = await conversationsRepo.setBlocked('conv-1', true, 30, 'rate_limit');
    expect(result.blocked).toBe(true);
    expect(result.blockedUntil).toBeInstanceOf(Date);
    expect(result.blockReason).toBe('rate_limit');

    const [, params] = (pool.query as any).mock.calls[0];
    expect(params[1]).toBe(true);
    expect(params[2]).toBeInstanceOf(Date);
    expect(params[3]).toBe('rate_limit');
  });

  it('unblocks automatically when temporary block has expired', async () => {
    const expiredDate = new Date(Date.now() - 1000 * 60); // 1 minute in the past
    (pool.query as any).mockResolvedValueOnce({
      rows: [
        {
          id: 'conv-1',
          blocked: true,
          blocked_until: expiredDate,
          block_reason: 'rate_limit',
          summary: null,
          summary_until: null,
        },
      ],
    });
    (pool.query as any).mockResolvedValueOnce({ rowCount: 1 }); // auto-unblock update

    const result = await conversationsRepo.findOrCreateBySession('sess-1');
    expect(result.blocked).toBe(false);
    expect(result.blockedUntil).toBeNull();
  });
});
