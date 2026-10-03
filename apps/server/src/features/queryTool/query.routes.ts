import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import { handleRunQuery } from './query.handlers';

export const adminQueryRouter = Router();

registerSecuredRoutes(adminQueryRouter, [{ method: 'post', path: '/', permission: 'query.run', audit: 'query.run', handler: handleRunQuery }]);
