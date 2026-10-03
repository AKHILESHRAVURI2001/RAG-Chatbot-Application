-- Migration 0005: Unanswered Questions Tracking & Chunk Fallback Answer Source

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

-- Update messages check constraint to include chunk-fallback
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_answer_source_check;
ALTER TABLE messages ADD CONSTRAINT messages_answer_source_check CHECK (answer_source IN ('faq', 'cache', 'llm', 'no-match', 'chunk-fallback', 'chunk', 'restricted'));
