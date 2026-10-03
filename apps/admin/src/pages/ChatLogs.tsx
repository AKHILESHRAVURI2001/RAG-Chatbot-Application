import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiChevronDown,
  FiChevronRight,
  FiCode,
  FiTrash2,
  FiMinimize2,
  FiMaximize2,
  FiLock,
  FiUnlock,
  FiDownload,
  FiRefreshCw,
  FiMic,
  FiList,
  FiUser,
  FiCpu,
  FiCopy,
  FiCheck,
  FiSearch,
  FiClock,
  FiFileText,
  FiLayers,
  FiKey,
} from 'react-icons/fi';
import {
  buildFullPromptText,
  formatChatMarkdown,
  type ConversationDetailDTO,
  type ConversationLogMessageDTO,
  type ConversationSummaryDTO,
} from '../shared';
import { api } from '../lib/api';
import { useCan } from '../lib/authContext';
import { formatDate } from '../lib/format';
import { InlineSpinner, PageSpinner } from '../components/ui/Spinner';
import Card from '../components/ui/Card';
import AnswerSourceBadge from '../components/ui/AnswerSourceBadge';
import { PageHeader } from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function WordCountPill({ text }: { text: string }) {
  const words = wordCount(text);
  return (
    <span className="chat-log-word-count">
      {words} {words === 1 ? 'word' : 'words'}
    </span>
  );
}

interface Turn {
  user?: ConversationLogMessageDTO;
  assistant?: ConversationLogMessageDTO;
}

function groupIntoTurns(messages: ConversationLogMessageDTO[]): Turn[] {
  const turns: Turn[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      const next = messages[i + 1];
      const assistant = next?.role === 'assistant' ? next : undefined;
      turns.push({ user: messages[i], assistant });
      if (assistant) i++;
    } else {
      turns.push({ assistant: messages[i] });
    }
  }
  return turns;
}

function computeFoldedMessageIds(messages: ConversationLogMessageDTO[]): Set<string> {
  let boundary = 0;
  messages.forEach((m, i) => {
    if (m.role !== 'assistant' || !m.llmRequest?.historySummary) return;
    const verbatimCount = m.llmRequest.history?.length ?? 0;
    const userIndex = i - 1;
    boundary = Math.max(boundary, userIndex - verbatimCount);
  });
  return new Set(messages.slice(0, Math.max(0, boundary)).map((m) => m.id));
}

