import type { WidgetConfig, WidgetInitOptions } from '../types/widget.types';
import { WidgetStorageService } from '../services/widgetStorage';
import { WidgetApiService } from '../services/widgetApi';
import { WidgetAudioService } from '../services/widgetAudio';
import { WidgetDomRenderer, type WidgetDomElements, renderHtml, setBubbleIcon, setUnreadBadge, renderAvatarHtml } from '../ui/widgetDom';
import { SEND_SVG, STOP_SVG } from '../ui/widgetIcons';
import widgetCss from '../widget.css?inline';
import { VisitorAuth } from './visitorAuth';
import { VoiceChat } from './voiceChat';

export class ChatWidgetController {
  private config!: WidgetConfig;
  private elements!: WidgetDomElements;
  private rootEl!: HTMLDivElement;
  private styleEl!: HTMLStyleElement;
  private sessionId!: string;
  private visitorAuth!: VisitorAuth;
  private voice!: VoiceChat;

  private greeted = false;
  private opened = false;
  private unreadCount = 0;
  private inFlightController: AbortController | null = null;

  private calloutEl: HTMLDivElement | null = null;
  private userHistory: string[] = [];
  private historyIndex = -1;
  private isVoiceTyping = false;
  private voiceTypeInitialText = '';

  constructor(
    private readonly options: WidgetInitOptions,
    private readonly apiService: WidgetApiService = new WidgetApiService(options),
    private readonly storageService: WidgetStorageService = new WidgetStorageService(),
    private readonly audioService: WidgetAudioService = new WidgetAudioService(),
  ) {}

  public async initialize(): Promise<void> {
    if (!(await this.apiService.isApiHealthy())) {
      console.error('[MiniChatbotAgent] API health check failed — widget will not be shown.');
      return;
    }

    // Clean up any existing instances in the DOM to enforce strict singleton behavior
    document.querySelectorAll('.mcb-widget-root, .minichatbot-widget, .mcb-bubble, .mcb-window, .mcb-proactive-callout').forEach((el) => el.remove());

    this.config = await this.apiService.fetchConfig();
    if (this.options.icon) {
      this.config.icon = this.options.icon;
      this.config.iconSvg = '';
    }
    if (this.options.primaryColor) this.config.primaryColor = this.options.primaryColor;
    if (this.options.title) this.config.title = this.options.title;

    this.sessionId = this.storageService.getSessionId();

    this.styleEl = WidgetDomRenderer.injectStyles(this.config.primaryColor);
    this.elements = WidgetDomRenderer.buildElements(this.config);

    this.rootEl = document.createElement('div');
    this.rootEl.id = 'minichatbot-widget-root';
    this.rootEl.className = 'mcb-widget-root minichatbot-widget notranslate';
    this.rootEl.setAttribute('translate', 'no');
    if (this.config.primaryColor) {
      this.rootEl.style.setProperty('--mcb-primary', this.config.primaryColor);
      document.documentElement.style.setProperty('--mcb-primary', this.config.primaryColor);
    }

    this.setupProactiveCallout();
    this.setupNoteBanner();
    this.setupEventListeners();
    this.visitorAuth = new VisitorAuth({
      getConfig: () => this.config,
      elements: this.elements,
      options: this.options,
      apiService: this.apiService,
      storageService: this.storageService,
    });
    this.visitorAuth.setup();
    this.setupLiveConfigListener();

    this.rootEl.appendChild(this.elements.bubble);
    this.rootEl.appendChild(this.elements.window);
    document.body.appendChild(this.rootEl);
  }

  public destroy(): void {
    this.rootEl?.remove();
    this.elements?.bubble?.remove();
    this.elements?.window?.remove();
    this.calloutEl?.remove();
    this.styleEl?.remove();
    this.voice?.destroy();
    if (this.inFlightController) this.inFlightController.abort();
  }

