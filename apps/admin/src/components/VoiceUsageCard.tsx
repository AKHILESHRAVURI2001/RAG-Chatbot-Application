import { useEffect, useState } from 'react';
import { FiBarChart2, FiRefreshCw } from 'react-icons/fi';
import { api } from '../lib/api';
import type { VoiceUsageDTO } from '../shared';
import { PageSpinner } from './ui/Spinner';
import Card from './ui/Card';

/** Format a duration in ms as a friendly "1.2s"/"850ms" — matches the small-number-of-significant-digits convention used for latency elsewhere in the panel (e.g. the Dashboard's slowest-turns list). */
function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

const RANGE_OPTIONS: { label: string; days: number | null }[] = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: 'All time', days: null },
];

/**
 * How much voice conversation is actually getting used — spoken turns, words
 * transcribed/answered, and average end-to-end turn time (transcribe +
 * answer + speak back). Self-contained, same convention as every other card
 * here; reads from the same Postgres `messages` rows Chat Logs shows, just
 * filtered to `channel = 'voice'` (see voiceUsageService.ts).
 */
export default function VoiceUsageCard() {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<VoiceUsageDTO | null>(null);
  const [days, setDays] = useState<number | null>(7);
  const [error, setError] = useState<string | null>(null);

  function refresh(range: number | null = days) {
    setLoading(true);
    setError(null);
    api
      .getVoiceUsage(range)
      .then(setUsage)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh(days);
  }, []);

  function changeRange(range: number | null) {
    setDays(range);
    refresh(range);
  }

  return (
    <Card>
      <div className="row-gap" style={{ justifyContent: 'space-between' }}>
        <h3><FiBarChart2 /> Voice usage</h3>
        <button className="btn-secondary btn-tiny" onClick={() => refresh()}><FiRefreshCw /> Refresh</button>
      </div>
      <p className="muted">How much voice conversation is actually getting used — spoken turns, words transcribed/answered, and average turn time (transcribe + answer + speak back).</p>
      <div className="row-gap" style={{ flexWrap: 'wrap' }}>
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.label}
            className={`btn-secondary${days === r.days ? ' active' : ''}`}
            onClick={() => changeRange(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {error && <div className="alert">{error}</div>}
      {loading ? (
        <PageSpinner label="Loading…" />
      ) : (
        usage && (
          <div className="dash-health-grid">
            <div className="dash-health-metric">
              <span className="dash-health-value">{usage.turnCount.toLocaleString()}</span>
              <span className="muted small">Spoken turns</span>
            </div>
            <div className="dash-health-metric">
              <span className="dash-health-value">{usage.totalTranscriptWords.toLocaleString()}</span>
              <span className="muted small">Words transcribed</span>
            </div>
            <div className="dash-health-metric">
              <span className="dash-health-value">{usage.totalAnswerWords.toLocaleString()}</span>
              <span className="muted small">Words answered</span>
            </div>
            <div className="dash-health-metric">
              <span className="dash-health-value">{usage.avgResponseTimeMs != null ? formatDuration(usage.avgResponseTimeMs) : '—'}</span>
              <span className="muted small">Avg. turn time</span>
            </div>
          </div>
        )
      )}
    </Card>
  );
}
