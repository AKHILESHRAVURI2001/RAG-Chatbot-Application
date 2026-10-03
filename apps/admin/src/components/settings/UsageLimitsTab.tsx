import type { CSSProperties } from 'react';
import { FiSave, FiShield, FiClock, FiAlertTriangle, FiZap } from 'react-icons/fi';
import type { LimitsSettings } from '../../shared';
import Card from '../ui/Card';

interface UsageLimitsTabProps {
  limits: LimitsSettings;
  setLimits: (l: LimitsSettings) => void;
  onSave: () => void;
}

const numberInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 8,
};

export default function UsageLimitsTab({ limits, setLimits, onSave }: UsageLimitsTabProps) {
  const isEnabled = limits.enabled !== false;

  return (
    <Card icon={<FiShield />} title="Rate Limiting & Usage Limits">
      <p className="muted" style={{ marginBottom: 20 }}>
        Control how many messages visitors can send in a rolling time window. Protects against spam bots, rapid script queries, and runaway LLM costs.
      </p>

      {/* Enable / Disable Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: isEnabled ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isEnabled ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 10, marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 600, color: isEnabled ? '#166534' : '#475569' }}>
            {isEnabled ? '🛡️ Rate Limiting Active' : '⚠️ Rate Limiting Disabled'}
          </div>
          <div style={{ fontSize: 13, color: isEnabled ? '#15803d' : '#64748b', marginTop: 2 }}>
            {isEnabled ? 'Sessions exceeding quotas will be paused automatically.' : 'Visitors can send unlimited messages without quota enforcement.'}
          </div>
        </div>
        <label className="toggle-switch" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setLimits({ ...limits, enabled: e.target.checked })}
          />
          <span className="slider round"></span>
        </label>
      </div>

      {isEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Max Messages & Window */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1e293b' }}>
                <span>Max Messages per Session</span>
                <span style={{ color: 'var(--admin-primary, #4f46e5)', fontWeight: 700 }}>{limits.sessionMessageLimit} msgs</span>
              </label>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 12px' }}>
                Total user turns allowed per visitor within the rolling window. Enter a number between 1 and 200.
              </p>
              <input
                type="number"
                min={1}
                max={200}
                value={limits.sessionMessageLimit}
                onChange={(e) => setLimits({ ...limits, sessionMessageLimit: Number(e.target.value) })}
                style={numberInputStyle}
              />
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1e293b' }}>
                <span>Rolling Window Duration</span>
                <span style={{ color: 'var(--admin-primary, #4f46e5)', fontWeight: 700 }}>{limits.sessionMessageWindowHours} hours</span>
              </label>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 12px' }}>
                Time window after which visitor message counters automatically roll off. Enter hours, between 0.5 and 168 (7 days).
              </p>
              <input
                type="number"
                min={0.5}
                max={168}
                step={0.5}
                value={limits.sessionMessageWindowHours}
                onChange={(e) => setLimits({ ...limits, sessionMessageWindowHours: Number(e.target.value) })}
                style={numberInputStyle}
              />
            </div>
          </div>

          {/* Burst Limit & Auto-Block Duration */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1e293b' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiZap color="#f59e0b" /> Burst Protection (per min)</span>
                <span style={{ color: '#d97706', fontWeight: 700 }}>{limits.burstLimitPerMinute ?? 6} msgs/min</span>
              </label>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 12px' }}>
                Prevents rapid spam clicking or automated flooding within 60 seconds. Enter a number between 2 and 30.
              </p>
              <input
                type="number"
                min={2}
                max={30}
                value={limits.burstLimitPerMinute ?? 6}
                onChange={(e) => setLimits({ ...limits, burstLimitPerMinute: Number(e.target.value) })}
                style={numberInputStyle}
              />
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1e293b' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiClock color="#3b82f6" /> Auto-Pause Duration</span>
                <span style={{ color: '#2563eb', fontWeight: 700 }}>{limits.autoBlockMinutes ?? 30} mins</span>
              </label>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 12px' }}>
                How long the session stays paused before automatically unblocking. Enter minutes, between 5 and 1440 (24 hours).
              </p>
              <input
                type="number"
                min={5}
                max={1440}
                value={limits.autoBlockMinutes ?? 30}
                onChange={(e) => setLimits({ ...limits, autoBlockMinutes: Number(e.target.value) })}
                style={numberInputStyle}
              />
            </div>
          </div>

          {/* Registered Users Message Limit */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1e293b' }}>
              <span>Registered / Logged-In User Limit</span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>
                {limits.registeredUserMessageLimit ? `${limits.registeredUserMessageLimit} msgs` : 'Same as session limit'}
              </span>
            </label>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 12px' }}>
              Lifetime message quota for visitors who sign up or log in — it does not reset automatically; reset an individual user's count from Admin &gt; Chat Users (Visitors). Enter a number between 10 and 500, or leave blank to match the session limit above.
            </p>
            <input
              type="number"
              min={10}
              max={500}
              placeholder="Leave blank to match session limit"
              value={limits.registeredUserMessageLimit ?? ''}
              onChange={(e) => setLimits({ ...limits, registeredUserMessageLimit: e.target.value ? Number(e.target.value) : undefined })}
              style={numberInputStyle}
            />
          </div>

          {/* Custom Exceeded Message */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
              <FiAlertTriangle color="#f59e0b" /> Custom Limit Reached Notice
            </label>
            <input
              type="text"
              placeholder="You've reached the message limit. Please wait a moment before asking again."
              value={limits.customLimitMessage || ''}
              onChange={(e) => setLimits({ ...limits, customLimitMessage: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Message displayed to the visitor when they hit either the burst or rolling message quota.
            </p>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button className="btn-primary" onClick={onSave}>
          <FiSave /> Save Rate Limit Settings
        </button>
      </div>
    </Card>
  );
}