  private setupProactiveCallout(): void {
    if (this.config.proactiveEnabled && this.config.enabled && this.config.proactiveMessage) {
      if (!this.storageService.isProactiveDismissed(this.config.proactiveMessage)) {
        const callout = document.createElement('div');
        callout.className = 'mcb-proactive-callout notranslate';
        callout.setAttribute('translate', 'no');
        callout.innerHTML = `
          <button class="mcb-proactive-close" aria-label="Dismiss">✕</button>
          <span>${renderHtml(this.config.proactiveMessage)}</span>
        `;
        callout.querySelector('.mcb-proactive-close')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.storageService.dismissProactive(this.config.proactiveMessage);
          callout.remove();
          this.calloutEl = null;
        });
        callout.addEventListener('click', () => this.elements.bubble.click());
        this.calloutEl = callout;

        setTimeout(() => {
          if (this.calloutEl === callout && !this.elements.window.classList.contains('open')) {
            if (this.rootEl) {
              this.rootEl.appendChild(callout);
            } else {
              document.body.appendChild(callout);
            }
          }
        }, this.config.proactiveDelaySeconds * 1000);
      }
    }
  }

  private setupNoteBanner(): void {
    const banner = this.elements.noteBanner;
    if (!banner) return;
    const refresh = () => {
      banner.style.display = this.storageService.isNoteDismissed(this.config.note) ? 'none' : '';
    };
    banner.querySelector('.mcb-note-close')?.addEventListener('click', () => {
      this.storageService.dismissNote(this.config.note);
      refresh();
    });
    refresh();
  }

  private setupLiveConfigListener(): void {
    window.addEventListener('mcb:config-update', ((e: CustomEvent) => {
      if (e.detail?.primaryColor) {
        this.config.primaryColor = e.detail.primaryColor;
        document.documentElement.style.setProperty('--mcb-primary', e.detail.primaryColor);
        if (this.rootEl) {
          this.rootEl.style.setProperty('--mcb-primary', e.detail.primaryColor);
        }
        if (this.styleEl) {
          this.styleEl.textContent = widgetCss + `\n:root, .mcb-widget-root, .minichatbot-widget { --mcb-primary: ${e.detail.primaryColor} !important; }\n`;
        }
      }
      if (e.detail?.iconSvg !== undefined || e.detail?.icon !== undefined) {
        if (e.detail.icon !== undefined) this.config.icon = e.detail.icon;
        if (e.detail.iconSvg !== undefined) this.config.iconSvg = e.detail.iconSvg;
        setBubbleIcon(this.elements.bubble, this.config.icon, this.config.iconSvg);
        if (this.elements.headerAvatar) {
          this.elements.headerAvatar.innerHTML = renderAvatarHtml(this.config.icon, this.config.iconSvg);
        }
      }
    }) as EventListener);
  }

  private setupEventListeners(): void {
    this.elements.bubble.addEventListener('click', async () => {
      this.calloutEl?.remove();
      this.calloutEl = null;
      const isOpen = this.elements.window.classList.toggle('open');
      this.elements.bubble.classList.toggle('mcb-window-open', isOpen);
      if (!isOpen) return;
      this.clearUnread();

      this.elements.window.addEventListener('keydown', this.trapFocus);
      (this.elements.inputEl ?? this.elements.closeBtn).focus();

      if (!this.opened) {
        this.opened = true;
        await this.loadConversation();
      }
      if (!this.greeted) {
        WidgetDomRenderer.addMessage(this.elements.messagesEl, this.config.greeting, 'bot', this.config.icon, this.config.iconSvg);
        this.greeted = true;
        this.renderQuickReplies();
        if (this.config.requireLogin && !this.visitorAuth.isAuthenticated && (this.config.freeQuestionsBeforeAuth ?? 0) === 0) {
          WidgetDomRenderer.addAuthGatePrompt(this.elements.messagesEl, {
            title: this.config.loginPromptTitle,
            message: this.config.loginPromptMessage,
            signupUrl: this.config.signupUrl,
            loginUrl: this.config.loginUrl,
            allowPublicSignup: this.config.allowPublicSignup !== false,
            icon: this.config.icon,
            iconSvg: this.config.iconSvg,
          });
        }
      }
    });

    this.elements.closeBtn.addEventListener('click', () => this.closeWindow());
    this.elements.newChatBtn.addEventListener('click', () => this.elements.confirmOverlay.classList.add('open'));
    this.elements.confirmCancelBtn.addEventListener('click', () => this.elements.confirmOverlay.classList.remove('open'));
    this.elements.confirmOkBtn.addEventListener('click', () => {
      this.elements.confirmOverlay.classList.remove('open');
      this.startNewChat();
    });

    if (this.elements.inputEl && this.elements.sendBtn) {
      this.updateSendButtonState();

      this.elements.inputEl.addEventListener('input', () => this.updateSendButtonState());
      this.elements.inputEl.addEventListener('keyup', () => this.updateSendButtonState());
      this.elements.inputEl.addEventListener('change', () => this.updateSendButtonState());

      this.elements.sendBtn.addEventListener('click', () => {
        if (this.inFlightController) {
          this.inFlightController.abort();
        } else if (this.elements.inputEl?.value.trim()) {
          void this.handleSend();
        }
      });
      this.elements.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (!this.inFlightController && this.elements.inputEl?.value.trim()) {
            void this.handleSend();
          }
        } else if (e.key === 'ArrowUp') {
          const isAtStart = this.elements.inputEl?.selectionStart === 0 && this.elements.inputEl?.selectionEnd === 0;
          const isEmpty = !this.elements.inputEl?.value;
          if (isEmpty || isAtStart || this.historyIndex !== -1) {
            e.preventDefault();
            this.recallPreviousMessage();
          }
        } else if (e.key === 'ArrowDown') {
          if (this.historyIndex !== -1) {
            e.preventDefault();
            this.recallNextMessage();
          }
        }
      });
    }

    if (this.elements.voiceTypeBtn) {
      this.elements.voiceTypeBtn.addEventListener('click', () => this.toggleVoiceTyping());
    }

    this.voice = new VoiceChat({
      getConfig: () => this.config,
      getSessionId: () => this.sessionId,
      elements: this.elements,
      apiService: this.apiService,
      audioService: this.audioService,
      onBotReplied: () => this.markUnreadIfClosed(),
      stopDictation: () => {
        if (this.isVoiceTyping) this.stopVoiceTyping();
      },
    });
    this.voice.setup();
  }

  private toggleVoiceTyping(): void {
    if (this.isVoiceTyping) {
      this.stopVoiceTyping();
      return;
    }
    if (!this.elements.inputEl) return;
    this.voiceTypeInitialText = this.elements.inputEl.value.trim() ? this.elements.inputEl.value.trim() + ' ' : '';
    const started = this.audioService.startDictation(
      (transcript) => {
        if (this.elements.inputEl) {
          this.elements.inputEl.value = this.voiceTypeInitialText + transcript;
          this.updateSendButtonState();
        }
      },
      (listening) => {
        this.isVoiceTyping = listening;
        this.elements.voiceTypeBtn?.classList.toggle('is-listening', listening);
        this.elements.voiceTypeBtn?.setAttribute(
          'aria-label',
          listening ? 'Stop Voice Typing' : 'Voice Typing (Dictation)',
        );
      },
    );
    if (!started) {
      this.isVoiceTyping = false;
      this.elements.voiceTypeBtn?.classList.remove('is-listening');
      WidgetDomRenderer.addErrorMessage(
        this.elements.messagesEl,
        'Voice typing is not supported in this browser or microphone permission was denied.',
      );
    }
  }

  private stopVoiceTyping(): void {
    this.audioService.stopDictation();
    this.isVoiceTyping = false;
    this.elements.voiceTypeBtn?.classList.remove('is-listening');
    this.elements.voiceTypeBtn?.setAttribute('aria-label', 'Voice Typing (Dictation)');
  }

  private recallPreviousMessage(): void {
    if (this.userHistory.length === 0 || !this.elements.inputEl) return;
    if (this.historyIndex === -1) {
      this.historyIndex = this.userHistory.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    }
    this.elements.inputEl.value = this.userHistory[this.historyIndex] ?? '';
    this.elements.inputEl.focus();
    const len = this.elements.inputEl.value.length;
    this.elements.inputEl.setSelectionRange(len, len);
    this.updateSendButtonState();
  }

  private recallNextMessage(): void {
    if (this.historyIndex === -1 || !this.elements.inputEl) return;
    if (this.historyIndex < this.userHistory.length - 1) {
      this.historyIndex++;
      this.elements.inputEl.value = this.userHistory[this.historyIndex] ?? '';
    } else {
      this.historyIndex = -1;
      this.elements.inputEl.value = '';
    }
    this.elements.inputEl.focus();
    const len = this.elements.inputEl.value.length;
    this.elements.inputEl.setSelectionRange(len, len);
    this.updateSendButtonState();
  }

  private updateSendButtonState(): void {
    if (!this.elements.sendBtn) return;
    if (this.inFlightController) {
      this.elements.sendBtn.innerHTML = STOP_SVG;
      this.elements.sendBtn.setAttribute('aria-label', 'Stop');
      this.elements.sendBtn.classList.add('is-stop');
      this.elements.sendBtn.disabled = false;
    } else {
      this.elements.sendBtn.innerHTML = SEND_SVG;
      this.elements.sendBtn.setAttribute('aria-label', 'Send');
      this.elements.sendBtn.classList.remove('is-stop');
      const hasText = Boolean(this.elements.inputEl?.value.trim());
      this.elements.sendBtn.disabled = !hasText;
    }
  }

  private renderQuickReplies(): void {
    if (!this.config.enabled || !this.elements.inputEl) return;
    WidgetDomRenderer.renderQuickReplies(
      this.elements.messagesEl,
      this.config.quickReplies,
      (msg) => {
        if (this.elements.inputEl) {
          this.elements.inputEl.value = msg;
          this.updateSendButtonState();
        }
        void this.handleSend();
      },
    );
  }

  private sanitizeErrorMessage(msg: string): string {
    if (!msg) return 'Please try again after some time. The service is currently not available.';
    if (
      /GoogleGenerativeAI|generativelanguage|googleapis|openai|anthropic|sarvam|fetch failed|404|500|502|503|504|ETIMEDOUT|ECONNREFUSED|\[.*Error\]|models\//i.test(
        msg,
      )
    ) {
      return 'Please try again after some time. The service is currently not available.';
    }
    return msg;
  }

  private async loadConversation(): Promise<void> {
    this.elements.messagesEl.innerHTML = '';
    const history = await this.apiService.fetchHistory(this.sessionId);
    if (history.length === 0) {
      this.greeted = false;
      this.userHistory = [];
      this.historyIndex = -1;
      return;
    }
    for (const m of history) {
      if (m.role === 'assistant' && m.content.startsWith('[error]')) {
        const cleanErr = this.sanitizeErrorMessage(m.content.slice(7).trim());
        WidgetDomRenderer.addErrorMessage(this.elements.messagesEl, cleanErr);
      } else {
        WidgetDomRenderer.addMessage(
          this.elements.messagesEl,
          m.content,
          m.role === 'user' ? 'user' : 'bot',
          this.config.icon,
          this.config.iconSvg,
          m.answerSource,
          m.createdAt,
        );
      }
    }
    this.userHistory = history.filter((m) => m.role === 'user').map((m) => m.content);
    this.historyIndex = -1;
    this.greeted = true;
  }

  public startNewChat(): void {
    this.stopVoiceTyping();
    this.inFlightController?.abort();
    this.inFlightController = null;
    this.sessionId = this.storageService.newSessionId();
    this.elements.messagesEl.innerHTML = '';
    this.greeted = false;
    this.userHistory = [];
    this.historyIndex = -1;
    WidgetDomRenderer.addMessage(this.elements.messagesEl, this.config.greeting, 'bot', this.config.icon, this.config.iconSvg);
    this.greeted = true;
    this.renderQuickReplies();
    if (this.config.requireLogin && !this.visitorAuth.isAuthenticated && (this.config.freeQuestionsBeforeAuth ?? 0) === 0) {
      WidgetDomRenderer.addAuthGatePrompt(this.elements.messagesEl, {
        title: this.config.loginPromptTitle,
        message: this.config.loginPromptMessage,
        signupUrl: this.config.signupUrl,
        loginUrl: this.config.loginUrl,
        allowPublicSignup: this.config.allowPublicSignup !== false,
        icon: this.config.icon,
        iconSvg: this.config.iconSvg,
      });
    }
    this.storageService.clearNoteDismissal();
    this.setupNoteBanner();
    this.updateSendButtonState();
  }

  private trapFocus = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.closeWindow();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(
      this.elements.window.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  private markUnreadIfClosed(): void {
    if (this.elements.window.classList.contains('open')) return;
    this.unreadCount++;
    setUnreadBadge(this.elements.bubble, this.unreadCount);
  }

  private clearUnread(): void {
    this.unreadCount = 0;
    setUnreadBadge(this.elements.bubble, 0);
  }

  private closeWindow(): void {
    this.elements.window.classList.remove('open');
    this.elements.bubble.classList.remove('mcb-window-open');
    this.elements.window.removeEventListener('keydown', this.trapFocus);
    this.elements.bubble.focus();
  }

  private async handleSend(): Promise<void> {
    if (!this.config.enabled || !this.elements.inputEl) return;
    this.stopVoiceTyping();
    const text = this.elements.inputEl.value.trim();
    if (!text) return;
    this.elements.inputEl.value = '';
    this.updateSendButtonState();
    await this.send(text);
  }

  private async send(text: string, bypassCache = false): Promise<void> {
    if (!this.config.enabled || !this.elements.inputEl || !this.elements.sendBtn || !text.trim()) return;
    this.elements.messagesEl.querySelector('.mcb-quick-replies')?.remove();

    const trimmed = text.trim();
    if (trimmed && (this.userHistory.length === 0 || this.userHistory[this.userHistory.length - 1] !== trimmed)) {
      this.userHistory.push(trimmed);
    }
    this.historyIndex = -1;

    WidgetDomRenderer.addMessage(this.elements.messagesEl, text, 'user');
    const typing = WidgetDomRenderer.createTypingRow('Typing…', this.config.icon, this.config.iconSvg);
    this.elements.messagesEl.appendChild(typing.row);
    this.elements.messagesEl.scrollTop = this.elements.messagesEl.scrollHeight;

    this.inFlightController = new AbortController();
    this.updateSendButtonState();

    try {
      const { answer, source } = await this.apiService.sendMessage(this.sessionId, text, this.inFlightController.signal, bypassCache);
      typing.remove();
      WidgetDomRenderer.addMessage(this.elements.messagesEl, answer, 'bot', this.config.icon, this.config.iconSvg, source);
      this.markUnreadIfClosed();
    } catch (err: any) {
      typing.remove();
      if (err?.isLoginRequired) {
        WidgetDomRenderer.addAuthGatePrompt(this.elements.messagesEl, {
          title: err.title,
          message: err.message,
          signupUrl: err.signupUrl,
          loginUrl: err.loginUrl,
          allowPublicSignup: this.config.allowPublicSignup !== false,
          icon: this.config.icon,
          iconSvg: this.config.iconSvg,
        });
      } else {
        const isUserStop = err?.name === 'AbortError' && err.message !== 'Timed out';
        if (isUserStop) {
          WidgetDomRenderer.addStoppedMessage(this.elements.messagesEl, 'Response stopped by user', this.config.icon, this.config.iconSvg);
        } else {
          const rawMessage = err.message === 'Timed out' ? "That's taking longer than expected. Please try again." : err.message ?? 'Something went wrong. Please try again.';
          const message = this.sanitizeErrorMessage(rawMessage);
          WidgetDomRenderer.addErrorMessage(this.elements.messagesEl, message, () => void this.send(text, bypassCache));
          this.markUnreadIfClosed();
        }
      }
    } finally {
      this.inFlightController = null;
      this.updateSendButtonState();
    }
  }
}
