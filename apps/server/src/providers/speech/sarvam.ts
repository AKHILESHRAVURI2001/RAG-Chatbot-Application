import { speechApiKeyOverrides } from '../../config/speechApiKeyOverrides';
import type { SpeechProvider, SynthesizeResult, TranscribeResult } from './provider';

const BASE_URL = 'https://api.sarvam.ai';

interface SarvamTranscribeResponse {
  transcript: string;
  language_code?: string | null;
}

interface SarvamSynthesizeResponse {
  audios: string[];
}

export const sarvamProvider: SpeechProvider = {
  name: 'sarvam',
  isConfigured: () => Boolean(speechApiKeyOverrides.get('sarvam')),

  async transcribe(audio: Buffer, filename: string, languageCode?: string): Promise<TranscribeResult> {
    return speechApiKeyOverrides.executeWithFailover('sarvam', async (apiKey) => {
      const form = new FormData();
      // `Buffer` satisfies Blob's BlobPart requirements at runtime; the DOM lib's stricter typing needs the cast.
      form.append('file', new Blob([audio as unknown as BlobPart]), filename);
      form.append('model', 'saaras:v3');
      if (languageCode) form.append('language_code', languageCode);

      const res = await fetch(`${BASE_URL}/speech-to-text`, {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey },
        body: form,
      });
      if (!res.ok) throw new Error(`Sarvam speech-to-text failed (${res.status}): ${await res.text()}`);

      const data = (await res.json()) as SarvamTranscribeResponse;
      return { transcript: data.transcript ?? '', languageCode: data.language_code ?? undefined };
    });
  },

  async synthesize(text: string, languageCode: string, speaker?: string): Promise<SynthesizeResult> {
    return speechApiKeyOverrides.executeWithFailover('sarvam', async (apiKey) => {
      const res = await fetch(`${BASE_URL}/text-to-speech`, {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language_code: languageCode,
          speaker: speaker || undefined,
          model: 'bulbul:v3',
          output_audio_codec: 'mp3', // smaller than the wav default, and every browser plays it natively
        }),
      });
      if (!res.ok) throw new Error(`Sarvam text-to-speech failed (${res.status}): ${await res.text()}`);

      const data = (await res.json()) as SarvamSynthesizeResponse;
      const audioBase64 = data.audios?.[0];
      if (!audioBase64) throw new Error('Sarvam text-to-speech returned no audio');
      return { audioBase64, audioFormat: 'mp3' };
    });
  },
};
