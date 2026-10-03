import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { runReadOnlyQuery, ReadOnlyQueryError } from './readOnlyQueryService';

const querySchema = z.object({ sql: z.string().min(1).max(5000) });

export async function handleRunQuery(req: Request, res: Response, next: NextFunction) {
  try {
    const { sql } = querySchema.parse(req.body);
    const result = await runReadOnlyQuery(sql);
    res.json(result);
  } catch (err) {
    if (err instanceof ReadOnlyQueryError) return res.status(400).json({ error: err.message });
    next(err);
  }
}
