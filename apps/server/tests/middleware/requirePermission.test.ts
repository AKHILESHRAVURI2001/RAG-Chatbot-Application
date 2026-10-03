import { describe, expect, it, vi } from 'vitest';
import { requirePermission } from '../../src/middleware/requirePermission';
import { buildPrincipal } from '../../src/features/auth/authorization';

function run(middleware: ReturnType<typeof requirePermission>, adminUser: any) {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  const next = vi.fn();
  middleware({ adminUser } as any, res, next);
  return { res, next };
}

const viewer = buildPrincipal({ id: 'u', email: 'v@example.com', role: { id: 'r', name: 'Viewer', isSuper: false }, permissions: ['users.view'] });

describe('requirePermission', () => {
  it('calls next when the permission is held', () => {
    const { next, res } = run(requirePermission('users.view'), viewer);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 — without revealing which permission was missing — when it is not held', () => {
    const { next, res } = run(requirePermission('users.delete'), viewer);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('users.delete');
  });

  it('returns 401 when the request was never authenticated', () => {
    const { next, res } = run(requirePermission('users.view'), undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('with several permissions, any one is enough', () => {
    expect(run(requirePermission('users.delete', 'users.view'), viewer).next).toHaveBeenCalledOnce();
    expect(run(requirePermission('users.delete', 'roles.edit'), viewer).next).not.toHaveBeenCalled();
  });

  it('a super role passes every check', () => {
    const superUser = buildPrincipal({ id: 'u', email: 's@example.com', role: { id: 'r', name: 'Admin', isSuper: true }, permissions: [] });
    expect(run(requirePermission('roles.delete'), superUser).next).toHaveBeenCalledOnce();
  });
});
