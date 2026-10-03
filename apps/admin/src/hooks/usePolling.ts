import { useEffect, useRef } from 'react';

/**
 * Calls `callback` every `intervalMs` — but only while the tab is visible. A background tab makes
 * no requests, and the moment it becomes visible again the callback runs once so the data is fresh.
 * The latest `callback` is always used, so callers don't need to memoize it.
 */
export function usePolling(callback: () => void, intervalMs: number, { immediate = false }: { immediate?: boolean } = {}) {
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (immediate) latest.current();
    const id = setInterval(() => {
      if (!document.hidden) latest.current();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) latest.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, immediate]);
}
