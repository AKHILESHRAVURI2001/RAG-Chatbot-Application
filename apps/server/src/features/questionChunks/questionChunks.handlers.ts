import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { questionChunksRepo } from '../../db/queries/questionChunks.queries';
import { embedText } from '../../providers/embedding/resolve';

const createSchema = z.object({
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(5000),
  similarityThreshold: z.number().min(0.1).max(1.0).optional().default(0.80),
});

const updateSchema = z.object({
  question: z.string().min(1).max(1000).optional(),
  answer: z.string().min(1).max(5000).optional(),
  similarityThreshold: z.number().min(0.1).max(1.0).optional(),
});

export async function handleListQuestionChunks(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const query = (req.query.query as string) || '';
    const offset = (page - 1) * limit;

    const { items, total } = await questionChunksRepo.list({ query, limit, offset });
    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function handleCreateQuestionChunk(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSchema.parse(req.body);
    let embedding: number[] | undefined;
    try {
      embedding = await embedText(data.question);
    } catch {
      // non-fatal if embedding provider is unconfigured
    }

    const item = await questionChunksRepo.create({
      question: data.question,
      answer: data.answer,
      embedding,
      similarityThreshold: data.similarityThreshold,
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateQuestionChunk(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateSchema.parse(req.body);

    let embedding: number[] | undefined;
    if (data.question) {
      try {
        embedding = await embedText(data.question);
      } catch {
        // non-fatal
      }
    }

    const updated = await questionChunksRepo.update(id, {
      question: data.question,
      answer: data.answer,
      embedding,
      similarityThreshold: data.similarityThreshold,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Question chunk pair not found' });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteQuestionChunk(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deleted = await questionChunksRepo.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Question chunk pair not found' });
    }
    res.json({ success: true, message: 'Question chunk pair deleted' });
  } catch (err) {
    next(err);
  }
}

export async function handleClearAllQuestionChunks(_req: Request, res: Response, next: NextFunction) {
  try {
    const count = await questionChunksRepo.clearAll();
    res.json({ success: true, count, message: `Cleared ${count} question chunk pair(s)` });
  } catch (err) {
    next(err);
  }
}
