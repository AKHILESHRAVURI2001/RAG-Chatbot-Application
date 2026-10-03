import { authStore } from './auth';
import {
  API_ROUTES,
  type ChatHistoryResponse,
  type ChatResponse,
  type ChunkDTO,
  type ConversationDetailDTO,
  type ConversationSummaryDTO,
  type DocumentDTO,
  type FaqDTO,
  type StatsDTO,
  type LlmSettings,
  type PromptSettings,
  type WidgetSettings,
  type BusinessHoursSettings,
  type FirebaseSettings,
  type VoiceSettings,
  type CacheSettings,
  type LimitsSettings,
  type AdminUserDTO,
  type AuthMeDTO,
  type RoleDTO,
  type RoleInputDTO,
  type RoleCatalogDTO,
  type AuditLogResponseDTO,
  type LiveSessionDTO,
  type ApiKeySettings,
  type WordUsageDTO,
  type VoiceUsageDTO,
  type ChunkingSettings,
  type UnansweredQuestionDTO,
  type UnansweredQuestionsResponseDTO,
  type UnansweredQuestionsStatsDTO,
  type QuestionChunkDTO,
  type QuestionChunksResponseDTO,
  type RestrictedWordDTO,
} from '../shared';

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

function authHeaders(): HeadersInit {
  const token = authStore.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A failed API call. `status` lets callers react to the kind of failure (403 = not allowed, 404 = gone, …) instead of parsing text. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Fired when the server rejects the session (expired or the account was removed); the app then returns to the sign-in page. */
export const SESSION_EXPIRED_EVENT = 'mcb:session-expired';

/**
 * Every authenticated call goes through here: adds the token, turns a failed response into an ApiError carrying the
 * server's message, and handles an expired session in one place. Callers that need the raw Response (file
 * downloads/uploads) use this directly; JSON calls use `request`.
 */
async function fetchApi(path: string, init: RequestInit = {}, failureMessage = 'Request failed'): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: { ...authHeaders(), ...(init.headers ?? {}) } });
  if (res.status === 401 && path !== API_ROUTES.auth.login) {
    authStore.clearToken();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? (res.statusText || `${failureMessage} (${res.status})`));
  }
  return res;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchApi(path, init);
  if (res.status === 204) return undefined as T;
  return res.json();
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const CHAT_TIMEOUT_MS = 45_000;

function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'AbortError')), CHAT_TIMEOUT_MS);
  const clear = () => clearTimeout(timer);
  controller.signal.addEventListener('abort', clear, { once: true });
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  return controller.signal;
}

