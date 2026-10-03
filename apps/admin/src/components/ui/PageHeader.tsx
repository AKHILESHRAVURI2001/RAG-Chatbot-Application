import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export function PageHeader({ title, description, actions, icon }: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
      <div>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px 0' }}>
          {icon} {title}
        </h2>
        {description && <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{description}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

export default PageHeader;
