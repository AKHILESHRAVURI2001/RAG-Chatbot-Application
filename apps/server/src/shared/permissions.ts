/**
 * The permission registry — the single place that defines what can be authorized.
 *
 * Naming convention: `<module>.<action>` (e.g. `faqs.delete`). A role is just a set of these
 * strings; the server decides what a user may do by looking them up, never by role name.
 *
 * To add a module (say invoices): append one entry below. The `Permission` type, route guards,
 * role validation, the super-admin's "everything" grant and the Roles screen all pick it up —
 * nothing else needs to change except guarding the new routes with the new permissions.
 */
export const PERMISSION_CATALOG = [
  {
    module: 'dashboard',
    label: 'Dashboard',
    description: 'Usage statistics and live activity.',
    actions: [{ action: 'view', label: 'View', description: 'See dashboard statistics.' }],
  },
  {
    module: 'documents',
    label: 'Content (documents)',
    description: 'Web pages, files and text that the chatbot learns from.',
    actions: [
      { action: 'view', label: 'View', description: 'List documents, tags and indexed chunks.' },
      { action: 'create', label: 'Create', description: 'Add content from a URL, sitemap, file or pasted text.' },
      { action: 'edit', label: 'Edit', description: 'Change tags, pause/resume and re-crawl documents.' },
      { action: 'delete', label: 'Delete', description: 'Permanently remove documents and their chunks.' },
      { action: 'export', label: 'Export', description: 'Download chunks and embeddings.' },
    ],
  },
  {
    module: 'faqs',
    label: 'FAQs',
    description: 'Curated question and answer pairs.',
    actions: [
      { action: 'view', label: 'View', description: 'List FAQs.' },
      { action: 'create', label: 'Create', description: 'Add or import FAQs.' },
      { action: 'edit', label: 'Edit', description: 'Change existing FAQs.' },
      { action: 'delete', label: 'Delete', description: 'Remove FAQs.' },
    ],
  },
  {
    module: 'chunks',
    label: 'Question chunks',
    description: 'Pre-written answers matched against visitor questions.',
    actions: [
      { action: 'view', label: 'View', description: 'List question chunks.' },
      { action: 'create', label: 'Create', description: 'Add question chunks.' },
      { action: 'edit', label: 'Edit', description: 'Change question chunks.' },
      { action: 'delete', label: 'Delete', description: 'Remove a question chunk.' },
      { action: 'clear', label: 'Clear all', description: 'Delete every question chunk at once.' },
    ],
  },
  {
    module: 'words',
    label: 'Restricted words',
    description: 'Words and phrases the chatbot refuses to answer.',
    actions: [
      { action: 'view', label: 'View', description: 'List restricted words.' },
      { action: 'create', label: 'Create', description: 'Add restricted words.' },
      { action: 'edit', label: 'Edit', description: 'Change restricted words.' },
      { action: 'delete', label: 'Delete', description: 'Remove restricted words.' },
    ],
  },
  {
    module: 'unanswered',
    label: 'Unanswered questions',
    description: 'Questions the chatbot could not answer.',
    actions: [
      { action: 'view', label: 'View', description: 'See unanswered questions and their statistics.' },
      { action: 'delete', label: 'Delete', description: 'Remove one or all unanswered questions.' },
    ],
  },
  {
    module: 'conversations',
    label: 'Chat logs',
    description: 'Visitor conversations.',
    actions: [
      { action: 'view', label: 'View', description: 'Read conversations and see live sessions.' },
      { action: 'export', label: 'Export', description: 'Download conversations.' },
      { action: 'manage', label: 'Manage', description: 'Block/unblock sessions and compact history.' },
      { action: 'delete', label: 'Delete', description: 'Delete one or all conversations.' },
    ],
  },
  {
    module: 'visitors',
    label: 'Visitor accounts',
    description: 'People who signed in to the chat widget.',
    actions: [
      { action: 'view', label: 'View', description: 'List visitor accounts.' },
      { action: 'create', label: 'Create', description: 'Create visitor accounts.' },
      { action: 'edit', label: 'Edit', description: 'Reset passwords and message quotas.' },
      { action: 'delete', label: 'Delete', description: 'Delete visitor accounts.' },
    ],
  },
  {
    module: 'reports',
    label: 'Reports',
    description: 'Firebase-backed analytics.',
    actions: [{ action: 'view', label: 'View', description: 'See reports.' }],
  },
  {
    module: 'settings',
    label: 'Settings',
    description: 'Chatbot, AI provider, voice, cache and database configuration, including API keys.',
    actions: [
      { action: 'view', label: 'View', description: 'See configuration and database status (API keys are never shown).' },
      { action: 'edit', label: 'Edit', description: 'Change configuration, API keys, cache and run migrations.' },
    ],
  },
  {
    module: 'query',
    label: 'SQL console',
    description: 'Run read-only SQL against the database.',
    actions: [{ action: 'run', label: 'Run', description: 'Run read-only queries (can read any table).' }],
  },
  {
    module: 'users',
    label: 'Admin accounts',
    description: 'People who can sign in to this admin panel.',
    actions: [
      { action: 'view', label: 'View', description: 'List admin accounts.' },
      { action: 'create', label: 'Create', description: 'Add admin accounts.' },
      { action: 'edit', label: 'Edit', description: 'Change roles and reset passwords.' },
      { action: 'delete', label: 'Delete', description: 'Remove admin accounts.' },
    ],
  },
  {
    module: 'roles',
    label: 'Roles & permissions',
    description: 'Who can do what.',
    actions: [
      { action: 'view', label: 'View', description: 'List roles and their permissions.' },
      { action: 'create', label: 'Create', description: 'Create roles.' },
      { action: 'edit', label: 'Edit', description: 'Change a role’s details and permissions.' },
      { action: 'delete', label: 'Delete', description: 'Delete unused roles.' },
    ],
  },
  {
    module: 'audit',
    label: 'Audit log',
    description: 'Record of administrative actions.',
    actions: [{ action: 'view', label: 'View', description: 'Read the audit log.' }],
  },
] as const;

type CatalogEntry = (typeof PERMISSION_CATALOG)[number];

// Distributes over each module so only real module/action pairs are allowed (no "documents.run").
type PermissionOf<M> = M extends { module: infer N; actions: readonly { action: infer A }[] } ? `${N & string}.${A & string}` : never;

export type Permission = PermissionOf<CatalogEntry>;
export type PermissionModule = CatalogEntry['module'];

export interface PermissionActionInfo {
  permission: Permission;
  action: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  module: string;
  label: string;
  description: string;
  actions: PermissionActionInfo[];
}

/** The catalog in a plain, serializable shape — what `GET /admin/roles/catalog` returns and the Roles screen renders. */
export function getPermissionGroups(): PermissionGroup[] {
  return PERMISSION_CATALOG.map((m) => ({
    module: m.module,
    label: m.label,
    description: m.description,
    actions: m.actions.map((a) => ({
      permission: `${m.module}.${a.action}` as Permission,
      action: a.action,
      label: a.label,
      description: a.description,
    })),
  }));
}

export const ALL_PERMISSIONS: readonly Permission[] = getPermissionGroups().flatMap((g) => g.actions.map((a) => a.permission));

const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}
