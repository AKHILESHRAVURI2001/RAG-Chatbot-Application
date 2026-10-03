-- Migration: Create visitor_users table for in-widget authentication
create table if not exists visitor_users (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default '',
  email          text not null unique,
  password_hash  text not null,
  role           text not null default 'visitor',
  message_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz not null default now()
);

create index if not exists visitor_users_email_idx on visitor_users (lower(email));
