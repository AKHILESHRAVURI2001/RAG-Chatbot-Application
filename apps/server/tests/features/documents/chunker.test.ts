import { describe, expect, it } from 'vitest';
import { chunkText } from '../../../src/features/documents/chunker';

describe('chunkText', () => {
  it('returns no chunks for empty/whitespace-only text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  it('returns a single chunk when text is shorter than the chunk size', () => {
    const chunks = chunkText('one two three four five', 220, 40);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('one two three four five');
    expect(chunks[0].tokenCount).toBe(5);
  });

  it('splits long text into overlapping chunks that together cover every word', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`);
    const chunks = chunkText(words.join(' '), 220, 40);

    expect(chunks.length).toBeGreaterThan(1);
    // last chunk must reach the final word
    expect(chunks[chunks.length - 1].content.split(' ').pop()).toBe('w499');
    // consecutive chunks overlap (share at least one word) so context isn't lost at boundaries
    const firstWords = chunks[0].content.split(' ');
    const secondWords = chunks[1].content.split(' ');
    expect(secondWords[0]).toBe(firstWords[firstWords.length - 40]);
  });

  it('collapses repeated whitespace before splitting', () => {
    const chunks = chunkText('foo    bar\n\nbaz', 220, 40);
    expect(chunks[0].content).toBe('foo bar baz');
  });

  it('never loops forever when overlap >= chunkSize (degenerate config)', () => {
    // start = end - overlap must still advance; this guards against an infinite loop regression
    const words = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(words, 10, 10);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(1000); // sanity bound, not an infinite loop
  });
});
