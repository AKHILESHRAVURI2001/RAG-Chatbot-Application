import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AuditLogResponseDTO } from '../../shared';
import { auditRepo } from './audit.queries';
import type { AuthedRequest } from '../auth/authMiddleware';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  resource: z.string().trim().min(1).max(50).optional(),
});

export async function handleListAudit(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid paging parameters.' });
    const body: AuditLogResponseDTO = await auditRepo.list(parsed.data);
    res.json(body);
  } catch (err) {
    next(err);
  }
}
