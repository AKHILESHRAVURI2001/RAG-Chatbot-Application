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

/** Short fingerprint of a string (not for security — just change detection), so "was this message
 *  already dismissed" doesn't require storing the full message text in localStorage. */
function fingerprint(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export class WidgetStorageService {
  private readonly SESSION_KEY = 'mcb_session_id';
  private readonly NOTE_DISMISSED_KEY = 'mcb_note_dismissed';
  private readonly PROACTIVE_DISMISSED_KEY = 'mcb_proactive_dismissed';

  public getSessionId(): string {
    let id = localStorage.getItem(this.SESSION_KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(this.SESSION_KEY, id);
    }
    return id;
  }

  public newSessionId(): string {
    const id = generateUuid();
    localStorage.setItem(this.SESSION_KEY, id);
    return id;
  }

  public isNoteDismissed(note: string): boolean {
    try {
      return localStorage.getItem(this.NOTE_DISMISSED_KEY) === fingerprint(note);
    } catch {
      return false;
    }
  }

  public dismissNote(note: string): void {
    try {
      localStorage.setItem(this.NOTE_DISMISSED_KEY, fingerprint(note));
    } catch {
      /* ignore */
    }
  }

  public clearNoteDismissal(): void {
    try {
      localStorage.removeItem(this.NOTE_DISMISSED_KEY);
    } catch {
      /* ignore */
    }
  }

  public isProactiveDismissed(message: string): boolean {
    try {
      return localStorage.getItem(this.PROACTIVE_DISMISSED_KEY) === fingerprint(message);
    } catch {
      return false;
    }
  }

  public dismissProactive(message: string): void {
    try {
      localStorage.setItem(this.PROACTIVE_DISMISSED_KEY, fingerprint(message));
    } catch {
      /* ignore */
    }
  }

  private readonly VISITOR_TOKEN_KEY = 'mcb_visitor_token';
  private readonly VISITOR_USER_KEY = 'mcb_visitor_user';

  public getVisitorToken(): string | null {
    try {
      return localStorage.getItem(this.VISITOR_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  public setVisitorToken(token: string): void {
    try {
      localStorage.setItem(this.VISITOR_TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  }

  public clearVisitorToken(): void {
    try {
      localStorage.removeItem(this.VISITOR_TOKEN_KEY);
      localStorage.removeItem(this.VISITOR_USER_KEY);
    } catch {
      /* ignore */
    }
  }

  public getVisitorUser(): { id: string; name: string; email: string } | null {
    try {
      const raw = localStorage.getItem(this.VISITOR_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public setVisitorUser(user: { id: string; name: string; email: string }): void {
    try {
      localStorage.setItem(this.VISITOR_USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  }

  private readonly WIDGET_OPEN_KEY = 'mcb_widget_open';

  /** Whether the chat window was left open — sessionStorage, so it survives navigating to another
   *  page on the same site (e.g. clicking a link in a message) but resets once the tab is closed. */
  public isWidgetOpen(): boolean {
    try {
      return sessionStorage.getItem(this.WIDGET_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  public setWidgetOpen(open: boolean): void {
    try {
      if (open) {
        sessionStorage.setItem(this.WIDGET_OPEN_KEY, '1');
      } else {
        sessionStorage.removeItem(this.WIDGET_OPEN_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  private readonly SOUND_ENABLED_KEY = 'mcb_sound_enabled';

  /** Send/reply notification sounds — off by default. */
  public isSoundEnabled(): boolean {
    try {
      return localStorage.getItem(this.SOUND_ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  }

  public setSoundEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(this.SOUND_ENABLED_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  private readonly MIC_ENABLED_KEY = 'mcb_mic_enabled';

  /** Whether the voice-typing (dictation) mic icon shows in the input row — off by default; the
   *  visitor has to opt in via Settings before the mic icon (and the voice model download it can
   *  trigger) ever appears at all. */
  public isMicEnabled(): boolean {
    try {
      return localStorage.getItem(this.MIC_ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  }

  public setMicEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(this.MIC_ENABLED_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  private readonly VOICE_MODEL_NOTICE_SEEN_KEY = 'mcb_voice_model_notice_seen';

  /** Whether the visitor has already confirmed the one-time "this downloads a voice model"
   *  popup shown the first time they tap the mic button — see ChatWidgetController.toggleVoiceTyping. */
  public hasSeenVoiceModelNotice(): boolean {
    try {
      return localStorage.getItem(this.VOICE_MODEL_NOTICE_SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  public setVoiceModelNoticeSeen(): void {
    try {
      localStorage.setItem(this.VOICE_MODEL_NOTICE_SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  private readonly MIC_HINT_SEEN_KEY = 'mcb_mic_hint_seen';

  /** Whether the visitor has already seen the one-time "Tap to start voice typing" tooltip shown
   *  the first time the mic icon becomes visible — separate from hasSeenVoiceModelNotice, which is
   *  about the model download popup after they've already found and tapped the mic button. */
  public hasSeenMicHint(): boolean {
    try {
      return localStorage.getItem(this.MIC_HINT_SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  public setMicHintSeen(): void {
    try {
      localStorage.setItem(this.MIC_HINT_SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
  }
}
