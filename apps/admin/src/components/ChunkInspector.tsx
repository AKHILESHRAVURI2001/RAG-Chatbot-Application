import { useEffect, useMemo, useState } from 'react';
import { FiExternalLink, FiLayers, FiSearch } from 'react-icons/fi';
import type { ChunkDTO, DocumentDTO } from '../shared';
import { api } from '../lib/api';

const VECTOR_PREVIEW_LENGTH = 8;

function ChunkRow({ chunk, index }: { chunk: ChunkDTO; index: number }) {
  const [showFullText, setShowFullText] = useState(false);
  const [showFullVector, setShowFullVector] = useState(false);

  const preview = chunk.content.length > 220 && !showFullText ? `${chunk.content.slice(0, 220)}…` : chunk.content;
  const vectorPreview = chunk.embedding.slice(0, VECTOR_PREVIEW_LENGTH).map((n) => n.toFixed(4));

  return (
    <div className="chunk-item">
      <div className="chunk-item-header">
        <strong>Chunk {index + 1}</strong>
        <span className="muted small">{chunk.tokenCount} words</span>
      </div>
      <p className="chunk-content">{preview}</p>
      {chunk.content.length > 220 && (
        <button className="btn-secondary btn-tiny" onClick={() => setShowFullText((v) => !v)}>
          {showFullText ? 'Show less' : 'Show full text'}
        </button>
      )}
      <div className="chunk-vector">
        <span className="muted small">
          vector [{vectorPreview.join(', ')}{chunk.embedding.length > VECTOR_PREVIEW_LENGTH ? ', …' : ''}] — {chunk.embedding.length} dims
        </span>
        {chunk.embedding.length > VECTOR_PREVIEW_LENGTH && (
          <button className="btn-secondary btn-tiny" onClick={() => setShowFullVector((v) => !v)}>
            {showFullVector ? 'Hide full vector' : 'Show full vector'}
          </button>
        )}
        {showFullVector && <pre className="chunk-vector-full">{JSON.stringify(chunk.embedding)}</pre>}
      </div>
    </div>
  );
}

export default function ChunkInspector({ documentId, doc }: { documentId: string; doc?: DocumentDTO }) {
  const [chunks, setChunks] = useState<ChunkDTO[] | null>(null);
  const [chunkQuery, setChunkQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getDocumentChunks(documentId)
      .then((c) => {
        if (!cancelled) setChunks(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const filteredChunks = useMemo(() => {
    if (!chunks) return [];
    const q = chunkQuery.trim().toLowerCase();
    if (!q) return chunks;
    return chunks.filter((c) => c.content.toLowerCase().includes(q));
  }, [chunks, chunkQuery]);

  if (error) return <div className="alert">{error}</div>;
  if (!chunks) return <p className="muted">Loading chunks…</p>;
  if (chunks.length === 0) return <p className="muted">No chunks indexed for this document.</p>;

  return (
    <div className="chunk-inspector">
      <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <strong><FiLayers style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {doc?.title || doc?.sourceRef || 'Document Chunks'}</strong>
          <span className="muted small" style={{ marginLeft: '8px' }}>({filteredChunks.length} of {chunks.length} chunks)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="search-box" style={{ padding: '4px 10px' }}>
            <FiSearch style={{ fontSize: 13 }} />
            <input
              placeholder="Search text in chunks…"
              value={chunkQuery}
              onChange={(e) => setChunkQuery(e.target.value)}
              style={{ fontSize: 12.5 }}
            />
          </div>
          {doc?.sourceRef && doc.sourceType === 'url' && (
            <a
              href={doc.sourceRef}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary btn-tiny"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
            >
              <FiExternalLink /> Visit URL
            </a>
          )}
        </div>
      </div>
      {filteredChunks.length === 0 ? (
        <p className="muted small" style={{ padding: '8px 0' }}>No chunks match "{chunkQuery}".</p>
      ) : (
        filteredChunks.map((c, i) => <ChunkRow key={c.id} chunk={c} index={i} />)
      )}
    </div>
  );
}
