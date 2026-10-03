export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmCallOptions {
  systemPrompt: string;
  context: string;
  question: string;
  model: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  history: ConversationTurn[];
  historySummary?: string;
}

export interface LlmProvider {
  name: string;
  isConfigured(): boolean;
  generateAnswer(opts: LlmCallOptions): Promise<string>;
}

export function buildUserPrompt(context: string, question: string, hasHistory = false, historySummary?: string): string {
  const placeholder = hasHistory
    ? '(No new knowledge-base context matched this specific message — if it is a follow-up, answer using the conversation above instead of saying you don\'t know.)'
    : '(no relevant context found)';
  return [
    ...(historySummary ? [`Earlier in this conversation (summary of turns before the ones above):\n${historySummary}`] : []),
    'Context (retrieved from the site\'s knowledge base — use it as your source of truth):',
    '---',
    context || placeholder,
    '---',
    `User question: ${question}`,
  ].join('\n\n');
}
