import type { AnswerSource } from '../shared';

/** The color of each answer source — also used for the matching Knowledge Base menu accents, so a color means the same thing everywhere. */
export const SOURCE_TINT: Record<AnswerSource, string> = {
  faq: '#2563eb',
  cache: '#a855f7',
  llm: '#16a34a',
  'no-match': '#9ca3af',
  'chunk-fallback': '#d97706',
  chunk: '#0284c7',
  restricted: '#dc2626',
};

/**
 * A very light gradient tint for an assistant bubble — color-coded by where
 * the answer came from (FAQ/cache/live AI) when known, or the widget's own
 * configured color otherwise (e.g. the static greeting, which has no source).
 * Subtle by design: at a glance it just looks like a soft-shaded bubble.
 */
export function sourceGradient(source: AnswerSource | undefined, fallbackColor: string): string {
  const tint = source ? SOURCE_TINT[source] : fallbackColor;
  return `linear-gradient(135deg, color-mix(in srgb, ${tint} 10%, white), white)`;
}

/** The human-readable label for an answer's source badge — Chat Logs and the Firebase mirror's reports show the same wording for the same source. */
export const SOURCE_LABEL: Record<AnswerSource, string> = {
  faq: 'FAQ match',
  cache: 'Cached',
  llm: 'AI (live)',
  'no-match': 'No match (AI skipped)',
  'chunk-fallback': 'Related Content (Fallback)',
  chunk: 'Question Chunk Match',
  restricted: 'Restricted Word Intercept',
};
