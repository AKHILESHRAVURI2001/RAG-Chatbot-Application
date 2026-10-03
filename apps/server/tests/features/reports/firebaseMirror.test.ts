import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCollection = vi.fn();
const mockCollectionGroup = vi.fn();
const mockInitializeApp = vi.fn((..._args: any[]) => ({ name: 'mock-app' }));
const mockGetFirestore = vi.fn((..._args: any[]) => ({ collection: mockCollection, collectionGroup: mockCollectionGroup }));

vi.mock('firebase-admin/app', () => ({
  initializeApp: (...args: any[]) => mockInitializeApp(...args),
  cert: (account: unknown) => account,
  deleteApp: vi.fn(async () => {}),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: (...args: any[]) => mockGetFirestore(...args),
}));

const VALID_ACCOUNT = JSON.stringify({ project_id: 'p', private_key: 'k', client_email: 'e@p.iam.gserviceaccount.com' });

describe('firebaseMirror', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('isConfigured() is false with no credential set', async () => {
    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: false, serviceAccountJson: '' });
    expect(firebaseMirror.isConfigured()).toBe(false);
  });

  it('isConfigured() is false when the credential is present but not valid JSON', async () => {
    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: 'not json' });
    expect(firebaseMirror.isConfigured()).toBe(false);
  });

  it('isConfigured() is false when the JSON is valid but missing required service-account fields', async () => {
    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: '{"project_id":"p"}' });
    expect(firebaseMirror.isConfigured()).toBe(false);
  });

  it('isConfigured() is true once a complete service-account credential is resolved', async () => {
    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });
    expect(firebaseMirror.isConfigured()).toBe(true);
  });

  it('mirrorMessage is a no-op (never touches Firestore) when mirroring is disabled', async () => {
    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: false, serviceAccountJson: VALID_ACCOUNT });
    firebaseMirror.mirrorMessage({ messageId: 'm1', conversationId: 'c1', role: 'user', content: 'hi', createdAt: new Date() });
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('mirrorMessage is a no-op when enabled but no valid credential is configured', async () => {
    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: '' });
    firebaseMirror.mirrorMessage({ messageId: 'm1', conversationId: 'c1', role: 'user', content: 'hi', createdAt: new Date() });
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('mirrorMessage writes to Firestore when enabled and configured, without throwing even if the write rejects', async () => {
    const set = vi.fn(async () => {
      throw new Error('Firestore unreachable');
    });
    const add = vi.fn(async () => {});
    const doc = vi.fn(() => ({ set, collection: vi.fn(() => ({ add })) }));
    mockCollection.mockReturnValue({ doc });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    // Must not throw synchronously, and the returned (fire-and-forget)
    // rejection must never surface as an unhandled rejection either.
    expect(() =>
      firebaseMirror.mirrorMessage({ messageId: 'm1', conversationId: 'c1', role: 'user', content: 'hi', createdAt: new Date() }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget promise settle
    expect(set).toHaveBeenCalled();
  });

  it('mirrorMessage includes the full llmRequest payload when given one, so Firestore carries everything Chat Logs itself can show', async () => {
    const add = vi.fn(async () => {});
    const doc = vi.fn(() => ({ set: vi.fn(async () => {}), collection: vi.fn(() => ({ add })) }));
    mockCollection.mockReturnValue({ doc });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const llmRequest = { systemPrompt: 'sp', context: 'ctx', question: 'q', model: 'gpt', temperature: 0, topP: 1, frequencyPenalty: 0, presencePenalty: 0, maxTokens: 100, history: [] } as any;
    firebaseMirror.mirrorMessage({ messageId: 'm1', conversationId: 'c1', role: 'assistant', content: 'answer', answerSource: 'llm', llmRequest, createdAt: new Date() });
    await new Promise((r) => setTimeout(r, 0));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'm1', llmRequest }));
  });

  it('mirrorConversationSummary is a no-op when mirroring is disabled', async () => {
    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: false, serviceAccountJson: VALID_ACCOUNT });
    firebaseMirror.mirrorConversationSummary('c1', 'recap text', new Date());
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('mirrorConversationSummary writes the recap onto the conversation doc when configured', async () => {
    const set = vi.fn(async () => {});
    const doc = vi.fn(() => ({ set }));
    mockCollection.mockReturnValue({ doc });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const until = new Date();
    firebaseMirror.mirrorConversationSummary('c1', 'recap text', until);
    await new Promise((r) => setTimeout(r, 0));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ summary: 'recap text', summaryUntil: until }), { merge: true });
  });

  it('testConnection reports failure with no credential configured, without throwing', async () => {
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    const result = await firebaseMirror.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('getStats returns null (not an error) when not configured', async () => {
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    expect(await firebaseMirror.getStats()).toBeNull();
  });

  it('getStats returns the aggregate counts when configured', async () => {
    mockCollection.mockReturnValue({ count: () => ({ get: async () => ({ data: () => ({ count: 3 }) }) }) });
    mockCollectionGroup.mockReturnValue({ count: () => ({ get: async () => ({ data: () => ({ count: 12 }) }) }) });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    expect(await firebaseMirror.getStats()).toEqual({ conversationCount: 3, messageCount: 12 });
  });

  it('getStats returns null (not a throw) when the Firestore call fails', async () => {
    mockCollection.mockReturnValue({
      count: () => ({
        get: async () => {
          throw new Error('unreachable');
        },
      }),
    });
    mockCollectionGroup.mockReturnValue({ count: () => ({ get: async () => ({ data: () => ({ count: 0 }) }) }) });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    expect(await firebaseMirror.getStats()).toBeNull();
  });

  it('getStats applies a date-range filter (createdAt >=/<=) before counting, when given one', async () => {
    const whereCalls: any[] = [];
    const countable = { count: () => ({ get: async () => ({ data: () => ({ count: 5 }) }) }) };
    const withWhere: any = { ...countable, where: (...args: any[]) => (whereCalls.push(args), withWhere) };
    mockCollection.mockReturnValue(withWhere);
    mockCollectionGroup.mockReturnValue(withWhere);

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');
    const result = await firebaseMirror.getStats({ from, to });

    expect(result).toEqual({ conversationCount: 5, messageCount: 5 });
    expect(whereCalls).toEqual(
      expect.arrayContaining([
        ['createdAt', '>=', from],
        ['createdAt', '<=', to],
      ]),
    );
  });

  it('getStats still returns a real conversationCount when the (collection-group) message count needs a missing Firestore index', async () => {
    mockCollection.mockReturnValue({ count: () => ({ get: async () => ({ data: () => ({ count: 5 }) }) }) });
    mockCollectionGroup.mockReturnValue({
      count: () => ({
        get: async () => {
          throw new Error('FAILED_PRECONDITION: The query requires an index. You can create it here: https://...');
        },
      }),
    });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const result = await firebaseMirror.getStats();
    expect(result?.conversationCount).toBe(5);
    expect(result?.messageCount).toBeNull();
    expect(result?.messageCountError).toContain('requires an index');
  });

  it('getAnswerSourceBreakdown returns null when not configured', async () => {
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    expect(await firebaseMirror.getAnswerSourceBreakdown()).toBeNull();
  });

  it('getAnswerSourceBreakdown counts each answer source independently', async () => {
    const counts: Record<string, number> = { faq: 2, cache: 3, llm: 7, 'no-match': 1 };
    mockCollectionGroup.mockReturnValue({
      where: (_field: string, _op: string, value: string) => ({
        count: () => ({ get: async () => ({ data: () => ({ count: counts[value] }) }) }),
      }),
    });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    expect(await firebaseMirror.getAnswerSourceBreakdown()).toEqual({ faq: 2, cache: 3, llm: 7, noMatch: 1 });
  });

  it('getAnswerSourceBreakdown reports the error (e.g. a missing composite index) instead of throwing', async () => {
    mockCollectionGroup.mockReturnValue({
      where: () => ({
        count: () => ({
          get: async () => {
            throw new Error('FAILED_PRECONDITION: The query requires an index.');
          },
        }),
      }),
    });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const result = await firebaseMirror.getAnswerSourceBreakdown();
    expect(result).toEqual({ error: expect.stringContaining('requires an index') });
  });

  it('listConversations returns null when not configured', async () => {
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    expect(await firebaseMirror.listConversations(25)).toBeNull();
  });

  it('listConversations maps documents and sets nextCursor only when a full page came back', async () => {
    const fakeDocs = [
      { id: 'c1', data: () => ({ sessionId: 's1', blocked: false, summary: 'a recap' }) },
      { id: 'c2', data: () => ({ sessionId: 's2', blocked: true }) },
    ];
    const query = { get: async () => ({ docs: fakeDocs }) };
    mockCollection.mockReturnValue({ orderBy: () => ({ limit: () => query }) });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const page = await firebaseMirror.listConversations(2);
    expect(page?.conversations).toEqual([
      { id: 'c1', sessionId: 's1', createdAt: null, updatedAt: null, blocked: false, hasSummary: true },
      { id: 'c2', sessionId: 's2', createdAt: null, updatedAt: null, blocked: true, hasSummary: false },
    ]);
    expect(page?.nextCursor).toBe('c2'); // exactly `limit` docs came back — there may be more
  });

  it('listConversations sets nextCursor to null when fewer than a full page came back', async () => {
    const fakeDocs = [{ id: 'c1', data: () => ({ sessionId: 's1' }) }];
    const query = { get: async () => ({ docs: fakeDocs }) };
    mockCollection.mockReturnValue({ orderBy: () => ({ limit: () => query }) });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const page = await firebaseMirror.listConversations(25);
    expect(page?.nextCursor).toBeNull();
  });

  it('getConversationMessages returns null when not configured', async () => {
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    expect(await firebaseMirror.getConversationMessages('c1')).toBeNull();
  });

  it('getConversationMessages maps the mirrored messages subcollection, oldest first', async () => {
    const fakeDocs = [
      { id: 'm1', data: () => ({ role: 'user', content: 'hi', createdAt: null }) },
      {
        id: 'm2',
        data: () => ({ role: 'assistant', content: 'hello', answerSource: 'llm', responseTimeMs: 500, llmRequest: { contextCompacted: true } }),
      },
    ];
    const messagesQuery = { orderBy: () => ({ get: async () => ({ docs: fakeDocs }) }) };
    const doc = vi.fn(() => ({ collection: () => messagesQuery }));
    mockCollection.mockReturnValue({ doc });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const messages = await firebaseMirror.getConversationMessages('c1');
    expect(messages).toEqual([
      { id: 'm1', role: 'user', content: 'hi', answerSource: null, responseTimeMs: null, createdAt: null, contextCompacted: false, llmRequest: null, channel: 'text' },
      {
        id: 'm2',
        role: 'assistant',
        content: 'hello',
        answerSource: 'llm',
        responseTimeMs: 500,
        createdAt: null,
        contextCompacted: true,
        llmRequest: { contextCompacted: true },
        channel: 'text',
      },
    ]);
  });

  it('getConversationMessages marks a voice-channel message, and defaults to text when the field is absent (mirrored before this existed)', async () => {
    const fakeDocs = [{ id: 'm1', data: () => ({ role: 'user', content: 'hi', channel: 'voice' }) }, { id: 'm2', data: () => ({ role: 'user', content: 'hi' }) }];
    mockCollection.mockReturnValue({ doc: () => ({ collection: () => ({ orderBy: () => ({ get: async () => ({ docs: fakeDocs }) }) }) }) });

    const { firebaseSettingsCache } = await import('../../../src/config/firebaseCredentials');
    const { firebaseMirror } = await import('../../../src/features/reports/firebaseMirror');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: VALID_ACCOUNT });

    const messages = await firebaseMirror.getConversationMessages('c1');
    expect(messages?.map((m) => m.channel)).toEqual(['voice', 'text']);
  });
});
