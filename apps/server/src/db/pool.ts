import { Pool } from 'pg';
import { env } from '../config/env';

// Connection pool for Postgres 13+ with pgvector support
const isLocalHost = /(^|@)(localhost|127\.0\.0\.1)([:/]|$)/.test(env.DATABASE_URL);
const useSsl = env.DATABASE_SSL !== undefined ? env.DATABASE_SSL : !isLocalHost;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  // pg closes a connection after 10 s idle by default. The next message then waits ~1 s while a new one is opened
  // (TLS handshake + login), which a visitor feels as a slow first reply after any short pause. Keep them open.
  idleTimeoutMillis: 10 * 60_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error', err);
});

const WARM_CONNECTIONS = 6; // a chat message runs up to ~6 queries at once
const WARM_INTERVAL_MS = 30_000;
const EMBEDDING_DIMENSIONS = 384;
// Any vector of the right length: the ping only needs to walk the index, not find a real match.
const WARM_VECTOR = `[${Array.from({ length: EMBEDDING_DIMENSIONS }, () => '0.05').join(',')}]`;
const VECTOR_TABLES = ['chunks', 'faqs', 'question_chunks', 'query_cache'];

/**
 * Keeps the database ready for the next visitor, in two ways:
 *  1. A handful of connections stay open. Hosted poolers (Supabase, PgBouncer, load balancers) close idle ones, and
 *     opening a new one costs ~1 s.
 *  2. The vector indexes stay in the database's memory. The same content search takes 0.5 ms when its index is
 *     cached and 50–120 ms when it has to be read back in after a quiet period.
 * A light ping every 30 s does both. Call once at startup; it is not started on import so tests stay quiet.
 */
export function keepPoolWarm(): void {
  let warnedAboutIndexes = false;
  const warm = async () => {
    try {
      await Promise.all(Array.from({ length: WARM_CONNECTIONS }, () => pool.query('select 1')));
    } catch (err: any) {
      console.warn('[db] Keep-warm ping failed (will retry):', err.message);
      return;
    }
    // Touch each vector index. A table that doesn't exist yet (before migrations) is not worth a warning every 30 s.
    await Promise.all(
      VECTOR_TABLES.map((table) =>
        pool.query(`select 1 from ${table} order by embedding <=> $1::vector limit 1`, [WARM_VECTOR]).catch((err: any) => {
          if (!warnedAboutIndexes) {
            warnedAboutIndexes = true;
            console.warn(`[db] Could not warm the ${table} index (this is only an optimization):`, err.message);
          }
        }),
      ),
    );
  };
  void warm();
  setInterval(() => void warm(), WARM_INTERVAL_MS).unref();
}

// Converts number[] embedding into Postgres pgvector format
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
