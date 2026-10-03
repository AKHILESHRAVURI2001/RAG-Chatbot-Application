import type { ReactNode } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import Modal from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  title: string;
  /** Say plainly what will happen and whether it can be undone. */
  children: ReactNode;
  confirmLabel: string;
  /** Destructive actions get the red button; others the normal one. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The confirmation step for destructive or sensitive actions — replaces the browser's native confirm() with something that can explain the consequences. */
export default function ConfirmDialog({ title, children, confirmLabel, destructive = true, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal icon={destructive ? <FiAlertTriangle aria-hidden /> : undefined} title={title} onClose={busy ? () => {} : onCancel}>
      <div className="muted" style={{ lineHeight: 1.5, fontSize: 14 }}>{children}</div>
      <div className="row-gap" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
