import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertCircle,
  FiTrash2,
  FiRefreshCw,
  FiPlusCircle,
  FiFileText,
  FiClock,
  FiLayers,
  FiInfo,
} from 'react-icons/fi';
import type { UnansweredQuestionDTO, UnansweredQuestionsStatsDTO, LlmSettings } from '../shared';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { PageSpinner } from '../components/ui/Spinner';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import Toggle from '../components/ui/Toggle';
import { toast } from '../components/ui/Toast';
import { useCan } from '../lib/authContext';
import { Button, StatCard, SearchInput, Pagination, Badge, EmptyState } from '../components/ui';

const REASON_LABELS: Record<string, { label: string; variant: 'warning' | 'danger' | 'info' | 'neutral'; desc: string }> = {
  no_context_found: {
    label: 'No Relevant Content',
    variant: 'warning',
    desc: 'Vector similarity search found no matching knowledge chunks.',
  },
  insufficient_answer: {
    label: 'Insufficient Context',
    variant: 'warning',
    desc: 'Chunks matched, but LLM determined the content did not sufficiently answer the question.',
  },
  llm_failed_no_chunks: {
    label: 'LLM Failed / No Strong Chunks',
    variant: 'danger',
    desc: 'LLM API was unavailable/failed and no chunks met the fallback relevance threshold.',
  },
  llm_unresponsive: {
    label: 'LLM Unavailable',
    variant: 'neutral',
    desc: 'LLM API failed or timed out with fallback disabled.',
  },
};

