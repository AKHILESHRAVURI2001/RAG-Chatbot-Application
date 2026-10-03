import { describe, expect, it } from 'vitest';
import { getLlmProvider, listProviderStatus } from '../../../src/providers/llm/index';

describe('LLM provider registry', () => {
  it('lists exactly the four supported providers', () => {
    const status = listProviderStatus();
    expect(status.map((p) => p.name).sort()).toEqual(['anthropic', 'custom', 'gemini', 'openai']);
  });

  it('reports a provider as unconfigured when its API key env var/admin-set key is empty', () => {
    // src/test/setup.ts deliberately leaves ANTHROPIC/OPENAI/GEMINI keys unset; 'custom' has no .env fallback at all.
    const status = listProviderStatus();
    expect(status.every((p) => p.configured === false)).toBe(true);
  });

  it('resolves each known provider name to a provider object', () => {
    expect(getLlmProvider('anthropic').name).toBe('anthropic');
    expect(getLlmProvider('openai').name).toBe('openai');
    expect(getLlmProvider('gemini').name).toBe('gemini');
    expect(getLlmProvider('custom').name).toBe('custom');
  });

  it('throws a clear error for an unknown provider name', () => {
    // @ts-expect-error deliberately passing an invalid provider name
    expect(() => getLlmProvider('does-not-exist')).toThrow(/Unknown LLM provider/);
  });
});
