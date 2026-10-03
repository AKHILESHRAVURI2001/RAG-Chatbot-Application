import { useEffect, useState } from 'react';
import { FiCpu, FiDatabase, FiZap, FiSave } from 'react-icons/fi';
import { api } from '../lib/api';
import type { VoiceSettings } from '../shared';
import Toggle from './ui/Toggle';
import { PageSpinner } from './ui/Spinner';
import { Card, RangeSlider, AlertBanner, toast } from './ui';

interface VoiceTuningCardProps {
  section?: 'tuning' | 'context' | 'pipeline';
  title?: string;
}

/**
 * Voice's own optional response-tuning, context limits, and pipeline controls —
 * gated by the master `overrideTuning` switch.
 * When off (default), Voice inherits all Chat Agent settings.
 */
export default function VoiceTuningCard({ section = 'tuning', title }: VoiceTuningCardProps) {
  const [loading, setLoading] = useState(true);
  const [voice, setVoice] = useState<VoiceSettings | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setVoice(s.voice))
      .catch((e) => toast.error(e.message ?? 'Failed to load voice settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!voice) return;
    try {
      const updated = await api.updateVoice(voice);
      setVoice(updated);
      toast.success('Voice settings saved.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save voice settings.');
    }
  }

  if (loading || !voice) return <PageSpinner label="Loading…" />;

  const cardIcon = section === 'context' ? <FiDatabase /> : section === 'pipeline' ? <FiZap /> : <FiCpu />;
  const cardTitle =
    title ??
    (section === 'context'
      ? 'Context, History & Vector Chunks'
      : section === 'pipeline'
        ? 'Pipeline, Query Rewriting & Auto-Compaction'
        : 'Provider, Model & Response Tuning');

  return (
    <Card icon={cardIcon} title={cardTitle}>
      <p className="muted" style={{ marginBottom: 16 }}>
        {section === 'context'
          ? 'Set hard character ceilings on retrieved knowledge vector chunks and recent conversation history sent to the model for spoken responses.'
          : section === 'pipeline'
            ? 'Configure follow-up question query reformulation and token-saving auto-compaction budgets for voice interactions.'
            : 'Configure custom AI model parameters (temperature, max response length, penalties) specifically for spoken voice answers.'}
      </p>

      <div style={{ marginBottom: 16 }}>
        <Toggle
          checked={voice.overrideTuning}
          onChange={(v) => setVoice({ ...voice, overrideTuning: v })}
          label="Override settings for voice — enable to customize values instead of inheriting Chat Agent's"
        />
      </div>

      {!voice.overrideTuning && (
        <AlertBanner type="info" style={{ marginTop: 12 }}>
          Currently inheriting Chat Agent's {section === 'context' ? 'context & vector chunk' : section === 'pipeline' ? 'pipeline & compaction' : 'response tuning'} settings. Turn on the override switch above to customize for voice.
        </AlertBanner>
      )}

      {voice.overrideTuning && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {section === 'tuning' && (
            <>
              <RangeSlider
                label="Temperature — randomness & creativity"
                value={voice.temperature}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setVoice({ ...voice, temperature: v })}
              />

              <RangeSlider
                label="Top P — nucleus sampling"
                value={voice.topP}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setVoice({ ...voice, topP: v })}
              />

              <RangeSlider
                label="Frequency penalty — reduces repetitive words (OpenAI only)"
                value={voice.frequencyPenalty}
                min={-2}
                max={2}
                step={0.1}
                onChange={(v) => setVoice({ ...voice, frequencyPenalty: v })}
              />

              <RangeSlider
                label="Presence penalty — encourages new topics (OpenAI only)"
                value={voice.presencePenalty}
                min={-2}
                max={2}
                step={0.1}
                onChange={(v) => setVoice({ ...voice, presencePenalty: v })}
              />

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
                  Max response tokens
                </label>
                <input
                  type="number"
                  value={voice.maxTokens}
                  onChange={(e) => setVoice({ ...voice, maxTokens: Number(e.target.value) })}
                  style={{ width: '100%', maxWidth: '240px' }}
                />
              </div>
            </>
          )}

          {section === 'context' && (
            <>
              <RangeSlider
                label="Conversation history length"
                value={voice.historyLimit}
                min={0}
                max={50}
                step={2}
                unit="messages"
                onChange={(v) => setVoice({ ...voice, historyLimit: v })}
                helpText="Maximum number of recent conversation turns sent to the LLM per voice follow-up question."
              />

              <RangeSlider
                label="Max Retrieved Knowledge Vector Context"
                value={voice.maxContextChars}
                min={500}
                max={20000}
                step={500}
                displayValue={`${voice.maxContextChars.toLocaleString()} chars ≈ ${Math.round(voice.maxContextChars / 4).toLocaleString()} tokens`}
                onChange={(v) => setVoice({ ...voice, maxContextChars: v })}
                helpText="Hard ceiling on retrieved knowledge vector chunks. Vector matches are added best-first until this limit is reached."
              />

              <RangeSlider
                label="Max History per Prior Turn"
                value={voice.maxHistoryCharsPerTurn}
                min={100}
                max={3000}
                step={100}
                displayValue={`${voice.maxHistoryCharsPerTurn.toLocaleString()} chars`}
                onChange={(v) => setVoice({ ...voice, maxHistoryCharsPerTurn: v })}
                helpText="Trims earlier turns resent as history context so long spoken responses don't inflate prompt size."
              />
            </>
          )}

          {section === 'pipeline' && (
            <div>
              <Toggle
                checked={voice.rewriteFollowUpQueries}
                onChange={(v) => setVoice({ ...voice, rewriteFollowUpQueries: v })}
                label="Rewrite follow-up questions before vector search"
              />
              <p className="muted small" style={{ margin: '4px 0 0 0' }}>
                Reformulates spoken follow-ups into standalone search queries while isolating history for fresh topics.
              </p>
            </div>
          )}
        </div>
      )}

      <button className="btn-primary" onClick={save} style={{ marginTop: 20 }}>
        <FiSave /> Save Settings
      </button>
    </Card>
  );
}




