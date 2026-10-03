import { FiCode, FiCopy, FiCheck } from 'react-icons/fi';
import Card from '../ui/Card';

interface HostApiTabProps {
  widgetHostUrl: string;
  updateWidgetHostUrl: (value: string) => void;
  apiUrlOverride: string;
  updateApiUrlOverride: (value: string) => void;
  apiBaseUrl: string;
  isValidHttpUrl: (value: string) => boolean;
  embedSnippet: string;
  copied: boolean;
  onCopy: () => void;
}

export default function HostApiTab({
  widgetHostUrl,
  updateWidgetHostUrl,
  apiUrlOverride,
  updateApiUrlOverride,
  apiBaseUrl,
  isValidHttpUrl,
  embedSnippet,
  copied,
  onCopy,
}: HostApiTabProps) {
  return (
    <Card icon={<FiCode />} title="Host & API URL">
      <p className="muted">
        Build the widget (<code>npm run build:widget</code>) and host <code>widget.js</code> anywhere static
        (Vercel, S3, your own CDN) — the embed snippet below updates as you fill these in.
      </p>
      <div className="embed-fields">
        <div>
          <label>Where you're hosting widget.js</label>
          <input
            placeholder="https://your-widget-host.example.com/widget.js"
            value={widgetHostUrl}
            onChange={(e) => updateWidgetHostUrl(e.target.value)}
            aria-invalid={!isValidHttpUrl(widgetHostUrl)}
          />
          {!isValidHttpUrl(widgetHostUrl) && (
            <p className="muted small" style={{ color: 'var(--danger)' }}>
              Doesn't look like a valid URL — it needs a scheme (https://...) to work in the snippet below.
            </p>
          )}
        </div>
        <div>
          <label>Your API server URL (the <code>data-api</code> attribute)</label>
          <input
            placeholder={apiBaseUrl}
            value={apiUrlOverride}
            onChange={(e) => updateApiUrlOverride(e.target.value)}
            aria-invalid={!isValidHttpUrl(apiUrlOverride)}
          />
          {!isValidHttpUrl(apiUrlOverride) && (
            <p className="muted small" style={{ color: 'var(--danger)' }}>
              Doesn't look like a valid URL — it needs a scheme (https://...) to work in the snippet below.
            </p>
          )}
          <p className="muted small">
            This tells the widget where to send chat requests — it must point at your server's <code>/api</code> base URL.
            Left blank, it defaults to <code>{apiBaseUrl}</code> (this admin panel's own API — correct for local testing).
            Override it here only when the widget will run on a site that talks to a different or production API host.
          </p>
        </div>
      </div>

      <label style={{ marginTop: 16 }}>Your embed snippet</label>
      <pre className="embed-snippet">{embedSnippet}</pre>
      <button className="btn-secondary" onClick={onCopy}>
        {copied ? <><FiCheck /> Copied!</> : <><FiCopy /> Copy snippet</>}
      </button>
    </Card>
  );
}
