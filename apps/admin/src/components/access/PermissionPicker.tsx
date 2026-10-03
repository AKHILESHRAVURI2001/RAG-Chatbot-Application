import { useMemo, useState } from 'react';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import type { Permission, PermissionGroup } from '../../shared';
import { SearchInput } from '../ui/SearchInput';
import { isDestructiveAction } from './permissionUtils';

interface PermissionPickerProps {
  groups: PermissionGroup[];
  selected: ReadonlySet<Permission>;
  onChange: (next: Set<Permission>) => void;
  /** Permissions the current admin may not hand out (they don't hold them). Shown disabled with a reason. */
  unavailable?: ReadonlySet<Permission>;
  readOnly?: boolean;
}

/**
 * Permissions grouped by module, each with its own checkboxes and a select-all for the module.
 * Groups are collapsible and searchable so a long catalog stays scannable, and a module's header
 * always shows how much of it is granted ("2 of 5") without opening it.
 */
export default function PermissionPicker({ groups, selected, onChange, unavailable, readOnly }: PermissionPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.filter((g) => g.actions.some((a) => selected.has(a.permission))).map((g) => g.module)));

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      groups
        .map((g) => {
          if (!q) return g;
          const moduleMatches = g.label.toLowerCase().includes(q) || g.description.toLowerCase().includes(q);
          const actions = moduleMatches ? g.actions : g.actions.filter((a) => `${a.label} ${a.description} ${a.permission}`.toLowerCase().includes(q));
          return { ...g, actions };
        })
        .filter((g) => g.actions.length > 0),
    [groups, q],
  );

  function toggleOpen(module: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  function setMany(perms: Permission[], on: boolean) {
    const next = new Set(selected);
    for (const p of perms) {
      if (on) next.add(p);
      else next.delete(p);
    }
    onChange(next);
  }

  const grantable = (p: Permission) => !readOnly && !unavailable?.has(p);

  return (
    <div className="perm-picker">
      <SearchInput value={query} onChange={setQuery} placeholder="Search permissions…" style={{ flex: 'none', marginBottom: 12 }} />
      {visible.length === 0 && <p className="muted">No permissions match “{query}”.</p>}
      {visible.map((g) => {
        const all = groups.find((x) => x.module === g.module)!;
        const grantedCount = all.actions.filter((a) => selected.has(a.permission)).length;
        const selectable = all.actions.map((a) => a.permission).filter(grantable);
        const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p));
        const isOpen = open.has(g.module) || !!q;
        return (
          <section key={g.module} className="perm-group">
            <header className="perm-group-head">
              <button
                type="button"
                className="perm-group-toggle"
                onClick={() => toggleOpen(g.module)}
                aria-expanded={isOpen}
                aria-controls={`perm-${g.module}`}
              >
                {isOpen ? <FiChevronDown aria-hidden /> : <FiChevronRight aria-hidden />}
                <span className="perm-group-title">{g.label}</span>
                <span className={`perm-count ${grantedCount > 0 ? 'on' : ''}`}>
                  {grantedCount} of {all.actions.length}
                </span>
              </button>
              {!readOnly && selectable.length > 0 && (
                <label className="perm-select-all">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && selectable.some((p) => selected.has(p));
                    }}
                    onChange={(e) => setMany(selectable, e.target.checked)}
                    aria-label={`Select all ${g.label} permissions`}
                  />
                  All
                </label>
              )}
            </header>
            {isOpen && (
              <div id={`perm-${g.module}`} className="perm-actions">
                <p className="muted small perm-group-desc">{g.description}</p>
                {g.actions.map((a) => {
                  const blocked = !!unavailable?.has(a.permission);
                  return (
                    <label
                      key={a.permission}
                      className={`perm-action ${blocked ? 'disabled' : ''}`}
                      title={blocked ? "You can't grant a permission you don't have yourself." : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(a.permission)}
                        disabled={readOnly || blocked}
                        onChange={(e) => setMany([a.permission], e.target.checked)}
                      />
                      <span>
                        <strong>{a.label}</strong>
                        {isDestructiveAction(a.action) && <span className="perm-flag">destructive</span>}
                        <span className="muted small perm-action-desc">{a.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
