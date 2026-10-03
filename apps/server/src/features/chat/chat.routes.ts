import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { registerRoutes } from '../../utils/registerRoutes';
import {
  handleVisitorSignup,
  handleVisitorLogin,
  handleVisitorMe,
  handleChat,
  handleVoice,
  handleSpeak,
  handleHistory,
  handleWidgetConfig,
} from './chat.handlers';

export const chatRouter = Router();

const chatLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const historyLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const voiceLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const voiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

registerRoutes(chatRouter, [
  { method: 'post', path: '/auth/signup', middleware: [chatLimiter], handler: handleVisitorSignup },
  { method: 'post', path: '/auth/login', middleware: [chatLimiter], handler: handleVisitorLogin },
  { method: 'get', path: '/auth/me', handler: handleVisitorMe },
  { method: 'post', path: '/', middleware: [chatLimiter], handler: handleChat },
  { method: 'post', path: '/voice', middleware: [voiceLimiter, voiceUpload.single('audio')], handler: handleVoice },
  { method: 'post', path: '/speak', middleware: [voiceLimiter], handler: handleSpeak },
  { method: 'get', path: '/history', middleware: [historyLimiter], handler: handleHistory },
  { method: 'get', path: '/widget-config', handler: handleWidgetConfig },
]);
