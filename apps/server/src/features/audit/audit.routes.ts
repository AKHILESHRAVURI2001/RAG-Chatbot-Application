import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import { handleListAudit } from './audit.handlers';

export const adminAuditRouter = Router();

registerSecuredRoutes(adminAuditRouter, [{ method: 'get', path: '/', permission: 'audit.view', handler: handleListAudit }]);
