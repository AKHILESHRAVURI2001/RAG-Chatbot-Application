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
      return localStorage.getItem(this.NOTE_DISMISSED_KEY) === note;
    } catch {
      return false;
    }
  }

  public dismissNote(note: string): void {
    try {
      localStorage.setItem(this.NOTE_DISMISSED_KEY, note);
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
      return localStorage.getItem(this.PROACTIVE_DISMISSED_KEY) === message;
    } catch {
      return false;
    }
  }

  public dismissProactive(message: string): void {
    try {
      localStorage.setItem(this.PROACTIVE_DISMISSED_KEY, message);
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
}
