import type { NextFunction, Response } from 'express';
import type { Permission } from '../shared';
import { can, canAny } from '../features/auth/authorization';
import type { AuthedRequest } from '../features/auth/authMiddleware';

/**
 * Authorization: may the (already authenticated) caller do this? Passing several permissions means
 * "any one of them is enough". The response is deliberately generic — it never reveals which
 * permission was missing or what the caller does hold.
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const allowed = permissions.length === 1 ? can(req.adminUser, permissions[0]) : canAny(req.adminUser, permissions);
    if (!allowed) return res.status(req.adminUser ? 403 : 401).json({ error: req.adminUser ? 'You do not have permission to do this.' : 'Unauthorized' });
    next();
  };
}
