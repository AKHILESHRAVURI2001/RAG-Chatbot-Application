import type { WidgetConfig } from '../types/widget.types';
import type { WidgetApiService } from '../services/widgetApi';
import type { WidgetAudioService } from '../services/widgetAudio';
import { WidgetDomRenderer, escapeHtml, type WidgetDomElements } from '../ui/widgetDom';
import { formatChatMarkdown } from '../shared';

/** What the voice feature needs from the widget. The two callbacks are the only ways it reaches back into the chat. */
export interface VoiceChatHost {
  getConfig(): WidgetConfig;
  getSessionId(): string;
  elements: WidgetDomElements;
  apiService: WidgetApiService;
  audioService: WidgetAudioService;
  /** Called after a spoken reply is shown, so the chat can mark it unread if the window is closed. */
  onBotReplied(): void;
  /** Called before a voice conversation starts, so any dictation into the text box is switched off first. */
  stopDictation(): void;
}

/**
 * The hands-free voice conversation: listening, sending the recording, playing the spoken reply, letting the
 * visitor interrupt (barge-in) and carrying on until they press back. Typed chat doesn't depend on any of this.
 */
export class VoiceChat {
  private continuousMode = false;
  private voiceCancelled = false;
  private voiceSessionCancelled = false;
  private recordedChunks: Blob[] = [];
  private lastVoiceCaption = '';
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private isBotSpeaking = false;

  constructor(private readonly host: VoiceChatHost) {}

  private get config(): WidgetConfig {
    return this.host.getConfig();
  }
  private get sessionId(): string {
    return this.host.getSessionId();
  }
  private get elements(): WidgetDomElements {
    return this.host.elements;
  }
  private get apiService(): WidgetApiService {
    return this.host.apiService;
  }
  private get audioService(): WidgetAudioService {
    return this.host.audioService;
  }

  /** Wires up the voice buttons. */
  public setup(): void {
    if (this.elements.voiceAgentBtn) {
      this.elements.voiceAgentBtn.addEventListener('click', () => {
        this.host.stopDictation();
        this.continuousMode = true;
        void this.startRecording();
      });
    }

    this.elements.voiceStopBtn?.addEventListener('click', () => {
      if (this.isBotSpeaking) {
        this.isBotSpeaking = false;
        this.audioService.cleanup();
        if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Listening…';
        if (this.elements.voiceStopBtn) this.elements.voiceStopBtn.textContent = 'Stop speaking & send';
        if (this.continuousMode) void this.startRecording();
      } else {
        this.stopRecording();
      }
    });
    this.elements.voiceBackBtn?.addEventListener('click', () => this.cancelRecording());
  }

  /** Stops any pending restart; call when the widget is removed. */
  public destroy(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
  }

  private async startRecording(): Promise<void> {
    if (!this.config.enabled) return;
    this.audioService.cleanup();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    try {
      this.recordedChunks = [];
      this.voiceCancelled = false;
      this.voiceSessionCancelled = false;
      this.lastVoiceCaption = '';

      await this.audioService.startRecording(
        (chunk) => this.recordedChunks.push(chunk),
        {
          onVolumeChange: (level, quiet) => {
            if (this.elements.voiceRingInner) {
              this.elements.voiceRingInner.style.transform = `scale(${1 + level * 0.7})`;
            }
            this.elements.voiceOverlay?.classList.toggle('mcb-voice-quiet', quiet);
            if (this.elements.voiceStatusEl) {
              this.elements.voiceStatusEl.textContent = quiet ? "Can't hear you — try moving closer to the mic" : 'Listening…';
            }
          },
          onSilenceAutoSubmit: () => {
            this.stopRecording();
          },
          onCaptionChange: (caption) => {
            this.lastVoiceCaption = caption;
            if (this.elements.voiceCaptionEl) this.elements.voiceCaptionEl.textContent = caption;
          },
        },
      );

      this.isBotSpeaking = false;
      this.elements.voiceAgentBtn?.classList.remove('continuous-armed');
      this.elements.voiceAgentBtn?.classList.add('recording');
      this.elements.voiceAgentBtn?.setAttribute('aria-label', this.continuousMode ? 'Stop conversation' : 'Stop recording');
      if (this.elements.voiceCaptionEl) this.elements.voiceCaptionEl.textContent = '';
      if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Listening…';
      if (this.elements.voiceStopBtn) this.elements.voiceStopBtn.textContent = 'Stop speaking & send';
      this.elements.voiceOverlay?.classList.add('open');
    } catch {
      this.continuousMode = false;
      this.isBotSpeaking = false;
      this.elements.voiceAgentBtn?.classList.remove('continuous-armed', 'recording');
      WidgetDomRenderer.addErrorMessage(
        this.elements.messagesEl,
        "Couldn't access your microphone — check your browser's microphone permission for this site.",
        () => void this.startRecording(),
      );
    }
  }

