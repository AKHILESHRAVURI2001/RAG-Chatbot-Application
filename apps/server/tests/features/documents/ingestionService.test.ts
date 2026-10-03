import { beforeEach, describe, expect, it, vi } from 'vitest';
// vi.mock calls are hoisted above these imports by vitest's transform, so the
// static imports below still resolve to the mocked modules.
import { documentsRepo } from '../../../src/db/queries/documents.queries';
import { redisCache } from '../../../src/cache/redis';
import { loadUrlContent } from '../../../src/features/documents/urlLoader';
import { settingsRepo } from '../../../src/db/queries/settings.queries';
import { chunkText } from '../../../src/features/documents/chunker';
import { ingestionService } from '../../../src/features/documents/ingestionService';

vi.mock('../../../src/features/documents/chunker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/features/documents/chunker')>();
  return { chunkText: vi.fn(actual.chunkText) }; // real behavior, spyable calls
});

vi.mock('../../../src/db/queries/documents.queries', () => ({
  documentsRepo: {
    getById: vi.fn(),
    markProcessing: vi.fn(),
    deleteChunks: vi.fn(),
    insertChunks: vi.fn(),
    markReady: vi.fn(),
    markFailed: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  },
}));

vi.mock('../../../src/providers/embedding/resolve', () => ({ embedBatch: vi.fn(async () => [[0.1, 0.2, 0.3]]) }));

vi.mock('../../../src/features/documents/urlLoader', () => ({ loadUrlContent: vi.fn() }));

vi.mock('../../../src/cache/redis', () => ({ redisCache: { flushAll: vi.fn() } }));

vi.mock('../../../src/db/queries/settings.queries', () => ({
  settingsRepo: { getChunking: vi.fn(async () => ({ chunkSize: 220, overlap: 40 })) },
}));

const EXISTING_DOC = { id: 'doc-1', sourceType: 'url' as const, sourceRef: 'https://example.com', title: 'Old title', status: 'ready' as const, error: null, createdAt: 'now' };

beforeEach(() => {
  vi.clearAllMocks();
  (documentsRepo.getById as any).mockResolvedValue(EXISTING_DOC);
  (loadUrlContent as any).mockResolvedValue({ title: 'New title', text: 'Fresh page content, enough words to form a chunk.' });
});

describe('ingestionService.recheckUrlDocument', () => {
  it('rejects a document that is not a URL document', async () => {
    (documentsRepo.getById as any).mockResolvedValue({ ...EXISTING_DOC, sourceType: 'file', sourceRef: null });
    await expect(ingestionService.recheckUrlDocument('doc-1')).rejects.toThrow('Only URL documents can be re-checked');
    expect(loadUrlContent).not.toHaveBeenCalled();
  });

  it('rejects a document id that does not exist', async () => {
    (documentsRepo.getById as any).mockResolvedValue(null);
    await expect(ingestionService.recheckUrlDocument('missing')).rejects.toThrow('Document not found');
  });

  it('re-crawls the same document id: marks processing, clears old chunks before inserting new ones, and marks ready with the fresh title', async () => {
    const callOrder: string[] = [];
    (documentsRepo.markProcessing as any).mockImplementation(async () => callOrder.push('markProcessing'));
    (documentsRepo.deleteChunks as any).mockImplementation(async () => callOrder.push('deleteChunks'));
    (documentsRepo.insertChunks as any).mockImplementation(async () => callOrder.push('insertChunks'));
    (documentsRepo.markReady as any).mockImplementation(async () => callOrder.push('markReady'));

    const result = await ingestionService.recheckUrlDocument('doc-1');

    expect(result.id).toBe('doc-1');
    expect(result.title).toBe('New title');
    expect(result.status).toBe('ready');
    expect(callOrder).toEqual(['markProcessing', 'deleteChunks', 'insertChunks', 'markReady']);
    expect(documentsRepo.markReady).toHaveBeenCalledWith('doc-1', 'New title');
    expect(redisCache.flushAll).toHaveBeenCalled();
  });

  it('marks the document failed (not deleted) when the re-crawl fails, so it stays visible in the list', async () => {
    (loadUrlContent as any).mockRejectedValue(new Error('404 Not Found'));
    await expect(ingestionService.recheckUrlDocument('doc-1')).rejects.toThrow('404 Not Found');
    expect(documentsRepo.markFailed).toHaveBeenCalledWith('doc-1', '404 Not Found');
    expect(documentsRepo.delete).not.toHaveBeenCalled();
  });

  it("uses the admin-configured chunk size/overlap, the same for every ingestion path", async () => {
    (settingsRepo.getChunking as any).mockResolvedValue({ chunkSize: 50, overlap: 5 });
    await ingestionService.recheckUrlDocument('doc-1');
    expect(chunkText).toHaveBeenCalledWith('Fresh page content, enough words to form a chunk.', 50, 5);
  });
});
