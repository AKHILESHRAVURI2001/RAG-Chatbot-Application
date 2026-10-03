import { faqsRepo } from '../../db/queries/faqs.queries';
import { embedText } from '../../providers/embedding/resolve';
import { redisCache } from '../../cache/redis';
import { env } from '../../config/env';
import type { FaqDTO } from '../../shared';

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`FAQ ${field} cannot be empty`);
  return trimmed;
}

export class FaqService {
  public async list(): Promise<FaqDTO[]> {
    return faqsRepo.list();
  }

  public async create(question: string, answer: string): Promise<FaqDTO> {
    const faq = await this.createWithoutFlush(question, answer);
    await redisCache.flushAll();
    return faq;
  }

  public async update(id: string, question: string, answer: string, isActive: boolean): Promise<FaqDTO> {
    const q = assertNonEmpty(question, 'question');
    const a = assertNonEmpty(answer, 'answer');
    const embedding = await embedText(q);
    const faq = await faqsRepo.update(id, q, a, isActive, embedding);
    await redisCache.flushAll();
    return faq;
  }

  public async delete(id: string): Promise<void> {
    await faqsRepo.delete(id);
    await redisCache.flushAll();
  }

  public async importJson(faqs: { question: string; answer: string }[]): Promise<{ created: FaqDTO[]; skipped: number }> {
    const created: FaqDTO[] = [];
    let skipped = 0;
    for (const f of faqs) {
      if (!f.question?.trim() || !f.answer?.trim()) {
        skipped++;
        continue;
      }
      created.push(await this.createWithoutFlush(f.question, f.answer));
    }
    if (created.length > 0) {
      await redisCache.flushAll();
    }
    return { created, skipped };
  }

  public async findBestMatch(questionText: string, questionEmbedding: number[]) {
    return faqsRepo.findBestMatch(questionText, questionEmbedding, env.FAQ_SIMILARITY_THRESHOLD);
  }

  private async createWithoutFlush(question: string, answer: string): Promise<FaqDTO> {
    const q = assertNonEmpty(question, 'question');
    const a = assertNonEmpty(answer, 'answer');
    const embedding = await embedText(q);
    return faqsRepo.create(q, a, embedding);
  }
}

export const faqService = new FaqService();
