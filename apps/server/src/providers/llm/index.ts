import type { LlmProviderName } from '../../shared';
import type { LlmProvider } from './provider';
import { anthropicProvider } from './anthropic';
import { openaiProvider } from './openai';
import { geminiProvider } from './gemini';
import { customProvider } from './custom';

const registry: Record<LlmProviderName, LlmProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  custom: customProvider,
};

export function getLlmProvider(name: LlmProviderName): LlmProvider {
  const provider = registry[name];
  if (!provider) throw new Error(`Unknown LLM provider "${name}"`);
  return provider;
}

export function listProviderStatus() {
  return (Object.keys(registry) as LlmProviderName[]).map((name) => ({
    name,
    configured: registry[name].isConfigured(),
  }));
}
