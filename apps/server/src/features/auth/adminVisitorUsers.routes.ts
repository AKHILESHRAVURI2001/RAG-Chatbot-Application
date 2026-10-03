import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleListVisitorUsers,
  handleCreateVisitorUser,
  handleVisitorPasswordReset,
  handleResetVisitorQuota,
  handleDeleteVisitorUser,
} from './adminVisitorUsers.handlers';

export const adminVisitorUsersRouter = Router();

registerSecuredRoutes(adminVisitorUsersRouter, [
  { method: 'get', path: '/', permission: 'visitors.view', handler: handleListVisitorUsers },
  { method: 'post', path: '/', permission: 'visitors.create', audit: 'visitors.create', handler: handleCreateVisitorUser },
  { method: 'post', path: '/:id/password', permission: 'visitors.edit', audit: 'visitors.password-reset', handler: handleVisitorPasswordReset },
  { method: 'put', path: '/:id/password', permission: 'visitors.edit', audit: 'visitors.password-reset', handler: handleVisitorPasswordReset },
  { method: 'post', path: '/:id/reset-quota', permission: 'visitors.edit', audit: 'visitors.reset-quota', handler: handleResetVisitorQuota },
  { method: 'delete', path: '/:id', permission: 'visitors.delete', audit: 'visitors.delete', handler: handleDeleteVisitorUser },
]);
