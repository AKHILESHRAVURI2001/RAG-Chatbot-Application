/**
 * Splits text into structure-aware, sentence-complete semantic chunks.
 * Ensures every chunk completes full sentences (. ! ?) after reaching word budget,
 * avoiding mid-sentence cutoffs.
 */
export function chunkText(text: string, chunkSize = 220, overlap = 40): { content: string; tokenCount: number }[] {
  if (!text || !text.trim()) return [];

  // Normalize excessive inline whitespace while preserving paragraph breaks
  const normalized = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  const words = normalized.replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= chunkSize) {
    return [{ content: words.join(' '), tokenCount: words.length }];
  }

  // 1. Split text into natural sentence/paragraph units ending in punctuation (. ! ? or newline)
  const paragraphs = normalized.split('\n\n').map((p) => p.trim()).filter(Boolean);
  const units: string[] = [];

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(Boolean);
    if (paraWords.length <= chunkSize && /[.!?]$/.test(para)) {
      units.push(para);
    } else {
      // Split paragraph into discrete sentence units ending with full stop / punctuation
      const sents = para.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      for (const sent of sents) {
        units.push(sent);
      }
    }
  }

  // 2. Assemble units into sentence-complete chunks
  const chunks: { content: string; tokenCount: number }[] = [];
  let currentUnits: string[] = [];
  let currentWordCount = 0;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const unitWords = unit.split(/\s+/).filter(Boolean);
    const unitLen = unitWords.length;

    // Handle an unpunctuated giant block (> chunkSize)
    if (unitLen > chunkSize) {
      if (currentUnits.length > 0) {
        const content = currentUnits.join(' ');
        chunks.push({ content, tokenCount: currentUnits.flatMap((u) => u.split(/\s+/).filter(Boolean)).length });
        currentUnits = [];
        currentWordCount = 0;
      }
      let uStart = 0;
      while (uStart < unitWords.length) {
        const uEnd = Math.min(uStart + chunkSize, unitWords.length);
        const slice = unitWords.slice(uStart, uEnd);
        chunks.push({ content: slice.join(' '), tokenCount: slice.length });
        if (uEnd === unitWords.length) break;
        uStart = Math.max(uEnd - overlap, uStart + 1);
      }
      continue;
    }

    // Check if adding this sentence unit stays within chunkSize or completes a chunk
    if (currentWordCount + unitLen <= chunkSize) {
      currentUnits.push(unit);
      currentWordCount += unitLen;
    } else {
      // Complete current chunk on sentence boundary (full stop)
      if (currentUnits.length > 0) {
        const content = currentUnits.join(' ');
        chunks.push({ content, tokenCount: currentWordCount });

        // Carry over full sentence units for overlap to avoid cutting mid-sentence
        const effectiveOverlap = Math.min(overlap, Math.floor(chunkSize / 2));
        const overlapUnits: string[] = [];
        let overlapWordCount = 0;

        for (let j = currentUnits.length - 1; j >= 0; j--) {
          const uLen = currentUnits[j].split(/\s+/).filter(Boolean).length;
          if (overlapWordCount + uLen > effectiveOverlap && overlapUnits.length > 0) break;
          overlapUnits.unshift(currentUnits[j]);
          overlapWordCount += uLen;
        }

        currentUnits = overlapUnits;
        currentWordCount = overlapWordCount;
      }

      currentUnits.push(unit);
      currentWordCount += unitLen;
    }
  }

  if (currentUnits.length > 0) {
    const content = currentUnits.join(' ');
    chunks.push({ content, tokenCount: currentUnits.flatMap((u) => u.split(/\s+/).filter(Boolean)).length });
  }

  return chunks;
}
