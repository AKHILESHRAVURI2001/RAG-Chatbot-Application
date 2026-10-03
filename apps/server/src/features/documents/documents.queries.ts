import { pool, toVectorLiteral } from '../../db/pool';
import type { DocumentDTO, SourceType } from '../../shared';

function mapRow(row: any): DocumentDTO {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    title: row.title,
    status: row.status,
    error: row.error,
    chunkCount: row.chunk_count !== undefined ? Number(row.chunk_count) : undefined,
    tags: row.tags ?? [],
    createdAt: row.created_at,
  };
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)));
}

export const documentsRepo = {
  async create(sourceType: SourceType, sourceRef: string | null, title: string | null, tags: string[] = []) {
    const { rows } = await pool.query(
      `insert into documents (source_type, source_ref, title, status, tags)
       values ($1, $2, $3, 'processing', $4) returning *`,
      [sourceType, sourceRef, title, normalizeTags(tags)],
    );
    return mapRow(rows[0]);
  },

  async setTags(id: string, tags: string[]): Promise<DocumentDTO | null> {
    const { rows } = await pool.query('update documents set tags = $2 where id = $1 returning *', [id, normalizeTags(tags)]);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async listAllTags(): Promise<string[]> {
    const { rows } = await pool.query('select distinct unnest(tags) as tag from documents order by tag');
    return rows.map((r) => r.tag);
  },

  async markReady(id: string, title?: string) {
    if (title) {
      await pool.query(`update documents set status = 'ready', error = null, title = $2 where id = $1`, [id, title]);
    } else {
      await pool.query(`update documents set status = 'ready', error = null where id = $1`, [id]);
    }
  },

  async markFailed(id: string, error: string) {
    await pool.query(`update documents set status = 'failed', error = $2 where id = $1`, [id, error]);
  },

  async markProcessing(id: string) {
    await pool.query(`update documents set status = 'processing', error = null where id = $1`, [id]);
  },

  /** Toggles a ready document out of (or back into) vector search without deleting it or its chunks. */
  async setPaused(id: string, paused: boolean): Promise<DocumentDTO | null> {
    const { rows } = await pool.query(
      `update documents set status = $2 where id = $1 and status in ('ready', 'paused') returning *`,
      [id, paused ? 'paused' : 'ready'],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async getById(id: string): Promise<DocumentDTO | null> {
    const { rows } = await pool.query('select * from documents where id = $1', [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findBySourceRef(sourceType: SourceType, sourceRef: string): Promise<DocumentDTO | null> {
    const { rows } = await pool.query(
      'select * from documents where source_type = $1 and lower(source_ref) = lower($2) limit 1',
      [sourceType, sourceRef.trim()],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async deleteChunks(documentId: string) {
    await pool.query('delete from chunks where document_id = $1', [documentId]);
  },

  async list(tag?: string): Promise<DocumentDTO[]> {
    const params: unknown[] = [];
    let tagFilter = '';
    if (tag) {
      params.push(tag.trim().toLowerCase());
      tagFilter = `where $${params.length} = any(d.tags)`;
    }
    const { rows } = await pool.query(
      `select d.*, count(c.id) as chunk_count
       from documents d
       left join chunks c on c.document_id = d.id
       ${tagFilter}
       group by d.id
       order by d.created_at desc`,
      params,
    );
    return rows.map(mapRow);
  },

  async delete(id: string) {
    await pool.query('delete from documents where id = $1', [id]);
  },

  async insertChunks(documentId: string, chunks: { content: string; tokenCount: number; embedding: number[] }[]) {
    if (chunks.length === 0) return;
    const values: string[] = [];
    const params: unknown[] = [];
    chunks.forEach((c, i) => {
      const base = i * 4;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector)`);
      params.push(documentId, c.content, c.tokenCount, toVectorLiteral(c.embedding));
    });
    await pool.query(
      `insert into chunks (document_id, content, token_count, embedding) values ${values.join(',')}`,
      params,
    );
  },

  async listChunks(documentId: string) {
    const { rows } = await pool.query(
      `select id, content, token_count, embedding::text as embedding, created_at
       from chunks where document_id = $1 order by created_at asc`,
      [documentId],
    );
    return rows.map((r) => {
      let embedding: number[] = [];
      try {
        embedding = JSON.parse(r.embedding);
      } catch {
        /* leave empty if the vector text is ever malformed */
      }
      return {
        id: r.id,
        content: r.content,
        tokenCount: Number(r.token_count),
        embedding,
        createdAt: r.created_at,
      };
    });
  },

  async searchSimilarChunks(embedding: number[], limit = 5, documentId?: string, tag?: string, queryText?: string) {
    const fetchLimit = Math.max(limit * 4, 20);
    const params: unknown[] = [toVectorLiteral(embedding), fetchLimit];
    let documentFilter = '';
    if (documentId) {
      params.push(documentId);
      documentFilter = `and d.id = $${params.length}`;
    }
    let tagFilter = '';
    if (tag) {
      params.push(tag.trim().toLowerCase());
      tagFilter = `and $${params.length} = any(d.tags)`;
    }

    // The vector query and the keyword query below don't depend on each other: both start now and run side by side.
    const vectorQuery = pool.query(
      `select c.content, d.title, d.source_ref, d.source_type, 1 - (c.embedding <=> $1::vector) as similarity
       from chunks c
       join documents d on d.id = c.document_id and d.status = 'ready' ${documentFilter} ${tagFilter}
       order by c.embedding <=> $1::vector
       limit $2`,
      params,
    );

    const stopWords = new Set([
      'the', 'and', 'for', 'you', 'can', 'how', 'what', 'who', 'why', 'where', 'are', 'was', 'were', 'does', 'this', 'that',
      'with', 'from', 'about', 'will', 'do', 'doing', 'tell', 'me', 'is', 'in', 'of', 'on', 'to', 'a', 'an', 'or', 'at', 'by',
      'if', 'my', 'your', 'our', 'we', 'they', 'them', 'have', 'has', 'had', 'been', 'would', 'could', 'should',
    ]);

    const keywords = (queryText || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !stopWords.has(w));

    // If keywords exist, also query direct title/content candidate matches in case vector search missed
    const useKeywordQuery = keywords.length > 0 && keywords[0].length >= 3;
    let keywordQuery: Promise<{ rows: any[] }> | null = null;
    if (useKeywordQuery) {
      const kwParam = `%${keywords[0]}%`;
      const kwParams: unknown[] = [kwParam];
      let kwDocFilter = '';
      if (documentId) {
        kwParams.push(documentId);
        kwDocFilter = `and d.id = $${kwParams.length}`;
      }
      let kwTagFilter = '';
      if (tag) {
        kwParams.push(tag.trim().toLowerCase());
        kwTagFilter = `and $${kwParams.length} = any(d.tags)`;
      }

      keywordQuery = pool.query(
        `select c.content, d.title, d.source_ref, d.source_type, 0.35 as similarity
         from chunks c
         join documents d on d.id = c.document_id and d.status = 'ready' ${kwDocFilter} ${kwTagFilter}
         where lower(d.title) LIKE $1 or lower(c.content) LIKE $1
         limit 10`,
        kwParams,
      );
    }

    const [vectorRes, kwRes] = await Promise.all([vectorQuery, keywordQuery]);
    const allRows = [...vectorRes.rows];
    if (kwRes) {
      const existingContents = new Set(allRows.map((r) => r.content));
      for (const r of kwRes.rows) {
        if (!existingContents.has(r.content)) {
          allRows.push(r);
        }
      }
    }

    const scored = allRows.map((r) => {
      let sim = Number(r.similarity ?? 0.35);
      if (keywords.length > 0) {
        const titleLower = (r.title || '').toLowerCase();
        const contentLower = (r.content || '').toLowerCase();

        const titleMatches = keywords.filter((kw) => titleLower.includes(kw)).length;
        const contentMatches = keywords.filter((kw) => contentLower.includes(kw)).length;

        if (titleMatches >= 1) {
          sim = Math.max(sim + 0.15, 0.48);
        } else if (contentMatches >= 2) {
          sim = Math.max(sim + 0.10, 0.42);
        } else if (contentMatches === 1) {
          sim = Math.max(sim + 0.05, 0.35);
        }
      }
      return {
        content: r.content,
        similarity: sim,
        title: r.title as string | null,
        sourceRef: r.source_ref as string | null,
        sourceType: r.source_type as SourceType,
      };
    });

    return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  },
};
