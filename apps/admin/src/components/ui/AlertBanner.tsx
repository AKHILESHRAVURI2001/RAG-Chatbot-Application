import React from 'react';
import { FiInfo, FiAlertTriangle, FiCheckCircle, FiXCircle } from 'react-icons/fi';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

interface AlertBannerProps {
  type?: AlertType;
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const ALERT_CONFIG: Record<AlertType, { bg: string; color: string; border: string; icon: React.ReactNode }> = {
  info: { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd', icon: <FiInfo /> },
  success: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', icon: <FiCheckCircle /> },
  warning: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', icon: <FiAlertTriangle /> },
  error: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', icon: <FiXCircle /> },
};

export function AlertBanner({ type = 'info', title, children, style }: AlertBannerProps) {
  const config = ALERT_CONFIG[type];

  return (
    <div
      style={{
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        borderRadius: 8,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        fontSize: 13,
        lineHeight: 1.5,
        ...style,
      }}
    >
      <span style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }}>{config.icon}</span>
      <div>
        {title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
