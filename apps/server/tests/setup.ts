process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.ADMIN_JWT_SECRET ||= 'test-secret-at-least-16-chars-long';

process.env.ANTHROPIC_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.SARVAM_API_KEY = '';
