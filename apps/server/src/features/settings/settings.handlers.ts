import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { settingsRepo } from '../../db/queries/settings.queries';
import { listProviderStatus } from '../../providers/llm';
import { firebaseSettingsCache } from '../../config/firebaseCredentials';
import { firebaseMirror } from '../reports/firebaseMirror';
import { listSpeechProviderStatus, getSpeechProvider } from '../../providers/speech';
import { listEmbeddingProviderStatus } from '../../providers/embedding';

// Reading and saving the admin-configurable settings (AI, prompt, widget look, hours, cache, limits, chunking, voice).

function putSetting<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, save: (value: T) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const value = schema.parse(req.body);
      await save(value);
      res.json(value);
    } catch (err) {
      next(err);
    }
  };
}

export async function handleGetSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const [llm, prompt, widget, businessHours, storedFirebase, cache, limits, chunking, voice] = await Promise.all([
      settingsRepo.getLlm(),
      settingsRepo.getPrompt(),
      settingsRepo.getWidget(),
      settingsRepo.getBusinessHours(),
      settingsRepo.getFirebase(),
      settingsRepo.getCache(),
      settingsRepo.getLimits(),
      settingsRepo.getChunking(),
      settingsRepo.getVoice(),
    ]);

    const firebase = { enabled: storedFirebase.enabled, configured: firebaseMirror.isConfigured() };

    res.json({
      llm,
      prompt,
      widget,
      businessHours,
      firebase,
      cache,
      limits,
      chunking,
      voice,
      providers: listProviderStatus(),
      speechProviders: listSpeechProviderStatus(),
      embeddingProviders: listEmbeddingProviderStatus(),
    });
  } catch (err) {
    next(err);
  }
}

const llmSchema = z.object({
  llmEnabled: z.boolean().default(true),
  provider: z.enum(['anthropic', 'openai', 'gemini', 'custom']),
  model: z.string().min(1),
  customBaseUrl: z.string().max(300).default(''),
  temperature: z.number().min(0).max(1),
  maxTokens: z.number().int().min(1).max(4000),
  topP: z.number().min(0).max(1),
  frequencyPenalty: z.number().min(-2).max(2),
  presencePenalty: z.number().min(-2).max(2),
  historyLimit: z.number().int().min(0).max(50),
  rewriteFollowUpQueries: z.boolean().default(true),
  maxContextChars: z.number().int().min(500).max(40000).default(6000),
  maxHistoryCharsPerTurn: z.number().int().min(100).max(5000).default(600),
  autoCompactHistoryWords: z.number().int().min(0).max(20000).default(800),
  autoCompactContextWords: z.number().int().min(0).max(20000).default(0),
  showChunkFallbackWhenLlmUnavailable: z.boolean().optional().default(true),
  showChunkFallbackWhenLlmEnabled: z.boolean().optional().default(false),
  chunkFallbackMinSimilarity: z.number().min(0.05).max(1).optional().default(0.48),
  chunkFallbackMaxResults: z.number().int().min(1).max(10).optional().default(3),
  autoStoreQuestionChunks: z.boolean().optional().default(false),
  enableQuestionChunksMatching: z.boolean().optional().default(true),
  enableFaqs: z.boolean().optional().default(true),
  enableDocumentSearch: z.boolean().optional().default(true),
});

export const handleUpdateLlm = putSetting(llmSchema, settingsRepo.setLlm);

import defaultSettings from '../../config/defaultSettings.json';

const promptSchema = z.object({
  systemPrompt: z.string().min(1).max(4000),
  greeting: z.string().min(1).max(300),
  noContextMessage: z.string().min(1).max(500).default(defaultSettings.prompt.noContextMessage),
  chunkFallbackIntroMessage: z
    .string()
    .max(1000)
    .optional()
    .default(defaultSettings.prompt.chunkFallbackIntroMessage),
});

export const handleUpdatePrompt = putSetting(promptSchema, settingsRepo.setPrompt);

