import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiLayers, FiSearch, FiPlus, FiTrash2, FiEdit2, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';
import type { LlmSettings, QuestionChunkDTO } from '../shared';
import { api } from '../lib/api';
import { useCan } from '../lib/authContext';
import { PageSpinner } from '../components/ui/Spinner';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import Toggle from '../components/ui/Toggle';
import { toast } from '../components/ui/Toast';
import { FormField, FormInput, FormTextarea } from '../components/ui/FormField';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge, SearchInput } from '../components/ui';

export default function QuestionChunks() {
  const can = useCan();
  const [items, setItems] = useState<QuestionChunkDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuestionChunkDTO | null>(null);

  // Auto-store & matching toggle settings
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [autoStore, setAutoStore] = useState(false);
  const [togglingAutoStore, setTogglingAutoStore] = useState(false);
  const [enableMatching, setEnableMatching] = useState(true);
  const [togglingMatching, setTogglingMatching] = useState(false);

  // Form state
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.8);
  const [saving, setSaving] = useState(false);

  // Clear all confirmation
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('newQuestion');
    const a = searchParams.get('newAnswer');
    if (q) {
      setEditingItem(null);
      setQuestion(q);
      setAnswer(a ?? '');
      setSimilarityThreshold(0.8);
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  async function loadSettings() {
    try {
      const s = await api.getSettings();
      setLlmSettings(s.llm);
      setAutoStore(Boolean(s.llm.autoStoreQuestionChunks));
      setEnableMatching(s.llm.enableQuestionChunksMatching !== false);
    } catch {
      /* non-fatal fallback */
    }
  }

  async function handleToggleEnableMatching(checked: boolean) {
    if (!llmSettings) return;
    setTogglingMatching(true);
    try {
      const updated = await api.updateLlm({ ...llmSettings, enableQuestionChunksMatching: checked });
      setLlmSettings(updated);
      setEnableMatching(checked);
      toast.success(checked ? 'Question Chunks matching enabled for chat!' : 'Question Chunks matching disabled for chat.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update matching setting.');
    } finally {
      setTogglingMatching(false);
    }
  }

  async function handleToggleAutoStore(checked: boolean) {
    if (!llmSettings) return;
    setTogglingAutoStore(true);
    try {
      const updated = await api.updateLlm({ ...llmSettings, autoStoreQuestionChunks: checked });
      setLlmSettings(updated);
      setAutoStore(checked);
      toast.success(checked ? 'Auto-store enabled — LLM responses will now be saved as Question Chunks!' : 'Auto-store disabled.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update auto-store setting.');
    } finally {
      setTogglingAutoStore(false);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const res = await api.listQuestionChunks({ query: search, limit: 50 });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load question chunks.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
    loadData();
  }, [search]);

  function openCreateModal() {
    setEditingItem(null);
    setQuestion('');
    setAnswer('');
    setSimilarityThreshold(0.8);
    setModalOpen(true);
  }

  function openEditModal(item: QuestionChunkDTO) {
    setEditingItem(item);
    setQuestion(item.question);
    setAnswer(item.answer);
    setSimilarityThreshold(item.similarityThreshold);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) {
      toast.error('Question and Answer cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await api.updateQuestionChunk(editingItem.id, {
          question: question.trim(),
          answer: answer.trim(),
          similarityThreshold,
        });
        toast.success('Question chunk updated.');
      } else {
        await api.createQuestionChunk({
          question: question.trim(),
          answer: answer.trim(),
          similarityThreshold,
        });
        toast.success('Question chunk pair created.');
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save question chunk.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this pre-matched question pair?')) return;
    try {
      await api.deleteQuestionChunk(id);
      toast.success('Deleted successfully.');
      await loadData();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete item.');
    }
  }

  async function handleClearAll() {
    setClearing(true);
    try {
      const res = await api.clearAllQuestionChunks();
      toast.success(`Cleared ${res.count ?? 0} question chunk pair(s).`);
      setClearConfirmOpen(false);
      await loadData();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to clear items.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Question Chunks (1st Priority Match)"
        description="Pre-matched Question-Answer pairs that take 1st priority before LLM or full vector retrieval. High-confidence matches are served directly."
        actions={
          <>
            {items.length > 0 && can('chunks.clear') && (
              <button className="btn-secondary" onClick={() => setClearConfirmOpen(true)} style={{ color: '#ef4444' }}>
                <FiTrash2 /> Clear All
              </button>
            )}
            {can('chunks.create') && (
              <button className="btn-primary" onClick={openCreateModal}>
                <FiPlus /> Add Question Chunk
              </button>
            )}
          </>
        }
      />

      {/* Toggles Container */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
        <Card title="">
          <div className="toggle-card-row">
            <div className="toggle-card-main">
              <h4 style={{ margin: 0, fontWeight: 600, fontSize: 14.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16 }}>🎯</span> Consider Question Chunks in Chat Matching
                <Badge variant="success">⚡ Pure Vector Cosine Search</Badge>
              </h4>
              <p className="muted small" style={{ margin: '4px 0 0 0', lineHeight: 1.4 }}>
                <strong>How it searches:</strong> Evaluates visitor questions exclusively via 384d vector embedding cosine distance against registered Q&A thresholds.
              </p>
            </div>
            <div className="toggle-card-action">
              <Toggle
                checked={enableMatching}
                onChange={handleToggleEnableMatching}
                disabled={togglingMatching || !llmSettings || !can('settings.edit')}
              />
            </div>
          </div>
        </Card>

        <Card title="">
          <div className="toggle-card-row">
            <div className="toggle-card-main">
              <h4 style={{ margin: 0, fontWeight: 600, fontSize: 14.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>⚡</span> Auto-Store LLM Responses as Question Chunks
              </h4>
              <p className="muted small" style={{ margin: '4px 0 0 0', lineHeight: 1.4 }}>
                When enabled, answers generated by the AI model are automatically saved as 1st-priority Question Chunks to eliminate future LLM API calls for identical or similar visitor questions.
              </p>
            </div>
            <div className="toggle-card-action">
              <Toggle
                checked={autoStore}
                onChange={handleToggleAutoStore}
                disabled={togglingAutoStore || !llmSettings || !can('settings.edit')}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Filter / Search Bar */}
      <div style={{ marginBottom: 20 }}>
        <Card title="">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 4 }}>
            <SearchInput
              placeholder="Search by question or answer..."
              value={search}
              onChange={setSearch}
            />
            <button className="btn-secondary" onClick={loadData}>
              <FiRefreshCw /> Refresh
            </button>
          </div>
        </Card>
      </div>

      {/* Items Table */}
      {loading ? (
        <PageSpinner label="Loading question chunks..." />
      ) : items.length === 0 ? (
        <Card title="">
          <EmptyState
            icon={<FiLayers />}
            title="No pre-matched question chunks found"
            description="Add a pre-matched question chunk to serve validated responses with 1st priority before standard document chunk search."
            action={
              can('chunks.create') ? (
                <button className="btn-primary" onClick={openCreateModal}>
                  <FiPlus /> Add Question Chunk
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card title={`Registered Pairs (${total})`}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Question</th>
                  <th style={{ width: '40%' }}>Matched Answer</th>
                  <th style={{ width: '12%' }}>Threshold</th>
                  <th style={{ width: '10%' }}>Match Uses</th>
                  <th style={{ width: '13%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{item.question}</td>
                    <td style={{ color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
                      {item.answer.length > 180 ? `${item.answer.slice(0, 180)}…` : item.answer}
                    </td>
                    <td>
                      <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                        {((item.similarityThreshold ?? 0.8) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td>
                      <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                        {item.useCount ?? 0} uses
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {can('chunks.edit') && (
                          <button
                            className="btn-secondary btn-tiny"
                            onClick={() => openEditModal(item)}
                            title="Edit Question Chunk"
                          >
                            <FiEdit2 /> Edit
                          </button>
                        )}
                        {can('chunks.delete') && (
                          <button
                            className="btn-secondary btn-tiny"
                            onClick={() => handleDelete(item.id)}
                            style={{ color: '#ef4444' }}
                            title="Delete"
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <Modal
          title={editingItem ? 'Edit Question Chunk' : 'Add Pre-Matched Question Chunk'}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <FormField label="Question">
              <FormInput
                type="text"
                placeholder="e.g. How do I reset my password?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                required
                autoFocus
              />
            </FormField>

            <FormField label="Matched Answer">
              <FormTextarea
                rows={4}
                placeholder="Enter the exact answer or content chunk to serve for this question..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
              />
            </FormField>

            <FormField
              label={`Similarity Matching Threshold (${((similarityThreshold ?? 0.8) * 100).toFixed(0)}% similarity)`}
              description="Higher threshold (e.g. 80-90%) ensures this response is only triggered when the visitor's question closely matches."
            >
              <input
                type="range"
                min={0.5}
                max={0.95}
                step={0.05}
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingItem ? 'Update Chunk' : 'Create Chunk'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Clear All Confirmation Modal */}
      {clearConfirmOpen && (
        <Modal title="Clear All Pre-Matched Question Chunks" onClose={() => setClearConfirmOpen(false)}>
          <div style={{ padding: '10px 0' }}>
            <p style={{ color: '#7f1d1d', background: '#fef2f2', padding: 12, borderRadius: 8, fontSize: 13 }}>
              <FiAlertTriangle style={{ marginRight: 6 }} />
              Warning: This will delete all {total} pre-matched question chunk pairs.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setClearConfirmOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" style={{ background: '#dc2626' }} onClick={handleClearAll} disabled={clearing}>
                {clearing ? 'Clearing…' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
