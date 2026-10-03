import React from 'react';

export type BadgeVariant = 'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'primary' | 'indigo' | 'purple' | 'teal' | 'rose';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  bg?: string;
  color?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: '#f0fdf4', color: '#166534' },
  info: { bg: '#eff6ff', color: '#1d4ed8' },
  warning: { bg: '#fef3c7', color: '#b45309' },
  danger: { bg: '#fef2f2', color: '#991b1b' },
  neutral: { bg: '#f1f5f9', color: '#475569' },
  primary: { bg: '#e0e7ff', color: '#3730a3' },
  indigo: { bg: '#e0e7ff', color: '#3730a3' },
  purple: { bg: '#f3e8ff', color: '#6b21a8' },
  teal: { bg: '#ccfbf1', color: '#0f766e' },
  rose: { bg: '#ffe4e6', color: '#be123c' },
};

const SIZE_STYLES = {
  sm: { padding: '1px 6px', fontSize: 10.5, borderRadius: 10 },
  md: { padding: '2px 8px', fontSize: 11.5, borderRadius: 12 },
  lg: { padding: '4px 10px', fontSize: 12.5, borderRadius: 14 },
};

export function Badge({ variant = 'neutral', size = 'md', bg, color, children, icon, title, style }: BadgeProps) {
  const defaultStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <span
      className="badge"
      title={title}
      style={{
        background: bg || defaultStyle.bg,
        color: color || defaultStyle.color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        ...sizeStyle,
        fontWeight: 600,
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  );
}
