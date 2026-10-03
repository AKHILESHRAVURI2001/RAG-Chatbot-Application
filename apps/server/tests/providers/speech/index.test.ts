import { describe, expect, it } from 'vitest';
import { getSpeechProvider, listSpeechProviderStatus } from '../../../src/providers/speech/index';

describe('speech provider registry', () => {
  it('lists exactly the supported speech providers', () => {
    const status = listSpeechProviderStatus();
    expect(status.map((p) => p.name).sort()).toEqual(['openai', 'sarvam']);
  });

  it('reports a provider as unconfigured when its API key env var is empty', () => {
    // src/test/setup.ts deliberately leaves SARVAM_API_KEY unset.
    const status = listSpeechProviderStatus();
    expect(status.every((p) => p.configured === false)).toBe(true);
  });

  it('resolves a known provider name to a provider object', () => {
    expect(getSpeechProvider('sarvam').name).toBe('sarvam');
  });

  it('throws a clear error for an unknown provider name', () => {
    // @ts-expect-error deliberately passing an invalid provider name
    expect(() => getSpeechProvider('does-not-exist')).toThrow(/Unknown speech provider/);
  });
});
