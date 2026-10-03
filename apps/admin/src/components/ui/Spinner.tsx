export function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="page-spinner">
      <span className="spinner" aria-hidden="true" />
      <span className="muted small">{label}</span>
    </div>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-spinner-row">
      <span className="spinner spinner-small" aria-hidden="true" />
      {label && <span className="muted small">{label}</span>}
    </span>
  );
}

export function TopBarLoader({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="top-bar-loader" role="status" aria-label="Refreshing">
      <div className="top-bar-loader-fill" />
    </div>
  );
}
