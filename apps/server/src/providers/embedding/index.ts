import type { EmbeddingProviderName } from '../../shared';
import type { EmbeddingProvider } from './provider';
import { localEmbeddingProvider } from './local';
import { openaiEmbeddingProvider } from './openai';
import { geminiEmbeddingProvider } from './gemini';
import { customEmbeddingProvider } from './custom';

const registry: Record<EmbeddingProviderName, EmbeddingProvider> = {
  local: localEmbeddingProvider,
  openai: openaiEmbeddingProvider,
  gemini: geminiEmbeddingProvider,
  custom: customEmbeddingProvider,
};

export function getEmbeddingProvider(name: EmbeddingProviderName): EmbeddingProvider {
  const provider = registry[name];
  if (!provider) throw new Error(`Unknown embedding provider "${name}"`);
  return provider;
}

export function listEmbeddingProviderStatus() {
  return (Object.keys(registry) as EmbeddingProviderName[]).map((name) => ({
    name,
    configured: registry[name].isConfigured(),
  }));
}
