import { describe, expect, it } from 'vitest';
import { levenshteinDistance, fuzzySimilarity, isTypoMatch } from '../../src/utils/fuzzyMatch';

describe('fuzzyMatch utility', () => {
  it('calculates correct Levenshtein distance', () => {
    expect(levenshteinDistance('contact', 'conctact')).toBe(1);
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
    expect(levenshteinDistance('', 'test')).toBe(4);
  });

  it('calculates normalized fuzzy similarity', () => {
    expect(fuzzySimilarity('contact us', 'conctact us')).toBeGreaterThan(0.8);
    expect(fuzzySimilarity('exact match', 'exact match')).toBe(1.0);
  });

  it('detects typo matches accurately', () => {
    expect(isTypoMatch('conctact', 'contact')).toBe(true);
    expect(isTypoMatch('phisshing', 'phishing')).toBe(true);
    expect(isTypoMatch('apple', 'banana')).toBe(false);
  });
});
