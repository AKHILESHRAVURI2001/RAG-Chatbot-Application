import { describe, expect, it } from 'vitest';
import { buildUserPrompt } from '../../../src/providers/llm/provider';

describe('buildUserPrompt', () => {
  it('includes the question and context verbatim', () => {
    const prompt = buildUserPrompt('Our refund window is 14 days.', 'Do you offer refunds?');
    expect(prompt).toContain('Our refund window is 14 days.');
    expect(prompt).toContain('Do you offer refunds?');
  });

  it('falls back to a placeholder when no context was retrieved', () => {
    const prompt = buildUserPrompt('', 'Anything at all?');
    expect(prompt).toContain('(no relevant context found)');
  });
});
