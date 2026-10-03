import { FiSave, FiShield } from 'react-icons/fi';
import type { LlmSettings, PromptSettings } from '../../shared';
import Card from '../ui/Card';
import Toggle from '../ui/Toggle';
import { FormField, FormInput, FormTextarea } from '../ui/FormField';

interface PipelineTabProps {
  llm: LlmSettings;
  setLlm: React.Dispatch<React.SetStateAction<LlmSettings | null>>;
  prompt?: PromptSettings | null;
  setPrompt?: React.Dispatch<React.SetStateAction<PromptSettings | null>>;
  save: <T>(fn: (v: T) => Promise<T>, value: T, label: string) => Promise<void>;
  updateLlmFn: (v: LlmSettings) => Promise<LlmSettings>;
  updatePromptFn?: (v: PromptSettings) => Promise<PromptSettings>;
}

export default function PipelineTab({ llm, setLlm, prompt, setPrompt, save, updateLlmFn, updatePromptFn }: PipelineTabProps) {
  return (
    <Card icon={<FiShield />} title="Knowledge Base Fallback Settings">
      <p className="muted" style={{ marginBottom: 16 }}>
        Configure fallback behavior when no answer is found, offline document link suggestions, relevance cutoffs, and question chunk fallback paths for your knowledge base.
      </p>

      {/* 1. Primary Fallback & Offline Rules */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 18,
          marginBottom: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiShield style={{ color: 'var(--primary)' }} /> Knowledge-Base Fallback &amp; Link Rules
        </div>

        <div>
          <Toggle
            checked={llm.showChunkFallbackWhenLlmUnavailable !== false}
            onChange={(v) => setLlm({ ...llm, showChunkFallbackWhenLlmUnavailable: v })}
            label="Show Knowledge-Base Fallback when LLM is Offline/Disabled"
          />
          <p className="muted small" style={{ margin: '4px 0 0 0' }}>
            When ON: Returns top matching knowledge chunks and article links directly to the visitor when LLM is in Chunk-Only mode.
          </p>
        </div>

        <div>
          <Toggle
            checked={Boolean(llm.showChunkFallbackWhenLlmEnabled)}
            onChange={(v) => setLlm({ ...llm, showChunkFallbackWhenLlmEnabled: v })}
            label="Allow Document Link Fallbacks when Master AI is ON"
          />
          <p className="muted small" style={{ margin: '4px 0 0 0' }}>
            When OFF (Recommended): Suppresses raw document link lists ("You may find related information below") when Master AI LLM mode is active.
          </p>
        </div>

        {prompt && setPrompt && (
          <div style={{ paddingTop: 10, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FormField
              label="Chunk Fallback Header / Intro Preamble"
              description="Header preamble displayed above matching articles when serving knowledge-base fallback answers"
            >
              <FormTextarea
                rows={2}
                value={prompt.chunkFallbackIntroMessage ?? ''}
                placeholder="**You may find related information below:**\nWe found some information related to your question. Please check the following content:"
                onChange={(e) => setPrompt({ ...prompt, chunkFallbackIntroMessage: e.target.value })}
              />
            </FormField>

            <FormField
              label='"No Information Found" Fallback Message'
              description="Shown instantly when a fresh question matches nothing in your knowledge base"
            >
              <FormInput
                value={prompt.noContextMessage ?? ''}
                onChange={(e) => setPrompt({ ...prompt, noContextMessage: e.target.value })}
              />
            </FormField>
          </div>
        )}

        {llm.showChunkFallbackWhenLlmUnavailable !== false && (
          <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 4 }}>
            <FormField
              label={`Fallback relevance threshold (${((llm.chunkFallbackMinSimilarity ?? 0.35) * 100).toFixed(0)}% similarity)`}
              description="Minimum vector similarity required to serve a knowledge chunk as fallback answer."
            >
              <input
                type="range"
                min={0.15}
                max={0.8}
                step={0.05}
                value={llm.chunkFallbackMinSimilarity ?? 0.35}
                onChange={(e) => setLlm({ ...llm, chunkFallbackMinSimilarity: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </FormField>

            <FormField
              label="Max fallback article links to suggest"
              description="Limits how many top-matching resource links are formatted in the fallback answer."
            >
              <FormInput
                type="number"
                min={1}
                max={5}
                value={llm.chunkFallbackMaxResults ?? 3}
                onChange={(e) =>
                  setLlm({ ...llm, chunkFallbackMaxResults: Math.min(5, Math.max(1, Number(e.target.value) || 3)) })
                }
              />
            </FormField>
          </div>
        )}
      </div>

      <button
        className="btn-primary"
        onClick={async () => {
          await save(updateLlmFn, llm, 'Fallback & Pipeline settings');
          if (prompt && updatePromptFn) {
            await save(updatePromptFn, prompt, 'Fallback intro preamble & prompt');
          }
        }}
      >
        <FiSave /> Save Fallback Settings
      </button>
    </Card>
  );
}
