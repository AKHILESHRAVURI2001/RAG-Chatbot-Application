import { useEffect, useState } from 'react';
import { FiList } from 'react-icons/fi';
import type { AuditLogEntryDTO } from '../../shared';
import { api } from '../../lib/api';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Pagination } from '../ui/Pagination';
import { PageSpinner } from '../ui/Spinner';

const PAGE_SIZE = 25;

/** Everything shown here was already stripped of passwords, tokens and keys on the server before it was stored. */
function describe(e: AuditLogEntryDTO): string {
  const m = e.metadata ?? {};
  const parts: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    parts.push(`${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(' · ');
}

/** Read-only record of who did what, newest first. */
export default function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditLogEntryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [resource, setResource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listAuditLog({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, resource: resource || undefined })
      .then((r) => {
        if (cancelled) return;
        setEntries(r.entries);
        setTotal(r.total);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e.message ?? 'Failed to load the audit log.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, resource]);

  return (
    <div>
      <div className="row-gap" style={{ marginBottom: 12 }}>
        <label htmlFor="audit-resource" style={{ margin: 0 }}>Area</label>
        <select
          id="audit-resource"
          value={resource}
          onChange={(e) => {
            setResource(e.target.value);
            setPage(1);
          }}
          style={{ width: 'auto' }}
        >
          <option value="">Everything</option>
          {['auth', 'users', 'roles', 'settings', 'documents', 'faqs', 'chunks', 'words', 'conversations', 'visitors', 'unanswered', 'query'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert">{error}</div>}
      {loading ? (
        <PageSpinner label="Loading audit log…" />
      ) : entries.length === 0 ? (
        <EmptyState icon={<FiList />} title="Nothing recorded yet" description="Sign-ins and administrative changes will appear here." />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>When</TableHeaderCell>
                <TableHeaderCell>Who</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
                <TableHeaderCell>Details</TableHeaderCell>
                <TableHeaderCell>Result</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="small">{e.actorEmail ?? <span className="muted">unknown</span>}</TableCell>
                  <TableCell className="small"><code>{e.action}</code></TableCell>
                  <TableCell className="muted small">{describe(e) || (e.resourceId ? `id: ${e.resourceId}` : '')}</TableCell>
                  <TableCell>
                    <Badge variant={e.result === 'success' ? 'success' : 'danger'} size="sm" title={e.statusCode ? `HTTP ${e.statusCode}` : undefined}>
                      {e.result === 'success' ? 'Success' : 'Denied / failed'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} totalItems={total} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
