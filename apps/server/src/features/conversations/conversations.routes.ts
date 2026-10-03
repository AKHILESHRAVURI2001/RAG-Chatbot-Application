import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleListConversations,
  handleListActive,
  handleExportConversations,
  handleGetConversation,
  handleCompactConversation,
  handleSetBlocked,
  handleDeleteAllConversations,
  handleDeleteConversation,
} from './conversations.handlers';

export const adminConversationsRouter = Router();

registerSecuredRoutes(adminConversationsRouter, [
  { method: 'get', path: '/', permission: 'conversations.view', handler: handleListConversations },
  { method: 'get', path: '/active', permission: 'conversations.view', handler: handleListActive },
  { method: 'get', path: '/export', permission: 'conversations.export', audit: 'conversations.export', handler: handleExportConversations },
  { method: 'get', path: '/:id', permission: 'conversations.view', handler: handleGetConversation },
  { method: 'post', path: '/:id/compact', permission: 'conversations.manage', audit: 'conversations.compact', handler: handleCompactConversation },
  { method: 'put', path: '/:id/blocked', permission: 'conversations.manage', audit: 'conversations.block', handler: handleSetBlocked },
  { method: 'delete', path: '/', permission: 'conversations.delete', audit: 'conversations.delete-all', handler: handleDeleteAllConversations },
  { method: 'delete', path: '/:id', permission: 'conversations.delete', audit: 'conversations.delete', handler: handleDeleteConversation },
]);
