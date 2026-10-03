import { useEffect, useState } from 'react';
import { FiKey, FiSave } from 'react-icons/fi';
import { api } from '../lib/api';
import Card from './ui/Card';
import { PageSpinner } from './ui/Spinner';

const PROVIDER_LABEL = { sarvam: 'Sarvam AI', openai: 'OpenAI' } as const;

export default function VoiceApiKeyCard() {
  const [loading, setLoading] = useState(true);
  const [speechProvider, setSpeechProvider] = useState<'sarvam' | 'openai'>('sarvam');
  const [configured, setConfigured] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  function refresh() {
    return api.getSettings().then((s) => {
      setSpeechProvider(s.voice.provider);
      setConfigured(s.speechProviders.find((p) => p.name === s.voice.provider)?.configured ?? false);
      setLoading(false);
    });
  }

  async function saveKey() {
    if (!apiKey.trim()) {
      setError('Enter a key first, or use Clear to remove the stored one.');
      return;
    }
    setStatus(null);
    setError(null);
    try {
      await api.updateSpeechApiKeys({ [speechProvider]: apiKey });
      setApiKey('');
      await refresh();
      setStatus(`${PROVIDER_LABEL[speechProvider]} key(s) saved.`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function clearKey() {
    setStatus(null);
    setError(null);
    try {
      await api.updateSpeechApiKeys({ [speechProvider]: '' });
      setApiKey('');
      await refresh();
      setStatus(`${PROVIDER_LABEL[speechProvider]} key cleared.`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) return <PageSpinner label="Loading…" />;

  const label = PROVIDER_LABEL[speechProvider];
  const keyCount = apiKey.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).length;

  return (
    <Card icon={<FiKey />} title={`${label} keys & Failover Pool`}>
      <p className="muted">
        Configure one or multiple {label} API keys (separated by commas or newlines). Multiple keys will be pooled so
        that speech-to-text (STT) and text-to-speech (TTS) automatically rotate and fail over to the next key if one
        reaches rate limits or exhausts credits.
      </p>
      {error && <div className="alert">{error}</div>}
      <p className="muted small">
        {configured
          ? '✓ Currently configured in database or .env (leave blank to keep).'
          : `No ${label} key configured yet — set one below${speechProvider === 'sarvam' ? ', or SARVAM_API_KEY in apps/server/.env' : ''}.`}
      </p>
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <label style={{ margin: 0 }}>{label} API keys</label>
          {keyCount > 1 && (
            <span className="badge" style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px' }}>
              {keyCount} keys in failover pool
            </span>
          )}
        </div>
        <div className="row-gap" style={{ alignItems: 'center' }}>
          <input
            type="password"
            placeholder={
              configured
                ? '•••• already configured (comma or line-separated for multiple) — leave blank to keep'
                : 'e.g. key1, key2 (comma or line separated)'
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn-secondary btn-tiny" onClick={clearKey}>
            Clear
          </button>
        </div>
      </div>
      <button className="btn-primary" onClick={saveKey}>
        <FiSave /> Save key(s)
      </button>
      {status && <p className="muted small" style={{ marginTop: '8px' }}>{status}</p>}
    </Card>
  );
}
