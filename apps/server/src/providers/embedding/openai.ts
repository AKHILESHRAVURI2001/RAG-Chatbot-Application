import OpenAI from 'openai';
import { embeddingApiKeyOverrides } from '../../config/embeddingApiKeyOverrides';
import type { EmbeddingProvider } from './provider';

export const openaiEmbeddingProvider: EmbeddingProvider = {
  name: 'openai',
  isConfigured: () => Boolean(embeddingApiKeyOverrides.get('openai')),

  // `model` always arrives already defaulted from config/defaultSettings.json
  // (see settings.queries.ts's CHUNKING_DEFAULTS) — no fallback needed here.
  embedText(text: string, model: string): Promise<number[]> {
    return embeddingApiKeyOverrides.executeWithFailover('openai', async (apiKey) => {
      const client = new OpenAI({ apiKey });
      const res = await client.embeddings.create({ model, input: text.slice(0, 8000) });
      return res.data[0]?.embedding ?? [];
    });
  },

  embedBatch(texts: string[], model: string): Promise<number[][]> {
    return embeddingApiKeyOverrides.executeWithFailover('openai', async (apiKey) => {
      const client = new OpenAI({ apiKey });
      const res = await client.embeddings.create({ model, input: texts.map((t) => t.slice(0, 8000)) });
      return res.data.map((d) => d.embedding);
    });
  },
};
