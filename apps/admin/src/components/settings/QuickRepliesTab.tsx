import { FiMessageCircle, FiPlus, FiSave, FiTrash2 } from 'react-icons/fi';
import type { WidgetSettings } from '../../shared';
import Card from '../ui/Card';

interface QuickRepliesTabProps {
  widget: WidgetSettings;
  setWidget: (w: WidgetSettings) => void;
  onSave: () => void;
}

export default function QuickRepliesTab({ widget, setWidget, onSave }: QuickRepliesTabProps) {
  return (
    <Card icon={<FiMessageCircle />} title="Quick replies">
      <p className="muted">
        Clickable starter prompts shown before a visitor's first message — not limited to AI-related topics, any
        label and message pair you want (e.g. "Get web hosting" → "What web hosting plans do you offer?"). Up to 6.
      </p>
      {widget.quickReplies.map((qr, i) => (
        <div key={i} className="quick-reply-row">
          <input
            placeholder="Button label, e.g. Get web hosting"
            value={qr.label}
            onChange={(e) => {
              const next = [...widget.quickReplies];
              next[i] = { ...next[i], label: e.target.value };
              setWidget({ ...widget, quickReplies: next });
            }}
          />
          <input
            placeholder="Message it sends, e.g. What web hosting plans do you offer?"
            value={qr.message}
            onChange={(e) => {
              const next = [...widget.quickReplies];
              next[i] = { ...next[i], message: e.target.value };
              setWidget({ ...widget, quickReplies: next });
            }}
          />
          <button
            className="btn-icon btn-danger"
            title="Remove"
            onClick={() => setWidget({ ...widget, quickReplies: widget.quickReplies.filter((_, idx) => idx !== i) })}
          >
            <FiTrash2 />
          </button>
        </div>
      ))}
      {widget.quickReplies.length < 6 && (
        <button
          className="btn-secondary"
          onClick={() => setWidget({ ...widget, quickReplies: [...widget.quickReplies, { label: '', message: '' }] })}
        >
          <FiPlus /> Add quick reply
        </button>
      )}
      <button className="btn-primary" onClick={onSave}>
        <FiSave /> Save
      </button>
    </Card>
  );
}
