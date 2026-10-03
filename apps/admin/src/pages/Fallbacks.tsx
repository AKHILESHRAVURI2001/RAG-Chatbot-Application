import { useEffect, useState } from 'react';
import type { LlmSettings, PromptSettings } from '../shared';
import { api } from '../lib/api';
import { ReadOnlyGuard } from '../components/ReadOnlyGuard';
import { PageSpinner } from '../components/ui/Spinner';
import PageHeader from '../components/ui/PageHeader';
import { toast } from '../components/ui/Toast';
import PipelineTab from '../components/chatAgent/PipelineTab';

export default function Fallbacks() {
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [prompt, setPrompt] = useState<PromptSettings | null>(null);

  function refreshSettings() {
    return api.getSettings().then((s) => {
      setLlm(s.llm);
      setPrompt(s.prompt);
    });
  }

  useEffect(() => {
    refreshSettings().catch((e) => toast.error(e.message ?? 'Failed to load settings.'));
  }, []);

  if (!llm || !prompt) return <PageSpinner label="Loading Fallback settings…" />;

  return (
    <div>
      <PageHeader
        title="Knowledge Base Fallbacks"
        description="Configure fallback behavior, offline link suggestions, relevance cutoffs, and question chunk fallbacks."
      />
      <ReadOnlyGuard permission="settings.edit">
      <PipelineTab
        llm={llm}
        setLlm={setLlm}
        prompt={prompt}
        setPrompt={setPrompt}
        save={async (fn, val, label) => {
          try {
            await fn(val);
            toast.success(`${label} saved successfully.`);
          } catch (e: any) {
            toast.error(e.message ?? `Failed to save ${label.toLowerCase()}.`);
          }
        }}
        updateLlmFn={api.updateLlm}
        updatePromptFn={api.updatePrompt}
      />
      </ReadOnlyGuard>
    </div>
  );
}
