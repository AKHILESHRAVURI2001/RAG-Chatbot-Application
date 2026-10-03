import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { env, allowedOrigins, adminOrigins } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { settingsRepo } from './db/queries/settings.queries';
import { apiKeyOverrides } from './config/apiKeyOverrides';
import { firebaseSettingsCache } from './config/firebaseCredentials';
import { speechApiKeyOverrides } from './config/speechApiKeyOverrides';
import { embeddingApiKeyOverrides } from './config/embeddingApiKeyOverrides';
import { warmupEmbedder } from './providers/embedding/resolve';

import { ensureDbSchema } from './db/autoMigrate';
import { keepPoolWarm } from './db/pool';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed = [...allowedOrigins, ...adminOrigins].includes('*') || [...allowedOrigins, ...adminOrigins].includes(origin);
      callback(allowed ? null : new Error(`Origin ${origin} not allowed by CORS`), allowed);
    },
  }),
);
// Gzip JSON and the widget bundle (~106 KB of JS shrinks to roughly a third) — a big win on slow mobile connections.
app.use(compression());
app.use(express.json({ limit: '2mb' }));

const widgetDistPath = path.resolve(__dirname, '../../widget/dist/widget.js');
const widgetSrcEntry = path.resolve(__dirname, '../../widget/src/widget.ts');

app.get('/widget.js', async (_req, res) => {
  if (process.env.NODE_ENV === 'production' && fs.existsSync(widgetDistPath)) {
    res.type('application/javascript');
    // Short browser cache + ETag revalidation: repeat visitors skip the download, yet a new release reaches them within minutes.
    return res.sendFile(widgetDistPath, { maxAge: '5m' });
  }

  // Dynamic on-demand bundling for local development
  try {
    const esbuild = await import('esbuild');
    const result = await esbuild.build({
      entryPoints: [widgetSrcEntry],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'MiniChatbotWidget',
      target: 'es2020',
      loader: {
        '.css': 'text',
        '.ts': 'ts',
      },
    });
    if (result.outputFiles && result.outputFiles[0]) {
      res.type('application/javascript');
      return res.send(result.outputFiles[0].text);
    }
  } catch (err: any) {
    /* fallback to dist if esbuild on-demand build fails */
  }

  if (fs.existsSync(widgetDistPath)) {
    res.type('application/javascript');
    return res.sendFile(widgetDistPath);
  }

  res.status(404).send('// widget.js not built yet.');
});

// Normalize /api/api/* paths in case of client-side prefix duplicates
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/api/')) {
    req.url = req.url.replace(/^\/api\/api\//, '/api/');
  }
  next();
});

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  await ensureDbSchema();
  keepPoolWarm();

  try {
    const keys = await settingsRepo.getApiKeys();
    apiKeyOverrides.setAll(keys);
  } catch (err: any) {
    console.error('Could not load admin-set API keys (falling back to .env):', err.message);
  }

  try {
    const firebase = await settingsRepo.getFirebase();
    firebaseSettingsCache.set(firebase);
  } catch (err: any) {
    console.error('Could not load Firebase logging settings:', err.message);
  }

  try {
    const speechKeys = await settingsRepo.getSpeechApiKeys();
    speechApiKeyOverrides.setAll(speechKeys);
  } catch (err: any) {
    console.error('Could not load speech API keys:', err.message);
  }

  try {
    const embeddingKeys = await settingsRepo.getEmbeddingApiKeys();
    embeddingApiKeyOverrides.setAll(embeddingKeys);
  } catch (err: any) {
    console.error('Could not load embedding API keys:', err.message);
  }

  void warmupEmbedder();

  app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`MiniChatbotAgent server listening on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

void bootstrap();
