import { FiPower, FiSave } from 'react-icons/fi';
import type { WidgetSettings } from '../../shared';
import Card from '../ui/Card';
import Toggle from '../ui/Toggle';

interface AvailabilityTabProps {
  widget: WidgetSettings;
  setWidget: (w: WidgetSettings) => void;
  onSave: () => void;
}

export default function AvailabilityTab({ widget, setWidget, onSave }: AvailabilityTabProps) {
  return (
    <Card icon={<FiPower />} title="Chatbot availability">
      <p className="muted">
        Turn the bot off temporarily (maintenance, off-hours, etc.) without losing anything — existing conversations
        stay visible, only new messages from real site visitors are turned away with the message below. Your own
        admin session (floating chat, this preview) keeps working either way, so you can still test while it's paused.
      </p>
      <Toggle checked={widget.enabled} onChange={(v) => setWidget({ ...widget, enabled: v })} label="Chatbot enabled" />
      {!widget.enabled && (
        <>
          <label>Message shown instead, while disabled (supports HTML &amp; links)</label>
          <input
            placeholder='e.g. We are offline. For help, visit <a href="/contact">our support page</a>'
            value={widget.unavailableMessage}
            onChange={(e) => setWidget({ ...widget, unavailableMessage: e.target.value })}
          />
        </>
      )}
      <button className="btn-primary" onClick={onSave}><FiSave /> Save</button>
    </Card>
  );
}
