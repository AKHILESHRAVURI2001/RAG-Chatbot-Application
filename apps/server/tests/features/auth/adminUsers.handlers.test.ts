import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminUsersRepo } from '../../../src/features/auth/adminUsers.queries';
import { rolesRepo } from '../../../src/features/roles/roles.queries';
import { handleDeleteAdmin, handleUpdateAdminRole } from '../../../src/features/auth/adminUsers.handlers';
import { buildPrincipal } from '../../../src/features/auth/authorization';

vi.mock('../../../src/features/auth/adminUsers.queries', () => ({
  adminUsersRepo: { findById: vi.fn(), findByEmail: vi.fn(), updateRole: vi.fn(), deleteById: vi.fn(), count: vi.fn(), countSuperAdmins: vi.fn() },
}));
vi.mock('../../../src/features/roles/roles.queries', () => ({ rolesRepo: { findById: vi.fn() } }));
vi.mock('../../../src/features/auth/authService', () => ({ authService: {} }));

const users = adminUsersRepo as unknown as Record<string, ReturnType<typeof vi.fn>>;
const roles = rolesRepo as unknown as Record<string, ReturnType<typeof vi.fn>>;

const UUID = '11111111-1111-4111-8111-111111111111';

function actor(permissions: string[], isSuper = false, id = 'actor') {
  return buildPrincipal({ id, email: 'actor@example.com', role: { id: 'ar', name: 'Actor', isSuper }, permissions });
}

function call(handler: any, req: { adminUser: any; body?: unknown; params?: Record<string, string> }) {
  const res: any = { statusCode: 200, body: undefined, locals: {} };
  res.status = vi.fn((c: number) => ((res.statusCode = c), res));
  res.json = vi.fn((b: unknown) => ((res.body = b), res));
  res.end = vi.fn(() => res);
  const next = vi.fn();
  return handler({ body: {}, params: {}, ...req }, res, next).then(() => ({ res, next }));
}

const target = (over: Partial<any> = {}) => ({ id: 't1', email: 't@example.com', roleId: 'rt', roleName: 'Editor', roleIsSuper: false, ...over });
const role = (over: Partial<any> = {}) => ({ id: 'rt', name: 'Editor', isSuper: false, permissions: ['faqs.view'], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  users.count.mockResolvedValue(5);
  users.countSuperAdmins.mockResolvedValue(2);
});

describe('changing an admin account’s role', () => {
  it('works when both roles are within the actor’s own permissions', async () => {
    users.findById.mockResolvedValue(target());
    roles.findById.mockImplementation(async (id: string) => (id === UUID ? role({ id: UUID, name: 'Viewer' }) : role()));
    const { res } = await call(handleUpdateAdminRole, { adminUser: actor(['users.edit', 'faqs.view']), params: { id: 't1' }, body: { roleId: UUID } });
    expect(res.statusCode).toBe(204);
    expect(users.updateRole).toHaveBeenCalledWith('t1', UUID);
  });

  it('refuses to promote someone into a role that exceeds the actor’s access (vertical escalation)', async () => {
    users.findById.mockResolvedValue(target());
    roles.findById.mockImplementation(async (id: string) => (id === UUID ? role({ id: UUID, permissions: ['faqs.view', 'settings.edit'] }) : role()));
    const { res } = await call(handleUpdateAdminRole, { adminUser: actor(['users.edit', 'faqs.view']), params: { id: 't1' }, body: { roleId: UUID } });
    expect(res.statusCode).toBe(403);
    expect(users.updateRole).not.toHaveBeenCalled();
  });

  it('refuses to touch an account whose current role exceeds the actor’s access (cannot demote a more powerful user)', async () => {
    users.findById.mockResolvedValue(target({ roleName: 'Boss' }));
    roles.findById.mockImplementation(async (id: string) => (id === UUID ? role({ id: UUID }) : role({ permissions: ['faqs.view', 'users.delete'] })));
    const { res } = await call(handleUpdateAdminRole, { adminUser: actor(['users.edit', 'faqs.view']), params: { id: 't1' }, body: { roleId: UUID } });
    expect(res.statusCode).toBe(403);
  });

  it('refuses to change your own role', async () => {
    users.findById.mockResolvedValue(target({ id: 'actor' }));
    const { res } = await call(handleUpdateAdminRole, { adminUser: actor(['users.edit'], false, 'actor'), params: { id: 'actor' }, body: { roleId: UUID } });
    expect(res.statusCode).toBe(400);
  });

  it('refuses to demote the last full-access admin', async () => {
    users.findById.mockResolvedValue(target({ roleIsSuper: true, roleName: 'Admin' }));
    roles.findById.mockImplementation(async (id: string) => (id === UUID ? role({ id: UUID }) : role({ isSuper: true, permissions: [] })));
    users.countSuperAdmins.mockResolvedValue(1);
    const { res } = await call(handleUpdateAdminRole, { adminUser: actor([], true), params: { id: 't1' }, body: { roleId: UUID } });
    expect(res.statusCode).toBe(400);
    expect(users.updateRole).not.toHaveBeenCalled();
  });

  it('rejects a malformed role id with an error, not a database call', async () => {
    users.findById.mockResolvedValue(target());
    const { next } = await call(handleUpdateAdminRole, { adminUser: actor(['users.edit']), params: { id: 't1' }, body: { roleId: 'not-a-uuid' } });
    expect(next).toHaveBeenCalled();
    expect(users.updateRole).not.toHaveBeenCalled();
  });
});

describe('deleting an admin account', () => {
  it('refuses to delete yourself', async () => {
    users.findById.mockResolvedValue(target({ id: 'actor' }));
    const { res } = await call(handleDeleteAdmin, { adminUser: actor(['users.delete'], false, 'actor'), params: { id: 'actor' } });
    expect(res.statusCode).toBe(400);
  });

  it('refuses to delete the last full-access admin', async () => {
    users.findById.mockResolvedValue(target({ roleIsSuper: true }));
    roles.findById.mockResolvedValue(role({ isSuper: true, permissions: [] }));
    users.countSuperAdmins.mockResolvedValue(1);
    const { res } = await call(handleDeleteAdmin, { adminUser: actor([], true), params: { id: 't1' } });
    expect(res.statusCode).toBe(400);
    expect(users.deleteById).not.toHaveBeenCalled();
  });

  it('refuses to delete an account with more access than the actor (cannot remove a more powerful user)', async () => {
    users.findById.mockResolvedValue(target());
    roles.findById.mockResolvedValue(role({ permissions: ['faqs.view', 'settings.edit'] }));
    const { res } = await call(handleDeleteAdmin, { adminUser: actor(['users.delete', 'faqs.view']), params: { id: 't1' } });
    expect(res.statusCode).toBe(403);
    expect(users.deleteById).not.toHaveBeenCalled();
  });

  it('deletes a manageable account', async () => {
    users.findById.mockResolvedValue(target());
    roles.findById.mockResolvedValue(role());
    const { res } = await call(handleDeleteAdmin, { adminUser: actor(['users.delete', 'faqs.view']), params: { id: 't1' } });
    expect(res.statusCode).toBe(204);
    expect(users.deleteById).toHaveBeenCalledWith('t1');
  });
});
