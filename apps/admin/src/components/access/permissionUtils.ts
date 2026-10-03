import type { Permission, PermissionGroup } from '../../shared';

export interface PermissionSummaryItem {
  module: string;
  label: string;
  granted: { label: string; destructive: boolean }[];
  total: number;
}

/** Groups a flat permission list back under its modules, in catalog order, skipping modules with nothing granted. */
export function summarizePermissions(groups: PermissionGroup[], permissions: readonly Permission[]): PermissionSummaryItem[] {
  const granted = new Set<string>(permissions);
  return groups
    .map((g) => ({
      module: g.module,
      label: g.label,
      granted: g.actions.filter((a) => granted.has(a.permission)).map((a) => ({ label: a.label, destructive: isDestructiveAction(a.action) })),
      total: g.actions.length,
    }))
    .filter((s) => s.granted.length > 0);
}

/** "Delete" is the most destructive verb; the UI flags it so it's never granted by accident. */
export function isDestructiveAction(action: string): boolean {
  return action === 'delete' || action === 'clear';
}
