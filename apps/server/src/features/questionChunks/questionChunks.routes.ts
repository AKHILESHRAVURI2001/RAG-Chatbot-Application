import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleListQuestionChunks,
  handleCreateQuestionChunk,
  handleUpdateQuestionChunk,
  handleDeleteQuestionChunk,
  handleClearAllQuestionChunks,
} from './questionChunks.handlers';

const router = Router();

registerSecuredRoutes(router, [
  { method: 'get', path: '/', permission: 'chunks.view', handler: handleListQuestionChunks },
  { method: 'post', path: '/', permission: 'chunks.create', audit: 'chunks.create', handler: handleCreateQuestionChunk },
  { method: 'put', path: '/:id', permission: 'chunks.edit', audit: 'chunks.update', handler: handleUpdateQuestionChunk },
  { method: 'delete', path: '/:id', permission: 'chunks.delete', audit: 'chunks.delete', handler: handleDeleteQuestionChunk },
  // Wipes every question chunk — a separate permission from deleting one, as it was admin-only before.
  { method: 'delete', path: '/', permission: 'chunks.clear', audit: 'chunks.clear', handler: handleClearAllQuestionChunks },
]);

export default router;
