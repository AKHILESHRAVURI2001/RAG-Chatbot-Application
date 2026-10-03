-- Migration 0009: indexes for the queries that run on every chat message and every dashboard load.
-- Idempotent (IF NOT EXISTS) because scripts/run-migrations.mjs re-applies every file on each run.

-- findOrCreateBySession / blocked checks / summary lookups: `where session_id = $1 order by created_at desc limit 1`,
-- executed several times per chat message. Without this every one of them scanned the whole conversations table.
create index if not exists conversations_session_created_idx on conversations (session_id, created_at desc);

-- Conversation lists and "newest first" admin views.
create index if not exists conversations_created_at_idx on conversations (created_at desc);

-- Time-window filters over messages (dashboard stats, exports, live sessions) that aren't scoped to one conversation.
create index if not exists messages_created_at_idx on messages (created_at desc);