function dateRangeQuery(from?: Date, to?: Date, sep: '?' | '&' = '?'): string {
  const parts: string[] = [];
  if (from) parts.push(`from=${encodeURIComponent(from.toISOString())}`);
  if (to) parts.push(`to=${encodeURIComponent(to.toISOString())}`);
  return parts.length ? `${sep}${parts.join('&')}` : '';
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; email: string }>(API_ROUTES.auth.login, json({ email, password })),
  me: () => request<AuthMeDTO>(API_ROUTES.auth.me),

  // Documents
  listDocuments: (tag?: string) => request<DocumentDTO[]>(`${API_ROUTES.admin.documents.base}${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`),
  listAllTags: () => request<string[]>(API_ROUTES.admin.documents.tags),
  ingestUrl: (url: string, tags: string[] = [], options?: { rechunkIfExists?: boolean; skipIfExists?: boolean }) =>
    request<DocumentDTO>(API_ROUTES.admin.documents.url, json({ url, tags, ...options })),
  fetchSitemapUrls: (url: string) => request<{ urls: string[] }>(API_ROUTES.admin.documents.sitemap, json({ url })),
  ingestText: (title: string, text: string, tags: string[] = []) =>
    request<DocumentDTO>(API_ROUTES.admin.documents.text, json({ title, text, tags })),
  ingestFile: async (file: File, tags: string[] = []) => {
    const formData = new FormData();
    formData.append('file', file);
    if (tags.length > 0) formData.append('tags', tags.join(','));
    const res = await fetchApi(API_ROUTES.admin.documents.file, { method: 'POST', body: formData }, 'Upload failed');
    return res.json() as Promise<DocumentDTO>;
  },
  deleteDocument: (id: string) => request<void>(API_ROUTES.admin.documents.byId(id), { method: 'DELETE' }),
  getDocumentChunks: (id: string) => request<ChunkDTO[]>(API_ROUTES.admin.documents.chunks(id)),
  exportDocumentEmbeddings: async (id: string, filenameHint: string) => {
    const res = await fetchApi(API_ROUTES.admin.documents.export(id), {}, 'Export failed');
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${filenameHint}-embeddings.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  recheckDocument: (id: string) => request<DocumentDTO>(API_ROUTES.admin.documents.recheck(id), { method: 'POST' }),
  setDocumentPaused: (id: string, paused: boolean) =>
    request<DocumentDTO>(API_ROUTES.admin.documents.pause(id), { ...json({ paused }), method: 'PUT' }),
  setDocumentTags: (id: string, tags: string[]) => request<DocumentDTO>(API_ROUTES.admin.documents.setTags(id), { ...json({ tags }), method: 'PUT' }),

  // FAQs
  listFaqs: () => request<FaqDTO[]>(API_ROUTES.admin.faqs.base),
  createFaq: (question: string, answer: string) => request<FaqDTO>(API_ROUTES.admin.faqs.base, json({ question, answer })),
  updateFaq: (id: string, question: string, answer: string, isActive: boolean) =>
    request<FaqDTO>(API_ROUTES.admin.faqs.byId(id), { ...json({ question, answer, isActive }), method: 'PUT' }),
  deleteFaq: (id: string) => request<void>(API_ROUTES.admin.faqs.byId(id), { method: 'DELETE' }),
  importSeedFaqs: () => request<{ created: FaqDTO[]; skipped: number }>(API_ROUTES.admin.faqs.importSeed, { method: 'POST' }),
  importFaqs: (faqs: { question: string; answer: string }[]) =>
    request<{ created: FaqDTO[]; skipped: number }>(API_ROUTES.admin.faqs.import, json({ faqs })),

  // Settings
  getSettings: () =>
    request<{
      llm: LlmSettings;
      prompt: PromptSettings;
      widget: WidgetSettings;
      businessHours: BusinessHoursSettings;
      firebase: FirebaseSettings;
      cache: CacheSettings;
      limits: LimitsSettings;
      chunking: ChunkingSettings;
      voice: VoiceSettings;
      providers: { name: string; configured: boolean }[];
      speechProviders: { name: string; configured: boolean }[];
      embeddingProviders: { name: string; configured: boolean }[];
    }>(API_ROUTES.admin.settings.base),
  updateLlm: (value: LlmSettings) => request<LlmSettings>(API_ROUTES.admin.settings.llm, { ...json(value), method: 'PUT' }),
  updatePrompt: (value: PromptSettings) => request<PromptSettings>(API_ROUTES.admin.settings.prompt, { ...json(value), method: 'PUT' }),
  updateWidget: (value: WidgetSettings) => request<WidgetSettings>(API_ROUTES.admin.settings.widget, { ...json(value), method: 'PUT' }),
  updateBusinessHours: (value: BusinessHoursSettings) =>
    request<BusinessHoursSettings>(API_ROUTES.admin.settings.businessHours, { ...json(value), method: 'PUT' }),
  /** `serviceAccountJson` omitted means "leave whatever's already stored" — same convention as updateApiKeys below. */
  updateFirebase: (value: { enabled: boolean; serviceAccountJson?: string }) =>
    request<FirebaseSettings>(API_ROUTES.admin.settings.firebase, { ...json(value), method: 'PUT' }),
  testFirebaseConnection: () =>
    request<{ ok: boolean; error?: string }>(API_ROUTES.admin.settings.firebaseTestConnection, { method: 'POST' }),
  updateCache: (value: CacheSettings) => request<CacheSettings>(API_ROUTES.admin.settings.cache, { ...json(value), method: 'PUT' }),
  updateLimits: (value: LimitsSettings) => request<LimitsSettings>(API_ROUTES.admin.settings.limits, { ...json(value), method: 'PUT' }),
  updateChunking: (value: ChunkingSettings) => request<ChunkingSettings>(API_ROUTES.admin.settings.chunking, { ...json(value), method: 'PUT' }),
  updateVoice: (value: VoiceSettings) => request<VoiceSettings>(API_ROUTES.admin.settings.voice, { ...json(value), method: 'PUT' }),
  updateSpeechApiKeys: (patch: { sarvam?: string; openai?: string }) =>
    request<void>(API_ROUTES.admin.settings.speechApiKeys, { ...json(patch), method: 'PUT' }),
  updateEmbeddingApiKeys: (patch: { openai?: string; gemini?: string; custom?: string }) =>
    request<void>(API_ROUTES.admin.settings.embeddingApiKeys, { ...json(patch), method: 'PUT' }),
  testVoiceSpeech: (text: string) =>
    request<{ audio: { base64: string; format: string } }>(API_ROUTES.admin.settings.voiceTestSpeech, json({ text })),
  uploadWidgetIcon: async (file: File) => {
    const formData = new FormData();
    formData.append('icon', file);
    const res = await fetchApi(API_ROUTES.admin.settings.widgetIcon, { method: 'PUT', body: formData }, 'Upload failed');
    return res.json() as Promise<WidgetSettings>;
  },
  removeWidgetIcon: () => request<WidgetSettings>(API_ROUTES.admin.settings.widgetIcon, { method: 'DELETE' }),
  flushCache: () => request<void>(API_ROUTES.admin.settings.cacheFlush, { method: 'POST' }),
  getDbStatus: () =>
    request<{
      ok: boolean;
      settingsKeys: { key: string; present: boolean }[];
      visitorUsersTable: boolean;
      conversationsColumns: string[];
      migrationFiles: string[];
      databaseSize: { bytes: number; pretty: string };
      tableSizes: { name: string; bytes: number; pretty: string }[];
    }>(API_ROUTES.admin.settings.dbStatus),
  runDbMigrate: () =>
    request<{ ok: boolean; results: { file: string; ok: boolean; error?: string }[] }>(API_ROUTES.admin.settings.dbMigrate, {
      method: 'POST',
    }),
  testEmbedding: (text?: string) =>
    request<{
      provider: string;
      model: string;
      dimensions: number;
      sample: number[];
      durationMs: number;
    }>(API_ROUTES.admin.settings.embeddingTest, json({ text: text || 'MiniChatbotAgent semantic vector test' })),
  updateApiKeys: (value: Partial<ApiKeySettings>) => request<void>(API_ROUTES.admin.settings.apiKeys, { ...json(value), method: 'PUT' }),
  testLlmKey: (data: { provider: string; key?: string; model?: string; baseUrl?: string }) =>
    request<{
      provider: string;
      totalKeys: number;
      healthyCount: number;
      results: Array<{ keyIndex: number; keyMasked: string; valid: boolean; latencyMs: number; error?: string }>;
    }>(API_ROUTES.admin.settings.testLlmKey, json(data)),

  // Stats
  getStats: () => request<StatsDTO>(API_ROUTES.admin.stats),
  getWordUsage: (days?: number | null) =>
    request<WordUsageDTO>(`${API_ROUTES.admin.wordUsage}${days ? `?days=${days}` : ''}`),
  getVoiceUsage: (days?: number | null) =>
    request<VoiceUsageDTO>(`${API_ROUTES.admin.voiceUsage}${days ? `?days=${days}` : ''}`),

  // Chat preview
  sendChatMessage: (sessionId: string, message: string, signal?: AbortSignal, bypassCache = false) =>
    request<ChatResponse>(API_ROUTES.chat.base, { ...json({ sessionId, message, bypassCache }), signal: withTimeout(signal) }),
  getChatHistory: (sessionId: string) =>
    request<ChatHistoryResponse>(`${API_ROUTES.chat.history}?sessionId=${encodeURIComponent(sessionId)}`),
  sendVoiceMessage: async (sessionId: string, audioBlob: Blob) => {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    form.append('sessionId', sessionId);
    const res = await fetch(`${BASE_URL}${API_ROUTES.chat.voice}`, { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong. Please try again.');
    return res.json() as Promise<ChatResponse & { transcript: string; audio?: { base64: string; format: string } }>;
  },
  speakText: (text: string) => request<{ audio: { base64: string; format: string } }>(API_ROUTES.chat.speak, json({ text })),

  // Chat Logs
  listConversations: () => request<ConversationSummaryDTO[]>(API_ROUTES.admin.conversations.base),
  getConversation: (id: string) => request<ConversationDetailDTO>(API_ROUTES.admin.conversations.byId(id)),
  deleteConversation: (id: string) => request<void>(API_ROUTES.admin.conversations.byId(id), { method: 'DELETE' }),
  clearAllConversations: () => request<{ deleted: number }>(API_ROUTES.admin.conversations.base, { method: 'DELETE' }),
  setConversationBlocked: (id: string, blocked: boolean, durationMinutes?: number | null, reason?: string | null) =>
    request<{ blocked: boolean; blockedUntil?: string | null; blockReason?: string | null }>(
      API_ROUTES.admin.conversations.blocked(id),
      { ...json({ blocked, durationMinutes, reason }), method: 'PUT' },
    ),
  listActiveSessions: (windowMinutes = 15) =>
    request<LiveSessionDTO[]>(`${API_ROUTES.admin.conversations.active}?windowMinutes=${windowMinutes}`),
  exportConversations: async (from: Date, to: Date) => {
    const res = await fetchApi(`${API_ROUTES.admin.conversations.export}?from=${from.toISOString()}&to=${to.toISOString()}`, {}, 'Export failed');
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'conversations-export.txt';
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  },

  // Admin Users
  listAdminUsers: () => request<AdminUserDTO[]>(API_ROUTES.admin.users.base),
  createAdminUser: (email: string, password: string, roleId: string) =>
    request<AdminUserDTO>(API_ROUTES.admin.users.base, json({ email, password, roleId })),
  changeAdminPassword: (id: string, password: string) =>
    request<void>(API_ROUTES.admin.users.password(id), { ...json({ password }), method: 'PUT' }),
  updateAdminUserRole: (id: string, roleId: string) =>
    request<void>(API_ROUTES.admin.users.role(id), { ...json({ roleId }), method: 'PUT' }),
  deleteAdminUser: (id: string) => request<void>(API_ROUTES.admin.users.byId(id), { method: 'DELETE' }),

  // Roles & permissions
  listRoles: () => request<RoleDTO[]>(API_ROUTES.admin.roles.base),
  getPermissionCatalog: () => request<RoleCatalogDTO>(API_ROUTES.admin.roles.catalog),
  createRole: (input: RoleInputDTO) => request<RoleDTO>(API_ROUTES.admin.roles.base, json(input)),
  updateRole: (id: string, input: RoleInputDTO) =>
    request<RoleDTO>(API_ROUTES.admin.roles.byId(id), { ...json(input), method: 'PUT' }),
  deleteRole: (id: string) => request<void>(API_ROUTES.admin.roles.byId(id), { method: 'DELETE' }),

  // Audit log
  listAuditLog: (opts: { limit?: number; offset?: number; resource?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.limit) q.set('limit', String(opts.limit));
    if (opts.offset) q.set('offset', String(opts.offset));
    if (opts.resource) q.set('resource', opts.resource);
    const qs = q.toString();
    return request<AuditLogResponseDTO>(`${API_ROUTES.admin.audit}${qs ? `?${qs}` : ''}`);
  },

  // Chat / Visitor Users
  listVisitorUsers: (search?: string) =>
    request<import('../shared').VisitorUserDTO[]>(
      `${API_ROUTES.admin.visitorUsers.base}${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  createVisitorUser: (name: string, email: string, password: string) =>
    request<import('../shared').VisitorUserDTO>(API_ROUTES.admin.visitorUsers.base, json({ name, email, password })),
  changeVisitorPassword: (id: string, password: string) =>
    request<{ ok: boolean; message: string }>(API_ROUTES.admin.visitorUsers.password(id), json({ password })),
  resetVisitorQuota: (id: string) =>
    request<{ ok: boolean; message: string }>(API_ROUTES.admin.visitorUsers.resetQuota(id), { method: 'POST' }),
  deleteVisitorUser: (id: string) =>
    request<{ ok: boolean }>(API_ROUTES.admin.visitorUsers.byId(id), { method: 'DELETE' }),

  // Read-only SQL query tool
  runQuery: (sql: string) =>
    request<{ rows: Record<string, unknown>[]; rowCount: number; truncated: boolean }>(API_ROUTES.admin.query, json({ sql })),

  // Reports
  getFirebaseStats: (from?: Date, to?: Date) =>
    request<{
      configured: boolean;
      stats: { conversationCount: number; messageCount: number | null; messageCountError?: string } | null;
    }>(`${API_ROUTES.admin.reports.firebaseStats}${dateRangeQuery(from, to)}`),
  getFirebaseAnswerSourceBreakdown: () =>
    request<{
      configured: boolean;
      breakdown: { faq: number; cache: number; llm: number; noMatch: number } | { error: string } | null;
    }>(API_ROUTES.admin.reports.firebaseAnswerSources),
  getFirebaseCacheStats: () =>
    request<{
      configured: boolean;
      cacheStats: { cachedQueriesCount: number } | null;
    }>(API_ROUTES.admin.reports.firebaseCacheStats),
  listFirestoreConversations: (limit = 25, cursor?: string, from?: Date, to?: Date) =>
    request<{
      configured: boolean;
      page: {
        conversations: { id: string; sessionId: string; createdAt: string | null; updatedAt: string | null; blocked: boolean; hasSummary: boolean }[];
        nextCursor: string | null;
      } | null;
    }>(
      `${API_ROUTES.admin.reports.firebaseConversations}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${dateRangeQuery(from, to, '&')}`,
    ),
  getFirestoreConversationMessages: (id: string) =>
    request<{
      configured: boolean;
      messages:
        | {
            id: string;
            role: 'user' | 'assistant';
            content: string;
            answerSource: string | null;
            responseTimeMs: number | null;
            createdAt: string | null;
            contextCompacted: boolean;
          }[]
        | null;
    }>(API_ROUTES.admin.reports.firebaseConversationMessages(id)),

  // Unanswered Questions
  listUnansweredQuestions: (params?: { limit?: number; offset?: number; search?: string; reason?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.search) query.set('search', params.search);
    if (params?.reason) query.set('reason', params.reason);
    const qs = query.toString();
    return request<UnansweredQuestionsResponseDTO & { stats: UnansweredQuestionsStatsDTO }>(
      `${API_ROUTES.admin.unansweredQuestions.base}${qs ? `?${qs}` : ''}`,
    );
  },
  deleteUnansweredQuestion: (id: string) =>
    request<void>(API_ROUTES.admin.unansweredQuestions.byId(id), { method: 'DELETE' }),
  clearAllUnansweredQuestions: () =>
    request<{ deletedCount: number }>(API_ROUTES.admin.unansweredQuestions.base, { method: 'DELETE' }),
  getUnansweredQuestionsStats: () =>
    request<UnansweredQuestionsStatsDTO>(API_ROUTES.admin.unansweredQuestions.stats),

  // Question Chunks (Pre-Matched Question Pairs)
  listQuestionChunks: (params?: { limit?: number; offset?: number; query?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    if (params?.query) q.set('query', params.query);
    const qs = q.toString();
    return request<QuestionChunksResponseDTO>(`${API_ROUTES.admin.questionChunks.base}${qs ? `?${qs}` : ''}`);
  },
  createQuestionChunk: (data: { question: string; answer: string; similarityThreshold?: number }) =>
    request<QuestionChunkDTO>(API_ROUTES.admin.questionChunks.base, { ...json(data), method: 'POST' }),
  updateQuestionChunk: (id: string, data: { question?: string; answer?: string; similarityThreshold?: number }) =>
    request<QuestionChunkDTO>(API_ROUTES.admin.questionChunks.byId(id), { ...json(data), method: 'PUT' }),
  deleteQuestionChunk: (id: string) =>
    request<{ success: boolean }>(API_ROUTES.admin.questionChunks.byId(id), { method: 'DELETE' }),
  clearAllQuestionChunks: () =>
    request<{ success: boolean; count: number }>(API_ROUTES.admin.questionChunks.base, { method: 'DELETE' }),

  // Restricted Words
  listRestrictedWords: () => request<RestrictedWordDTO[]>(API_ROUTES.admin.restrictedWords.base),
  createRestrictedWord: (phrase: string, response: string, isActive = true) =>
    request<RestrictedWordDTO>(API_ROUTES.admin.restrictedWords.base, json({ phrase, response, isActive })),
  updateRestrictedWord: (id: string, data: { phrase?: string; response?: string; isActive?: boolean }) =>
    request<RestrictedWordDTO>(API_ROUTES.admin.restrictedWords.byId(id), { ...json(data), method: 'PUT' }),
  deleteRestrictedWord: (id: string) => request<void>(API_ROUTES.admin.restrictedWords.byId(id), { method: 'DELETE' }),
};
