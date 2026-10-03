import { FiKey, FiSave } from 'react-icons/fi';
import type { ApiKeySettings } from '../../shared';
import Card from '../ui/Card';

interface ApiKeysTabProps {
  apiKeys: ApiKeySettings;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeySettings>>;
  testingProvider: string | null;
  testResults: Record<string, { healthy: boolean; summary: string }>;
  testKeyPool: (providerName: 'anthropic' | 'openai' | 'gemini' | 'custom') => Promise<void>;
  clearApiKey: (name: keyof ApiKeySettings) => Promise<void>;
  saveApiKeys: () => Promise<void>;
}

export default function ApiKeysTab({
  apiKeys,
  setApiKeys,
  testingProvider,
  testResults,
  testKeyPool,
  clearApiKey,
  saveApiKeys,
}: ApiKeysTabProps) {
  return (
    <Card icon={<FiKey />} title="API keys & Key Pooling">
      <p className="muted">
        Configure one or multiple API keys per provider (separated by commas or newlines). When multiple keys are
        supplied, the system automatically pools them and fails over to the next available key if any key runs out of
        credits, encounters quota exhaustion (429), or hits rate limits.
      </p>
      <p className="muted small" style={{ marginBottom: '16px' }}>
        Keys are stored securely in your database and never exposed back to the browser. Leave any field blank to keep
        what's already configured. Use "Clear" to fall back to the server's .env file.
      </p>
      {(['anthropic', 'openai', 'gemini'] as const).map((name) => {
        const keyCount = apiKeys[name]
          ? apiKeys[name].split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).length
          : 0;
        const isTesting = testingProvider === name;
        const result = testResults[name];

        return (
          <div key={name} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ textTransform: 'capitalize', margin: 0 }}>{name} API keys</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {keyCount > 1 && (
                  <span className="badge" style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px' }}>
                    {keyCount} keys in failover pool
                  </span>
                )}
                {result && (
                  <span
                    className="badge"
                    style={{
                      background: result.healthy ? '#dcfce7' : '#fee2e2',
                      color: result.healthy ? '#15803d' : '#991b1b',
                      fontSize: '11px',
                    }}
                  >
                    {result.summary}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <textarea
                rows={keyCount > 1 ? 3 : 1}
                placeholder={`Paste ${name} key(s) — comma or newline separated`}
                value={apiKeys[name]}
                onChange={(e) => setApiKeys({ ...apiKeys, [name]: e.target.value })}
                style={{ flex: 1, resize: 'vertical' }}
              />
              <button
                className="btn-secondary btn-tiny"
                onClick={() => testKeyPool(name)}
                disabled={isTesting}
                title={`Test ${name} key pool connection and quota`}
              >
                {isTesting ? 'Testing…' : 'Test pool'}
              </button>
              <button className="btn-secondary btn-tiny" onClick={() => clearApiKey(name)}>
                Clear
              </button>
            </div>
          </div>
        );
      })}

      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <label style={{ margin: 0 }}>Custom OpenAI-compatible API key</label>
          {testResults['custom'] && (
            <span
              className="badge"
              style={{
                background: testResults['custom'].healthy ? '#dcfce7' : '#fee2e2',
                color: testResults['custom'].healthy ? '#15803d' : '#991b1b',
                fontSize: '11px',
              }}
            >
              {testResults['custom'].summary}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="password"
            placeholder="sk-..."
            value={apiKeys.custom}
            onChange={(e) => setApiKeys({ ...apiKeys, custom: e.target.value })}
            style={{ flex: 1 }}
          />
          <button
            className="btn-secondary btn-tiny"
            onClick={() => testKeyPool('custom')}
            disabled={testingProvider === 'custom'}
            title="Test custom endpoint connection"
          >
            {testingProvider === 'custom' ? 'Testing…' : 'Test pool'}
          </button>
          <button className="btn-secondary btn-tiny" onClick={() => clearApiKey('custom')}>
            Clear
          </button>
        </div>
      </div>
      <button className="btn-primary" onClick={saveApiKeys}>
        <FiSave /> Save API keys
      </button>
    </Card>
  );
}
