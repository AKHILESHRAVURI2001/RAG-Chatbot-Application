import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ingestionService } from './ingestionService';
import { documentsRepo } from '../../db/queries/documents.queries';
import { loadSitemapUrls } from './sitemapLoader';

const tagsSchema = z.array(z.string().min(1).max(50)).max(20).default([]);

export async function handleListDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    res.json(await ingestionService.listDocuments(tag));
  } catch (err) {
    next(err);
  }
}

export async function handleListTags(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await documentsRepo.listAllTags());
  } catch (err) {
    next(err);
  }
}

const urlSchema = z.object({
  url: z.string().url(),
  tags: tagsSchema,
  rechunkIfExists: z.boolean().optional(),
  skipIfExists: z.boolean().optional(),
});

export async function handleIngestUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const { url, tags, rechunkIfExists, skipIfExists } = urlSchema.parse(req.body);
    const doc = await ingestionService.ingestUrl(url, tags, { rechunkIfExists, skipIfExists });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

const sitemapSchema = z.object({ url: z.string().url() });

export async function handleExpandSitemap(req: Request, res: Response, next: NextFunction) {
  try {
    const { url } = sitemapSchema.parse(req.body);
    const urls = await loadSitemapUrls(url);
    res.json({ urls });
  } catch (err) {
    next(err);
  }
}

const textSchema = z.object({ title: z.string().min(1).max(200), text: z.string().min(1), tags: tagsSchema });

export async function handleIngestText(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, text, tags } = textSchema.parse(req.body);
    const doc = await ingestionService.ingestText(title, text, tags);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

export async function handleIngestFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name must be "file")' });
    let rawTags: string[] = [];
    if (Array.isArray(req.body.tags)) {
      rawTags = req.body.tags;
    } else if (typeof req.body.tags === 'string' && req.body.tags.trim()) {
      const trimmed = req.body.tags.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) rawTags = parsed;
        } catch {
          rawTags = trimmed.slice(1, -1).split(',');
        }
      } else {
        rawTags = trimmed.split(',');
      }
    }
    const tags = tagsSchema.parse(rawTags.map((t: string) => String(t).trim()).filter(Boolean));
    const doc = await ingestionService.ingestFile(req.file.buffer, req.file.originalname, req.file.mimetype, tags);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

export async function handleSetTags(req: Request, res: Response, next: NextFunction) {
  try {
    const tags = tagsSchema.parse(req.body.tags);
    const doc = await documentsRepo.setTags(req.params.id, tags);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

const pauseSchema = z.object({ paused: z.boolean() });

export async function handleSetPaused(req: Request, res: Response, next: NextFunction) {
  try {
    const { paused } = pauseSchema.parse(req.body);
    const doc = await documentsRepo.setPaused(req.params.id, paused);
    if (!doc) return res.status(404).json({ error: 'Document not found, or it is still processing / failed (only ready documents can be paused).' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

export async function handleRecheckDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await ingestionService.recheckUrlDocument(req.params.id);
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

export async function handleListChunks(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await documentsRepo.listChunks(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function handleExportChunks(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentsRepo.getById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const chunks = await documentsRepo.listChunks(req.params.id);

    const exportPayload = {
      document: { id: doc.id, title: doc.title, sourceType: doc.sourceType, sourceRef: doc.sourceRef, tags: doc.tags, createdAt: doc.createdAt },
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      embeddingDimensions: chunks[0]?.embedding.length ?? 0,
      chunkCount: chunks.length,
      chunks: chunks.map((c) => ({ id: c.id, content: c.content, tokenCount: c.tokenCount, embedding: c.embedding, createdAt: c.createdAt })),
    };

    // A safe, readable filename derived from the title — falls back to the document id if there's nothing usable.
    const slug =
      (doc.title ?? doc.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || doc.id;

    res.setHeader('Content-Disposition', `attachment; filename="${slug}-embeddings.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(exportPayload, null, 2));
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteDocument(req: Request, res: Response, next: NextFunction) {
  try {
    await ingestionService.deleteDocument(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
