import { describe, it, expect, beforeEach } from 'vitest';
import { apiKeyOverrides, parseApiKeys } from '../../src/config/apiKeyOverrides';
import { speechApiKeyOverrides } from '../../src/config/speechApiKeyOverrides';

describe('apiKeyOverrides & KeyPool Failover', () => {
  beforeEach(() => {
    apiKeyOverrides.setAll({ gemini: '', openai: '', anthropic: '', custom: '' });
    speechApiKeyOverrides.setAll({ sarvam: '', openai: '' });
  });

  describe('parseApiKeys', () => {
    it('returns empty array for empty, null, or undefined values', () => {
      expect(parseApiKeys('')).toEqual([]);
      expect(parseApiKeys(null)).toEqual([]);
      expect(parseApiKeys(undefined)).toEqual([]);
      expect(parseApiKeys('   \n  \t ')).toEqual([]);
    });

    it('parses a single key correctly', () => {
      expect(parseApiKeys('sk-12345')).toEqual(['sk-12345']);
      expect(parseApiKeys('  sk-12345  ')).toEqual(['sk-12345']);
    });

    it('parses comma, newline, and semicolon separated keys and trims whitespace', () => {
      expect(parseApiKeys('key1, key2, key3')).toEqual(['key1', 'key2', 'key3']);
      expect(parseApiKeys('key1\nkey2\nkey3')).toEqual(['key1', 'key2', 'key3']);
      expect(parseApiKeys('key1; key2;\nkey3,  key4 ')).toEqual(['key1', 'key2', 'key3', 'key4']);
    });
  });

  describe('apiKeyOverrides.getAll & get', () => {
    it('returns the first key via get() and all keys via getAll()', () => {
      apiKeyOverrides.setAll({ gemini: 'gm-key1, gm-key2\ngm-key3' });
      expect(apiKeyOverrides.get('gemini')).toBe('gm-key1');
      expect(apiKeyOverrides.getAll('gemini')).toEqual(['gm-key1', 'gm-key2', 'gm-key3']);
    });
  });

  describe('apiKeyOverrides.executeWithFailover', () => {
    it('throws when no key is configured for the provider', async () => {
      await expect(
        apiKeyOverrides.executeWithFailover('custom', async () => 'ok'),
      ).rejects.toThrow(/No custom provider API key configured/);
    });

    it('executes successfully on the first key if it does not fail', async () => {
      apiKeyOverrides.setAll({ openai: 'key-1, key-2' });
      const calls: string[] = [];

      const result = await apiKeyOverrides.executeWithFailover('openai', async (key) => {
        calls.push(key);
        return `success-${key}`;
      });

      expect(result).toBe('success-key-1');
      expect(calls).toEqual(['key-1']);
    });

    it('automatically fails over to the next key if the first key errors', async () => {
      apiKeyOverrides.setAll({ gemini: 'key-exhausted, key-healthy' });
      const calls: string[] = [];

      const result = await apiKeyOverrides.executeWithFailover('gemini', async (key) => {
        calls.push(key);
        if (key === 'key-exhausted') {
          throw new Error('429 ResourceExhausted: Quota exceeded for project');
        }
        return `answer-from-${key}`;
      });

      expect(result).toBe('answer-from-key-healthy');
      expect(calls).toEqual(['key-exhausted', 'key-healthy']);
    });

    it('throws an informative aggregated error when all keys in the pool fail', async () => {
      apiKeyOverrides.setAll({ anthropic: 'bad-key-1, bad-key-2' });
      const calls: string[] = [];

      await expect(
        apiKeyOverrides.executeWithFailover('anthropic', async (key) => {
          calls.push(key);
          throw new Error(`Invalid API key ${key}`);
        }),
      ).rejects.toThrow(/All 2 configured API keys for "anthropic" failed/);

      expect(calls).toEqual(['bad-key-1', 'bad-key-2']);
    });
  });

  describe('speechApiKeyOverrides.executeWithFailover', () => {
    it('supports multi-key failover for voice providers', async () => {
      speechApiKeyOverrides.setAll({ sarvam: 'sarvam-rate-limited, sarvam-active' });
      const calls: string[] = [];

      const result = await speechApiKeyOverrides.executeWithFailover('sarvam', async (key) => {
        calls.push(key);
        if (key === 'sarvam-rate-limited') {
          throw new Error('429 Rate Limit Exceeded');
        }
        return { transcript: 'Hello world' };
      });

      expect(result).toEqual({ transcript: 'Hello world' });
      expect(calls).toEqual(['sarvam-rate-limited', 'sarvam-active']);
    });
  });
});
