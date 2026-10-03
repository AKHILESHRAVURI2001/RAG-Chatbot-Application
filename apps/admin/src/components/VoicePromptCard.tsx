import { useEffect, useState } from 'react';
import { FiMessageCircle, FiSave } from 'react-icons/fi';
import { api } from '../lib/api';
import type { VoiceSettings } from '../shared';
import Card from './ui/Card';
import { PageSpinner } from './ui/Spinner';

/**
 * Optional per-voice-question prompt override — independent of Chat Agent's
 * own system prompt / no-context message, since a spoken answer often wants
 * different wording (shorter, more conversational) than a typed one. Blank
 * fields inherit Chat Agent's, same convention as the provider/model
 * override on Voice Settings. Self-contained, same convention as every
 * other card on this page.
 */
export default function VoicePromptCard() {
  const [loading, setLoading] = useState(true);
  const [voice, setVoice] = useState<VoiceSettings | null>(null);
  const [chatSystemPrompt, setChatSystemPrompt] = useState('');
  const [chatNoContextMessage, setChatNoContextMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setVoice(s.voice);
        setChatSystemPrompt(s.prompt.systemPrompt);
        setChatNoContextMessage(s.prompt.noContextMessage);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!voice) return;
    setStatus(null);
    setError(null);
    try {
      const updated = await api.updateVoice(voice);
      setVoice(updated);
      setStatus('Voice prompt saved.');
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading || !voice) return <PageSpinner label="Loading…" />;

  return (
    <Card icon={<FiMessageCircle />} title="Prompt (optional)">
      <p className="muted">
        By default, a voice question is answered using Chat Agent's system prompt and "no information found" message
        — same as typed chat. Set either field below only if voice needs different wording (e.g. shorter,
        conversational phrasing for spoken interactions). Leave blank to keep inheriting Chat Agent's.
      </p>
      {error && <div className="alert">{error}</div>}
      <label>System prompt override</label>
      <textarea
        rows={4}
        placeholder={`Inheriting Chat Agent's:\n${chatSystemPrompt}`}
        value={voice.systemPrompt}
        onChange={(e) => setVoice({ ...voice, systemPrompt: e.target.value })}
      />
      <label>"No information found" message override</label>
      <input
        placeholder={chatNoContextMessage || 'Inheriting Chat Agent\'s message'}
        value={voice.noContextMessage}
        onChange={(e) => setVoice({ ...voice, noContextMessage: e.target.value })}
      />
      <button className="btn-primary" onClick={save}><FiSave /> Save</button>
      {status && <p className="muted small">{status}</p>}
    </Card>
  );
}
