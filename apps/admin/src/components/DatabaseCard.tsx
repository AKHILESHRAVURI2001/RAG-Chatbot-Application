import { useEffect, useState } from 'react';
import { Can } from '../lib/authContext';
import { FiDatabase, FiCheckCircle, FiXCircle, FiRefreshCw } from 'react-icons/fi';
import { api } from '../lib/api';
import Card from './ui/Card';
import { InlineSpinner } from './ui/Spinner';
import { toast } from './ui/Toast';

interface DbStatus {
  ok: boolean;
  settingsKeys: { key: string; present: boolean }[];
  visitorUsersTable: boolean;
  conversationsColumns: string[];
  migrationFiles: string[];
  databaseSize: { bytes: number; pretty: string };
  tableSizes: { name: string; bytes: number; pretty: string }[];
}

interface DbMigrateResult {
  ok: boolean;
  results: { file: string; ok: boolean; error?: string }[];
}

export default function DatabaseCard() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [lastRun, setLastRun] = useState<DbMigrateResult | null>(null);

  function refresh() {
    return api
      .getDbStatus()
      .then(setStatus)
      .catch((e) => toast.error(e.message ?? 'Failed to load database status.'));
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function runMigrate() {
    setMigrating(true);
    setLastRun(null);
    try {
      const result = await api.runDbMigrate();
      setLastRun(result);
      if (result.ok) {
        toast.success('Database is up to date — all migrations applied successfully.');
      } else {
        toast.error('Some migrations failed — see details below.');
      }
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to run migrations.');
    } finally {
      setMigrating(false);
    }
  }

  if (loading) return <PageSpinnerFallback />;

  return (
    <Card icon={<FiDatabase />} title="Database">
      <p className="muted">
        Checks that the database schema matches what this version of the app expects (settings rows, tables, columns), and lets you
        safely re-apply any missing pieces — useful after deploying an update on a host like Render where you cannot run a shell command
        directly. Re-running is always safe: every migration only creates what's missing and never touches existing data.
      </p>

      {status && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            padding: '14px 16px',
            borderRadius: 10,
            marginTop: 12,
            marginBottom: 12,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <div>
            <div className="muted small">Total database size</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{status.databaseSize.pretty}</div>
          </div>
          {status.tableSizes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {status.tableSizes.map((t) => (
                <div key={t.name} style={{ fontSize: 12.5 }}>
                  <code>{t.name}</code>{' '}
                  <span className="muted small">{t.pretty}</span>
                </div>
              ))}
              {(() => {
                const otherBytes = status.databaseSize.bytes - status.tableSizes.reduce((sum, t) => sum + t.bytes, 0);
                return otherBytes > 0 ? (
                  <div style={{ fontSize: 12.5 }}>
                    <code>other</code>{' '}
                    <span className="muted small">{formatBytes(otherBytes)}</span>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>
      )}
      <p className="muted small" style={{ marginTop: -6, marginBottom: 16 }}>
        Only tables in the <code>public</code> schema are itemized above — "other" covers system catalogs and any tables in other schemas (e.g. an <code>auth</code> schema from your hosting provider).
      </p>

      {status && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            background: status.ok ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${status.ok ? '#bbf7d0' : '#fde68a'}`,
            color: status.ok ? '#166534' : '#92400e',
            fontWeight: 600,
          }}
        >
          {status.ok ? <FiCheckCircle /> : <FiXCircle />}
          {status.ok ? 'Database schema is up to date.' : 'Database schema is missing some expected pieces — run migrations below.'}
        </div>
      )}

      {status && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 16 }}>
          {status.settingsKeys.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              {s.present ? <FiCheckCircle color="#16a34a" /> : <FiXCircle color="#dc2626" />}
              <code>{s.key}</code>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {status.visitorUsersTable ? <FiCheckCircle color="#16a34a" /> : <FiXCircle color="#dc2626" />}
            <code>visitor_users table</code>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {status.conversationsColumns.length === 2 ? <FiCheckCircle color="#16a34a" /> : <FiXCircle color="#dc2626" />}
            <code>conversations.blocked_until / block_reason</code>
          </div>
        </div>
      )}

      <Can permission="settings.edit">
        <button className="btn-primary" onClick={runMigrate} disabled={migrating}>
          {migrating ? <InlineSpinner label="Running…" /> : <><FiRefreshCw /> Run Migrations</>}
        </button>
      </Can>

      {lastRun && (
        <div style={{ marginTop: 16 }}>
          <p className="muted small" style={{ marginBottom: 6 }}>Last run — {lastRun.results.length} migration file(s) applied:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lastRun.results.map((r) => (
              <div key={r.file} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                {r.ok ? <FiCheckCircle color="#16a34a" /> : <FiXCircle color="#dc2626" />}
                <code>{r.file}</code>
                {r.error && <span style={{ color: '#dc2626' }}>— {r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = -1;
  do {
    value /= 1024;
    i++;
  } while (value >= 1024 && i < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

function PageSpinnerFallback() {
  return (
    <Card icon={<FiDatabase />} title="Database">
      <InlineSpinner label="Loading database status…" />
    </Card>
  );
}
