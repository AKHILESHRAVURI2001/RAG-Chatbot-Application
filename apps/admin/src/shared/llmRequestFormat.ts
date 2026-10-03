import type { LlmRequestLogDTO } from './types';

export function buildFullPromptText(request: LlmRequestLogDTO): string {
  const parts: string[] = [`SYSTEM PROMPT:\n${request.systemPrompt}`];

  if (request.historySummary) {
    parts.push(`EARLIER IN THIS CONVERSATION (auto-compacted recap):\n${request.historySummary}`);
  }

  if (request.history.length > 0) {
    const historyText = request.history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n\n');
    parts.push(`CONVERSATION HISTORY:\n${historyText}`);
  }

  parts.push(`CONTEXT (retrieved from the knowledge base):\n${request.context || '(none — no knowledge-base chunk matched closely enough)'}`);
  parts.push(`USER QUESTION:\n${request.question}`);

  return parts.join('\n\n---\n\n');
}
