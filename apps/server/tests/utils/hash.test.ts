import { describe, expect, it } from 'vitest';
import { hashQuestion, normalizeQuestion } from '../../src/utils/hash';

describe('normalizeQuestion', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeQuestion('  What are your Business Hours??  ')).toBe('what are your business hours');
  });
});

describe('hashQuestion', () => {
  it('produces the same hash for trivially different phrasings', () => {
    const a = hashQuestion('What are your business hours?');
    const b = hashQuestion('  what are your business hours  ');
    expect(a).toBe(b);
  });

  it('produces different hashes for genuinely different questions', () => {
    expect(hashQuestion('What are your business hours?')).not.toBe(hashQuestion('Do you offer refunds?'));
  });

  it('is deterministic across calls', () => {
    expect(hashQuestion('same input')).toBe(hashQuestion('same input'));
  });
});
