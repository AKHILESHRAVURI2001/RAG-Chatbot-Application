import OpenAI from 'openai';
import { embeddingApiKeyOverrides } from '../../config/embeddingApiKeyOverrides';
import { settingsRepo } from '../../db/queries/settings.queries';
import type { EmbeddingProvider } from './provider';

export const customEmbeddingProvider: EmbeddingProvider = {
  name: 'custom',
  isConfigured: () => true,

  async embedText(text: string, model: string): Promise<number[]> {
    const chunking = await settingsRepo.getChunking();
    const baseUrl = chunking.customEmbeddingBaseUrl?.trim() || 'http://localhost:11434/v1';
    const apiKey = embeddingApiKeyOverrides.get('custom') || 'dummy-key';
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    const res = await client.embeddings.create({
      model: model || 'nomic-embed-text',
      input: text.slice(0, 8000),
    });
    return res.data[0]?.embedding ?? [];
  },

  async embedBatch(texts: string[], model: string): Promise<number[][]> {
    const chunking = await settingsRepo.getChunking();
    const baseUrl = chunking.customEmbeddingBaseUrl?.trim() || 'http://localhost:11434/v1';
    const apiKey = embeddingApiKeyOverrides.get('custom') || 'dummy-key';
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    const res = await client.embeddings.create({
      model: model || 'nomic-embed-text',
      input: texts.map((t) => t.slice(0, 8000)),
    });
    return res.data.map((d) => d.embedding);
  },
};
