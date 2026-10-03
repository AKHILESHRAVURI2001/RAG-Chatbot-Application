import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { faqService } from './faqService';
import knowledgeSeed from '../../config/knowledge.seed.json';

export async function handleListFaqs(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await faqService.list());
  } catch (err) {
    next(err);
  }
}

const createSchema = z.object({ question: z.string().min(1).max(500), answer: z.string().min(1).max(4000) });

export async function handleCreateFaq(req: Request, res: Response, next: NextFunction) {
  try {
    const { question, answer } = createSchema.parse(req.body);
    res.status(201).json(await faqService.create(question, answer));
  } catch (err) {
    next(err);
  }
}

const updateSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(4000),
  isActive: z.boolean().default(true),
});

export async function handleUpdateFaq(req: Request, res: Response, next: NextFunction) {
  try {
    const { question, answer, isActive } = updateSchema.parse(req.body);
    res.json(await faqService.update(req.params.id, question, answer, isActive));
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteFaq(req: Request, res: Response, next: NextFunction) {
  try {
    await faqService.delete(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function handleImportSeedFaqs(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await faqService.importJson(knowledgeSeed.faqs));
  } catch (err) {
    next(err);
  }
}

const importSchema = z.object({
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).max(2000),
});

export async function handleImportFaqs(req: Request, res: Response, next: NextFunction) {
  try {
    const { faqs } = importSchema.parse(req.body);
    res.status(201).json(await faqService.importJson(faqs));
  } catch (err) {
    next(err);
  }
}
