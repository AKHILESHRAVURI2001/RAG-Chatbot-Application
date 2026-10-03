import { ALL_PERMISSIONS, isPermission, type Permission, type RoleSummaryDTO } from '../../shared';

/**
 * The authorization rules, in one place and free of I/O so they are trivial to test.
 *
 * Everything else asks `can(principal, 'faqs.delete')` — nothing outside this file knows what a
 * "super" role is, and nothing compares role names.
 */
export interface AdminPrincipal {
  id: string;
  email: string;
  role: RoleSummaryDTO;
  permissions: ReadonlySet<Permission>;
}

export interface PrincipalSourceData {
  id: string;
  email: string;
  role: RoleSummaryDTO;
  permissions: readonly string[];
}

/** Turns what the database holds into an effective principal. Super roles get the whole registry; stale/unknown permission strings are dropped. */
export function buildPrincipal(source: PrincipalSourceData): AdminPrincipal {
  const granted = source.role.isSuper ? ALL_PERMISSIONS : source.permissions.filter(isPermission);
  return { id: source.id, email: source.email, role: source.role, permissions: new Set(granted) };
}

export function can(principal: AdminPrincipal | undefined, permission: Permission): boolean {
  return !!principal && principal.permissions.has(permission);
}

export function canAny(principal: AdminPrincipal | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(principal, p));
}

/**
 * Privilege-escalation guard. An actor may create, edit, assign or remove a role only if they
 * already hold every permission it contains — you can't hand out (or tamper with) powers you
 * don't have. A super role may only be managed by someone who is themselves super.
 */
export function canManageRole(actor: AdminPrincipal | undefined, target: { isSuper: boolean; permissions: readonly Permission[] }): boolean {
  if (!actor) return false;
  if (target.isSuper) return actor.role.isSuper;
  return target.permissions.every((p) => actor.permissions.has(p));
}

/** The permissions a client may use to adapt its UI. The server never trusts this list coming back — it is display-only. */
export function listPermissions(principal: AdminPrincipal): Permission[] {
  return [...principal.permissions].sort();
}
