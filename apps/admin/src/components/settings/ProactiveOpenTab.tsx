import { FiSave, FiZap } from 'react-icons/fi';
import type { WidgetSettings } from '../../shared';
import Card from '../ui/Card';
import Toggle from '../ui/Toggle';

interface ProactiveOpenTabProps {
  widget: WidgetSettings;
  setWidget: (w: WidgetSettings) => void;
  onSave: () => void;
}

export default function ProactiveOpenTab({ widget, setWidget, onSave }: ProactiveOpenTabProps) {
  return (
    <Card icon={<FiZap />} title="Proactive open">
      <p className="muted">
        A small callout appears near the chat bubble on its own, after the delay below, without the visitor
        clicking anything first — clicking it opens the chat. Shown once per visitor per exact message text below
        (editing the wording later shows it again to a returning visitor).
      </p>
      <Toggle
        checked={widget.proactiveEnabled}
        onChange={(v) => setWidget({ ...widget, proactiveEnabled: v })}
        label="Enable proactive open"
      />
      {widget.proactiveEnabled && (
        <>
          <label>
            Delay before it appears{' '}
            {widget.proactiveDelaySeconds}s
          </label>
          <input
            type="range"
            min={2}
            max={60}
            step={1}
            value={widget.proactiveDelaySeconds}
            onChange={(e) => setWidget({ ...widget, proactiveDelaySeconds: Number(e.target.value) })}
          />
          <label>Message</label>
          <input
            placeholder="e.g. Looking for a property? Ask me anything!"
            value={widget.proactiveMessage}
            onChange={(e) => setWidget({ ...widget, proactiveMessage: e.target.value })}
          />
        </>
      )}
      <button className="btn-primary" onClick={onSave}><FiSave /> Save</button>
    </Card>
  );
}
