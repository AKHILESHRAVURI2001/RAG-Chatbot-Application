import type { Permission, PermissionGroup } from './permissions';

export interface RoleSummaryDTO {
  id: string;
  name: string;
  isSuper: boolean;
}

/** An admin account. Its role is a reference to a (database-defined) role, not a fixed enum. */
export interface AdminUserDTO {
  id: string;
  email: string;
  role: RoleSummaryDTO;
  createdAt: string;
}

export interface RoleDTO extends RoleSummaryDTO {
  description: string;
  /** Built-in roles can't be deleted or renamed. */
  isSystem: boolean;
  /** Super roles hold every permission implicitly, so this lists them all and can't be edited. */
  permissions: Permission[];
  userCount: number;
  createdAt: string;
}

export interface RoleInputDTO {
  name: string;
  description: string;
  permissions: Permission[];
}

export interface RoleCatalogDTO {
  groups: PermissionGroup[];
}

/** What `GET /auth/me` returns: who is signed in and exactly what they may do (resolved server-side, per request). */
export interface AuthMeDTO {
  id: string;
  email: string;
  role: RoleSummaryDTO;
  permissions: Permission[];
}

export interface AuditLogEntryDTO {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  result: 'success' | 'failure';
  statusCode: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogResponseDTO {
  entries: AuditLogEntryDTO[];
  total: number;
}

export interface LiveSessionDTO {
  conversationId: string;
  sessionId: string;
  lastMessageAt: string;
  messageCount: number;
}

export type LlmProviderName = 'anthropic' | 'openai' | 'gemini' | 'custom';

export interface LlmSettings {
  llmEnabled?: boolean;
  provider: LlmProviderName;
  model: string;
  customBaseUrl: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  historyLimit: number;
  rewriteFollowUpQueries: boolean;
  maxContextChars: number;
  maxHistoryCharsPerTurn: number;
  autoCompactHistoryWords: number;
  autoCompactContextWords: number;
  showChunkFallbackWhenLlmUnavailable?: boolean;
  showChunkFallbackWhenLlmEnabled?: boolean;
  chunkFallbackMinSimilarity?: number;
  chunkFallbackMaxResults?: number;
  autoStoreQuestionChunks?: boolean;
  enableQuestionChunksMatching?: boolean;
  enableFaqs?: boolean;
  enableDocumentSearch?: boolean;
  enableUnansweredQuestionsLogging?: boolean;
  enableRestrictedWords?: boolean;
}

export interface ApiKeySettings {
  anthropic: string;
  openai: string;
  gemini: string;
  custom: string;
}

export type SpeechProviderName = 'sarvam' | 'openai';

export interface SpeechApiKeySettings {
  sarvam: string;
  openai: string;
}

export interface VoiceSettings {
  enabled: boolean;
  provider: SpeechProviderName;
  languageCode: string;
  speaker: string;
  systemPrompt: string;
  noContextMessage: string;
  overrideTuning: boolean;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  historyLimit: number;
  maxContextChars: number;
  maxHistoryCharsPerTurn: number;
  rewriteFollowUpQueries: boolean;
  autoCompactHistoryWords: number;
  autoCompactContextWords: number;
}

export interface PromptSettings {
  systemPrompt: string;
  greeting: string;
  noContextMessage: string;
  chunkFallbackIntroMessage?: string;
  showRelatedArticles?: boolean;
}

export interface WidgetSettings {
  companyName: string;
  adminPrimaryColor: string;
  primaryColor: string;
  icon: string;
  iconSvg: string;
  title: string;
  description: string;
  note: string;
  enabled: boolean;
  unavailableMessage: string;
  quickReplies: { label: string; message: string }[];
  proactiveEnabled: boolean;
  proactiveDelaySeconds: number;
  proactiveMessage: string;
  poweredByText: string;
  requireLogin?: boolean;
  allowPublicSignup?: boolean;
  loginPromptTitle?: string;
  loginPromptMessage?: string;
  signupUrl?: string;
  loginUrl?: string;
  freeQuestionsBeforeAuth?: number;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export interface VisitorUserDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  messageCount: number;
  createdAt: string;
  lastLoginAt: string;
}

export interface BusinessHoursSettings {
  enabled: boolean;
  timezone: string;
  days: number[];
  openTime: string;
  closeTime: string;
  closedMessage: string;
}

export interface FirebaseSettings {
  enabled: boolean;
  configured: boolean;
}

export interface CacheSettings {
  ttlSeconds: number;
  semanticThreshold: number;
  faqThreshold: number;
  contextThreshold: number;
}

export type EmbeddingProviderName = 'local' | 'openai' | 'gemini' | 'custom';

export interface ChunkingSettings {
  chunkSize: number;
  overlap: number;
  embeddingProvider: EmbeddingProviderName;
  embeddingModel: string;
  customEmbeddingBaseUrl?: string;
}

export interface EmbeddingApiKeySettings {
  openai: string;
  gemini: string;
  custom: string;
}

export interface LimitsSettings {
  enabled?: boolean;
  sessionMessageLimit: number;
  sessionMessageWindowHours: number;
  registeredUserMessageLimit?: number;
  burstLimitPerMinute?: number;
  autoBlockMinutes?: number;
  customLimitMessage?: string;
}

export type SourceType = 'url' | 'file' | 'text';
export type DocumentStatus = 'processing' | 'ready' | 'failed' | 'paused';

export interface DocumentDTO {
  id: string;
  sourceType: SourceType;
  sourceRef: string | null;
  title: string | null;
  status: DocumentStatus;
  error: string | null;
  chunkCount?: number;
  tags: string[];
  createdAt: string;
}

export interface ChunkDTO {
  id: string;
  content: string;
  tokenCount: number;
  embedding: number[];
  createdAt: string;
}

export interface FaqDTO {
  id: string;
  question: string;
  answer: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AnswerSource = 'faq' | 'cache' | 'llm' | 'no-match' | 'chunk-fallback' | 'chunk' | 'restricted';

export interface RestrictedWordDTO {
  id: string;
  phrase: string;
  response: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RestrictedWordsResponseDTO {
  items: RestrictedWordDTO[];
  total: number;
  page: number;
  limit: number;
}

export type UnansweredQuestionReason =
  | 'no_context_found'
  | 'insufficient_answer'
  | 'llm_failed_no_chunks'
  | 'llm_unresponsive';

export interface UnansweredQuestionChunkSnippet {
  title: string | null;
  similarity: number;
  sourceRef?: string | null;
  snippet?: string;
}

export interface UnansweredQuestionDTO {
  id: string;
  question: string;
  sessionId: string | null;
  conversationId: string | null;
  reason: string;
  similarityScore: number | null;
  contextChunks: UnansweredQuestionChunkSnippet[] | null;
  createdAt: string;
}

export interface UnansweredQuestionsResponseDTO {
  items: UnansweredQuestionDTO[];
  total: number;
  page: number;
  limit: number;
}

export interface UnansweredQuestionsStatsDTO {
  total: number;
  byReason: Record<string, number>;
  last7Days: number;
}

export interface QuestionChunkDTO {
  id: string;
  question: string;
  answer: string;
  similarityThreshold: number;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionChunksResponseDTO {
  items: QuestionChunkDTO[];
  total: number;
  page: number;
  limit: number;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
}

export interface ChatResponse {
  answer: string;
  source: AnswerSource;
  conversationId: string;
  compacted?: boolean;
}

export interface VoiceChatResponse extends ChatResponse {
  transcript: string;
  audio?: { base64: string; format: string };
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  answerSource: AnswerSource | null;
  createdAt: string;
}

export interface ChatHistoryResponse {
  conversationId: string | null;
  messages: ChatHistoryMessage[];
}

export interface PipelineStageCheckDTO {
  stage: string;
  status: 'hit' | 'miss' | 'skipped' | 'checked';
  details?: string;
}

export interface VectorMatchAuditDTO {
  title: string | null;
  similarity: number;
  threshold: number;
  passedThreshold: boolean;
  sourceRef?: string | null;
  snippet?: string;
}

export interface PipelineAuditDTO {
  skippedReason?: string;
  stagesChecked?: PipelineStageCheckDTO[];
  vectorMatches?: VectorMatchAuditDTO[];
}

export interface LlmRequestLogDTO {
  systemPrompt: string;
  context: string;
  question: string;
  model: string;
  baseUrl?: string;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  history: { role: 'user' | 'assistant'; content: string }[];
  searchQuery?: string;
  contextChunks?: { title: string | null; words: number; similarity: number }[];
  historySummary?: string;
  autoCompactProgress?: { wordsSoFar: number; budgetWords: number };
  contextCompacted?: boolean;
  provider?: string;
  apiKeyMasked?: string;
  apiKeyIndex?: number;
  keyCount?: number;
  promptWords?: number;
  answerWords?: number;
  totalWords?: number;
  isContinuation?: boolean;
  autoStoredChunk?: boolean;
  responseTimeMs?: number;
  pipelineAudit?: PipelineAuditDTO;
}

export interface ConversationLogMessageDTO {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  answerSource: AnswerSource | null;
  createdAt: string;
  llmRequest: LlmRequestLogDTO | null;
  channel: 'text' | 'voice';
  responseTimeMs?: number | null;
}

export interface ConversationSummaryDTO {
  id: string;
  sessionId: string;
  createdAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  blocked: boolean;
  blockedUntil?: string | null;
  blockReason?: string | null;
}

export interface ManualCompactResultDTO {
  summary: string;
  wordsBefore: number;
  wordsAfter: number;
}

export interface WordUsageDTO {
  totalPromptWords: number;
  totalAnswerWords: number;
  daily: { date: string; promptWords: number; answerWords: number }[];
  byProvider?: {
    provider: string;
    promptWords: number;
    answerWords: number;
    totalWords: number;
    requestCount: number;
  }[];
}

export interface VoiceUsageDTO {
  turnCount: number;
  totalTranscriptWords: number;
  totalAnswerWords: number;
  avgResponseTimeMs: number | null;
}

export interface ConversationDetailDTO {
  id: string;
  sessionId: string;
  createdAt: string;
  messages: ConversationLogMessageDTO[];
}

export interface StatsDTO {
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
  totalFaqs: number;
  cacheHitRate: number;
  documentsByStatus: { ready: number; processing: number; failed: number };
  topQuestions: { question: string; hitCount: number }[];
  health: HealthAnalyticsDTO;
}

export interface HealthAnalyticsDTO {
  avgResponseTimeMs: number | null;
  errorRate24h: number;
  cacheHitTrend: { date: string; hitRate: number }[];
  slowestToday: { sessionId: string; question: string | null; responseTimeMs: number; createdAt: string }[];
  dailyVolume: { date: string; conversations: number; messages: number }[];
  answerSources: { faq: number; cache: number; llm: number; noMatch: number; chunkFallback?: number };
}
