import React from 'react';
import Card from './Card';
import { Badge } from './Badge';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'primary';
  trend?: string;
  className?: string;
  iconBgColor?: string;
  iconColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  subtitle,
  badgeText,
  badgeVariant = 'info',
  trend,
  className = '',
  iconBgColor = 'bg-indigo-50 dark:bg-indigo-950/40',
  iconColor = 'text-indigo-600 dark:text-indigo-400',
}) => {
  return (
    <Card className={`stat-card relative overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            {title}
          </p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {value}
            </h3>
            {badgeText && (
              <Badge variant={badgeVariant} size="sm">
                {badgeText}
              </Badge>
            )}
          </div>
          {(subtitle || trend) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
              {trend && <span className="font-semibold text-emerald-600 dark:text-emerald-400">{trend}</span>}
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div
            className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${iconBgColor} ${iconColor}`}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

export default StatCard;
