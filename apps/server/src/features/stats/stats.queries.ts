import { pool } from '../../db/pool';

export const statsRepo = {
  async stats() {
    const [{ rows: convRows }, { rows: msgRows }, { rows: docRows }, { rows: faqRows }, { rows: cacheRows }, { rows: docStatusRows }] =
      await Promise.all([
        pool.query('select count(*)::int as count from conversations'),
        pool.query('select count(*)::int as count from messages'),
        pool.query('select count(*)::int as count from documents'),
        pool.query('select count(*)::int as count from faqs'),
        pool.query(`select
            count(*) filter (where answer_source in ('faq', 'cache'))::float / greatest(count(*), 1) as hit_rate
          from messages where role = 'assistant'`),
        pool.query('select status, count(*)::int as count from documents group by status'),
      ]);
    const documentsByStatus = { ready: 0, processing: 0, failed: 0 };
    for (const row of docStatusRows) {
      if (row.status in documentsByStatus) documentsByStatus[row.status as keyof typeof documentsByStatus] = row.count;
    }
    return {
      totalConversations: convRows[0].count,
      totalMessages: msgRows[0].count,
      totalDocuments: docRows[0].count,
      totalFaqs: faqRows[0].count,
      cacheHitRate: Number(cacheRows[0]?.hit_rate ?? 0),
      documentsByStatus,
    };
  },

  async getHealthAnalytics() {
    const [{ rows: latencyRows }, { rows: errorRows }, { rows: trendRows }, { rows: slowRows }, { rows: volumeRows }, { rows: sourceRows }] = await Promise.all([
      pool.query(
        `select avg(response_time_ms)::int as avg_ms
         from messages
         where role = 'assistant' and response_time_ms is not null and created_at > now() - interval '24 hours'`,
      ),
      pool.query(
        `select count(*) filter (where content like '[error]%')::float / greatest(count(*), 1) as error_rate
         from messages
         where role = 'assistant' and created_at > now() - interval '24 hours'`,
      ),
      pool.query(
        `select
           to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
           count(*) filter (where answer_source in ('faq', 'cache'))::float / greatest(count(*), 1) as hit_rate
         from messages
         where role = 'assistant' and created_at > now() - interval '7 days'
         group by day
         order by day`,
      ),
      pool.query(
        `select sub.session_id, sub.response_time_ms, sub.created_at, sub.prev_content, sub.prev_role
         from (
           select
             c.session_id,
             m.response_time_ms,
             m.created_at,
             lag(m.content) over (partition by m.conversation_id order by m.created_at) as prev_content,
             lag(m.role) over (partition by m.conversation_id order by m.created_at) as prev_role
           from messages m
           join conversations c on c.id = m.conversation_id
           where m.created_at >= date_trunc('day', now())
         ) sub
         where sub.response_time_ms is not null
         order by sub.response_time_ms desc
         limit 5`,
      ),
      pool.query(
        `with days as (
           select to_char(generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day'), 'YYYY-MM-DD') as day
         ),
         convs as (
           select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as n
           from conversations where created_at > now() - interval '14 days' group by 1
         ),
         msgs as (
           select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as n
           from messages where created_at > now() - interval '14 days' group by 1
         )
         select days.day, coalesce(convs.n, 0) as conversations, coalesce(msgs.n, 0) as messages
         from days left join convs on convs.day = days.day left join msgs on msgs.day = days.day
         order by days.day`,
      ),
      pool.query(
        `select answer_source, count(*)::int as count
         from messages
         where role = 'assistant' and answer_source is not null and created_at > now() - interval '30 days'
         group by answer_source`,
      ),
    ]);

    const answerSources = { faq: 0, cache: 0, llm: 0, noMatch: 0, chunkFallback: 0 };
    for (const row of sourceRows) {
      if (row.answer_source === 'no-match') answerSources.noMatch = row.count;
      else if (row.answer_source === 'chunk-fallback' || row.answer_source === 'chunk') answerSources.chunkFallback = (answerSources.chunkFallback || 0) + row.count;
      else if (row.answer_source in answerSources) answerSources[row.answer_source as 'faq' | 'cache' | 'llm'] = row.count;
    }

    return {
      avgResponseTimeMs: latencyRows[0]?.avg_ms ?? null,
      errorRate24h: Number(errorRows[0]?.error_rate ?? 0),
      cacheHitTrend: trendRows.map((r) => ({ date: r.day, hitRate: Number(r.hit_rate) })),
      slowestToday: slowRows.map((r) => ({
        sessionId: r.session_id,
        question: r.prev_role === 'user' ? r.prev_content : null,
        responseTimeMs: r.response_time_ms,
        createdAt: r.created_at,
      })),
      dailyVolume: volumeRows.map((r) => ({ date: r.day, conversations: r.conversations, messages: r.messages })),
      answerSources,
    };
  },
};
