import type { NextFunction, Request, Response } from 'express';
import { authService } from './authService';
import type { AdminPrincipal } from './authorization';

export interface AuthedRequest extends Request {
  adminUser?: AdminPrincipal;
}

/**
 * Authentication: who is calling? Verifies the admin token, then loads the account and its role
 * from the database on every request — so deleting an account or changing its role takes effect
 * immediately instead of when the token expires. It decides nothing about what the caller may do;
 * that is `requirePermission`'s job.
 */
export async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  let accountId: string;
  try {
    accountId = authService.verifyToken(token).sub;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  try {
    const principal = await authService.loadPrincipal(accountId);
    if (!principal) return res.status(401).json({ error: 'Invalid or expired session' });
    req.adminUser = principal;
    next();
  } catch (err) {
    next(err);
  }
}
