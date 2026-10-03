import { beforeEach, describe, expect, it, vi } from 'vitest';
// vi.mock calls are hoisted above these imports by vitest's transform, so the
// static imports below still resolve to the mocked modules.
import { embedText } from '../../../src/providers/embedding/resolve';
import { documentsRepo } from '../../../src/db/queries/documents.queries';
import { queryCacheRepo } from '../../../src/db/queries/queryCache.queries';
import { conversationsRepo } from '../../../src/db/queries/conversations.queries';
import { settingsRepo } from '../../../src/db/queries/settings.queries';
import { faqService } from '../../../src/features/faqs/faqService';
import { redisCache } from '../../../src/cache/redis';
import { answerQuestion } from '../../../src/features/chat/chatService';

const DEFAULT_CACHE_SETTINGS = { ttlSeconds: 3600, semanticThreshold: 0.9, faqThreshold: 0.85, contextThreshold: 0.3 };
const DEFAULT_LLM_SETTINGS = {
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  temperature: 0.3,
  maxTokens: 500,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  historyLimit: 10,
  rewriteFollowUpQueries: false, // off by default in tests — the rewrite-specific tests below turn it on explicitly
  maxContextChars: 6000,
  maxHistoryCharsPerTurn: 600,
};
const DEFAULT_PROMPT_SETTINGS = {
  systemPrompt: 'You are a helpful assistant.',
  greeting: 'Hi!',
  noContextMessage: 'I do not have that information.',
};
const DEFAULT_LIMITS_SETTINGS = { sessionMessageLimit: 30, sessionMessageWindowHours: 6 };

// A single generic, non-URL chunk by default — non-empty so tests unrelated
// to the "no context" behavior keep exercising the normal RAG+LLM path (as
// they did before that behavior existed); tests that actually want to
// exercise the "nothing matched" skip override this back to [].
const DEFAULT_CHUNK = { content: 'Generic background info.', similarity: 0.5, title: 'Info', sourceRef: 'internal.txt', sourceType: 'text' as const };

vi.mock('../../../src/providers/embedding/resolve', () => ({ embedText: vi.fn(async () => [0.1, 0.2, 0.3]) }));

vi.mock('../../../src/db/queries/documents.queries', () => ({
  documentsRepo: { searchSimilarChunks: vi.fn(async () => [DEFAULT_CHUNK]) },
}));

vi.mock('../../../src/db/queries/queryCache.queries', () => ({
  queryCacheRepo: { findSimilar: vi.fn(async () => null), recordHit: vi.fn(), upsert: vi.fn() },
}));

vi.mock('../../../src/db/queries/conversations.queries', () => ({
  conversationsRepo: {
    findOrCreateBySession: vi.fn(async () => ({ id: 'conv-1', blocked: false, summary: null, summaryUntil: null })),
    addMessage: vi.fn(),
    getRecentMessages: vi.fn(async () => []),
    countRecentUserMessages: vi.fn(async () => 0),
    setSummary: vi.fn(),
    setBlocked: vi.fn(async () => ({ blocked: true, blockedUntil: null, blockReason: null })),
  },
}));

vi.mock('../../../src/db/queries/settings.queries', () => ({
  settingsRepo: {
    getCache: vi.fn(async () => DEFAULT_CACHE_SETTINGS),
    getLlm: vi.fn(async () => DEFAULT_LLM_SETTINGS),
    getPrompt: vi.fn(async () => DEFAULT_PROMPT_SETTINGS),
    getLimits: vi.fn(async () => DEFAULT_LIMITS_SETTINGS),
    getVoice: vi.fn(async () => ({ enabled: true, provider: 'sarvam', languageCode: 'en-IN', speaker: 'shubh' })),
  },
}));

vi.mock('../../../src/features/faqs/faqService', () => ({
  faqService: { findBestMatch: vi.fn(async () => null) },
}));

vi.mock('../../../src/cache/redis', () => ({
  redisCache: { get: vi.fn(async () => null), set: vi.fn() },
}));

