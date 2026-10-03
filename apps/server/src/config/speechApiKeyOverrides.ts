import type { SpeechProviderName } from '../shared';
import { env } from './env';
import { parseApiKeys } from './apiKeyOverrides';

const overrides: Partial<Record<SpeechProviderName, string>> = {};

function getEnvKeys(name: SpeechProviderName): string[] {
  switch (name) {
    case 'sarvam':
      return parseApiKeys(env.SARVAM_API_KEY);
    case 'openai':
      return parseApiKeys(env.OPENAI_API_KEY);
    default:
      return [];
  }
}

function getMissingKeyErrorMessage(name: SpeechProviderName): string {
  if (name === 'sarvam') {
    return 'No Sarvam AI API key configured — set one in Admin > Settings > Voice, or SARVAM_API_KEY in .env';
  }
  return 'No OpenAI API key configured for voice — set one in Admin > Voice Agent > API Key';
}

export const speechApiKeyOverrides = {
  get(name: SpeechProviderName): string | undefined {
    const all = this.getAll(name);
    return all[0] || undefined;
  },

  getAll(name: SpeechProviderName): string[] {
    const fromOverride = parseApiKeys(overrides[name]);
    if (fromOverride.length > 0) return fromOverride;
    return getEnvKeys(name);
  },

  setAll(keys: Partial<Record<SpeechProviderName, string>>): void {
    (Object.keys(keys) as SpeechProviderName[]).forEach((name) => {
      overrides[name] = keys[name]?.trim() || undefined;
    });
  },

  async executeWithFailover<T>(
    name: SpeechProviderName,
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
            throw new Error(`All ${keys.length} configured voice API keys for "${name}" failed. Last error: ${err.message || String(err)}`);
          }
          throw err;
        }

        console.warn(`[SpeechApiKeyPool] Voice key ${i + 1}/${keys.length} for ${name} encountered an error (${err.message || String(err)}). Failing over to next key...`);
      }
    }

    throw lastError;
  },
};
