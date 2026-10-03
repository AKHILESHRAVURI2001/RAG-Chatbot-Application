import { useEffect, useState } from 'react';
import { FiCloud, FiSave } from 'react-icons/fi';
import { api } from '../lib/api';
import Toggle from './ui/Toggle';
import Card from './ui/Card';
import { InlineSpinner, PageSpinner } from './ui/Spinner';
import { toast } from './ui/Toast';

export default function FirebaseCredentialCard() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setEnabled(s.firebase.enabled);
        setConfigured(s.firebase.configured);
      })
      .catch((e) => toast.error(e.message ?? 'Failed to load Firebase settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function saveCredential() {
    try {
      const updated = await api.updateFirebase({ enabled, serviceAccountJson: jsonInput.trim() || undefined });
      setEnabled(updated.enabled);
      setConfigured(updated.configured);
      setJsonInput('');
      setTestResult(null);
      toast.success('Firebase logging settings saved.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save Firebase logging settings.');
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api.testFirebaseConnection());
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <PageSpinner label="Loading…" />;

  return (
    <Card icon={<FiCloud />} title="Firebase logging (optional)">
      <p className="muted">
        Best-effort mirror of every chat message to Firestore — Postgres keeps working exactly as it does today (chat
        history, Chat Logs, exports — nothing here changes), this is purely an extra copy for long-term log storage or
        reporting outside whatever limit your Postgres host imposes. A slow or unreachable Firestore never affects
        real visitors' chats either way.
      </p>
      <Toggle checked={enabled} onChange={setEnabled} label="Mirror chat messages to Firestore" />
      <p className="muted small">
        {configured
          ? '✓ A Firebase credential is currently configured (from .env or pasted below).'
          : 'No Firebase credential configured yet — paste a service-account JSON key below, or set FIREBASE_SERVICE_ACCOUNT_JSON in apps/server/.env.'}
      </p>
      <label>Service-account JSON (paste the whole key file's contents — leave blank to keep what's already saved)</label>
      <textarea
        rows={4}
        placeholder='{"type": "service_account", "project_id": "...", ...}'
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
      />
      <div className="row-gap">
        <button className="btn-primary" onClick={saveCredential}><FiSave /> Save</button>
        <button className="btn-secondary" onClick={testConnection} disabled={testing}>
          {testing ? <InlineSpinner /> : <FiCloud />} Test connection
        </button>
      </div>
      {testResult && (
        <p className="muted small" style={testResult.ok ? undefined : { color: 'var(--danger)' }}>
          {testResult.ok ? '✓ Connected successfully.' : `✕ ${testResult.error}`}
        </p>
      )}
    </Card>
  );
}
