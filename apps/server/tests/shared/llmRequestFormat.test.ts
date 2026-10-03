import { describe, expect, it } from 'vitest';
import { buildFullPromptText } from '../../src/shared/llmRequestFormat';
import type { LlmRequestLogDTO } from '../../src/shared/types';

const BASE: LlmRequestLogDTO = {
  systemPrompt: 'You are a helpful assistant.',
  context: '',
  question: 'What are your hours?',
  model: 'gpt-4o-mini',
  temperature: 0.3,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxTokens: 600,
  history: [],
};

describe('buildFullPromptText', () => {
  it('includes the system prompt, a context placeholder, and the question when there is no context/history', () => {
    const text = buildFullPromptText(BASE);
    expect(text).toContain('SYSTEM PROMPT:\nYou are a helpful assistant.');
    expect(text).toContain('(none — no knowledge-base chunk matched closely enough)');
    expect(text).toContain('USER QUESTION:\nWhat are your hours?');
    expect(text).not.toContain('CONVERSATION HISTORY');
  });

  it('includes real retrieved context verbatim when present', () => {
    const text = buildFullPromptText({ ...BASE, context: 'We are open 9-5 Monday to Friday.' });
    expect(text).toContain('CONTEXT (retrieved from the knowledge base):\nWe are open 9-5 Monday to Friday.');
  });

  it('includes conversation history, labeled by role, only when there is any', () => {
    const text = buildFullPromptText({
      ...BASE,
      history: [
        { role: 'user', content: 'What are the challenges for first-time buyers?' },
        { role: 'assistant', content: 'Unfamiliar terms and hidden costs.' },
      ],
    });
    expect(text).toContain(
      'CONVERSATION HISTORY:\nUser: What are the challenges for first-time buyers?\n\nAssistant: Unfamiliar terms and hidden costs.',
    );
  });

  it('separates history entries with a blank line, so a multi-line answer does not run straight into the next turn', () => {
    const text = buildFullPromptText({
      ...BASE,
      history: [
        { role: 'user', content: 'Explain that more simply.' },
        { role: 'assistant', content: 'Line one.\nLine two.\nLine three.' },
        { role: 'user', content: 'And the deposit?' },
        { role: 'assistant', content: 'Ten percent.' },
      ],
    });
    expect(text).toContain('Line three.\n\nUser: And the deposit?');
  });
});