const mockGenerateAnswer = vi.fn(async (_request?: any) => 'The AI-generated answer.');
const mockIsConfigured = vi.fn(() => true);
vi.mock('../../../src/providers/llm', () => ({
  getLlmProvider: vi.fn(() => ({ name: 'openai', isConfigured: mockIsConfigured, generateAnswer: mockGenerateAnswer })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  (embedText as any).mockResolvedValue([0.1, 0.2, 0.3]);
  (queryCacheRepo.findSimilar as any).mockResolvedValue(null);
  (documentsRepo.searchSimilarChunks as any).mockResolvedValue([DEFAULT_CHUNK]);
  (conversationsRepo.findOrCreateBySession as any).mockResolvedValue({ id: 'conv-1', blocked: false, summary: null, summaryUntil: null });
  (conversationsRepo.getRecentMessages as any).mockResolvedValue([]);
  (conversationsRepo.countRecentUserMessages as any).mockResolvedValue(0);
  (settingsRepo.getCache as any).mockResolvedValue(DEFAULT_CACHE_SETTINGS);
  (settingsRepo.getLlm as any).mockResolvedValue(DEFAULT_LLM_SETTINGS);
  (settingsRepo.getPrompt as any).mockResolvedValue(DEFAULT_PROMPT_SETTINGS);
  (settingsRepo.getLimits as any).mockResolvedValue(DEFAULT_LIMITS_SETTINGS);
  (faqService.findBestMatch as any).mockResolvedValue(null);
  (redisCache.get as any).mockResolvedValue(null);
  mockIsConfigured.mockReturnValue(true);
  mockGenerateAnswer.mockResolvedValue('The AI-generated answer.');
});

describe('answerQuestion — session message quota', () => {
  it('blocks a message once the session has hit its rolling-window quota, without touching cache/FAQ/LLM', async () => {
    (conversationsRepo.countRecentUserMessages as any).mockResolvedValue(30); // == limit
    await expect(answerQuestion('session-1', 'One more please')).rejects.toThrow(/reached the limit of 30 messages every 6 hours/);
    expect(redisCache.get).not.toHaveBeenCalled();
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
    expect(conversationsRepo.addMessage).toHaveBeenCalledWith('conv-1', 'assistant', expect.stringContaining('[error]'));
  });

  it('allows the message when still under the configured quota', async () => {
    (conversationsRepo.countRecentUserMessages as any).mockResolvedValue(29); // one under the limit of 30
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.source).toBe('llm');
  });

  it('checks the quota against the settings-configured window, not a hardcoded one', async () => {
    (settingsRepo.getLimits as any).mockResolvedValue({ sessionMessageLimit: 5, sessionMessageWindowHours: 1 });
    (conversationsRepo.countRecentUserMessages as any).mockResolvedValue(5);
    await expect(answerQuestion('session-1', 'One more please')).rejects.toThrow(/reached the limit of 5 messages every 1 hours/);
    expect(conversationsRepo.countRecentUserMessages).toHaveBeenCalledWith('conv-1', 1);
  });
});

describe('answerQuestion', () => {
  it('rejects an empty/whitespace-only message before touching any dependency', async () => {
    await expect(answerQuestion('session-1', '   ')).rejects.toThrow('Empty message');
    expect(conversationsRepo.findOrCreateBySession).not.toHaveBeenCalled();
  });

  it('returns instantly from the Redis exact-match cache without embedding the question', async () => {
    (redisCache.get as any).mockResolvedValue('A cached answer.');
    const result = await answerQuestion('session-1', 'What are your hours?');
    expect(result).toEqual({ answer: 'A cached answer.', source: 'cache', conversationId: 'conv-1', compacted: false });
    expect(embedText).not.toHaveBeenCalled();
  });

  it('returns a hardcoded FAQ match and warms the Redis cache', async () => {
    (faqService.findBestMatch as any).mockResolvedValue({ answer: 'FAQ answer.', similarity: 0.95 });
    const result = await answerQuestion('session-1', 'Do you offer refunds?');
    expect(result.source).toBe('faq');
    expect(result.answer).toBe('FAQ answer.');
    expect(redisCache.set).toHaveBeenCalledWith(expect.any(String), 'FAQ answer.', 3600);
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it('returns a Postgres semantic-cache match and records the hit', async () => {
    (queryCacheRepo.findSimilar as any).mockResolvedValue({ id: 'qc-1', answer: 'Paraphrased past answer.', similarity: 0.94 });
    const result = await answerQuestion('session-1', 'When are you open?');
    expect(result.source).toBe('cache');
    expect(queryCacheRepo.recordHit).toHaveBeenCalledWith('qc-1');
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it('falls through to RAG + LLM when nothing is cached, and stores the result', async () => {
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.source).toBe('llm');
    expect(result.answer).toBe('The AI-generated answer.');
    expect(mockGenerateAnswer).toHaveBeenCalledTimes(1);
    expect(queryCacheRepo.upsert).toHaveBeenCalledWith(
      'Tell me something novel.',
      expect.any(String),
      [0.1, 0.2, 0.3],
      'The AI-generated answer.',
      'llm',
      3600,
    );
  });

  it('appends real, deduped "Related articles" links for URL-sourced chunks that were actually used as context', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'Guide content A', similarity: 0.8, title: 'Buyer Guide', sourceRef: 'https://example.com/guide', sourceType: 'url' },
      { content: 'Guide content B (same page, different chunk)', similarity: 0.75, title: 'Buyer Guide', sourceRef: 'https://example.com/guide', sourceType: 'url' },
      { content: 'Uploaded file content', similarity: 0.6, title: 'internal.pdf', sourceRef: 'internal.pdf', sourceType: 'file' },
      { content: 'Below threshold', similarity: 0.1, title: 'Other Page', sourceRef: 'https://example.com/other', sourceType: 'url' },
    ]);
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.answer).toBe('The AI-generated answer.\n\nRelated articles:\n- [Buyer Guide](https://example.com/guide)');
  });

  it('adds no "Related articles" section when nothing above the context threshold has a URL source', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'Uploaded file content', similarity: 0.6, title: 'internal.pdf', sourceRef: 'internal.pdf', sourceType: 'file' },
    ]);
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.answer).toBe('The AI-generated answer.');
  });

  it('caps "Related articles" to a single (best-match) link even when several distinct URL-sourced chunks were used', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'Best match', similarity: 0.9, title: 'Buyer Guide', sourceRef: 'https://example.com/guide', sourceType: 'url' },
      { content: 'Second match, different page', similarity: 0.7, title: 'Pricing FAQ', sourceRef: 'https://example.com/pricing', sourceType: 'url' },
    ]);
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.answer).toBe('The AI-generated answer.\n\nRelated articles:\n- [Buyer Guide](https://example.com/guide)');
  });

  it('swaps the model\'s no-answer token for the admin\'s configured noContextMessage, with no related-articles link and no caching', async () => {
    mockGenerateAnswer.mockResolvedValue('§NO_ANSWER§');
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'Somewhat related', similarity: 0.5, title: 'Buyer Guide', sourceRef: 'https://example.com/guide', sourceType: 'url' },
    ]);
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.source).toBe('no-match');
    expect(result.answer).toBe(DEFAULT_PROMPT_SETTINGS.noContextMessage);
    expect(queryCacheRepo.upsert).not.toHaveBeenCalled();
    expect(redisCache.set).not.toHaveBeenCalled();
  });

  it('tells the model to output the no-answer token instead of writing its own "I don\'t know" text, appended to the admin\'s own system prompt', async () => {
    await answerQuestion('session-1', 'Tell me something novel.');
    const request = mockGenerateAnswer.mock.calls[0][0];
    expect(request.systemPrompt).toContain(DEFAULT_PROMPT_SETTINGS.systemPrompt);
    expect(request.systemPrompt).toContain('§NO_ANSWER§');
  });

  it('strips a previous answer\'s own "Related articles" section out of conversation history before it goes back to the model', async () => {
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'Earlier question', createdAt: new Date() },
      {
        role: 'assistant',
        content: 'Earlier answer.\n\nRelated articles:\n- [Buyer Guide](https://example.com/guide)',
        createdAt: new Date(),
      },
    ]);
    await answerQuestion('session-1', 'A follow-up question.');
    const request = mockGenerateAnswer.mock.calls[0][0];
    expect(request.history.map((h: { role: string; content: string }) => ({ role: h.role, content: h.content }))).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer.' },
    ]);
  });

  it('passes opts.documentId through to the RAG search, scoping a per-page widget to its own document', async () => {
    await answerQuestion('session-1', 'Tell me something novel.', { documentId: 'doc-42' });
    expect(documentsRepo.searchSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, 'doc-42', undefined, 'Tell me something novel.');
  });

  it('passes opts.tag through to the RAG search, scoping a per-page widget to every document sharing that tag', async () => {
    await answerQuestion('session-1', 'Tell me something novel.', { tag: 'buying' });
    expect(documentsRepo.searchSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, undefined, 'buying', 'Tell me something novel.');
  });

  it('searches the whole knowledge base (no document/tag filter) when neither is given', async () => {
    await answerQuestion('session-1', 'Tell me something novel.');
    expect(documentsRepo.searchSimilarChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, undefined, undefined, 'Tell me something novel.');
  });

  it('skips every cache/FAQ stage for a tag-scoped request, even one that would otherwise hit — a cache entry could have come from a different tag scope, or no scope at all', async () => {
    (redisCache.get as any).mockResolvedValue('A cached answer from some other scope.');
    (faqService.findBestMatch as any).mockResolvedValue({ answer: 'An unrelated FAQ answer.', similarity: 0.99 });
    (queryCacheRepo.findSimilar as any).mockResolvedValue({ id: 'qc-1', answer: 'An unrelated semantic-cache answer.', similarity: 0.99 });

    const result = await answerQuestion('session-1', 'What are your hours?', { tag: 'buying' });

    expect(redisCache.get).not.toHaveBeenCalled();
    expect(faqService.findBestMatch).not.toHaveBeenCalled();
    expect(queryCacheRepo.findSimilar).not.toHaveBeenCalled();
    expect(result.source).toBe('llm');
  });

  it('never writes a tag-scoped answer into the cache', async () => {
    await answerQuestion('session-1', 'What are your hours?', { tag: 'buying' });
    expect(queryCacheRepo.upsert).not.toHaveBeenCalled();
    expect(redisCache.set).not.toHaveBeenCalled();
  });

  it('skips every cache/FAQ stage for a document-scoped request, even one that would otherwise hit — a cache entry could have come from a different document\'s scope, or no scope at all', async () => {
    (redisCache.get as any).mockResolvedValue('A cached answer from some other scope.');
    (faqService.findBestMatch as any).mockResolvedValue({ answer: 'An unrelated FAQ answer.', similarity: 0.99 });
    (queryCacheRepo.findSimilar as any).mockResolvedValue({ id: 'qc-1', answer: 'An unrelated semantic-cache answer.', similarity: 0.99 });

    const result = await answerQuestion('session-1', 'What are your hours?', { documentId: 'doc-42' });

    expect(redisCache.get).not.toHaveBeenCalled();
    expect(faqService.findBestMatch).not.toHaveBeenCalled();
    expect(queryCacheRepo.findSimilar).not.toHaveBeenCalled();
    expect(result.source).toBe('llm');
  });

  it('never writes a document-scoped answer into the cache — it could wrongly resurface for an unscoped or differently-scoped question later', async () => {
    await answerQuestion('session-1', 'What are your hours?', { documentId: 'doc-42' });
    expect(queryCacheRepo.upsert).not.toHaveBeenCalled();
    expect(redisCache.set).not.toHaveBeenCalled();
  });

  it('tags both the question and the answer with channel: \'voice\' when the turn came from the /chat/voice route, so Admin > Sarvam AI\'s usage stats and Chat Logs can tell a spoken turn apart from a typed one', async () => {
    await answerQuestion('session-1', 'What are your hours?', { channel: 'voice' });
    expect(conversationsRepo.addMessage).toHaveBeenCalledWith('conv-1', 'user', 'What are your hours?', undefined, undefined, undefined, 'voice');
    expect(conversationsRepo.addMessage).toHaveBeenCalledWith(
      'conv-1',
      'assistant',
      'The AI-generated answer.',
      'llm',
      expect.anything(),
      expect.any(Number),
      'voice',
    );
  });

  it('defaults to channel: \'text\' when not given — the typed-chat/rephrase path', async () => {
    await answerQuestion('session-1', 'What are your hours?');
    expect(conversationsRepo.addMessage).toHaveBeenCalledWith('conv-1', 'user', 'What are your hours?', undefined, undefined, undefined, 'text');
  });

  it('fetches history using a generous fixed cap (not historyLimit — see the note in chatService.ts), and persists the exact LLM request payload alongside the answer', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, historyLimit: 5 });
    await answerQuestion('session-1', 'Tell me something novel.');
    expect(conversationsRepo.getRecentMessages).toHaveBeenCalledWith('conv-1', 500, null);
    expect(conversationsRepo.addMessage).toHaveBeenCalledWith(
      'conv-1',
      'assistant',
      'The AI-generated answer.',
      'llm',
      expect.objectContaining({ model: 'gpt-4o-mini', temperature: 0.3, topP: 1, question: 'Tell me something novel.' }),
      expect.any(Number),
      'text',
    );
  });

  it('passes prior conversation turns to the LLM so a topic-less follow-up has an antecedent', async () => {
    const priorTurns = [
      { role: 'user' as const, content: 'What are the challenges for first-time buyers?' },
      { role: 'assistant' as const, content: 'Unfamiliar terms and hidden costs are common pitfalls.' },
    ];
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(priorTurns);
    await answerQuestion('session-1', 'explain simply');
    expect(mockGenerateAnswer).toHaveBeenCalledWith(expect.objectContaining({ history: priorTurns }));
  });

  it('fetches history before logging the current message, so a question never sees itself as its own history', async () => {
    const callOrder: string[] = [];
    (conversationsRepo.getRecentMessages as any).mockImplementation(async () => {
      callOrder.push('getRecentMessages');
      return [];
    });
    (conversationsRepo.addMessage as any).mockImplementation(async () => {
      callOrder.push('addMessage');
    });
    await answerQuestion('session-1', 'Tell me something novel.');
    expect(callOrder[0]).toBe('getRecentMessages');
  });

  it('skips the cache stages for a follow-up — a cached answer from a different conversation is the wrong answer to a context-dependent question', async () => {
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'What are the challenges for first-time buyers?' },
      { role: 'assistant', content: 'Unfamiliar terms and hidden costs are common pitfalls.' },
    ]);
    // Both caches would say yes if consulted — proving the skip is real, not incidental.
    (redisCache.get as any).mockResolvedValue('A stale cached answer from an unrelated conversation.');
    (queryCacheRepo.findSimilar as any).mockResolvedValue({ id: 'qc-1', answer: 'An unrelated semantic-cache answer.', similarity: 0.99 });

    const result = await answerQuestion('session-1', 'explain simply');

    expect(redisCache.get).not.toHaveBeenCalled();
    expect(queryCacheRepo.findSimilar).not.toHaveBeenCalled();
    expect(result.source).toBe('llm');
    expect(result.answer).toBe('The AI-generated answer.');
  });

  it('still checks FAQs on a follow-up — a curated answer beats an LLM paraphrase of it, whichever turn it is', async () => {
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello, how can I help?' },
    ]);
    (faqService.findBestMatch as any).mockResolvedValue({ answer: 'The curated FAQ answer.', similarity: 0.95 });

    const result = await answerQuestion('session-1', 'do you offer refunds?');

    expect(result.source).toBe('faq');
    expect(result.answer).toBe('The curated FAQ answer.');
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it("never caches a follow-up's FAQ hit — the cache is keyed on message text alone, and a follow-up's text means something different in every conversation", async () => {
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello, how can I help?' },
    ]);
    (faqService.findBestMatch as any).mockResolvedValue({ answer: 'The curated FAQ answer.', similarity: 0.95 });

    await answerQuestion('session-1', 'do you offer refunds?');

    expect(redisCache.set).not.toHaveBeenCalled();
  });

  it('skips FAQs for a scoped widget — it has been deliberately narrowed to one slice of content', async () => {
    (faqService.findBestMatch as any).mockResolvedValue({ answer: 'An FAQ answer from outside the scope.', similarity: 0.99 });
    const result = await answerQuestion('session-1', 'do you offer refunds?', { tag: 'buying' });
    expect(faqService.findBestMatch).not.toHaveBeenCalled();
    expect(result.source).toBe('llm');
  });

  it('never writes a follow-up answer into the cache — it would wrongly resurface for someone else\'s unrelated first message later', async () => {
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'What are the challenges for first-time buyers?' },
      { role: 'assistant', content: 'Unfamiliar terms and hidden costs are common pitfalls.' },
    ]);
    await answerQuestion('session-1', 'explain simply');
    expect(queryCacheRepo.upsert).not.toHaveBeenCalled();
    expect(redisCache.set).not.toHaveBeenCalled();
  });

  it('falls back to the server default TTL when the stored cache setting is non-positive', async () => {
    (settingsRepo.getCache as any).mockResolvedValue({ ...DEFAULT_CACHE_SETTINGS, ttlSeconds: 0 });
    await answerQuestion('session-1', 'Tell me something novel.');
    const [, , , , , ttlUsed] = (queryCacheRepo.upsert as any).mock.calls[0];
    expect(ttlUsed).toBeGreaterThan(0);
  });

  it('honors an admin-lowered context threshold, using a chunk that would have been rejected at the default 0.3', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'Weakly-matching but still relevant content.', similarity: 0.15, title: 'Info', sourceRef: 'internal.txt', sourceType: 'text' },
    ]);
    (settingsRepo.getCache as any).mockResolvedValue({ ...DEFAULT_CACHE_SETTINGS, contextThreshold: 0.1 });
    const result = await answerQuestion('session-1', 'Something loosely related.');
    expect(result.source).toBe('llm'); // not 'no-match' — the low-similarity chunk was accepted
    expect(mockGenerateAnswer).toHaveBeenCalledWith(expect.objectContaining({ context: 'Weakly-matching but still relevant content.' }));
  });

  it('rejects a chunk an admin-raised context threshold now excludes — a fresh question with no matching context is short-circuited to no-match', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'Borderline content.', similarity: 0.4, title: 'Info', sourceRef: 'internal.txt', sourceType: 'text' },
    ]);
    (settingsRepo.getCache as any).mockResolvedValue({ ...DEFAULT_CACHE_SETTINGS, contextThreshold: 0.5 });
    const result = await answerQuestion('session-1', 'Something borderline.');
    expect(result.source).toBe('no-match'); // chunk excluded; fresh question with no context short-circuits
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it('returns chunk-based fallback response when the selected provider has no API key configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.source).toBe('chunk-fallback');
    expect(result.answer).toContain('You may find related information below');
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it('returns chunk-based fallback response when the LLM returns an empty answer', async () => {
    mockGenerateAnswer.mockResolvedValue('   ');
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.source).toBe('chunk-fallback');
    expect(result.answer).toContain('You may find related information below');
  });

  it('returns chunk-based fallback response when the LLM call itself rejects', async () => {
    mockGenerateAnswer.mockRejectedValue(new Error('upstream 503'));
    const result = await answerQuestion('session-1', 'Tell me something novel.');
    expect(result.source).toBe('chunk-fallback');
    expect(result.answer).toContain('You may find related information below');
  });

  it('throws and logs a transcript error when chunk fallback is disabled and LLM call rejects', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 600,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      historyLimit: 10,
      rewriteFollowUpQueries: true,
      maxContextChars: 6000,
      maxHistoryCharsPerTurn: 600,
      autoCompactHistoryWords: 800,
      autoCompactContextWords: 0,
      showChunkFallbackWhenLlmUnavailable: false,
    });
    mockGenerateAnswer.mockRejectedValue(new Error('upstream 503'));
    await expect(answerQuestion('session-1', 'Tell me something novel.')).rejects.toThrow('upstream 503');
    expect(conversationsRepo.addMessage).toHaveBeenCalledWith(
      'conv-1',
      'assistant',
      expect.stringContaining('[error]'),
      undefined,
      undefined,
      expect.any(Number),
      'text',
    );
  });
});

