import { speechApiKeyOverrides } from '../../config/speechApiKeyOverrides';
import type { SpeechProvider, SynthesizeResult, TranscribeResult } from './provider';

const BASE_URL = 'https://api.openai.com/v1';

interface OpenAiTranscribeResponse {
  text: string;
}

export const openaiSpeechProvider: SpeechProvider = {
  name: 'openai',
  isConfigured: () => Boolean(speechApiKeyOverrides.get('openai')),

  async transcribe(audio: Buffer, filename: string, languageCode?: string): Promise<TranscribeResult> {
    return speechApiKeyOverrides.executeWithFailover('openai', async (apiKey) => {
      const form = new FormData();
      form.append('file', new Blob([audio as unknown as BlobPart]), filename);
      form.append('model', 'whisper-1');
      if (languageCode) form.append('language', languageCode.split('-')[0]);

      const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`OpenAI speech-to-text failed (${res.status}): ${await res.text()}`);

      const data = (await res.json()) as OpenAiTranscribeResponse;
      return { transcript: data.text ?? '' };
    });
  },

  async synthesize(text: string, _languageCode: string, speaker?: string): Promise<SynthesizeResult> {
    return speechApiKeyOverrides.executeWithFailover('openai', async (apiKey) => {
      const res = await fetch(`${BASE_URL}/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: speaker || 'alloy', response_format: 'mp3' }),
      });
      if (!res.ok) throw new Error(`OpenAI text-to-speech failed (${res.status}): ${await res.text()}`);

      // Unlike Sarvam, OpenAI's TTS returns the raw audio bytes directly (not JSON-wrapped base64) — encode it ourselves.
      const audioBase64 = Buffer.from(await res.arrayBuffer()).toString('base64');
      return { audioBase64, audioFormat: 'mp3' };
    });
  },
};
