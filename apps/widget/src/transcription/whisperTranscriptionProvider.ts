import type { TranscriptionCallbacks, TranscriptionProvider } from './types';
import type { WhisperWorkerRequest, WhisperWorkerResponse } from './whisperWorker';

const CHUNK_INTERVAL_MS = 2500;
const TARGET_SAMPLE_RATE = 16000;
// The model is a ~74MB one-time download (cached after) plus the library itself from the CDN —
// generous enough for a slow connection, but bounded so a stuck/failed load gives up and resets
// the UI instead of leaving the mic button stuck in a "listening" state forever.
const LOAD_TIMEOUT_MS = 45_000;

/**
 * Open-source, fully client-side speech-to-text using OpenAI's Whisper model, run in a Web
 * Worker via WASM (see whisperWorker.ts) — no audio ever leaves the browser, no server involved.
 *
 * Unlike WebSpeechTranscriptionProvider, this isn't a native streaming API: Whisper transcribes
 * a buffer of audio, not a live stream. To approximate live dictation, this re-transcribes the
 * full audio captured so far every CHUNK_INTERVAL_MS (replacing the previous interim result each
 * time), then runs one final pass on stop() for the most accurate result — a deliberate
 * approximation, not true real-time streaming, since no such thing exists for Whisper today.
 */
export class WhisperTranscriptionProvider implements TranscriptionProvider {
  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private buffer: number[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private callbacks: TranscriptionCallbacks | null = null;
  private busy = false;
  private stopping = false;
  private workerReady = false;
  private loadTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // True once a real start() (not just preload()) has claimed the current worker — see preload().
  private wantsMic = false;
  // The AudioContext's *actual* sample rate — requesting TARGET_SAMPLE_RATE in its constructor is
  // only a hint; some browsers/devices silently ignore it and keep the hardware's native rate
  // (commonly 44100/48000) instead. Whisper has no idea what rate its input is — it just assumes
  // 16kHz — so feeding it audio recorded at any other rate without resampling first makes every
  // word sound sped up or slowed down to the model, producing genuinely wrong/garbled transcripts
  // rather than merely imperfect ones. resampleTo16k() below corrects for that before each transcribe.
  private actualSampleRate = TARGET_SAMPLE_RATE;

  /** Begins loading the model in the background without requesting the mic or starting a
   *  recording session (see WidgetAudioService.preloadDictationModel). A later start() reuses this
   *  same worker — skipping straight to the mic once it's ready — instead of loading the model all
   *  over again. Safe to call repeatedly, or alongside an already-active session: a no-op either way. */
  public preload(onLoading?: (loading: boolean) => void): boolean {
    if (typeof Worker === 'undefined') return false;
    if (this.worker) return true;
    this.callbacks = { onTranscript: () => {}, onLoading };
    this.wantsMic = false;
    return this.beginLoad();
  }

  public start(callbacks: TranscriptionCallbacks): boolean {
    if (typeof Worker === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;

    if (this.worker && !this.wantsMic) {
      // Reuse the worker a prior preload() call already started loading, instead of discarding it
      // and starting from scratch — that's the whole point of preloading.
      this.callbacks = callbacks;
      this.stopping = false;
      this.wantsMic = true;
      this.buffer = [];
      if (this.workerReady) void this.setupMic();
      // else: still loading — handleWorkerMessage's 'ready' branch calls setupMic() once it lands,
      // and the preload's own loadTimeoutId is still armed to give up if it never does.
      return true;
    }

    this.stop();
    this.callbacks = callbacks;
    this.wantsMic = true;
    this.buffer = [];
    return this.beginLoad();
  }

  private beginLoad(): boolean {
    this.stopping = false;
    this.workerReady = false;

    try {
      this.worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      this.worker = null;
      return false;
    }

    // The model is a one-time, possibly large (~85MB combined) download on first use — tell the
    // UI so it can show a "loading voice recognition" state instead of looking stuck/broken.
    this.callbacks?.onLoading?.(true);

    this.worker.onmessage = (e: MessageEvent<WhisperWorkerResponse>) => this.handleWorkerMessage(e.data);
    this.worker.onerror = () => {
      // stop() clears the loading state (see below) regardless of which phase this fires in.
      this.callbacks?.onStateChange?.(false);
      this.stop();
    };
    this.loadTimeoutId = setTimeout(() => {
      if (!this.workerReady) {
        this.callbacks?.onStateChange?.(false);
        this.stop();
      }
    }, LOAD_TIMEOUT_MS);
    this.postToWorker({ type: 'load' });

    return true;
  }

  public stop(): void {
    this.stopping = true;
    this.callbacks?.onLoading?.(false);
    if (this.loadTimeoutId !== null) {
      clearTimeout(this.loadTimeoutId);
      this.loadTimeoutId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // One last pass on whatever's left in the buffer, for the most accurate final transcript —
    // the worker is only torn down once that result (or an error) comes back, in handleWorkerMessage.
    if (this.workerReady && !this.busy && this.buffer.length > 0) {
      this.runTranscription();
    } else {
      // Abandoning the worker mid-analysis (busy was already true) means its result/error will
      // never arrive to clear this itself — clear it here so the UI doesn't stay stuck "analyzing".
      this.callbacks?.onAnalyzing?.(false);
      this.teardownWorker();
    }
    this.teardownAudio();
    this.callbacks?.onStateChange?.(false);
  }

  private postToWorker(message: WhisperWorkerRequest): void {
    this.worker?.postMessage(message);
  }

  private handleWorkerMessage(msg: WhisperWorkerResponse): void {
    if (msg.type === 'ready') {
      if (this.loadTimeoutId !== null) {
        clearTimeout(this.loadTimeoutId);
        this.loadTimeoutId = null;
      }
      this.callbacks?.onLoading?.(false);
      this.workerReady = true;
      // A bare preload() never wants the mic — only a real start() (wantsMic=true) does.
      if (this.wantsMic) void this.setupMic();
    } else if (msg.type === 'result') {
      this.busy = false;
      this.callbacks?.onAnalyzing?.(false);
      if (msg.text) this.callbacks?.onTranscript(msg.text);
      if (this.stopping) this.teardownWorker();
    } else if (msg.type === 'error') {
      this.busy = false;
      this.callbacks?.onAnalyzing?.(false);
      if (!this.workerReady) {
        // Failed during the initial model load — no point waiting out the rest of the timeout.
        this.callbacks?.onStateChange?.(false);
        this.stop();
        return;
      }
      if (this.stopping) this.teardownWorker();
    }
  }

  private teardownWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = false;
    this.wantsMic = false;
  }

  private teardownAudio(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }

  private async setupMic(): Promise<void> {
    if (this.stopping) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.stopping) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      // Request 16kHz directly — Whisper's expected input rate — but verify it actually took (see
      // actualSampleRate above); not every browser honors a non-native rate here.
      this.audioContext = new AudioContextCtor({ sampleRate: TARGET_SAMPLE_RATE });
      this.actualSampleRate = this.audioContext.sampleRate;
      this.source = this.audioContext.createMediaStreamSource(stream);
      // ScriptProcessorNode is deprecated but universally supported; it only collects samples
      // here (no heavy compute on the main thread — inference runs in the worker).
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (e) => {
        const channelData = e.inputBuffer.getChannelData(0);
        this.callbacks?.onLevel?.(this.computeLevel(channelData));
        for (let i = 0; i < channelData.length; i++) this.buffer.push(channelData[i]);
      };
      this.source.connect(this.processor);
      // Some browsers only pump onaudioprocess if the node is connected to a destination.
      // Route through a silent gain node so this doesn't audibly echo the mic back out.
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.processor.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

      this.callbacks?.onStateChange?.(true);
      this.intervalId = setInterval(() => this.runTranscription(), CHUNK_INTERVAL_MS);
    } catch {
      this.callbacks?.onStateChange?.(false);
      this.stop();
    }
  }

