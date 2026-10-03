export interface TranscribeResult {
  transcript: string;
  languageCode?: string;
}

export interface SynthesizeResult {
  audioBase64: string;
  audioFormat: string;
}

export interface SpeechProvider {
  name: string;
  isConfigured(): boolean;
  transcribe(audio: Buffer, filename: string, languageCode?: string): Promise<TranscribeResult>;
  synthesize(text: string, languageCode: string, speaker?: string): Promise<SynthesizeResult>;
}
