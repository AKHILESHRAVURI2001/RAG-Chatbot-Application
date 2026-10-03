import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registerRoutes } from '../../utils/registerRoutes';
import { authenticate } from './authMiddleware';
import { handleLogin, handleMe } from './auth.handlers';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

registerRoutes(authRouter, [
  { method: 'post', path: '/login', middleware: [loginLimiter], handler: handleLogin },
  // Any signed-in admin may ask who they are — there is no permission to hold for that.
  { method: 'get', path: '/me', middleware: [authenticate], handler: handleMe },
]);
