import { FiMessageCircle, FiSave } from 'react-icons/fi';
import type { PromptSettings } from '../../shared';
import Card from '../ui/Card';
import { FormField, FormInput, FormTextarea } from '../ui/FormField';

interface PromptGreetingTabProps {
  prompt: PromptSettings;
  setPrompt: React.Dispatch<React.SetStateAction<PromptSettings | null>>;
  save: <T>(fn: (v: T) => Promise<T>, value: T, label: string) => Promise<void>;
  updatePromptFn: (v: PromptSettings) => Promise<PromptSettings>;
}

export default function PromptGreetingTab({ prompt, setPrompt, save, updatePromptFn }: PromptGreetingTabProps) {
  return (
    <Card icon={<FiMessageCircle />} title="Prompt &amp; greeting">
      <FormField label="System Prompt" description="Instructions given to the AI model on how to behave and respond">
        <FormTextarea
          rows={4}
          value={prompt.systemPrompt}
          onChange={(e) => setPrompt({ ...prompt, systemPrompt: e.target.value })}
        />
      </FormField>

      <FormField label="Greeting Message" description="Initial message shown when a visitor opens the chat widget">
        <FormInput value={prompt.greeting} onChange={(e) => setPrompt({ ...prompt, greeting: e.target.value })} />
      </FormField>

      <FormField
        label='"No Information Found" Fallback Message'
        description="Shown instantly without calling AI when a fresh question matches nothing in your knowledge base"
      >
        <FormInput
          value={prompt.noContextMessage}
          onChange={(e) => setPrompt({ ...prompt, noContextMessage: e.target.value })}
        />
      </FormField>

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
        label="Append Related Articles & Resource Links"
        description="When enabled, automatically appends matching source links or related articles at the bottom of AI responses"
      >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
          <input
            type="checkbox"
            checked={prompt.showRelatedArticles ?? false}
            onChange={(e) => setPrompt({ ...prompt, showRelatedArticles: e.target.checked })}
          />
          <span style={{ fontSize: '14px' }}>Enable "Related Articles" link boxes below answers (off by default for clean text replies)</span>
        </label>
      </FormField>

      <div style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={() => save(updatePromptFn, prompt, 'Prompt settings')}>
          <FiSave /> Save Prompt Settings
        </button>
      </div>
    </Card>
  );
}
