import type { LlmProviderName } from '../shared';
import { env } from './env';

const overrides: Partial<Record<LlmProviderName, string>> = {};

export function parseApiKeys(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}


function getEnvKeys(name: LlmProviderName): string[] {
  switch (name) {
    case 'gemini':
      return parseApiKeys(env.GEMINI_API_KEY);
    case 'openai':
      return parseApiKeys(env.OPENAI_API_KEY);
    case 'anthropic':
      return parseApiKeys(env.ANTHROPIC_API_KEY);
    default:
      return [];
  }
}

function getMissingKeyErrorMessage(name: LlmProviderName): string {
  switch (name) {
    case 'gemini':
      return 'No Gemini API key configured — set one in Admin > Chat Agent, or GEMINI_API_KEY in .env';
    case 'openai':
      return 'No OpenAI API key configured — set one in Admin > Chat Agent, or OPENAI_API_KEY in .env';
    case 'anthropic':
      return 'No Anthropic API key configured — set one in Admin > Chat Agent, or ANTHROPIC_API_KEY in .env';
    case 'custom':
      return 'No custom provider API key configured — set one in Admin > Chat Agent > API Keys';
  }
}

export const apiKeyOverrides = {
  get(name: LlmProviderName): string | undefined {
    const all = this.getAll(name);
    return all[0] || undefined;
  },

  getAll(name: LlmProviderName): string[] {
    const fromOverride = parseApiKeys(overrides[name]);
    if (fromOverride.length > 0) return fromOverride;
    return getEnvKeys(name);
  },

  setAll(keys: Partial<Record<LlmProviderName, string>>): void {
    (Object.keys(keys) as LlmProviderName[]).forEach((name) => {
      overrides[name] = keys[name]?.trim() || undefined;
    });
  },

  async executeWithFailover<T>(
    name: LlmProviderName,
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
            throw new Error(`All ${keys.length} configured API keys for "${name}" failed. Last error: ${err.message || String(err)}`);
          }
          throw err;
        }

        console.warn(`[ApiKeyPool] Key ${i + 1}/${keys.length} for ${name} encountered an error (${err.message || String(err)}). Failing over to next key...`);
      }
    }

    throw lastError;
  },
};
