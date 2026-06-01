import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accentClass?: string;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  trend,
  accentClass = 'text-sky-300 bg-sky-500/15',
  className = '',
}) => {
  const [iconText, iconBg] = accentClass.split(' ');

  return (
    <div className={`premium-card premium-card-hover p-5 animate-fade-in-up ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="muted-label mb-1">{label}</p>
          <p className="text-2xl font-extrabold tracking-tight text-slate-100">{value}</p>
          {trend && (
            <p className="mt-1 text-xs font-semibold text-emerald-400">{trend}</p>
          )}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon size={22} className={iconText} />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
