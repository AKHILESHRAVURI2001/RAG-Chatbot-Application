import { describe, expect, it } from 'vitest';
import { createTranscriptionProvider, WhisperTranscriptionProvider } from '../../src/transcription';

describe('createTranscriptionProvider', () => {
  it('returns a WhisperTranscriptionProvider by default', () => {
    expect(createTranscriptionProvider()).toBeInstanceOf(WhisperTranscriptionProvider);
  });

  it('returns a fresh instance on every call, not a shared singleton', () => {
    expect(createTranscriptionProvider()).not.toBe(createTranscriptionProvider());
  });
});
