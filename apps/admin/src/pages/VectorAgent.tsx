import { useEffect, useState } from 'react';
import {
  FiLayers,
  FiDatabase,
  FiSliders,
  FiPlay,
  FiSave,
  FiCheckCircle,
  FiAlertCircle,
  FiActivity,
  FiInfo,
  FiCpu,
  FiFileText,
  FiShield,
} from 'react-icons/fi';
import type { ChunkingSettings, CacheSettings, StatsDTO, LlmSettings, PromptSettings, EmbeddingProviderName } from '../shared';
import { api } from '../lib/api';
import { ReadOnlyGuard } from '../components/ReadOnlyGuard';
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { toast } from '../components/ui/Toast';

const TABS = [
  { id: 'provider', label: 'Vector Provider', icon: FiLayers },
  { id: 'chunking', label: 'Chunking Strategy', icon: FiSliders },
  { id: 'thresholds', label: 'Similarity Thresholds', icon: FiDatabase },
  { id: 'test', label: 'Live Vector Test', icon: FiPlay },
  { id: 'overview', label: 'Index & Overview', icon: FiActivity },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function VectorAgent() {
  const [tab, setTab] = useState<TabId>('provider');
  const [chunking, setChunking] = useState<ChunkingSettings | null>(null);
  const [cache, setCache] = useState<CacheSettings | null>(null);
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [prompt, setPrompt] = useState<PromptSettings | null>(null);
  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [embeddingProvidersStatus, setEmbeddingProvidersStatus] = useState<Record<string, boolean>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<{ openai: string; gemini: string; custom: string }>({
    openai: '',
    gemini: '',
    custom: '',
  });

  // Live test state
  const [testText, setTestText] = useState('How does semantic vector search work for knowledge documents?');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    provider: string;
    model: string;
    dimensions: number;
    sample: number[];
    durationMs: number;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  function refreshSettings() {
    return Promise.all([
      api.getSettings().then((s) => {
        setChunking(s.chunking);
        setCache(s.cache);
        setLlm(s.llm);
        setPrompt(s.prompt);
        const statusMap: Record<string, boolean> = {};
        s.embeddingProviders.forEach((p) => {
          statusMap[p.name] = p.configured;
        });
        setEmbeddingProvidersStatus(statusMap);
      }),
      api.getStats().then(setStats).catch(() => {}),
    ]);
  }

  useEffect(() => {
    refreshSettings().catch((e) => toast.error(e.message ?? 'Failed to load settings.'));
  }, []);

  async function saveChunking() {
    if (!chunking) return;
    try {
      const updated = await api.updateChunking(chunking);
      setChunking(updated);
      toast.success('Vector & Chunking settings saved successfully.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save vector settings.');
    }
  }

  async function saveEmbeddingApiKey(providerName: 'openai' | 'gemini' | 'custom') {
    const keyVal = apiKeyInputs[providerName].trim();
    if (!keyVal) return;
    try {
      await api.updateEmbeddingApiKeys({ [providerName]: keyVal });
      setApiKeyInputs((prev) => ({ ...prev, [providerName]: '' }));
      await refreshSettings();
      toast.success(`Embedding API key saved for ${providerName.toUpperCase()}.`);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save embedding API key.');
    }
  }

  async function saveThresholds() {
    if (!cache) return;
    try {
      const updated = await api.updateCache(cache);
      setCache(updated);
      toast.success('Similarity threshold settings saved successfully.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save similarity thresholds.');
    }
  }

  async function handleTestEmbedding() {
    if (!testText.trim()) return;
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await api.testEmbedding(testText.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestError(err.message ?? 'Vector generation failed');
    } finally {
      setTesting(false);
    }
  }

  if (!chunking || !cache) return <PageSpinner label="Loading Vector Agent settings…" />;

  const provider = chunking.embeddingProvider || 'local';
  const model = chunking.embeddingModel || 'text-embedding-3-small';

  const providerLabels: Record<EmbeddingProviderName, string> = {
    local: '⚡ Free Local AI (ONNX)',
    openai: '☁️ OpenAI Embeddings',
    gemini: '✨ Google Gemini Embeddings',
    custom: '🔌 Custom Endpoint (Ollama / LocalAI)',
  };

  return (
    <div>
      <PageHeader
        title="Vector Agent"
        description="Manage vector embeddings, chunking strategy, semantic retrieval thresholds, and live vector generation for your knowledge base."
        actions={
          <span
            className="badge"
            style={{
              background: provider === 'local' ? '#e0f2fe' : '#f0fdf4',
              color: provider === 'local' ? '#0369a1' : '#15803d',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '12px',
            }}
          >
            {providerLabels[provider] || provider}
          </span>
        }
      />
      <ReadOnlyGuard permission="settings.edit">

      <div className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'provider' && (
        <Card icon={<FiLayers />} title="Vector Generation Provider">
          <p className="muted">
            Choose your active vector embedding provider. Supports free local in-process AI, OpenAI Cloud, Google Gemini, and custom local/remote OpenAI-compatible endpoints.
          </p>

          <label>Embedding Engine</label>
          <select
            value={provider}
            onChange={(e) => {
              const newProv = e.target.value as EmbeddingProviderName;
              let defaultModel = 'text-embedding-3-small';
              if (newProv === 'local') defaultModel = 'Xenova/all-MiniLM-L6-v2';
              else if (newProv === 'gemini') defaultModel = 'text-embedding-004';
              else if (newProv === 'custom') defaultModel = 'nomic-embed-text';
              setChunking({
                ...chunking,
                embeddingProvider: newProv,
                embeddingModel: defaultModel,
              });
            }}
          >
            <option value="local">⚡ Free In-Process Local Vectors (ONNX — 0 cost, 384d, no API key needed)</option>
            <option value="openai">☁️ Cloud OpenAI Embeddings (text-embedding-3-small, text-embedding-3-large)</option>
            <option value="gemini">✨ Google Gemini Embeddings (text-embedding-004 — 768d)</option>
            <option value="custom">🔌 Custom / OpenAI-Compatible Endpoint (Ollama, LM Studio, TEI, vLLM)</option>
          </select>

          <div
            style={{
              marginTop: '12px',
              padding: '14px',
              borderRadius: '8px',
              background: provider === 'local' ? '#f0fdfa' : '#f8fafc',
              border: `1px solid ${provider === 'local' ? '#99f6e4' : '#e2e8f0'}`,
            }}
          >
            {provider === 'local' && (
              <>
                <div style={{ fontWeight: 600, color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <FiCheckCircle /> Free Local ONNX Engine Active
                </div>
                <p className="muted small" style={{ margin: 0, color: '#115e59' }}>
                  Embeddings run directly on your server using <code>@xenova/transformers</code> in WebAssembly/ONNX.
                  Zero external API calls, zero latency delays, and zero token costs.
                </p>
              </>
            )}
            {provider === 'openai' && (
              <>
                <div style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <FiCpu /> OpenAI Cloud Embeddings Active
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  Generates dense vectors using OpenAI's embedding API. Uses its own dedicated OpenAI API key below or falls back to <code>OPENAI_API_KEY</code>.
                </p>
              </>
            )}
            {provider === 'gemini' && (
              <>
                <div style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <FiCpu /> Google Gemini Cloud Embeddings Active
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  Generates 768-dimensional vectors using Google Gemini's <code>text-embedding-004</code> model. Uses dedicated Gemini API key below or falls back to <code>GEMINI_API_KEY</code>.
                </p>
              </>
            )}
            {provider === 'custom' && (
              <>
                <div style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <FiCpu /> Custom Endpoint Embeddings Active
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  Connect to any OpenAI-compatible embedding service (e.g. Ollama <code>http://localhost:11434/v1</code>, LM Studio, TEI, or LocalAI).
                </p>
              </>
            )}
          </div>

          {/* Provider Specific Settings */}
          {provider === 'local' && (
            <div style={{ marginTop: '16px' }}>
              <label>Local ONNX Embedding Model</label>
              <select
                value={model}
                onChange={(e) => setChunking({ ...chunking, embeddingModel: e.target.value })}
              >
                <option value="Xenova/all-MiniLM-L6-v2">Xenova/all-MiniLM-L6-v2 (Default — 384 dimensions, fast & compact)</option>
                <option value="Xenova/bge-small-en-v1.5">Xenova/bge-small-en-v1.5 (384 dimensions, high accuracy English)</option>
                <option value="Xenova/paraphrase-multilingual-MiniLM-L12-v2">Xenova/paraphrase-multilingual-MiniLM-L12-v2 (384 dimensions, 50+ languages)</option>
              </select>
            </div>
          )}

          {provider === 'openai' && (
            <div style={{ marginTop: '16px' }}>
              <label>OpenAI Model Name</label>
              <select
                value={model}
                onChange={(e) => setChunking({ ...chunking, embeddingModel: e.target.value })}
              >
                <option value="text-embedding-3-small">text-embedding-3-small (Default — 1536 dimensions, high precision)</option>
                <option value="text-embedding-3-large">text-embedding-3-large (3072 dimensions, maximum precision)</option>
                <option value="text-embedding-ada-002">text-embedding-ada-002 (1536 dimensions, legacy)</option>
              </select>

              <label style={{ marginTop: '12px' }}>
                OpenAI Embedding API Key{' '}
                <span style={{ fontWeight: 400, color: embeddingProvidersStatus['openai'] ? '#15803d' : '#b91c1c' }}>
                  {embeddingProvidersStatus['openai'] ? '(✓ configured)' : '(not configured)'}
                </span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  value={apiKeyInputs.openai}
                  onChange={(e) => setApiKeyInputs({ ...apiKeyInputs, openai: e.target.value })}
                  placeholder={embeddingProvidersStatus['openai'] ? '•••• already configured — leave blank to keep' : 'sk-...'}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn-secondary" onClick={() => saveEmbeddingApiKey('openai')} disabled={!apiKeyInputs.openai.trim()}>
                  Save Key
                </button>
              </div>
            </div>
          )}

          {provider === 'gemini' && (
            <div style={{ marginTop: '16px' }}>
              <label>Gemini Model Name</label>
              <input
                type="text"
                value={model}
                placeholder="text-embedding-004"
                onChange={(e) => setChunking({ ...chunking, embeddingModel: e.target.value })}
              />
              <p className="muted small">Recommended: <code>text-embedding-004</code> (768 dimensions).</p>

              <label style={{ marginTop: '12px' }}>
                Gemini Embedding API Key{' '}
                <span style={{ fontWeight: 400, color: embeddingProvidersStatus['gemini'] ? '#15803d' : '#b91c1c' }}>
                  {embeddingProvidersStatus['gemini'] ? '(✓ configured)' : '(not configured)'}
                </span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  value={apiKeyInputs.gemini}
                  onChange={(e) => setApiKeyInputs({ ...apiKeyInputs, gemini: e.target.value })}
                  placeholder={embeddingProvidersStatus['gemini'] ? '•••• already configured — leave blank to keep' : 'AIzaSy...'}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn-secondary" onClick={() => saveEmbeddingApiKey('gemini')} disabled={!apiKeyInputs.gemini.trim()}>
                  Save Key
                </button>
              </div>
            </div>
          )}

          {provider === 'custom' && (
            <div style={{ marginTop: '16px' }}>
              <label>Custom Endpoint Base URL</label>
              <input
                type="text"
                value={chunking.customEmbeddingBaseUrl ?? 'http://localhost:11434/v1'}
                placeholder="http://localhost:11434/v1"
                onChange={(e) => setChunking({ ...chunking, customEmbeddingBaseUrl: e.target.value })}
              />
              <p className="muted small">e.g. <code>http://localhost:11434/v1</code> for local Ollama, or custom vLLM / TEI server.</p>

              <label style={{ marginTop: '12px' }}>Custom Model Name</label>
              <input
                type="text"
                value={model}
                placeholder="nomic-embed-text"
                onChange={(e) => setChunking({ ...chunking, embeddingModel: e.target.value })}
              />

              <label style={{ marginTop: '12px' }}>Optional API Key / Bearer Token</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  value={apiKeyInputs.custom}
                  onChange={(e) => setApiKeyInputs({ ...apiKeyInputs, custom: e.target.value })}
                  placeholder="Optional token (leave blank if unauthenticated)"
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn-secondary" onClick={() => saveEmbeddingApiKey('custom')} disabled={!apiKeyInputs.custom.trim()}>
                  Save Token
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <button className="btn-primary" onClick={saveChunking}>
              <FiSave /> Save Provider Settings
            </button>
          </div>
        </Card>
      )}

      {tab === 'chunking' && (
        <Card icon={<FiSliders />} title="Document Chunking Strategy">
          <p className="muted">
            Configure how ingested documents (URLs, PDF/DOCX files, raw text) are split before being embedded into the vector store.
          </p>

          <label>
            Chunk Size ({chunking.chunkSize.toLocaleString()} words ≈ {Math.round(chunking.chunkSize * 1.3)} tokens)
          </label>
          <input
            type="range"
            min={20}
            max={800}
            step={10}
            value={chunking.chunkSize}
            onChange={(e) => setChunking({ ...chunking, chunkSize: Number(e.target.value) })}
          />
          <p className="muted small">
            A larger chunk gives the AI broader context per matched segment, while smaller chunks provide pinpoint precision. Default is 220 words.
          </p>

          <label>
            Chunk Overlap ({chunking.overlap.toLocaleString()} words)
          </label>
          <input
            type="range"
            min={0}
            max={Math.max(chunking.chunkSize - 10, 0)}
            step={5}
            value={Math.min(chunking.overlap, Math.max(chunking.chunkSize - 10, 0))}
            onChange={(e) => setChunking({ ...chunking, overlap: Number(e.target.value) })}
          />
          <p className="muted small">
            Number of words shared between successive chunks to prevent sentences from losing context at boundaries. Default is 40 words.
          </p>

          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              background: 'var(--bg-card, #f8fafc)',
              borderRadius: '8px',
              border: '1px solid var(--border, #e2e8f0)',
              fontSize: '13px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '4px' }}>
              <FiInfo /> Chunking Visualization
            </div>
            <div style={{ color: 'var(--text-muted, #64748b)' }}>
              Each chunk will span approximately <strong>{chunking.chunkSize} words</strong>, overlapping by <strong>{chunking.overlap} words</strong> with the next chunk.
              Effective step size: <strong>{Math.max(chunking.chunkSize - chunking.overlap, 10)} new words</strong> per chunk.
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <button className="btn-primary" onClick={saveChunking}>
              <FiSave /> Save Chunking Strategy
            </button>
          </div>
        </Card>
      )}

      {tab === 'thresholds' && (
        <Card icon={<FiDatabase />} title="Vector Similarity Thresholds">
          <p className="muted">
            Fine-tune cosine-similarity cutoffs for semantic knowledge retrieval and semantic answer caching.
          </p>

          <label>
            Knowledge Base Context Threshold ({cache.contextThreshold.toFixed(2)})
          </label>
          <input
            type="range"
            min={0.1}
            max={0.95}
            step={0.01}
            value={cache.contextThreshold}
            onChange={(e) => setCache({ ...cache, contextThreshold: Number(e.target.value) })}
          />
          <p className="muted small">
            Minimum cosine similarity (0 to 1) required for a vector chunk to be included in the AI context.
            If the bot frequently says <em>"I don't have information about that"</em> for topics in your content, lower this threshold (e.g. 0.45 - 0.55).
          </p>

          <label>
            Semantic Cache Threshold ({cache.semanticThreshold.toFixed(2)})
          </label>
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={cache.semanticThreshold}
            onChange={(e) => setCache({ ...cache, semanticThreshold: Number(e.target.value) })}
          />
          <p className="muted small">
            Minimum similarity between incoming user questions to reuse a previously cached AI response. Higher means stricter matching (default 0.88).
          </p>

          <label>
            FAQ Similarity Threshold ({cache.faqThreshold.toFixed(2)})
          </label>
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={cache.faqThreshold}
            onChange={(e) => setCache({ ...cache, faqThreshold: Number(e.target.value) })}
          />
          <p className="muted small">
            Threshold to instantly match and return curated FAQ answers before calling the AI (default 0.90).
          </p>

          <div style={{ marginTop: '20px' }}>
            <button className="btn-primary" onClick={saveThresholds}>
              <FiSave /> Save Thresholds
            </button>
          </div>
        </Card>
      )}

      {tab === 'test' && (
        <Card icon={<FiPlay />} title="Live Vector Generation Test">
          <p className="muted">
            Run a live vector embedding test against your active engine to verify latency, dimensions, and vector output.
          </p>

          <label>Input Text to Vectorize</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <input
              type="text"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Type any sentence or query to embed…"
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={handleTestEmbedding}
              disabled={testing || !testText.trim()}
            >
              {testing ? <InlineSpinner label="Embedding…" /> : <><FiPlay /> Run Test</>}
            </button>
          </div>

          {testResult && (
            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                background: 'var(--bg-card, #f8fafc)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                  borderBottom: '1px solid var(--border, #e2e8f0)',
                  paddingBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 600 }}>
                  <FiCheckCircle /> Vector Generated Successfully
                </div>
                <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                  {testResult.durationMs} ms
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <span className="muted small">Provider</span>
                  <div style={{ fontWeight: 600 }}>{testResult.provider === 'local' ? 'Free Local (Xenova)' : 'Cloud OpenAI'}</div>
                </div>
                <div>
                  <span className="muted small">Model</span>
                  <div style={{ fontWeight: 600 }}>{testResult.model}</div>
                </div>
                <div>
                  <span className="muted small">Vector Dimensions</span>
                  <div style={{ fontWeight: 600 }}>{testResult.dimensions} dims</div>
                </div>
                <div>
                  <span className="muted small">Generation Speed</span>
                  <div style={{ fontWeight: 600 }}>{testResult.durationMs} ms</div>
                </div>
              </div>

              <div>
                <span className="muted small">Vector Preview (first 8 values of {testResult.dimensions})</span>
                <div
                  style={{
                    marginTop: '4px',
                    padding: '8px 12px',
                    background: '#0f172a',
                    color: '#38bdf8',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    wordBreak: 'break-all',
                  }}
                >
                  [{testResult.sample.map((n) => n.toFixed(5)).join(', ')}, …]
                </div>
              </div>
            </div>
          )}

          {testError && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#b91c1c',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FiAlertCircle /> {testError}
            </div>
          )}
        </Card>
      )}

      {tab === 'overview' && (
        <Card icon={<FiActivity />} title="Knowledge Base Index & Vector Overview">
          <p className="muted">
            Summary of documents, chunk counts, and active vector configurations.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '12px' }}>
            <div
              style={{
                padding: '16px',
                background: 'var(--bg-card, #f8fafc)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary, #3b82f6)', marginBottom: '8px' }}>
                <FiFileText /> <strong>Total Documents</strong>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>
                {stats?.totalDocuments ?? '—'}
              </div>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Ready: {stats?.documentsByStatus.ready ?? 0} | Processing: {stats?.documentsByStatus.processing ?? 0} | Failed: {stats?.documentsByStatus.failed ?? 0}
              </p>
            </div>

            <div
              style={{
                padding: '16px',
                background: 'var(--bg-card, #f8fafc)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', marginBottom: '8px' }}>
                <FiLayers /> <strong>Active Vector Engine</strong>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>
                {provider === 'local' ? 'Local ONNX (Free)' : 'OpenAI Cloud'}
              </div>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                {provider === 'local' ? 'all-MiniLM-L6-v2 (384d)' : `${model} (1536d)`}
              </p>
            </div>

            <div
              style={{
                padding: '16px',
                background: 'var(--bg-card, #f8fafc)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6', marginBottom: '8px' }}>
                <FiSliders /> <strong>Chunk Size / Overlap</strong>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>
                {chunking.chunkSize} / {chunking.overlap} words
              </div>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Cosine context cutoff: {cache.contextThreshold.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>
      )}
      </ReadOnlyGuard>
    </div>
  );
}
