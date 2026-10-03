-- Migration 0008: Role-based access control (roles + permissions) and admin audit log.
--
-- Idempotent on purpose: scripts/run-migrations.mjs re-applies every file on each run, so
-- seeding is guarded so it never overwrites roles/permissions an admin has customized.
-- Permission strings ("documents.view", ...) are defined in code (src/shared/permissions.ts);
-- the database only stores which role holds which — unknown strings are rejected by the API.

create table if not exists roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  -- System roles ship with the app: they can't be deleted or renamed.
  is_system    boolean not null default false,
  -- A super role implicitly holds EVERY permission (including ones added in future), so its
  -- permission rows are not stored and can't be edited. Only seeded — never settable via the API.
  is_super     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists roles_name_lower_idx on roles (lower(name));

create table if not exists role_permissions (
  role_id     uuid not null references roles(id) on delete cascade,
  permission  text not null,
  primary key (role_id, permission)
);

create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  resource     text not null,
  resource_id  text,
  result       text not null check (result in ('success', 'failure')),
  status_code  integer,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
create index if not exists audit_log_actor_idx on audit_log (actor_id);

do $$
declare
  r_admin   uuid;
  r_editor  uuid;
  r_support uuid;
  r_viewer  uuid;
begin
  -- Seed the four original roles once. Permissions mirror what each role could actually do
  -- before RBAC existed (write = documents/faqs/chunks/words for editor, conversations/unanswered
  -- for support; read access to the dashboard, settings and content pages for everyone), except
  -- that the SQL console, admin accounts, roles and the audit log are admin-only — previously the
  -- GET endpoints for admin accounts were readable by any logged-in role.
  if not exists (select 1 from roles where lower(name) = 'admin') then
    insert into roles (name, description, is_system, is_super)
    values ('Admin', 'Full access to everything, including anything added in the future.', true, true)
    returning id into r_admin;
  end if;

  if not exists (select 1 from roles where lower(name) = 'editor') then
    insert into roles (name, description, is_system)
    values ('Editor', 'Manages the knowledge base (content, FAQs, question chunks, restricted words). Read-only elsewhere.', true)
    returning id into r_editor;
    insert into role_permissions (role_id, permission)
    select r_editor, p from unnest(array[
      'dashboard.view', 'settings.view',
      'documents.view', 'documents.create', 'documents.edit', 'documents.delete', 'documents.export',
      'faqs.view', 'faqs.create', 'faqs.edit', 'faqs.delete',
      'chunks.view', 'chunks.create', 'chunks.edit', 'chunks.delete',
      'words.view', 'words.create', 'words.edit', 'words.delete',
      'conversations.view', 'conversations.export',
      'unanswered.view',
      'visitors.view',
      'reports.view'
    ]) as p;
  end if;

  if not exists (select 1 from roles where lower(name) = 'support') then
    insert into roles (name, description, is_system)
    values ('Support', 'Manages conversations and unanswered questions. Read-only elsewhere.', true)
    returning id into r_support;
    insert into role_permissions (role_id, permission)
    select r_support, p from unnest(array[
      'dashboard.view', 'settings.view',
      'documents.view', 'documents.export',
      'faqs.view',
      'chunks.view',
      'words.view',
      'conversations.view', 'conversations.export', 'conversations.manage', 'conversations.delete',
      'unanswered.view', 'unanswered.delete',
      'visitors.view',
      'reports.view'
    ]) as p;
  end if;

  if not exists (select 1 from roles where lower(name) = 'viewer') then
    insert into roles (name, description, is_system)
    values ('Viewer', 'Read-only access to the knowledge base, conversations and reports.', true)
    returning id into r_viewer;
    insert into role_permissions (role_id, permission)
    select r_viewer, p from unnest(array[
      'dashboard.view', 'settings.view',
      'documents.view', 'documents.export',
      'faqs.view',
      'chunks.view',
      'words.view',
      'conversations.view', 'conversations.export',
      'unanswered.view',
      'visitors.view',
      'reports.view'
    ]) as p;
  end if;

  -- Move admin_users from the old fixed `role` text column onto role_id, once.
  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'admin_users' and column_name = 'role'
  ) then
    alter table admin_users add column if not exists role_id uuid references roles(id);
    update admin_users u set role_id = r.id from roles r where u.role_id is null and lower(r.name) = u.role;
    -- Anything unmappable falls back to the least-privileged role rather than failing the migration.
    update admin_users set role_id = (select id from roles where lower(name) = 'viewer') where role_id is null;
    alter table admin_users alter column role_id set not null;
    alter table admin_users drop column role;
  end if;
end $$;
