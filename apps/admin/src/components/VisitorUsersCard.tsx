import { useEffect, useState, type FormEvent } from 'react';
import { FiUserCheck, FiPlus, FiTrash2, FiKey, FiRotateCcw, FiSearch, FiMessageSquare } from 'react-icons/fi';
import type { VisitorUserDTO } from '../shared';
import { api } from '../lib/api';
import { useCan } from '../lib/authContext';
import Card from './ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from './ui/Table';
import { InlineSpinner } from './ui/Spinner';
import { toast } from './ui/Toast';

export default function VisitorUsersCard() {
  const can = useCan();
  const [users, setUsers] = useState<VisitorUserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingQuotaId, setResettingQuotaId] = useState<string | null>(null);

  async function refresh(query = search) {
    try {
      const list = await api.listVisitorUsers(query);
      setUsers(list);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load chat users.');
    }
  }

  useEffect(() => {
    refresh()
      .catch((e) => toast.error(e.message ?? 'Failed to load chat users.'))
      .finally(() => setLoading(false));
  }, []);

  function handleSearchChange(val: string) {
    setSearch(val);
    void refresh(val);
  }

  async function addVisitorUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.createVisitorUser(name, email, password);
      setName('');
      setEmail('');
      setPassword('');
      toast.success(`Chat user "${created.email}" registered successfully.`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to register chat user.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordReset(id: string) {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.changeVisitorPassword(id, newPassword);
      setResettingId(null);
      setNewPassword('');
      toast.success('User password updated successfully.');
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  }

  async function resetQuota(u: VisitorUserDTO) {
    if (!confirm(`Reset message count to 0 for "${u.name || u.email}"?`)) return;
    setResettingQuotaId(u.id);
    try {
      await api.resetVisitorQuota(u.id);
      toast.success(`Message quota for "${u.name || u.email}" reset to 0.`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to reset quota.');
    } finally {
      setResettingQuotaId(null);
    }
  }

  async function removeUser(u: VisitorUserDTO) {
    if (!confirm(`Delete chat user account "${u.name || u.email}"? This cannot be undone.`)) return;
    setDeletingId(u.id);
    try {
      await api.deleteVisitorUser(u.id);
      toast.success(`User "${u.name || u.email}" removed.`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to remove user.');
    } finally {
      setDeletingId(null);
    }
  }

  const totalMessages = users.reduce((acc, u) => acc + (u.messageCount || 0), 0);

  return (
    <Card icon={<FiUserCheck />} title="Chat Users (Visitors)">
      <p className="muted" style={{ marginBottom: 16 }}>
        Manage all registered chatbot visitors. When <strong>Sign-Up</strong> is disabled in settings, only the users created here by an administrator will be able to log in to chat.
      </p>

      {/* Summary Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Registered Users</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{users.length}</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total User Messages</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#4f46e5', marginTop: 4 }}>{totalMessages}</div>
        </div>
      </div>

      {/* Search Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <FiSearch style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {loading ? (
        <InlineSpinner label="Loading chat users…" />
      ) : users.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b' }}>
          {search ? 'No registered chat users matched your search.' : 'No registered chat users yet. Use the form below to create one.'}
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Messages Sent</TableHeaderCell>
              <TableHeaderCell>Registered</TableHeaderCell>
              <TableHeaderCell>Last Active</TableHeaderCell>
              <TableHeaderCell style={{ textAlign: 'right' }}>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell style={{ fontWeight: 600, color: '#1e293b' }}>{u.name || 'Anonymous'}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <FiMessageSquare color="#6366f1" size={13} />
                    <strong>{u.messageCount || 0}</strong>
                  </span>
                </TableCell>
                <TableCell className="muted small">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="muted small">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</TableCell>
                <TableCell style={{ textAlign: 'right' }}>
                  {resettingId === u.id ? (
                    <div className="row-gap" style={{ alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 6 }}>
                      <input
                        type="password"
                        autoFocus
                        placeholder="Min 6 chars"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitPasswordReset(u.id)}
                        disabled={busy}
                        style={{ fontSize: 12, padding: '4px 8px', width: 130 }}
                      />
                      <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => submitPasswordReset(u.id)} disabled={busy}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => { setResettingId(null); setNewPassword(''); }} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {can('visitors.edit') && (
                        <button
                          className="btn-icon btn-secondary"
                          title="Reset message count to 0"
                          aria-label={`Reset message count for ${u.name || u.email}`}
                          onClick={() => resetQuota(u)}
                          disabled={resettingQuotaId === u.id || (u.messageCount || 0) === 0}
                        >
                          <FiRotateCcw size={14} />
                        </button>
                      )}
                      {can('visitors.edit') && (
                        <button
                          className="btn-icon btn-secondary"
                          title="Change password"
                          aria-label={`Change password for ${u.name || u.email}`}
                          onClick={() => {
                            setResettingId(u.id);
                            setNewPassword('');
                          }}
                        >
                          <FiKey size={14} />
                        </button>
                      )}
                      {can('visitors.delete') && (
                        <button
                          className="btn-icon btn-danger"
                          title="Delete chat user"
                          aria-label={`Delete ${u.name || u.email}`}
                          onClick={() => removeUser(u)}
                          disabled={deletingId === u.id}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add Chat User Form */}
      {can('visitors.create') && <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>+ Register New Chat User</h4>
        <form className="row-gap" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={addVisitorUser}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Full Name</label>
            <input type="text" placeholder="e.g. John Doe" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Email Address</label>
            <input type="email" placeholder="user@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Password</label>
            <input type="password" minLength={6} placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn-primary" disabled={busy} style={{ height: 38 }}>
            <FiPlus /> Add Chat User
          </button>
        </form>
      </div>}
    </Card>
  );
}
