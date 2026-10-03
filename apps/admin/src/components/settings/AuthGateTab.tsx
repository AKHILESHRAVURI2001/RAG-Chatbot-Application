import { FiLock, FiSave, FiUserCheck, FiLink, FiGift, FiInfo } from 'react-icons/fi';
import type { WidgetSettings } from '../../shared';
import Card from '../ui/Card';
import Toggle from '../ui/Toggle';

interface AuthGateTabProps {
  widget: WidgetSettings;
  setWidget: (w: WidgetSettings) => void;
  onSave: () => void;
}

export default function AuthGateTab({ widget, setWidget, onSave }: AuthGateTabProps) {
  const isGateEnabled = Boolean(widget.requireLogin);
  const freeQuestions = widget.freeQuestionsBeforeAuth ?? 0;

  return (
    <Card icon={<FiUserCheck />} title="Sign Up / Login Gate & Free Quota">
      <p className="muted" style={{ marginBottom: 20 }}>
        Prompt visitors to sign up or log in to use the AI chatbot. You can keep this completely optional (disabled), require an account immediately, or grant visitors a few free questions before locking the chat.
      </p>

      {/* Main Enable / Disable Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: isGateEnabled ? '#eff6ff' : '#f8fafc',
          border: `1px solid ${isGateEnabled ? '#bfdbfe' : '#e2e8f0'}`,
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, color: isGateEnabled ? '#1e40af' : '#475569' }}>
            {isGateEnabled ? '🔐 Sign Up / Login Gate Active' : '🌐 Open to All Visitors (No Login Required)'}
          </div>
          <div style={{ fontSize: 13, color: isGateEnabled ? '#2563eb' : '#64748b', marginTop: 2 }}>
            {isGateEnabled
              ? freeQuestions > 0
                ? `Visitors get ${freeQuestions} free preview question${freeQuestions === 1 ? '' : 's'} before being asked to sign up.`
                : 'Visitors must sign up or log in immediately before asking any questions.'
              : 'Anyone visiting your website can chat with the AI without logging in.'}
          </div>
        </div>
        <Toggle
          checked={isGateEnabled}
          onChange={(v) => setWidget({ ...widget, requireLogin: v })}
        />
      </div>

      {isGateEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Free preview questions configuration */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1e293b' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FiGift color="#ec4899" /> Free Preview Questions per User
              </span>
              <span style={{ color: '#db2777', fontWeight: 700 }}>
                {freeQuestions === 0 ? 'Immediate Lock (0 free)' : `${freeQuestions} Free Question${freeQuestions === 1 ? '' : 's'}`}
              </span>
            </label>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 12px' }}>
              How many questions a visitor can ask before the widget prompts them to sign up or log in.
            </p>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={freeQuestions}
              onChange={(e) =>
                setWidget({
                  ...widget,
                  freeQuestionsBeforeAuth: Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[
                { label: '0 (Immediate)', val: 0 },
                { label: '1 Free', val: 1 },
                { label: '3 Free', val: 3 },
                { label: '5 Free', val: 5 },
                { label: '10 Free', val: 10 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setWidget({ ...widget, freeQuestionsBeforeAuth: item.val })}
                  style={{
                    padding: '3px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: freeQuestions === item.val ? '1px solid #db2777' : '1px solid #cbd5e1',
                    background: freeQuestions === item.val ? '#fdf2f8' : '#ffffff',
                    color: freeQuestions === item.val ? '#db2777' : '#475569',
                    cursor: 'pointer',
                    fontWeight: freeQuestions === item.val ? 700 : 400,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Public Sign-Up vs Login Only Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              background: widget.allowPublicSignup !== false ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${widget.allowPublicSignup !== false ? '#bbf7d0' : '#fde68a'}`,
              borderRadius: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: widget.allowPublicSignup !== false ? '#15803d' : '#b45309' }}>
                {widget.allowPublicSignup !== false ? '✅ Public Sign-Up Enabled' : '🔒 Login Only Mode (No Public Sign-Up)'}
              </div>
              <div style={{ fontSize: 13, color: widget.allowPublicSignup !== false ? '#166534' : '#92400e', marginTop: 2 }}>
                {widget.allowPublicSignup !== false
                  ? 'Visitors can register their own accounts directly within the chatbot widget.'
                  : 'Visitors CANNOT register themselves. Only users created by an administrator in Settings > Chat Users can log in.'}
              </div>
            </div>
            <Toggle
              checked={widget.allowPublicSignup !== false}
              onChange={(v) => setWidget({ ...widget, allowPublicSignup: v })}
            />
          </div>

          {/* URLs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
                <FiLink color="var(--admin-primary, #4f46e5)" /> Sign Up Page URL
              </label>
              <input
                type="text"
                placeholder="/signup or https://yoursite.com/signup"
                value={widget.signupUrl ?? '/signup'}
                onChange={(e) => setWidget({ ...widget, signupUrl: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Target link for the <strong>🚀 Sign Up</strong> button on the widget auth card.
              </p>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
                <FiLock color="var(--admin-primary, #4f46e5)" /> Log In Page URL
              </label>
              <input
                type="text"
                placeholder="/login or https://yoursite.com/login"
                value={widget.loginUrl ?? '/login'}
                onChange={(e) => setWidget({ ...widget, loginUrl: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Target link for the <strong>🔑 Log In</strong> button on the widget auth card.
              </p>
            </div>
          </div>

          {/* Prompt Title & Message */}
          <div>
            <label style={{ fontWeight: 600, color: '#1e293b', marginBottom: 6, display: 'block' }}>
              Auth Card Title
            </label>
            <input
              type="text"
              placeholder="Sign up or Log in to continue"
              value={widget.loginPromptTitle ?? 'Sign up or Log in to continue'}
              onChange={(e) => setWidget({ ...widget, loginPromptTitle: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 600, color: '#1e293b', marginBottom: 6, display: 'block' }}>
              Auth Card Message
            </label>
            <textarea
              rows={2}
              placeholder="Please create an account or sign in to ask questions and receive instant AI answers."
              value={
                widget.loginPromptMessage ??
                'Please create an account or sign in to ask questions and receive instant AI answers.'
              }
              onChange={(e) => setWidget({ ...widget, loginPromptMessage: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Integration hint */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <FiInfo style={{ flexShrink: 0, marginTop: 2, color: '#6366f1' }} />
            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
              <strong>Bypassing for Logged-In Users:</strong> When your website user is already logged in, initialize the widget with their ID or session token (<code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4 }}>userId</code> or <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4 }}>authToken</code>) to automatically bypass this prompt.
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button className="btn-primary" onClick={onSave}>
          <FiSave /> Save Sign Up Gate Settings
        </button>
      </div>
    </Card>
  );
}
