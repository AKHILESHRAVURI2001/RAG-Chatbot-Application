import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import type { Permission } from '../shared';
import { useAuth } from '../lib/authContext';
import { EmptyState } from './ui';
import { firstAllowedRoute } from '../routes';

/**
 * Guards a whole page. Without the permission the user sees an explanation instead of a page that
 * would just fail to load. (The API refuses the data regardless — this is about a clear experience.)
 */
export function RequirePermission({ permission, children }: { permission: Permission | readonly Permission[]; children: ReactNode }) {
  const { canAny, me } = useAuth();
  const needed = (Array.isArray(permission) ? permission : [permission]) as readonly Permission[];
  if (canAny(needed)) return <>{children}</>;
  return (
    <EmptyState
      icon={<FiLock />}
      title="You don’t have access to this page"
      description={`Your role (${me.role.name}) doesn’t include it. If you need access, ask an administrator to update your role.`}
    />
  );
}

/** "/" shows the dashboard — or, for a role without it, the first page that role can open. */
export function HomeRedirect({ children }: { children: ReactNode }) {
  const { canAny } = useAuth();
  if (canAny(['dashboard.view'])) return <>{children}</>;
  const next = firstAllowedRoute(canAny);
  return next ? <Navigate to={next.path} replace /> : <RequirePermission permission="dashboard.view">{children}</RequirePermission>;
}
