import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        color: '#64748b',
        width: '100%',
      }}
    >
      {icon && (
        <div style={{ fontSize: '40px', marginBottom: '16px', color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
      )}
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', margin: '0 0 8px 0', textAlign: 'center' }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px 0', maxWidth: '440px', lineHeight: 1.5, textAlign: 'center' }}>
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
