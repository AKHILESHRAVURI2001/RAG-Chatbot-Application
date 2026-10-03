import { GoogleGenerativeAI } from '@google/generative-ai';
import { embeddingApiKeyOverrides } from '../../config/embeddingApiKeyOverrides';
import type { EmbeddingProvider } from './provider';

export const geminiEmbeddingProvider: EmbeddingProvider = {
  name: 'gemini',
  isConfigured: () => Boolean(embeddingApiKeyOverrides.get('gemini')),

  embedText(text: string, model: string): Promise<number[]> {
    const modelName = model && model.trim() ? model.trim() : 'text-embedding-004';
    return embeddingApiKeyOverrides.executeWithFailover('gemini', async (apiKey) => {
      const client = new GoogleGenerativeAI(apiKey);
      const generativeModel = client.getGenerativeModel({ model: modelName });
      const res = await generativeModel.embedContent(text.slice(0, 8000));
      return res.embedding.values ?? [];
    });
  },

  async embedBatch(texts: string[], model: string): Promise<number[][]> {
    const modelName = model && model.trim() ? model.trim() : 'text-embedding-004';
    return embeddingApiKeyOverrides.executeWithFailover('gemini', async (apiKey) => {
      const client = new GoogleGenerativeAI(apiKey);
      const generativeModel = client.getGenerativeModel({ model: modelName });
      const results = await Promise.all(
        texts.map((t) => generativeModel.embedContent(t.slice(0, 8000))),
      );
      return results.map((r) => r.embedding.values ?? []);
    });
  },
};
