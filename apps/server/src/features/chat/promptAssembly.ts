import suggestedTriggers from './suggestedTriggers.json';

const SEPARATOR = '\n---\n';
const MAX_RELATED_ARTICLES = 1;
const RELATED_ARTICLES_MARKER = '\n\nRelated articles:\n';
const SUGGESTED_ARTICLES_MARKER = '\n\nSuggested articles:\n';

function normalizeForDedupe(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildContext<T extends { content: string }>(
  chunks: T[],
  maxChars: number,
): { context: string; includedChunks: T[] } {
  const included: T[] = [];
  const seen = new Set<string>();
  let used = 0;

  for (const chunk of chunks) {
    const key = normalizeForDedupe(chunk.content);
    if (!key || seen.has(key)) continue;
    const cost = chunk.content.length + (included.length > 0 ? SEPARATOR.length : 0);
    if (used + cost > maxChars) break;
    included.push(chunk);
    seen.add(key);
    used += cost;
  }

  if (included.length === 0 && chunks.length > 0) {
    return { context: chunks[0].content.slice(0, maxChars), includedChunks: [chunks[0]] };
  }

  return { context: included.map((c) => c.content).join(SEPARATOR), includedChunks: included };
}

export function trimHistory(
  history: { role: 'user' | 'assistant'; content: string }[],
  maxCharsPerTurn: number,
) {
  return history.map((turn) =>
    turn.content.length > maxCharsPerTurn ? { ...turn, content: `${turn.content.slice(0, maxCharsPerTurn)}…` } : turn,
  );
}

export interface RelatedArticle {
  title: string;
  url: string;
}

export function humanizeUrlTitle(title: string | null | undefined, url: string): string {
  if (title && title.trim() && title.trim() !== url.trim()) {
    return title.trim();
  }
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const lastPart = pathname.split('/').filter(Boolean).pop();
    if (lastPart) {
      const cleaned = decodeURIComponent(lastPart)
        .replace(/[-_]+/g, ' ')
        .replace(/\.(html?|php|aspx?|pdf|docx?|mp4)$/i, '')
        .trim();
      if (cleaned.length > 2) {
        return cleaned.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export function buildRelatedArticles(
  usedChunks: { sourceType: string; sourceRef: string | null; title: string | null }[],
  fallbackChunks: { sourceType: string; sourceRef: string | null; title: string | null }[] = [],
  queryIntent?: { isVideo?: boolean; isDocument?: boolean; isAudio?: boolean; isImage?: boolean },
): RelatedArticle[] {
  const allCandidateChunks = usedChunks.length > 0 ? usedChunks : fallbackChunks;
  const validChunks = [...allCandidateChunks].filter(
    (c) => (c.sourceType === 'url' || (c.sourceRef && /^https?:\/\//i.test(c.sourceRef))) && c.sourceRef,
  );

  if (queryIntent) {
    validChunks.sort((a, b) => {
      const aRef = (a.sourceRef || '').toLowerCase();
      const aTitle = (a.title || '').toLowerCase();
      const bRef = (b.sourceRef || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();

      let aScore = 0;
      let bScore = 0;

      if (queryIntent.isVideo) {
        if (/youtube|youtu\.be|vimeo|\.mp4|\.mov/i.test(aRef) || /video|watch/i.test(aTitle)) aScore += 2;
        if (/youtube|youtu\.be|vimeo|\.mp4|\.mov/i.test(bRef) || /video|watch/i.test(bTitle)) bScore += 2;
      }
      if (queryIntent.isDocument) {
        if (/\.pdf|\.doc|\.docx/i.test(aRef) || /document|guide|manual|pdf/i.test(aTitle)) aScore += 2;
        if (/\.pdf|\.doc|\.docx/i.test(bRef) || /document|guide|manual|pdf/i.test(bTitle)) bScore += 2;
      }
      if (queryIntent.isAudio) {
        if (/\.mp3|\.wav|podcast/i.test(aRef) || /audio|podcast|recording/i.test(aTitle)) aScore += 2;
        if (/\.mp3|\.wav|podcast/i.test(bRef) || /audio|podcast|recording/i.test(bTitle)) bScore += 2;
      }

      return bScore - aScore;
    });
  }

  return Array.from(
    new Map(
      validChunks.map((c) => {
        const url = c.sourceRef as string;
        const cleanTitle = humanizeUrlTitle(c.title, url);
        return [url, { title: cleanTitle, url }];
      }),
    ).values(),
  ).slice(0, MAX_RELATED_ARTICLES);
}

export function withRelatedArticles(answer: string, articles: RelatedArticle[], isSuggested = false): string {
  if (articles.length === 0) return answer;
  const remainingArticles = articles.filter((a) => !answer.includes(a.url));
  if (remainingArticles.length === 0) return answer;
  const marker = isSuggested ? SUGGESTED_ARTICLES_MARKER : RELATED_ARTICLES_MARKER;
  const links = remainingArticles.map((a) => `- [${a.title}](${a.url})`).join('\n');
  return `${answer}${marker}${links}`;
}

export function stripRelatedArticles(content: string): string {
  let idx = content.indexOf(RELATED_ARTICLES_MARKER);
  if (idx === -1) idx = content.indexOf(SUGGESTED_ARTICLES_MARKER);
  return idx === -1 ? content : content.slice(0, idx);
}

export function shouldSuggestArticles(answer: string, usedChunksCount: number): boolean {
  // No context chunks matched — nothing relevant was found, so don't suggest articles
  if (usedChunksCount === 0) return false;
  const categories = detectTriggerCategories(answer);
  // Only suggest articles for media/document queries — never on refusal/no-match responses
  return (
    categories.isVideo ||
    categories.isAudio ||
    categories.isImage ||
    categories.isDocument
  );
}

export function detectTriggerCategories(text: string): {
  isRefusal: boolean;
  isVideo: boolean;
  isAudio: boolean;
  isImage: boolean;
  isDocument: boolean;
  isSupport: boolean;
} {
  const lower = text.toLowerCase();
  const testList = (list: string[]) =>
    (list || []).some((item) => {
      const clean = item.trim().toLowerCase();
      if (!clean) return false;
      if (!clean.includes(' ') && !clean.includes('-')) {
        return new RegExp(`\\b${clean}\\b`, 'i').test(lower);
      }
      return lower.includes(clean);
    });

  return {
    isRefusal: (suggestedTriggers.refusalPhrases || []).some((p) => lower.includes(p.toLowerCase())),
    isVideo: testList(suggestedTriggers.videoKeywords),
    isAudio: testList(suggestedTriggers.audioKeywords),
    isImage: testList(suggestedTriggers.imageKeywords),
    isDocument: testList(suggestedTriggers.documentKeywords),
    isSupport: testList(suggestedTriggers.supportAndActionKeywords),
  };
}

export function cleanTextForSpeech(text: string): string {
  const stripped = stripRelatedArticles(text);
  return stripped
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links [title](url) -> title
    .replace(/[*_~`#>\-•]/g, '') // remove markdown symbols
    .replace(/https?:\/\/\S+/g, '') // remove raw URLs
    .replace(/\s+/g, ' ')
    .trim();
}



