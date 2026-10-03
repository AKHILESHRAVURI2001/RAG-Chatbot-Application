import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiMessageSquare,
  FiMail,
  FiFileText,
  FiHelpCircle,
  FiZap,
  FiTrendingUp,
  FiCpu,
  FiCheckCircle,
  FiLoader,
  FiAlertCircle,
  FiRadio,
  FiActivity,
  FiDollarSign,
} from 'react-icons/fi';
import type { StatsDTO, LlmSettings, LiveSessionDTO, WordUsageDTO } from '../shared';
import { api } from '../lib/api';
import { usePolling } from '../hooks/usePolling';
import { InlineSpinner, TopBarLoader } from '../components/ui/Spinner';
import Card from '../components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import PageHeader from '../components/ui/PageHeader';

const LIVE_POLL_MS = 15_000;
const LIVE_WINDOW_MINUTES = 15;

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

/** Preset windows for the word-usage filter — "all" sends no `days` param. */
const USAGE_WINDOWS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All time', days: null },
] as const;

export default function Dashboard() {
  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [providers, setProviders] = useState<{ name: string; configured: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSessionDTO[]>([]);
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [usageDays, setUsageDays] = useState<number | null>(30);
  const [usage, setUsage] = useState<WordUsageDTO | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);
    api
      .getWordUsage(usageDays)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch((e) => {
        if (!cancelled) setUsageError(e.message);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [usageDays]);

  useEffect(() => {
    Promise.all([api.getStats(), api.getSettings()])
      .then(([s, settings]) => {
        setStats(s);
        setLlm(settings.llm);
        setProviders(settings.providers);
      })
      .catch((e) => setError(e.message));
  }, []);

  usePolling(
    () => {
      setRefreshingLive(true);
      api
        .listActiveSessions(LIVE_WINDOW_MINUTES)
        .then(setLiveSessions)
        .catch(() => {})
        .finally(() => setRefreshingLive(false));
    },
    LIVE_POLL_MS,
    { immediate: true },
  );

  if (error) return <div className="alert">{error}</div>;

  if (!stats) {
    return (
      <div>
        <h2>Dashboard</h2>
        <div className="stat-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="stat-card skeleton" />
          ))}
        </div>
      </div>
    );
  }

  const activeProviderConfigured = providers.find((p) => p.name === llm?.provider)?.configured ?? false;
  const configuredCount = providers.filter((p) => p.configured).length;
  const { ready, processing, failed } = stats.documentsByStatus;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A snapshot of how your chatbot is doing right now."
      />

      <div className="stat-grid">
        <div className="stat-card stat-card-accent-indigo">
          <FiMessageSquare className="stat-icon" /><span className="stat-value">{stats.totalConversations}</span><span>Conversations</span>
        </div>
        <div className="stat-card stat-card-accent-blue">
          <FiMail className="stat-icon" /><span className="stat-value">{stats.totalMessages}</span><span>Messages</span>
        </div>
        <div className="stat-card stat-card-accent-green">
          <FiFileText className="stat-icon" /><span className="stat-value">{stats.totalDocuments}</span><span>Documents</span>
          {stats.totalDocuments > 0 && (
            <span className="muted small">
              {ready} ready{processing > 0 ? ` · ${processing} processing` : ''}{failed > 0 ? ` · ${failed} failed` : ''}
            </span>
          )}
        </div>
        <div className="stat-card stat-card-accent-amber">
          <FiHelpCircle className="stat-icon" /><span className="stat-value">{stats.totalFaqs}</span><span>FAQs</span>
        </div>
        <div className="stat-card stat-card-accent-purple">
          <FiZap className="stat-icon" /><span className="stat-value">{(stats.cacheHitRate * 100).toFixed(0)}%</span>
          <span>Answers served from cache/FAQ</span>
        </div>
      </div>

      <Card icon={<FiActivity />} title="Response & errors">
        <p className="muted">How the bot is actually performing — response speed and error rate over the last 24 hours.</p>
        <div className="dash-health-grid">
          <div className="dash-health-metric">
            <span className="dash-health-value">{stats.health.avgResponseTimeMs !== null ? formatMs(stats.health.avgResponseTimeMs) : '—'}</span>
            <span className="muted small">Avg response time (24h)</span>
          </div>
          <div className="dash-health-metric">
            <span className={`dash-health-value ${stats.health.errorRate24h > 0.05 ? 'warn' : ''}`}>
              {(stats.health.errorRate24h * 100).toFixed(1)}%
            </span>
            <span className="muted small">LLM error rate (24h)</span>
          </div>
        </div>
      </Card>

      {(stats.health.cacheHitTrend.length > 0 || stats.health.dailyVolume.some((d) => d.messages > 0)) && (
        <Card icon={<FiActivity />} title="Usage trends">
          {stats.health.cacheHitTrend.length > 0 && (
            <>
              <label className="muted small">Cache hit rate, last {stats.health.cacheHitTrend.length} days</label>
              <div className="dash-trend-chart">
                {stats.health.cacheHitTrend.map((d) => (
                  <div key={d.date} className="dash-trend-bar-col" title={`${formatDayLabel(d.date)}: ${(d.hitRate * 100).toFixed(0)}%`}>
                    <div className="dash-trend-bar" style={{ height: `${Math.max(d.hitRate * 100, 3)}%` }} />
                    <span className="muted small">{formatDayLabel(d.date)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {stats.health.dailyVolume.some((d) => d.messages > 0) && (
            <>
              <label className="muted small" style={{ marginTop: 8 }}>Usage, last 14 days</label>
              <div className="dash-trend-chart dash-volume-chart">
                {stats.health.dailyVolume.map((d) => {
                  const peak = Math.max(...stats.health.dailyVolume.map((x) => x.messages), 1);
                  return (
                    <div
                      key={d.date}
                      className="dash-trend-bar-col"
                      title={`${d.date}: ${d.messages} message${d.messages === 1 ? '' : 's'}, ${d.conversations} conversation${d.conversations === 1 ? '' : 's'}`}
                    >
                      <div className="dash-trend-bar" style={{ height: `${Math.max((d.messages / peak) * 100, 2)}%` }} />
                      <span className="muted small">{d.date.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      {(() => {
        const s = stats.health.answerSources;
        const chunkFallbackCount = s.chunkFallback ?? 0;
        const total = s.faq + s.cache + s.llm + s.noMatch + chunkFallbackCount;
        if (total === 0) return null;
        const segments = [
          { key: 'faq', label: 'FAQ', value: s.faq, color: '#2563eb' },
          { key: 'cache', label: 'Cached', value: s.cache, color: '#a855f7' },
          { key: 'llm', label: 'AI (paid)', value: s.llm, color: '#16a34a' },
          { key: 'chunkFallback', label: 'Chunk Fallback', value: chunkFallbackCount, color: '#d97706' },
          { key: 'noMatch', label: 'No match', value: s.noMatch, color: '#9ca3af' },
        ].filter((seg) => seg.value > 0);
        const free = total - s.llm;
        return (
          <Card title="Answer sources">
            <label className="muted small">
              How answers were produced, last 30 days — {Math.round((free / total) * 100)}% answered without an AI call
            </label>
            <div className="dash-source-bar">
              {segments.map((seg) => (
                <div
                  key={seg.key}
                  className="dash-source-segment"
                  style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }}
                  title={`${seg.label}: ${seg.value} (${Math.round((seg.value / total) * 100)}%)`}
                />
              ))}
            </div>
            <div className="dash-source-legend">
              {segments.map((seg) => (
                <span key={seg.key} className="dash-source-legend-item">
                  <span className="dash-source-dot" style={{ background: seg.color }} />
                  {seg.label} {seg.value}
                </span>
              ))}
            </div>
          </Card>
        );
      })()}

      {stats.health.slowestToday.length > 0 && (
        <Card title="Slowest today">
          <Table>
            <TableHead><TableRow><TableHeaderCell>Question</TableHeaderCell><TableHeaderCell>Time</TableHeaderCell><TableHeaderCell>When</TableHeaderCell></TableRow></TableHead>
            <TableBody>
              {stats.health.slowestToday.map((s, i) => (
                <TableRow key={i}>
                  <TableCell>{s.question ?? <span className="muted small">(no question logged)</span>}</TableCell>
                  <TableCell><span className="badge">{formatMs(s.responseTimeMs)}</span></TableCell>
                  <TableCell className="muted small">{timeAgo(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card icon={<FiDollarSign />} title="AI word usage">
        <p className="muted">
          Total words sent to, and received from, the AI — a model-agnostic stand-in for tokens (roughly 0.75 tokens
          per word), so you can estimate real spend without per-provider token math. Only counts turns that actually
          called the AI — FAQ/cache/no-match answers cost nothing.
        </p>
        <div className="row-gap" style={{ marginBottom: 4 }}>
          {USAGE_WINDOWS.map((w) => (
            <button
              key={w.label}
              className={`btn-secondary btn-tiny ${usageDays === w.days ? 'active' : ''}`}
              onClick={() => setUsageDays(w.days)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <TopBarLoader active={usageLoading} />
        {usageError && <div className="alert">{usageError}</div>}
        {usage && !usageLoading && (
          <>
            <div className="dash-health-grid">
              <div className="dash-health-metric">
                <span className="dash-health-value">{usage.totalPromptWords.toLocaleString()}</span>
                <span className="muted small">Words sent to AI</span>
              </div>
              <div className="dash-health-metric">
                <span className="dash-health-value">{usage.totalAnswerWords.toLocaleString()}</span>
                <span className="muted small">Words received from AI</span>
              </div>
            </div>
            {usage.daily.length > 0 ? (
              <>
                <label className="muted small" style={{ marginTop: 8 }}>Sent vs. received, by day</label>
                <div className="dash-trend-chart dash-volume-chart">
                  {usage.daily.map((d) => {
                    const peak = Math.max(...usage.daily.map((x) => x.promptWords + x.answerWords), 1);
                    return (
                      <div
                        key={d.date}
                        className="dash-trend-bar-col"
                        title={`${d.date}: ${d.promptWords.toLocaleString()} sent, ${d.answerWords.toLocaleString()} received`}
                      >
                        <div className="dash-usage-bar-stack" style={{ height: `${Math.max(((d.promptWords + d.answerWords) / peak) * 100, 2)}%` }}>
                          <div className="dash-usage-bar-sent" style={{ height: `${(d.promptWords / (d.promptWords + d.answerWords || 1)) * 100}%` }} />
                        </div>
                        <span className="muted small">{d.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="dash-source-legend">
                  <span className="dash-source-legend-item"><span className="dash-source-dot" style={{ background: '#4f46e5' }} /> Sent to AI</span>
                  <span className="dash-source-legend-item"><span className="dash-source-dot" style={{ background: '#c7d2fe' }} /> Received from AI</span>
                </div>
                {usage.byProvider && usage.byProvider.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <label className="muted small" style={{ display: 'block', marginBottom: 6 }}>Usage by Provider / Model</label>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Provider / Source</TableHeaderCell>
                          <TableHeaderCell>Requests</TableHeaderCell>
                          <TableHeaderCell>Prompt Words</TableHeaderCell>
                          <TableHeaderCell>Response Words</TableHeaderCell>
                          <TableHeaderCell>Total Words</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {usage.byProvider.map((p) => (
                          <TableRow key={p.provider}>
                            <TableCell>
                              <span className="badge" style={{ textTransform: 'capitalize' }}>
                                {p.provider}
                              </span>
                            </TableCell>
                            <TableCell>{p.requestCount.toLocaleString()}</TableCell>
                            <TableCell>{p.promptWords.toLocaleString()}</TableCell>
                            <TableCell>{p.answerWords.toLocaleString()}</TableCell>
                            <TableCell>
                              <strong>{p.totalWords.toLocaleString()}</strong>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">No AI-answered messages in this window yet.</p>
            )}
          </>
        )}
      </Card>

      <Card icon={<FiCpu />} title="AI status">
        <div className="dash-status-line">
          {activeProviderConfigured ? (
            <FiCheckCircle className="dash-status-icon ok" />
          ) : (
            <FiAlertCircle className="dash-status-icon warn" />
          )}
          <span>
            Active provider: <strong>{llm?.provider}</strong>{' '}
            {activeProviderConfigured ? '(configured & ready)' : '(no API key set — chat will fail until fixed)'}
          </span>
        </div>
        <div className="dash-status-line">
          <FiCheckCircle className="dash-status-icon ok" />
          <span>{configuredCount} of {providers.length} providers configured</span>
        </div>
        {failed > 0 && (
          <div className="dash-status-line">
            <FiAlertCircle className="dash-status-icon warn" />
            <span>{failed} document{failed === 1 ? '' : 's'} failed to index — check <Link to="/documents">Content</Link>.</span>
          </div>
        )}
        {processing > 0 && (
          <div className="dash-status-line">
            <FiLoader className="dash-status-icon spin" />
            <span>{processing} document{processing === 1 ? '' : 's'} still processing.</span>
          </div>
        )}
        {!llm && <InlineSpinner label="Loading…" />}
      </Card>

      <Card icon={<FiRadio className={liveSessions.length > 0 ? 'pulse' : ''} />} title="Live now">
        <p className="muted">Sessions with a message in the last {LIVE_WINDOW_MINUTES} minutes — refreshes automatically.</p>
        <TopBarLoader active={refreshingLive} />
        {liveSessions.length === 0 ? (
          <p className="muted">No one's actively chatting right now.</p>
        ) : (
          <Table>
            <TableHead><TableRow><TableHeaderCell>Session</TableHeaderCell><TableHeaderCell>Messages</TableHeaderCell><TableHeaderCell>Last activity</TableHeaderCell><TableHeaderCell></TableHeaderCell></TableRow></TableHead>
            <TableBody>
              {liveSessions.map((s) => (
                <TableRow key={s.conversationId}>
                  <TableCell className="mono small">{s.sessionId}</TableCell>
                  <TableCell>{s.messageCount}</TableCell>
                  <TableCell className="muted small">{timeAgo(s.lastMessageAt)}</TableCell>
                  <TableCell>
                    <Link className="btn-secondary btn-tiny" to="/chat-logs">View</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card icon={<FiTrendingUp />} title="Most asked questions">
        {stats.topQuestions.length === 0 ? (
          <p className="muted">No cached questions yet — once visitors start chatting, frequently repeated questions will show up here.</p>
        ) : (
          <Table>
            <TableHead><TableRow><TableHeaderCell style={{ width: 40 }}>#</TableHeaderCell><TableHeaderCell>Question</TableHeaderCell><TableHeaderCell>Times asked</TableHeaderCell></TableRow></TableHead>
            <TableBody>
              {stats.topQuestions.map((q, i) => (
                <TableRow key={q.question}>
                  <TableCell className="muted">{i + 1}</TableCell>
                  <TableCell>{q.question}</TableCell>
                  <TableCell><span className="badge">{q.hitCount}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