function TurnCard({
  turn,
  autoCompact,
  override,
  foldedIntoRecap,
  turnNumber,
}: {
  turn: Turn;
  autoCompact: boolean;
  override: boolean | null;
  foldedIntoRecap: boolean;
  turnNumber: number;
}) {
  const navigate = useNavigate();
  const [showPrompt, setShowPrompt] = useState(false);
  const [manual, setManual] = useState<boolean | null>(null);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => setManual(null), [override]);

  const { user, assistant } = turn;
  const isError = assistant?.content.startsWith('[error]');
  const promptText = assistant?.llmRequest ? buildFullPromptText(assistant.llmRequest) : '';
  const compact = manual ?? override ?? autoCompact;

  async function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  function handleSaveChunk() {
    if (!user?.content) return;
    const q = encodeURIComponent(user.content);
    const a = encodeURIComponent(assistant?.content ?? '');
    navigate(`/question-chunks?newQuestion=${q}&newAnswer=${a}`);
  }

  function handleSaveFaq() {
    if (!user?.content) return;
    const q = encodeURIComponent(user.content);
    const a = encodeURIComponent(assistant?.content ?? '');
    navigate(`/faqs?newQuestion=${q}&newAnswer=${a}`);
  }

  return (
    <div className={`chat-log-turn-card ${compact ? 'is-compact-turn' : ''}`}>
      <div className="chat-log-turn-header">
        <div className="chat-log-turn-meta">
          <span className="chat-log-turn-badge">Turn #{turnNumber}</span>
          <span className="muted small">
            <FiClock style={{ verticalAlign: '-1px', marginRight: '4px' }} />
            {formatDate((user ?? assistant)?.createdAt ?? null)}
          </span>
          {assistant?.responseTimeMs != null && (
            <span
              className="badge"
              style={{
                background: '#fef2f2',
                color: '#991b1b',
                border: '1px solid #fecaca',
                fontSize: '11px',
                fontWeight: 600,
              }}
              title="Response generation duration"
            >
              ⚡ {(assistant.responseTimeMs / 1000).toFixed(2)}s ({assistant.responseTimeMs} ms)
            </span>
          )}
          {foldedIntoRecap && (
            <span
              className="chat-log-folded-badge"
              title="A later turn's compacted memory now stands in for this turn in LLM requests"
            >
              auto-compacted in memory
            </span>
          )}
        </div>
        <div className="chat-log-turn-actions" style={{ display: 'flex', gap: 6 }}>
          {user?.content && (
            <>
              <button
                className="btn-secondary btn-tiny"
                onClick={handleSaveChunk}
                title="Save this question & answer pair as a 1st-priority Question Chunk"
                style={{ color: '#7c3aed', borderColor: '#ddd6fe' }}
              >
                <FiLayers /> Save to Chunks
              </button>
              <button
                className="btn-secondary btn-tiny"
                onClick={handleSaveFaq}
                title="Save this question & answer pair as an FAQ"
                style={{ color: '#4f46e5', borderColor: '#c7d2fe' }}
              >
                <FiFileText /> Save to FAQs
              </button>
            </>
          )}
          <button
            className="btn-secondary btn-tiny chat-log-expand-btn"
            onClick={() => setManual(!compact)}
            title={compact ? 'Expand full turn' : 'Collapse turn'}
          >
            {compact ? <><FiMaximize2 /> Expand</> : <><FiMinimize2 /> Collapse</>}
          </button>
        </div>
      </div>

      {/* User Question Bubble */}
      {user && (
        <div className="chat-log-bubble chat-log-user-bubble">
          <div className="chat-log-bubble-header">
            <div className="chat-log-role-label user">
              <FiUser /> User Query
              {user.channel === 'voice' && (
                <span className="badge chat-log-voice-badge" title="This question was spoken via voice/mic">
                  <FiMic /> Voice
                </span>
              )}
            </div>
            <WordCountPill text={user.content} />
          </div>
          <div className="chat-log-bubble-content user-content">
            {user.content}
          </div>
        </div>
      )}

      {/* AI Inspector Drawer (Prompt, Knowledge Chunks, Memory) */}
      {assistant?.llmRequest && (
        <div className="chat-log-inspector-drawer">
          <div className="chat-log-inspector-header">
            <div className="chat-log-inspector-title">
              <FiCode /> <strong>{assistant.answerSource === 'chunk-fallback' ? 'Fallback Generator Details' : 'AI Request Details'}</strong>
              {assistant.llmRequest.provider && (
                <span
                  className="badge"
                  style={{
                    background: assistant.llmRequest.provider === 'chunk-fallback' ? '#fef3c7' : '#e0e7ff',
                    color: assistant.llmRequest.provider === 'chunk-fallback' ? '#b45309' : '#3730a3',
                    fontSize: '11px',
                    textTransform: 'capitalize',
                  }}
                >
                  {assistant.llmRequest.provider === 'chunk-fallback' ? 'Chunk Fallback' : assistant.llmRequest.provider}
                </span>
              )}
              {assistant.llmRequest.model && assistant.llmRequest.provider !== 'chunk-fallback' && (
                <span className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px' }}>
                  {assistant.llmRequest.model}
                </span>
              )}
              {(assistant.responseTimeMs != null || assistant.llmRequest.responseTimeMs != null) && (
                <span
                  className="badge"
                  style={{
                    background: '#fef2f2',
                    color: '#991b1b',
                    border: '1px solid #fecaca',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                  title="Total AI response generation latency"
                >
                  ⚡ {(((assistant.responseTimeMs ?? assistant.llmRequest.responseTimeMs) || 0) / 1000).toFixed(2)}s ({(assistant.responseTimeMs ?? assistant.llmRequest.responseTimeMs)} ms)
                </span>
              )}
              {assistant.llmRequest.apiKeyMasked && (
                <span
                  className="badge"
                  style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', fontSize: '11px', fontFamily: 'monospace' }}
                  title={`Active API Key in pool (${assistant.llmRequest.keyCount ?? 1} total configured)`}
                >
                  <FiKey style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  {assistant.llmRequest.apiKeyMasked}
                  {assistant.llmRequest.keyCount && assistant.llmRequest.keyCount > 1 ? ` (1/${assistant.llmRequest.keyCount})` : ''}
                </span>
              )}
              {assistant.llmRequest.promptWords !== undefined ? (
                <span
                  className="badge"
                  style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '11px' }}
                  title={`Prompt: ${assistant.llmRequest.promptWords.toLocaleString()} words · Response: ${(assistant.llmRequest.answerWords ?? 0).toLocaleString()} words`}
                >
                  📊 {((assistant.llmRequest.promptWords ?? 0) + (assistant.llmRequest.answerWords ?? 0)).toLocaleString()} total words ({assistant.llmRequest.promptWords.toLocaleString()} prompt · {(assistant.llmRequest.answerWords ?? 0).toLocaleString()} response)
                </span>
              ) : (
                <WordCountPill text={promptText} />
              )}
              {assistant.llmRequest.isContinuation !== undefined && (
                <span
                  className="badge"
                  style={{
                    background: assistant.llmRequest.isContinuation ? '#eff6ff' : '#f0fdf4',
                    color: assistant.llmRequest.isContinuation ? '#1d4ed8' : '#15803d',
                    border: `1px solid ${assistant.llmRequest.isContinuation ? '#bfdbfe' : '#bbf7d0'}`,
                    fontSize: '11px',
                  }}
                  title={assistant.llmRequest.isContinuation ? 'Follow-up turn: conversation history was passed to the LLM' : 'Fresh standalone query: history was isolated to save tokens'}
                >
                  {assistant.llmRequest.isContinuation ? 'Continuation (History Retained)' : 'Standalone (History Isolated)'}
                </span>
              )}
              {assistant.llmRequest.autoStoredChunk && (
                <span
                  className="badge"
                  style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', fontSize: '11px' }}
                  title="This turn was automatically saved into Question Chunks to save future LLM costs"
                >
                  ⚡ Auto-Stored Chunk
                </span>
              )}
              {assistant.llmRequest.contextCompacted && (
                <span className="chat-log-context-compacted" title="Retrieved context was compacted to reduce token spend">
                  Context Compacted
                </span>
              )}
            </div>
            <button
              className="btn-secondary btn-tiny"
              onClick={() => setShowPrompt((v) => !v)}
            >
              <FiCode /> {showPrompt ? 'Hide Full Prompt' : 'View Full Prompt'}
            </button>
          </div>

          {/* Retrieved chunks */}
          {assistant.llmRequest.contextChunks && assistant.llmRequest.contextChunks.length > 0 && (
            <div className="chat-log-chunks-container">
              <div className="chat-log-chunks-label">
                <FiFileText /> Retrieved Knowledge Chunks ({assistant.llmRequest.contextChunks.length}):
              </div>
              <div className="chat-log-chunks">
                {assistant.llmRequest.contextChunks.map((c, i) => (
                  <span key={i} className="chat-log-chunk" title={c.title ?? 'Untitled source'}>
                    <span className="chunk-title">{c.title ?? 'Knowledge Source'}</span>
                    <span className="chunk-meta">
                      {c.words}w · <strong style={{ color: '#0284c7' }}>{(c.similarity * 100).toFixed(0)}% match</strong>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline Audit & Execution Trace */}
          {assistant.llmRequest.pipelineAudit && (
            <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              {assistant.llmRequest.pipelineAudit.skippedReason && (
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11 }}>Pipeline Trace</span>
                  {assistant.llmRequest.pipelineAudit.skippedReason}
                </div>
              )}

              {/* Stage Chips */}
              {assistant.llmRequest.pipelineAudit.stagesChecked && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {assistant.llmRequest.pipelineAudit.stagesChecked.map((st, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: st.status === 'hit' ? '#dcfce7' : '#f1f5f9',
                        color: st.status === 'hit' ? '#166534' : '#64748b',
                        border: `1px solid ${st.status === 'hit' ? '#86efac' : '#cbd5e1'}`,
                        fontWeight: st.status === 'hit' ? 700 : 500,
                      }}
                      title={st.details || st.stage}
                    >
                      {st.stage}: {st.status === 'hit' ? '✓ HIT' : 'MISS'}
                      {st.details ? ` (${st.details})` : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* Vector Candidates Evaluated */}
              {assistant.llmRequest.pipelineAudit.vectorMatches && assistant.llmRequest.pipelineAudit.vectorMatches.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Vector Candidate Chunks Checked ({assistant.llmRequest.pipelineAudit.vectorMatches.length}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {assistant.llmRequest.pipelineAudit.vectorMatches.map((vm, vIdx) => (
                      <div
                        key={vIdx}
                        style={{
                          fontSize: 11.5,
                          padding: '6px 10px',
                          background: vm.passedThreshold ? '#f0fdf4' : '#fff1f2',
                          border: `1px solid ${vm.passedThreshold ? '#bbf7d0' : '#fecdd3'}`,
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ color: '#1e293b' }}>{vm.title || 'Untitled Chunk'}</strong>
                          {vm.snippet && <div style={{ color: '#64748b', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.snippet}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: vm.passedThreshold ? '#15803d' : '#be123c',
                            }}
                          >
                            {(vm.similarity * 100).toFixed(0)}% match
                          </span>
                          <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>
                            (Cutoff: {(vm.threshold * 100).toFixed(0)}% {vm.passedThreshold ? '✓ Passed' : '✗ Below'})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compacted memory */}
          {assistant.llmRequest.historySummary && (
            <div className="chat-log-memory">
              <div className="chat-log-memory-label">
                <FiLayers /> Compacted History Memory
                <WordCountPill text={assistant.llmRequest.historySummary} />
              </div>
              <div className="chat-log-memory-body">
                {assistant.llmRequest.historySummary}
              </div>
            </div>
          )}

          {/* Auto-compact progress */}
          {!assistant.llmRequest.historySummary && assistant.llmRequest.autoCompactProgress && (
            <div className="chat-log-compact-status">
              Auto-compact progress: <strong>{assistant.llmRequest.autoCompactProgress.wordsSoFar.toLocaleString()}</strong> / {assistant.llmRequest.autoCompactProgress.budgetWords.toLocaleString()} words
            </div>
          )}

          {/* Expanded Full Prompt */}
          {showPrompt && (
            <div className="chat-log-full-prompt-wrapper">
              <div className="chat-log-prompt-actions">
                <span className="muted small">Raw formatted payload sent to LLM</span>
                <button
                  className="btn-secondary btn-tiny"
                  onClick={() => copyToClipboard(promptText, setCopiedPrompt)}
                >
                  {copiedPrompt ? <><FiCheck /> Copied</> : <><FiCopy /> Copy Prompt</>}
                </button>
              </div>
              <pre className="llm-request-block">{promptText}</pre>
            </div>
          )}
        </div>
      )}

      {/* Assistant / AI Reply Bubble */}
      {assistant && (
        <div className={`chat-log-bubble chat-log-assistant-bubble ${isError ? 'has-error' : ''}`}>
          <div className="chat-log-bubble-header">
            <div className="chat-log-role-label assistant">
              <FiCpu /> AI Assistant Response
              <AnswerSourceBadge source={assistant.answerSource} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WordCountPill text={assistant.content} />
              <button
                className="btn-secondary btn-tiny"
                onClick={() => copyToClipboard(assistant.content, setCopiedResponse)}
                title="Copy response text"
              >
                {copiedResponse ? <FiCheck /> : <FiCopy />}
              </button>
            </div>
          </div>
          <div
            className="chat-log-bubble-content assistant-content"
            dangerouslySetInnerHTML={{ __html: formatChatMarkdown(assistant.content) }}
          />
        </div>
      )}
    </div>
  );
}

const TURNS_SHOWN_IN_FULL = 5;

function ConversationRow({
  summary,
  onDeleted,
}: {
  summary: ConversationSummaryDTO;
  onDeleted: (id: string) => void;
}) {
  const can = useCan();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ConversationDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [compactOverride, setCompactOverride] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(summary.blocked);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(summary.blockedUntil ?? null);
  const [blockReason, setBlockReason] = useState<string | null>(summary.blockReason ?? null);
  const [blocking, setBlocking] = useState(false);
  const foldedIds = useMemo(() => (detail ? computeFoldedMessageIds(detail.messages) : new Set<string>()), [detail]);

  const isTempBlocked = Boolean(blocked && blockedUntil && new Date(blockedUntil) > new Date());
  const timeRemainingStr = useMemo(() => {
    if (!isTempBlocked || !blockedUntil) return null;
    const mins = Math.max(1, Math.ceil((new Date(blockedUntil).getTime() - Date.now()) / (60 * 1000)));
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`.trim();
    return `${mins}m`;
  }, [isTempBlocked, blockedUntil]);

  async function handleSetBlocked(newBlocked: boolean, durationMinutes?: number | null) {
    setBlocking(true);
    setError(null);
    try {
      const result = await api.setConversationBlocked(
        summary.id,
        newBlocked,
        durationMinutes,
        durationMinutes ? 'admin_temp_block' : 'admin_manual',
      );
      setBlocked(result.blocked);
      setBlockedUntil(result.blockedUntil ?? null);
      setBlockReason(result.blockReason ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBlocking(false);
    }
  }

  async function toggleBlocked(e: React.MouseEvent) {
    e.stopPropagation();
    await handleSetBlocked(!blocked);
  }

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail) return;
    try {
      setDetail(await api.getConversation(summary.id));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Clear this conversation? This permanently deletes its transcript.')) return;
    setDeleting(true);
    try {
      await api.deleteConversation(summary.id);
      onDeleted(summary.id);
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
    }
  }

  const turns = detail ? groupIntoTurns(detail.messages) : [];

  return (
    <>
      <tr className="chat-log-row" onClick={toggle}>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {expanded ? <FiChevronDown /> : <FiChevronRight />}
            <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '13px' }}>
              {summary.sessionId}
            </span>
            {blocked && (
              isTempBlocked ? (
                <span className="badge chat-log-temp-blocked-badge" title={blockReason ? `Reason: ${blockReason}` : undefined}>
                  <FiClock /> Paused ({timeRemainingStr})
                </span>
              ) : (
                <span className="badge chat-log-blocked-badge" title={blockReason ? `Reason: ${blockReason}` : undefined}>
                  <FiLock /> Locked
                </span>
              )
            )}
          </div>
        </td>
        <td>
          <span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
            {summary.messageCount} messages
          </span>
        </td>
        <td>{formatDate(summary.lastMessageAt)}</td>
        <td>{formatDate(summary.createdAt)}</td>
        <td>
          <div className="table-actions">
            {!can('conversations.manage') ? null : blocked ? (
              <button
                className="btn-secondary btn-tiny"
                onClick={toggleBlocked}
                disabled={blocking}
                title="Let this visitor chat again"
              >
                <FiUnlock /> Unlock
              </button>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <button
                  className="btn-secondary btn-tiny"
                  onClick={toggleBlocked}
                  disabled={blocking}
                  title="Lock this visitor permanently"
                >
                  <FiLock /> Lock
                </button>
                <select
                  className="form-input btn-tiny"
                  style={{ padding: '2px 4px', fontSize: '11px', height: '26px', width: 'auto', background: '#f8fafc', border: '1px solid #cbd5e1' }}
                  onChange={(e) => {
                    const mins = Number(e.target.value);
                    if (mins > 0) handleSetBlocked(true, mins);
                    e.target.value = '';
                  }}
                  disabled={blocking}
                  title="Pause visitor for a temporary duration"
                >
                  <option value="">Pause for…</option>
                  <option value="15">15 min</option>
                  <option value="60">1 hour</option>
                  <option value="1440">24 hours</option>
                </select>
              </div>
            )}
            {can('conversations.delete') && (
              <button className="btn-danger btn-tiny" onClick={remove} disabled={deleting}>
                <FiTrash2 /> {deleting ? 'Clearing…' : 'Clear'}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="chat-log-detail-row">
          <td colSpan={5} style={{ padding: '16px 20px', background: '#f8fafc' }}>
            {error && <div className="alert">{error}</div>}
            {!detail && !error && <InlineSpinner label="Loading conversation transcript…" />}
            {detail && (
              <div className="chat-log-transcript">
                <div className="chat-log-transcript-toolbar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>
                      Conversation Transcript ({turns.length} {turns.length === 1 ? 'exchange' : 'exchanges'})
                    </span>
                    <span className="muted small">
                      {compactOverride === null
                        ? `(Latest ${TURNS_SHOWN_IN_FULL} turns shown expanded)`
                        : compactOverride
                          ? '(All collapsed)'
                          : '(All expanded)'}
                    </span>
                  </div>
                  <div className="row-gap">
                    <button className="btn-secondary btn-tiny" onClick={() => setCompactOverride(false)}>
                      <FiMaximize2 /> Expand all
                    </button>
                    <button className="btn-secondary btn-tiny" onClick={() => setCompactOverride(true)}>
                      <FiMinimize2 /> Collapse all
                    </button>
                    {compactOverride !== null && (
                      <button className="btn-secondary btn-tiny" onClick={() => setCompactOverride(null)}>
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Turns shown newest first */}
                {turns
                  .map((turn, index) => ({ turn, turnNumber: index + 1 }))
                  .reverse()
                  .map(({ turn, turnNumber }, reverseIndex) => (
                    <TurnCard
                      key={turn.user?.id ?? turn.assistant?.id ?? reverseIndex}
                      turn={turn}
                      turnNumber={turnNumber}
                      autoCompact={reverseIndex >= TURNS_SHOWN_IN_FULL}
                      override={compactOverride}
                      foldedIntoRecap={Boolean(
                        (turn.user && foldedIds.has(turn.user.id)) || (turn.assistant && foldedIds.has(turn.assistant.id)),
                      )}
                    />
                  ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function ChatLogs() {
  const can = useCan();
  const [conversations, setConversations] = useState<ConversationSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [clearingAll, setClearingAll] = useState(false);
  const [exportFrom, setExportFrom] = useState(() => new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  function load() {
    setError(null);
    api.listConversations().then(setConversations).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  function handleDeleted(id: string) {
    setConversations((prev) => prev?.filter((c) => c.id !== id) ?? null);
  }

  async function exportRange() {
    if (!exportFrom || !exportTo) return;
    setError(null);
    setExporting(true);
    try {
      const from = new Date(`${exportFrom}T00:00:00`);
      const to = new Date(`${exportTo}T23:59:59.999`);
      await api.exportConversations(from, to);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  async function clearAll() {
    if (!conversations || conversations.length === 0) return;
    if (!confirm(`Clear all ${conversations.length} conversation(s)? This permanently deletes every transcript.`)) return;
    setClearingAll(true);
    setError(null);
    try {
      await api.clearAllConversations();
      setConversations([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setClearingAll(false);
    }
  }

  const filteredConversations = useMemo(() => {
    if (!conversations) return null;
    if (!searchFilter.trim()) return conversations;
    const q = searchFilter.toLowerCase();
    return conversations.filter((c) => c.sessionId.toLowerCase().includes(q));
  }, [conversations, searchFilter]);

  return (
    <div>
      <PageHeader
        title="Chat Logs"
        description="Review complete conversation histories, inspect exact prompts sent to the AI, analyze retrieved knowledge chunks, and monitor output quality."
        actions={
          <>
            {can('conversations.export') && (
              <button className="btn-secondary" onClick={() => setExportModalOpen(true)}>
                <FiDownload /> Export
              </button>
            )}
            <button className="btn-secondary" onClick={load}>
              <FiRefreshCw /> Refresh
            </button>
            {can('conversations.delete') && conversations && conversations.length > 0 && (
              <button className="btn-danger" onClick={clearAll} disabled={clearingAll}>
                <FiTrash2 /> {clearingAll ? 'Clearing…' : 'Clear all'}
              </button>
            )}
          </>
        }
      />

      {error && <div className="alert" style={{ marginTop: '16px' }}>{error}</div>}

      <div style={{ marginTop: '20px' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Active Sessions</span>
              {conversations && (
                <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                  {conversations.length} total
                </span>
              )}
            </div>
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter by Session ID…"
                style={{ paddingLeft: '30px', width: '100%', fontSize: '13px' }}
              />
              <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            </div>
          </div>

          {!filteredConversations && !error && <PageSpinner label="Loading conversations…" />}
          {filteredConversations && (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Session ID</th>
                    <th>Message Count</th>
                    <th>Last Activity</th>
                    <th>Started At</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConversations.map((c) => (
                    <ConversationRow key={c.id} summary={c} onDeleted={handleDeleted} />
                  ))}
                  {filteredConversations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '32px' }}>
                        {searchFilter ? 'No conversations match the search filter.' : 'No conversations recorded yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {exportModalOpen && (
        <Modal icon={<FiDownload />} title="Export Conversations by Date Range" onClose={() => setExportModalOpen(false)}>
          <p className="muted" style={{ marginBottom: 16 }}>
            Select a date range to download a structured, readable text export of all recorded conversation transcripts and turns.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="row-gap" style={{ flexWrap: 'wrap' }}>
              <label style={{ marginTop: 0, flex: 1 }}>
                From
                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} max={exportTo} />
              </label>
              <label style={{ marginTop: 0, flex: 1 }}>
                To
                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} min={exportFrom} />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => setExportModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  await exportRange();
                  setExportModalOpen(false);
                }}
                disabled={exporting}
              >
                <FiDownload /> {exporting ? 'Exporting…' : 'Download Export'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
