import { API_ROUTES } from '../shared';
import type {
  WidgetConfig,
  HistoryMessage,
  SendMessageResponse,
  VoiceMessageResponse,
  WidgetInitOptions,
} from '../types/widget.types';

export class WidgetApiService {
  private readonly CHAT_TIMEOUT_MS = 90_000;

  constructor(private readonly options: WidgetInitOptions) {}

  public get baseUrl(): string {
    let base = (this.options.apiBase || '').trim().replace(/\/+$/, '');
    if (!base.endsWith('/api')) {
      base = `${base}/api`;
    }
    return base;
  }

  public async isApiHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}${API_ROUTES.health}`);
      return res.ok;
    } catch {
      return false;
    }
  }

  public async fetchConfig(): Promise<WidgetConfig> {
    try {
      const res = await fetch(`${this.baseUrl}${API_ROUTES.chat.widgetConfig}`);
      if (!res.ok) throw new Error('config fetch failed');
      return await res.json();
    } catch {
      return {
        greeting: 'Hi! How can I help you today?',
        primaryColor: '#4f46e5',
        icon: '💬',
        iconSvg: '',
        title: 'Chat with us',
        description: '',
        note: '',
        enabled: true,
        unavailableMessage: "We're currently unavailable. Please check back soon.",
        quickReplies: [],
        voiceEnabled: false,
        proactiveEnabled: false,
        proactiveDelaySeconds: 8,
        proactiveMessage: '',
        poweredByText: '',
      };
    }
  }

  public async fetchHistory(sessionId: string): Promise<HistoryMessage[]> {
    try {
      const res = await fetch(`${this.baseUrl}${API_ROUTES.chat.history}?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.messages ?? []).map((m: any) => ({
        role: m.role,
        content: m.content,
        answerSource: m.answerSource ?? m.answer_source ?? null,
        createdAt: m.createdAt ?? m.created_at,
      }));
    } catch {
      return [];
    }
  }

  private withTimeout(signal: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'AbortError')), this.CHAT_TIMEOUT_MS);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    return controller.signal;
  }

  public async sendMessage(
    sessionId: string,
    message: string,
    signal: AbortSignal,
    bypassCache = false,
  ): Promise<SendMessageResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
      headers['x-visitor-token'] = this.options.authToken;
    }
    if (this.options.userId) {
      headers['x-user-id'] = this.options.userId;
    }

    const res = await fetch(`${this.baseUrl}${API_ROUTES.chat.base}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId,
        message,
        documentId: this.options.documentId,
        tag: this.options.tag,
        bypassCache,
        userId: this.options.userId,
        authToken: this.options.authToken,
      }),
      signal: this.withTimeout(signal),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.error === 'login_required' || res.status === 401) {
        const authErr: any = new Error(body.message || 'Please sign up or log in to continue.');
        authErr.isLoginRequired = true;
        authErr.title = body.title || 'Sign up or Log in to continue';
        authErr.message = body.message || 'Please create an account or sign in to ask questions.';
        authErr.signupUrl = body.signupUrl || '/signup';
        authErr.loginUrl = body.loginUrl || '/login';
        throw authErr;
      }
      throw new Error(body.error ?? 'Something went wrong. Please try again.');
    }
    const data = await res.json();
    return { answer: data.answer, source: data.source };
  }

  public async sendVoiceMessage(sessionId: string, audioBlob: Blob): Promise<VoiceMessageResponse> {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    form.append('sessionId', sessionId);
    if (this.options.documentId) form.append('documentId', this.options.documentId);
    if (this.options.tag) form.append('tag', this.options.tag);
    if (this.options.userId) form.append('userId', this.options.userId);
    if (this.options.authToken) form.append('authToken', this.options.authToken);

    const headers: Record<string, string> = {};
    if (this.options.authToken) headers['Authorization'] = `Bearer ${this.options.authToken}`;
    if (this.options.userId) headers['x-user-id'] = this.options.userId;

    const res = await fetch(`${this.baseUrl}${API_ROUTES.chat.voice}`, { method: 'POST', headers, body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.error === 'login_required' || res.status === 401) {
        const authErr: any = new Error(body.message || 'Please sign up or log in to continue.');
        authErr.isLoginRequired = true;
        authErr.title = body.title || 'Sign up or Log in to continue';
        authErr.message = body.message || 'Please create an account or sign in to ask questions.';
        authErr.signupUrl = body.signupUrl || '/signup';
        authErr.loginUrl = body.loginUrl || '/login';
        throw authErr;
      }
      throw new Error(body.error ?? 'Something went wrong. Please try again.');
    }
    const data = await res.json();
    return { transcript: data.transcript, answer: data.answer, source: data.source, audio: data.audio };
  }

  public async visitorSignup(name: string, email: string, password: string): Promise<{ token: string; user: { id: string; name: string; email: string } }> {
    const res = await fetch(`${this.baseUrl}${API_ROUTES.chat.signup}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Failed to sign up');
    return body;
  }

  public async visitorLogin(email: string, password: string): Promise<{ token: string; user: { id: string; name: string; email: string } }> {
    const res = await fetch(`${this.baseUrl}${API_ROUTES.chat.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Invalid email or password');
    return body;
  }

  public async getVisitorMe(token: string): Promise<{ authenticated: boolean; user?: { id: string; name: string; email: string } }> {
    try {
      const res = await fetch(`${this.baseUrl}${API_ROUTES.chat.me}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-visitor-token': token },
      });
      if (!res.ok) return { authenticated: false };
      return await res.json();
    } catch {
      return { authenticated: false };
    }
  }
}
