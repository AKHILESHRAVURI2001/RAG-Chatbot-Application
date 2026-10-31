export interface TranscriptionCallbacks {
  /** Called with the running transcript (interim + final text combined) as speech comes in. */
  onTranscript: (text: string) => void;
  /** Called when listening actually starts/stops (may differ from the start() call itself — e.g.
   *  it only becomes true once the engine is really capturing audio). */
  onStateChange?: (listening: boolean) => void;
  /** Called continuously with a 0–1 mic input level while listening, for level-reactive UI. */
  onLevel?: (level: number) => void;
  /** Called true right as start() begins doing one-time setup work before it can actually listen
   *  (e.g. WhisperTranscriptionProvider downloading/loading its model — see LOAD_TIMEOUT_MS),
   *  then false once that finishes (whether it succeeds, fails, or times out). Providers with no
   *  such setup step (e.g. WebSpeechTranscriptionProvider) never call this at all — the UI should
   *  default to "not loading" and only show a loading state once it actually fires true. */
  onLoading?: (loading: boolean) => void;
  /** Called true while a chunk of already-captured speech is actively being processed (e.g.
   *  WhisperTranscriptionProvider running inference on the buffer so far — see CHUNK_INTERVAL_MS),
   *  then false once that result (or an error) comes back. Recording keeps running the whole time;
   *  this is purely a "the engine is thinking" signal for UI feedback. Providers whose transcript
   *  arrives continuously with no separate analysis step (e.g. WebSpeechTranscriptionProvider)
   *  never call this — the UI should default to "not analyzing". */
  onAnalyzing?: (analyzing: boolean) => void;
}

/**
 * A speech-to-text engine, abstracted behind this interface so callers never talk to a specific
 * implementation (today: the browser's Web Speech API) directly. Swap which provider
 * createTranscriptionProvider() (see index.ts) returns to migrate to a different engine —
 * nothing elsewhere in the codebase needs to change.
 */
export interface TranscriptionProvider {
  /** Starts listening. Returns false synchronously if this provider isn't available at all
   *  (e.g. the browser doesn't support the underlying API) — check this before relying on
   *  onStateChange, since it fires asynchronously for the ordinary stop/error cases. */
  start(callbacks: TranscriptionCallbacks): boolean;
  stop(): void;
  /** Optional: begins any one-time setup (e.g. downloading/loading a model) ahead of start(), so
   *  a later start() can skip straight to listening instead of waiting on it. Providers with no
   *  such setup step don't need to implement this — callers should treat it as a no-op if absent. */
  preload?(onLoading?: (loading: boolean) => void): boolean;
}
