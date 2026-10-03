import { useEffect, useRef, useState } from 'react';
import { FiCloud, FiChevronDown, FiChevronRight, FiFilter, FiRefreshCw } from 'react-icons/fi';
import { formatChatMarkdown } from '../shared';
import { api } from '../lib/api';
import { usePolling } from '../hooks/usePolling';
import { formatDate } from '../lib/format';
import { InlineSpinner, PageSpinner } from './ui/Spinner';
import ErrorWithLink from './ErrorWithLink';
import Card from './ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell } from './ui/Table';
import AnswerSourceBadge from './ui/AnswerSourceBadge';

type FirestoreMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  answerSource: string | null;
  responseTimeMs: number | null;
  createdAt: string | null;
  contextCompacted: boolean;
};

function ConversationRow({
  conversation,
}: {
  conversation: { id: string; sessionId: string; createdAt: string | null; updatedAt: string | null; blocked: boolean; hasSummary: boolean };
}) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<FirestoreMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (messages) return;
    try {
      const res = await api.getFirestoreConversationMessages(conversation.id);
      setMessages(res.messages ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      <tr className="chat-log-row" onClick={toggle}>
        <td>
          {expanded ? <FiChevronDown /> : <FiChevronRight />} {conversation.sessionId || conversation.id}
          {conversation.blocked && <span className="badge chat-log-blocked-badge">Locked</span>}
          {conversation.hasSummary && <span className="chat-log-folded-badge">memory compacted</span>}
        </td>
        <td>{formatDate(conversation.createdAt)}</td>
        <td>{formatDate(conversation.updatedAt)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={3}>
            {error && <div className="alert">{error}</div>}
            {!messages && !error && <InlineSpinner label="Loading messages…" />}
            {messages && messages.length === 0 && <p className="muted small">No messages mirrored for this conversation.</p>}
            {messages && messages.length > 0 && (
              <div className="chat-log-transcript">
                {messages.map((m) => (
                  <div key={m.id} className="chat-log-turn">
                    <div className="chat-log-field">
                      <span className="chat-log-field-label">
                        {m.role === 'user' ? 'Visitor' : 'Assistant'}
                        <AnswerSourceBadge source={m.answerSource} />
                        {m.contextCompacted && <span className="chat-log-context-compacted">context compacted</span>}
                      </span>
                      <div className="chat-log-field-body" dangerouslySetInnerHTML={{ __html: formatChatMarkdown(m.content) }} />
                    </div>
                    <span className="muted small">{formatDate(m.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

type Conversation = { id: string; sessionId: string; createdAt: string | null; updatedAt: string | null; blocked: boolean; hasSummary: boolean };
type Stats = { conversationCount: number; messageCount: number | null; messageCountError?: string };
type Breakdown = { faq: number; cache: number; llm: number; noMatch: number } | { error: string };

/**
 * Everything read from the Firestore mirror — date filter, aggregate
 * stats, answer-source breakdown, and the conversation browser — fully
 * self-contained (fetches its own data, polls itself), same convention as
 * FirebaseCredentialCard next to it. `configured` (whether a working
 * credential is resolved) is checked here independently, not passed down,
 * so this card works correctly dropped in anywhere on its own.
 */
interface FirebaseReportsCardProps {
  /** Which single section to render — the reports category's own sub-tabs (Firebase.tsx) each show just one. Fetching/polling stays the same regardless of which is shown. */
  section: 'filter' | 'mirrored' | 'cache' | 'conversations';
}

export default function FirebaseReportsCard({ section }: FirebaseReportsCardProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cacheStats, setCacheStats] = useState<{ cachedQueriesCount: number } | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});
  const rangeRef = useRef(range);
  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  async function load(activeRange: { from?: Date; to?: Date } = range) {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, listRes, breakdownRes, cacheRes] = await Promise.all([
        api.getFirebaseStats(activeRange.from, activeRange.to),
        api.listFirestoreConversations(25, undefined, activeRange.from, activeRange.to),
        api.getFirebaseAnswerSourceBreakdown(),
        api.getFirebaseCacheStats().catch(() => ({ configured: false, cacheStats: null })),
      ]);
      setConfigured(statsRes.configured);
      setStats(statsRes.stats);
      setConversations(listRes.page?.conversations ?? []);
      setCursor(listRes.page?.nextCursor ?? null);
      setBreakdown(breakdownRes.breakdown);
      setCacheStats(cacheRes.cacheStats);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  /** "to" is a date-only input, so its stored value is midnight of that day — push it to the end of the day so the range actually includes everything said on that date, same convention as Chat Logs' export. */
  function applyFilter() {
    const next = { from: fromInput ? new Date(`${fromInput}T00:00:00`) : undefined, to: toInput ? new Date(`${toInput}T23:59:59.999`) : undefined };
    setRange(next);
    load(next);
  }

  function clearFilter() {
    setFromInput('');
    setToInput('');
    setRange({});
    load({});
  }

  /**
   * Background poll — refreshes stats and the newest page of conversations
   * without the full-page spinner `load()` shows, and without disturbing
   * anything the admin has already loaded further down via "Load more": new
   * conversations (not already in the list) are prepended, existing ones are
   * left exactly where they are.
   */
  async function silentRefresh() {
    try {
      const { from, to } = rangeRef.current;
      const [statsRes, listRes] = await Promise.all([api.getFirebaseStats(from, to), api.listFirestoreConversations(25, undefined, from, to)]);
      setConfigured(statsRes.configured);
      setStats(statsRes.stats);
      const freshPage = listRes.page?.conversations ?? [];
      setConversations((prev) => {
        const knownIds = new Set(prev.map((c) => c.id));
        const brandNew = freshPage.filter((c) => !knownIds.has(c.id));
        // Also refresh the already-known ones with the fresh copy (updatedAt/hasSummary may have changed).
        const freshById = new Map(freshPage.map((c) => [c.id, c]));
        const merged = prev.map((c) => freshById.get(c.id) ?? c);
        return [...brandNew, ...merged];
      });
    } catch {
      // Silent — a background poll failing shouldn't interrupt whatever the admin is looking at.
    }
  }

  useEffect(() => {
    load();
  }, []);
  usePolling(silentRefresh, 10_000);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await api.listFirestoreConversations(25, cursor, range.from, range.to);
      setConversations((prev) => [...prev, ...(res.page?.conversations ?? [])]);
      setCursor(res.page?.nextCursor ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <PageSpinner label="Loading…" />;

  return (
    <>
      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={() => load()}><FiRefreshCw /> Refresh</button>
      </div>

      {error && <div className="alert">{error}</div>}

      {configured === false && (
        <Card>
          <p className="muted">Set up a Firebase credential (left) to see reports here.</p>
        </Card>
      )}

      {configured && (
        <>
          {section === 'filter' && (
          <Card icon={<FiFilter />} title="Filter by date range">
            <p className="muted">Scopes the counts and conversation list below to activity in this range — leave both blank for all-time.</p>
            <div className="row-gap" style={{ flexWrap: 'wrap' }}>
              <label style={{ marginTop: 0 }}>
                From
                <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} max={toInput || undefined} />
              </label>
              <label style={{ marginTop: 0 }}>
                To
                <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} min={fromInput || undefined} />
              </label>
              <button className="btn-primary" onClick={applyFilter} style={{ alignSelf: 'flex-end' }}>
                Apply
              </button>
              {(range.from || range.to) && (
                <button className="btn-secondary" onClick={clearFilter} style={{ alignSelf: 'flex-end' }}>
                  Clear
                </button>
              )}
            </div>
          </Card>
          )}

          {section === 'mirrored' && (
          <Card icon={<FiCloud />} title={`Mirrored ${range.from || range.to ? 'in range' : 'so far'}`}>
            <div className="dash-health-grid">
              <div className="dash-health-metric">
                <span className="dash-health-value">{stats?.conversationCount.toLocaleString() ?? '—'}</span>
                <span className="muted small">Conversations</span>
              </div>
              <div className="dash-health-metric">
                <span className="dash-health-value">{stats?.messageCount?.toLocaleString() ?? '—'}</span>
                <span className="muted small">Messages</span>
              </div>
            </div>
            {stats?.messageCountError && (
              <p className="muted small">
                Message count needs a one-time Firestore index for this date range — <ErrorWithLink text={stats.messageCountError} />
              </p>
            )}
            <label className="muted small" style={{ marginTop: 8 }}>Answers by source (all-time)</label>
            {breakdown && 'error' in breakdown ? (
              <p className="muted small">
                Couldn't load this — <ErrorWithLink text={breakdown.error} />
              </p>
            ) : (
              <div className="dash-health-grid">
                <div className="dash-health-metric">
                  <span className="dash-health-value">{breakdown?.faq.toLocaleString() ?? '—'}</span>
                  <span className="muted small">FAQ match</span>
                </div>
                <div className="dash-health-metric">
                  <span className="dash-health-value">{breakdown?.cache.toLocaleString() ?? '—'}</span>
                  <span className="muted small">Cached</span>
                </div>
                <div className="dash-health-metric">
                  <span className="dash-health-value">{breakdown?.llm.toLocaleString() ?? '—'}</span>
                  <span className="muted small">AI (live)</span>
                </div>
                <div className="dash-health-metric">
                  <span className="dash-health-value">{breakdown?.noMatch.toLocaleString() ?? '—'}</span>
                  <span className="muted small">No match</span>
                </div>
              </div>
            )}
          </Card>
          )}

          {section === 'cache' && (
          <Card icon={<FiCloud />} title="Firestore Semantic Cache Mirror">
            <p className="muted">
              Computed answer embeddings and semantic responses are mirrored to Firestore collection <code>semantic_cache/&#123;hash&#125;</code> for distributed multi-instance caching and long-term fast retrieval.
            </p>
            <div className="dash-health-grid" style={{ marginTop: 12 }}>
              <div className="dash-health-metric">
                <span className="dash-health-value">{cacheStats?.cachedQueriesCount.toLocaleString() ?? '—'}</span>
                <span className="muted small">Mirrored Cache Records</span>
              </div>
              <div className="dash-health-metric">
                <span className="dash-health-value">{breakdown && !('error' in breakdown) ? breakdown.cache.toLocaleString() : '0'}</span>
                <span className="muted small">All-Time Cache Hits</span>
              </div>
            </div>
            <div style={{ marginTop: 16, padding: '12px', background: 'var(--bg-card, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, color: 'var(--primary, #3b82f6)', marginBottom: '4px' }}>
                ⚡ Distributed Cache Acceleration Active
              </div>
              <div style={{ color: 'var(--text-muted, #64748b)' }}>
                When identical or highly similar questions are asked, answers are returned instantly from the cache without calling the AI provider, saving token usage and keeping response latency below 50ms.
              </div>
            </div>
          </Card>
          )}

          {section === 'conversations' && (
          <Card title={`Conversations ${range.from || range.to ? '(filtered)' : ''}`}>
            {conversations.length === 0 ? (
              <p className="muted">Nothing mirrored yet — send a message through the chatbot to see it show up here.</p>
            ) : (
              <>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Session</TableHeaderCell>
                      <TableHeaderCell>First mirrored</TableHeaderCell>
                      <TableHeaderCell>Last activity</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {conversations.map((c) => (
                      <ConversationRow key={c.id} conversation={c} />
                    ))}
                  </TableBody>
                </Table>
                {cursor && (
                  <button className="btn-secondary" onClick={loadMore} disabled={loadingMore} style={{ marginTop: 12 }}>
                    {loadingMore ? <InlineSpinner label="Loading…" /> : 'Load more'}
                  </button>
                )}
              </>
            )}
          </Card>
          )}
        </>
      )}
    </>
  );
}
