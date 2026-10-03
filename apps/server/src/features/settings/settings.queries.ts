import { pool } from '../../db/pool';
import type {
  LlmSettings,
  PromptSettings,
  WidgetSettings,
  BusinessHoursSettings,
  CacheSettings,
  LimitsSettings,
  ApiKeySettings,
  ChunkingSettings,
  VoiceSettings,
  SpeechApiKeySettings,
  EmbeddingApiKeySettings,
} from '../../shared';

export interface StoredFirebaseSettings {
  enabled: boolean;
  serviceAccountJson: string;
}

const settingsCache = new Map<string, { value: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 15_000; // 15s in-memory TTL

async function getSetting<T>(key: string, defaultValue?: T): Promise<T> {
  const cached = settingsCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value as T;
  }
  const { rows } = await pool.query('select value from settings where key = $1', [key]);
  if (!rows[0]) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing settings row for key "${key}" — did you run the migrations?`);
  }
  const value = rows[0].value as T;
  settingsCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function setSetting(key: string, value: unknown): Promise<void> {
  settingsCache.delete(key);
  await pool.query(
    `insert into settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  );
  settingsCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

import defaultSettings from '../../config/defaultSettings.json';

const WIDGET_DEFAULTS: Partial<WidgetSettings> = defaultSettings.widget as Partial<WidgetSettings>;
const PROMPT_DEFAULTS: Pick<PromptSettings, 'noContextMessage' | 'chunkFallbackIntroMessage'> = defaultSettings.prompt as Pick<PromptSettings, 'noContextMessage' | 'chunkFallbackIntroMessage'>;
const FIREBASE_DEFAULTS: StoredFirebaseSettings = defaultSettings.firebase as StoredFirebaseSettings;
const BUSINESS_HOURS_DEFAULTS: BusinessHoursSettings = defaultSettings.businessHours as BusinessHoursSettings;
const VOICE_DEFAULTS: VoiceSettings = defaultSettings.voice as VoiceSettings;
const CACHE_DEFAULTS: Pick<CacheSettings, 'contextThreshold'> = defaultSettings.cache as Pick<CacheSettings, 'contextThreshold'>;
const LLM_DEFAULTS: Pick<
  LlmSettings,
  | 'llmEnabled'
  | 'rewriteFollowUpQueries'
  | 'maxContextChars'
  | 'maxHistoryCharsPerTurn'
  | 'autoCompactHistoryWords'
  | 'autoCompactContextWords'
  | 'customBaseUrl'
  | 'showChunkFallbackWhenLlmUnavailable'
  | 'chunkFallbackMinSimilarity'
  | 'chunkFallbackMaxResults'
  | 'autoStoreQuestionChunks'
  | 'enableQuestionChunksMatching'
> = defaultSettings.llm as any;
const CHUNKING_DEFAULTS: Pick<ChunkingSettings, 'embeddingProvider' | 'embeddingModel'> = defaultSettings.chunking as Pick<
  ChunkingSettings,
  'embeddingProvider' | 'embeddingModel'
>;
const LIMITS_DEFAULTS: LimitsSettings = defaultSettings.limits as LimitsSettings;

export const settingsRepo = {
  getLlm: async () => ({ ...LLM_DEFAULTS, ...(await getSetting<LlmSettings>('llm')) }),
  setLlm: (value: LlmSettings) => setSetting('llm', value),

  getPrompt: async () => ({ ...PROMPT_DEFAULTS, ...(await getSetting<PromptSettings>('prompt')) }),
  setPrompt: (value: PromptSettings) => setSetting('prompt', value),

  getWidget: async () => ({ ...WIDGET_DEFAULTS, ...(await getSetting<WidgetSettings>('widget')) }),
  setWidget: (value: WidgetSettings) => setSetting('widget', value),

  getBusinessHours: async () => ({ ...BUSINESS_HOURS_DEFAULTS, ...(await getSetting<BusinessHoursSettings>('businessHours')) }),
  setBusinessHours: (value: BusinessHoursSettings) => setSetting('businessHours', value),

  getFirebase: async () => ({ ...FIREBASE_DEFAULTS, ...(await getSetting<StoredFirebaseSettings>('firebase')) }),
  setFirebase: (value: StoredFirebaseSettings) => setSetting('firebase', value),

  getCache: async () => ({ ...CACHE_DEFAULTS, ...(await getSetting<CacheSettings>('cache')) }),
  setCache: (value: CacheSettings) => setSetting('cache', value),

  getLimits: async () => ({ ...LIMITS_DEFAULTS, ...(await getSetting<LimitsSettings>('limits')) }),
  setLimits: (value: LimitsSettings) => setSetting('limits', value),

  getApiKeys: () => getSetting<ApiKeySettings>('apiKeys', {} as ApiKeySettings),
  setApiKeys: (value: ApiKeySettings) => setSetting('apiKeys', value),

  getChunking: async () => ({ ...CHUNKING_DEFAULTS, ...(await getSetting<ChunkingSettings>('chunking')) }),
  setChunking: (value: ChunkingSettings) => setSetting('chunking', value),

  getVoice: async () => ({ ...VOICE_DEFAULTS, ...(await getSetting<VoiceSettings>('voice')) }),
  setVoice: (value: VoiceSettings) => setSetting('voice', value),

  getSpeechApiKeys: () => getSetting<SpeechApiKeySettings>('speechApiKeys', {} as SpeechApiKeySettings),
  setSpeechApiKeys: (value: SpeechApiKeySettings) => setSetting('speechApiKeys', value),

  getEmbeddingApiKeys: () => getSetting<EmbeddingApiKeySettings>('embeddingApiKeys', {} as EmbeddingApiKeySettings),
  setEmbeddingApiKeys: (value: EmbeddingApiKeySettings) => setSetting('embeddingApiKey', value),
};
