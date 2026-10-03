import type { Request, Response, NextFunction } from 'express';
import { unansweredQuestionsRepo } from '../../db/queries/unansweredQuestions.queries';

export async function handleListUnansweredQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const search = req.query.search ? String(req.query.search) : undefined;
    const reason = req.query.reason ? String(req.query.reason) : undefined;

    const result = await unansweredQuestionsRepo.list({ limit, offset, search, reason });
    const stats = await unansweredQuestionsRepo.getStats();

    res.json({
      items: result.items,
      total: result.total,
      page: Math.floor(offset / limit) + 1,
      limit,
      stats,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteUnansweredQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deleted = await unansweredQuestionsRepo.deleteById(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Unanswered question not found' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function handleClearAllUnansweredQuestions(_req: Request, res: Response, next: NextFunction) {
  try {
    const deletedCount = await unansweredQuestionsRepo.deleteAll();
    res.json({ deletedCount });
  } catch (err) {
    next(err);
  }
}

export async function handleGetUnansweredQuestionsStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await unansweredQuestionsRepo.getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}