describe('answerQuestion — locked session', () => {
  it('refuses a locked session before any embedding, cache, FAQ or LLM work happens', async () => {
    (conversationsRepo.findOrCreateBySession as any).mockResolvedValue({ id: 'conv-1', blocked: true });

    await expect(answerQuestion('session-1', 'let me back in')).rejects.toThrow(/chat has been closed/i);

    expect(embedText).not.toHaveBeenCalled();
    expect(redisCache.get).not.toHaveBeenCalled();
    expect(faqService.findBestMatch).not.toHaveBeenCalled();
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it("writes nothing to a locked session's transcript — it shouldn't be able to keep filling the log either", async () => {
    (conversationsRepo.findOrCreateBySession as any).mockResolvedValue({ id: 'conv-1', blocked: true });
    await expect(answerQuestion('session-1', 'let me back in')).rejects.toThrow();
    expect(conversationsRepo.addMessage).not.toHaveBeenCalled();
  });
});

describe('answerQuestion — prompt size budgets', () => {
  it('fills the context best-match-first and stops at the budget, dropping the weakest matches', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'A'.repeat(100), similarity: 0.9, title: 'Best', sourceRef: 'a.txt', sourceType: 'text' },
      { content: 'B'.repeat(100), similarity: 0.8, title: 'Second', sourceRef: 'b.txt', sourceType: 'text' },
      { content: 'C'.repeat(100), similarity: 0.7, title: 'Third — should not fit', sourceRef: 'c.txt', sourceType: 'text' },
    ]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, maxContextChars: 250 });

    await answerQuestion('session-1', 'Tell me something novel.');

    const { context } = (mockGenerateAnswer as any).mock.calls[0][0];
    expect(context).toContain('A'.repeat(100)); // best match kept
    expect(context).toContain('B'.repeat(100));
    expect(context).not.toContain('C'.repeat(100)); // weakest match dropped at the budget
  });

  it('still sends the best match, truncated, when a single chunk is larger than the whole budget', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'X'.repeat(5000), similarity: 0.9, title: 'Huge', sourceRef: 'a.txt', sourceType: 'text' },
    ]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, maxContextChars: 500 });

    await answerQuestion('session-1', 'Tell me something novel.');

    const { context } = (mockGenerateAnswer as any).mock.calls[0][0];
    expect(context).toHaveLength(500);
  });

  it('only cites related articles for chunks that actually made it into the context', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'A'.repeat(200), similarity: 0.9, title: 'Included', sourceRef: 'https://example.com/in', sourceType: 'url' },
      { content: 'B'.repeat(200), similarity: 0.5, title: 'Budgeted out', sourceRef: 'https://example.com/out', sourceType: 'url' },
    ]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, maxContextChars: 250 });

    const result = await answerQuestion('session-1', 'Tell me something novel.');

    expect(result.answer).toContain('https://example.com/in');
    expect(result.answer).not.toContain('https://example.com/out');
  });

  it('trims each prior turn to the configured per-turn budget', async () => {
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'Short question' },
      { role: 'assistant', content: 'L'.repeat(2000) },
    ]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, maxHistoryCharsPerTurn: 100 });

    await answerQuestion('session-1', 'explain simply');

    const { history } = (mockGenerateAnswer as any).mock.calls[0][0];
    expect(history[0].content).toBe('Short question'); // under budget, untouched
    expect(history[1].content).toHaveLength(101); // 100 chars + the ellipsis
    expect(history[1].content.endsWith('…')).toBe(true);
  });

  it('leaves the retrieved context unchanged when autoCompactContextWords is 0 (off by default)', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'word '.repeat(500), similarity: 0.9, title: 'Big match', sourceRef: 'a.txt', sourceType: 'text' },
    ]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, maxContextChars: 40000, autoCompactContextWords: 0 });

    const result = await answerQuestion('session-1', 'Tell me something novel.');

    const { context } = (mockGenerateAnswer as any).mock.calls[0][0];
    expect(context).toBe('word '.repeat(500));
    expect(result.source).toBe('llm'); // sanity: reached the real answer call
  });

  it('compacts the retrieved context once it crosses autoCompactContextWords, and marks the turn as compacted', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'word '.repeat(500), similarity: 0.9, title: 'Big match', sourceRef: 'a.txt', sourceType: 'text' },
    ]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, maxContextChars: 40000, autoCompactContextWords: 50 });
    mockGenerateAnswer.mockResolvedValueOnce('Compacted context summary.'); // the compaction call comes first
    mockGenerateAnswer.mockResolvedValueOnce('The AI-generated answer.'); // then the real answer

    await answerQuestion('session-1', 'Tell me something novel.');

    expect(mockGenerateAnswer).toHaveBeenCalledTimes(2);
    const [answerCall] = mockGenerateAnswer.mock.calls.slice(-1) as any[];
    expect(answerCall[0].context).toBe('Compacted context summary.');
  });

  it('never compacts context that is already under the configured budget', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'A short match.', similarity: 0.9, title: 'Small match', sourceRef: 'a.txt', sourceType: 'text' },
    ]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, maxContextChars: 40000, autoCompactContextWords: 5000 });

    await answerQuestion('session-1', 'Tell me something novel.');

    expect(mockGenerateAnswer).toHaveBeenCalledTimes(1); // no separate compaction call
    const { context } = (mockGenerateAnswer as any).mock.calls[0][0];
    expect(context).toBe('A short match.');
  });

  it('logs contextCompacted:true on the saved llmRequest once compaction runs, and omits it otherwise', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([
      { content: 'word '.repeat(500), similarity: 0.9, title: 'Big match', sourceRef: 'a.txt', sourceType: 'text' },
    ]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, maxContextChars: 40000, autoCompactContextWords: 50 });
    mockGenerateAnswer.mockResolvedValueOnce('Compacted context summary.');
    mockGenerateAnswer.mockResolvedValueOnce('The AI-generated answer.');

    await answerQuestion('session-1', 'Tell me something novel.');

    const [addMessageCall] = (conversationsRepo.addMessage as any).mock.calls.slice(-1);
    expect(addMessageCall[4].contextCompacted).toBe(true);
  });

  it('never runs context compaction for a fresh question with nothing usable in the knowledge base — the question is short-circuited to no-match', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([]);
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactContextWords: 1 });

    const result = await answerQuestion('session-1', 'Tell me something novel.');

    expect(result.source).toBe('no-match'); // fresh question, no context, short-circuited
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });
});

