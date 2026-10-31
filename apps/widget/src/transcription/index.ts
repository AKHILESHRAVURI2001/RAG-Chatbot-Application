export type { TranscriptionCallbacks, TranscriptionProvider } from './types';
export { WebSpeechTranscriptionProvider } from './webSpeechTranscriptionProvider';
export { WhisperTranscriptionProvider } from './whisperTranscriptionProvider';

import { WhisperTranscriptionProvider } from './whisperTranscriptionProvider';
import type { TranscriptionProvider } from './types';

/**
 * The single place that decides which speech-to-text engine the widget uses. Callers (see
 * widgetAudio.ts) always go through this function rather than instantiating a provider directly,
 * so migrating to a different engine later — a cloud STT API, a different browser API, whatever —
 * means changing just this one function. Nothing else needs to know or care which implementation
 * is actually running.
 *
 * Currently: WhisperTranscriptionProvider — an open-source model (OpenAI's Whisper) running
 * entirely client-side via WASM, instead of WebSpeechTranscriptionProvider's browser-native API
 * (which is free but not open-source — in Chrome/Edge it's backed by Google's proprietary cloud
 * speech service). Swap the class instantiated below to go back to it.
 */
export function createTranscriptionProvider(): TranscriptionProvider {
  return new WhisperTranscriptionProvider();
}
