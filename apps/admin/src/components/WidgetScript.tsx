import { useEffect } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000/api';

/**
 * Loads the canonical widget script tag into the admin page.
 * Uses the exact same widget script as client websites with zero duplicated widget UI code.
 */
export default function WidgetScript() {
  useEffect(() => {
    const existing = document.getElementById('mcb-widget-script');
    if (existing) return;

    const script = document.createElement('script');
    script.id = 'mcb-widget-script';
    const serverHost = API_BASE.replace(/\/api\/?$/, '');
    script.src = `${serverHost}/widget.js`;
    script.dataset.api = API_BASE;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.getElementById('mcb-widget-script')?.remove();
      document.querySelectorAll('.mcb-widget-root, .minichatbot-widget, .mcb-bubble, .mcb-window, .mcb-proactive-callout').forEach((el) => el.remove());
    };
  }, []);

  return null;
}
