import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSlash, FiX } from 'react-icons/fi';
import type { RestrictedWordDTO, LlmSettings } from '../shared';
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

export default function RestrictedWords() {
  const can = useCan();
  const [items, setItems] = useState<RestrictedWordDTO[]>([]);
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [phrase, setPhrase] = useState('');
  const [response, setResponse] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [list, settings] = await Promise.all([
      api.listRestrictedWords(),
      api.getSettings().catch(() => null),
    ]);
    setItems(list);
    if (settings) setLlmSettings(settings.llm);
  }

  const selectedItems = items.filter((i) => selectedIds.has(i.id));
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedItems.length > 0 && !allSelected;
    }
  }, [selectedItems.length, allSelected]);

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((i) => i.id)));
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
    if (selectedItems.length === 0) return;
    if (!confirm(`Delete ${selectedItems.length} restricted word(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const item of selectedItems) {
      try {
        await api.deleteRestrictedWord(item.id);
        ok++;
      } catch {
        failed++;
      }
    }
    await refresh();
    setSelectedIds(new Set());
    setBulkBusy(false);
    if (failed === 0) toast.success(`Deleted ${ok} restricted word(s).`);
    else toast.error(`Deleted ${ok}, failed to delete ${failed}.`);
  }

  useEffect(() => {
    refresh()
      .catch((e) => toast.error(e.message ?? 'Failed to load restricted words.'))
      .finally(() => setLoading(false));
  }, []);

  function openAdd() {
    setEditingId(null);
    setPhrase('');
    setResponse('');
    setIsActive(true);
    setModalOpen(true);
  }

  function openEdit(item: RestrictedWordDTO) {
    setEditingId(item.id);
    setPhrase(item.phrase);
    setResponse(item.response);
    setIsActive(item.isActive);
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
        await api.updateRestrictedWord(editingId, { phrase, response, isActive });
        toast.success('Restricted word rule updated successfully.');
      } else {
        await api.createRestrictedWord(phrase, response, isActive);
        toast.success('Restricted word rule created successfully.');
      }
      setModalOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save restricted word rule.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this restricted word rule?')) return;
    setDeletingId(id);
    try {
      await api.deleteRestrictedWord(id);
      toast.success('Restricted word rule deleted.');
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete restricted word rule.');
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActiveStatus(item: RestrictedWordDTO) {
    try {
      await api.updateRestrictedWord(item.id, { isActive: !item.isActive });
      toast.success(item.isActive ? `Disabled rule for "${item.phrase}"` : `Enabled rule for "${item.phrase}"`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update rule status.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Restricted Words"
        description="Define words or phrases that trigger an instant canned response whenever matched anywhere in a user's message (full text substring search, $0 LLM cost)."
        actions={
          can('words.create') ? (
            <button className="btn-primary" onClick={openAdd}>
              <FiPlus /> Add Restricted Word
            </button>
          ) : undefined
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>Enable Restricted Words Intercept</span>
                <Badge variant="danger">🔤 Substring / Word Match</Badge>
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                <strong>How it searches:</strong> Matches user message text against active forbidden phrases using full-text substring filtering before FAQs or AI generation ($0 token cost).
              </div>
            </div>
            <Toggle
              disabled={!can('settings.edit')}
              checked={llmSettings?.enableRestrictedWords !== false}
              onChange={async (v) => {
                if (!llmSettings) return;
                const updated = { ...llmSettings, enableRestrictedWords: v };
                setLlmSettings(updated);
                try {
                  await api.updateLlm(updated);
                  toast.success(v ? 'Restricted words intercept enabled for chat!' : 'Restricted words intercept disabled for chat.');
                } catch (e: any) {
                  toast.error(e.message ?? 'Failed to update Restricted Words setting.');
                }
              }}
            />
          </div>
        </Card>
      </div>

      {modalOpen && (
        <Modal icon={<FiSlash />} title={editingId ? 'Edit Restricted Word' : 'Add Restricted Word'} onClose={closeModal}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <FormField label="Restricted Word / Phrase">
              <FormInput
                placeholder="e.g., refund, password, secret, forbidden"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                required
                autoFocus
              />
              <div className="muted small" style={{ marginTop: 2 }}>
                Searched anywhere inside the visitor's full message text (case-insensitive substring match).
              </div>
            </FormField>

            <FormField label="Auto Response Message">
              <FormTextarea
                rows={4}
                placeholder="Enter the canned response to send when this word or phrase is matched..."
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                required
              />
            </FormField>

            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Toggle checked={isActive} onChange={setIsActive} />
              <span style={{ fontSize: 14 }}>Enable this restricted word rule</span>
            </div>

            <div className="row-gap" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={closeModal}><FiX /> Cancel</button>
              <button className="btn-primary" disabled={busy}>{editingId ? <><FiEdit2 /> Save Rule</> : <><FiPlus /> Add Rule</>}</button>
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
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{selectedItems.length} selected</span>
          <div className="row-gap" style={{ alignItems: 'center' }}>
            {can('words.delete') && <button className="btn-danger btn-tiny" onClick={bulkDelete} disabled={bulkBusy}><FiTrash2 /> Delete</button>}
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
              <TableHeaderCell style={{ width: '25%' }}>Restricted Phrase</TableHeaderCell>
              <TableHeaderCell>Auto Response Message</TableHeaderCell>
              <TableHeaderCell style={{ width: '12%' }}>Status</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5}><InlineSpinner label="Loading restricted words…" /></TableCell></TableRow>
            ) : (
              <>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelectOne(item.id)} style={{ width: 'auto', margin: 0 }} />
                    </TableCell>
                    <TableCell>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 4 }}>
                        {item.phrase}
                      </span>
                    </TableCell>
                    <TableCell>{item.response}</TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Toggle checked={item.isActive} onChange={() => toggleActiveStatus(item)} disabled={!can('words.edit')} />
                        <span className="small muted">{item.isActive ? 'Active' : 'Disabled'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="table-actions">
                        {can('words.edit') && (
                          <button className="btn-icon btn-secondary" title="Edit" aria-label="Edit" onClick={() => openEdit(item)} disabled={deletingId === item.id}>
                            <FiEdit2 />
                          </button>
                        )}
                        {can('words.delete') && (
                          <button
                            className="btn-icon btn-danger"
                            title={deletingId === item.id ? 'Deleting…' : 'Delete'}
                            aria-label="Delete"
                            onClick={() => remove(item.id)}
                            disabled={deletingId === item.id}
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && <TableRow><TableCell colSpan={5} className="muted">No restricted words configured yet.</TableCell></TableRow>}
              </>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
