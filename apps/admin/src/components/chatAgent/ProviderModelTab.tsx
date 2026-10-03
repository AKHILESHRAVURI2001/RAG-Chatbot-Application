import { FiCpu, FiSave, FiSliders } from 'react-icons/fi';
import type { LlmSettings } from '../../shared';
import Card from '../ui/Card';
import Toggle from '../ui/Toggle';

interface ProviderModelTabProps {
  llm: LlmSettings;
  setLlm: React.Dispatch<React.SetStateAction<LlmSettings | null>>;
  providers: { name: string; configured: boolean }[];
  save: <T>(fn: (v: T) => Promise<T>, value: T, label: string) => Promise<void>;
  updateLlmFn: (v: LlmSettings) => Promise<LlmSettings>;
}

export default function ProviderModelTab({ llm, setLlm, providers, save, updateLlmFn }: ProviderModelTabProps) {
  const isLlmOn = llm.llmEnabled !== false;

  return (
    <Card icon={<FiCpu />} title="Provider, Model &amp; Response Tuning">
      <p className="muted" style={{ marginBottom: 16 }}>
        Select your AI Provider engine, model name, and fine-tune response creativity, penalties, and output token limits.
      </p>

      {/* Master LLM ON/OFF Switch */}
      <div
        style={{
          background: isLlmOn ? '#f0fdf4' : '#fff7ed',
          border: `1.5px solid ${isLlmOn ? '#bbf7d0' : '#fed7aa'}`,
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: isLlmOn ? '#15803d' : '#c2410c',
              marginBottom: 3,
            }}
          >
            {isLlmOn ? '✅ Master AI LLM Generation is ON' : '⛔ Master AI LLM Generation is OFF'}
          </div>
          <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
            {isLlmOn
              ? 'The AI model generates answers using your knowledge base as context. Toggle off to force chunk-only responses.'
              : 'All paid LLM calls are bypassed. Responses come strictly from knowledge-base fast paths or fallbacks.'}
          </div>
        </div>
        <Toggle
          checked={isLlmOn}
          onChange={(v) => setLlm({ ...llm, llmEnabled: v })}
          label=""
        />
      </div>

      {!isLlmOn && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderLeft: '4px solid #f97316',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 18,
            fontSize: 13,
            color: '#7c2d12',
            lineHeight: 1.6,
          }}
        >
          <strong>Knowledge-Base Only Mode Active:</strong> You can freely configure Provider, Model, and Tuning settings below at any time — your changes will apply whenever LLM mode is active.
        </div>
      )}

      {/* Provider & Model selection — ALWAYS 100% interactive and editable */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Provider Engine</label>
          <select
            value={llm.provider}
            onChange={(e) => setLlm({ ...llm, provider: e.target.value as LlmSettings['provider'] })}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
          >
            {providers.map((p) => (
              <option key={p.name} value={p.name} disabled={!p.configured}>
                {p.name} {p.configured ? '' : '(no API key set)'}
              </option>
            ))}
          </select>
        </div>

        {llm.provider === 'custom' && (
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Base URL — OpenAI-compatible endpoint</label>
            <input
              placeholder="https://api.groq.com/openai/v1"
              value={llm.customBaseUrl}
              onChange={(e) => setLlm({ ...llm, customBaseUrl: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
        )}

        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Model Name</label>
          <input
            value={llm.model}
            onChange={(e) => setLlm({ ...llm, model: e.target.value })}
            placeholder="gpt-4o-mini, claude-3-5-sonnet, gemini-1.5-flash..."
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
          />
        </div>
      </div>

      {/* Response Tuning Controls — Integrated directly with Provider & Model */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 20,
          borderTop: '1px solid var(--border)',
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiSliders style={{ color: 'var(--primary)' }} /> Response Tuning &amp; Creativity Parameters
        </div>

        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
            Temperature ({llm.temperature}) — Randomness &amp; Creativity
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={llm.temperature}
            onChange={(e) => setLlm({ ...llm, temperature: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
          <p className="muted small" style={{ margin: '4px 0 0 0' }}>
            Lower values (0.0-0.3) make answers strictly factual and deterministic; higher values (0.7-1.0) increase variation.
          </p>
        </div>

        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
            Top P ({llm.topP}) — Nucleus Sampling
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={llm.topP}
            onChange={(e) => setLlm({ ...llm, topP: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        {llm.provider === 'openai' && (
          <>
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
                Frequency Penalty ({llm.frequencyPenalty}) — Word Repetition Filter (OpenAI)
              </label>
              <input
                type="range"
                min={-2}
                max={2}
                step={0.1}
                value={llm.frequencyPenalty}
                onChange={(e) => setLlm({ ...llm, frequencyPenalty: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
                Presence Penalty ({llm.presencePenalty}) — Topic Introduction Filter (OpenAI)
              </label>
              <input
                type="range"
                min={-2}
                max={2}
                step={0.1}
                value={llm.presencePenalty}
                onChange={(e) => setLlm({ ...llm, presencePenalty: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}

        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
            Max Output Tokens ({llm.maxTokens.toLocaleString()})
          </label>
          <input
            type="number"
            min={50}
            max={4096}
            value={llm.maxTokens}
            onChange={(e) => setLlm({ ...llm, maxTokens: Math.max(50, Number(e.target.value) || 500) })}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
          />
        </div>
      </div>

      <button className="btn-primary" onClick={() => save(updateLlmFn, llm, 'Provider, Model & Tuning settings')}>
        <FiSave /> Save Provider, Model &amp; Tuning Settings
      </button>
    </Card>
  );
}
