import { useEffect, useId, useRef, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';

interface ModalProps {
  icon?: ReactNode;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Wider dialog for content like the role editor's permission lists. */
  wide?: boolean;
}

/**
 * A centered popup dialog on a dimmed backdrop — for a focused single task
 * (add/edit an item) that shouldn't sit permanently inline on the page.
 * Clicking the backdrop, pressing Escape or the ✕ closes it the same way Cancel would; the
 * dialog itself just stops that click from bubbling to the backdrop. It is announced to screen
 * readers as a labelled dialog and takes focus when it opens.
 */
export default function Modal({ icon, title, onClose, children, wide }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-dialog"
        style={wide ? { maxWidth: 760 } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={titleId}>{icon} {title}</h3>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
