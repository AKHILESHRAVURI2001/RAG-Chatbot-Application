-- MiniChatbotAgent — Complete Initial Schema (Postgres 13+ with pgvector)
create extension if not exists vector;
create extension if not exists pgcrypto;

-- settings: system-wide config key-value store
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into settings (key, value) values
  ('llm', '{"provider": "openai", "model": "gpt-4o-mini", "temperature": 0.3, "maxTokens": 600, "topP": 1, "frequencyPenalty": 0, "presencePenalty": 0, "historyLimit": 10, "autoCompactContextWords": 0}'),
  ('prompt', '{"systemPrompt": "You are the automated assistant for this website, answering visitor questions. Follow these rules:\n1. Answer only from the context and conversation history below. Never use outside knowledge, and never invent facts.\n2. Answer directly, in your own voice, as the assistant for this website. Never mention the context, the documents, or that anything was provided to you. Never begin with phrases like \"Based on the provided context\", \"According to the information provided\", \"The website mentions\", or \"In the given context\". The visitor cannot see any of that and should not be told about it.\n3. If the answer is not in what you have, say plainly that you do not have that information and suggest the visitor rephrase their question or check the website directly - without explaining why or referring to your sources.\n4. Keep answers clear, concise, and factual.\n5. Do not include any links or URLs yourself. The system automatically appends real, verified \"Related articles\" links after your answer when relevant, so adding your own would duplicate or fabricate one.\n6. There is no human support team behind this chat, so never offer to connect the visitor with a human agent.", "greeting": "Hi! How can I help you today?", "noContextMessage": "I do not have that information. Please rephrase your question or check the website directly."}'),
  ('widget', '{"primaryColor": "#4f46e5", "title": "Chat with us", "note": ""}'),
  ('cache', '{"ttlSeconds": 86400, "semanticThreshold": 0.93, "faqThreshold": 0.87}'),
  ('limits', '{"sessionMessageLimit": 30, "sessionMessageWindowHours": 6}'),
  ('apiKeys', '{"anthropic": "", "openai": "", "gemini": ""}'),
  ('chunking', '{"chunkSize": 220, "overlap": 40}'),
  ('businessHours', '{"enabled": false, "timezone": "Europe/London", "days": [1, 2, 3, 4, 5], "openTime": "09:00", "closeTime": "18:00", "closedMessage": "We''re currently closed. Our hours are Mon-Fri, 9am-6pm. Please leave a message and we''ll get back to you."}'),
  ('firebase', '{"enabled": false, "serviceAccountJson": ""}'),
  ('voice', '{"enabled": false, "provider": "sarvam", "languageCode": "en-IN", "speaker": "shubh"}'),
  ('speechApiKeys', '{"sarvam": ""}')
on conflict (key) do nothing;

-- documents: ingested sources (URLs, uploaded files, or text)
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  source_type  text not null check (source_type in ('url', 'file', 'text')),
  source_ref   text,
  title        text,
  status       text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error        text,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists documents_tags_idx on documents using gin (tags);

-- chunks: embedded slices of document content
create table if not exists chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  content      text not null,
  token_count  int,
  embedding    vector(384),
  created_at   timestamptz not null default now()
);
create index if not exists chunks_embedding_idx on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists chunks_document_id_idx on chunks (document_id);

-- faqs: curated Q&A pairs matched via vector similarity
create table if not exists faqs (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  answer       text not null,
  embedding    vector(384),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists faqs_embedding_idx on faqs using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- query_cache: semantic cache of past Q&A pairs
create table if not exists query_cache (
  id           uuid primary key default gen_random_uuid(),
  query_text   text not null,
  query_hash   text not null unique,
  embedding    vector(384),
  answer       text not null,
  source       text not null default 'llm' check (source in ('llm', 'faq')),
  hit_count    int not null default 0,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz
);
create index if not exists query_cache_embedding_idx on query_cache using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- conversations & messages: session tracking and chat history
create table if not exists conversations (
  id             uuid primary key default gen_random_uuid(),
  session_id     text not null,
  blocked        boolean not null default false,
  blocked_until  timestamptz,
  block_reason   text,
  summary        text,
  summary_until  timestamptz,
  created_at     timestamptz not null default now()
);
alter table conversations add column if not exists blocked_until timestamptz;
alter table conversations add column if not exists block_reason text;

create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  role              text not null check (role in ('user', 'assistant')),
  content           text not null,
  answer_source     text check (answer_source in ('faq', 'cache', 'llm', 'no-match')),
  llm_request       jsonb,
  response_time_ms  integer,
  channel           text not null default 'text' check (channel in ('text', 'voice')),
  created_at        timestamptz not null default now()
);
create index if not exists messages_conversation_id_idx on messages (conversation_id);

-- admin_users: self-contained admin credentials with role-based access
create table if not exists admin_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  password_hash  text not null,
  role           text not null default 'admin' check (role in ('admin', 'editor', 'support', 'viewer')),
  created_at     timestamptz not null default now()
);
