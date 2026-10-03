-- Migration: allow documents to be "paused" (excluded from vector search without deleting them)
alter table documents drop constraint if exists documents_status_check;
alter table documents add constraint documents_status_check check (status in ('processing', 'ready', 'failed', 'paused'));
