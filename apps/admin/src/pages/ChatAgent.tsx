import { useEffect, useState } from 'react';
import { FiCpu, FiMessageCircle, FiKey, FiDatabase } from 'react-icons/fi';
import type { LlmSettings, PromptSettings, ApiKeySettings, VoiceSettings } from '../shared';
import { api } from '../lib/api';
import { ReadOnlyGuard } from '../components/ReadOnlyGuard';
import { PageSpinner } from '../components/ui/Spinner';
import PageHeader from '../components/ui/PageHeader';
import { toast } from '../components/ui/Toast';

import ApiKeysTab from '../components/chatAgent/ApiKeysTab';
import ProviderModelTab from '../components/chatAgent/ProviderModelTab';
import ContextLimitsTab from '../components/chatAgent/ContextLimitsTab';
import PromptGreetingTab from '../components/chatAgent/PromptGreetingTab';

const TABS = [
  { id: 'promptGreeting', label: 'Prompt & Greeting', icon: FiMessageCircle },
  { id: 'providerModel', label: 'Provider, Model & Tuning', icon: FiCpu },
  { id: 'contextLimits', label: 'Context, Memory & Compaction', icon: FiDatabase },
  { id: 'apiKeys', label: 'API Keys', icon: FiKey },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function ChatAgent() {
  const [tab, setTab] = useState<TabId>('promptGreeting');
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [prompt, setPrompt] = useState<PromptSettings | null>(null);
  const [providers, setProviders] = useState<{ name: string; configured: boolean }[]>([]);
  const [voice, setVoice] = useState<VoiceSettings | null>(null);
  const [speechConfigured, setSpeechConfigured] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeySettings>({ anthropic: '', openai: '', gemini: '', custom: '' });
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { healthy: boolean; summary: string }>>({});

  async function testKeyPool(providerName: 'anthropic' | 'openai' | 'gemini' | 'custom') {
    setTestingProvider(providerName);
    try {
      const res = await api.testLlmKey({
        provider: providerName,
        key: apiKeys[providerName] || undefined,
        baseUrl: providerName === 'custom' ? llm?.customBaseUrl : undefined,
      });
      if (res.healthyCount === res.totalKeys && res.healthyCount > 0) {
        setTestResults((prev) => ({
          ...prev,
          [providerName]: { healthy: true, summary: `✓ ${res.healthyCount}/${res.totalKeys} key(s) verified healthy (${res.results[0]?.latencyMs ?? 0}ms)` },
        }));
        toast.success(`${providerName} key pool verified healthy.`);
      } else if (res.healthyCount > 0) {
        setTestResults((prev) => ({
          ...prev,
          [providerName]: { healthy: true, summary: `⚠ ${res.healthyCount}/${res.totalKeys} keys healthy (failover operational)` },
        }));
        toast.info(`${providerName}: ${res.healthyCount}/${res.totalKeys} keys healthy.`);
      } else {
        setTestResults((prev) => ({
          ...prev,
          [providerName]: { healthy: false, summary: `✗ All keys failed: ${res.results[0]?.error ?? 'Auth failed'}` },
        }));
        toast.error(`${providerName} key test failed.`);
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerName]: { healthy: false, summary: `✗ ${err.message}` },
      }));
      toast.error(err.message ?? 'Test failed.');
    } finally {
      setTestingProvider(null);
    }
  }

  function refreshSettings() {
    return api.getSettings().then((s) => {
      setLlm(s.llm);
      setPrompt(s.prompt);
      setProviders(s.providers);
      setVoice(s.voice);
      setSpeechConfigured(s.speechProviders.some((p) => p.configured));
    });
  }

  useEffect(() => {
    refreshSettings().catch((e) => toast.error(e.message ?? 'Failed to load settings.'));
  }, []);

  async function saveApiKeys() {
    const patch = Object.fromEntries(Object.entries(apiKeys).filter(([, v]) => v.trim() !== '')) as Partial<ApiKeySettings>;
    if (Object.keys(patch).length === 0) {
      toast.error('Type a key into at least one field before saving.');
      return;
    }
    try {
      await api.updateApiKeys(patch);
      setApiKeys({ anthropic: '', openai: '', gemini: '', custom: '' });
      await refreshSettings();
      toast.success('API keys saved successfully.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save API keys.');
    }
  }

  async function clearApiKey(name: keyof ApiKeySettings) {
    try {
      await api.updateApiKeys({ [name]: '' });
      await refreshSettings();
      toast.success(`${name} key cleared.`);
    } catch (e: any) {
      toast.error(e.message ?? `Failed to clear ${name} key.`);
    }
  }

  async function save<T>(fn: (v: T) => Promise<T>, value: T, label: string) {
    try {
      await fn(value);
      toast.success(`${label} saved successfully.`);
    } catch (e: any) {
      toast.error(e.message ?? `Failed to save ${label.toLowerCase()}.`);
    }
  }

  if (!llm || !prompt) return <PageSpinner label="Loading settings…" />;

  return (
    <div>
      <PageHeader
        title="Chat Agent"
        description="Everything about the text-answering AI lives here: persona, provider & model selection, response tuning, context/history limits, fallback rules, and API keys."
      />
      <ReadOnlyGuard permission="settings.edit">

      <div className="settings-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`settings-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'promptGreeting' && (
        <PromptGreetingTab
          prompt={prompt}
          setPrompt={setPrompt}
          save={save}
          updatePromptFn={api.updatePrompt}
        />
      )}

      {tab === 'providerModel' && (
        <ProviderModelTab
          llm={llm}
          setLlm={setLlm}
          providers={providers}
          save={save}
          updateLlmFn={api.updateLlm}
        />
      )}

      {tab === 'contextLimits' && (
        <ContextLimitsTab
          llm={llm}
          setLlm={setLlm}
          save={save}
          updateLlmFn={api.updateLlm}
        />
      )}



      {tab === 'apiKeys' && (
        <ApiKeysTab
          apiKeys={apiKeys}
          setApiKeys={setApiKeys}
          testingProvider={testingProvider}
          testResults={testResults}
          testKeyPool={testKeyPool}
          clearApiKey={clearApiKey}
          saveApiKeys={saveApiKeys}
        />
      )}
      </ReadOnlyGuard>
    </div>
  );
}
