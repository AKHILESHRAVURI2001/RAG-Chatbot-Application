import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import { handleGetStats, handleGetWordUsage, handleGetVoiceUsage } from './stats.handlers';

export const adminStatsRouter = Router();

registerSecuredRoutes(adminStatsRouter, [
  { method: 'get', path: '/', permission: 'dashboard.view', handler: handleGetStats },
  { method: 'get', path: '/word-usage', permission: 'dashboard.view', handler: handleGetWordUsage },
  { method: 'get', path: '/voice-usage', permission: 'dashboard.view', handler: handleGetVoiceUsage },
]);
