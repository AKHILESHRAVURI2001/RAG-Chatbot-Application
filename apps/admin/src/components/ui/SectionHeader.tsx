import React from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  style?: React.CSSProperties;
}

export function SectionHeader({ title, description, icon, badge, style }: SectionHeaderProps) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--text-main, #1e293b)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon}
          {title}
        </h4>
        {badge}
      </div>
      {description && <p className="muted small" style={{ margin: '4px 0 0 0', lineHeight: 1.4 }}>{description}</p>}
    </div>
  );
}
