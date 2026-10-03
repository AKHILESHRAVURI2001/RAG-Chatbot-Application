import { describe, expect, it } from 'vitest';
import { buildPrincipal, can, canAny, canManageRole, listPermissions } from '../../../src/features/auth/authorization';
import { ALL_PERMISSIONS, PERMISSION_CATALOG, getPermissionGroups, isPermission } from '../../../src/shared';

function principal(permissions: string[], isSuper = false) {
  return buildPrincipal({ id: 'u1', email: 'u@example.com', role: { id: 'r1', name: 'Test', isSuper }, permissions });
}

describe('permission registry', () => {
  it('uses the module.action convention and has no duplicates', () => {
    expect(ALL_PERMISSIONS.every((p) => /^[a-z]+\.[a-z-]+$/.test(p))).toBe(true);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('derives every permission from the catalog, so adding a module needs no other change', () => {
    const fromCatalog = PERMISSION_CATALOG.flatMap((m) => m.actions.map((a) => `${m.module}.${a.action}`));
    expect([...ALL_PERMISSIONS]).toEqual(fromCatalog);
    expect(getPermissionGroups().flatMap((g) => g.actions.map((a) => a.permission))).toEqual(fromCatalog);
  });

  it('recognizes only real permissions', () => {
    expect(isPermission('faqs.delete')).toBe(true);
    expect(isPermission('faqs.explode')).toBe(false);
    expect(isPermission('*')).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });
});

describe('can', () => {
  it('allows exactly what the role holds', () => {
    const p = principal(['faqs.view', 'faqs.create']);
    expect(can(p, 'faqs.view')).toBe(true);
    expect(can(p, 'faqs.create')).toBe(true);
    expect(can(p, 'faqs.delete')).toBe(false);
    expect(can(p, 'users.view')).toBe(false);
  });

  it('denies everything when there is no principal', () => {
    expect(can(undefined, 'faqs.view')).toBe(false);
  });

  it('gives a super role every permission, without storing them', () => {
    const p = principal([], true);
    expect(ALL_PERMISSIONS.every((perm) => can(p, perm))).toBe(true);
  });

  it('drops permission strings that no longer exist in the registry instead of trusting them', () => {
    const p = principal(['faqs.view', 'legacy.superpower', '*']);
    expect(listPermissions(p)).toEqual(['faqs.view']);
  });

  it('canAny passes if at least one permission is held', () => {
    const p = principal(['faqs.view']);
    expect(canAny(p, ['users.view', 'faqs.view'])).toBe(true);
    expect(canAny(p, ['users.view', 'roles.view'])).toBe(false);
  });
});

describe('canManageRole (privilege-escalation guard)', () => {
  it('lets an actor manage a role whose permissions are all within their own', () => {
    const actor = principal(['faqs.view', 'faqs.create', 'faqs.edit']);
    expect(canManageRole(actor, { isSuper: false, permissions: ['faqs.view', 'faqs.create'] })).toBe(true);
  });

  it('refuses a role containing even one permission the actor lacks', () => {
    const actor = principal(['faqs.view', 'faqs.create']);
    expect(canManageRole(actor, { isSuper: false, permissions: ['faqs.view', 'faqs.delete'] })).toBe(false);
  });

  it('lets only a super actor manage a super role — even an actor holding every permission cannot', () => {
    const allButNotSuper = principal([...ALL_PERMISSIONS]);
    expect(canManageRole(allButNotSuper, { isSuper: true, permissions: [...ALL_PERMISSIONS] })).toBe(false);
    expect(canManageRole(principal([], true), { isSuper: true, permissions: [...ALL_PERMISSIONS] })).toBe(true);
  });

  it('refuses when there is no actor', () => {
    expect(canManageRole(undefined, { isSuper: false, permissions: [] })).toBe(false);
  });
});
