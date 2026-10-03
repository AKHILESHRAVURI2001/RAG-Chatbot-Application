import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleListFaqs,
  handleCreateFaq,
  handleUpdateFaq,
  handleDeleteFaq,
  handleImportSeedFaqs,
  handleImportFaqs,
} from './faqs.handlers';

export const adminFaqsRouter = Router();

registerSecuredRoutes(adminFaqsRouter, [
  { method: 'get', path: '/', permission: 'faqs.view', handler: handleListFaqs },
  { method: 'post', path: '/', permission: 'faqs.create', audit: 'faqs.create', handler: handleCreateFaq },
  { method: 'put', path: '/:id', permission: 'faqs.edit', audit: 'faqs.update', handler: handleUpdateFaq },
  { method: 'delete', path: '/:id', permission: 'faqs.delete', audit: 'faqs.delete', handler: handleDeleteFaq },
  { method: 'post', path: '/import-seed', permission: 'faqs.create', audit: 'faqs.import', handler: handleImportSeedFaqs },
  { method: 'post', path: '/import', permission: 'faqs.create', audit: 'faqs.import', handler: handleImportFaqs },
]);
