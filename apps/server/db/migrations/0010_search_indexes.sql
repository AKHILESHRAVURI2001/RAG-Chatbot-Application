-- Migration 0010: let the keyword half of the content search use an index.
-- Idempotent (IF NOT EXISTS) because scripts/run-migrations.mjs re-applies every file on each run.
--
-- The content search also runs `lower(title) LIKE '%word%' OR lower(content) LIKE '%word%'`. A leading-wildcard LIKE
-- can't use a normal index, so it scanned every chunk — harmless at hundreds of chunks, slow at tens of thousands.
-- Trigram (pg_trgm) indexes make that match index-assisted at any size.
create extension if not exists pg_trgm;

create index if not exists chunks_content_trgm_idx on chunks using gin (lower(content) gin_trgm_ops);
create index if not exists documents_title_trgm_idx on documents using gin (lower(title) gin_trgm_ops);
