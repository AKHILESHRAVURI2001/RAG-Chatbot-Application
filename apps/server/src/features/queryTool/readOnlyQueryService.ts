import { pool } from '../../db/pool';

const MAX_ROWS = 500;
const STATEMENT_TIMEOUT_MS = 5000;

const WRITE_KEYWORD_PATTERN =
  /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|vacuum|copy|call|do|refresh\s+materialized|lock)\b/i;

export class ReadOnlyQueryError extends Error {}

export async function runReadOnlyQuery(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number; truncated: boolean }> {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!trimmed) throw new ReadOnlyQueryError('Query is empty.');
  if (trimmed.includes(';')) throw new ReadOnlyQueryError('Only a single statement is allowed — remove the extra ";".');
  if (WRITE_KEYWORD_PATTERN.test(trimmed)) {
    throw new ReadOnlyQueryError('Only SELECT queries are allowed here — this looks like it modifies data.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    try {
      const result = await client.query(trimmed);
      const truncated = result.rows.length > MAX_ROWS;
      return { rows: result.rows.slice(0, MAX_ROWS), rowCount: result.rows.length, truncated };
    } finally {
      await client.query('ROLLBACK');
    }
  } catch (err) {
    if (err instanceof ReadOnlyQueryError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ReadOnlyQueryError(message);
  } finally {
    client.release();
  }
}
