import { createTtlCache } from '../../utils/ttlCache';
import { pool } from '../pool';
import type { RestrictedWordDTO } from '../../shared/types';
import { isTypoMatch } from '../../utils/fuzzyMatch';

function mapRow(row: any): RestrictedWordDTO {
  return {
    id: row.id,
    phrase: row.phrase,
    response: row.response,
    isActive: row.is_active,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

// Checked on every chat message but edited rarely, so the active list is kept in memory for a short time (and
// dropped on any change made here). Saves a database round trip per message.
const activeWords = createTtlCache(async () => (await pool.query(`SELECT * FROM restricted_words WHERE is_active = true`)).rows, 30_000);

export const restrictedWordsRepo = {
  async listAll(): Promise<RestrictedWordDTO[]> {
    const res = await pool.query(`SELECT * FROM restricted_words ORDER BY created_at DESC`);
    return res.rows.map(mapRow);
  },

  async findMatching(messageText: string): Promise<RestrictedWordDTO | null> {
    const cleanMsg = messageText.toLowerCase();
    const msgWords = cleanMsg.split(/\s+/).map((w) => w.replace(/[^\w]/g, '')).filter(Boolean);

    try {
      for (const row of await activeWords.get()) {
        const phrase = row.phrase.trim().toLowerCase();
        if (!phrase) continue;

        // 1. Direct substring match
        if (cleanMsg.includes(phrase)) {
          return mapRow(row);
        }

        // 2. Typo-tolerant word match
        if (phrase.length >= 4) {
          for (const word of msgWords) {
            if (word.length >= 4 && isTypoMatch(word, phrase, 0.82)) {
              return mapRow(row);
            }
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  },

  async create(data: { phrase: string; response: string; isActive?: boolean }): Promise<RestrictedWordDTO> {
    const res = await pool.query(
      `INSERT INTO restricted_words (phrase, response, is_active)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.phrase.trim(), data.response.trim(), data.isActive !== false],
    );
    activeWords.invalidate();
    return mapRow(res.rows[0]);
  },

  async update(id: string, data: { phrase?: string; response?: string; isActive?: boolean }): Promise<RestrictedWordDTO> {
    const currentRes = await pool.query(`SELECT * FROM restricted_words WHERE id = $1`, [id]);
    if (currentRes.rows.length === 0) throw new Error('Restricted word entry not found');

    const current = currentRes.rows[0];
    const phrase = data.phrase !== undefined ? data.phrase.trim() : current.phrase;
    const response = data.response !== undefined ? data.response.trim() : current.response;
    const isActive = data.isActive !== undefined ? data.isActive : current.is_active;

    const res = await pool.query(
      `UPDATE restricted_words
       SET phrase = $1, response = $2, is_active = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [phrase, response, isActive, id],
    );
    activeWords.invalidate();
    return mapRow(res.rows[0]);
  },

  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM restricted_words WHERE id = $1`, [id]);
    activeWords.invalidate();
  },

  async clearAll(): Promise<number> {
    const res = await pool.query(`DELETE FROM restricted_words`);
    activeWords.invalidate();
    return res.rowCount ?? 0;
  },
};
