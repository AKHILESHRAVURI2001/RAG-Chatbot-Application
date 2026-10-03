import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { manualCompactConversation, ManualCompactError } from '../chat/historyCompactionService';
import { exportConversationsAsText } from './conversationExportService';

export async function handleListConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    res.json(await conversationsRepo.listRecentConversations(limit));
  } catch (err) {
    next(err);
  }
}

export async function handleListActive(req: Request, res: Response, next: NextFunction) {
  try {
    const windowMinutes = Math.min(Math.max(Number(req.query.windowMinutes) || 15, 1), 1440);
    res.json(await conversationsRepo.listActive(windowMinutes));
  } catch (err) {
    next(err);
  }
}

export async function handleExportConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((v) => v.from <= v.to, { message: '`from` must not be after `to`' });
    const { from, to } = schema.parse({ from: req.query.from, to: req.query.to });

    const text = await exportConversationsAsText(from, to);
    const slug = (d: Date) => d.toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="conversations-${slug(from)}-to-${slug(to)}.txt"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (err) {
    next(err);
  }
}

export async function handleGetConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await conversationsRepo.getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const messages = await conversationsRepo.listMessagesForAdmin(req.params.id);
    res.json({ ...conversation, messages });
  } catch (err) {
    next(err);
  }
}

export async function handleCompactConversation(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await manualCompactConversation(req.params.id));
  } catch (err) {
    if (err instanceof ManualCompactError) return res.status(400).json({ error: err.message });
    next(err);
  }
}

export async function handleSetBlocked(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = z.object({
      blocked: z.boolean(),
      durationMinutes: z.number().int().min(1).max(525600).nullable().optional(),
      reason: z.string().max(200).nullable().optional(),
    });
    const { blocked, durationMinutes, reason } = schema.parse(req.body);
    const result = await conversationsRepo.setBlocked(req.params.id, blocked, durationMinutes, reason);
    res.json({
      blocked: result.blocked,
      blockedUntil: result.blockedUntil ? result.blockedUntil.toISOString() : null,
      blockReason: result.blockReason,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteAllConversations(_req: Request, res: Response, next: NextFunction) {
  try {
    const count = await conversationsRepo.deleteAllConversations();
    res.json({ deleted: count });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteConversation(req: Request, res: Response, next: NextFunction) {
  try {
    await conversationsRepo.deleteConversation(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
