-- Migration 0006: Pre-Matched User Question Chunks & Direct Response Matching

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

CREATE INDEX IF NOT EXISTS question_chunks_created_at_idx ON question_chunks (created_at DESC);
CREATE INDEX IF NOT EXISTS question_chunks_question_idx ON question_chunks (lower(question));
