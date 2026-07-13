/**
 * Patient Engagement Hub — preferences, care tasks, medication check-in, SDOH & decision aids entry.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCircle, Clock, HeartPulse, MessageSquare, Settings2, ShieldAlert, Sparkles,
} from 'lucide-react';
import {
  engagementService,
  CareGap,
  EngagementEvent,
  EngagementPreferences,
} from '../../services/engagementService';
import {
  PortalPageShell,
  PortalPageHero,
  PortalLoading,
} from './portalPageLayout';

const boolVal = (v: unknown) => v === true || v === 1 || v === '1';

const EngagementHub: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<EngagementPreferences>({});
  const [events, setEvents] = useState<EngagementEvent[]>([]);
  const [gaps, setGaps] = useState<CareGap[]>([]);
  const [risk, setRisk] = useState<{ risk_tier?: string; risk_score?: number } | null>(null);
  const [medName, setMedName] = useState('Daily medication');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        engagementService.getPreferences(),
        engagementService.getTasks(),
      ]);
      if (p.success && p.preferences) setPrefs(p.preferences);
      if (t.success) {
        setEvents(t.events || []);
        setGaps(t.care_gaps || []);
        setRisk(t.risk || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const savePrefs = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await engagementService.updatePreferences({
        channel_in_app: boolVal(prefs.channel_in_app),
        channel_email: boolVal(prefs.channel_email),
        channel_sms: boolVal(prefs.channel_sms),
        channel_whatsapp: boolVal(prefs.channel_whatsapp),
        quiet_hours_start: prefs.quiet_hours_start || null,
        quiet_hours_end: prefs.quiet_hours_end || null,
        appointment_reminders: boolVal(prefs.appointment_reminders),
        medication_reminders: boolVal(prefs.medication_reminders),
        preventive_reminders: boolVal(prefs.preventive_reminders),
      });
      if (result.success) {
        setPrefs(result.preferences || prefs);
        setMessage('Preferences saved');
      } else {
        setMessage(result.error || 'Could not save preferences');
      }
    } finally {
      setSaving(false);
    }
  };

  const checkIn = async (action: 'taken' | 'skipped' | 'snoozed') => {
    const result = await engagementService.logAdherence({
      medication_name: medName || 'medication',
      action,
    });
    setMessage(result.success ? `Logged as ${action}` : result.error || 'Failed');
  };

  const dismissGap = async (id: number) => {
    await engagementService.updateCareGapStatus(id, 'dismissed');
    load();
  };

  if (loading) {
    return (
      <PortalPageShell>
        <PortalLoading message="Loading engagement hub…" />
      </PortalPageShell>
    );
  }

  return (
    <PortalPageShell>
      <PortalPageHero
        title="Engagement Hub"
        subtitle="Manage reminders, care tasks, medication check-ins, and how we reach you."
        icon={<Sparkles />}
      />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-200">
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => navigate('/portal/engagement/sdoh')}
          className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-left hover:border-teal-500/40"
        >
          <ShieldAlert className="mb-2 h-5 w-5 text-amber-300" />
          <div className="font-bold text-slate-100">Support needs (SDOH)</div>
          <div className="text-xs text-slate-400">Transportation, financial, literacy resources</div>
        </button>
        <button
          type="button"
          onClick={() => navigate('/portal/engagement/decisions')}
          className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-left hover:border-teal-500/40"
        >
          <MessageSquare className="mb-2 h-5 w-5 text-sky-300" />
          <div className="font-bold text-slate-100">Shared decisions</div>
          <div className="text-xs text-slate-400">Compare care options and share preferences</div>
        </button>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <HeartPulse className="mb-2 h-5 w-5 text-rose-300" />
          <div className="font-bold text-slate-100">Care engagement risk</div>
          <div className="text-sm text-slate-300 capitalize">
            {risk?.risk_tier || 'low'}
            {typeof risk?.risk_score === 'number' ? ` · score ${risk.risk_score}` : ''}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-teal-300" />
            <h2 className="text-lg font-bold text-slate-100">Notification preferences</h2>
          </div>
          <div className="space-y-3 text-sm text-slate-200">
            {[
              ['channel_in_app', 'In-app'],
              ['channel_email', 'Email'],
              ['channel_sms', 'SMS'],
              ['channel_whatsapp', 'WhatsApp'],
              ['appointment_reminders', 'Appointment reminders'],
              ['medication_reminders', 'Medication reminders'],
              ['preventive_reminders', 'Preventive care reminders'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={boolVal((prefs as Record<string, unknown>)[key])}
                  onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                  className="h-4 w-4 accent-teal-500"
                />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="text-xs text-slate-400">
                Quiet hours start
                <input
                  type="time"
                  value={(prefs.quiet_hours_start || '').toString().slice(0, 5)}
                  onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_start: e.target.value || null }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </label>
              <label className="text-xs text-slate-400">
                Quiet hours end
                <input
                  type="time"
                  value={(prefs.quiet_hours_end || '').toString().slice(0, 5)}
                  onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_end: e.target.value || null }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={savePrefs}
              className="mt-2 rounded-xl bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-300" />
            <h2 className="text-lg font-bold text-slate-100">Medication check-in</h2>
          </div>
          <input
            value={medName}
            onChange={(e) => setMedName(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            placeholder="Medication name"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => checkIn('taken')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Taken</button>
            <button type="button" onClick={() => checkIn('snoozed')} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white">Snooze</button>
            <button type="button" onClick={() => checkIn('skipped')} className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-semibold text-white">Skipped</button>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-sky-300" />
          <h2 className="text-lg font-bold text-slate-100">Open care gaps</h2>
        </div>
        {gaps.length === 0 ? (
          <p className="text-sm text-slate-400">No open care gaps right now.</p>
        ) : (
          <ul className="space-y-3">
            {gaps.map((g) => (
              <li key={g.care_gap_id} className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-slate-100">{g.title}</div>
                  <div className="text-xs text-slate-400">{g.description}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-amber-300">{g.priority}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/portal/appointments/book')}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Book
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissGap(g.care_gap_id)}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-violet-300" />
          <h2 className="text-lg font-bold text-slate-100">Recent engagement</h2>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No engagement events yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.slice(0, 12).map((e) => (
              <li key={e.event_id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-100">{e.title || e.event_type}</span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {e.channel} · {e.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{e.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PortalPageShell>
  );
};

export default EngagementHub;
