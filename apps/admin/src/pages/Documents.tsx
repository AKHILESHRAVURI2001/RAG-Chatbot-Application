import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FiLink, FiUpload, FiFileText, FiEye, FiEyeOff, FiTrash2, FiDatabase, FiRefreshCw, FiSearch, FiTag, FiCheck, FiX, FiDownload, FiExternalLink, FiPause, FiPlay } from 'react-icons/fi';
import type { DocumentDTO, LlmSettings } from '../shared';
import { api } from '../lib/api';
import { useCan } from '../lib/authContext';
import ChunkInspector from '../components/ChunkInspector';
import { InlineSpinner } from '../components/ui/Spinner';
import Card from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import Toggle from '../components/ui/Toggle';
import { toast } from '../components/ui/Toast';
import { Badge } from '../components/ui';

interface UrlResult {
  url: string;
  status: 'success' | 'error';
  message?: string;
}

interface FileResult {
  name: string;
  status: 'success' | 'error';
  message?: string;
}

function parseTagsInput(raw: string): string[] {
  return Array.from(new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)));
}

const SOURCE_TYPES = [
  { id: 'url', label: 'Add from URL(s)', icon: FiLink },
  { id: 'file', label: 'Upload file(s)', icon: FiUpload },
  { id: 'text', label: 'Paste text', icon: FiFileText },
] as const;
type SourceType = (typeof SOURCE_TYPES)[number]['id'];