export default function UnansweredQuestions() {
  const navigate = useNavigate();
  const can = useCan();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UnansweredQuestionDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<UnansweredQuestionsStatsDTO>({ total: 0, byReason: {}, last7Days: 0 });
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);

  const [search, setSearch] = useState('');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [inspectItem, setInspectItem] = useState<UnansweredQuestionDTO | null>(null);

  function loadData(pageNum = page, searchQuery = search, reasonFilter = selectedReason) {
    setLoading(true);
    const offset = (pageNum - 1) * limit;
    Promise.all([
      api.listUnansweredQuestions({
        limit,
        offset,
        search: searchQuery.trim() || undefined,
        reason: reasonFilter || undefined,
      }),
      api.getSettings().catch(() => null),
    ])
      .then(([res, settings]) => {
        setItems(res.items);
        setTotal(res.total);
        if (res.stats) setStats(res.stats);
        if (settings) setLlmSettings(settings.llm);
      })
      .catch((err) => {
        toast.error(err.message ?? 'Failed to load unanswered questions.');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    loadData(1, search, selectedReason);
    setPage(1);
  }, [search, selectedReason]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.deleteUnansweredQuestion(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      toast.success('Question removed.');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete question.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    try {
      const res = await api.clearAllUnansweredQuestions();
      setItems([]);
      setTotal(0);
      setStats({ total: 0, byReason: {}, last7Days: 0 });
      setClearAllOpen(false);
      toast.success(`Cleared ${res.deletedCount} unanswered questions.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to clear questions.');
    } finally {
      setClearing(false);
    }
  }

  function handleCreateFaq(questionText: string) {
    navigate(`/faqs?newQuestion=${encodeURIComponent(questionText)}`);
  }

  function handleCreateChunk(questionText: string) {
    navigate(`/question-chunks?newQuestion=${encodeURIComponent(questionText)}`);
  }

  return (
    <div className="unanswered-page space-y-6">
      <PageHeader
        title="Unanswered Questions"
        description="Review questions where no answer was found or LLM returned missing information. Identify content gaps and convert questions into FAQs or Question Chunks."
      />

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Unanswered Questions"
          value={stats.total.toLocaleString()}
          subtitle={`${stats.last7Days} in the last 7 days`}
          icon={<FiAlertCircle className="w-5 h-5" />}
          iconBgColor="bg-rose-50 dark:bg-rose-950/40"
          iconColor="text-rose-600 dark:text-rose-400"
        />

        <StatCard
          title="Missing Content / Gaps"
          value={((stats.byReason.no_context_found ?? 0) + (stats.byReason.insufficient_answer ?? 0)).toLocaleString()}
          subtitle="Candidate topics to add to Content or FAQs"
          icon={<FiFileText className="w-5 h-5" />}
          iconBgColor="bg-amber-50 dark:bg-amber-950/40"
          iconColor="text-amber-600 dark:text-amber-400"
        />

        <StatCard
          title="LLM Failures / Unresponsive"
          value={((stats.byReason.llm_failed_no_chunks ?? 0) + (stats.byReason.llm_unresponsive ?? 0)).toLocaleString()}
          subtitle="Occurred during LLM timeouts or quota downtime"
          icon={<FiLayers className="w-5 h-5" />}
          iconBgColor="bg-slate-100 dark:bg-slate-800"
          iconColor="text-slate-600 dark:text-slate-400"
        />
      </div>

      {/* Toggle auto-recording card */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm text-slate-900 dark:text-white">
              Enable Auto-Recording of Unanswered Questions
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              When ON: Questions that fail vector match, context grounding, or LLM response are automatically logged here for admin review.
            </div>
          </div>
          <Toggle
            checked={llmSettings?.enableUnansweredQuestionsLogging !== false}
            onChange={async (v) => {
              if (!llmSettings) return;
              const updated = { ...llmSettings, enableUnansweredQuestionsLogging: v };
              setLlmSettings(updated);
              try {
                await api.updateLlm(updated);
                toast.success(v ? 'Unanswered questions recording enabled.' : 'Unanswered questions recording disabled.');
              } catch (e: any) {
                toast.error(e.message ?? 'Failed to update setting.');
              }
            }}
          />
        </div>
      </Card>

      <Card icon={<FiAlertCircle />} title="Unanswered & Missing Content Questions">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Questions where no relevant knowledge was found, the LLM returned insufficient answers, or the API was unavailable. Use this list to identify gaps in your knowledge base and create new articles or FAQs.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadData(page, search, selectedReason)}
              icon={<FiRefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
            {can('unanswered.delete') && total > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setClearAllOpen(true)}
                icon={<FiTrash2 className="w-3.5 h-3.5" />}
              >
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search unanswered questions…"
            />
          </div>

          <div className="w-full sm:w-64">
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Tracking Reasons</option>
              <option value="no_context_found">No Relevant Content Found</option>
              <option value="insufficient_answer">Insufficient Answer from Context</option>
              <option value="llm_failed_no_chunks">LLM Failed & No Chunks Above Threshold</option>
              <option value="llm_unresponsive">LLM Unavailable / Offline</option>
            </select>
          </div>
        </div>

        {/* Content list / table */}
        {loading ? (
          <div className="py-12 text-center">
            <PageSpinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No unanswered questions"
            description={
              search || selectedReason
                ? 'No questions matched your active filters. Try clearing search or reason filter.'
                : 'All visitor queries have received matching context and answers. Great job!'
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const reasonMeta = REASON_LABELS[item.reason] ?? {
                label: item.reason,
                variant: 'neutral' as const,
                desc: '',
              };

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                        {item.question}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant={reasonMeta.variant} size="sm" title={reasonMeta.desc}>
                          {reasonMeta.label}
                        </Badge>

                        {item.similarityScore !== null && (
                          <Badge variant="info" size="sm" title="Highest similarity chunk score retrieved">
                            Max match: {(item.similarityScore * 100).toFixed(0)}%
                          </Badge>
                        )}

                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <FiClock className="w-3 h-3" />
                          {formatDate(item.createdAt)}
                        </span>

                        {item.sessionId && (
                          <span className="text-xs text-slate-400" title={`Session ID: ${item.sessionId}`}>
                            Session: {item.sessionId.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.contextChunks && item.contextChunks.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectItem(item)}
                          icon={<FiInfo className="w-3.5 h-3.5" />}
                        >
                          Chunks ({item.contextChunks.length})
                        </Button>
                      )}

                      {(can('chunks.create') || can('faqs.create') || can('unanswered.delete')) && (
                        <>
                          {can('chunks.create') && <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateChunk(item.question)}
                            icon={<FiLayers className="w-3.5 h-3.5" />}
                            className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-900 dark:hover:bg-purple-950/40"
                          >
                            To Chunks
                          </Button>}

                          {can('faqs.create') && <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateFaq(item.question)}
                            icon={<FiPlusCircle className="w-3.5 h-3.5" />}
                            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-900 dark:hover:bg-indigo-950/40"
                          >
                            To FAQ
                          </Button>}

                          {can('unanswered.delete') && <Button
                            variant="ghost"
                            size="sm"
                            loading={deletingId === item.id}
                            onClick={() => handleDelete(item.id)}
                            icon={<FiTrash2 className="w-3.5 h-3.5" />}
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                            aria-label="Delete"
                          />}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reusable Pagination */}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={total}
          pageSize={limit}
          onPageChange={setPage}
          className="mt-4 border-t border-slate-200 dark:border-slate-800 pt-3"
        />
      </Card>

      {/* Inspect Chunks Modal */}
      {inspectItem && (
        <Modal
          title="Retrieved Chunk Context"
          onClose={() => setInspectItem(null)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                User Question
              </label>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white">
                {inspectItem.question}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                Nearest Matching Chunks ({inspectItem.contextChunks?.length ?? 0})
              </label>
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {inspectItem.contextChunks?.map((chunk, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {chunk.title || 'Untitled Source'}
                      </strong>
                      <Badge variant="info" size="sm">
                        {(chunk.similarity * 100).toFixed(0)}% similarity match
                      </Badge>
                    </div>
                    {chunk.sourceRef && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        Source: {chunk.sourceRef}
                      </div>
                    )}
                    {chunk.snippet && (
                      <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2 rounded whitespace-pre-wrap font-mono">
                        {chunk.snippet}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button variant="secondary" onClick={() => setInspectItem(null)}>
                Close
              </Button>
              {can('faqs.create') && (
                <Button
                  variant="primary"
                  icon={<FiPlusCircle className="w-4 h-4" />}
                  onClick={() => {
                    const q = inspectItem.question;
                    setInspectItem(null);
                    handleCreateFaq(q);
                  }}
                >
                  Turn Question into FAQ
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Clear All Confirmation Modal */}
      {clearAllOpen && (
        <Modal
          title="Clear All Unanswered Questions?"
          onClose={() => setClearAllOpen(false)}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete all <strong>{total.toLocaleString()}</strong> unanswered questions from the database? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setClearAllOpen(false)} disabled={clearing}>
                Cancel
              </Button>
              <Button variant="danger" loading={clearing} onClick={handleClearAll} icon={<FiTrash2 className="w-4 h-4" />}>
                Yes, Clear All
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
