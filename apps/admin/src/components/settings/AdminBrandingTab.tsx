import { FiBox, FiSave } from 'react-icons/fi';
import type { WidgetSettings } from '../../shared';
import Card from '../ui/Card';
import ColorPicker from '../ui/ColorPicker';

interface AdminBrandingTabProps {
  widget: WidgetSettings;
  setWidget: (w: WidgetSettings) => void;
  onSave: () => void;
}

export default function AdminBrandingTab({ widget, setWidget, onSave }: AdminBrandingTabProps) {
  return (
    <Card icon={<FiBox />} title="Admin panel branding">
      <p className="muted">Shown in this admin panel's own header, next to the logo — not shown to chat visitors (that's the widget's own "Title" in the Widget tab).</p>
      <label>Company name</label>
      <input
        placeholder="e.g. Company Name"
        value={widget.companyName}
        onChange={(e) => setWidget({ ...widget, companyName: e.target.value })}
        style={{ maxWidth: 320 }}
      />
      <label>Panel color — the header, active nav, buttons and badges throughout this admin panel (separate from the widget's own color in the Widget tab)</label>
      <ColorPicker
        value={widget.adminPrimaryColor}
        onChange={(c) => setWidget({ ...widget, adminPrimaryColor: c })}
        presets={['#6d28d9', '#1a56db', '#0f766e', '#b91c1c', '#b45309', '#166534', '#0e7490', '#1c1e26']}
      />
      <button className="btn-primary" onClick={onSave}><FiSave /> Save</button>
      <p className="muted small">Takes effect immediately (no reload needed) — reflected here, and everywhere else in the panel, as soon as you save.</p>
    </Card>
  );
}
