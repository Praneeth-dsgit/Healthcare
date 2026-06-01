/**
 * Shared layout primitives for patient portal pages (hero + shell).
 */

import React from 'react';

export const PortalPageShell: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8 animate-fade-in-up ${className}`}
  >
    {children}
  </div>
);

export const PortalPageHero: React.FC<{
  eyebrow?: React.ReactNode;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, icon, badges, actions }) => (
  <div className="premium-card w-full overflow-hidden">
    <div className="relative px-5 py-4 sm:px-8 sm:py-5 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-teal-500/12 via-transparent to-violet-500/8" />
      <div className="relative flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg ring-2 ring-teal-400/30 sm:h-14 sm:w-14 [&>svg]:h-6 [&>svg]:w-6 [&>svg]:text-slate-950 sm:[&>svg]:h-7 sm:[&>svg]:w-7">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="mb-0.5 text-xs font-bold uppercase tracking-wide text-teal-300">{eyebrow}</div>
            )}
            <h1 className="section-heading break-words text-2xl font-extrabold leading-tight sm:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 max-w-3xl text-xs leading-snug text-slate-400 sm:text-sm">{subtitle}</p>
            )}
            {badges && <div className="mt-1.5 flex flex-wrap items-center gap-2">{badges}</div>}
          </div>
        </div>
        {actions && (
          <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:max-w-xl lg:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  </div>
);

export const PortalLoading: React.FC<{ message?: string }> = ({
  message = 'Loading…',
}) => (
  <PortalPageShell>
    <div className="premium-card flex items-center justify-center p-12">
      <div className="text-center">
        <div className="healthcare-loading mx-auto mb-3" />
        <p className="font-semibold text-slate-200">{message}</p>
      </div>
    </div>
  </PortalPageShell>
);

export const portalInputClass =
  'form-field w-full px-3 py-2.5 text-sm transition-all duration-200';

export const PortalStatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  accent?: 'sky' | 'amber' | 'emerald' | 'violet';
}> = ({ label, value, icon, accent = 'sky' }) => {
  const valueColors = {
    sky: 'text-sky-300',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    violet: 'text-violet-300',
  };
  return (
    <div className="soft-panel flex items-center justify-between p-5 ring-1 ring-teal-500/15">
      <div>
        <p className="muted-label text-xs">{label}</p>
        <p className={`mt-1 text-2xl font-extrabold tabular-nums ${valueColors[accent]}`}>{value}</p>
      </div>
      <div className="text-teal-300/80">{icon}</div>
    </div>
  );
};
