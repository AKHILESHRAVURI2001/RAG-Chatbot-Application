import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('openaiSpeechProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('isConfigured() is false with no credential (env or admin-set)', async () => {
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    expect(openaiSpeechProvider.isConfigured()).toBe(false);
  });

  it('isConfigured() is true once the admin-set OpenAI voice key is present', async () => {
    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    speechApiKeyOverrides.setAll({ openai: 'test-key' });
    expect(openaiSpeechProvider.isConfigured()).toBe(true);
  });

  it('transcribe() throws a clear error with no key configured, without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    await expect(openaiSpeechProvider.transcribe(Buffer.from('audio'), 'r.webm')).rejects.toThrow(/No OpenAI API key/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('transcribe() posts multipart form data with a bearer token, and parses the transcript back', async () => {
    const fetchSpy = vi.fn(async (..._args: any[]) => ({ ok: true, json: async () => ({ text: 'what are your fees' }) }));
    vi.stubGlobal('fetch', fetchSpy);

    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    speechApiKeyOverrides.setAll({ openai: 'test-key' });

    const result = await openaiSpeechProvider.transcribe(Buffer.from('audio-bytes'), 'recording.webm', 'en-IN');

    expect(result).toEqual({ transcript: 'what are your fees' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer test-key' });
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('transcribe() throws a clear error on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (..._args: any[]) => ({ ok: false, status: 401, text: async () => 'invalid key' })));
    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    speechApiKeyOverrides.setAll({ openai: 'bad-key' });

    await expect(openaiSpeechProvider.transcribe(Buffer.from('audio'), 'r.webm')).rejects.toThrow(/OpenAI speech-to-text failed \(401\)/);
  });

  it('synthesize() throws a clear error with no key configured, without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    await expect(openaiSpeechProvider.synthesize('hello', 'en-IN')).rejects.toThrow(/No OpenAI API key/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('synthesize() posts JSON with the voice/model, and base64-encodes the raw audio bytes returned', async () => {
    const fetchSpy = vi.fn(async (..._args: any[]) => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('fake-mp3-bytes').buffer,
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    speechApiKeyOverrides.setAll({ openai: 'test-key' });

    const result = await openaiSpeechProvider.synthesize('Ten percent deposit.', 'en-IN', 'alloy');

    expect(result).toEqual({ audioBase64: Buffer.from('fake-mp3-bytes').toString('base64'), audioFormat: 'mp3' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.headers).toEqual({ Authorization: 'Bearer test-key', 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body);
    expect(body).toEqual({ model: 'tts-1', input: 'Ten percent deposit.', voice: 'alloy', response_format: 'mp3' });
  });

  it('synthesize() defaults to the "alloy" voice when none is given', async () => {
    const fetchSpy = vi.fn(async (..._args: any[]) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
    vi.stubGlobal('fetch', fetchSpy);

    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    speechApiKeyOverrides.setAll({ openai: 'test-key' });

    await openaiSpeechProvider.synthesize('hi', 'en-IN');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.voice).toBe('alloy');
  });

  it('synthesize() throws a clear error on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (..._args: any[]) => ({ ok: false, status: 400, text: async () => 'bad request' })));
    const { speechApiKeyOverrides } = await import('../../../src/config/speechApiKeyOverrides');
    const { openaiSpeechProvider } = await import('../../../src/providers/speech/openai');
    speechApiKeyOverrides.setAll({ openai: 'test-key' });

    await expect(openaiSpeechProvider.synthesize('hi', 'en-IN')).rejects.toThrow(/OpenAI text-to-speech failed \(400\)/);
  });
});
