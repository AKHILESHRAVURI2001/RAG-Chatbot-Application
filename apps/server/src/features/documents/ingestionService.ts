import { documentsRepo } from '../../db/queries/documents.queries';
import { embedBatch } from '../../providers/embedding/resolve';
import { chunkText } from './chunker';
import { loadUrlContent } from './urlLoader';
import { loadFileContent } from './fileLoader';
import { redisCache } from '../../cache/redis';
import { settingsRepo } from '../../db/queries/settings.queries';
import type { DocumentDTO } from '../../shared';

export class IngestionService {
  private async embedAndStore(documentId: string, text: string): Promise<void> {
    const { chunkSize, overlap } = await settingsRepo.getChunking();
    const chunks = chunkText(text, chunkSize, overlap);
    if (chunks.length === 0) throw new Error('Document produced no usable text');
    const embeddings = await embedBatch(chunks.map((c) => c.content));
    await documentsRepo.insertChunks(
      documentId,
      chunks.map((c, i) => ({ ...c, embedding: embeddings[i] })),
    );
  }

  public async ingestUrl(
    url: string,
    tags: string[] = [],
    options?: { rechunkIfExists?: boolean; skipIfExists?: boolean },
  ): Promise<DocumentDTO> {
    const existing = await documentsRepo.findBySourceRef('url', url);
    if (existing) {
      if (options?.skipIfExists && !options?.rechunkIfExists) {
        if (tags.length > 0) {
          const mergedTags = Array.from(new Set([...existing.tags, ...tags]));
          await documentsRepo.setTags(existing.id, mergedTags);
        }
        return { ...existing, status: 'ready' as const };
      }
      if (options?.rechunkIfExists) {
        if (tags.length > 0) {
          const mergedTags = Array.from(new Set([...existing.tags, ...tags]));
          await documentsRepo.setTags(existing.id, mergedTags);
        }
        return this.recheckUrlDocument(existing.id);
      }
    }

    const doc = await documentsRepo.create('url', url, null, tags);
    try {
      const { title, text } = await loadUrlContent(url);
      await this.embedAndStore(doc.id, text);
      await documentsRepo.markReady(doc.id, title);
      return { ...doc, title, status: 'ready' as const };
    } catch (err: any) {
      await documentsRepo.markFailed(doc.id, err.message ?? String(err));
      throw err;
    } finally {
      await redisCache.flushAll();
    }
  }

  public async ingestFile(buffer: Buffer, filename: string, mimetype: string, tags: string[] = []): Promise<DocumentDTO> {
    const doc = await documentsRepo.create('file', filename, filename, tags);
    try {
      const text = await loadFileContent(buffer, filename, mimetype);
      await this.embedAndStore(doc.id, text);
      await documentsRepo.markReady(doc.id);
      return { ...doc, status: 'ready' as const };
    } catch (err: any) {
      await documentsRepo.markFailed(doc.id, err.message ?? String(err));
      throw err;
    } finally {
      await redisCache.flushAll();
    }
  }

  public async ingestText(title: string, text: string, tags: string[] = []): Promise<DocumentDTO> {
    const doc = await documentsRepo.create('text', null, title, tags);
    try {
      await this.embedAndStore(doc.id, text);
      await documentsRepo.markReady(doc.id);
      return { ...doc, status: 'ready' as const };
    } catch (err: any) {
      await documentsRepo.markFailed(doc.id, err.message ?? String(err));
      throw err;
    } finally {
      await redisCache.flushAll();
    }
  }

  public async deleteDocument(id: string): Promise<void> {
    await documentsRepo.delete(id);
    await redisCache.flushAll();
  }

  public async recheckUrlDocument(id: string): Promise<DocumentDTO> {
    const doc = await documentsRepo.getById(id);
    if (!doc) throw new Error('Document not found');
    if (doc.sourceType !== 'url' || !doc.sourceRef) throw new Error('Only URL documents can be re-checked');

    await documentsRepo.markProcessing(id);
    try {
      const { title, text } = await loadUrlContent(doc.sourceRef);
      await documentsRepo.deleteChunks(id);
      await this.embedAndStore(id, text);
      await documentsRepo.markReady(id, title);
      return { ...doc, title, status: 'ready' as const };
    } catch (err: any) {
      await documentsRepo.markFailed(id, err.message ?? String(err));
      throw err;
    } finally {
      await redisCache.flushAll();
    }
  }

  public async listDocuments(tag?: string): Promise<DocumentDTO[]> {
    return documentsRepo.list(tag);
  }
}

export const ingestionService = new IngestionService();
