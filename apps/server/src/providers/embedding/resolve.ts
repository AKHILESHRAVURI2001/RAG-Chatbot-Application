import { settingsRepo } from '../../db/queries/settings.queries';
import { getEmbeddingProvider } from './index';
import { localEmbeddingProvider } from './local';

const EMBEDDING_CACHE_MAX = 1000;
const embeddingCache = new Map<string, number[]>();

// The settings-driven entry point the rest of the app calls — picks the
// active embedding provider (from the saved Vector Agent settings) and falls
// back to the free local model if OpenAI embeddings are selected but fail.
export async function embedText(text: string): Promise<number[]> {
  const cacheKey = text.trim().toLowerCase();
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  let vector: number[];
  try {
    const chunking = await settingsRepo.getChunking();
    const providerName = chunking.embeddingProvider || 'local';
    if (providerName !== 'local') {
      vector = await getEmbeddingProvider(providerName).embedText(text, chunking.embeddingModel);
    } else {
      vector = await localEmbeddingProvider.embedText(text, '');
    }
  } catch (err: any) {
    console.warn(`[embedText] Embedding provider failed (${err?.message || err}). Falling back to local embeddings.`);
    vector = await localEmbeddingProvider.embedText(text, '');
  }

  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey) embeddingCache.delete(oldestKey);
  }
  embeddingCache.set(cacheKey, vector);
  return vector;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];
  const results: number[][] = new Array(texts.length);

  texts.forEach((t, i) => {
    const cacheKey = t.trim().toLowerCase();
    if (embeddingCache.has(cacheKey)) {
      results[i] = embeddingCache.get(cacheKey)!;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(t);
    }
  });

  if (uncachedTexts.length > 0) {
    let batchVectors: number[][];
    try {
      const chunking = await settingsRepo.getChunking();
      const providerName = chunking.embeddingProvider || 'local';
      if (providerName !== 'local') {
        batchVectors = await getEmbeddingProvider(providerName).embedBatch(uncachedTexts, chunking.embeddingModel);
      } else {
        batchVectors = await localEmbeddingProvider.embedBatch(uncachedTexts, '');
      }
    } catch (err: any) {
      console.warn(`[embedBatch] Embedding provider failed (${err?.message || err}). Falling back to local embeddings.`);
      batchVectors = await localEmbeddingProvider.embedBatch(uncachedTexts, '');
    }

    batchVectors.forEach((vec, idx) => {
      const origIndex = uncachedIndices[idx];
      const cacheKey = uncachedTexts[idx].trim().toLowerCase();
      results[origIndex] = vec;
      if (embeddingCache.size < EMBEDDING_CACHE_MAX) {
        embeddingCache.set(cacheKey, vec);
      }
    });
  }

  return results;
}

export async function warmupEmbedder(): Promise<void> {
  try {
    const chunking = await settingsRepo.getChunking();
    if (chunking.embeddingProvider === 'local') {
      await localEmbeddingProvider.warmup?.();
    }
  } catch {
    /* ignore background warmup failure */
  }
}