export default function Documents() {
  const can = useCan();
  const [sourceType, setSourceType] = useState<SourceType>('url');
  const [docs, setDocs] = useState<DocumentDTO[]>([]);
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlsText, setUrlsText] = useState('');
  const [urlTags, setUrlTags] = useState('');
  const [rechunkExisting, setRechunkExisting] = useState(true);
  const [urlResults, setUrlResults] = useState<UrlResult[]>([]);
  const [urlTotal, setUrlTotal] = useState<number | null>(null);
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [textTags, setTextTags] = useState('');
  const [fileTags, setFileTags] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [editTagsValue, setEditTagsValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [showBulkTags, setShowBulkTags] = useState(false);
  const [bulkTagsInput, setBulkTagsInput] = useState('');
  const [bulkTagsProgress, setBulkTagsProgress] = useState<{ done: number; total: number } | null>(null);

  async function refresh(tag = tagFilter) {
    const [documents, tags, s] = await Promise.all([
      api.listDocuments(tag || undefined),
      api.listAllTags(),
      api.getSettings().catch(() => null),
    ]);
    setDocs(documents);
    setAllTags(tags);
    if (s) setLlmSettings(s.llm);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function onTagFilterChange(tag: string) {
    setTagFilter(tag);
    setLoading(true);
    try {
      await refresh(tag);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        (d.title ?? '').toLowerCase().includes(q) ||
        (d.sourceRef ?? '').toLowerCase().includes(q) ||
        (d.sourceType ?? '').toLowerCase().includes(q) ||
        (d.status ?? '').toLowerCase().includes(q) ||
        (d.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [docs, search]);

  const selectedDocs = useMemo(() => filteredDocs.filter((d) => selectedIds.has(d.id)), [filteredDocs, selectedIds]);
  const allFilteredSelected = filteredDocs.length > 0 && filteredDocs.every((d) => selectedIds.has(d.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedDocs.length > 0 && !allFilteredSelected;
    }
  }, [selectedDocs.length, allFilteredSelected]);

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredDocs.forEach((d) => next.delete(d.id));
        return next;
      }
      const next = new Set(prev);
      filteredDocs.forEach((d) => next.add(d.id));
      return next;
    });
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    if (selectedDocs.length === 0) return;
    if (!confirm(`Delete ${selectedDocs.length} document(s) and all their indexed content? This cannot be undone.`)) return;
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const d of selectedDocs) {
      try {
        await api.deleteDocument(d.id);
        ok++;
      } catch {
        failed++;
      }
    }
    await refresh();
    clearSelection();
    setBulkBusy(false);
    if (failed === 0) toast.success(`Deleted ${ok} document(s).`);
    else toast.error(`Deleted ${ok}, failed to delete ${failed}.`);
  }

  async function bulkSetPaused(paused: boolean) {
    const targets = selectedDocs.filter((d) => (paused ? d.status === 'ready' : d.status === 'paused'));
    if (targets.length === 0) {
      toast.info(paused ? 'None of the selected documents are ready to pause.' : 'None of the selected documents are paused.');
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const d of targets) {
      try {
        await api.setDocumentPaused(d.id, paused);
        ok++;
      } catch {
        failed++;
      }
    }
    await refresh();
    setBulkBusy(false);
    const verb = paused ? 'Paused' : 'Resumed';
    if (failed === 0) toast.success(`${verb} ${ok} document(s).`);
    else toast.error(`${verb} ${ok}, failed on ${failed}.`);
  }

  async function bulkRecheck() {
    const targets = selectedDocs.filter((d) => d.sourceType === 'url');
    if (targets.length === 0) {
      toast.info('None of the selected documents are URL sources.');
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const d of targets) {
      try {
        await api.recheckDocument(d.id);
        ok++;
      } catch {
        failed++;
      }
    }
    await refresh();
    setBulkBusy(false);
    if (failed === 0) toast.success(`Re-checked ${ok} document(s).`);
    else toast.error(`Re-checked ${ok}, failed on ${failed}.`);
  }

  async function bulkDownload() {
    const targets = selectedDocs.filter((d) => (d.status === 'ready' || d.status === 'paused') && (d.chunkCount ?? 0) > 0);
    if (targets.length === 0) {
      toast.info('None of the selected documents have embeddings to download.');
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const d of targets) {
      try {
        await api.exportDocumentEmbeddings(d.id, d.title ?? d.id);
        ok++;
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    if (failed === 0) toast.success(`Downloaded ${ok} file(s).`);
    else toast.error(`Downloaded ${ok}, failed on ${failed}.`);
  }

  async function runBulkTagsUpdate(compute: (currentTags: string[], inputTags: string[]) => string[]) {
    const inputTags = parseTagsInput(bulkTagsInput);
    if (inputTags.length === 0) {
      toast.error('Type at least one tag first.');
      return;
    }
    const targets = selectedDocs;
    if (targets.length === 0) return;
    setBulkBusy(true);
    setBulkTagsProgress({ done: 0, total: targets.length });
    let ok = 0;
    let failed = 0;
    for (const d of targets) {
      try {
        const updated = await api.setDocumentTags(d.id, compute(d.tags, inputTags));
        // Applied one document at a time — reflect each update in the table
        // immediately instead of waiting for the whole batch to finish.
        setDocs((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        ok++;
      } catch {
        failed++;
      }
      setBulkTagsProgress({ done: ok + failed, total: targets.length });
    }
    await refresh();
    setBulkBusy(false);
    setBulkTagsProgress(null);
    setBulkTagsInput('');
    setShowBulkTags(false);
    if (failed === 0) toast.success(`Updated tags on ${ok} document(s).`);
    else toast.error(`Updated ${ok}, failed on ${failed}.`);
  }

  const bulkTagsAdd = () =>
    runBulkTagsUpdate((current, input) => Array.from(new Set([...current, ...input])));
  const bulkTagsRemove = () =>
    runBulkTagsUpdate((current, input) => current.filter((t) => !input.includes(t)));
  const bulkTagsReplace = () => runBulkTagsUpdate((_current, input) => input);

  async function addUrls(e: FormEvent) {
    e.preventDefault();
    const rawLines = Array.from(new Set(urlsText.split('\n').map((u) => u.trim()).filter(Boolean)));
    if (rawLines.length === 0) return;
    const tags = parseTagsInput(urlTags);
    setBusy(true);
    setError(null);
    setUrlResults([]);
    setUrlTotal(null);

    const results: UrlResult[] = [];

    // Any line pointing at a sitemap.xml is expanded into every page URL it
    // lists (one level of nested sitemap indexes too), so a single sitemap
    // link crawls its whole site the same one-by-one way as a pasted list.
    const expanded: string[] = [];
    for (const line of rawLines) {
      if (/\.xml(\?.*)?$/i.test(line)) {
        try {
          const { urls: sitemapUrls } = await api.fetchSitemapUrls(line);
          expanded.push(...sitemapUrls);
          toast.info(`Found ${sitemapUrls.length} URL${sitemapUrls.length === 1 ? '' : 's'} in sitemap.`);
        } catch (err: any) {
          results.push({ url: line, status: 'error', message: err.message ?? 'Failed to read sitemap' });
          setUrlResults([...results]);
        }
      } else {
        expanded.push(line);
      }
    }
    const urls = Array.from(new Set(expanded));
    if (urls.length === 0) {
      setBusy(false);
      return;
    }
    setUrlTotal(urls.length);
    for (const url of urls) {
      try {
        await api.ingestUrl(url, tags, {
          rechunkIfExists: rechunkExisting,
          skipIfExists: !rechunkExisting,
        });
        results.push({ url, status: 'success' });
      } catch (err: any) {
        results.push({ url, status: 'error', message: err.message });
      }
      setUrlResults([...results]);
    }
    setUrlsText('');
    setUrlTags('');
    await refresh();
    setBusy(false);
  }

  async function addText(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.ingestText(textTitle, textBody, parseTagsInput(textTags));
      setTextTitle('');
      setTextBody('');
      setTextTags('');
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function onSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFiles(Array.from(e.target.files ?? []));
    setFileResults([]);
  }

  async function uploadFiles() {
    if (selectedFiles.length === 0) return;
    const tags = parseTagsInput(fileTags);
    setBusy(true);
    setError(null);
    setFileResults([]);
    const results: FileResult[] = [];
    for (const file of selectedFiles) {
      try {
        await api.ingestFile(file, tags);
        results.push({ name: file.name, status: 'success' });
      } catch (err: any) {
        results.push({ name: file.name, status: 'error', message: err.message });
      }
      setFileResults([...results]);
    }
    await refresh();
    setBusy(false);
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function startEditTags(d: DocumentDTO) {
    setEditingTagsId(d.id);
    setEditTagsValue(d.tags.join(', '));
  }

  async function saveTags(id: string) {
    setError(null);
    try {
      await api.setDocumentTags(id, parseTagsInput(editTagsValue));
      setEditingTagsId(null);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this document and all its indexed content? This cannot be undone.')) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteDocument(id);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function recheck(id: string) {
    setRecheckingId(id);
    setError(null);
    try {
      await api.recheckDocument(id);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecheckingId(null);
    }
  }

  async function togglePause(d: DocumentDTO) {
    setPausingId(d.id);
    setError(null);
    try {
      await api.setDocumentPaused(d.id, d.status !== 'paused');
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPausingId(null);
    }
  }

  async function exportEmbeddings(d: DocumentDTO) {
    setExportingId(d.id);
    setError(null);
    try {
      await api.exportDocumentEmbeddings(d.id, d.title ?? d.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExportingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Knowledge sources"
        description="Feed the bot with content from one or more URLs, an uploaded file, or pasted text. Everything is chunked and embedded automatically for vector search."
      />
      
      <div style={{ marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>Knowledge Base Document Vector Search</span>
                <Badge variant="indigo">📚 Vector Knowledge RAG Search</Badge>
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                <strong>How it searches:</strong> Splits uploaded files and URLs into chunks, generates 384d vector embeddings (HNSW index in Postgres), and retrieves top matching passages to feed the AI generator.
              </div>
            </div>
          </div>
        </Card>
      </div>

      {error && <div className="alert">{error}</div>}

      <div style={{ marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>Enable Document Vector Search</div>
              <div className="muted small" style={{ marginTop: 2 }}>
                When ON: Uploaded documents, URLs, and text content are searched for relevant vector chunks to build AI context.
              </div>
            </div>
            <Toggle
              disabled={!can('settings.edit')}
              checked={llmSettings?.enableDocumentSearch !== false}
              onChange={async (v) => {
                if (!llmSettings) return;
                const updated = { ...llmSettings, enableDocumentSearch: v };
                setLlmSettings(updated);
                try {
                  await api.updateLlm(updated);
                  toast.success(v ? 'Document vector search enabled for chat!' : 'Document vector search disabled for chat.');
                } catch (e: any) {
                  toast.error(e.message ?? 'Failed to update document search setting.');
                }
              }}
            />
          </div>
        </Card>
      </div>

      {can('documents.create') && (
        <div className="settings-tabs">
          {SOURCE_TYPES.map((t) => (
            <button key={t.id} className={`settings-tab ${sourceType === t.id ? 'active' : ''}`} onClick={() => setSourceType(t.id)}>
              <t.icon /> {t.label}
            </button>
          ))}
        </div>
      )}

      {can('documents.create') && sourceType === 'url' && (
        <Card icon={<FiLink />} title="Add from URL(s)" onSubmit={addUrls}>
          <textarea
            rows={3}
            placeholder={'https://example.com/faq\nhttps://example.com/pricing\nhttps://example.com/sitemap.xml\n(one URL per line — a sitemap.xml link is expanded into every page it lists)'}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            required
          />
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Paste a sitemap.xml link and every page it lists is crawled one by one automatically.
          </p>
          <input
            placeholder="Tags (comma-separated, optional) — e.g. pricing, faq"
            value={urlTags}
            onChange={(e) => setUrlTags(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', margin: '4px 0 8px 0', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={rechunkExisting}
              onChange={(e) => setRechunkExisting(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span>Re-index & update if URL already exists (uncheck to skip duplicates)</span>
          </label>
          <button className="btn-primary" disabled={busy}><FiLink /> Crawl & index</button>
          {urlTotal !== null && (
            <p className="muted small" style={{ marginTop: 8 }}>
              {urlResults.length < urlTotal
                ? <><InlineSpinner /> Indexing {urlResults.length} of {urlTotal}…</>
                : `Done — ${urlTotal} URL${urlTotal === 1 ? '' : 's'} processed.`}
            </p>
          )}
          {urlResults.length > 0 && (
            <ul className="url-result-list">
              {urlResults.map((r) => (
                <li key={r.url} className={r.status}>
                  {r.status === 'success' ? '✓' : '✗'} {r.url}
                  {r.message && <span className="muted small"> — {r.message}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {can('documents.create') && sourceType === 'file' && (
        <Card icon={<FiUpload />} title="Upload file(s)">
          <p className="muted">.txt, .md, .pdf, .docx, .csv, .json, .yml, .yaml, .log, .html, .xml — select multiple to add them all at once, one at a time.</p>
          <input
            placeholder="Tags (comma-separated, optional)"
            value={fileTags}
            onChange={(e) => setFileTags(e.target.value)}
          />
          <input ref={fileInputRef} type="file" multiple onChange={onSelectFiles} disabled={busy} />
          {selectedFiles.length > 0 && (
            <ul className="url-result-list">
              {selectedFiles.map((f, i) => (
                <li key={`${f.name}-${i}`}>{f.name}</li>
              ))}
            </ul>
          )}
          <button className="btn-primary" onClick={uploadFiles} disabled={busy || selectedFiles.length === 0} style={{ marginTop: 8 }}>
            <FiUpload /> Upload {selectedFiles.length > 0 ? `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}` : 'file(s)'}
          </button>
          {fileResults.length > 0 && (
            <ul className="url-result-list">
              {fileResults.map((r, i) => (
                <li key={`${r.name}-${i}`} className={r.status}>
                  {r.status === 'success' ? '✓' : '✗'} {r.name}
                  {r.message && <span className="muted small"> — {r.message}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {can('documents.create') && sourceType === 'text' && (
        <Card icon={<FiFileText />} title="Paste text" onSubmit={addText}>
          <input placeholder="Title" value={textTitle} onChange={(e) => setTextTitle(e.target.value)} required />
          <textarea rows={4} placeholder="Paste any policy, product info, etc." value={textBody} onChange={(e) => setTextBody(e.target.value)} required />
          <input
            placeholder="Tags (comma-separated, optional)"
            value={textTags}
            onChange={(e) => setTextTags(e.target.value)}
          />
          <button className="btn-primary" disabled={busy}><FiFileText /> Index text</button>
        </Card>
      )}

      <div className="row-gap" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3><FiDatabase /> Indexed documents</h3>
        <div className="row-gap" style={{ alignItems: 'center' }}>
          <div className="search-box">
            <FiTag />
            <select value={tagFilter} onChange={(e) => onTagFilterChange(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="search-box">
            <FiSearch />
            <input placeholder="Search by title, URL, tags, type or status…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div
          style={{
            background: '#eef2ff',
            border: '1px solid #c7d2fe',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
          }}
        >
          <div className="row-gap" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{selectedDocs.length} selected</span>
            <div className="row-gap" style={{ alignItems: 'center' }}>
              {can('documents.edit') && (
                <>
                  <button className="btn-secondary btn-tiny" onClick={() => bulkSetPaused(true)} disabled={bulkBusy}><FiPause /> Pause</button>
                  <button className="btn-secondary btn-tiny" onClick={() => bulkSetPaused(false)} disabled={bulkBusy}><FiPlay /> Resume</button>
                  <button className="btn-secondary btn-tiny" onClick={bulkRecheck} disabled={bulkBusy}><FiRefreshCw /> Re-check</button>
                </>
              )}
              {can('documents.export') && (
                <button className="btn-secondary btn-tiny" onClick={bulkDownload} disabled={bulkBusy}><FiDownload /> Download</button>
              )}
              {can('documents.edit') && (
                <button className="btn-secondary btn-tiny" onClick={() => setShowBulkTags((v) => !v)} disabled={bulkBusy}><FiTag /> Tags</button>
              )}
              {can('documents.delete') && (
                <button className="btn-danger btn-tiny" onClick={bulkDelete} disabled={bulkBusy}><FiTrash2 /> Delete</button>
              )}
              <button className="btn-secondary btn-tiny" onClick={clearSelection} disabled={bulkBusy}><FiX /> Clear</button>
            </div>
          </div>
          {showBulkTags && (
            <div className="row-gap" style={{ alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #c7d2fe' }}>
              <input
                autoFocus
                placeholder="tag1, tag2"
                value={bulkTagsInput}
                onChange={(e) => setBulkTagsInput(e.target.value)}
                style={{ flex: 1, minWidth: 160 }}
              />
              <button className="btn-secondary btn-tiny" onClick={bulkTagsAdd} disabled={bulkBusy}>Add to selected</button>
              <button className="btn-secondary btn-tiny" onClick={bulkTagsRemove} disabled={bulkBusy}>Remove from selected</button>
              <button className="btn-secondary btn-tiny" onClick={bulkTagsReplace} disabled={bulkBusy}>Replace all tags</button>
              {bulkTagsProgress && (
                <span className="muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <InlineSpinner /> Updating {bulkTagsProgress.done} of {bulkTagsProgress.total}…
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '1%' }}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  style={{ width: 'auto', margin: 0 }}
                />
              </th>
              <th>Title / source</th><th>Type</th><th>Tags</th><th>Status</th><th>Chunks</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}><InlineSpinner label="Loading documents…" /></td></tr>
            ) : (
              <>
                {filteredDocs.map((d) => (
                  <Fragment key={d.id}>
                    <tr>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(d.id)}
                          onChange={() => toggleSelectOne(d.id)}
                          style={{ width: 'auto', margin: 0 }}
                        />
                      </td>
                      <td className="doc-title-cell" title={d.title ?? d.sourceRef ?? ''}>
                        <div style={{ fontWeight: 500 }}>{d.title ?? d.sourceRef ?? '(untitled)'}</div>
                        {d.sourceRef && d.sourceType === 'url' && (
                          <a
                            href={d.sourceRef}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="doc-source-link muted small"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px', wordBreak: 'break-all', textDecoration: 'underline' }}
                            title={d.sourceRef}
                          >
                            <FiExternalLink /> {d.sourceRef}
                          </a>
                        )}
                        {d.sourceRef && d.sourceType !== 'url' && (
                          <div className="muted small" style={{ marginTop: '2px' }}>{d.sourceRef}</div>
                        )}
                      </td>
                      <td className="doc-type-cell">{d.sourceType}</td>
                      <td className="doc-tags-cell">
                        {editingTagsId === d.id ? (
                          <div className="row-gap" style={{ alignItems: 'center' }}>
                            <input
                              autoFocus
                              value={editTagsValue}
                              placeholder="tag1, tag2"
                              onChange={(e) => setEditTagsValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveTags(d.id);
                                if (e.key === 'Escape') setEditingTagsId(null);
                              }}
                            />
                            <button className="btn-secondary" onClick={() => saveTags(d.id)} title="Save"><FiCheck /></button>
                            <button className="btn-secondary" onClick={() => setEditingTagsId(null)} title="Cancel"><FiX /></button>
                          </div>
                        ) : (
                          <span className="tag-list" onClick={can('documents.edit') ? () => startEditTags(d) : undefined} title={can('documents.edit') ? 'Click to edit tags' : undefined}>
                            {d.tags.length > 0 ? (
                              d.tags.map((t) => <span key={t} className="tag-badge">{t}</span>)
                            ) : (
                              <span className="muted small"><FiTag /> add tags</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="doc-status-cell">
                        <span className={`badge badge-${d.status}`}>{d.status}</span>
                        {d.error && <div className="muted small">{d.error}</div>}
                      </td>
                      <td className="doc-chunks-cell">{d.chunkCount ?? 0}</td>
                      <td className="doc-actions-cell">
                        <div className="table-actions">
                          {(d.status === 'ready' || d.status === 'paused') && (d.chunkCount ?? 0) > 0 && (
                            <button
                              className="btn-icon btn-secondary"
                              onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                              title={expandedId === d.id ? 'Hide chunks' : 'View chunks'}
                            >
                              {expandedId === d.id ? <FiEyeOff /> : <FiEye />}
                            </button>
                          )}
                          {can('documents.export') && (d.status === 'ready' || d.status === 'paused') && (d.chunkCount ?? 0) > 0 && (
                            <button
                              className="btn-icon btn-secondary"
                              onClick={() => exportEmbeddings(d)}
                              disabled={exportingId === d.id}
                              title={exportingId === d.id ? 'Preparing download…' : 'Download embeddings (.json)'}
                            >
                              <FiDownload />
                            </button>
                          )}
                          {can('documents.edit') && d.sourceType === 'url' && (
                            <button
                              className="btn-icon btn-secondary"
                              onClick={() => recheck(d.id)}
                              disabled={recheckingId === d.id}
                              title={recheckingId === d.id ? 'Re-checking…' : 'Re-check'}
                            >
                              <FiRefreshCw className={recheckingId === d.id ? 'spin' : ''} />
                            </button>
                          )}
                          {can('documents.edit') && (d.status === 'ready' || d.status === 'paused') && (
                            <button
                              className="btn-icon btn-secondary"
                              onClick={() => togglePause(d)}
                              disabled={pausingId === d.id}
                              title={
                                d.status === 'paused'
                                  ? 'Resume — include this document in search again'
                                  : 'Pause — exclude this document from search without deleting it'
                              }
                            >
                              {d.status === 'paused' ? <FiPlay /> : <FiPause />}
                            </button>
                          )}
                          {can('documents.delete') && (
                            <button
                              className="btn-icon btn-danger"
                              onClick={() => remove(d.id)}
                              disabled={deletingId === d.id}
                              title={deletingId === d.id ? 'Deleting…' : 'Delete'}
                            >
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === d.id && (
                      <tr>
                        <td colSpan={7}>
                          <ChunkInspector documentId={d.id} doc={d} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {filteredDocs.length === 0 && (
                  <tr><td colSpan={7} className="muted">{docs.length === 0 ? 'No documents yet — add one above.' : 'No documents match your search.'}</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
