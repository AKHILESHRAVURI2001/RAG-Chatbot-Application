import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSpeechTranscriptionProvider } from '../../src/transcription/webSpeechTranscriptionProvider';

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onresult: ((e: any) => void) | null = null;
  started = false;
  stopped = false;

  start() {
    this.started = true;
    this.onstart?.();
  }

  stop() {
    this.stopped = true;
    this.onend?.();
  }
}

function result(transcript: string, isFinal: boolean) {
  return { 0: { transcript }, isFinal };
}

describe('WebSpeechTranscriptionProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false and never calls onStateChange when the browser has no SpeechRecognition API', () => {
    const onStateChange = vi.fn();
    const provider = new WebSpeechTranscriptionProvider();
    const started = provider.start({ onTranscript: vi.fn(), onStateChange });
    expect(started).toBe(false);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  describe('with a mocked SpeechRecognition engine', () => {
    let lastInstance: FakeSpeechRecognition;

    beforeEach(() => {
      lastInstance = undefined as any;
      vi.stubGlobal(
        'SpeechRecognition',
        vi.fn().mockImplementation(() => {
          lastInstance = new FakeSpeechRecognition();
          return lastInstance;
        }),
      );
    });

    it('returns true and actually starts the underlying engine', () => {
      const provider = new WebSpeechTranscriptionProvider();
      const started = provider.start({ onTranscript: vi.fn() });
      expect(started).toBe(true);
      expect(lastInstance.started).toBe(true);
    });

    it('reports listening=true once the engine actually starts', () => {
      const onStateChange = vi.fn();
      new WebSpeechTranscriptionProvider().start({ onTranscript: vi.fn(), onStateChange });
      expect(onStateChange).toHaveBeenCalledWith(true);
    });

    it('reports listening=false when the engine ends', () => {
      const onStateChange = vi.fn();
      const provider = new WebSpeechTranscriptionProvider();
      provider.start({ onTranscript: vi.fn(), onStateChange });
      lastInstance.onend?.();
      expect(onStateChange).toHaveBeenLastCalledWith(false);
    });

    it('reports listening=false when the engine errors', () => {
      const onStateChange = vi.fn();
      const provider = new WebSpeechTranscriptionProvider();
      provider.start({ onTranscript: vi.fn(), onStateChange });
      lastInstance.onerror?.();
      expect(onStateChange).toHaveBeenLastCalledWith(false);
    });

    it('stop() stops the underlying engine', () => {
      const provider = new WebSpeechTranscriptionProvider();
      provider.start({ onTranscript: vi.fn() });
      provider.stop();
      expect(lastInstance.stopped).toBe(true);
    });

    it('forwards a single final result as the transcript', () => {
      const onTranscript = vi.fn();
      const provider = new WebSpeechTranscriptionProvider();
      provider.start({ onTranscript });

      lastInstance.onresult?.({ resultIndex: 0, results: [result('Hello', true)] });

      expect(onTranscript).toHaveBeenCalledWith('Hello');
    });

    it('combines an interim result with the input so far', () => {
      const onTranscript = vi.fn();
      const provider = new WebSpeechTranscriptionProvider();
      provider.start({ onTranscript });

      lastInstance.onresult?.({ resultIndex: 0, results: [result('Hel', false)] });

      expect(onTranscript).toHaveBeenLastCalledWith('Hel');
    });

    it('does not double-count an already-finalized phrase when continuous recognition re-finalizes a later one', () => {
      // Mirrors the real Chrome quirk this accumulator is written to handle: once resultIndex 0
      // is finalized, later events only report resultIndex >= 1 — the finalized text must still
      // be remembered (via the accumulator), not just whatever happens to be in e.results this time.
      const onTranscript = vi.fn();
      const provider = new WebSpeechTranscriptionProvider();
      provider.start({ onTranscript });

      lastInstance.onresult?.({ resultIndex: 0, results: [result('Hello', true)] });
      lastInstance.onresult?.({
        resultIndex: 1,
        results: [result('Hello', true), result('wor', false)],
      });
      lastInstance.onresult?.({
        resultIndex: 1,
        results: [result('Hello', true), result('world', true)],
      });

      expect(onTranscript).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onTranscript).toHaveBeenNthCalledWith(2, 'Hello wor');
      expect(onTranscript).toHaveBeenNthCalledWith(3, 'Hello world');
    });

    it('does not throw when onLevel is provided, even without microphone access in the test environment', () => {
      const provider = new WebSpeechTranscriptionProvider();
      expect(() => provider.start({ onTranscript: vi.fn(), onLevel: vi.fn() })).not.toThrow();
    });
  });
});
