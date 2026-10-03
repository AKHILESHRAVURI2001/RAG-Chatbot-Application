import type { NextFunction, Response } from 'express';
import { recordAudit } from '../features/audit/audit.service';
import type { AuthedRequest } from '../features/auth/authMiddleware';

/**
 * Records one audit entry per request once its response has been sent, so the logged result is
 * the real outcome (a 403 or a handler error is logged as a failure). The request body is never
 * logged; handlers add safe context by setting `res.locals.auditMeta` (e.g. a role's name).
 * Mount it before `requirePermission` so denied attempts are recorded too.
 */
export function auditAction(action: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      void recordAudit({
        actor: req.adminUser ? { id: req.adminUser.id, email: req.adminUser.email } : null,
        action,
        resourceId: typeof req.params.id === 'string' ? req.params.id : null,
        result: res.statusCode < 400 ? 'success' : 'failure',
        statusCode: res.statusCode,
        metadata: res.locals.auditMeta ?? null,
      });
    });
    next();
  };
}
