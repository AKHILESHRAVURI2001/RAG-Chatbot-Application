import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { FiUsers, FiPlus, FiTrash2, FiKey } from 'react-icons/fi';
import type { AdminUserDTO, RoleDTO } from '../shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/authContext';
import Card from './ui/Card';
import ConfirmDialog from './ui/ConfirmDialog';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from './ui/Table';
import { InlineSpinner } from './ui/Spinner';
import { toast } from './ui/Toast';

/**
 * Admin account management — add/remove admin logins, reset passwords, and change roles.
 * What each control does is decided by the signed-in user's permissions (users.create / edit /
 * delete), and which roles they may hand out by what they hold themselves. All of that — plus the
 * guardrails (never delete or demote the last full-access admin, never change or delete your own
 * account) — is enforced on the server; this screen only disables the obvious cases so you don't
 * hit those errors needlessly.
 */
export default function AdminUsersCard() {
  const { me, can } = useAuth();
  const [users, setUsers] = useState<AdminUserDTO[]>([]);
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [toDelete, setToDelete] = useState<AdminUserDTO | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  const canManageRoles = can('users.create') || can('users.edit');

  /** A role can be handed out only if you already hold everything in it; the full-access role only by someone who has it. */
  const assignable = useMemo(() => {
    const mine = new Set<string>(me.permissions);
    return new Set(roles.filter((r) => (r.isSuper ? me.role.isSuper : r.permissions.every((p) => mine.has(p)))).map((r) => r.id));
  }, [roles, me]);

  async function refresh() {
    const [list, roleList] = await Promise.all([api.listAdminUsers(), canManageRoles ? api.listRoles() : Promise.resolve<RoleDTO[]>([])]);
    setUsers(list);
    setRoles(roleList);
    const mine = new Set<string>(me.permissions);
    setRoleId((current) => current || roleList.find((r) => !r.isSuper && r.permissions.every((p) => mine.has(p)))?.id || '');
  }

  useEffect(() => {
    refresh()
      .catch((e) => toast.error(e.message ?? 'Failed to load admin users.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addAdmin(e: FormEvent) {
    e.preventDefault();
    if (!roleId) {
      toast.error('Choose a role for the new account.');
      return;
    }
    setBusy(true);
    try {
      await api.createAdminUser(email, password, roleId);
      setEmail('');
      setPassword('');
      toast.success('Admin account created.');
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create admin account.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordReset(id: string) {
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.changeAdminPassword(id, newPassword);
      setResettingId(null);
      setNewPassword('');
      toast.success('Admin password updated successfully.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(u: AdminUserDTO, newRoleId: string) {
    if (newRoleId === u.role.id) return;
    setChangingRoleId(u.id);
    try {
      await api.updateAdminUserRole(u.id, newRoleId);
      toast.success(`${u.email}'s role changed to ${roles.find((r) => r.id === newRoleId)?.name ?? 'the new role'}.`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to change role.');
    } finally {
      setChangingRoleId(null);
    }
  }

  async function confirmRemove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.deleteAdminUser(toDelete.id);
      toast.success('Admin account removed.');
      setToDelete(null);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to remove admin account.');
    } finally {
      setBusy(false);
    }
  }

  const selectedRole = roles.find((r) => r.id === roleId);

  return (
    <Card icon={<FiUsers />} title="Admin users">
      <p className="muted">
        Everyone listed here can sign in to this admin panel. What each person can see and do is set by their role — manage roles
        and their permissions on the Roles tab.
      </p>
      {loading ? (
        <InlineSpinner label="Loading admin users…" />
      ) : (
        <Table>
          <TableHead><TableRow><TableHeaderCell>Email</TableHeaderCell><TableHeaderCell>Role</TableHeaderCell><TableHeaderCell>Added</TableHeaderCell><TableHeaderCell /></TableRow></TableHead>
          <TableBody>
            {users.map((u) => {
              const isMe = u.id === me.id;
              const editable = can('users.edit') && !isMe && assignable.has(u.role.id);
              return (
                <TableRow key={u.id}>
                  <TableCell>{u.email}{isMe && <span className="badge" style={{ marginLeft: 6 }}>you</span>}</TableCell>
                  <TableCell>
                    {editable ? (
                      <select
                        value={u.role.id}
                        disabled={changingRoleId === u.id}
                        onChange={(e) => changeRole(u, e.target.value)}
                        style={{ width: 'auto', fontSize: 12.5 }}
                        aria-label={`Role for ${u.email}`}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id} disabled={!assignable.has(r.id)}>{r.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span title={isMe ? "You can't change your own role" : undefined}>{u.role.name}</span>
                    )}
                  </TableCell>
                  <TableCell className="muted small">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {resettingId === u.id ? (
                      <div className="row-gap" style={{ alignItems: 'center', flexWrap: 'nowrap', gap: 6 }}>
                        <input
                          type="password"
                          autoFocus
                          placeholder="Min 8 chars"
                          aria-label={`New password for ${u.email}`}
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && submitPasswordReset(u.id)}
                          disabled={busy}
                          style={{ fontSize: 12, padding: '4px 8px', width: 140 }}
                        />
                        <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => submitPasswordReset(u.id)} disabled={busy}>
                          {busy ? 'Saving…' : 'Save'}
                        </button>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => { setResettingId(null); setNewPassword(''); }} disabled={busy}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
                        {can('users.edit') && (isMe || assignable.has(u.role.id)) && (
                          <button className="btn-icon btn-secondary" title="Reset password" aria-label={`Reset password for ${u.email}`} onClick={() => setResettingId(u.id)}>
                            <FiKey />
                          </button>
                        )}
                        {can('users.delete') && (
                          <button
                            className="btn-icon btn-danger"
                            aria-label={`Remove ${u.email}`}
                            title={
                              isMe
                                ? "You can't remove your own account while signed in as it"
                                : !assignable.has(u.role.id)
                                  ? "This account has more access than you do, so you can't remove it"
                                  : 'Remove'
                            }
                            onClick={() => setToDelete(u)}
                            disabled={isMe || !assignable.has(u.role.id) || users.length <= 1}
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {can('users.create') && !loading && (
        <form className="row-gap" style={{ alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }} onSubmit={addAdmin}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="new-admin-email">Email</label>
            <input id="new-admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="new-admin-password">Password</label>
            <input id="new-admin-password" type="password" minLength={8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="new-admin-role">Role</label>
            <select id="new-admin-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
              {roles.map((r) => (
                <option key={r.id} value={r.id} disabled={!assignable.has(r.id)}>{r.name}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" disabled={busy || !roleId}><FiPlus /> Add admin</button>
        </form>
      )}
      {can('users.create') && selectedRole && (
        <p className="muted small" style={{ marginTop: 8 }}>
          {selectedRole.description || (selectedRole.isSuper ? 'Everything.' : `${selectedRole.permissions.length} permissions.`)}
        </p>
      )}

      {toDelete && (
        <ConfirmDialog title="Remove admin account?" confirmLabel="Remove account" busy={busy} onConfirm={confirmRemove} onCancel={() => setToDelete(null)}>
          <strong>{toDelete.email}</strong> ({toDelete.role.name}) will no longer be able to sign in. This can’t be undone.
        </ConfirmDialog>
      )}
    </Card>
  );
}
