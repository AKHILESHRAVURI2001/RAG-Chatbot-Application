import { Router, type RequestHandler } from 'express';
import { API_ROUTES } from '../shared';
import { chatRouter } from '../features/chat/chat.routes';
import { authRouter } from '../features/auth/auth.routes';
import { adminDocumentsRouter } from '../features/documents/documents.routes';
import { adminFaqsRouter } from '../features/faqs/faqs.routes';
import { adminSettingsRouter } from '../features/settings/settings.routes';
import { adminStatsRouter } from '../features/stats/stats.routes';
import { adminConversationsRouter } from '../features/conversations/conversations.routes';
import { adminUsersRouter } from '../features/auth/adminUsers.routes';
import { adminVisitorUsersRouter } from '../features/auth/adminVisitorUsers.routes';
import { adminQueryRouter } from '../features/queryTool/query.routes';
import { adminReportsRouter } from '../features/reports/reports.routes';
import { adminUnansweredQuestionsRouter } from '../features/unansweredQuestions/unansweredQuestions.routes';
import questionChunksRouter from '../features/questionChunks/questionChunks.routes';
import { adminRestrictedWordsRouter } from '../features/restrictedWords/restrictedWords.routes';
import { adminRolesRouter } from '../features/roles/roles.routes';
import { adminAuditRouter } from '../features/audit/audit.routes';
import { authenticate } from '../features/auth/authMiddleware';

export const apiRouter = Router();

apiRouter.get(API_ROUTES.health, (_req, res) => res.json({ ok: true }));

interface RouterMount {
  path: string;
  middleware?: RequestHandler[];
  router: Router;
}

// Every feature router mounted under /api — duplicating one (or bulk-adding a
// middleware to a group of them) is a one-line edit to this array.
//
// Admin routers are only authenticated here. What each caller may *do* is decided per endpoint by
// the `permission` on its route config (registerSecuredRoutes refuses a route that has none).
const adminMiddleware = [authenticate];

const mounts: RouterMount[] = [
  { path: API_ROUTES.chat.base, router: chatRouter },
  { path: API_ROUTES.auth.base, router: authRouter },
  { path: API_ROUTES.admin.documents.base, middleware: adminMiddleware, router: adminDocumentsRouter },
  { path: API_ROUTES.admin.faqs.base, middleware: adminMiddleware, router: adminFaqsRouter },
  { path: API_ROUTES.admin.settings.base, middleware: adminMiddleware, router: adminSettingsRouter },
  { path: API_ROUTES.admin.stats, middleware: adminMiddleware, router: adminStatsRouter },
  { path: API_ROUTES.admin.conversations.base, middleware: adminMiddleware, router: adminConversationsRouter },
  { path: API_ROUTES.admin.users.base, middleware: adminMiddleware, router: adminUsersRouter },
  { path: API_ROUTES.admin.roles.base, middleware: adminMiddleware, router: adminRolesRouter },
  { path: API_ROUTES.admin.audit, middleware: adminMiddleware, router: adminAuditRouter },
  { path: API_ROUTES.admin.visitorUsers.base, middleware: adminMiddleware, router: adminVisitorUsersRouter },
  { path: API_ROUTES.admin.query, middleware: adminMiddleware, router: adminQueryRouter },
  { path: API_ROUTES.admin.unansweredQuestions.base, middleware: adminMiddleware, router: adminUnansweredQuestionsRouter },
  { path: API_ROUTES.admin.questionChunks.base, middleware: adminMiddleware, router: questionChunksRouter },
  { path: API_ROUTES.admin.restrictedWords.base, middleware: adminMiddleware, router: adminRestrictedWordsRouter },
  { path: API_ROUTES.admin.reports.base, middleware: adminMiddleware, router: adminReportsRouter },
];

for (const mount of mounts) {
  apiRouter.use(mount.path, ...(mount.middleware ?? []), mount.router);
}