describe('answerQuestion — rephrase (bypassCache)', () => {
  it('skips the cache *and* FAQ stages so the visitor gets something other than the canned answer they just rejected', async () => {
    (redisCache.get as any).mockResolvedValue('The stale cached answer that prompted the rephrase.');
    (faqService.findBestMatch as any).mockResolvedValue({ answer: 'The very FAQ answer they just asked to rephrase.', similarity: 0.99 });

    const result = await answerQuestion('session-1', 'What are your hours?', { bypassCache: true });

    expect(redisCache.get).not.toHaveBeenCalled();
    expect(faqService.findBestMatch).not.toHaveBeenCalled(); // otherwise "Rephrase" would just re-serve the same FAQ
    expect(result.source).toBe('llm');
    expect(result.answer).toBe('The AI-generated answer.');
  });

  it('does not re-cache the rephrased answer — the cache already holds an entry for this exact question', async () => {
    await answerQuestion('session-1', 'What are your hours?', { bypassCache: true });
    expect(queryCacheRepo.upsert).not.toHaveBeenCalled();
    expect(redisCache.set).not.toHaveBeenCalled();
  });
});

describe('answerQuestion — follow-up query rewriting', () => {
  const priorTurns = [
    { role: 'user' as const, content: 'What is our annual leave policy?' },
    { role: 'assistant' as const, content: 'Employees receive 20 days of annual leave.' },
  ];

  it('searches on the rewritten standalone query, not the follow-up as typed', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, rewriteFollowUpQueries: true });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(priorTurns);
    mockGenerateAnswer
      .mockResolvedValueOnce('Can unused annual leave be carried forward to the next year?') // the rewrite call
      .mockResolvedValueOnce('The AI-generated answer.'); // the real answer call

    await answerQuestion('session-1', 'Can I carry it over?');

    expect(embedText).toHaveBeenCalledWith('can unused annual leave be carried forward to the next year');
  });

  it('still asks the answering model the question the user actually typed', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, rewriteFollowUpQueries: true });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(priorTurns);
    mockGenerateAnswer.mockResolvedValueOnce('Can unused annual leave be carried forward?').mockResolvedValueOnce('The AI-generated answer.');

    await answerQuestion('session-1', 'Can I carry it over?');

    expect(mockGenerateAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ question: 'Can I carry it over?' }));
  });

  it('records the rewritten query in the admin request log, so Chat Logs shows what was really searched', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, rewriteFollowUpQueries: true });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(priorTurns);
    mockGenerateAnswer.mockResolvedValueOnce('Can unused annual leave be carried forward?').mockResolvedValueOnce('The AI-generated answer.');

    await answerQuestion('session-1', 'Can I carry it over?');

    expect(conversationsRepo.addMessage).toHaveBeenCalledWith(
      'conv-1',
      'assistant',
      'The AI-generated answer.',
      'llm',
      expect.objectContaining({ searchQuery: 'Can unused annual leave be carried forward?' }),
      expect.any(Number),
      'text',
    );
  });

  it('never rewrites a fresh question — it is already standalone, and the extra call would be wasted', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, rewriteFollowUpQueries: true });
    await answerQuestion('session-1', 'What is our annual leave policy?');
    expect(mockGenerateAnswer).toHaveBeenCalledTimes(1); // the answer call only — no rewrite call
    expect(embedText).toHaveBeenCalledWith('what is our annual leave policy');
  });

  it('searches the follow-up as typed when rewriting is turned off', async () => {
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(priorTurns);
    await answerQuestion('session-1', 'Can I carry it over?'); // DEFAULT_LLM_SETTINGS has rewriting off
    expect(mockGenerateAnswer).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith('can i carry it over');
  });

  it('falls back to the original question when the rewrite call fails — a rewrite is an optimization, never a reason to fail the turn', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, rewriteFollowUpQueries: true });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(priorTurns);
    mockGenerateAnswer.mockRejectedValueOnce(new Error('rewrite call failed')).mockResolvedValueOnce('The AI-generated answer.');

    const result = await answerQuestion('session-1', 'Can I carry it over?');

    expect(result.source).toBe('llm');
    expect(embedText).toHaveBeenCalledWith('can i carry it over');
  });
});

