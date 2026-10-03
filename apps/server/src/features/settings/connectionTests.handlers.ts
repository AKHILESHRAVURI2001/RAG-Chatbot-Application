import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { settingsRepo } from '../../db/queries/settings.queries';
import { apiKeyOverrides, parseApiKeys } from '../../config/apiKeyOverrides';
import { firebaseMirror } from '../reports/firebaseMirror';
import { listSpeechProviderStatus, getSpeechProvider } from '../../providers/speech';
import { embedText } from '../../providers/embedding/resolve';

// "Test" buttons: check that a key / credential / provider actually works, without saving anything.

export async function handleTestFirebaseConnection(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await firebaseMirror.testConnection());
  } catch (err) {
    next(err);
  }
}

const testEmbeddingSchema = z.object({
  text: z.string().min(1).max(10000).default('MiniChatbotAgent semantic vector test'),
});

export async function handleTestEmbedding(req: Request, res: Response, next: NextFunction) {
  try {
    const { text } = testEmbeddingSchema.parse(req.body);
    const start = Date.now();
    const chunking = await settingsRepo.getChunking();
    const vector = await embedText(text);
    const durationMs = Date.now() - start;
    res.json({
      provider: chunking.embeddingProvider || 'local',
      model: chunking.embeddingProvider === 'openai' ? (chunking.embeddingModel || 'text-embedding-3-small') : 'all-MiniLM-L6-v2',
      dimensions: vector.length,
      sample: vector.slice(0, 8),
      durationMs,
    });
  } catch (err) {
    next(err);
  }
}

const testLlmKeySchema = z.object({
  provider: z.enum(['gemini', 'openai', 'anthropic', 'custom']),
  key: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
});

export async function handleTestLlmKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { provider, key, model, baseUrl } = testLlmKeySchema.parse(req.body);
    const keysToTest = key && key.trim() ? parseApiKeys(key) : apiKeyOverrides.getAll(provider);
    if (keysToTest.length === 0) {
      return res.status(400).json({ error: `No API key provided or configured for ${provider}.` });
    }

    const defaultModel =
      model ||
      (provider === 'gemini'
        ? 'gemini-3.1-flash-lite'
        : provider === 'anthropic'
          ? 'claude-3-haiku-20240307'
          : 'gpt-4o-mini');

    const results: Array<{ keyIndex: number; keyMasked: string; valid: boolean; latencyMs: number; error?: string }> = [];

    for (let i = 0; i < keysToTest.length; i++) {
      const k = keysToTest[i];
      const start = Date.now();
      try {
        if (provider === 'gemini') {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const client = new GoogleGenerativeAI(k);
          const genModel = client.getGenerativeModel({ model: defaultModel });
          await genModel.generateContent('PING');
        } else if (provider === 'anthropic') {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const client = new Anthropic({ apiKey: k });
          await client.messages.create({
            model: defaultModel,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'PING' }],
          });
        } else {
          const OpenAI = (await import('openai')).default;
          const client = new OpenAI({ apiKey: k, baseURL: baseUrl || undefined });
          await client.chat.completions.create({
            model: defaultModel,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'PING' }],
          });
        }

        results.push({
          keyIndex: i + 1,
          keyMasked: k.length > 8 ? `${k.slice(0, 4)}...${k.slice(-4)}` : '••••',
          valid: true,
          latencyMs: Date.now() - start,
        });
      } catch (err: any) {
        results.push({
          keyIndex: i + 1,
          keyMasked: k.length > 8 ? `${k.slice(0, 4)}...${k.slice(-4)}` : '••••',
          valid: false,
          latencyMs: Date.now() - start,
          error: err.message || String(err),
        });
      }
    }

    res.json({
      provider,
      totalKeys: keysToTest.length,
      healthyCount: results.filter((r) => r.valid).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

const testSpeechSchema = z.object({ text: z.string().min(1).max(300) });

export async function handleTestSpeech(req: Request, res: Response, next: NextFunction) {
  try {
    const { text } = testSpeechSchema.parse(req.body);
    const voice = await settingsRepo.getVoice();
    const provider = getSpeechProvider(voice.provider);
    if (!provider.isConfigured()) {
      return res.status(400).json({ error: `${voice.provider} is not configured — add its API key below first.` });
    }
    const synthesized = await provider.synthesize(text, voice.languageCode, voice.speaker);
    res.json({ audio: { base64: synthesized.audioBase64, format: synthesized.audioFormat } });
  } catch (err) {
    next(err);
  }
}
