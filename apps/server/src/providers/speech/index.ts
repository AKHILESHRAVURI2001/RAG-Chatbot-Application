import type { SpeechProviderName } from '../../shared';
import type { SpeechProvider } from './provider';
import { sarvamProvider } from './sarvam';
import { openaiSpeechProvider } from './openai';

const registry: Record<SpeechProviderName, SpeechProvider> = {
  sarvam: sarvamProvider,
  openai: openaiSpeechProvider,
};

export function getSpeechProvider(name: SpeechProviderName): SpeechProvider {
  const provider = registry[name];
  if (!provider) throw new Error(`Unknown speech provider "${name}"`);
  return provider;
}

export function listSpeechProviderStatus() {
  return (Object.keys(registry) as SpeechProviderName[]).map((name) => ({
    name,
    configured: registry[name].isConfigured(),
  }));
}
