import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load apps/server/.env relative to current module location
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Admin-supplied URLs (content ingestion) may not point at private/internal addresses unless this is 'true'.
  ALLOW_PRIVATE_URL_FETCH: z.enum(['true', 'false']).default('false'),
  ALLOWED_ORIGINS: z.string().default('*'),
  ADMIN_ORIGINS: z.string().default('*'),

  // PostgreSQL connection string (Postgres 13+ with pgvector)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Auto-detect SSL if undefined (localhost = no SSL, remote = SSL)
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // Admin JWT session configuration
  ADMIN_JWT_SECRET: z.string().min(16, 'ADMIN_JWT_SECRET must be at least 16 characters'),
  ADMIN_JWT_EXPIRES_IN: z.string().default('7d'),

  // Redis URL (optional - falls back to high-speed in-memory cache if omitted or offline)
  REDIS_URL: z.string().optional().default(''),
  CACHE_TTL_SECONDS: z.coerce.number().default(86400),
  FAQ_SIMILARITY_THRESHOLD: z.coerce.number().default(0.87),

  // LLM provider API keys
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),

  // Local Xenova embedding model configuration
  EMBEDDING_MODEL: z.string().default('Xenova/all-MiniLM-L6-v2'),

  // Optional: Firebase Firestore logging service account JSON string
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),

  // Optional: Sarvam AI API key for multilingual voice processing
  SARVAM_API_KEY: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
export const adminOrigins = env.ADMIN_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
