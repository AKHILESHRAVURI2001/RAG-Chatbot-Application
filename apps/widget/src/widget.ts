import { ChatWidgetController } from './core/chatWidgetController';
import type { WidgetInitOptions } from './types/widget.types';

export * from './types/widget.types';
export * from './services/widgetStorage';
export * from './services/widgetApi';
export * from './services/widgetAudio';
export * from './ui/widgetDom';
export * from './ui/widgetIcons';
export * from './core/chatWidgetController';

(function bootstrap() {
  // If already initialized on this page, clean up previous instance
  if (typeof window !== 'undefined' && (window as any).__MiniChatbot?.controller) {
    try {
      (window as any).__MiniChatbot.controller.destroy?.();
    } catch (_) {}
  }
  document.querySelectorAll('.mcb-bubble, .mcb-window, .mcb-proactive-callout').forEach((el) => el.remove());

  const currentScript = document.currentScript as HTMLScriptElement | null;
  const apiBase = currentScript?.dataset.api;
  const documentId = currentScript?.dataset.documentId || undefined;
  const tag = currentScript?.dataset.tag || undefined;
  const icon = currentScript?.dataset.icon || undefined;
  const primaryColor = currentScript?.dataset.primaryColor || undefined;
  const title = currentScript?.dataset.title || undefined;

  if (!apiBase) {
    console.error('[MiniChatbotAgent] Missing data-api attribute on the widget <script> tag.');
    return;
  }

  const options: WidgetInitOptions = {
    apiBase,
    documentId,
    tag,
    icon,
    primaryColor,
    title,
  };

  const controller = new ChatWidgetController(options);
  void controller.initialize();

  if (typeof window !== 'undefined') {
    (window as any).__MiniChatbot = {
      controller,
      version: '1.0.0',
    };
  }
})();
