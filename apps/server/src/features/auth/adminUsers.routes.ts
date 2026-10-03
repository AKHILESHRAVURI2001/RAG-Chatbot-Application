import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleListAdmins,
  handleCreateAdmin,
  handleAdminPasswordReset,
  handleUpdateAdminRole,
  handleDeleteAdmin,
} from './adminUsers.handlers';

export const adminUsersRouter = Router();

registerSecuredRoutes(adminUsersRouter, [
  { method: 'get', path: '/', permission: 'users.view', handler: handleListAdmins },
  { method: 'post', path: '/', permission: 'users.create', audit: 'users.create', handler: handleCreateAdmin },
  { method: 'put', path: '/:id/password', permission: 'users.edit', audit: 'users.password-reset', handler: handleAdminPasswordReset },
  { method: 'post', path: '/:id/password', permission: 'users.edit', audit: 'users.password-reset', handler: handleAdminPasswordReset },
  { method: 'put', path: '/:id/role', permission: 'users.edit', audit: 'users.change-role', handler: handleUpdateAdminRole },
  { method: 'delete', path: '/:id', permission: 'users.delete', audit: 'users.delete', handler: handleDeleteAdmin },
]);
