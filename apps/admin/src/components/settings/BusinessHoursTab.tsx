import { FiClock, FiSave } from 'react-icons/fi';
import type { BusinessHoursSettings } from '../../shared';
import Card from '../ui/Card';
import Toggle from '../ui/Toggle';

interface BusinessHoursTabProps {
  businessHours: BusinessHoursSettings;
  setBusinessHours: (b: BusinessHoursSettings) => void;
  onSave: () => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function BusinessHoursTab({ businessHours, setBusinessHours, onSave }: BusinessHoursTabProps) {
  return (
    <Card icon={<FiClock />} title="Business hours">
      <p className="muted">
        Restrict the chatbot to specific days/hours instead of (or alongside) the manual toggle above — outside these
        hours, real site visitors see the closed message below instead of being able to send a message. Evaluated in
        the timezone you set here, not the visitor's own.
      </p>
      <Toggle
        checked={businessHours.enabled}
        onChange={(v) => setBusinessHours({ ...businessHours, enabled: v })}
        label="Restrict to business hours"
      />
      {businessHours.enabled && (
        <>
          <label>Days open</label>
          <div className="icon-picker-row">
            {DAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                className={`icon-preset ${businessHours.days.includes(day) ? 'active' : ''}`}
                style={{ width: 'auto', padding: '0 10px', fontSize: 13, fontWeight: 600 }}
                onClick={() =>
                  setBusinessHours({
                    ...businessHours,
                    days: businessHours.days.includes(day)
                      ? businessHours.days.filter((d) => d !== day)
                      : [...businessHours.days, day].sort(),
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="card-row">
            <div>
              <label>Opens</label>
              <input
                type="time"
                value={businessHours.openTime}
                onChange={(e) => setBusinessHours({ ...businessHours, openTime: e.target.value })}
              />
            </div>
            <div>
              <label>Closes</label>
              <input
                type="time"
                value={businessHours.closeTime}
                onChange={(e) => setBusinessHours({ ...businessHours, closeTime: e.target.value })}
              />
            </div>
          </div>
          <label>Timezone (IANA name, e.g. Europe/London)</label>
          <input value={businessHours.timezone} onChange={(e) => setBusinessHours({ ...businessHours, timezone: e.target.value })} />
          <label>Message shown outside these hours</label>
          <input
            value={businessHours.closedMessage}
            onChange={(e) => setBusinessHours({ ...businessHours, closedMessage: e.target.value })}
          />
        </>
      )}
      <button className="btn-primary" onClick={onSave}>
        <FiSave /> Save
      </button>
    </Card>
  );
}
