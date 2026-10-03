import { pool, toVectorLiteral } from '../../db/pool';
import type { QuestionChunkDTO } from '../../shared';
import { normalizeQuestion } from '../../utils/hash';
import { isTypoMatch } from '../../utils/fuzzyMatch';

export const questionChunksRepo = {
  findBestMatch: async (
    questionText: string,
    embedding: number[],
  ): Promise<{ id: string; answer: string; similarity: number } | null> => {
    try {
      const trimmed = questionText.trim().toLowerCase();
      const normalizedInput = normalizeQuestion(questionText);

      // 1. Exact or Punctuation-Agnostic Text Match (1.0 / 100% match)
      if (trimmed || normalizedInput) {
        const exactRes = await pool.query(
          `SELECT id, answer FROM question_chunks
           WHERE lower(trim(question)) = $1
              OR regexp_replace(lower(trim(question)), '[^a-z0-9\\s]', '', 'g') = $2
           ORDER BY created_at DESC LIMIT 1`,
          [trimmed, normalizedInput || trimmed],
        );
        if (exactRes.rows[0]) {
          return { id: exactRes.rows[0].id, answer: exactRes.rows[0].answer, similarity: 1.0 };
        }
      }

      // 2. Pure Vector Cosine Similarity Search (<=> cosine distance)
      if (embedding && embedding.length > 0) {
        const query = `
          SELECT id, question, answer, (1 - (embedding <=> $1::vector)) as similarity, similarity_threshold
          FROM question_chunks
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector ASC
          LIMIT 5
        `;
        const { rows } = await pool.query(query, [toVectorLiteral(embedding)]);

        for (const row of rows) {
          const sim = Number(row.similarity);
          const threshold = Number(row.similarity_threshold ?? 0.80);
          const effThreshold = Math.min(threshold, 0.65);

          if (sim >= effThreshold) {
            return { id: row.id, answer: row.answer, similarity: sim };
          }
        }
      }

      // 3. Typo-tolerant fuzzy text match fallback
      if (trimmed && trimmed.length >= 4) {
        const firstWord = trimmed.split(/\s+/)[0];
        if (firstWord && firstWord.length >= 3) {
          const candidates = await pool.query(
            `SELECT id, question, answer FROM question_chunks WHERE lower(question) LIKE $1 LIMIT 20`,
            [`%${firstWord}%`],
          );
          for (const chunk of candidates.rows) {
            if (isTypoMatch(trimmed, chunk.question || '', 0.80)) {
              return { id: chunk.id, answer: chunk.answer, similarity: 0.90 };
            }
          }
        }
      }

      // 4. Fallback for chunks with NULL embeddings (exact normalized string match only)
      const nullEmbeddingChunks = await pool.query(
        `SELECT id, question, answer, similarity_threshold FROM question_chunks WHERE embedding IS NULL LIMIT 50`,
      );
      for (const row of nullEmbeddingChunks.rows) {
        const qNorm = normalizeQuestion(row.question || '');
        if (qNorm && normalizedInput && qNorm === normalizedInput) {
          return { id: row.id, answer: row.answer, similarity: 1.0 };
        }
      }

      return null;
    } catch {
      return null;
    }
  },

  incrementUseCount: async (id: string): Promise<void> => {
    try {
      await pool.query('UPDATE question_chunks SET use_count = use_count + 1, updated_at = now() WHERE id = $1', [id]);
    } catch {
      // non-fatal
    }
  },

  list: async (opts: {
    query?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: QuestionChunkDTO[]; total: number }> => {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    if (opts.query && opts.query.trim()) {
      queryParams.push(`%${opts.query.trim().toLowerCase()}%`);
      whereConditions.push(`(lower(question) LIKE $${queryParams.length} OR lower(answer) LIKE $${queryParams.length})`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM question_chunks ${whereClause}`, queryParams);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT id, question, answer, similarity_threshold, use_count, created_at, updated_at
      FROM question_chunks
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `;

    const dataRes = await pool.query(dataQuery, dataParams);
    const items: QuestionChunkDTO[] = dataRes.rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      similarityThreshold: Number(r.similarity_threshold ?? 0.80),
      useCount: Number(r.use_count ?? 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { items, total };
  },

  create: async (data: {
    question: string;
    answer: string;
    embedding?: number[];
    similarityThreshold?: number;
  }): Promise<QuestionChunkDTO> => {
    const trimmedQuestion = data.question.trim();
    const trimmedAnswer = data.answer.trim();
    const vectorStr = data.embedding && data.embedding.length > 0 ? toVectorLiteral(data.embedding) : null;
    const threshold = data.similarityThreshold ?? 0.80;

    const existing = await pool.query(
      `SELECT id FROM question_chunks WHERE lower(trim(question)) = lower($1) LIMIT 1`,
      [trimmedQuestion],
    );

    if (existing.rows[0]) {
      const updatedRes = await pool.query(
        `UPDATE question_chunks
         SET answer = $2, embedding = $3::vector, similarity_threshold = $4, updated_at = now()
         WHERE id = $1
         RETURNING id, question, answer, similarity_threshold, use_count, created_at, updated_at`,
        [existing.rows[0].id, trimmedAnswer, vectorStr, threshold],
      );
      const r = updatedRes.rows[0];
      return {
        id: r.id,
        question: r.question,
        answer: r.answer,
        similarityThreshold: Number(r.similarity_threshold),
        useCount: Number(r.use_count),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }

    const res = await pool.query(
      `INSERT INTO question_chunks (question, answer, embedding, similarity_threshold)
       VALUES ($1, $2, $3::vector, $4)
       RETURNING id, question, answer, similarity_threshold, use_count, created_at, updated_at`,
      [trimmedQuestion, trimmedAnswer, vectorStr, threshold],
    );

    const r = res.rows[0];
    return {
      id: r.id,
      question: r.question,
      answer: r.answer,
      similarityThreshold: Number(r.similarity_threshold),
      useCount: Number(r.use_count),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  update: async (
    id: string,
    data: {
      question?: string;
      answer?: string;
      embedding?: number[];
      similarityThreshold?: number;
    },
  ): Promise<QuestionChunkDTO | null> => {
    const fields: string[] = ['updated_at = now()'];
    const values: any[] = [id];

    if (data.question !== undefined) {
      values.push(data.question.trim());
      fields.push(`question = $${values.length}`);
    }
    if (data.answer !== undefined) {
      values.push(data.answer.trim());
      fields.push(`answer = $${values.length}`);
    }
    if (data.similarityThreshold !== undefined) {
      values.push(data.similarityThreshold);
      fields.push(`similarity_threshold = $${values.length}`);
    }
    if (data.embedding !== undefined) {
      const vectorStr = data.embedding && data.embedding.length > 0 ? toVectorLiteral(data.embedding) : null;
      values.push(vectorStr);
      fields.push(`embedding = $${values.length}::vector`);
    }

    const res = await pool.query(
      `UPDATE question_chunks SET ${fields.join(', ')} WHERE id = $1
       RETURNING id, question, answer, similarity_threshold, use_count, created_at, updated_at`,
      values,
    );

    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      question: r.question,
      answer: r.answer,
      similarityThreshold: Number(r.similarity_threshold),
      useCount: Number(r.use_count),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  delete: async (id: string): Promise<boolean> => {
    const res = await pool.query('DELETE FROM question_chunks WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  clearAll: async (): Promise<number> => {
    const res = await pool.query('DELETE FROM question_chunks');
    return res.rowCount ?? 0;
  },
};
