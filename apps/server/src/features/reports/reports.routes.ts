import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleFirebaseStats,
  handleFirebaseAnswerSources,
  handleFirebaseConversations,
  handleFirebaseConversationMessages,
  handleFirebaseCacheStats,
} from './reports.handlers';

export const adminReportsRouter = Router();

registerSecuredRoutes(adminReportsRouter, [
  { method: 'get', path: '/firebase/stats', permission: 'reports.view', handler: handleFirebaseStats },
  { method: 'get', path: '/firebase/answer-sources', permission: 'reports.view', handler: handleFirebaseAnswerSources },
  { method: 'get', path: '/firebase/conversations', permission: 'reports.view', handler: handleFirebaseConversations },
  { method: 'get', path: '/firebase/conversations/:id/messages', permission: 'reports.view', handler: handleFirebaseConversationMessages },
  { method: 'get', path: '/firebase/cache-stats', permission: 'reports.view', handler: handleFirebaseCacheStats },
]);
