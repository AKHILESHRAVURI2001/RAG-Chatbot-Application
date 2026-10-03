import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { firebaseMirror } from './firebaseMirror';

const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function handleFirebaseStats(req: Request, res: Response, next: NextFunction) {
  try {
    const range = dateRangeSchema.parse(req.query);
    const stats = await firebaseMirror.getStats(range);
    res.json({ configured: firebaseMirror.isConfigured(), stats });
  } catch (err) {
    next(err);
  }
}

export async function handleFirebaseAnswerSources(_req: Request, res: Response, next: NextFunction) {
  try {
    const breakdown = await firebaseMirror.getAnswerSourceBreakdown();
    res.json({ configured: firebaseMirror.isConfigured(), breakdown });
  } catch (err) {
    next(err);
  }
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function handleFirebaseConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const { limit, cursor, from, to } = listQuerySchema.parse(req.query);
    const page = await firebaseMirror.listConversations(limit, cursor, { from, to });
    res.json({ configured: firebaseMirror.isConfigured(), page });
  } catch (err) {
    next(err);
  }
}

export async function handleFirebaseConversationMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const messages = await firebaseMirror.getConversationMessages(req.params.id);
    res.json({ configured: firebaseMirror.isConfigured(), messages });
  } catch (err) {
    next(err);
  }
}

export async function handleFirebaseCacheStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const cacheStats = await firebaseMirror.getCacheStats();
    res.json({ configured: firebaseMirror.isConfigured(), cacheStats });
  } catch (err) {
    next(err);
  }
}
