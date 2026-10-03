/**
 * High-performance Levenshtein Edit Distance and Fuzzy String Matching Utility
 * Provides typo-tolerant matching for FAQs, Restricted Words, and Question Chunks.
 */

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prevDiag = row[0];
    row[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prevDiag + cost);
      prevDiag = temp;
    }
  }

  return row[b.length];
}

/**
 * Calculates a similarity score between 0.0 and 1.0 based on normalized Levenshtein distance.
 */
export function fuzzySimilarity(a: string, b: string): number {
  const normA = a.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  const normB = b.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;

  const dist = levenshteinDistance(normA, normB);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Checks whether word/phrase 'query' is a typo-tolerant match of 'target' (e.g. >= 80% similarity or edit distance <= 2).
 */
export function isTypoMatch(query: string, target: string, minSimilarity = 0.80): boolean {
  const sim = fuzzySimilarity(query, target);
  if (sim >= minSimilarity) return true;

  // For short phrases (4 to 12 chars), allow 1 or 2 character typos even if ratio is slightly below 0.80
  const qClean = query.trim().toLowerCase();
  const tClean = target.trim().toLowerCase();
  if (qClean.length >= 4 && Math.abs(qClean.length - tClean.length) <= 2) {
    const dist = levenshteinDistance(qClean, tClean);
    if (dist <= 2 && qClean.length >= 5) return true;
  }

  return false;
}
