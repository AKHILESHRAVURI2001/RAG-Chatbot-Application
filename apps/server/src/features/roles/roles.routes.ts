import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import { handleListRoles, handleGetCatalog, handleCreateRole, handleUpdateRole, handleDeleteRole } from './roles.handlers';

export const adminRolesRouter = Router();

registerSecuredRoutes(adminRolesRouter, [
  // The Admin users screen needs the role list to assign roles, so managing users is enough to read it.
  { method: 'get', path: '/', permission: ['roles.view', 'users.create', 'users.edit'], handler: handleListRoles },
  // Registered before /:id so "catalog" is never mistaken for a role id.
  { method: 'get', path: '/catalog', permission: 'roles.view', handler: handleGetCatalog },
  { method: 'post', path: '/', permission: 'roles.create', audit: 'roles.create', handler: handleCreateRole },
  { method: 'put', path: '/:id', permission: 'roles.edit', audit: 'roles.update', handler: handleUpdateRole },
  { method: 'delete', path: '/:id', permission: 'roles.delete', audit: 'roles.delete', handler: handleDeleteRole },
]);