  private computeLevel(data: Float32Array): number {
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) sumSquares += data[i] * data[i];
    return Math.min(1, Math.sqrt(sumSquares / data.length) * 6);
  }

  private runTranscription(): void {
    if (this.busy || this.buffer.length === 0 || !this.workerReady) return;
    this.busy = true;
    this.callbacks?.onAnalyzing?.(true);
    const audio = this.resampleTo16k(this.buffer, this.actualSampleRate);
    this.postToWorker({ type: 'transcribe', audio });
  }

  /** Linearly resamples captured PCM to Whisper's expected 16kHz when the AudioContext didn't
   *  actually run at that rate (see actualSampleRate) — a no-op copy when it did. Simple linear
   *  interpolation, not a proper sinc filter, but speech intelligibility doesn't need better than
   *  that and it's cheap enough to run on the main thread every CHUNK_INTERVAL_MS. */
  private resampleTo16k(data: number[], fromRate: number): Float32Array {
    if (fromRate === TARGET_SAMPLE_RATE) return new Float32Array(data);
    const ratio = fromRate / TARGET_SAMPLE_RATE;
    const newLength = Math.max(1, Math.round(data.length / ratio));
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const lower = Math.floor(srcIndex);
      const upper = Math.min(lower + 1, data.length - 1);
      const frac = srcIndex - lower;
      result[i] = data[lower] * (1 - frac) + data[upper] * frac;
    }
    return result;
  }
}
