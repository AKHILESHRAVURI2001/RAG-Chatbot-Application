import { pool } from '../../db/pool';
import type { AnswerSource, LlmRequestLogDTO } from '../../shared';
import { firebaseMirror } from '../reports/firebaseMirror';
import { ensureDbSchema } from '../../db/autoMigrate';

export const conversationsRepo = {
  async findOrCreateBySession(sessionId: string): Promise<{
    id: string;
    blocked: boolean;
    blockedUntil: Date | null;
    blockReason: string | null;
    summary: string | null;
    summaryUntil: Date | null;
  }> {
    let existing;
    try {
      existing = await pool.query(
        'select id, blocked, blocked_until, block_reason, summary, summary_until from conversations where session_id = $1 order by created_at desc limit 1',
        [sessionId],
      );
    } catch (err: any) {
      if (err?.message?.includes('blocked_until') || err?.message?.includes('does not exist')) {
        await ensureDbSchema();
        existing = await pool.query(
          'select id, blocked, blocked_until, block_reason, summary, summary_until from conversations where session_id = $1 order by created_at desc limit 1',
          [sessionId],
        );
      } else {
        throw err;
      }
    }
    const row = existing.rows[0];
    if (row) {
      // If temporary block has elapsed, auto-unblock
      if (row.blocked && row.blocked_until && new Date() >= new Date(row.blocked_until)) {
        await pool.query('update conversations set blocked = false, blocked_until = null, block_reason = null where id = $1', [row.id]);
        firebaseMirror.mirrorConversationBlocked(row.id, false);
        return {
          id: row.id,
          blocked: false,
          blockedUntil: null,
          blockReason: null,
          summary: row.summary ?? null,
          summaryUntil: row.summary_until ?? null,
        };
      }
      return {
        id: row.id,
        blocked: Boolean(row.blocked),
        blockedUntil: row.blocked_until ?? null,
        blockReason: row.block_reason ?? null,
        summary: row.summary ?? null,
        summaryUntil: row.summary_until ?? null,
      };
    }
    const { rows } = await pool.query('insert into conversations (session_id) values ($1) returning id, created_at', [sessionId]);
    firebaseMirror.mirrorConversationCreated(rows[0].id, sessionId, rows[0].created_at);
    return { id: rows[0].id, blocked: false, blockedUntil: null, blockReason: null, summary: null, summaryUntil: null };
  },

  async findBySession(sessionId: string): Promise<string | null> {
    const { rows } = await pool.query('select id from conversations where session_id = $1 order by created_at desc limit 1', [sessionId]);
    return rows[0]?.id ?? null;
  },

  async setSummary(conversationId: string, summary: string, until: Date): Promise<void> {
    await pool.query('update conversations set summary = $2, summary_until = $3 where id = $1', [conversationId, summary, until]);
    firebaseMirror.mirrorConversationSummary(conversationId, summary, until);
  },

  async setBlocked(
    conversationIdOrSessionId: string,
    blocked: boolean,
    durationMinutes?: number | null,
    reason?: string | null,
  ): Promise<{ blocked: boolean; blockedUntil: Date | null; blockReason: string | null }> {
    let blockedUntil: Date | null = null;
    let blockReason: string | null = null;

    if (blocked) {
      if (durationMinutes && durationMinutes > 0) {
        blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
      }
      blockReason = reason || (durationMinutes ? 'temporary_block' : 'admin_manual');
    }

    let res;
    try {
      res = await pool.query(
        'update conversations set blocked = $2, blocked_until = $3, block_reason = $4 where id::text = $1 or session_id = $1 returning id',
        [conversationIdOrSessionId, blocked, blockedUntil, blockReason],
      );
    } catch (err: any) {
      if (err?.message?.includes('blocked_until') || err?.message?.includes('does not exist')) {
        await ensureDbSchema();
        res = await pool.query(
          'update conversations set blocked = $2, blocked_until = $3, block_reason = $4 where id::text = $1 or session_id = $1 returning id',
          [conversationIdOrSessionId, blocked, blockedUntil, blockReason],
        );
      } else {
        throw err;
      }
    }
    const rows = res?.rows || [];

    if (rows.length === 0 && (res?.rowCount ?? 0) === 0 && blocked) {
      const inserted = await pool.query(
        'insert into conversations (session_id, blocked, blocked_until, block_reason) values ($1, $2, $3, $4) returning id',
        [conversationIdOrSessionId, blocked, blockedUntil, blockReason],
      );
      if (inserted?.rows?.[0]) {
        firebaseMirror.mirrorConversationBlocked(inserted.rows[0].id, blocked);
      }
    } else if (rows[0]?.id) {
      firebaseMirror.mirrorConversationBlocked(rows[0].id, blocked);
    }

    return { blocked, blockedUntil, blockReason };
  },

  async countRecentUserMessages(conversationId: string, windowHours: number): Promise<number> {
    const { rows } = await pool.query(
      `select count(*)::int as count from messages
       where conversation_id = $1 and role = 'user' and created_at > now() - ($2 || ' hours')::interval`,
      [conversationId, windowHours],
    );
    return rows[0].count;
  },

  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    answerSource?: AnswerSource,
    llmRequest?: LlmRequestLogDTO,
    responseTimeMs?: number,
    channel: 'text' | 'voice' = 'text',
  ) {
    const { rows } = await pool.query(
      'insert into messages (conversation_id, role, content, answer_source, llm_request, response_time_ms, channel) values ($1, $2, $3, $4, $5, $6, $7) returning id, created_at',
      [conversationId, role, content, answerSource ?? null, llmRequest ? JSON.stringify(llmRequest) : null, responseTimeMs ?? null, channel],
    );
    firebaseMirror.mirrorMessage({
      messageId: rows[0].id,
      conversationId,
      role,
      content,
      answerSource,
      llmRequest,
      responseTimeMs,
      channel,
      createdAt: rows[0].created_at,
    });
  },

  async getRecentMessages(
    conversationId: string,
    limit = 10,
    since?: Date | null,
  ): Promise<{ role: 'user' | 'assistant'; content: string; createdAt: Date }[]> {
    const rawLimit = limit * 2 + 20;
    const { rows } = await pool.query(
      `select role, content, created_at from messages
       where conversation_id = $1
         and ($3::timestamptz is null or created_at > $3)
       order by created_at desc
       limit $2`,
      [conversationId, rawLimit, since ?? null],
    );
    const chronological = rows.reverse();

    const paired: { role: 'user' | 'assistant'; content: string; createdAt: Date }[] = [];
    for (let i = 0; i < chronological.length; i++) {
      const row = chronological[i];
      if (row.role !== 'user') continue;
      const next = chronological[i + 1];
      const answered = next?.role === 'assistant' && !String(next.content).startsWith('[error]');
      if (!answered) continue;
      paired.push({ role: 'user', content: row.content, createdAt: row.created_at });
      paired.push({ role: 'assistant', content: next.content, createdAt: next.created_at });
      i++;
    }

    const pairsToKeep = Math.floor(limit / 2);
    if (pairsToKeep === 0) return [];
    return paired.slice(-(pairsToKeep * 2));
  },

  async listMessages(conversationId: string) {
    const { rows } = await pool.query(
      `select role, content, answer_source, created_at from messages
       where conversation_id = $1 and not (role = 'assistant' and content like '[error]%')
       order by created_at asc`,
      [conversationId],
    );
    return rows.map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content, answerSource: r.answer_source as AnswerSource | null, createdAt: r.created_at }));
  },

  async listMessagesForAdmin(conversationId: string) {
    const { rows } = await pool.query(
      `select id, role, content, answer_source, llm_request, response_time_ms, channel, created_at from messages
       where conversation_id = $1
       order by created_at asc`,
      [conversationId],
    );
    return rows.map((r) => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      answerSource: r.answer_source as AnswerSource | null,
      llmRequest: (r.llm_request as LlmRequestLogDTO | null) ?? null,
      channel: r.channel as 'text' | 'voice',
      responseTimeMs: r.response_time_ms != null ? Number(r.response_time_ms) : null,
      createdAt: r.created_at,
    }));
  },

  async listRecentConversations(limit = 50) {
    let rows;
    try {
      const res = await pool.query(
        `select c.id, c.session_id, c.created_at, c.blocked, c.blocked_until, c.block_reason, count(m.id)::int as message_count, max(m.created_at) as last_message_at
         from conversations c
         left join messages m on m.conversation_id = c.id
         group by c.id
         order by max(m.created_at) desc nulls last
         limit $1`,
        [limit],
      );
      rows = res.rows;
    } catch (err: any) {
      if (err?.message?.includes('blocked_until') || err?.message?.includes('does not exist')) {
        await ensureDbSchema();
        const res = await pool.query(
          `select c.id, c.session_id, c.created_at, c.blocked, c.blocked_until, c.block_reason, count(m.id)::int as message_count, max(m.created_at) as last_message_at
           from conversations c
           left join messages m on m.conversation_id = c.id
           group by c.id
           order by max(m.created_at) desc nulls last
           limit $1`,
          [limit],
        );
        rows = res.rows;
      } else {
        throw err;
      }
    }
    return rows.map((r) => {
      const isExpired = r.blocked && r.blocked_until && new Date() >= new Date(r.blocked_until);
      return {
        id: r.id,
        sessionId: r.session_id,
        createdAt: r.created_at,
        lastMessageAt: r.last_message_at,
        messageCount: r.message_count,
        blocked: Boolean(r.blocked && !isExpired),
        blockedUntil: isExpired ? null : (r.blocked_until ? new Date(r.blocked_until).toISOString() : null),
        blockReason: isExpired ? null : (r.block_reason ?? null),
      };
    });
  },

  async listActive(windowMinutes: number) {
    const { rows } = await pool.query(
      `select c.id, c.session_id, count(m.id)::int as message_count, max(m.created_at) as last_message_at
       from conversations c
       join messages m on m.conversation_id = c.id
       group by c.id
       having max(m.created_at) > now() - make_interval(mins => $1::int)
       order by max(m.created_at) desc`,
      [windowMinutes],
    );
    return rows.map((r) => ({
      conversationId: r.id,
      sessionId: r.session_id,
      lastMessageAt: r.last_message_at,
      messageCount: r.message_count,
    }));
  },

  async getConversation(conversationId: string) {
    const { rows } = await pool.query('select id, session_id, created_at from conversations where id = $1', [conversationId]);
    return rows[0] ? { id: rows[0].id, sessionId: rows[0].session_id, createdAt: rows[0].created_at } : null;
  },

  async getSummaryState(conversationId: string): Promise<{ summary: string | null; summaryUntil: Date | null } | null> {
    const { rows } = await pool.query('select summary, summary_until from conversations where id = $1', [conversationId]);
    return rows[0] ? { summary: rows[0].summary ?? null, summaryUntil: rows[0].summary_until ?? null } : null;
  },

  async deleteConversation(conversationId: string) {
    await pool.query('delete from conversations where id = $1', [conversationId]);
  },

  async deleteAllConversations(): Promise<number> {
    const { rowCount } = await pool.query('delete from conversations');
    return rowCount ?? 0;
  },

  async listConversationsInRange(from: Date, to: Date) {
    const { rows } = await pool.query(
      `select c.id as conversation_id, c.session_id, c.created_at as conversation_created_at,
              m.role, m.content, m.answer_source, m.created_at as message_created_at
       from conversations c
       join messages m on m.conversation_id = c.id
       where c.id in (
         select distinct conversation_id from messages where created_at between $1 and $2
       )
       order by c.created_at asc, m.created_at asc`,
      [from, to],
    );

    const byConversation = new Map<
      string,
      { id: string; sessionId: string; createdAt: Date; messages: { role: string; content: string; answerSource: AnswerSource | null; createdAt: Date }[] }
    >();
    for (const row of rows) {
      let conv = byConversation.get(row.conversation_id);
      if (!conv) {
        conv = { id: row.conversation_id, sessionId: row.session_id, createdAt: row.conversation_created_at, messages: [] };
        byConversation.set(row.conversation_id, conv);
      }
      conv.messages.push({ role: row.role, content: row.content, answerSource: row.answer_source, createdAt: row.message_created_at });
    }
    return Array.from(byConversation.values());
  },

  async getLlmMessagesForUsage(since: Date | null): Promise<{ content: string; llmRequest: LlmRequestLogDTO; createdAt: Date }[]> {
    const { rows } = await pool.query(
      `select content, llm_request, created_at from messages
       where role = 'assistant' and answer_source = 'llm' and llm_request is not null
         and ($1::timestamptz is null or created_at > $1)
       order by created_at asc`,
      [since],
    );
    return rows.map((r) => ({ content: r.content, llmRequest: r.llm_request as LlmRequestLogDTO, createdAt: r.created_at }));
  },

  async getVoiceMessagesForUsage(
    since: Date | null,
  ): Promise<{ role: 'user' | 'assistant'; content: string; responseTimeMs: number | null; createdAt: Date }[]> {
    const { rows } = await pool.query(
      `select role, content, response_time_ms, created_at from messages
       where channel = 'voice' and not (role = 'assistant' and content like '[error]%')
         and ($1::timestamptz is null or created_at > $1)
       order by created_at asc`,
      [since],
    );
    return rows.map((r) => ({ role: r.role, content: r.content, responseTimeMs: r.response_time_ms, createdAt: r.created_at }));
  },
};