  private stopRecording(): void {
    this.isBotSpeaking = false;
    this.elements.voiceAgentBtn?.classList.remove('recording');
    this.elements.voiceAgentBtn?.setAttribute('aria-label', 'Voice Agent (Live voice conversation)');
    this.elements.voiceRingInner?.style.removeProperty('transform');

    if (this.voiceCancelled) {
      this.audioService.stopRecording();
      this.voiceCancelled = false;
      this.elements.voiceOverlay?.classList.remove('open', 'mcb-voice-quiet', 'mcb-voice-processing');
      return;
    }

    this.elements.voiceOverlay?.classList.remove('mcb-voice-quiet');
    this.elements.voiceOverlay?.classList.add('mcb-voice-processing');
    if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Thinking…';
    if (this.elements.voiceCaptionEl) this.elements.voiceCaptionEl.textContent = '';
    if (this.elements.voiceStopBtn) this.elements.voiceStopBtn.textContent = 'Thinking…';

    // The recorder's last chunk only lands via its "stop" event, fired
    // asynchronously after .stop() — wait for it before reading recordedChunks,
    // otherwise the final (and on a short recording, only) chunk is missed.
    this.audioService.stopRecording(() => {
      if (this.recordedChunks.length > 0) {
        void this.sendVoice(new Blob(this.recordedChunks, { type: 'audio/webm' }));
        return;
      }
      this.elements.voiceOverlay?.classList.remove('mcb-voice-processing');
      if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Listening…';
      if (this.elements.voiceStopBtn) this.elements.voiceStopBtn.textContent = 'Stop speaking & send';
      void this.startRecording();
    });
  }

  private cancelRecording(): void {
    this.isBotSpeaking = false;
    this.voiceCancelled = true;
    this.voiceSessionCancelled = true;
    this.continuousMode = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.elements.voiceAgentBtn?.classList.remove('continuous-armed');
    this.audioService.cleanup();
    this.elements.voiceOverlay?.classList.remove('open', 'mcb-voice-quiet');
    this.stopRecording();
  }

  private continueListeningAfter(audioEl?: HTMLAudioElement): void {
    if (!this.continuousMode) return;
    this.isBotSpeaking = false;
    this.elements.voiceAgentBtn?.classList.add('continuous-armed');
    this.elements.voiceAgentBtn?.setAttribute('aria-label', 'Stop conversation');
    const restart = () => {
      this.restartTimer = null;
      this.audioService.stopBargeIn();
      if (this.continuousMode) void this.startRecording();
    };

    if (audioEl) {
      void this.audioService.listenForBargeIn(() => {
        audioEl.pause();
        restart();
      });
    } else {
      this.restartTimer = setTimeout(restart, 700);
    }
  }

  private async sendVoice(audioBlob: Blob): Promise<void> {
    if (!this.config.enabled) return;
    this.elements.messagesEl.querySelector('.mcb-quick-replies')?.remove();
    const typing = WidgetDomRenderer.createTypingRow('Transcribing…', this.config.icon, this.config.iconSvg);
    this.elements.messagesEl.appendChild(typing.row);
    this.elements.messagesEl.scrollTop = this.elements.messagesEl.scrollHeight;

    try {
      const { transcript, answer, source, audio } = await this.apiService.sendVoiceMessage(this.sessionId, audioBlob);
      this.elements.voiceOverlay?.classList.remove('mcb-voice-processing');
      typing.remove();
      WidgetDomRenderer.addMessage(this.elements.messagesEl, transcript, 'user');
      WidgetDomRenderer.addMessage(this.elements.messagesEl, answer, 'bot', this.config.icon, this.config.iconSvg, source);
      this.host.onBotReplied();
      if (this.elements.voiceCaptionEl) {
        this.elements.voiceCaptionEl.innerHTML = `
          <div class="mcb-voice-caption-transcript">"${escapeHtml(transcript)}"</div>
          <div class="mcb-voice-caption-answer">${formatChatMarkdown(answer)}</div>
        `;
      }

      if (this.voiceSessionCancelled) {
        return;
      }

      if (audio) {
        this.isBotSpeaking = true;
        if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Speaking…';
        if (this.elements.voiceStopBtn) this.elements.voiceStopBtn.textContent = 'Stop speaking';
        this.audioService.playAudio(
          audio,
          () => {
            this.isBotSpeaking = false;
            if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Listening…';
            if (this.elements.voiceStopBtn) this.elements.voiceStopBtn.textContent = 'Stop speaking & send';
            this.continueListeningAfter();
          },
          () => {
            this.isBotSpeaking = false;
            if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Listening…';
            if (this.elements.voiceStopBtn) this.elements.voiceStopBtn.textContent = 'Stop speaking & send';
            this.continueListeningAfter();
          },
        );
      } else {
        this.isBotSpeaking = false;
        if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Listening…';
        if (this.elements.voiceStopBtn) this.elements.voiceStopBtn.textContent = 'Stop speaking & send';
        this.continueListeningAfter();
      }
    } catch (err: any) {
      this.elements.voiceOverlay?.classList.remove('mcb-voice-processing');
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
        if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Account required';
        if (this.elements.voiceCaptionEl) this.elements.voiceCaptionEl.textContent = err.message || 'Please sign up or log in to continue.';
      } else {
        const message = err.message ?? "Sorry, I couldn't process that. Please try again.";
        if (this.continuousMode && /couldn.t understand/i.test(message)) {
          if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'Listening…';
          this.continueListeningAfter();
        } else {
          WidgetDomRenderer.addErrorMessage(this.elements.messagesEl, message, () => void this.startRecording());
          if (this.elements.voiceStatusEl) this.elements.voiceStatusEl.textContent = 'One moment…';
          if (this.elements.voiceCaptionEl) this.elements.voiceCaptionEl.textContent = message;
          this.continueListeningAfter();
        }
      }
    }
  }
}
