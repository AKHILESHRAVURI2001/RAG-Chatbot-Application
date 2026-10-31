import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhisperTranscriptionProvider } from '../../src/transcription/whisperTranscriptionProvider';

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: any[] = [];
  terminated = false;

  postMessage(msg: any) {
    this.posted.push(msg);
  }

  terminate() {
    this.terminated = true;
  }

  emit(data: any) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

let lastProcessor: { onaudioprocess: ((e: any) => void) | null } | null = null;

class FakeAudioContext {
  destination = {};
  sampleRate: number;
  constructor(opts?: { sampleRate?: number }) {
    // Mirrors a browser that actually honors the requested rate — the common case. A dedicated
    // test below covers a browser that doesn't.
    this.sampleRate = opts?.sampleRate ?? 16000;
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createScriptProcessor() {
    lastProcessor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null } as any;
    return lastProcessor;
  }
  createGain() {
    return { gain: { value: 0 }, connect: vi.fn() };
  }
  close() {
    return Promise.resolve();
  }
}

function fakeAudioEvent(samples: number[]): any {
  return { inputBuffer: { getChannelData: () => new Float32Array(samples) } };
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('WhisperTranscriptionProvider', () => {
  let lastWorker: FakeWorker;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    lastWorker = undefined as any;
    vi.stubGlobal(
      'Worker',
      vi.fn().mockImplementation(() => {
        lastWorker = new FakeWorker();
        return lastWorker;
      }),
    );
    vi.stubGlobal('AudioContext', FakeAudioContext);
    getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns false when the browser has no Worker support', () => {
    vi.stubGlobal('Worker', undefined);
    const provider = new WhisperTranscriptionProvider();
    expect(provider.start({ onTranscript: vi.fn() })).toBe(false);
  });

  it('returns false when the browser has no getUserMedia support', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const provider = new WhisperTranscriptionProvider();
    expect(provider.start({ onTranscript: vi.fn() })).toBe(false);
  });

  it('posts a load request to the worker on start', () => {
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn() });
    expect(lastWorker.posted).toEqual([{ type: 'load' }]);
  });

  it('reports onLoading(true) synchronously on start, then onLoading(false) once ready', async () => {
    const onLoading = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn(), onLoading });

    expect(onLoading).toHaveBeenCalledWith(true);
    onLoading.mockClear();

    lastWorker.emit({ type: 'ready' });
    await flushMicrotasks();

    expect(onLoading).toHaveBeenCalledWith(false);
  });

  it('clears onLoading if the model never finishes loading in time', () => {
    vi.useFakeTimers();
    const onLoading = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn(), onLoading });
    onLoading.mockClear();

    vi.advanceTimersByTime(45_000);

    expect(onLoading).toHaveBeenCalledWith(false);
  });

  it('clears onLoading immediately if the worker errors while still loading', () => {
    const onLoading = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn(), onLoading });
    onLoading.mockClear();

    lastWorker.emit({ type: 'error', message: 'boom' });

    expect(onLoading).toHaveBeenCalledWith(false);
  });

  it('requests the microphone once the worker reports ready, and reports listening=true', async () => {
    const onStateChange = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn(), onStateChange });

    lastWorker.emit({ type: 'ready' });
    await flushMicrotasks();

    expect(getUserMedia).toHaveBeenCalled();
    expect(onStateChange).toHaveBeenCalledWith(true);
  });

  it('forwards a transcription result to onTranscript', async () => {
    const onTranscript = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript });
    lastWorker.emit({ type: 'ready' });
    await flushMicrotasks();

    lastWorker.emit({ type: 'result', text: 'hello world' });
    expect(onTranscript).toHaveBeenCalledWith('hello world');
  });

  it('ignores an empty transcription result', async () => {
    const onTranscript = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript });
    lastWorker.emit({ type: 'ready' });
    await flushMicrotasks();

    lastWorker.emit({ type: 'result', text: '' });
    expect(onTranscript).not.toHaveBeenCalled();
  });

  describe('onAnalyzing', () => {
    it('fires true when a chunk starts processing, then false once the result comes back', async () => {
      const onAnalyzing = vi.fn();
      const provider = new WhisperTranscriptionProvider();
      provider.start({ onTranscript: vi.fn(), onAnalyzing });
      lastWorker.emit({ type: 'ready' });
      await flushMicrotasks();

      lastProcessor!.onaudioprocess!(fakeAudioEvent([1, 0.5, 0]));
      provider.stop(); // buffer has data → triggers the final-pass runTranscription()

      expect(onAnalyzing).toHaveBeenCalledWith(true);
      onAnalyzing.mockClear();

      lastWorker.emit({ type: 'result', text: 'hi' });
      expect(onAnalyzing).toHaveBeenCalledWith(false);
    });

    it('clears onAnalyzing if stopped while a chunk is still mid-analysis (its result will never arrive)', async () => {
      vi.useFakeTimers();
      const onAnalyzing = vi.fn();
      const provider = new WhisperTranscriptionProvider();
      provider.start({ onTranscript: vi.fn(), onAnalyzing });
      lastWorker.emit({ type: 'ready' });
      await vi.advanceTimersByTimeAsync(0);

      lastProcessor!.onaudioprocess!(fakeAudioEvent([1, 0.5, 0]));
      await vi.advanceTimersByTimeAsync(2500); // the periodic interval triggers runTranscription()

      expect(onAnalyzing).toHaveBeenCalledWith(true);
      onAnalyzing.mockClear();

      provider.stop(); // abandons the in-flight analysis — the worker is terminated outright

      expect(onAnalyzing).toHaveBeenCalledWith(false);
    });
  });

  it('gives up and reports listening=false if the model never finishes loading in time', () => {
    vi.useFakeTimers();
    const onStateChange = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn(), onStateChange });

    vi.advanceTimersByTime(45_000);

    expect(onStateChange).toHaveBeenCalledWith(false);
    expect(lastWorker.terminated).toBe(true);
  });

  it('does not time out once the worker has already reported ready', async () => {
    vi.useFakeTimers();
    const onStateChange = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn(), onStateChange });

    lastWorker.emit({ type: 'ready' });
    await vi.advanceTimersByTimeAsync(0);
    onStateChange.mockClear();

    vi.advanceTimersByTime(45_000);

    expect(onStateChange).not.toHaveBeenCalledWith(false);
  });

  it('reports listening=false immediately if the worker errors while still loading', () => {
    const onStateChange = vi.fn();
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn(), onStateChange });

    lastWorker.emit({ type: 'error', message: 'boom' });

    expect(onStateChange).toHaveBeenCalledWith(false);
    expect(lastWorker.terminated).toBe(true);
  });

  it('stop() terminates the worker once any final transcription settles', async () => {
    const provider = new WhisperTranscriptionProvider();
    provider.start({ onTranscript: vi.fn() });
    lastWorker.emit({ type: 'ready' });
    await flushMicrotasks();

    provider.stop();

    expect(lastWorker.terminated).toBe(true);
  });

  describe('sample-rate handling', () => {
    it('sends captured audio unchanged when the AudioContext actually runs at 16kHz', async () => {
      const provider = new WhisperTranscriptionProvider();
      provider.start({ onTranscript: vi.fn() });
      lastWorker.emit({ type: 'ready' });
      await flushMicrotasks();

      lastProcessor!.onaudioprocess!(fakeAudioEvent([1, 0.5, 0]));
      provider.stop();

      const transcribeMsg = lastWorker.posted.find((m) => m.type === 'transcribe');
      expect(transcribeMsg).toBeDefined();
      expect(Array.from(transcribeMsg.audio)).toEqual([1, 0.5, 0]);
    });

    it('resamples captured audio to 16kHz before transcribing when the browser ignored the requested rate', async () => {
      // Regression test for garbled transcripts: some browsers/devices silently keep the
      // hardware's native rate (e.g. 48000) instead of honoring the AudioContext constructor's
      // sampleRate hint. Feeding Whisper un-resampled 48kHz audio makes every word sound 3x sped
      // up to the model, producing wrong/garbled words rather than an accuracy issue.
      class MismatchedAudioContext extends FakeAudioContext {
        constructor(opts?: { sampleRate?: number }) {
          super(opts);
          this.sampleRate = 48000;
        }
      }
      vi.stubGlobal('AudioContext', MismatchedAudioContext);

      const provider = new WhisperTranscriptionProvider();
      provider.start({ onTranscript: vi.fn() });
      lastWorker.emit({ type: 'ready' });
      await flushMicrotasks();

      // 3 samples at a (fake) actual rate of 48000 resample down to 1 sample at 16000 (3:1 ratio).
      lastProcessor!.onaudioprocess!(fakeAudioEvent([1, 0.5, 0]));
      provider.stop();

      const transcribeMsg = lastWorker.posted.find((m) => m.type === 'transcribe');
      expect(transcribeMsg).toBeDefined();
      expect(transcribeMsg.audio.length).toBe(1);
      expect(transcribeMsg.audio[0]).toBeCloseTo(1);
    });
  });

  describe('preload()', () => {
    it('loads the model without touching the microphone', async () => {
      const onLoading = vi.fn();
      const provider = new WhisperTranscriptionProvider();
      expect(provider.preload(onLoading)).toBe(true);

      expect(onLoading).toHaveBeenCalledWith(true);
      expect(lastWorker.posted).toEqual([{ type: 'load' }]);

      lastWorker.emit({ type: 'ready' });
      await flushMicrotasks();

      expect(getUserMedia).not.toHaveBeenCalled();
      expect(onLoading).toHaveBeenCalledWith(false);
    });

    it('is a no-op if a worker is already loading/loaded', () => {
      const provider = new WhisperTranscriptionProvider();
      provider.preload(vi.fn());
      const worker = lastWorker;

      expect(provider.preload(vi.fn())).toBe(true);

      expect(lastWorker).toBe(worker); // no second Worker was created
      expect(worker.posted).toEqual([{ type: 'load' }]); // only one 'load' was ever posted
    });

    it('a later start() reuses the preloaded worker instead of creating a new one, once ready', async () => {
      const provider = new WhisperTranscriptionProvider();
      provider.preload(vi.fn());
      const worker = lastWorker;
      worker.emit({ type: 'ready' });
      await flushMicrotasks();

      const onStateChange = vi.fn();
      const started = provider.start({ onTranscript: vi.fn(), onStateChange });

      expect(started).toBe(true);
      expect(lastWorker).toBe(worker); // same worker reused, not recreated
      await flushMicrotasks();
      expect(getUserMedia).toHaveBeenCalled();
      expect(onStateChange).toHaveBeenCalledWith(true);
    });

    it('a later start() while still loading waits for the same worker to become ready, then starts the mic', async () => {
      const provider = new WhisperTranscriptionProvider();
      provider.preload(vi.fn());
      const worker = lastWorker;

      const onStateChange = vi.fn();
      const started = provider.start({ onTranscript: vi.fn(), onStateChange });
      expect(started).toBe(true);
      expect(lastWorker).toBe(worker);

      worker.emit({ type: 'ready' });
      await flushMicrotasks();

      expect(getUserMedia).toHaveBeenCalled();
      expect(onStateChange).toHaveBeenCalledWith(true);
    });

    it('stop() cancels an in-progress preload and frees the worker', () => {
      const provider = new WhisperTranscriptionProvider();
      provider.preload(vi.fn());
      const worker = lastWorker;

      provider.stop();

      expect(worker.terminated).toBe(true);
    });
  });
});
