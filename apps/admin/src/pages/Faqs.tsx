import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiDownload, FiUpload, FiHelpCircle, FiX } from 'react-icons/fi';
import type { FaqDTO, LlmSettings } from '../shared';
import { api } from '../lib/api';
import { useCan } from '../lib/authContext';
import { InlineSpinner } from '../components/ui/Spinner';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import Toggle from '../components/ui/Toggle';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { toast } from '../components/ui/Toast';
import { FormField, FormInput, FormTextarea } from '../components/ui/FormField';
import { Badge } from '../components/ui';

function parseFaqCsv(text: string): { question: string; answer: string }[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const first = nonEmpty[0];
  const looksLikeHeader = first && /question/i.test(first[0] ?? '') && /answer/i.test(first[1] ?? '');
  const dataRows = looksLikeHeader ? nonEmpty.slice(1) : nonEmpty;
  return dataRows.map((r) => ({ question: (r[0] ?? '').trim(), answer: (r[1] ?? '').trim() }));
}

export default function Faqs() {
  const can = useCan();
  const [faqs, setFaqs] = useState<FaqDTO[]>([]);
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [faqList, s] = await Promise.all([api.listFaqs(), api.getSettings().catch(() => null)]);
    setFaqs(faqList);
    if (s) setLlmSettings(s.llm);
  }

  const selectedFaqs = faqs.filter((f) => selectedIds.has(f.id));
  const allSelected = faqs.length > 0 && faqs.every((f) => selectedIds.has(f.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedFaqs.length > 0 && !allSelected;
    }
  }, [selectedFaqs.length, allSelected]);

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(faqs.map((f) => f.id)));
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selectedFaqs.length === 0) return;
    if (!confirm(`Delete ${selectedFaqs.length} FAQ(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const f of selectedFaqs) {
      try {
        await api.deleteFaq(f.id);
        ok++;
      } catch {
        failed++;
      }
    }
    await refresh();
    setSelectedIds(new Set());
    setBulkBusy(false);
    if (failed === 0) toast.success(`Deleted ${ok} FAQ(s).`);
    else toast.error(`Deleted ${ok}, failed to delete ${failed}.`);
  }

  useEffect(() => {
    refresh()
      .catch((e) => toast.error(e.message ?? 'Failed to load FAQs.'))
      .finally(() => setLoading(false));
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('newQuestion');
    const a = searchParams.get('newAnswer');
    if (q) {
      setEditingId(null);
      setQuestion(q);
      setAnswer(a ?? '');
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  function openAdd() {
    setEditingId(null);
    setQuestion('');
    setAnswer('');
    setModalOpen(true);
  }

  function openEdit(f: FaqDTO) {
    setEditingId(f.id);
    setQuestion(f.question);
    setAnswer(f.answer);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await api.updateFaq(editingId, question, answer, true);
        toast.success('FAQ updated successfully.');
      } else {
        await api.createFaq(question, answer);
        toast.success('FAQ created successfully.');
      }
      setModalOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save FAQ.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this FAQ?')) return;
    setDeletingId(id);
    try {
      await api.deleteFaq(id);
      toast.success('FAQ deleted.');
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete FAQ.');
    } finally {
      setDeletingId(null);
    }
  }

  async function importSeed() {
    setBusy(true);
    try {
      const { created, skipped } = await api.importSeedFaqs();
      toast.success(`Imported ${created.length} FAQ(s)${skipped > 0 ? `, skipped ${skipped} blank entries` : ''}.`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to import starter FAQs.');
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseFaqCsv(text);
      if (rows.length === 0) {
        toast.error('No rows found in that file — expected two columns: question, answer.');
        return;
      }
      const { created, skipped } = await api.importFaqs(rows);
      toast.success(`Imported ${created.length} FAQ(s) from ${file.name}${skipped > 0 ? `, skipped ${skipped} with a blank question/answer` : ''}.`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to import FAQs from CSV.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Hardcoded FAQs"
        description="These are matched by meaning (not just exact text) before any AI call is made — fast, free, and always consistent."
        actions={
          <>
            {can('faqs.create') && <button className="btn-primary" onClick={openAdd}><FiPlus /> Add FAQ</button>}
            {can('faqs.create') && (
              <>
                <button className="btn-secondary" onClick={() => csvInputRef.current?.click()} disabled={busy}>
                  <FiUpload /> Import CSV
                </button>
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: 'none' }} />
                <button className="btn-secondary" onClick={importSeed} disabled={busy}><FiDownload /> Starter FAQs</button>
              </>
            )}
          </>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>Enable Hardcoded FAQs Matching</span>
                <Badge variant="info">🔍 Exact & Hybrid Vector Match</Badge>
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                <strong>How it searches:</strong> Matches visitor questions against hardcoded FAQs using exact text match and vector embedding similarity ($0 token cost).
              </div>
            </div>
            <Toggle
              disabled={!can('settings.edit')}
              checked={llmSettings?.enableFaqs !== false}
              onChange={async (v) => {
                if (!llmSettings) return;
                const updated = { ...llmSettings, enableFaqs: v };
                setLlmSettings(updated);
                try {
                  await api.updateLlm(updated);
                  toast.success(v ? 'FAQs matching enabled for chat!' : 'FAQs matching disabled for chat.');
                } catch (e: any) {
                  toast.error(e.message ?? 'Failed to update FAQ setting.');
                }
              }}
            />
          </div>
        </Card>
      </div>

      {modalOpen && (
        <Modal icon={<FiHelpCircle />} title={editingId ? 'Edit FAQ' : 'Add FAQ'} onClose={closeModal}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <FormField label="Question">
              <FormInput
                placeholder="Enter the question..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                required
                autoFocus
              />
            </FormField>

            <FormField label="Answer">
              <FormTextarea
                rows={4}
                placeholder="Enter the detailed answer..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
              />
            </FormField>

            <div className="row-gap" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={closeModal}><FiX /> Cancel</button>
              <button className="btn-primary" disabled={busy}>{editingId ? <><FiEdit2 /> Save FAQ</> : <><FiPlus /> Add FAQ</>}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedIds.size > 0 && (
        <div
          className="row-gap"
          style={{
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#eef2ff',
            border: '1px solid #c7d2fe',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{selectedFaqs.length} selected</span>
          <div className="row-gap" style={{ alignItems: 'center' }}>
            {can('faqs.delete') && <button className="btn-danger btn-tiny" onClick={bulkDelete} disabled={bulkBusy}><FiTrash2 /> Delete</button>}
            <button className="btn-secondary btn-tiny" onClick={() => setSelectedIds(new Set())} disabled={bulkBusy}><FiX /> Clear</button>
          </div>
        </div>
      )}

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell style={{ width: '1%' }}>
                <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ width: 'auto', margin: 0 }} />
              </TableHeaderCell>
              <TableHeaderCell style={{ width: '32%' }}>Question</TableHeaderCell>
              <TableHeaderCell>Answer</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4}><InlineSpinner label="Loading FAQs…" /></TableCell></TableRow>
            ) : (
              <>
                {faqs.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelectOne(f.id)} style={{ width: 'auto', margin: 0 }} />
                    </TableCell>
                    <TableCell>{f.question}</TableCell>
                    <TableCell>{f.answer}</TableCell>
                    <TableCell>
                      <div className="table-actions">
                        {can('faqs.edit') && (
                          <button className="btn-icon btn-secondary" title="Edit" aria-label="Edit" onClick={() => openEdit(f)} disabled={deletingId === f.id}>
                            <FiEdit2 />
                          </button>
                        )}
                        {can('faqs.delete') && (
                          <button
                            className="btn-icon btn-danger"
                            title={deletingId === f.id ? 'Deleting…' : 'Delete'}
                            aria-label="Delete"
                            onClick={() => remove(f.id)}
                            disabled={deletingId === f.id}
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {faqs.length === 0 && <TableRow><TableCell colSpan={4} className="muted">No FAQs yet.</TableCell></TableRow>}
              </>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
