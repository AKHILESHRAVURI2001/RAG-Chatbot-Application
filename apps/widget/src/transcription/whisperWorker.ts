import type { AutomaticSpeechRecognitionPipeline, pipeline as PipelineFn } from '@huggingface/transformers';

export type WhisperWorkerRequest = { type: 'load' } | { type: 'transcribe'; audio: Float32Array };

export type WhisperWorkerResponse =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'result'; text: string };

// Loaded from the CDN at runtime, not bundled by Vite. Statically importing this package made Vite
// base64-inline onnxruntime-web's WASM binaries (9–28MB each) directly into this worker's own JS
// chunk — confirmed ballooning it to ~72MB. Loading it from jsdelivr instead means the library's
// own WASM loading resolves correctly relative to ITS OWN CDN location (verified end-to-end: model
// loads, and a real speech sample transcribes correctly), the same way the Whisper model weights
// themselves already stream live from Hugging Face's CDN rather than being bundled. `@vite-ignore`
// tells Vite this is a genuine runtime URL, not a local module to analyze/bundle; the only thing
// pulled from the npm package at build time is its type declarations (devDependency, erased at
// compile time — never shipped).
const TRANSFORMERS_CDN_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/+esm';

// English Whisper model (q8-quantized) — "base" rather than "tiny" for noticeably better accuracy
// on accents/unclear speech, at the cost of a bigger one-time download (~74MB vs ~43MB, cached by
// the browser after that). Runs entirely in this worker via WASM; no audio or model data ever
// reaches a server.
const MODEL_ID = 'onnx-community/whisper-base.en';

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const mod: { pipeline: typeof PipelineFn } = await import(/* @vite-ignore */ TRANSFORMERS_CDN_URL);
      return mod.pipeline('automatic-speech-recognition', MODEL_ID, { dtype: 'q8' }) as Promise<AutomaticSpeechRecognitionPipeline>;
    })();
  }
  return transcriberPromise;
}

function post(message: WhisperWorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = async (e: MessageEvent<WhisperWorkerRequest>) => {
  try {
    if (e.data.type === 'load') {
      await getTranscriber();
      post({ type: 'ready' });
    } else if (e.data.type === 'transcribe') {
      const transcriber = await getTranscriber();
      const result: any = await transcriber(e.data.audio);
      const text = (Array.isArray(result) ? result[0]?.text : result?.text) ?? '';
      post({ type: 'result', text: String(text).trim() });
    }
  } catch (err: any) {
    post({ type: 'error', message: err?.message ?? String(err) });
  }
};
