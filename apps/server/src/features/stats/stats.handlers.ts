import type { Request, Response, NextFunction } from 'express';
import { statsRepo } from '../../db/queries/stats.queries';
import { queryCacheRepo } from '../../db/queries/queryCache.queries';
import { getWordUsage } from '../conversations/wordUsageService';
import { getVoiceUsage } from '../conversations/voiceUsageService';

function parseDaysParam(daysParam: unknown): number | null {
  return daysParam === undefined || daysParam === 'all' ? null : Math.max(1, Number(daysParam) || 0) || null;
}

export async function handleGetStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const [base, topQuestions, health] = await Promise.all([
      statsRepo.stats(),
      queryCacheRepo.topQuestions(10),
      statsRepo.getHealthAnalytics(),
    ]);
    res.json({ ...base, topQuestions, health });
  } catch (err) {
    next(err);
  }
}

export async function handleGetWordUsage(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getWordUsage(parseDaysParam(req.query.days)));
  } catch (err) {
    next(err);
  }
}

export async function handleGetVoiceUsage(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getVoiceUsage(parseDaysParam(req.query.days)));
  } catch (err) {
    next(err);
  }
}
