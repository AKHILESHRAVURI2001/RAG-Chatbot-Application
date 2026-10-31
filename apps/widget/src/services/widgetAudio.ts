// Served from public/sounds/ (see vite.config.ts) — Vite copies that folder verbatim into
// dist/sounds/ alongside dist/widget.js, rather than inlining these as base64 into the bundle.
import { getStaticAssetUrl } from '../shared';
import { createTranscriptionProvider, type TranscriptionProvider } from '../transcription';

export interface AudioServiceCallbacks {
  onVolumeChange?: (level: number, isQuiet: boolean) => void;
  onSilenceAutoSubmit?: () => void;
  onCaptionChange?: (text: string) => void;
  onBargeInDetected?: () => void;
}

export class WidgetAudioService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private volumeAnalyser: AnalyserNode | null = null;
  private volumeRafId = 0;
  private speechRecognition: any = null;

  private bargeInStream: MediaStream | null = null;
  private bargeInAudioContext: AudioContext | null = null;
  private bargeInAnalyser: AnalyserNode | null = null;
  private bargeInRafId = 0;
  private currentPlayingAudio: HTMLAudioElement | null = null;

  private readonly BARGE_IN_THRESHOLD = 0.025;
  // A single loud frame (a fan spinning up, a phone's ringtone, a door) must
  // not cut off the bot mid-answer — only genuine, continuous talking does.
  private readonly BARGE_IN_SUSTAIN_MS = 1500;
  private readonly QUIET_THRESHOLD = 0.008;
  // Tuned for both mobile & desktop mics (mobile AGC often gives lower RMS)
  private readonly SPEECH_THRESHOLD = 0.02;
  private readonly QUIET_AFTER_MS = 1500;
  private readonly AUTO_SUBMIT_SILENCE_MS = 2000;

  public async startRecording(
    onChunk: (chunk: Blob) => void,
    callbacks: AudioServiceCallbacks,
  ): Promise<MediaRecorder> {
    this.cleanup();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.recordedStream = stream;

    const recorder = new MediaRecorder(stream);
    this.mediaRecorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) onChunk(e.data);
    };

    this.startVolumeMeter(stream, callbacks);
    this.startCaptions(callbacks.onCaptionChange);

    recorder.start();
    return recorder;
  }

  public stopRecording(onStopped?: () => void): void {
    const recorder = this.mediaRecorder;
    const finish = () => {
      this.stopTracks();
      onStopped?.();
    };
    if (recorder && recorder.state !== 'inactive') {
      recorder.addEventListener('stop', finish, { once: true });
      recorder.stop();
    } else {
      finish();
    }
    this.stopVolumeMeter();
    this.stopCaptions();
    this.mediaRecorder = null;
  }

  public cancelRecording(): void {
    this.stopRecording();
  }

  public playAudio(
    audioData: { base64: string; format: string },
    onEnded: () => void,
    onError: () => void,
  ): HTMLAudioElement {
    if (this.currentPlayingAudio) {
      this.currentPlayingAudio.pause();
      this.currentPlayingAudio = null;
    }
    const audio = new Audio(`data:audio/${audioData.format};base64,${audioData.base64}`);
    this.currentPlayingAudio = audio;
    audio.addEventListener('ended', () => {
      this.currentPlayingAudio = null;
      onEnded();
    }, { once: true });
    audio.addEventListener('error', () => {
      this.currentPlayingAudio = null;
      onError();
    }, { once: true });
    void audio.play().catch(() => onError());
    return audio;
  }

  public async listenForBargeIn(onBargeIn: () => void): Promise<void> {
    try {
      this.stopBargeIn();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.bargeInStream = stream;
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.bargeInAudioContext = new AudioContextCtor();
      const source = this.bargeInAudioContext.createMediaStreamSource(stream);
      this.bargeInAnalyser = this.bargeInAudioContext.createAnalyser();
      this.bargeInAnalyser.fftSize = 256;
      source.connect(this.bargeInAnalyser);
      const data = new Uint8Array(this.bargeInAnalyser.frequencyBinCount);
      let loudSince: number | null = null;

      const loop = () => {
        if (!this.bargeInAnalyser) return;
        this.bargeInAnalyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const level = Math.min(1, Math.sqrt(sumSquares / data.length) * 6);
        const now = performance.now();
        if (level > this.BARGE_IN_THRESHOLD) {
          if (loudSince === null) loudSince = now;
          if (now - loudSince > this.BARGE_IN_SUSTAIN_MS) {
            this.stopBargeIn();
            onBargeIn();
            return;
          }
        } else {
          // A brief blip doesn't count — only a continuous stretch does.
          loudSince = null;
        }
        this.bargeInRafId = requestAnimationFrame(loop);
      };
      this.bargeInRafId = requestAnimationFrame(loop);
    } catch {
      /* ignore */
    }
  }

  public stopBargeIn(): void {
    cancelAnimationFrame(this.bargeInRafId);
    this.bargeInAnalyser = null;
    this.bargeInStream?.getTracks().forEach((t) => t.stop());
    this.bargeInStream = null;
    this.bargeInAudioContext?.close().catch(() => {});
    this.bargeInAudioContext = null;
  }

  private onSpeechActivityHook: (() => void) | null = null;

  private startVolumeMeter(stream: MediaStream, callbacks: AudioServiceCallbacks): void {
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextCtor();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.volumeAnalyser = this.audioContext.createAnalyser();
      this.volumeAnalyser.fftSize = 256;
      source.connect(this.volumeAnalyser);
      const data = new Uint8Array(this.volumeAnalyser.frequencyBinCount);
      let lastAudibleAt = performance.now(); // drives the "can't hear you" UI hint only
      let lastSpeechAt = performance.now(); // drives the actual auto-submit timer
      let hasSpoken = false;
      let noiseFloor = 0.015; // Dynamically tracks ambient background noise (fans, bikes, AC)

      // Allow SpeechRecognition word updates to also trigger speech activity
      this.onSpeechActivityHook = () => {
        const now = performance.now();
        lastSpeechAt = now;
        lastAudibleAt = now;
        hasSpoken = true;
      };

      const loop = () => {
        if (!this.volumeAnalyser) return;
        this.volumeAnalyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const level = Math.min(1, Math.sqrt(sumSquares / data.length) * 6);
        const now = performance.now();

        // Adaptive noise floor: quickly adapts downwards to quiet, slowly drifts up with background noise
        if (level < noiseFloor) {
          noiseFloor = noiseFloor * 0.85 + level * 0.15;
        } else {
          noiseFloor = noiseFloor * 0.992 + level * 0.008;
        }

        // Higher separation multiplier prevents fan / traffic noise from endlessly extending speech timer
        const dynamicSpeechThreshold = Math.max(0.045, noiseFloor * 2.2);
        const dynamicQuietThreshold = Math.max(0.012, noiseFloor * 1.2);

        if (level > dynamicQuietThreshold) {
          lastAudibleAt = now;
        }
        if (level > dynamicSpeechThreshold) {
          lastSpeechAt = now;
          hasSpoken = true;
        }
        const quiet = now - lastAudibleAt > this.QUIET_AFTER_MS;
        callbacks.onVolumeChange?.(level, quiet);

        // Auto-submit triggers once speech/words were detected and followed by a 2-second pause
        if (hasSpoken && now - lastSpeechAt > this.AUTO_SUBMIT_SILENCE_MS) {
          callbacks.onSilenceAutoSubmit?.();
          return;
        }
        this.volumeRafId = requestAnimationFrame(loop);
      };
      this.volumeRafId = requestAnimationFrame(loop);
    } catch {
      /* ignore */
    }
  }

  private stopVolumeMeter(): void {
    cancelAnimationFrame(this.volumeRafId);
    this.volumeAnalyser = null;
    this.onSpeechActivityHook = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }

  private startCaptions(onCaption?: (text: string) => void): void {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor || !onCaption) return;
    try {
      this.speechRecognition = new Ctor();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = navigator.language || 'en-US';
      let finalCaption = '';
      this.speechRecognition.onresult = (e: any) => {
        this.onSpeechActivityHook?.();
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.trim();
          if (!t) continue;
          if (e.results[i].isFinal) finalCaption += (finalCaption ? ' ' : '') + t;
          else interim += (interim ? ' ' : '') + t;
        }
        onCaption((finalCaption + ' ' + interim).trim());
      };
      this.speechRecognition.onerror = () => {};
      this.speechRecognition.start();
    } catch {
      /* ignore */
    }
  }

  private stopCaptions(): void {
    try {
      this.speechRecognition?.stop();
    } catch {
      /* ignore */
    }
    this.speechRecognition = null;
  }

  private stopTracks(): void {
    this.recordedStream?.getTracks().forEach((t) => t.stop());
    this.recordedStream = null;
  }

  // Delegates to src/transcription/ — see createTranscriptionProvider() to swap the underlying
  // speech-to-text engine; this service just drives whichever one it returns.
  private dictationProvider: TranscriptionProvider | null = null;
  // Set by preloadDictationModel() — a provider that's (or is still) loading its model ahead of
  // time, with no mic/recording started yet. startDictation() adopts it instead of creating a
  // fresh one, so an earlier preload actually pays off instead of being thrown away.
  private preloadedProvider: TranscriptionProvider | null = null;

  /** Starts loading the (large, one-time-download) transcription model in the background, without
   *  touching the mic — see WhisperTranscriptionProvider.preload(). Returns false if the active
   *  provider has no such preload step (e.g. WebSpeechTranscriptionProvider needs none) or if a
   *  dictation session is already running/loading. */
  public preloadDictationModel(onLoading?: (loading: boolean) => void): boolean {
    if (this.preloadedProvider || this.dictationProvider) return true;
    const provider = createTranscriptionProvider();
    if (!provider.preload) return false;
    const started = provider.preload(onLoading);
    if (started) this.preloadedProvider = provider;
    return started;
  }

  /** Cancels and discards an in-progress or finished preload that was never turned into an actual
   *  dictation session (e.g. the visitor turned the setting back off). */
  public cancelDictationPreload(): void {
    this.preloadedProvider?.stop();
    this.preloadedProvider = null;
  }

  public startDictation(
    onTranscript: (text: string) => void,
    onStateChange?: (listening: boolean) => void,
    onLevel?: (level: number) => void,
    onLoading?: (loading: boolean) => void,
    onAnalyzing?: (analyzing: boolean) => void,
  ): boolean {
    this.stopDictation();
    const provider = this.preloadedProvider ?? createTranscriptionProvider();
    this.preloadedProvider = null;
    this.dictationProvider = provider;
    const started = provider.start({ onTranscript, onStateChange, onLevel, onLoading, onAnalyzing });
    if (!started) this.dictationProvider = null;
    return started;
  }

  public stopDictation(): void {
    this.dictationProvider?.stop();
    this.dictationProvider = null;
  }

  private sendSoundEl: HTMLAudioElement | null = null;
  private replySoundEl: HTMLAudioElement | null = null;

  /** Plays the send/reply notification sound (see public/sounds/). Lazily creates one `Audio`
   *  element per sound and replays it from the start on every call, so rapid back-to-back
   *  replies each get their own audible tick instead of being cut off by the previous one. */
  public playNotificationSound(kind: 'send' | 'reply'): void {
    try {
      if (kind === 'send') {
        if (!this.sendSoundEl) this.sendSoundEl = new Audio(getStaticAssetUrl('sounds/send.wav'));
        this.sendSoundEl.currentTime = 0;
        void this.sendSoundEl.play().catch(() => {});
      } else {
        if (!this.replySoundEl) this.replySoundEl = new Audio(getStaticAssetUrl('sounds/reply.wav'));
        this.replySoundEl.currentTime = 0;
        void this.replySoundEl.play().catch(() => {});
      }
    } catch {
      /* a missed notification sound should never block the actual send/reply */
    }
  }

  public cleanup(): void {
    if (this.currentPlayingAudio) {
      this.currentPlayingAudio.pause();
      this.currentPlayingAudio = null;
    }
    this.stopDictation();
    this.cancelDictationPreload();
    this.stopRecording();
    this.stopBargeIn();
  }
}
