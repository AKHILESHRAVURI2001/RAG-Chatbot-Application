import { useState, type ChangeEvent } from 'react';
import { FiPenTool, FiSave, FiTrash2, FiLink, FiImage } from 'react-icons/fi';
import type { WidgetSettings } from '../../shared';
import Card from '../ui/Card';
import ColorPicker from '../ui/ColorPicker';
import { InlineSpinner } from '../ui/Spinner';

interface ColorIconTabProps {
  widget: WidgetSettings;
  setWidget: (w: WidgetSettings) => void;
  onSave: () => void;
  uploadingIcon: boolean;
  onIconUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onIconRemove: () => void;
}

const EMOJI_PRESETS = ['💬', '🤖', '💭', '❓', '🏠', '🛎️', '📩', '✨', '👋', '🎧'];

function isImageUrl(val: string): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/') ||
    /\.(png|jpe?g|svg|webp|gif|ico)(\?.*)?$/i.test(trimmed)
  );
}

export default function ColorIconTab({
  widget,
  setWidget,
  onSave,
  uploadingIcon,
  onIconUpload,
  onIconRemove,
}: ColorIconTabProps) {
  const [urlInput, setUrlInput] = useState(isImageUrl(widget.icon) ? widget.icon : '');

  function onColorChange(color: string) {
    setWidget({ ...widget, primaryColor: color });
    document.documentElement.style.setProperty('--mcb-primary', color);
    window.dispatchEvent(new CustomEvent('mcb:config-update', { detail: { primaryColor: color } }));
  }

  function onEmojiSelect(emoji: string) {
    setUrlInput('');
    setWidget({ ...widget, icon: emoji });
    window.dispatchEvent(new CustomEvent('mcb:config-update', { detail: { icon: emoji, iconSvg: '' } }));
  }

  function onUrlChange(url: string) {
    setUrlInput(url);
    const trimmed = url.trim();
    if (trimmed) {
      setWidget({ ...widget, icon: trimmed });
      window.dispatchEvent(new CustomEvent('mcb:config-update', { detail: { icon: trimmed, iconSvg: '' } }));
    }
  }

  const isCurrentUrl = isImageUrl(widget.icon);

  return (
    <Card icon={<FiPenTool />} title="Color & Icon">
      <label>Primary Theme Color</label>
      <ColorPicker
        value={widget.primaryColor}
        onChange={onColorChange}
        presets={['#4f46e5', '#14b8a6', '#dc2626', '#d97706', '#16a34a', '#0891b2', '#db2777', '#171923']}
      />

      <label style={{ marginTop: '16px' }}>Bubble Icon (Emoji)</label>
      <div className="icon-picker-row">
        {EMOJI_PRESETS.map((ic) => (
          <button
            key={ic}
            type="button"
            className={`icon-preset ${!widget.iconSvg && !isCurrentUrl && widget.icon === ic ? 'active' : ''}`}
            onClick={() => onEmojiSelect(ic)}
          >
            {ic}
          </button>
        ))}
      </div>

      <label style={{ marginTop: '16px' }}>Or Use Image Icon URL</label>
      <div className="row-gap" style={{ alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="url"
            placeholder="https://example.com/logo.png"
            value={urlInput}
            onChange={(e) => onUrlChange(e.target.value)}
            style={{ width: '100%', paddingLeft: '32px' }}
          />
          <FiLink style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--muted)' }} />
        </div>
        {isCurrentUrl && (
          <div
            className="icon-preset active"
            style={{ width: '40px', height: '40px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Preview"
          >
            <img src={widget.icon} alt="Icon preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        )}
      </div>
      <p className="muted small">
        Paste any hosted PNG, SVG, or WebP image URL. It will render directly as your floating chatbot icon.
      </p>

      <label style={{ marginTop: '16px' }}>Or Upload Custom SVG</label>
      <div className="row-gap" style={{ alignItems: 'center' }}>
        {widget.iconSvg && (
          <span
            className="icon-preset active"
            style={{ cursor: 'default' }}
            title="Current custom icon"
            dangerouslySetInnerHTML={{ __html: widget.iconSvg }}
          />
        )}
        <input type="file" accept=".svg,image/svg+xml" onChange={onIconUpload} disabled={uploadingIcon} />
        {uploadingIcon && <InlineSpinner label="Uploading…" />}
        {widget.iconSvg && (
          <button type="button" className="btn-secondary btn-tiny" onClick={onIconRemove}>
            <FiTrash2 /> Remove SVG
          </button>
        )}
      </div>

      <div style={{ marginTop: '20px' }}>
        <button className="btn-primary" onClick={onSave}><FiSave /> Save Settings</button>
      </div>
    </Card>
  );
}
