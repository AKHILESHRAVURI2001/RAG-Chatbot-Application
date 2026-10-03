import { useState, type KeyboardEvent } from 'react';
import { FiPlay, FiAlertCircle } from 'react-icons/fi';
import { api } from '../lib/api';
import Card from './ui/Card';

/**
 * Ad-hoc read-only SQL against the real database, for debugging/reporting
 * without shell or DB-client access. Strictly SELECT-only — enforced
 * server-side inside a Postgres READ ONLY transaction (see
 * readOnlyQueryService.ts), not just by this UI, so there's no way to run an
 * INSERT/UPDATE/DELETE/DROP/etc. here even by accident.
 */
export default function QueryToolCard() {
  const [sql, setSql] = useState('select * from documents order by created_at desc limit 20');
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const result = await api.runQuery(sql);
      setRows(result.rows);
      setRowCount(result.rowCount);
      setTruncated(result.truncated);
    } catch (e: any) {
      setError(e.message);
      setRows(null);
    } finally {
      setRunning(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  }

  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <Card icon={<FiPlay />} title="SQL query (read-only)">
      <p className="muted">
        Runs directly against the real database — for debugging or one-off reports without shell access.
        <strong> Only SELECT is allowed</strong>, enforced by the server regardless of what you type here (it runs
        inside a Postgres read-only transaction that's always rolled back, so nothing here can ever modify data).
        Capped at 500 rows and a 5 second timeout.
      </p>
      <textarea
        rows={4}
        className="query-tool-input"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      <button className="btn-primary" onClick={run} disabled={running || !sql.trim()}>
        <FiPlay /> {running ? 'Running…' : 'Run query'} <span className="muted small">(Ctrl/Cmd+Enter)</span>
      </button>

      {error && (
        <div className="alert">
          <FiAlertCircle /> {error}
        </div>
      )}

      {rows && (
        <>
          <p className="muted small">
            {rowCount} row{rowCount === 1 ? '' : 's'}{truncated ? ' (showing first 500)' : ''}
          </p>
          {rows.length === 0 ? (
            <p className="muted">Query ran successfully — no rows returned.</p>
          ) : (
            <div className="query-tool-results">
              <table className="table">
                <thead>
                  <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c} className="query-tool-cell">
                          {row[c] === null ? <span className="muted small">null</span> : String(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
