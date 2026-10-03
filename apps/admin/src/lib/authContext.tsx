import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { AuthMeDTO, Permission } from '../shared';

/**
 * The signed-in admin and what they may do, as reported by the server.
 *
 * Everything here exists to adapt the UI (hide a menu entry, disable a button, explain why).
 * It is NOT a security boundary: the server re-checks every request against the database, so
 * tampering with this state only changes what the page shows, never what the API allows.
 */
interface AuthState {
  me: AuthMeDTO;
  can: (permission: Permission) => boolean;
  canAny: (permissions: readonly Permission[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ me, children }: { me: AuthMeDTO; children: ReactNode }) {
  const granted = useMemo(() => new Set<string>(me.permissions), [me.permissions]);
  const can = useCallback((permission: Permission) => granted.has(permission), [granted]);
  const canAny = useCallback((permissions: readonly Permission[]) => permissions.some((p) => granted.has(p)), [granted]);
  const value = useMemo(() => ({ me, can, canAny }), [me, can, canAny]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider> (it is provided by <ProtectedRoute>).');
  return ctx;
}

/** `const can = useCan(); can('faqs.delete')` */
export function useCan() {
  return useAuth().can;
}

interface CanProps {
  /** Render children only if the user holds this permission (or, given an array, any one of them). */
  permission: Permission | readonly Permission[];
  /** Shown instead when the permission is missing — e.g. a disabled button with an explanation. Default: nothing. */
  fallback?: ReactNode;
  children: ReactNode;
}

/** `<Can permission="faqs.delete"><DeleteButton /></Can>` */
export function Can({ permission, fallback = null, children }: CanProps) {
  const { can, canAny } = useAuth();
  const allowed = Array.isArray(permission) ? canAny(permission as readonly Permission[]) : can(permission as Permission);
  return <>{allowed ? children : fallback}</>;
}
