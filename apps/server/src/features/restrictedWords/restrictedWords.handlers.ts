import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { restrictedWordsRepo } from '../../db/queries/restrictedWords.queries';

export async function handleListRestrictedWords(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await restrictedWordsRepo.listAll();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

const createSchema = z.object({
  phrase: z.string().min(1).max(500),
  response: z.string().min(1).max(4000),
  isActive: z.boolean().optional().default(true),
});

export async function handleCreateRestrictedWord(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSchema.parse(req.body);
    const created = await restrictedWordsRepo.create(data);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

const updateSchema = z.object({
  phrase: z.string().min(1).max(500).optional(),
  response: z.string().min(1).max(4000).optional(),
  isActive: z.boolean().optional(),
});

export async function handleUpdateRestrictedWord(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSchema.parse(req.body);
    const updated = await restrictedWordsRepo.update(req.params.id, data);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteRestrictedWord(req: Request, res: Response, next: NextFunction) {
  try {
    await restrictedWordsRepo.delete(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
