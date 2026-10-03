import type { ReactNode } from 'react';

export default function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle-row${disabled ? ' disabled' : ''}`}>
      <span className="toggle-switch">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-track">
          <span className="toggle-knob" />
        </span>
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}
