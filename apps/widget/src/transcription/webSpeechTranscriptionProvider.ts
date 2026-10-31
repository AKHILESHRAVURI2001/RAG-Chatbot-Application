import type { TranscriptionCallbacks, TranscriptionProvider } from './types';

/**
 * Browser-native speech-to-text via the Web Speech API (SpeechRecognition). This is the only
 * concrete provider today, and the only file that talks to that API directly — everything else
 * (chatWidgetController, widgetAudio) goes through the TranscriptionProvider interface instead.
 */
export class WebSpeechTranscriptionProvider implements TranscriptionProvider {
  private recognition: any = null;
  private meterStream: MediaStream | null = null;
  private meterAudioContext: AudioContext | null = null;
  private meterAnalyser: AnalyserNode | null = null;
  private meterRafId = 0;

  public start(callbacks: TranscriptionCallbacks): boolean {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return false;

    this.stop();

    try {
      const recognition = new Ctor();
      this.recognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        callbacks.onStateChange?.(true);
        if (callbacks.onLevel) void this.startMeter(callbacks.onLevel);
      };
      recognition.onend = () => {
        this.recognition = null;
        this.stopMeter();
        callbacks.onStateChange?.(false);
      };
      recognition.onerror = () => {
        this.recognition = null;
        this.stopMeter();
        callbacks.onStateChange?.(false);
      };

      // Chrome's continuous SpeechRecognition can re-finalize an earlier phrase as a "new" result
      // after a pause, so re-summing e.results[0..length] on every event double-counts it. Only
      // fold in results from e.resultIndex onward into a running accumulator instead.
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
        if (combined) callbacks.onTranscript(combined);
      };

      recognition.start();
      return true;
    } catch {
      this.recognition = null;
      callbacks.onStateChange?.(false);
      return false;
    }
  }

  public stop(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }
    this.stopMeter();
  }

  /** Measures real mic input level while transcribing, so a UI can only animate when audio is
   *  actually coming in — not a continuous, always-on decorative loop. */
  private async startMeter(onLevel: (level: number) => void): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.meterStream = stream;
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.meterAudioContext = new AudioContextCtor();
      const source = this.meterAudioContext.createMediaStreamSource(stream);
      this.meterAnalyser = this.meterAudioContext.createAnalyser();
      this.meterAnalyser.fftSize = 256;
      source.connect(this.meterAnalyser);
      const data = new Uint8Array(this.meterAnalyser.frequencyBinCount);

      const loop = () => {
        if (!this.meterAnalyser) return;
        this.meterAnalyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const level = Math.min(1, Math.sqrt(sumSquares / data.length) * 6);
        onLevel(level);
        this.meterRafId = requestAnimationFrame(loop);
      };
      this.meterRafId = requestAnimationFrame(loop);
    } catch {
      /* mic unavailable for metering — transcription still works, the UI just stays idle */
    }
  }

  private stopMeter(): void {
    cancelAnimationFrame(this.meterRafId);
    this.meterAnalyser = null;
    this.meterStream?.getTracks().forEach((t) => t.stop());
    this.meterStream = null;
    this.meterAudioContext?.close().catch(() => {});
    this.meterAudioContext = null;
  }
}
