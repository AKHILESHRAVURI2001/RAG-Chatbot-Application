import React, { useState, useEffect, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let toastEmitter: ((msg: ToastMessage) => void) | null = null;

export const toast = {
  success(message: string, duration = 3500) {
    if (toastEmitter) {
      toastEmitter({ id: generateUuid(), type: 'success', message, duration });
    }
  },
  error(message: string, duration = 4500) {
    if (toastEmitter) {
      toastEmitter({ id: generateUuid(), type: 'error', message, duration });
    }
  },
  info(message: string, duration = 3500) {
    if (toastEmitter) {
      toastEmitter({ id: generateUuid(), type: 'info', message, duration });
    }
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((t: ToastMessage) => {
    setToasts((prev) => {
      if (prev.some((existing) => existing.message === t.message)) {
        return prev;
      }
      return [...prev.slice(-3), t];
    });
  }, []);

  useEffect(() => {
    toastEmitter = addToast;
    return () => {
      toastEmitter = null;
    };
  }, [addToast]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      {children}
      <div className="mcb-toast-container" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </>
  );
}

function ToastItem({ toast: t, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(onClose, 250);
    }, t.duration ?? 3500);

    return () => clearTimeout(timer);
  }, [t.duration, onClose]);

  const handleManualClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 200);
  };

  const getIcon = () => {
    switch (t.type) {
      case 'success':
        return <FiCheckCircle className="mcb-toast-icon success" />;
      case 'error':
        return <FiAlertCircle className="mcb-toast-icon error" />;
      default:
        return <FiInfo className="mcb-toast-icon info" />;
    }
  };

  return (
    <div className={`mcb-toast-card ${t.type} ${isLeaving ? 'leaving' : ''}`} role="alert">
      <div className="mcb-toast-content">
        {getIcon()}
        <span className="mcb-toast-text">{t.message}</span>
      </div>
      <button className="mcb-toast-close" onClick={handleManualClose} aria-label="Close notification">
        <FiX />
      </button>
      <div
        className="mcb-toast-progress"
        style={{ animationDuration: `${t.duration ?? 3500}ms` }}
      />
    </div>
  );
}
