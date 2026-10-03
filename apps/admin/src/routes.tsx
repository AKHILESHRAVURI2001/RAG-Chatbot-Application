import { lazy, type ComponentType, type ReactElement } from 'react';
import { FiHome, FiFileText, FiHelpCircle, FiClock, FiCloud, FiMic, FiCpu, FiLayers, FiSettings, FiAlertCircle, FiShield, FiSlash, FiLock } from 'react-icons/fi';
import type { AnswerSource, Permission } from './shared';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Documents = lazy(() => import('./pages/Documents'));
const Faqs = lazy(() => import('./pages/Faqs'));
const Settings = lazy(() => import('./pages/Settings'));
const ChatLogs = lazy(() => import('./pages/ChatLogs'));
const Firebase = lazy(() => import('./pages/Firebase'));
const ChatAgent = lazy(() => import('./pages/ChatAgent'));
const Voice = lazy(() => import('./pages/Voice'));
const VectorAgent = lazy(() => import('./pages/VectorAgent'));
const UnansweredQuestions = lazy(() => import('./pages/UnansweredQuestions'));
const QuestionChunks = lazy(() => import('./pages/QuestionChunks'));
const Fallbacks = lazy(() => import('./pages/Fallbacks'));
const RestrictedWords = lazy(() => import('./pages/RestrictedWords'));
const AccessControl = lazy(() => import('./pages/AccessControl'));

export interface AppRoute {
  path: string;
  label: string;
  group: string;
  icon: ComponentType;
  /** What the server will require for this page's data. A list means "any one of these" (e.g. a page with several permission-gated tabs). */
  permission: Permission | readonly Permission[];
  element: ReactElement;
  end?: boolean;
  /** The kind of chatbot answer this page feeds; its color (same as the widget's answer border) accents the menu entry. */
  source?: AnswerSource;
}

/**
 * Pages are loaded on demand (code splitting), so the first paint ships only the shell and the page being opened.
 *
 * Every admin page, in one place: its URL, sidebar entry and the permission it needs. The sidebar
 * and the route guards are both generated from this list, so adding a module means adding one row
 * (plus its permissions in shared/permissions.ts) — and a page can never be linked in the menu but
 * unguarded, or the reverse. Menu visibility is a convenience; the API enforces access regardless.
 */
export const appRoutes: AppRoute[] = [
  { path: '/', label: 'Dashboard', group: 'Overview', icon: FiHome, permission: 'dashboard.view', element: <Dashboard />, end: true },

  { path: '/restricted-words', label: 'Restricted Words', group: 'Knowledge Base', icon: FiSlash, permission: 'words.view', element: <RestrictedWords />, source: 'restricted' },
  { path: '/faqs', label: 'FAQs', group: 'Knowledge Base', icon: FiHelpCircle, permission: 'faqs.view', element: <Faqs />, source: 'faq' },
  { path: '/question-chunks', label: 'Question Chunks', group: 'Knowledge Base', icon: FiLayers, permission: 'chunks.view', element: <QuestionChunks />, source: 'chunk' },
  { path: '/documents', label: 'Content', group: 'Knowledge Base', icon: FiFileText, permission: 'documents.view', element: <Documents />, source: 'llm' },
  { path: '/fallbacks', label: 'Fallbacks', group: 'Knowledge Base', icon: FiShield, permission: 'settings.view', element: <Fallbacks />, source: 'chunk-fallback' },
  { path: '/unanswered-questions', label: 'Unanswered Qs', group: 'Knowledge Base', icon: FiAlertCircle, permission: 'unanswered.view', element: <UnansweredQuestions />, source: 'no-match' },

  { path: '/chat-logs', label: 'Chat Logs', group: 'Analytics & Logs', icon: FiClock, permission: 'conversations.view', element: <ChatLogs /> },
  { path: '/reports', label: 'Firebase', group: 'Analytics & Logs', icon: FiCloud, permission: 'reports.view', element: <Firebase /> },

  { path: '/chat-agent', label: 'Chat Agent', group: 'Agents & AI', icon: FiCpu, permission: 'settings.view', element: <ChatAgent /> },
  { path: '/voice', label: 'Voice Agent', group: 'Agents & AI', icon: FiMic, permission: 'settings.view', element: <Voice /> },
  { path: '/vector-agent', label: 'Vector & Chunking', group: 'Agents & AI', icon: FiLayers, permission: 'settings.view', element: <VectorAgent /> },

  { path: '/settings', label: 'Settings', group: 'System', icon: FiSettings, permission: 'settings.view', element: <Settings /> },
  {
    path: '/access',
    label: 'Access Control',
    group: 'System',
    icon: FiLock,
    permission: ['users.view', 'roles.view', 'audit.view'],
    element: <AccessControl />,
  },
];

export function permissionsOf(route: AppRoute): readonly Permission[] {
  return Array.isArray(route.permission) ? (route.permission as readonly Permission[]) : [route.permission as Permission];
}

/** Sidebar sections in display order, with only the entries the user can open; empty sections disappear. */
export function visibleNavGroups(canAny: (p: readonly Permission[]) => boolean): { title: string; items: AppRoute[] }[] {
  const groups = new Map<string, AppRoute[]>();
  for (const r of appRoutes) {
    if (!canAny(permissionsOf(r))) continue;
    groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

export function firstAllowedRoute(canAny: (p: readonly Permission[]) => boolean): AppRoute | undefined {
  return appRoutes.find((r) => canAny(permissionsOf(r)));
}
