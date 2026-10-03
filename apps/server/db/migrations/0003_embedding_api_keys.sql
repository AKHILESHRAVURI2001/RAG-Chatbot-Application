-- Migration: separate API key storage for Vector Agent embeddings (previously shared with Chat Agent's OpenAI key)
insert into settings (key, value) values
  ('embeddingApiKeys', '{"openai": ""}')
on conflict (key) do nothing;
