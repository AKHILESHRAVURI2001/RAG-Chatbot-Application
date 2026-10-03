import { FiDatabase, FiSave, FiSliders } from 'react-icons/fi';
import type { LlmSettings } from '../../shared';
import Card from '../ui/Card';

interface ContextLimitsTabProps {
  llm: LlmSettings;
  setLlm: React.Dispatch<React.SetStateAction<LlmSettings | null>>;
  save: <T>(fn: (v: T) => Promise<T>, value: T, label: string) => Promise<void>;
  updateLlmFn: (v: LlmSettings) => Promise<LlmSettings>;
}

export default function ContextLimitsTab({ llm, setLlm, save, updateLlmFn }: ContextLimitsTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Context & History Ceiling Controls */}
      <Card icon={<FiDatabase />} title="Context &amp; History Limits">
        <p className="muted" style={{ marginBottom: 16 }}>
          Set hard character ceilings on retrieved knowledge context and recent conversation message turns.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
              Conversation History Message Limit ({llm.historyLimit} messages)
            </label>
            <input
              type="range"
              min={0}
              max={50}
              step={2}
              value={llm.historyLimit}
              onChange={(e) => setLlm({ ...llm, historyLimit: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p className="muted small" style={{ margin: '4px 0 0 0' }}>
              Maximum number of recent conversation turns sent to the LLM per follow-up question.
            </p>
          </div>

          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
              Max History per Prior Turn ({llm.maxHistoryCharsPerTurn.toLocaleString()} chars)
            </label>
            <input
              type="range"
              min={100}
              max={3000}
              step={100}
              value={llm.maxHistoryCharsPerTurn}
              onChange={(e) => setLlm({ ...llm, maxHistoryCharsPerTurn: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p className="muted small" style={{ margin: '4px 0 0 0' }}>
              Trims each earlier turn resent as history context so long past answers don't blow up prompt size.
            </p>
          </div>

          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
              Max Retrieved Knowledge Context ({llm.maxContextChars.toLocaleString()} chars ≈ {Math.round(llm.maxContextChars / 4).toLocaleString()} tokens)
            </label>
            <input
              type="range"
              min={500}
              max={20000}
              step={500}
              value={llm.maxContextChars}
              onChange={(e) => setLlm({ ...llm, maxContextChars: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p className="muted small" style={{ margin: '4px 0 0 0' }}>
              Hard ceiling on the retrieved knowledge chunks section of each prompt. Matches are added best-first until this runs out.
            </p>
          </div>
        </div>
      </Card>

      {/* 2. Auto-Compaction & Memory Controls */}
      <Card icon={<FiSliders />} title="Auto-Compaction &amp; Memory Controls">
        <p className="muted" style={{ marginBottom: 16 }}>
          Automatically summarize older conversation history turns or long retrieved vector chunks when word count thresholds are reached.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
              Auto-compact Chat History Memory{' '}
              {llm.autoCompactHistoryWords > 0 ? `(after ${llm.autoCompactHistoryWords.toLocaleString()} words)` : '(disabled)'}
            </label>
            <input
              type="range"
              min={0}
              max={5000}
              step={100}
              value={llm.autoCompactHistoryWords}
              onChange={(e) => setLlm({ ...llm, autoCompactHistoryWords: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p className="muted small" style={{ margin: '4px 0 0 0' }}>
              Summarizes older conversation turns into a single compact recap once history passes this word count limit.
            </p>
          </div>

          <div style={{ paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>
              Auto-compact Retrieved Knowledge Context{' '}
              {llm.autoCompactContextWords > 0 ? `(after ${llm.autoCompactContextWords.toLocaleString()} words)` : '(disabled)'}
            </label>
            <input
              type="range"
              min={0}
              max={5000}
              step={100}
              value={llm.autoCompactContextWords}
              onChange={(e) => setLlm({ ...llm, autoCompactContextWords: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p className="muted small" style={{ margin: '4px 0 0 0' }}>
              Summarizes retrieved knowledge chunks into a denser token-efficient recap before sending to the LLM.
            </p>
          </div>
        </div>

        <button className="btn-primary" onClick={() => save(updateLlmFn, llm, 'Context & Memory settings')}>
          <FiSave /> Save Context &amp; Compaction Settings
        </button>
      </Card>
    </div>
  );
}
