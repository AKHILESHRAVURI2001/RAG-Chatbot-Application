import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleListRestrictedWords,
  handleCreateRestrictedWord,
  handleUpdateRestrictedWord,
  handleDeleteRestrictedWord,
} from './restrictedWords.handlers';

export const adminRestrictedWordsRouter = Router();

registerSecuredRoutes(adminRestrictedWordsRouter, [
  { method: 'get', path: '/', permission: 'words.view', handler: handleListRestrictedWords },
  { method: 'post', path: '/', permission: 'words.create', audit: 'words.create', handler: handleCreateRestrictedWord },
  { method: 'put', path: '/:id', permission: 'words.edit', audit: 'words.update', handler: handleUpdateRestrictedWord },
  { method: 'delete', path: '/:id', permission: 'words.delete', audit: 'words.delete', handler: handleDeleteRestrictedWord },
]);
