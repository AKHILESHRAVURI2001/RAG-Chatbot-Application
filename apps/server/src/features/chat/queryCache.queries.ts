import { pool, toVectorLiteral } from '../../db/pool';

export const queryCacheRepo = {
  /** Semantic-cache lookup: closest previously-answered question, if close enough. */
  async findSimilar(embedding: number[], threshold: number): Promise<{ id: string; answer: string; similarity: number } | null> {
    const { rows } = await pool.query(
      `select id, answer, 1 - (embedding <=> $1::vector) as similarity
       from query_cache
       where expires_at is null or expires_at > now()
       order by embedding <=> $1::vector
       limit 1`,
      [toVectorLiteral(embedding)],
    );
    const top = rows[0];
    if (!top || Number(top.similarity) < threshold) return null;
    return { id: top.id, answer: top.answer, similarity: Number(top.similarity) };
  },

  async recordHit(id: string) {
    await pool.query('update query_cache set hit_count = hit_count + 1 where id = $1', [id]);
  },

  async upsert(queryText: string, queryHash: string, embedding: number[], answer: string, source: 'llm' | 'faq', ttlSeconds: number) {
    await pool.query(
      `insert into query_cache (query_text, query_hash, embedding, answer, source, expires_at)
       values ($1, $2, $3::vector, $4, $5, now() + ($6 || ' seconds')::interval)
       on conflict (query_hash) do update
         set answer = excluded.answer, hit_count = query_cache.hit_count + 1, expires_at = excluded.expires_at`,
      [queryText, queryHash, toVectorLiteral(embedding), answer, source, ttlSeconds],
    );
  },

  async topQuestions(limit = 10) {
    const { rows } = await pool.query(
      'select query_text as question, hit_count from query_cache order by hit_count desc limit $1',
      [limit],
    );
    return rows.map((r) => ({ question: r.question, hitCount: Number(r.hit_count) }));
  },

  async flush() {
    await pool.query('truncate table query_cache');
  },
};
