import type { Permission, PermissionGroup } from '../../shared';
import { summarizePermissions } from './permissionUtils';

/** A compact "Module → what's allowed" list — for expanded role rows and the review step. */
export default function PermissionSummary({ groups, permissions }: { groups: PermissionGroup[]; permissions: readonly Permission[] }) {
  const items = summarizePermissions(groups, permissions);
  if (items.length === 0) return <p className="muted small">No permissions.</p>;
  return (
    <dl className="perm-summary">
      {items.map((s) => (
        <div key={s.module} className="perm-summary-row">
          <dt>{s.label}</dt>
          <dd>
            {s.granted.map((g) => (
              <span key={g.label} className={`perm-chip ${g.destructive ? 'danger' : ''}`}>{g.label}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
