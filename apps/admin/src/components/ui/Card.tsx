import type { FormEvent, ReactNode } from 'react';

interface CardProps {
  /** An icon component (e.g. from react-icons/fi) shown before the title. */
  icon?: ReactNode;
  title?: ReactNode;
  /** Extra classes on top of the base `.card` — e.g. a page-specific layout tweak. */
  className?: string;
  /** Renders the card as a `<form>` instead of a `<div>` — for an "Add ..." card whose fields submit together (e.g. Documents' add-URL/add-text cards, FAQs' add/edit card). Omit for a plain content card. */
  onSubmit?: (e: FormEvent) => void;
  children: ReactNode;
}

/**
 * The one card shell every settings/report/form panel in the admin is built
 * from — same white rounded box, same heading row, wherever it's used.
 * Reach for this instead of a raw `<div className="card">` (or
 * `<form className="card">`) so the shell itself only ever needs changing in
 * one place. `title` is optional: a card that's pure content (no heading)
 * just omits it.
 */
export default function Card({ icon, title, className, onSubmit, children }: CardProps) {
  const cls = className ? `card ${className}` : 'card';
  if (onSubmit) {
    return (
      <form className={cls} onSubmit={onSubmit}>
        {title && <h3>{icon} {title}</h3>}
        {children}
      </form>
    );
  }
  return (
    <div className={cls}>
      {title && <h3>{icon} {title}</h3>}
      {children}
    </div>
  );
}
