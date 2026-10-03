import { useEffect, useRef, useState, type ReactNode } from 'react';

interface DropdownProps {
  /** Whatever opens the menu on click — a button, an avatar, anything. Dropdown wraps it, it doesn't render its own trigger markup. */
  trigger: ReactNode;
  /** The menu's contents once open — typically a list of `.topbar-menu-item`-styled buttons/links, but this component doesn't care what's inside. */
  children: ReactNode;
  className?: string;
  panelClassName?: string;
}

/**
 * A click-to-open panel anchored under its trigger, closing on an outside
 * click — the one place this behavior lives, instead of every menu
 * (account menu, a table row's action menu, a filter picker, ...)
 * reimplementing its own open/close state and document-click listener.
 */
export default function Dropdown({ trigger, children, className, panelClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className={className ? `dropdown ${className}` : 'dropdown'} ref={ref}>
      <div className="dropdown-trigger" onClick={() => setOpen((v) => !v)}>
        {trigger}
      </div>
      {open && (
        <div className={panelClassName ? `dropdown-panel ${panelClassName}` : 'dropdown-panel'} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
