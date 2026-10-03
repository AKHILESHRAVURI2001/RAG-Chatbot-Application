-- Core Database Schema, Extensions & Indexes Initialization
-- Auto-executed by server on startup via autoMigrate.ts

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Unanswered Questions
CREATE TABLE IF NOT EXISTS unanswered_questions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        TEXT,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  question          TEXT NOT NULL,
  reason            TEXT NOT NULL,
  similarity_score  FLOAT,
  context_chunks    JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unanswered_questions_created_at_idx ON unanswered_questions (created_at DESC);
CREATE INDEX IF NOT EXISTS unanswered_questions_question_idx ON unanswered_questions (lower(question));
CREATE INDEX IF NOT EXISTS unanswered_questions_reason_idx ON unanswered_questions (reason);

-- 2. Question Chunks (Pre-matched Q&A Fast Path)
CREATE TABLE IF NOT EXISTS question_chunks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question             TEXT NOT NULL,
  answer               TEXT NOT NULL,
  embedding            vector(384),
  similarity_threshold FLOAT NOT NULL DEFAULT 0.80,
  use_count            INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE question_chunks ALTER COLUMN embedding TYPE vector(384) USING NULL;
CREATE INDEX IF NOT EXISTS question_chunks_created_at_idx ON question_chunks (created_at DESC);
CREATE INDEX IF NOT EXISTS question_chunks_question_idx ON question_chunks (lower(trim(question)));
CREATE INDEX IF NOT EXISTS question_chunks_embedding_hnsw_idx ON question_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS question_chunks_trgm_idx ON question_chunks USING gin (lower(question) gin_trgm_ops);

-- 3. Restricted Words (Stage 0 Filter)
CREATE TABLE IF NOT EXISTS restricted_words (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase      TEXT NOT NULL,
  response    TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restricted_words_phrase_idx ON restricted_words (lower(phrase));
CREATE INDEX IF NOT EXISTS restricted_words_trgm_idx ON restricted_words USING gin (lower(phrase) gin_trgm_ops);

-- 4. FAQs Indexing
CREATE INDEX IF NOT EXISTS faqs_question_idx ON faqs (lower(trim(question)));
CREATE INDEX IF NOT EXISTS faqs_embedding_hnsw_idx ON faqs USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS faqs_trgm_idx ON faqs USING gin (lower(question) gin_trgm_ops);

-- 5. Document Knowledge Chunks Indexing (Stage 5 Vector Search)
DROP INDEX IF EXISTS chunks_embedding_idx;
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks (document_id);

-- 6. Semantic Query Cache Indexing (Stage 4 Vector Search)
CREATE INDEX IF NOT EXISTS query_cache_embedding_hnsw_idx ON query_cache USING hnsw (embedding vector_cosine_ops);

-- 7. Messages Table & Constraints
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_answer_source_check;
ALTER TABLE messages ADD CONSTRAINT messages_answer_source_check CHECK (answer_source IN ('faq', 'cache', 'llm', 'no-match', 'chunk-fallback', 'chunk', 'restricted'));
CREATE INDEX IF NOT EXISTS messages_conv_role_created_idx ON messages (conversation_id, role, created_at DESC);
