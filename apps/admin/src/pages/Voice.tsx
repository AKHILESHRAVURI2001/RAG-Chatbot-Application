import { useEffect, useState } from 'react';
import { FiKey, FiCpu, FiMessageCircle, FiDatabase, FiZap, FiBarChart2 } from 'react-icons/fi';
import type { VoiceSettings } from '../shared';
import { api } from '../lib/api';
import { ReadOnlyGuard } from '../components/ReadOnlyGuard';
import VoiceSettingsCard from '../components/VoiceSettingsCard';
import VoiceApiKeyCard from '../components/VoiceApiKeyCard';
import VoicePromptCard from '../components/VoicePromptCard';
import VoiceTuningCard from '../components/VoiceTuningCard';
import VoiceUsageCard from '../components/VoiceUsageCard';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';

const ALL_TABS = [
  { id: 'prompt', label: 'Prompt', icon: FiMessageCircle },
  { id: 'providerTuning', label: 'Provider, Model & Tuning', icon: FiCpu },
  { id: 'contextLimits', label: 'Context, History & Vector Chunks', icon: FiDatabase },
  { id: 'pipeline', label: 'Query Isolation & Pipeline', icon: FiZap },
  { id: 'apiKeys', label: 'API Keys', icon: FiKey },
  { id: 'usage', label: 'Usage Analytics', icon: FiBarChart2 },
] as const;

export default function Voice() {
  const [tab, setTab] = useState<string>('providerTuning');
  const [voice, setVoice] = useState<VoiceSettings | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => setVoice(s.voice)).catch(() => {});
  }, []);

  const isEnabled = Boolean(voice?.enabled);
  const visibleTabs = ALL_TABS.filter((t) => {
    if (!isEnabled) {
      return t.id === 'providerTuning' || t.id === 'apiKeys';
    }
    return true;
  });

  const activeTabId = visibleTabs.some((t) => t.id === tab) ? tab : 'providerTuning';

  return (
    <div>
      <PageHeader
        title="Voice Agent"
        description="Everything voice-conversation-related lives here: prompt overrides, speech provider (Sarvam AI or OpenAI) and voice speaker, response tuning, context/vector chunk limits, query rewriting, and API key management."
      />
      <ReadOnlyGuard permission="settings.edit">

      <div className="settings-tabs">
        {visibleTabs.map((t) => (
          <button key={t.id} className={`settings-tab ${activeTabId === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon /> {t.label}
          </button>
        ))}
      </div>

      {activeTabId === 'prompt' && isEnabled && <VoicePromptCard />}
      {activeTabId === 'providerTuning' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <VoiceSettingsCard onVoiceChange={(updated) => setVoice(updated)} />
          {isEnabled && <VoiceTuningCard section="tuning" />}
        </div>
      )}
      {activeTabId === 'contextLimits' && isEnabled && <VoiceTuningCard section="context" />}
      {activeTabId === 'pipeline' && isEnabled && <VoiceTuningCard section="pipeline" />}
      {activeTabId === 'apiKeys' && <VoiceApiKeyCard />}
      {activeTabId === 'usage' && isEnabled && <VoiceUsageCard />}
      </ReadOnlyGuard>
    </div>
  );
}



