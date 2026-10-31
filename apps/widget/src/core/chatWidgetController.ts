import type { WidgetConfig, WidgetInitOptions } from '../types/widget.types';
import { WidgetStorageService } from '../services/widgetStorage';
import { WidgetApiService } from '../services/widgetApi';
import { WidgetAudioService } from '../services/widgetAudio';
import { WidgetDomRenderer, type WidgetDomElements, renderHtml, setBubbleIcon, setUnreadBadge, renderAvatarHtml } from '../ui/widgetDom';
import { computeWaveBarStyle, IDLE_WAVE_BAR_STYLE } from '../ui/dictationWave';
import { SEND_SVG, STOP_SVG, EXPAND_SVG, COLLAPSE_SVG, VOLUME_SVG, VOLUME_MUTE_SVG, MIC_SVG, MIC_OFF_SVG, MIC_LARGE_SVG, REFRESH_SVG } from '../ui/widgetIcons';
import widgetCss from '../widget.css?inline';
import { VisitorAuth } from './visitorAuth';
import { VoiceChat } from './voiceChat';

// Single code-level switch for the whole "preload the offline voice model in the background as
// soon as the mic icon is enabled" behavior — no UI control for it. Flip to false to make mic
// enablement purely visual again (the model then only ever loads lazily, on first actual mic tap).
const PRELOAD_VOICE_MODEL_ON_MIC_ENABLE = true;

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
  // The generic confirm dialog (see showConfirm) is a single shared overlay reused for different
  // prompts (new chat, voice model notice, …) — these hold whichever callbacks the dialog is
  // currently showing, set right before opening it and cleared the instant it closes.
  private confirmOnOk: (() => void) | null = null;
  private confirmOnCancel: (() => void) | null = null;
  private isVoiceTyping = false;
  private voiceTypeInitialText = '';
  private micHintTimer: ReturnType<typeof setTimeout> | null = null;
  // Tracks the Whisper model-loading phase (see TranscriptionCallbacks.onLoading) so the UI can
  // show a "loading voice recognition" state instead of looking stuck during the first-use download.
  private voiceTypeLoading = false;
  // Distinguishes an intentional user stop/cancel from the provider giving up on its own (load
  // timeout, load error) — only the latter should surface an error message to the visitor.
  private voiceTypeStoppedByUser = false;
  private voiceTypeReachedListening = false;
  private scrollArrowTimer: ReturnType<typeof setTimeout> | null = null;
  private dictationWaveBars: HTMLSpanElement[] = [];
  private searchMatches: HTMLElement[] = [];
  private searchMatchIndex = -1;

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
    this.setupMobileKeyboardFix();
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

    // Re-measure now that the textarea is actually connected to the document — calling this
    // earlier (inside setupEventListeners, before the DOM append above) reads scrollHeight on a
    // disconnected element, which browsers report unreliably (often far too small).
    this.autoGrowInput();

    if (this.storageService.isWidgetOpen()) {
      void this.openWindow();
    }
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
          <span class="mcb-proactive-text">${renderHtml(this.config.proactiveMessage)}</span>
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
      if (this.elements.window.classList.contains('open')) {
        this.closeWindow();
      } else {
        await this.openWindow();
      }
    });

    this.elements.closeBtn.addEventListener('click', () => this.closeWindow());
    this.elements.newChatBtn.addEventListener('click', () => {
      this.closeMoreMenu();
      this.showConfirm({
        title: 'Start a new chat?',
        body: 'This clears your current conversation.',
        okLabel: 'Start new chat',
        cancelLabel: 'Keep chatting',
        onConfirm: () => this.startNewChat(),
      });
    });
    this.elements.confirmCancelBtn.addEventListener('click', () => {
      this.elements.confirmOverlay.classList.remove('open');
      const onCancel = this.confirmOnCancel;
      this.confirmOnOk = null;
      this.confirmOnCancel = null;
      onCancel?.();
    });
    this.elements.confirmOkBtn.addEventListener('click', () => {
      this.elements.confirmOverlay.classList.remove('open');
      const onOk = this.confirmOnOk;
      this.confirmOnOk = null;
      this.confirmOnCancel = null;
      onOk?.();
    });

    this.setupScrollToBottom();
    this.setupSearch();
    this.setupMoreMenu();

    this.elements.expandBtn.addEventListener('click', () => this.toggleExpand());

    if (this.elements.inputEl && this.elements.sendBtn) {
      this.updateSendButtonState();

      this.elements.inputEl.addEventListener('input', () => {
        this.updateSendButtonState();
        this.autoGrowInput();
      });
      this.elements.inputEl.addEventListener('keyup', () => this.updateSendButtonState());
      this.elements.inputEl.addEventListener('change', () => this.updateSendButtonState());

      this.elements.sendBtn.addEventListener('click', () => {
        if (this.inFlightController) {
          this.inFlightController.abort();
        } else if (this.elements.inputEl?.value.trim()) {
          void this.handleSend();
        }
      });
      // Enter sends (Shift+Enter inserts a new line) — the common chat-app convention. ArrowUp/Down
      // at the very start/while already recalling still cycle through sent-message history.
      this.elements.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
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
    this.elements.dictationStopBtn?.addEventListener('click', () => this.stopVoiceTyping());
    this.elements.dictationCancelBtn?.addEventListener('click', () => this.cancelVoiceTyping());

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
    this.hideMicHint();
    // A click while the model is still loading cancels the attempt, same as clicking it mid-recording.
    if (this.isVoiceTyping || this.voiceTypeLoading) {
      this.stopVoiceTyping();
      return;
    }
    if (!this.elements.inputEl) return;

    // One-time notice before the (possibly large, first-use-only) voice model ever downloads —
    // shown once per browser, not again after the visitor confirms it.
    if (!this.storageService.hasSeenVoiceModelNotice()) {
      this.showConfirm({
        icon: MIC_LARGE_SVG,
        title: 'Enable voice typing?',
        body: 'This downloads a small voice model the first time — a one-time thing, then it just works.',
        okLabel: 'Continue',
        cancelLabel: 'Not now',
        onConfirm: () => {
          this.storageService.setVoiceModelNoticeSeen();
          this.beginVoiceTyping();
        },
      });
      return;
    }
    this.beginVoiceTyping();
  }

  private beginVoiceTyping(): void {
    if (!this.elements.inputEl) return;
    this.voiceTypeInitialText = this.elements.inputEl.value.trim() ? this.elements.inputEl.value.trim() + ' ' : '';
    this.voiceTypeStoppedByUser = false;
    this.voiceTypeReachedListening = false;
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
        this.elements.dictationBar?.classList.toggle('open', listening);
        if (listening) {
          this.voiceTypeReachedListening = true;
        } else {
          this.resetDictationWave();
          this.elements.dictationBar?.classList.remove('analyzing');
          // The provider gave up on its own (load timeout/error) without the visitor ever
          // cancelling and without ever reaching a working mic — tell them, instead of the mic
          // button just quietly going back to normal with no explanation.
          if (!this.voiceTypeStoppedByUser && !this.voiceTypeReachedListening) {
            WidgetDomRenderer.addErrorMessage(
              this.elements.messagesEl,
              'Voice typing could not load. Please check your connection and try again.',
            );
          }
        }
      },
      (level) => this.updateDictationWave(level),
      (loading) => {
        this.voiceTypeLoading = loading;
        this.elements.dictationBar?.classList.toggle('loading', loading);
        if (loading) this.elements.dictationBar?.classList.add('open');
      },
      // Whisper processes each chunk of speech in the background while recording keeps running —
      // this pulses the wave to signal "thinking" instead of looking idle/stuck during that wait.
      (analyzing) => this.elements.dictationBar?.classList.toggle('analyzing', analyzing),
    );
    if (!started) {
      this.isVoiceTyping = false;
      this.voiceTypeLoading = false;
      this.elements.voiceTypeBtn?.classList.remove('is-listening');
      this.elements.dictationBar?.classList.remove('open', 'loading', 'analyzing');
      WidgetDomRenderer.addErrorMessage(
        this.elements.messagesEl,
        'Voice typing is not supported in this browser or microphone permission was denied.',
      );
    }
  }

  /** Scales each waveform bar by the live mic level (see WidgetAudioService.startDictationMeter) — bars
   *  only move while audio is actually being picked up, and settle back to flat once it's quiet.
   *  The height/opacity math itself lives in dictationWave.ts as a pure, unit-tested function. */
  private updateDictationWave(level: number): void {
    if (!this.dictationWaveBars.length) {
      // Scoped to .mcb-dictation-wave — the bar also has unrelated <span>s now (the loading spinner).
      this.dictationWaveBars = Array.from(this.elements.dictationBar?.querySelectorAll('.mcb-dictation-wave span') ?? []);
    }
    for (const bar of this.dictationWaveBars) {
      const factor = parseFloat(bar.dataset.f || '1');
      const { height, opacity } = computeWaveBarStyle(level, factor);
      bar.style.height = `${height.toFixed(1)}px`;
      bar.style.opacity = `${opacity.toFixed(2)}`;
    }
  }

  private resetDictationWave(): void {
    for (const bar of this.dictationWaveBars) {
      bar.style.height = `${IDLE_WAVE_BAR_STYLE.height}px`;
      bar.style.opacity = `${IDLE_WAVE_BAR_STYLE.opacity}`;
    }
  }

  private stopVoiceTyping(): void {
    this.voiceTypeStoppedByUser = true;
    this.audioService.stopDictation();
    this.isVoiceTyping = false;
    this.voiceTypeLoading = false;
    this.elements.voiceTypeBtn?.classList.remove('is-listening');
    this.elements.voiceTypeBtn?.setAttribute('aria-label', 'Voice Typing (Dictation)');
    this.resetDictationWave();
    this.elements.dictationBar?.classList.remove('open', 'loading', 'analyzing');
  }

  /** Stops dictation and discards whatever was transcribed, restoring the text that was in the input before it started. */
  private cancelVoiceTyping(): void {
    if (this.elements.inputEl) {
      this.elements.inputEl.value = this.voiceTypeInitialText.trim();
      this.updateSendButtonState();
    }
    this.stopVoiceTyping();
  }

  /** Shows a small "jump to latest" arrow ~1s after the visitor scrolls away from the bottom of the chat. */
  private setupScrollToBottom(): void {
    const container = this.elements.messagesEl;
    const btn = this.elements.scrollBottomBtn;

    const isNearBottom = () => container.scrollHeight - container.scrollTop - container.clientHeight < 40;

    container.addEventListener('scroll', () => {
      if (isNearBottom()) {
        if (this.scrollArrowTimer) {
          clearTimeout(this.scrollArrowTimer);
          this.scrollArrowTimer = null;
        }
        btn.classList.remove('visible');
        return;
      }
      if (this.scrollArrowTimer) return;
      this.scrollArrowTimer = setTimeout(() => {
        this.scrollArrowTimer = null;
        if (!isNearBottom()) btn.classList.add('visible');
      }, 1000);
    });

    btn.addEventListener('click', () => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      btn.classList.remove('visible');
    });
  }

  private setupSearch(): void {
    const { searchToggleBtn, searchBar, searchInput, searchCloseBtn, searchCount, searchPrevBtn, searchNextBtn } =
      this.elements;

    const closeSearch = () => {
      searchBar.classList.remove('open');
      searchInput.value = '';
      this.clearSearchHighlights();
      this.updateSearchCount();
    };

    const runSearch = () => {
      const query = searchInput.value.trim();
      this.highlightSearchMatches(query);
      if (query && this.searchMatches.length > 0) {
        this.goToSearchMatch(0);
      } else {
        this.updateSearchCount();
      }
    };

    searchToggleBtn.addEventListener('click', () => {
      this.closeMoreMenu();
      const isOpen = searchBar.classList.contains('open');
      if (isOpen) {
        closeSearch();
      } else {
        searchBar.classList.add('open');
        searchInput.focus();
      }
    });

    searchCloseBtn.addEventListener('click', closeSearch);
    searchNextBtn.addEventListener('click', () => this.goToSearchMatch(this.searchMatchIndex + 1));
    searchPrevBtn.addEventListener('click', () => this.goToSearchMatch(this.searchMatchIndex - 1));
    searchInput.addEventListener('input', runSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSearch();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.goToSearchMatch(this.searchMatchIndex - 1);
        } else {
          this.goToSearchMatch(this.searchMatchIndex + 1);
        }
      }
    });
  }

  private clearSearchHighlights(): void {
    this.elements.messagesEl.querySelectorAll('mark.mcb-search-highlight').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
      parent.normalize();
    });
    this.searchMatches = [];
    this.searchMatchIndex = -1;
  }

  /** Wraps every case-insensitive occurrence of `query` in the rendered message text with a <mark>,
   *  walking text nodes only so bot messages' markup (links, lists, etc.) is never disturbed. */
  private highlightSearchMatches(query: string): void {
    this.clearSearchHighlights();
    if (!query) return;
    const lowerQuery = query.toLowerCase();

    const msgEls = Array.from(this.elements.messagesEl.querySelectorAll<HTMLElement>('.mcb-msg'));
    for (const msgEl of msgEls) {
      const walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          node.parentElement?.closest('.mcb-time') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const textNodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) textNodes.push(node as Text);

      for (const textNode of textNodes) {
        const text = textNode.textContent ?? '';
        const lowerText = text.toLowerCase();
        if (!lowerText.includes(lowerQuery)) continue;

        const frag = document.createDocumentFragment();
        let cursor = 0;
        let idx: number;
        while ((idx = lowerText.indexOf(lowerQuery, cursor)) !== -1) {
          if (idx > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, idx)));
          const mark = document.createElement('mark');
          mark.className = 'mcb-search-highlight';
          mark.textContent = text.slice(idx, idx + query.length);
          frag.appendChild(mark);
          this.searchMatches.push(mark);
          cursor = idx + query.length;
        }
        if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
        textNode.parentNode?.replaceChild(frag, textNode);
      }
    }
  }

  private goToSearchMatch(index: number): void {
    if (this.searchMatches.length === 0) {
      this.updateSearchCount();
      return;
    }
    this.searchMatches[this.searchMatchIndex]?.classList.remove('current');
    this.searchMatchIndex = ((index % this.searchMatches.length) + this.searchMatches.length) % this.searchMatches.length;
    const mark = this.searchMatches[this.searchMatchIndex];
    mark.classList.add('current');
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.updateSearchCount();
  }

  private updateSearchCount(): void {
    const { searchCount, searchInput, searchPrevBtn, searchNextBtn } = this.elements;
    const hasQuery = searchInput.value.trim().length > 0;
    const total = this.searchMatches.length;
    searchCount.textContent = !hasQuery ? '' : total === 0 ? 'No matches' : `${this.searchMatchIndex + 1}/${total}`;
    searchPrevBtn.disabled = total === 0;
    searchNextBtn.disabled = total === 0;
  }

  private setupMoreMenu(): void {
    const { moreWrapper, moreBtn, moreDropdown, downloadTranscriptBtn, soundToggleBtn, micToggleBtn, settingsToggleBtn, settingsSubmenu } =
      this.elements;

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = moreDropdown.classList.contains('open');
      if (isOpen) {
        this.closeMoreMenu();
      } else {
        this.updateExpandAvailability();
        moreDropdown.classList.add('open');
        moreBtn.classList.add('active');
        moreBtn.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', (e) => {
      // composedPath(), not e.target — the sound/mic toggle handlers replace their icon's
      // innerHTML (to swap the on/off SVG), which detaches the original e.target from the DOM
      // before this bubbles up here. A detached node reads as "not contained" by moreWrapper even
      // though the click was genuinely inside it, which would otherwise close the menu that just
      // handled the click. composedPath() is fixed at dispatch time, immune to that mutation.
      if (!e.composedPath().includes(moreWrapper)) this.closeMoreMenu();
    });

    downloadTranscriptBtn.addEventListener('click', () => {
      this.closeMoreMenu();
      this.downloadTranscript();
    });

    settingsToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = settingsSubmenu.classList.toggle('open');
      settingsToggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    this.updateSoundToggleLabel();
    soundToggleBtn.addEventListener('click', () => {
      this.storageService.setSoundEnabled(!this.storageService.isSoundEnabled());
      this.updateSoundToggleLabel();
    });

    this.updateMicToggleLabel();
    this.applyMicVisibility();
    micToggleBtn.addEventListener('click', () => {
      const enabled = !this.storageService.isMicEnabled();
      this.storageService.setMicEnabled(enabled);
      this.updateMicToggleLabel();
      this.applyMicVisibility();
      if (enabled && PRELOAD_VOICE_MODEL_ON_MIC_ENABLE) {
        this.audioService.preloadDictationModel();
      } else {
        this.audioService.cancelDictationPreload();
      }
    });
    // Resume on reload/reopen so the benefit (an already-warm model) persists across visits,
    // instead of only ever kicking in right after the visitor flips the setting.
    if (this.storageService.isMicEnabled() && PRELOAD_VOICE_MODEL_ON_MIC_ENABLE) {
      this.audioService.preloadDictationModel();
    }

    window.addEventListener('resize', () => this.updateExpandAvailability());
    this.updateExpandAvailability();
  }

  /** The window's base/expanded sizes are both clamped by max-width/max-height in widget.css
   *  (see `.mcb-window` and `.mcb-window.expanded`) — on a short/narrow viewport (e.g. a browser
   *  with devtools open) both clamp to the same rendered size, so expanding would do nothing
   *  visible. Mirrors those same numbers to decide whether the menu item is worth offering. */
  private updateExpandAvailability(): void {
    if (this.elements.window.classList.contains('expanded')) {
      this.elements.expandBtn.style.display = '';
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const baseW = Math.min(410, vw - 32);
    const baseH = Math.min(610, vh - 140);
    const expandedW = Math.min(520, vw - 32);
    const expandedH = Math.min(760, vh - 94);
    const wouldHelp = expandedW - baseW > 4 || expandedH - baseH > 4;
    this.elements.expandBtn.style.display = wouldHelp ? '' : 'none';
  }

  /** On mobile, the chat window fills the screen via `position:fixed; inset:0` (see the max-width:640px
   *  block in widget.css). When the on-screen keyboard opens, mobile browsers shrink the *visual*
   *  viewport but the *layout* viewport (what `100vh`/`100dvh`/`inset:0` are computed against) can lag
   *  or stay the old size, and some browsers scroll the page to keep the focused field visible — both
   *  push the fixed header off the top of the actually-visible area. Pin the window to the real visual
   *  viewport instead so the header always stays put while typing. */
  private setupMobileKeyboardFix(): void {
    const vv = window.visualViewport;
    if (!vv) return;

    const isMobileLayout = () => window.innerWidth <= 640 && this.elements.window.classList.contains('open');

    const apply = () => {
      if (!isMobileLayout()) return;
      this.elements.window.style.setProperty('height', `${vv.height}px`, 'important');
      this.elements.window.style.setProperty('top', `${vv.offsetTop}px`, 'important');
    };

    const reset = () => {
      this.elements.window.style.removeProperty('height');
      this.elements.window.style.removeProperty('top');
    };

    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    this.elements.inputEl?.addEventListener('focus', () => setTimeout(apply, 50));
    this.elements.inputEl?.addEventListener('blur', () => {
      if (window.innerWidth <= 640) reset();
    });
  }

  private closeMoreMenu(): void {
    this.elements.moreDropdown.classList.remove('open');
    this.elements.moreBtn.classList.remove('active');
    this.elements.moreBtn.setAttribute('aria-expanded', 'false');
    this.elements.settingsSubmenu.classList.remove('open');
    this.elements.settingsToggleBtn.setAttribute('aria-expanded', 'false');
  }

  /** Opens the shared confirm overlay with the given content — see confirmOnOk/confirmOnCancel
   *  for how OK/Cancel route back to whichever caller is currently showing it. */
  private showConfirm(opts: {
    icon?: string;
    title: string;
    body: string;
    okLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }): void {
    const { confirmOverlay, confirmIconEl, confirmTitleEl, confirmBodyEl, confirmOkBtn, confirmCancelBtn } = this.elements;
    confirmIconEl.innerHTML = opts.icon ?? REFRESH_SVG;
    confirmTitleEl.textContent = opts.title;
    confirmBodyEl.textContent = opts.body;
    confirmOkBtn.textContent = opts.okLabel;
    confirmCancelBtn.textContent = opts.cancelLabel;
    this.confirmOnOk = opts.onConfirm;
    this.confirmOnCancel = opts.onCancel ?? null;
    confirmOverlay.classList.add('open');
  }

  private updateSoundToggleLabel(): void {
    const enabled = this.storageService.isSoundEnabled();
    const icon = this.elements.soundToggleBtn.querySelector('.mcb-sound-icon');
    const label = this.elements.soundToggleBtn.querySelector('.mcb-sound-label');
    const text = enabled ? 'Mute notifications' : 'Unmute notifications';
    if (icon) icon.innerHTML = enabled ? VOLUME_SVG : VOLUME_MUTE_SVG;
    if (label) label.textContent = text;
    // Icon-only in the settings row (see widget.css) — title/aria-label carry the meaning instead.
    this.elements.soundToggleBtn.setAttribute('title', text);
    this.elements.soundToggleBtn.setAttribute('aria-label', text);
    this.elements.soundToggleBtn.classList.toggle('mcb-settings-item-off', !enabled);
  }

  private playNotificationSound(kind: 'send' | 'reply'): void {
    if (this.storageService.isSoundEnabled()) {
      this.audioService.playNotificationSound(kind);
    }
  }

  private updateMicToggleLabel(): void {
    const enabled = this.storageService.isMicEnabled();
    const icon = this.elements.micToggleBtn.querySelector('.mcb-mic-toggle-icon');
    const label = this.elements.micToggleBtn.querySelector('.mcb-mic-toggle-label');
    const text = enabled ? 'Hide mic icon' : 'Show mic icon';
    if (icon) icon.innerHTML = enabled ? MIC_SVG : MIC_OFF_SVG;
    if (label) label.textContent = text;
    this.elements.micToggleBtn.setAttribute('title', text);
    this.elements.micToggleBtn.setAttribute('aria-label', text);
    this.elements.micToggleBtn.classList.toggle('mcb-settings-item-off', !enabled);
  }

  /** Hides the voice-typing mic button from the input row entirely when disabled via the menu —
   *  not just visually: a disabled mic icon shouldn't still be clickable/reachable in the chat.
   *  Uses setProperty(…, 'important') because .mcb-voice-type sets `display: flex !important`
   *  in widget.css, which a plain inline `style.display` can never override. */
  private applyMicVisibility(): void {
    const btn = this.elements.voiceTypeBtn;
    if (!btn) return;
    if (this.storageService.isMicEnabled()) {
      btn.style.removeProperty('display');
      this.showMicHintIfNeeded();
    } else {
      btn.style.setProperty('display', 'none', 'important');
      this.hideMicHint();
    }
  }

  /** One-time "Tap to start voice typing" tooltip the first time the mic icon ever becomes
   *  visible — enabling it in Settings only shows the button, it doesn't start listening, which
   *  visitors have found confusing (see chat history). Auto-hides after a few seconds either way,
   *  and never shows again once it's been shown once. */
  private showMicHintIfNeeded(): void {
    const hint = this.elements.micHintEl;
    if (!hint || this.storageService.hasSeenMicHint()) return;
    this.storageService.setMicHintSeen();
    hint.classList.add('open');
    this.micHintTimer = setTimeout(() => this.hideMicHint(), 6000);
  }

  private hideMicHint(): void {
    if (this.micHintTimer !== null) {
      clearTimeout(this.micHintTimer);
      this.micHintTimer = null;
    }
    this.elements.micHintEl?.classList.remove('open');
  }

  private toggleExpand(): void {
    this.closeMoreMenu();
    const isExpanded = this.elements.window.classList.toggle('expanded');
    const icon = this.elements.expandBtn.querySelector('.mcb-expand-icon');
    const label = this.elements.expandBtn.querySelector('.mcb-expand-label');
    if (icon) icon.innerHTML = isExpanded ? COLLAPSE_SVG : EXPAND_SVG;
    if (label) label.textContent = isExpanded ? 'Collapse window' : 'Expand window';
    this.elements.expandBtn.setAttribute('aria-label', isExpanded ? 'Collapse window' : 'Expand window');
    this.elements.expandBtn.setAttribute('title', isExpanded ? 'Collapse window' : 'Expand window');
  }

  private downloadTranscript(): void {
    const rows = Array.from(this.elements.messagesEl.querySelectorAll<HTMLDivElement>('.mcb-row'));
    const lines = rows
      .map((row) => {
        const msgEl = row.querySelector('.mcb-msg');
        if (!msgEl) return '';
        const clone = msgEl.cloneNode(true) as HTMLElement;
        clone.querySelector('.mcb-time')?.remove();
        const text = clone.textContent?.trim() ?? '';
        if (!text) return '';
        const speaker = row.classList.contains('user') ? 'You' : this.config.title || 'Bot';
        return `${speaker}: ${text}`;
      })
      .filter(Boolean);

    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
    const wantStop = Boolean(this.inFlightController);
    // Only touch the button's DOM when the icon actually needs to change. This runs on every
    // keystroke (and on blur/change, which fires mid-gesture when a real mouse click on this very
    // button first blurs the textarea) — rewriting innerHTML every time destroys and recreates the
    // SVG node the browser is tracking for click synthesis, silently swallowing the click.
    if (wantStop !== this.elements.sendBtn.classList.contains('is-stop')) {
      this.elements.sendBtn.innerHTML = wantStop ? STOP_SVG : SEND_SVG;
      this.elements.sendBtn.setAttribute('aria-label', wantStop ? 'Stop' : 'Send');
      this.elements.sendBtn.classList.toggle('is-stop', wantStop);
    }
    if (wantStop) {
      this.elements.sendBtn.disabled = false;
    } else {
      const hasText = Boolean(this.elements.inputEl?.value.trim());
      this.elements.sendBtn.disabled = !hasText;
    }
    this.autoGrowInput();
  }

  /** Grows the textarea with its content up to the ~3-line cap set by max-height in widget.css,
   *  then lets it scroll internally. Covers every place the input's value changes programmatically
   *  (history recall, dictation, quick replies, clearing after send) since they all funnel through
   *  updateSendButtonState(). */
  private autoGrowInput(): void {
    const el = this.elements.inputEl;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
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

  /** Opens the chat window — shared by the bubble click and by auto-reopening on page load
   *  (see `initialize()`) when the visitor left it open and navigated to another page via a link. */
  private async openWindow(): Promise<void> {
    this.elements.window.classList.add('open');
    this.elements.bubble.classList.add('mcb-window-open');
    this.storageService.setWidgetOpen(true);
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
  }

  private closeWindow(): void {
    this.elements.window.classList.remove('open');
    this.elements.bubble.classList.remove('mcb-window-open');
    this.elements.window.removeEventListener('keydown', this.trapFocus);
    this.elements.bubble.focus();
    this.storageService.setWidgetOpen(false);
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
    this.playNotificationSound('send');
    const typing = WidgetDomRenderer.createTypingRow('Typing…', this.config.icon, this.config.iconSvg);
    this.elements.messagesEl.appendChild(typing.row);
    this.elements.messagesEl.scrollTop = this.elements.messagesEl.scrollHeight;

    this.inFlightController = new AbortController();
    this.updateSendButtonState();

    try {
      const { answer, source } = await this.apiService.sendMessage(this.sessionId, text, this.inFlightController.signal, bypassCache);
      typing.remove();
      WidgetDomRenderer.addMessage(this.elements.messagesEl, answer, 'bot', this.config.icon, this.config.iconSvg, source);
      this.playNotificationSound('reply');
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
