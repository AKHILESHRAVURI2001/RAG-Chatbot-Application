import { Router } from 'express';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleListUnansweredQuestions,
  handleDeleteUnansweredQuestion,
  handleClearAllUnansweredQuestions,
  handleGetUnansweredQuestionsStats,
} from './unansweredQuestions.handlers';

export const adminUnansweredQuestionsRouter = Router();

registerSecuredRoutes(adminUnansweredQuestionsRouter, [
  { method: 'get', path: '/', permission: 'unanswered.view', handler: handleListUnansweredQuestions },
  { method: 'get', path: '/stats', permission: 'unanswered.view', handler: handleGetUnansweredQuestionsStats },
  { method: 'delete', path: '/', permission: 'unanswered.delete', audit: 'unanswered.clear-all', handler: handleClearAllUnansweredQuestions },
  { method: 'delete', path: '/:id', permission: 'unanswered.delete', audit: 'unanswered.delete', handler: handleDeleteUnansweredQuestion },
]);
