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

  private dictationRecognition: any = null;

  public startDictation(
    onTranscript: (text: string) => void,
    onStateChange?: (listening: boolean) => void,
  ): boolean {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return false;

    this.stopDictation();

    try {
      const recognition = new Ctor();
      this.dictationRecognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => onStateChange?.(true);
      recognition.onend = () => {
        this.dictationRecognition = null;
        onStateChange?.(false);
      };
      recognition.onerror = () => {
        this.dictationRecognition = null;
        onStateChange?.(false);
      };

      // Chrome's continuous SpeechRecognition can re-finalize an earlier phrase
      // as a "new" result after a pause, so re-summing e.results[0..length] on
      // every event double-counts it. Only fold in results from e.resultIndex
      // onward into a running accumulator instead.
      let finalTranscript = '';
      recognition.onresult = (e: any) => {
        let interimTranscript = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTranscript += e.results[i][0].transcript + ' ';
          } else {
            interimTranscript += e.results[i][0].transcript;
          }
        }
        const combined = (finalTranscript + interimTranscript).trim();
        if (combined) onTranscript(combined);
      };

      recognition.start();
      return true;
    } catch {
      this.dictationRecognition = null;
      onStateChange?.(false);
      return false;
    }
  }

  public stopDictation(): void {
    if (this.dictationRecognition) {
      try {
        this.dictationRecognition.stop();
      } catch {
        /* ignore */
      }
      this.dictationRecognition = null;
    }
  }

  public cleanup(): void {
    if (this.currentPlayingAudio) {
      this.currentPlayingAudio.pause();
      this.currentPlayingAudio = null;
    }
    this.stopDictation();
    this.stopRecording();
    this.stopBargeIn();
  }
}
