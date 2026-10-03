import { pool, toVectorLiteral } from '../../db/pool';
import type { FaqDTO } from '../../shared';
import { normalizeQuestion } from '../../utils/hash';
import { isTypoMatch } from '../../utils/fuzzyMatch';
import { createTtlCache } from '../../utils/ttlCache';

function mapRow(row: any): FaqDTO {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// The typo-tolerant fallback scans the active FAQs in memory. That list changes rarely, so it is cached briefly
// (and dropped on any FAQ change made here) instead of being re-read from the database on every unanswered-by-exact question.
const activeFaqsForFuzzy = createTtlCache(
  async () => (await pool.query(`select question, answer from faqs where is_active = true limit 100`)).rows as { question: string; answer: string }[],
  30_000,
);

export const faqsRepo = {
  async list(): Promise<FaqDTO[]> {
    const { rows } = await pool.query('select * from faqs order by created_at desc');
    return rows.map(mapRow);
  },

  async create(question: string, answer: string, embedding: number[]): Promise<FaqDTO> {
    const { rows } = await pool.query(
      `insert into faqs (question, answer, embedding) values ($1, $2, $3::vector) returning *`,
      [question, answer, toVectorLiteral(embedding)],
    );
    activeFaqsForFuzzy.invalidate();
    return mapRow(rows[0]);
  },

  async update(id: string, question: string, answer: string, isActive: boolean, embedding: number[]): Promise<FaqDTO> {
    const { rows } = await pool.query(
      `update faqs set question = $2, answer = $3, is_active = $4, embedding = $5::vector, updated_at = now()
       where id = $1 returning *`,
      [id, question, answer, isActive, toVectorLiteral(embedding)],
    );
    activeFaqsForFuzzy.invalidate();
    return mapRow(rows[0]);
  },

  async delete(id: string) {
    await pool.query('delete from faqs where id = $1', [id]);
    activeFaqsForFuzzy.invalidate();
  },

  async findBestMatch(questionText: string, embedding: number[], threshold: number): Promise<{ question: string; answer: string; similarity: number } | null> {
    const trimmed = questionText.trim().toLowerCase();
    const normalizedInput = normalizeQuestion(questionText);

    // 1. Exact text match (100% match, ignoring trailing punctuation like '?')
    if (trimmed || normalizedInput) {
      const exactRes = await pool.query(
        `select question, answer from faqs
         where is_active = true
           and (lower(trim(question)) = $1 or regexp_replace(lower(trim(question)), '[^a-z0-9\\s]', '', 'g') = $2)
         order by created_at desc limit 1`,
        [trimmed, normalizedInput || trimmed],
      );
      if (exactRes.rows[0]) {
        return { question: exactRes.rows[0].question, answer: exactRes.rows[0].answer, similarity: 1.0 };
      }
    }

    // 2. Vector embedding similarity search
    if (embedding && embedding.length > 0) {
      const { rows } = await pool.query(
        `select question, answer, 1 - (embedding <=> $1::vector) as similarity
         from faqs
         where is_active = true and embedding is not null
         order by embedding <=> $1::vector
         limit 1`,
        [toVectorLiteral(embedding)],
      );
      const top = rows[0];
      const effThreshold = Math.min(threshold, 0.65);
      if (top && Number(top.similarity) >= effThreshold) {
        return { question: top.question, answer: top.answer, similarity: Number(top.similarity) };
      }
    }

    // 3. Typo-tolerant fuzzy text match fallback
    if (trimmed && trimmed.length >= 4) {
      for (const faq of await activeFaqsForFuzzy.get()) {
        if (isTypoMatch(trimmed, faq.question, 0.82)) {
          return { question: faq.question, answer: faq.answer, similarity: 0.90 };
        }
      }
    }

    return null;
  },
};
