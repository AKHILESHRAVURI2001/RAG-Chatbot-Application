import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../../../src/db/pool';
import { runReadOnlyQuery, ReadOnlyQueryError } from '../../../src/features/queryTool/readOnlyQueryService';

vi.mock('../../../src/db/pool', () => ({
  pool: { connect: vi.fn() },
}));

describe('runReadOnlyQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an empty query without ever opening a connection', async () => {
    await expect(runReadOnlyQuery('   ')).rejects.toThrow(ReadOnlyQueryError);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects a second statement without ever opening a connection', async () => {
    await expect(runReadOnlyQuery('select 1; delete from messages')).rejects.toThrow(/single statement/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('allows exactly one trailing semicolon', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ n: 1 }] }), release: vi.fn() };
    (pool.connect as any).mockResolvedValue(client);
    await runReadOnlyQuery('select 1;');
    expect(pool.connect).toHaveBeenCalled();
  });

  it.each(['insert into messages values (1)', 'update messages set content = 1', 'delete from messages', 'drop table messages', 'truncate messages'])(
    'rejects a write-shaped query without ever opening a connection: %s',
    async (sql) => {
      await expect(runReadOnlyQuery(sql)).rejects.toThrow(/only SELECT queries/i);
      expect(pool.connect).not.toHaveBeenCalled();
    },
  );

  it('runs a real SELECT inside a READ ONLY transaction and always rolls back', async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn((sql: string) => {
        queries.push(sql);
        if (sql === 'select 1 as n') return Promise.resolve({ rows: [{ n: 1 }] });
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    (pool.connect as any).mockResolvedValue(client);

    const result = await runReadOnlyQuery('select 1 as n');

    expect(result).toEqual({ rows: [{ n: 1 }], rowCount: 1, truncated: false });
    expect(queries[0]).toMatch(/READ ONLY/);
    expect(queries).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back and releases the connection even when the query itself fails', async () => {
    const client = {
      query: vi.fn((sql: string) => {
        if (sql === 'select * from nope') return Promise.reject(new Error('relation "nope" does not exist'));
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    (pool.connect as any).mockResolvedValue(client);

    await expect(runReadOnlyQuery('select * from nope')).rejects.toThrow(/does not exist/);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('reports truncation and caps rows when the result exceeds the row limit', async () => {
    const bigResult = { rows: Array.from({ length: 600 }, (_, i) => ({ n: i })) };
    const client = {
      query: vi.fn((sql: string) => (sql.startsWith('select') ? Promise.resolve(bigResult) : Promise.resolve({ rows: [] }))),
      release: vi.fn(),
    };
    (pool.connect as any).mockResolvedValue(client);

    const result = await runReadOnlyQuery('select * from big_table');

    expect(result.rows).toHaveLength(500);
    expect(result.rowCount).toBe(600);
    expect(result.truncated).toBe(true);
  });
});
