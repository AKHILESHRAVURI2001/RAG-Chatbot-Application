import { env } from '../../config/env';
import type { EmbeddingProvider } from './provider';

// Local embeddings via Xenova transformers — runs in-process, free, no API key needed.
let pipelinePromise: Promise<any> | null = null;

async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env: xenv } = await import('@xenova/transformers');
      xenv.allowRemoteModels = true;
      return pipeline('feature-extraction', env.EMBEDDING_MODEL, { quantized: true });
    })();
  }
  return pipelinePromise;
}

async function embedOne(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const output = await extractor(text.slice(0, 8000), { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export const localEmbeddingProvider: EmbeddingProvider = {
  name: 'local',
  isConfigured: () => true,

  embedText: (text: string) => embedOne(text),

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const t of texts) {
      results.push(await embedOne(t));
    }
    return results;
  },

  async warmup(): Promise<void> {
    const extractor = await getPipeline();
    await extractor('warmup', { pooling: 'mean', normalize: true });
  },
};