describe('answerQuestion — no matching context', () => {
  it('returns noContextMessage immediately without calling the LLM when no chunks match on a fresh question', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([]);
    const result = await answerQuestion('session-1', 'Something totally unrelated.');
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
    expect(result.source).toBe('no-match');
    expect(result.answer).toBe(DEFAULT_PROMPT_SETTINGS.noContextMessage);
  });

  it('does not cache the noContextMessage answer (not a real LLM response)', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([]);
    await answerQuestion('session-1', 'Something totally unrelated.');
    expect(queryCacheRepo.upsert).not.toHaveBeenCalled();
    expect(redisCache.set).not.toHaveBeenCalled();
  });

  it('still falls back to the configured noContextMessage when the model genuinely has no answer at all', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([]);
    mockGenerateAnswer.mockResolvedValue('§NO_ANSWER§');
    const result = await answerQuestion('session-1', 'Something totally unrelated.');
    expect(result.source).toBe('no-match');
    expect(result.answer).toBe(DEFAULT_PROMPT_SETTINGS.noContextMessage);
    expect(queryCacheRepo.upsert).not.toHaveBeenCalled();
  });

  it('never skips the LLM for a follow-up, even with zero matching chunks — the conversation history may still hold the answer', async () => {
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([]);
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'What are the challenges for first-time buyers?' },
      { role: 'assistant', content: 'Unfamiliar terms and hidden costs are common pitfalls.' },
    ]);
    const result = await answerQuestion('session-1', 'explain simply');
    expect(result.source).toBe('llm');
    expect(mockGenerateAnswer).toHaveBeenCalledTimes(1);
  });
});

