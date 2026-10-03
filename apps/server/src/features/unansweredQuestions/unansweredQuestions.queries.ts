import { pool } from '../../db/pool';
import type { UnansweredQuestionDTO, UnansweredQuestionChunkSnippet } from '../../shared';
import { ensureDbSchema } from '../../db/autoMigrate';

export const unansweredQuestionsRepo = {
  async record(data: {
    question: string;
    sessionId?: string | null;
    conversationId?: string | null;
    reason: string;
    similarityScore?: number | null;
    contextChunks?: UnansweredQuestionChunkSnippet[] | null;
  }): Promise<UnansweredQuestionDTO | null> {
    const cleanQuestion = data.question.trim();
    if (!cleanQuestion) return null;

    const recordQuery = async () => {
      const { rows } = await pool.query(
        `with existing as (
           select id from unanswered_questions
           where lower(regexp_replace(question, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace($1, '[^a-zA-Z0-9]', '', 'g'))
           limit 1
         ),
         updated as (
           update unanswered_questions
           set question = $1, session_id = $2, conversation_id = $3, reason = $4, similarity_score = $5, context_chunks = $6, created_at = now()
           where id = (select id from existing)
           returning id, question, session_id, conversation_id, reason, similarity_score, context_chunks, created_at
         ),
         inserted as (
           insert into unanswered_questions (question, session_id, conversation_id, reason, similarity_score, context_chunks)
           select $1, $2, $3, $4, $5, $6
           where not exists (select 1 from existing)
           returning id, question, session_id, conversation_id, reason, similarity_score, context_chunks, created_at
         )
         select * from updated union all select * from inserted`,
        [
          cleanQuestion,
          data.sessionId ?? null,
          data.conversationId ?? null,
          data.reason,
          data.similarityScore !== undefined && data.similarityScore !== null ? Number(data.similarityScore) : null,
          data.contextChunks ? JSON.stringify(data.contextChunks) : null,
        ],
      );

      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        question: r.question,
        sessionId: r.session_id,
        conversationId: r.conversation_id,
        reason: r.reason,
        similarityScore: r.similarity_score !== null ? Number(r.similarity_score) : null,
        contextChunks: (r.context_chunks as UnansweredQuestionChunkSnippet[] | null) ?? null,
        createdAt: r.created_at,
      };
    };

    try {
      return await recordQuery();
    } catch (err: any) {
      if (err?.message?.includes('does not exist') || err?.message?.includes('unanswered_questions')) {
        await ensureDbSchema();
        try {
          return await recordQuery();
        } catch (innerErr: any) {
          console.warn('[unansweredQuestionsRepo] Failed to record unanswered question:', innerErr.message);
          return null;
        }
      }
      console.warn('[unansweredQuestionsRepo] Failed to record unanswered question:', err.message);
      return null;
    }
  },

  async deduplicateHistorical() {
    try {
      await pool.query(
        `delete from unanswered_questions a
         using unanswered_questions b
         where a.id < b.id 
           and lower(regexp_replace(a.question, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(b.question, '[^a-zA-Z0-9]', '', 'g'))`,
      );
    } catch {
      /* ignore if table not created yet */
    }
  },

  async list(params: {
    limit?: number;
    offset?: number;
    search?: string;
    reason?: string;
  }): Promise<{ items: UnansweredQuestionDTO[]; total: number }> {
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);

    const conditions: string[] = [];
    const values: any[] = [];

    if (params.search && params.search.trim()) {
      values.push(`%${params.search.trim().toLowerCase()}%`);
      conditions.push(`lower(question) like $${values.length}`);
    }

    if (params.reason && params.reason.trim()) {
      values.push(params.reason.trim());
      conditions.push(`reason = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

    try {
      const countRes = await pool.query(
        `select count(*)::int as total from unanswered_questions ${whereClause}`,
        values,
      );
      const total = countRes.rows[0]?.total ?? 0;

      const dataValues = [...values, limit, offset];
      const dataRes = await pool.query(
        `select id, question, session_id, conversation_id, reason, similarity_score, context_chunks, created_at
         from unanswered_questions
         ${whereClause}
         order by created_at desc
         limit $${dataValues.length - 1} offset $${dataValues.length}`,
        dataValues,
      );

      const items: UnansweredQuestionDTO[] = dataRes.rows.map((r) => ({
        id: r.id,
        question: r.question,
        sessionId: r.session_id,
        conversationId: r.conversation_id,
        reason: r.reason,
        similarityScore: r.similarity_score !== null ? Number(r.similarity_score) : null,
        contextChunks: (r.context_chunks as UnansweredQuestionChunkSnippet[] | null) ?? null,
        createdAt: r.created_at,
      }));

      return { items, total };
    } catch (err: any) {
      if (err?.message?.includes('does not exist') || err?.message?.includes('unanswered_questions')) {
        await ensureDbSchema();
        return { items: [], total: 0 };
      }
      throw err;
    }
  },

  async deleteById(id: string): Promise<boolean> {
    try {
      const { rowCount } = await pool.query('delete from unanswered_questions where id = $1', [id]);
      return (rowCount ?? 0) > 0;
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) return false;
      throw err;
    }
  },

  async deleteAll(): Promise<number> {
    try {
      const { rowCount } = await pool.query('delete from unanswered_questions');
      return rowCount ?? 0;
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) return 0;
      throw err;
    }
  },

  async getStats(): Promise<{ total: number; byReason: Record<string, number>; last7Days: number }> {
    try {
      const [totalRes, reasonRes, recentRes] = await Promise.all([
        pool.query('select count(*)::int as total from unanswered_questions'),
        pool.query('select reason, count(*)::int as count from unanswered_questions group by reason'),
        pool.query(`select count(*)::int as count from unanswered_questions where created_at > now() - interval '7 days'`),
      ]);

      const total = totalRes.rows[0]?.total ?? 0;
      const last7Days = recentRes.rows[0]?.count ?? 0;
      const byReason: Record<string, number> = {};
      for (const row of reasonRes.rows) {
        byReason[row.reason] = row.count;
      }

      return { total, byReason, last7Days };
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        await ensureDbSchema();
        return { total: 0, byReason: {}, last7Days: 0 };
      }
      throw err;
    }
  },
};