const widgetSchema = z.object({
  companyName: z.string().max(100).default(''),
  adminPrimaryColor: z.string().min(1).max(20).default('#6d28d9'),
  primaryColor: z.string().min(1).max(20),
  icon: z.string().min(1).max(2048).default('💬'),
  iconSvg: z.string().max(20_000).default(''),
  title: z.string().min(1).max(100),
  description: z.string().max(200).default(''),
  note: z.string().max(300).default(''),
  enabled: z.boolean().default(true),
  unavailableMessage: z.string().min(1).max(300).default("We're currently unavailable. Please check back soon."),
  quickReplies: z
    .array(z.object({ label: z.string().min(1).max(60), message: z.string().min(1).max(300) }))
    .max(6)
    .default([]),
  proactiveEnabled: z.boolean().default(false),
  proactiveDelaySeconds: z.number().int().min(1).max(120).default(8),
  proactiveMessage: z.string().min(1).max(200).default('Looking for a property? Ask me anything!'),
  poweredByText: z.string().max(100).default(''),
  requireLogin: z.boolean().default(false),
  loginPromptTitle: z.string().max(100).default('Sign up or Log in to continue'),
  loginPromptMessage: z.string().max(500).default('Please create an account or sign in to ask questions and receive instant AI answers.'),
  signupUrl: z.string().max(500).default('/signup'),
  loginUrl: z.string().max(500).default('/login'),
  freeQuestionsBeforeAuth: z.number().int().min(0).max(1000).default(0),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional().default('bottom-right'),
});

export const handleUpdateWidget = putSetting(widgetSchema, settingsRepo.setWidget);

const businessHoursSchema = z.object({
  enabled: z.boolean().default(false),
  timezone: z.string().min(1).max(100).default('Europe/London'),
  days: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
  openTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be 24h HH:MM')
    .default('09:00'),
  closeTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be 24h HH:MM')
    .default('18:00'),
  closedMessage: z
    .string()
    .min(1)
    .max(300)
    .default("We're currently closed. Our hours are Mon-Fri, 9am-6pm. Please leave a message and we'll get back to you."),
});

export const handleUpdateBusinessHours = putSetting(businessHoursSchema, settingsRepo.setBusinessHours);

const firebaseSchema = z.object({
  enabled: z.boolean().default(false),
  serviceAccountJson: z.string().max(20000).optional().default(''),
});

export async function handleUpdateFirebase(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = firebaseSchema.parse(req.body);
    const current = await settingsRepo.getFirebase();
    const merged = {
      enabled: patch.enabled,
      serviceAccountJson: patch.serviceAccountJson?.trim() || current.serviceAccountJson,
    };
    await settingsRepo.setFirebase(merged);
    firebaseSettingsCache.set(merged);
    firebaseMirror.resetApp();
    res.json({ enabled: merged.enabled, configured: firebaseMirror.isConfigured() });
  } catch (err) {
    next(err);
  }
}

const cacheSchema = z.object({
  ttlSeconds: z.number().int().min(60).max(30 * 24 * 3600),
  semanticThreshold: z.number().min(0).max(1),
  faqThreshold: z.number().min(0).max(1),
  contextThreshold: z.number().min(0).max(1).default(0.3),
});

export const handleUpdateCache = putSetting(cacheSchema, settingsRepo.setCache);

const limitsSchema = z.object({
  enabled: z.boolean().default(true),
  sessionMessageLimit: z.number().int().min(1).max(1000),
  sessionMessageWindowHours: z.number().min(0.5).max(168),
  registeredUserMessageLimit: z.number().int().min(1).max(10000).optional(),
});

export const handleUpdateLimits = putSetting(limitsSchema, settingsRepo.setLimits);

const chunkingSchema = z
  .object({
    chunkSize: z.number().int().min(20).max(2000),
    overlap: z.number().int().min(0).max(500),
    embeddingProvider: z.enum(['local', 'openai']).default('local'),
    embeddingModel: z.string().default('text-embedding-3-small'),
  })
  .refine((v) => v.overlap < v.chunkSize, { message: 'Overlap must be smaller than chunk size', path: ['overlap'] });

export const handleUpdateChunking = putSetting(chunkingSchema, settingsRepo.setChunking);

const voiceSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['sarvam', 'openai']).default('sarvam'),
  languageCode: z.string().min(1).max(20).default('en-IN'),
  speaker: z.string().max(50).default('shubh'),
  systemPrompt: z.string().max(4000).default(''),
  noContextMessage: z.string().max(500).default(''),
  overrideTuning: z.boolean().default(false),
  temperature: z.number().min(0).max(1).default(0.3),
  maxTokens: z.number().int().min(1).max(4000).default(600),
  topP: z.number().min(0).max(1).default(1),
  frequencyPenalty: z.number().min(-2).max(2).default(0),
  presencePenalty: z.number().min(-2).max(2).default(0),
  historyLimit: z.number().int().min(0).max(50).default(10),
  maxContextChars: z.number().int().min(500).max(40000).default(6000),
  maxHistoryCharsPerTurn: z.number().int().min(100).max(5000).default(600),
  rewriteFollowUpQueries: z.boolean().default(true),
  autoCompactHistoryWords: z.number().int().min(0).max(20000).default(800),
  autoCompactContextWords: z.number().int().min(0).max(20000).default(0),
});

export const handleUpdateVoice = putSetting(voiceSchema, settingsRepo.setVoice);
