import { Fragment, useEffect, useMemo, useState } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiEye, FiChevronDown, FiChevronRight, FiShield } from 'react-icons/fi';
import type { PermissionGroup, RoleDTO } from '../../shared';
import { api } from '../../lib/api';
import { useCan } from '../../lib/authContext';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { SearchInput } from '../ui/SearchInput';
import ConfirmDialog from '../ui/ConfirmDialog';
import { toast } from '../ui/Toast';
import { PageSpinner } from '../ui/Spinner';
import RoleEditor from './RoleEditor';
import PermissionSummary from './PermissionSummary';

type EditorState = { role?: RoleDTO; readOnly?: boolean } | null;

/** Lists roles with a summary of what each allows, and opens the create/edit flow. Every control is shown only when the user holds the matching permission (the server re-checks regardless). */
export default function RolesPanel() {
  const can = useCan();
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorState>(null);
  const [toDelete, setToDelete] = useState<RoleDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    const [list, catalog] = await Promise.all([api.listRoles(), api.getPermissionCatalog()]);
    setRoles(list);
    setGroups(catalog.groups);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message ?? 'Failed to load roles.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roles.filter((r) => `${r.name} ${r.description}`.toLowerCase().includes(q)) : roles;
  }, [roles, query]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteRole(toDelete.id);
      toast.success(`Role “${toDelete.name}” deleted.`);
      setToDelete(null);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete the role.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <PageSpinner label="Loading roles…" />;
  if (error) return <div className="alert">{error}</div>;

  return (
    <div>
      <div className="row-gap" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search roles…" style={{ maxWidth: 320 }} />
        <div style={{ flex: 1 }} />
        {can('roles.create') && (
          <Button icon={<FiPlus />} onClick={() => setEditor({})}>Create role</Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FiShield />}
          title={query ? 'No roles match your search' : 'No roles yet'}
          description={query ? 'Try a different name.' : 'Create a role to group permissions for a job function.'}
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell />
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>Access</TableHeaderCell>
              <TableHeaderCell>Accounts</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((r) => {
              const isOpen = expanded.has(r.id);
              const canEdit = can('roles.edit') && !r.isSuper;
              const canDelete = can('roles.delete') && !r.isSystem;
              return (
                <Fragment key={r.id}>
                  <TableRow>
                    <TableCell style={{ width: 32 }}>
                      <button
                        className="btn-icon btn-secondary"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} permissions for ${r.name}`}
                        onClick={() => toggleExpanded(r.id)}
                      >
                        {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                      </button>
                    </TableCell>
                    <TableCell>
                      <strong>{r.name}</strong>{' '}
                      {r.isSuper ? <Badge variant="purple" size="sm">Full access</Badge> : r.isSystem ? <Badge variant="neutral" size="sm">Built-in</Badge> : null}
                      {r.description && <div className="muted small">{r.description}</div>}
                    </TableCell>
                    <TableCell className="muted small">
                      {r.isSuper ? 'Everything' : `${r.permissions.length} permission${r.permissions.length === 1 ? '' : 's'}`}
                    </TableCell>
                    <TableCell className="muted small">{r.userCount}</TableCell>
                    <TableCell>
                      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
                        {canEdit ? (
                          <button className="btn-icon btn-secondary" title="Edit role" aria-label={`Edit ${r.name}`} onClick={() => setEditor({ role: r })}>
                            <FiEdit2 />
                          </button>
                        ) : (
                          <button className="btn-icon btn-secondary" title="View role" aria-label={`View ${r.name}`} onClick={() => setEditor({ role: r, readOnly: true })}>
                            <FiEye />
                          </button>
                        )}
                        {can('roles.delete') && (
                          <button
                            className="btn-icon btn-danger"
                            aria-label={`Delete ${r.name}`}
                            title={r.isSystem ? 'Built-in roles can’t be deleted' : r.userCount > 0 ? `${r.userCount} account(s) use this role — move them first` : 'Delete role'}
                            disabled={!canDelete || r.userCount > 0}
                            onClick={() => setToDelete(r)}
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={4}>
                        {r.isSuper ? <p className="muted small" style={{ margin: 0 }}>Every permission, including any added in the future.</p> : <PermissionSummary groups={groups} permissions={r.permissions} />}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}

      {editor && (
        <RoleEditor
          role={editor.role}
          roles={roles}
          groups={groups}
          readOnly={editor.readOnly}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            refresh().catch((e) => toast.error(e.message ?? 'Failed to refresh roles.'));
          }}
        />
      )}

      {toDelete && (
        <ConfirmDialog title={`Delete role “${toDelete.name}”?`} confirmLabel="Delete role" busy={deleting} onConfirm={confirmDelete} onCancel={() => setToDelete(null)}>
          This permanently removes the role and its permission settings. No accounts use it. This can’t be undone.
        </ConfirmDialog>
      )}
    </div>
  );
}
