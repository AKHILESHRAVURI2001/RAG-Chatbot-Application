import { useEffect, useState } from 'react';
import { FiMic, FiPlay, FiSave } from 'react-icons/fi';
import { api } from '../lib/api';
import type { VoiceSettings, SpeechProviderName } from '../shared';
import Toggle from './ui/Toggle';
import { InlineSpinner, PageSpinner } from './ui/Spinner';
import Card from './ui/Card';
import { toast } from './ui/Toast';

const SPEECH_PROVIDER_LABEL: Record<SpeechProviderName, string> = { sarvam: 'Sarvam AI', openai: 'OpenAI' };

const LANGUAGE_PRESETS = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'gu-IN', label: 'Gujarati' },
  { code: 'kn-IN', label: 'Kannada' },
  { code: 'ml-IN', label: 'Malayalam' },
  { code: 'mr-IN', label: 'Marathi' },
  { code: 'od-IN', label: 'Odia' },
  { code: 'pa-IN', label: 'Punjabi' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
];
const SPEAKER_PRESETS: Record<SpeechProviderName, string[]> = {
  sarvam: ['shubh', 'anushka', 'manisha', 'vidya', 'arya', 'abhilash', 'karun', 'hitesh'],
  openai: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
};

interface VoiceSettingsCardProps {
  onVoiceChange?: (voice: VoiceSettings) => void;
}

export default function VoiceSettingsCard({ onVoiceChange }: VoiceSettingsCardProps) {
  const [loading, setLoading] = useState(true);
  const [voice, setVoice] = useState<VoiceSettings | null>(null);
  const [speechProviders, setSpeechProviders] = useState<{ name: string; configured: boolean }[]>([]);
  const [previewText, setPreviewText] = useState('Hi! How can I help you today?');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setVoice(s.voice);
        setSpeechProviders(s.speechProviders);
      })
      .catch((e) => toast.error(e.message ?? 'Failed to load voice settings.'))
      .finally(() => setLoading(false));
  }, []);

  const configured = voice ? speechProviders.find((p) => p.name === voice.provider)?.configured ?? false : false;
  const providerLabel = voice ? SPEECH_PROVIDER_LABEL[voice.provider] : '';

  function selectSpeechProvider(next: SpeechProviderName) {
    if (!voice) return;
    const nextVoice = { ...voice, provider: next, speaker: SPEAKER_PRESETS[next][0] };
    setVoice(nextVoice);
    onVoiceChange?.(nextVoice);
  }

  function handleToggleEnabled(v: boolean) {
    if (!voice) return;
    const nextVoice = { ...voice, enabled: v };
    setVoice(nextVoice);
    onVoiceChange?.(nextVoice);
  }

  async function save() {
    if (!voice) return;
    try {
      const updated = await api.updateVoice(voice);
      setVoice(updated);
      onVoiceChange?.(updated);
      toast.success('Speech & Voice settings saved.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save voice settings.');
    }
  }

  async function preview() {
    if (!previewText.trim()) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await api.testVoiceSpeech(previewText.trim());
      await new Audio(`data:audio/${res.audio.format};base64,${res.audio.base64}`).play();
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPreviewing(false);
    }
  }

  if (loading || !voice) return <PageSpinner label="Loading…" />;

  return (
    <Card icon={<FiMic />} title="Speech Provider & Voice Engine">
      <p className="muted" style={{ marginBottom: 16 }}>
        Select your speech-to-text (STT) and text-to-speech (TTS) provider, language, and voice speaker for widget interactions.
      </p>

      <div style={{ marginBottom: 16 }}>
        <Toggle
          checked={voice.enabled}
          onChange={handleToggleEnabled}
          label="Enable voice conversation feature"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Speech provider (STT &amp; TTS)</label>
          <p className="muted small" style={{ margin: '0 0 6px 0' }}>
            Sarvam AI supports English + 22 Indian languages. OpenAI uses Whisper &amp; TTS models with your OpenAI API key.
          </p>
          <select value={voice.provider} onChange={(e) => selectSpeechProvider(e.target.value as SpeechProviderName)} style={{ width: '100%', maxWidth: 360 }}>
            <option value="sarvam">Sarvam AI</option>
            <option value="openai">OpenAI</option>
          </select>
          <p className="muted small" style={{ margin: '4px 0 0 0' }}>
            {configured
              ? `✓ ${providerLabel} key is configured.`
              : `No ${providerLabel} key configured yet — ${voice.provider === 'sarvam' ? 'add one in the API Keys tab' : 'set your OpenAI key in Chat Agent > API Keys or Voice > API Keys'}.`}
          </p>
        </div>

        {voice.provider === 'sarvam' && (
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Language</label>
            <select value={voice.languageCode} onChange={(e) => setVoice({ ...voice, languageCode: e.target.value })} style={{ width: '100%', maxWidth: 360 }}>
              {LANGUAGE_PRESETS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </option>
              ))}
              {!LANGUAGE_PRESETS.some((l) => l.code === voice.languageCode) && <option value={voice.languageCode}>{voice.languageCode}</option>}
            </select>
          </div>
        )}

        {voice.provider === 'openai' && (
          <p className="muted small">
            OpenAI Whisper automatically detects spoken audio language, and TTS voices match the output response text natively.
          </p>
        )}

        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
            {voice.provider === 'sarvam' ? 'Speaker (text-to-speech voice)' : 'Voice (text-to-speech)'}
          </label>
          <select value={voice.speaker} onChange={(e) => setVoice({ ...voice, speaker: e.target.value })} style={{ width: '100%', maxWidth: 360 }}>
            {SPEAKER_PRESETS[voice.provider].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {!SPEAKER_PRESETS[voice.provider].includes(voice.speaker) && <option value={voice.speaker}>{voice.speaker}</option>}
          </select>
        </div>

        <button className="btn-primary" onClick={save} style={{ width: 'fit-content', marginTop: 4 }}>
          <FiSave /> Save Speech Settings
        </button>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color, #e5e7eb)', margin: '12px 0 4px 0' }} />

        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6, fontSize: 13 }}>Preview Spoken Voice</label>
          <div className="row-gap" style={{ alignItems: 'center' }}>
            <input
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Type something to hear it spoken…"
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" onClick={preview} disabled={previewing || !configured} title={configured ? 'Play sample' : `Set up a ${providerLabel} key first`}>
              {previewing ? <InlineSpinner /> : <FiPlay />} Preview
            </button>
          </div>
          {previewError && <p className="muted small" style={{ color: 'var(--danger)', marginTop: 4 }}>{previewError}</p>}
        </div>
      </div>
    </Card>
  );
}

