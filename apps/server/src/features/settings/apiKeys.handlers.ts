import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { settingsRepo } from '../../db/queries/settings.queries';
import { apiKeyOverrides, parseApiKeys } from '../../config/apiKeyOverrides';
import { speechApiKeyOverrides } from '../../config/speechApiKeyOverrides';
import { embeddingApiKeyOverrides } from '../../config/embeddingApiKeyOverrides';

// Saving the API keys for the AI, speech and embedding providers. Keys are never returned to the browser.

const apiKeysSchema = z
  .object({
    anthropic: z.string().max(8000).optional(),
    openai: z.string().max(8000).optional(),
    gemini: z.string().max(8000).optional(),
    custom: z.string().max(8000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No API key fields provided' });

export async function handleUpdateApiKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = apiKeysSchema.parse(req.body);
    const current = await settingsRepo.getApiKeys();
    const merged = { ...current, ...patch };
    await settingsRepo.setApiKeys(merged);
    apiKeyOverrides.setAll(merged);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

const speechApiKeysSchema = z
  .object({ sarvam: z.string().max(8000).optional(), openai: z.string().max(8000).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'No API key fields provided' });

export async function handleUpdateSpeechApiKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = speechApiKeysSchema.parse(req.body);
    const current = await settingsRepo.getSpeechApiKeys();
    const merged = { ...current, ...patch };
    await settingsRepo.setSpeechApiKeys(merged);
    speechApiKeyOverrides.setAll(merged);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

const embeddingApiKeysSchema = z
  .object({ openai: z.string().max(8000).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'No API key fields provided' });

export async function handleUpdateEmbeddingApiKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = embeddingApiKeysSchema.parse(req.body);
    const current = await settingsRepo.getEmbeddingApiKeys();
    const merged = { ...current, ...patch };
    await settingsRepo.setEmbeddingApiKeys(merged);
    embeddingApiKeyOverrides.setAll(merged);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
