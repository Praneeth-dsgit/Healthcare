/**
 * Front-desk Engagement Console — multi-channel send, event history, KPI strip, campaigns.
 */
import React, { useEffect, useState } from 'react';
import { BarChart3, Send, Users } from 'lucide-react';
import {
  engagementService,
  CareGap,
  EngagementEvent,
  EngagementMetrics,
} from '../services/engagementService';

const CHANNELS = ['in_app', 'email', 'sms', 'whatsapp'];

const FrontDeskEngagementConsole: React.FC = () => {
  const [metrics, setMetrics] = useState<EngagementMetrics | null>(null);
  const [events, setEvents] = useState<EngagementEvent[]>([]);
  const [gaps, setGaps] = useState<CareGap[]>([]);
  const [patientId, setPatientId] = useState('');
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState<string[]>(['in_app', 'email']);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignName, setCampaignName] = useState('Outreach campaign');
  const [campaignPatients, setCampaignPatients] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [m, e, g] = await Promise.all([
        engagementService.getMetrics(30),
        engagementService.getEvents({ limit: 40 }),
        engagementService.getCareGaps(),
      ]);
      if (m.success) setMetrics(m.metrics);
      if (e.success) setEvents(e.events || []);
      if (g.success) setGaps(g.care_gaps || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleChannel = (ch: string) => {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  const send = async () => {
    if (!patientId.trim() || !message.trim() || channels.length === 0) {
      setStatus('Patient ID, message, and at least one channel are required');
      return;
    }
    setStatus('Sending…');
    const result = await engagementService.send({
      patient_id: patientId.trim(),
      message: message.trim(),
      channels,
      personalize: true,
    });
    setStatus(result.success ? `Sent on ${result.channels?.join(', ') || 'channels'}` : result.error || 'Send failed');
    load();
  };

  const runCampaign = async () => {
    const ids = campaignPatients.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!ids.length || !message.trim()) {
      setStatus('Provide patient IDs and a message for the campaign');
      return;
    }
    setStatus('Running campaign…');
    const result = await engagementService.createCampaign({
      name: campaignName || 'Campaign',
      message_template: message,
      channels,
      patient_ids: ids,
      send_now: true,
    });
    setStatus(result.success ? `Campaign #${result.campaign_id} completed` : result.error || 'Campaign failed');
    load();
  };

  const scanGaps = async () => {
    setStatus('Scanning care gaps…');
    const result = await engagementService.scanCareGaps();
    setStatus(result.success ? `Care gaps updated (${result.gaps_touched || 0})` : result.error || 'Scan failed');
    load();
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Patient engagement</p>
        <h2 className="text-2xl font-extrabold text-slate-100">Engagement Console</h2>
        <p className="text-sm text-slate-400">Omnichannel outreach, delivery status, and baseline KPIs</p>
      </div>

      {status && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {status}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Reminders sent', metrics?.reminders_sent ?? '—'],
          ['Show rate', metrics?.show_rate_pct != null ? `${metrics.show_rate_pct}%` : '—'],
          ['Unread portal alerts', metrics?.portal_notifications_unread ?? '—'],
          ['Med check-ins', metrics?.med_checkins ?? '—'],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-1 text-2xl font-black text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Send className="h-5 w-5 text-amber-300" />
            <h3 className="font-bold text-slate-100">Send multi-channel message</h3>
          </div>
          <input
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="Patient ID (e.g. PAT…)"
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Message body"
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <div className="mb-3 flex flex-wrap gap-2">
            {CHANNELS.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => toggleChannel(ch)}
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  channels.includes(ch) ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={send} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950">
              Send now
            </button>
            <button type="button" onClick={scanGaps} className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200">
              Scan care gaps
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-300" />
            <h3 className="font-bold text-slate-100">Campaign builder</h3>
          </div>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            placeholder="Campaign name"
          />
          <textarea
            value={campaignPatients}
            onChange={(e) => setCampaignPatients(e.target.value)}
            rows={3}
            placeholder="Patient IDs (comma or newline separated)"
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <p className="mb-3 text-xs text-slate-400">Uses the message and channels from the send panel.</p>
          <button type="button" onClick={runCampaign} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">
            Run campaign now
          </button>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-300" />
          <h3 className="font-bold text-slate-100">Care-gap worklist</h3>
        </div>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : gaps.length === 0 ? (
          <p className="text-sm text-slate-400">No open care gaps.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {gaps.slice(0, 30).map((g) => (
              <li key={g.care_gap_id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
                <div className="font-semibold text-slate-100">{g.patient_id} · {g.title}</div>
                <div className="text-xs text-slate-400">{g.priority} · {g.gap_type}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
        <h3 className="mb-3 font-bold text-slate-100">Recent delivery status</h3>
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {events.map((e) => (
            <li key={e.event_id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-100">{e.patient_id} · {e.event_type}</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  {e.channel} · {e.status}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{e.message}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default FrontDeskEngagementConsole;
