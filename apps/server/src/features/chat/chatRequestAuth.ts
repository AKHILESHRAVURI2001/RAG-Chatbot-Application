import type { Request } from 'express';
import { authService } from '../auth/authService';
import { visitorAuthService, type VisitorJwtPayload } from '../auth/visitorAuthService';

export function isVerifiedAdminRequest(req: Request): boolean {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return false;
  try {
    authService.verifyToken(token);
    return true;
  } catch {
    return false;
  }
}

export function getVisitorUser(req: Request, bodyUserId?: string, bodyAuthToken?: string): VisitorJwtPayload | null {
  const authHeader = req.header('authorization') || '';
  const token =
    (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '') ||
    req.header('x-visitor-token') ||
    bodyAuthToken ||
    '';
  if (token) {
    const payload = visitorAuthService.verifyToken(token);
    if (payload) return payload;
  }
  if (req.header('x-user-id') || bodyUserId) {
    return {
      sub: req.header('x-user-id') || bodyUserId || 'user',
      email: '',
      name: 'User',
      role: 'visitor',
    };
  }
  return null;
}
