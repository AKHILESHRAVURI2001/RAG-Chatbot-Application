import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rolesRepo } from '../../../src/features/roles/roles.queries';
import { handleCreateRole, handleDeleteRole, handleUpdateRole } from '../../../src/features/roles/roles.handlers';
import { buildPrincipal } from '../../../src/features/auth/authorization';

vi.mock('../../../src/features/roles/roles.queries', () => ({
  rolesRepo: { list: vi.fn(), findById: vi.fn(), findByName: vi.fn(), create: vi.fn(), update: vi.fn(), deleteById: vi.fn() },
}));

const repo = rolesRepo as unknown as Record<string, ReturnType<typeof vi.fn>>;

function actor(permissions: string[], isSuper = false) {
  return buildPrincipal({ id: 'actor', email: 'actor@example.com', role: { id: 'ar', name: 'Actor', isSuper }, permissions });
}

function call(handler: any, req: { adminUser: any; body?: unknown; params?: Record<string, string> }) {
  const res: any = { statusCode: 200, body: undefined, locals: {} };
  res.status = vi.fn((c: number) => ((res.statusCode = c), res));
  res.json = vi.fn((b: unknown) => ((res.body = b), res));
  res.end = vi.fn(() => res);
  const next = vi.fn();
  return handler({ body: {}, params: {}, ...req }, res, next).then(() => ({ res, next }));
}

function roleRow(over: Partial<any> = {}) {
  return { id: 'r1', name: 'Custom', description: '', isSystem: false, isSuper: false, permissions: ['faqs.view'], userCount: 0, createdAt: 'now', ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByName.mockResolvedValue(null);
});

describe('creating a role', () => {
  it('creates a role from valid permissions and records safe audit metadata', async () => {
    repo.create.mockResolvedValue(roleRow({ name: 'Content Manager', permissions: ['faqs.create', 'faqs.view'] }));
    const { res } = await call(handleCreateRole, { adminUser: actor(['faqs.view', 'faqs.create']), body: { name: ' Content Manager ', description: '', permissions: ['faqs.view', 'faqs.create', 'faqs.view'] } });
    expect(res.statusCode).toBe(201);
    expect(repo.create).toHaveBeenCalledWith({ name: 'Content Manager', description: '', permissions: ['faqs.view', 'faqs.create'] });
    expect(res.locals.auditMeta).toEqual({ name: 'Content Manager', permissionCount: 2 });
  });

  it('rejects an unknown permission with 400 — payload tampering cannot invent permissions', async () => {
    const { res } = await call(handleCreateRole, { adminUser: actor(['faqs.view']), body: { name: 'Sneaky', permissions: ['faqs.view', 'database.drop'] } });
    expect(res.statusCode).toBe(400);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a name that is too short', async () => {
    const { res } = await call(handleCreateRole, { adminUser: actor(['faqs.view']), body: { name: 'a', permissions: [] } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a duplicate name (case-insensitively) with 409', async () => {
    repo.findByName.mockResolvedValue(roleRow({ name: 'editor' }));
    const { res } = await call(handleCreateRole, { adminUser: actor(['faqs.view']), body: { name: 'Editor', permissions: ['faqs.view'] } });
    expect(res.statusCode).toBe(409);
  });

  it('refuses (403) to grant a permission the creator does not hold — no privilege escalation via a new role', async () => {
    const { res } = await call(handleCreateRole, { adminUser: actor(['roles.create', 'faqs.view']), body: { name: 'Powerful', permissions: ['faqs.view', 'users.delete'] } });
    expect(res.statusCode).toBe(403);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('editing a role', () => {
  it('cannot edit the full-access role', async () => {
    repo.findById.mockResolvedValue(roleRow({ isSuper: true, isSystem: true, name: 'Admin' }));
    const { res } = await call(handleUpdateRole, { adminUser: actor([], true), params: { id: 'r1' }, body: { name: 'Admin', permissions: [] } });
    expect(res.statusCode).toBe(400);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('cannot rename a built-in role', async () => {
    repo.findById.mockResolvedValue(roleRow({ isSystem: true, name: 'Editor' }));
    const { res } = await call(handleUpdateRole, { adminUser: actor(['faqs.view']), params: { id: 'r1' }, body: { name: 'Boss', permissions: ['faqs.view'] } });
    expect(res.statusCode).toBe(400);
  });

  it('cannot edit a role that holds permissions the editor lacks (e.g. to strip a higher role)', async () => {
    repo.findById.mockResolvedValue(roleRow({ permissions: ['faqs.view', 'users.delete'] }));
    const { res } = await call(handleUpdateRole, { adminUser: actor(['roles.edit', 'faqs.view']), params: { id: 'r1' }, body: { name: 'Custom', permissions: ['faqs.view'] } });
    expect(res.statusCode).toBe(403);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('cannot add a permission the editor does not hold', async () => {
    repo.findById.mockResolvedValue(roleRow());
    const { res } = await call(handleUpdateRole, { adminUser: actor(['roles.edit', 'faqs.view']), params: { id: 'r1' }, body: { name: 'Custom', permissions: ['faqs.view', 'settings.edit'] } });
    expect(res.statusCode).toBe(403);
  });

  it('records which permissions were added and removed', async () => {
    repo.findById.mockResolvedValue(roleRow({ permissions: ['faqs.view', 'faqs.delete'] }));
    repo.update.mockResolvedValue(roleRow({ permissions: ['faqs.create', 'faqs.view'] }));
    const { res } = await call(handleUpdateRole, { adminUser: actor(['faqs.view', 'faqs.create', 'faqs.delete']), params: { id: 'r1' }, body: { name: 'Custom', permissions: ['faqs.view', 'faqs.create'] } });
    expect(res.statusCode).toBe(200);
    expect(res.locals.auditMeta).toEqual({ name: 'Custom', added: ['faqs.create'], removed: ['faqs.delete'] });
  });

  it('returns 404 for an unknown role', async () => {
    repo.findById.mockResolvedValue(null);
    const { res } = await call(handleUpdateRole, { adminUser: actor([], true), params: { id: 'nope' }, body: { name: 'Whatever', permissions: [] } });
    expect(res.statusCode).toBe(404);
  });
});

describe('deleting a role', () => {
  it('refuses to delete a built-in role', async () => {
    repo.findById.mockResolvedValue(roleRow({ isSystem: true }));
    const { res } = await call(handleDeleteRole, { adminUser: actor([], true), params: { id: 'r1' } });
    expect(res.statusCode).toBe(400);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });

  it('refuses to delete a role that still has accounts (409)', async () => {
    repo.findById.mockResolvedValue(roleRow({ userCount: 3 }));
    const { res } = await call(handleDeleteRole, { adminUser: actor(['faqs.view']), params: { id: 'r1' } });
    expect(res.statusCode).toBe(409);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });

  it('deletes an unused custom role', async () => {
    repo.findById.mockResolvedValue(roleRow());
    const { res } = await call(handleDeleteRole, { adminUser: actor(['faqs.view']), params: { id: 'r1' } });
    expect(res.statusCode).toBe(204);
    expect(repo.deleteById).toHaveBeenCalledWith('r1');
  });
});
