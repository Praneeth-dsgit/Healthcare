/**
 * Engagement analytics dashboard for staff / quality reporting.
 */
import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { engagementService, EngagementMetrics } from '../services/engagementService';

const EngagementAnalytics: React.FC = () => {
  const [metrics, setMetrics] = useState<EngagementMetrics | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await engagementService.getMetrics(days);
        if (result.success) setMetrics(result.metrics);
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Quality & engagement</p>
          <h2 className="text-2xl font-extrabold text-slate-100">Engagement analytics</h2>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {loading || !metrics ? (
        <p className="text-sm text-slate-400">Loading metrics…</p>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Reminders sent', metrics.reminders_sent],
              ['Failed sends', metrics.reminders_failed],
              ['Show rate', metrics.show_rate_pct != null ? `${metrics.show_rate_pct}%` : '—'],
              ['Satisfaction avg', metrics.satisfaction_avg || '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                  <Activity className="h-3.5 w-3.5" /> {label}
                </div>
                <div className="mt-1 text-2xl font-black text-slate-100">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
              <h3 className="mb-3 font-bold text-slate-100">By channel</h3>
              <ul className="space-y-2 text-sm">
                {Object.entries(metrics.by_channel || {}).map(([ch, count]) => (
                  <li key={ch} className="flex justify-between rounded-lg bg-slate-950/50 px-3 py-2">
                    <span className="text-slate-300">{ch}</span>
                    <span className="font-bold text-slate-100">{count}</span>
                  </li>
                ))}
                {Object.keys(metrics.by_channel || {}).length === 0 && (
                  <li className="text-slate-400">No channel activity yet</li>
                )}
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
              <h3 className="mb-3 font-bold text-slate-100">By event type</h3>
              <ul className="space-y-2 text-sm">
                {Object.entries(metrics.by_type || {}).map(([t, count]) => (
                  <li key={t} className="flex justify-between rounded-lg bg-slate-950/50 px-3 py-2">
                    <span className="text-slate-300">{t}</span>
                    <span className="font-bold text-slate-100">{count}</span>
                  </li>
                ))}
                {Object.keys(metrics.by_type || {}).length === 0 && (
                  <li className="text-slate-400">No event activity yet</li>
                )}
              </ul>
            </section>
          </div>

          <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-5 text-sm text-slate-300">
            <h3 className="mb-2 font-bold text-slate-100">Appointment adherence</h3>
            <p>Scheduled: {metrics.appointments_scheduled}</p>
            <p>Completed: {metrics.appointments_completed}</p>
            <p>No-shows: {metrics.appointments_no_show}</p>
            <p>Satisfaction responses: {metrics.satisfaction_responses}</p>
            <p className="mt-3 text-xs text-slate-500">
              Export tip: use these KPIs for quality reporting and campaign ROI reviews.
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default EngagementAnalytics;
