import type { ReactNode } from 'react';
import { FiLock } from 'react-icons/fi';
import type { Permission } from '../shared';
import { useCan } from '../lib/authContext';

/**
 * Wraps a page or tab full of inputs and Save buttons. Without `permission` the whole region
 * becomes read-only — a native `<fieldset disabled>` turns off every input and button inside it
 * in one go, so no individual control can be missed — and a short note says why.
 */
export function ReadOnlyGuard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const can = useCan();
  if (can(permission)) return <>{children}</>;
  return (
    <>
      <div className="role-banner" role="note">
        <FiLock aria-hidden /> You have read-only access here — your role doesn’t include changing this.
      </div>
      <fieldset disabled style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {children}
      </fieldset>
    </>
  );
}