describe('answerQuestion — auto-compacted conversation memory', () => {
  const OLD = new Date('2026-09-01T10:00:00Z');
  const NEW = new Date('2026-09-06T10:00:00Z');

  /** Two heavy older messages plus four light recent ones — enough to blow a small word budget with something foldable behind the always-kept newest turns. */
  function longHistory() {
    return [
      { role: 'user', content: 'word '.repeat(300), createdAt: OLD },
      { role: 'assistant', content: 'word '.repeat(300), createdAt: OLD },
      { role: 'user', content: 'word '.repeat(300), createdAt: NEW },
      { role: 'assistant', content: 'word '.repeat(300), createdAt: NEW },
      { role: 'user', content: 'And the deposit?', createdAt: NEW },
      { role: 'assistant', content: 'Ten percent.', createdAt: NEW },
    ];
  }

  it('leaves a short conversation alone — no summary call, no summary written', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 800 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'Hello', createdAt: NEW },
      { role: 'assistant', content: 'Hi there', createdAt: NEW },
    ]);
    await answerQuestion('session-1', 'And the deposit?');
    expect(conversationsRepo.setSummary).not.toHaveBeenCalled();
    expect(mockGenerateAnswer).toHaveBeenCalledTimes(1); // the answer itself only
  });

  it('summarizes the older turns once the history passes the configured word budget, and persists the recap', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 100 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(longHistory());
    mockGenerateAnswer.mockResolvedValueOnce('Recap of the earlier chat.'); // the compaction call comes first

    await answerQuestion('session-1', 'And the deposit?');

    expect(conversationsRepo.setSummary).toHaveBeenCalledWith('conv-1', 'Recap of the earlier chat.', OLD);
  });

  it('sends the recap alongside only the newest turns, so the prompt stops growing with the conversation', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 100 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(longHistory());
    mockGenerateAnswer.mockResolvedValueOnce('Recap of the earlier chat.');

    await answerQuestion('session-1', 'And the deposit?');

    const [answerCall] = mockGenerateAnswer.mock.calls.slice(-1) as any[];
    expect(answerCall[0].historySummary).toBe('Recap of the earlier chat.');
    expect(answerCall[0].history).toHaveLength(4); // only the newest turns, kept verbatim
  });

  it('never puts the recap in `history` — Gemini and Anthropic both reject a leading assistant turn', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 800 });
    (conversationsRepo.findOrCreateBySession as any).mockResolvedValue({ id: 'conv-1', blocked: false, summary: 'Earlier chat recap.', summaryUntil: OLD });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([{ role: 'user', content: 'And the deposit?', createdAt: NEW }]);

    await answerQuestion('session-1', 'And the deposit?');

    const [answerCall] = mockGenerateAnswer.mock.calls.slice(-1) as any[];
    expect(answerCall[0].history[0].role).toBe('user');
    expect(answerCall[0].history.some((h: any) => h.content.includes('Earlier chat recap.'))).toBe(false);
  });

  it('is off entirely when autoCompactHistoryWords is 0, however long the conversation gets', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 0 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(longHistory());
    await answerQuestion('session-1', 'And the deposit?');
    expect(conversationsRepo.setSummary).not.toHaveBeenCalled();
    expect(mockGenerateAnswer).toHaveBeenCalledTimes(1);
  });

  it('logs real progress toward the auto-compact budget even when it has not triggered yet, so Chat Logs can show "X/Y words" instead of nothing at all', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 5000 }); // budget nowhere near crossed
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'one two three', createdAt: NEW }, // 3 words
      { role: 'assistant', content: 'four five', createdAt: NEW }, // 2 words
    ]);

    await answerQuestion('session-1', 'And the deposit?');

    expect(conversationsRepo.setSummary).not.toHaveBeenCalled();
    const [addMessageCall] = (conversationsRepo.addMessage as any).mock.calls.slice(-1);
    const loggedLlmRequest = addMessageCall[4];
    expect(loggedLlmRequest.autoCompactProgress).toEqual({ wordsSoFar: 5, budgetWords: 5000 });
    expect(loggedLlmRequest.historySummary).toBeUndefined();
  });

  it('logs no autoCompactProgress at all when auto-compact is off (autoCompactHistoryWords: 0)', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 0 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(longHistory());

    await answerQuestion('session-1', 'And the deposit?');

    const [addMessageCall] = (conversationsRepo.addMessage as any).mock.calls.slice(-1);
    expect(addMessageCall[4].autoCompactProgress).toBeUndefined();
  });

  it('always fetches a large, fixed history window for the compaction decision — never historyLimit — so a low historyLimit can never hide older turns from ever being folded into a recap', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, historyLimit: 2, autoCompactHistoryWords: 100 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(longHistory());
    mockGenerateAnswer.mockResolvedValueOnce('Recap of the earlier chat.');

    await answerQuestion('session-1', 'And the deposit?');

    // The fetch itself must not be bounded by historyLimit (2) — compaction
    // needs to see the full window to decide anything got folded at all.
    expect(conversationsRepo.getRecentMessages).toHaveBeenCalledWith('conv-1', 500, null);
    expect(conversationsRepo.setSummary).toHaveBeenCalledWith('conv-1', 'Recap of the earlier chat.', OLD);
  });

  it('caps the verbatim turns actually sent to historyLimit, applied after compaction — not on the raw fetch', async () => {
    // Budget deliberately way above this history's word count: nothing gets
    // compacted, but historyLimit (2) must still cap what's sent, exactly as
    // it did before this fix — just applied in the right place now.
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, historyLimit: 2, autoCompactHistoryWords: 5000 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'q1', createdAt: OLD },
      { role: 'assistant', content: 'a1', createdAt: OLD },
      { role: 'user', content: 'q2', createdAt: NEW },
      { role: 'assistant', content: 'a2', createdAt: NEW },
    ]);

    await answerQuestion('session-1', 'q3');

    expect(conversationsRepo.setSummary).not.toHaveBeenCalled(); // well under budget
    const [answerCall] = mockGenerateAnswer.mock.calls.slice(-1) as any[];
    expect(answerCall[0].history.map((h: any) => h.content)).toEqual(['q2', 'a2']); // newest 2 only
  });

  it('sends no history at all when historyLimit is 0, rather than everything (slice(-0) would return the whole array)', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, historyLimit: 0, autoCompactHistoryWords: 5000 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'q1', createdAt: OLD },
      { role: 'assistant', content: 'a1', createdAt: OLD },
    ]);

    await answerQuestion('session-1', 'q2');

    const [answerCall] = mockGenerateAnswer.mock.calls.slice(-1) as any[];
    expect(answerCall[0].history).toEqual([]);
  });

  it('fetches only the messages a stored recap does not already cover, and prepends that recap', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 800 });
    (conversationsRepo.findOrCreateBySession as any).mockResolvedValue({
      id: 'conv-1',
      blocked: false,
      summary: 'The visitor is a first-time buyer with a 40k budget.',
      summaryUntil: OLD,
    });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([{ role: 'user', content: 'And the deposit?', createdAt: NEW }]);

    await answerQuestion('session-1', 'And the deposit?');

    expect(conversationsRepo.getRecentMessages).toHaveBeenCalledWith('conv-1', 500, OLD);
    const [answerCall] = mockGenerateAnswer.mock.calls.slice(-1) as any[];
    expect(answerCall[0].historySummary).toContain('first-time buyer with a 40k budget');
  });

  it('treats a conversation with a stored recap as a follow-up even when nothing new has been said since', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 800 });
    (conversationsRepo.findOrCreateBySession as any).mockResolvedValue({ id: 'conv-1', blocked: false, summary: 'Earlier chat recap.', summaryUntil: OLD });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([]);
    (documentsRepo.searchSimilarChunks as any).mockResolvedValue([]); // a follow-up must still reach the LLM with no chunks

    const result = await answerQuestion('session-1', 'explain simply');

    expect(result.source).toBe('llm');
    expect(redisCache.get).not.toHaveBeenCalled(); // fast paths skipped, exactly as for any follow-up
  });

  it('records the recap on the logged LLM request, so an admin can check what the model was told', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 800 });
    (conversationsRepo.findOrCreateBySession as any).mockResolvedValue({ id: 'conv-1', blocked: false, summary: 'Earlier chat recap.', summaryUntil: OLD });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([{ role: 'user', content: 'And the deposit?', createdAt: NEW }]);

    await answerQuestion('session-1', 'And the deposit?');

    expect(conversationsRepo.addMessage).toHaveBeenCalledWith(
      'conv-1',
      'assistant',
      expect.any(String),
      'llm',
      expect.objectContaining({ historySummary: 'Earlier chat recap.' }),
      expect.any(Number),
      'text',
    );
  });

  it('still answers when the summarizing call fails — compaction is an optimisation, never a reason to fail a question', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 100 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(longHistory());
    mockGenerateAnswer.mockRejectedValueOnce(new Error('summary provider blew up'));

    const result = await answerQuestion('session-1', 'And the deposit?');

    expect(result.source).toBe('llm');
    expect(conversationsRepo.setSummary).not.toHaveBeenCalled();
  });

  it('marks the response compacted:true once a recap is in play — the admin-only signal FloatingChat shows in the live chat', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 100 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue(longHistory());
    mockGenerateAnswer.mockResolvedValueOnce('Recap of the earlier chat.');

    const result = await answerQuestion('session-1', 'And the deposit?');

    expect(result.compacted).toBe(true);
  });

  it('marks the response compacted:false when the conversation never needed compaction', async () => {
    (settingsRepo.getLlm as any).mockResolvedValue({ ...DEFAULT_LLM_SETTINGS, autoCompactHistoryWords: 800 });
    (conversationsRepo.getRecentMessages as any).mockResolvedValue([
      { role: 'user', content: 'Hello', createdAt: NEW },
      { role: 'assistant', content: 'Hi there', createdAt: NEW },
    ]);

    const result = await answerQuestion('session-1', 'And the deposit?');

    expect(result.compacted).toBe(false);
  });
});
