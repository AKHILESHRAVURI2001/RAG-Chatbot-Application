import { FiPenTool, FiSave } from 'react-icons/fi';
import type { WidgetSettings } from '../../shared';
import Card from '../ui/Card';
import { FormField, FormInput, FormSelect } from '../ui/FormField';

interface WidgetBasicTabProps {
  widget: WidgetSettings;
  setWidget: (w: WidgetSettings) => void;
  onSave: () => void;
}

export default function WidgetBasicTab({ widget, setWidget, onSave }: WidgetBasicTabProps) {
  return (
    <Card icon={<FiPenTool />} title="Basic info">
      <FormField label="Title" description="The main header title displayed on the chat widget">
        <FormInput value={widget.title} onChange={(e) => setWidget({ ...widget, title: e.target.value })} />
      </FormField>

      <FormField label="Description" description="Small subtitle under title (supports HTML & links)">
        <FormInput
          placeholder='e.g. Ask us anything or visit <a href="/contact">contact page</a>'
          value={widget.description}
          onChange={(e) => setWidget({ ...widget, description: e.target.value })}
        />
      </FormField>

      <FormField label="Header Note Banner" description="Dismissible banner below header (supports HTML & links)">
        <FormInput
          placeholder='e.g. For urgent inquiries, email <a href="mailto:support@example.com">support</a>'
          value={widget.note}
          onChange={(e) => setWidget({ ...widget, note: e.target.value })}
        />
      </FormField>

      <FormField label='"Powered by" Footer Text' description="Footer attribution line (supports HTML & links)">
        <FormInput
          placeholder='e.g. Powered by <a href="https://example.com">Company Name</a>'
          value={widget.poweredByText}
          onChange={(e) => setWidget({ ...widget, poweredByText: e.target.value })}
        />
      </FormField>

      <FormField label="Widget Position" description="Screen corner where the floating chat widget launcher rests">
        <FormSelect
          value={widget.position ?? 'bottom-right'}
          onChange={(e) => setWidget({ ...widget, position: e.target.value as any })}
        >
          <option value="bottom-right">Bottom Right (Default)</option>
          <option value="bottom-left">Bottom Left</option>
          <option value="top-right">Top Right</option>
          <option value="top-left">Top Left</option>
        </FormSelect>
      </FormField>

      <div style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={onSave}><FiSave /> Save Basic Info</button>
      </div>
    </Card>
  );
}
