import { FiCode, FiCopy, FiCheck } from 'react-icons/fi';
import type { DocumentDTO } from '../../shared';
import Card from '../ui/Card';

interface ScopeTabProps {
  allTags: string[];
  tagScopedSnippet: string;
  tagCopied: boolean;
  onCopyTag: () => void;
  documents: DocumentDTO[];
  selectedDocId: string;
  setSelectedDocId: (id: string) => void;
  docScopedSnippet: string;
  docCopied: boolean;
  onCopyDoc: () => void;
}

export default function ScopeTab({
  allTags,
  tagScopedSnippet,
  tagCopied,
  onCopyTag,
  documents,
  selectedDocId,
  setSelectedDocId,
  docScopedSnippet,
  docCopied,
  onCopyDoc,
}: ScopeTabProps) {
  return (
    <Card icon={<FiCode />} title="Scope to a topic or page (optional)">
      <p className="muted small">
        By default the widget answers from your whole knowledge base. Add one of these attributes to a specific
        page's embed to narrow that — e.g. only answer from documents tagged "buying" on your buying-guide pages,
        "selling" on your selling pages, and so on. A document tagged with several of these is included in every
        matching scope. Only set one attribute per embed.
      </p>
      <label className="muted small">By tag — every document carrying that tag{allTags.length > 0 ? ` (you have: ${allTags.join(', ')})` : ''}</label>
      <pre className="embed-snippet">{tagScopedSnippet}</pre>
      <button className="btn-secondary btn-tiny" onClick={onCopyTag}>
        {tagCopied ? <><FiCheck /> Copied!</> : <><FiCopy /> Copy</>}
      </button>
      <label className="muted small" style={{ marginTop: 8 }}>By document — one specific document only</label>
      {documents.length > 0 ? (
        <select value={selectedDocId} onChange={(e) => setSelectedDocId(e.target.value)}>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.title ?? d.sourceRef ?? d.id}</option>
          ))}
        </select>
      ) : (
        <p className="muted small">No documents yet — add one in Content first, then come back here to pick it.</p>
      )}
      <pre className="embed-snippet">{docScopedSnippet}</pre>
      <button className="btn-secondary btn-tiny" onClick={onCopyDoc}>
        {docCopied ? <><FiCheck /> Copied!</> : <><FiCopy /> Copy</>}
      </button>
    </Card>
  );
}
