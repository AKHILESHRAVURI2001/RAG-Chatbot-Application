import type { EmbeddingApiKeySettings } from '../shared';
import { env } from './env';
import { parseApiKeys } from './apiKeyOverrides';

type EmbeddingKeyName = keyof EmbeddingApiKeySettings;

const overrides: Partial<Record<EmbeddingKeyName, string>> = {};

function getEnvKeys(name: EmbeddingKeyName): string[] {
  if (name === 'openai') return parseApiKeys(env.OPENAI_API_KEY);
  if (name === 'gemini') return parseApiKeys(env.GEMINI_API_KEY);
  return [];
}

function getMissingKeyErrorMessage(name: EmbeddingKeyName): string {
  if (name === 'openai') {
    return 'No OpenAI API key configured for embeddings — set one in Admin > Vector Agent > Vector Provider';
  }
  if (name === 'gemini') {
    return 'No Gemini API key configured for embeddings — set one in Admin > Vector Agent > Vector Provider';
  }
  return `No API key configured for embedding provider "${name}"`;
}

export const embeddingApiKeyOverrides = {
  get(name: EmbeddingKeyName): string | undefined {
    const all = this.getAll(name);
    return all[0] || undefined;
  },

  getAll(name: EmbeddingKeyName): string[] {
    const fromOverride = parseApiKeys(overrides[name]);
    if (fromOverride.length > 0) return fromOverride;
    return getEnvKeys(name);
  },

  setAll(keys: Partial<Record<EmbeddingKeyName, string>>): void {
    (Object.keys(keys) as EmbeddingKeyName[]).forEach((name) => {
      overrides[name] = keys[name]?.trim() || undefined;
    });
  },

  async executeWithFailover<T>(
    name: EmbeddingKeyName,
    fn: (key: string, index: number, total: number) => Promise<T>,
  ): Promise<T> {
    const keys = this.getAll(name);
    if (keys.length === 0) {
      throw new Error(getMissingKeyErrorMessage(name));
    }

    let lastError: any;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        return await fn(key, i, keys.length);
      } catch (err: any) {
        lastError = err;
        const isLastKey = i === keys.length - 1;
        if (isLastKey) {
          if (keys.length > 1) {
            throw new Error(`All ${keys.length} configured embedding API keys for "${name}" failed. Last error: ${err.message || String(err)}`);
          }
          throw err;
        }

        console.warn(`[EmbeddingApiKeyPool] Embedding key ${i + 1}/${keys.length} for ${name} encountered an error (${err.message || String(err)}). Failing over to next key...`);
      }
    }

    throw lastError;
  },
};
