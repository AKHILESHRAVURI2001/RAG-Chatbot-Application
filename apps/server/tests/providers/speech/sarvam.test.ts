import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sarvamProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('isConfigured() is false with no credential (env or admin-set)', async () => {
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    expect(sarvamProvider.isConfigured()).toBe(false);
  });

  it('isConfigured() is true once an admin-set key is present', async () => {
    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    speechApiKeyOverrides.setAll({ sarvam: 'test-key' });
    expect(sarvamProvider.isConfigured()).toBe(true);
  });

  it('transcribe() throws a clear error with no key configured, without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    await expect(sarvamProvider.transcribe(Buffer.from('audio'), 'r.webm')).rejects.toThrow(/No Sarvam AI API key/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('transcribe() posts multipart form data with the api-subscription-key header, and parses the transcript back', async () => {
    const fetchSpy = vi.fn(async (..._args: any[]) => ({
      ok: true,
      json: async () => ({ transcript: 'what are your fees', language_code: 'en-IN' }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    speechApiKeyOverrides.setAll({ sarvam: 'test-key' });

    const result = await sarvamProvider.transcribe(Buffer.from('audio-bytes'), 'recording.webm', 'en-IN');

    expect(result).toEqual({ transcript: 'what are your fees', languageCode: 'en-IN' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.sarvam.ai/speech-to-text');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'api-subscription-key': 'test-key' });
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('transcribe() throws a clear error on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (..._args: any[]) => ({ ok: false, status: 401, text: async () => 'invalid key' })),
    );
    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    speechApiKeyOverrides.setAll({ sarvam: 'bad-key' });

    await expect(sarvamProvider.transcribe(Buffer.from('audio'), 'r.webm')).rejects.toThrow(/Sarvam speech-to-text failed \(401\)/);
  });

  it('synthesize() throws a clear error with no key configured, without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    await expect(sarvamProvider.synthesize('hello', 'en-IN')).rejects.toThrow(/No Sarvam AI API key/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('synthesize() posts JSON with the language/speaker/model, and returns the base64 audio', async () => {
    const fetchSpy = vi.fn(async (..._args: any[]) => ({ ok: true, json: async () => ({ audios: ['QUJD'] }) }));
    vi.stubGlobal('fetch', fetchSpy);

    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    speechApiKeyOverrides.setAll({ sarvam: 'test-key' });

    const result = await sarvamProvider.synthesize('Ten percent deposit.', 'en-IN', 'shubh');

    expect(result).toEqual({ audioBase64: 'QUJD', audioFormat: 'mp3' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.sarvam.ai/text-to-speech');
    expect(init.headers).toEqual({ 'api-subscription-key': 'test-key', 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body);
    expect(body).toEqual(
      expect.objectContaining({ text: 'Ten percent deposit.', language_code: 'en-IN', speaker: 'shubh', output_audio_codec: 'mp3' }),
    );
  });

  it('synthesize() throws a clear error on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (..._args: any[]) => ({ ok: false, status: 400, text: async () => 'bad request' })),
    );
    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    speechApiKeyOverrides.setAll({ sarvam: 'test-key' });

    await expect(sarvamProvider.synthesize('hi', 'en-IN')).rejects.toThrow(/Sarvam text-to-speech failed \(400\)/);
  });

  it('synthesize() throws a clear error when the response has no audio', async () => {
    vi.stubGlobal('fetch', vi.fn(async (..._args: any[]) => ({ ok: true, json: async () => ({ audios: [] }) })));
    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { sarvamProvider } = await import('../../../src/providers/speech/sarvam');
    speechApiKeyOverrides.setAll({ sarvam: 'test-key' });

    await expect(sarvamProvider.synthesize('hi', 'en-IN')).rejects.toThrow(/returned no audio/);
  });
});
