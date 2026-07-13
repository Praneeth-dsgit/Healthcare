/**
 * Shared decision-making flows for common care choices.
 */
import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { engagementService } from '../../services/engagementService';
import { PortalPageShell, PortalPageHero } from './portalPageLayout';

type Option = { id: string; label: string; pros?: string[]; cons?: string[] };

const TOPICS = [
  { id: 'telemedicine_vs_in_person', label: 'Telemedicine vs in-person visit' },
  { id: 'screening_options', label: 'Preventive screening options' },
  { id: 'referral_consent', label: 'Referral record sharing' },
];

const DecisionAidFlow: React.FC = () => {
  const [topic, setTopic] = useState(TOPICS[0].id);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await engagementService.createDecisionAid(topic);
      if (result.success) {
        setSessionId(result.session_id);
        setOptions(result.options || []);
        setChosen('');
      } else {
        setMessage(result.error || 'Could not start decision aid');
      }
    } finally {
      setLoading(false);
    }
  };

  const complete = async () => {
    if (!sessionId || !chosen) return;
    setLoading(true);
    try {
      const result = await engagementService.completeDecisionAid(sessionId, chosen, {
        importance: 'patient_preference',
      });
      setMessage(result.success
        ? 'Preference saved. Your care team can use this for shared decision-making.'
        : result.error || 'Could not save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalPageShell>
      <PortalPageHero
        title="Shared decision-making"
        subtitle="Compare options, capture what matters to you, and share preferences with your care team."
        icon={<Scale />}
      />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-200">
          {message}
        </div>
      )}

      <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
        <label className="mb-2 block text-sm font-semibold text-slate-200">Choose a topic</label>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        >
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={loading}
          onClick={start}
          className="rounded-xl bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Start comparison'}
        </button>
      </section>

      {options.length > 0 && (
        <section className="space-y-3">
          {options.map((opt) => (
            <label
              key={opt.id}
              className={`block cursor-pointer rounded-2xl border p-4 ${
                chosen === opt.id ? 'border-teal-400 bg-teal-500/10' : 'border-slate-700 bg-slate-900/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="decision"
                  checked={chosen === opt.id}
                  onChange={() => setChosen(opt.id)}
                  className="mt-1 accent-teal-500"
                />
                <div>
                  <div className="font-bold text-slate-100">{opt.label}</div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                    <div>
                      <div className="font-semibold text-emerald-300">Pros</div>
                      <ul className="list-disc pl-4">
                        {(opt.pros || []).map((p) => <li key={p}>{p}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="font-semibold text-amber-300">Cons</div>
                      <ul className="list-disc pl-4">
                        {(opt.cons || []).map((c) => <li key={c}>{c}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </label>
          ))}
          <button
            type="button"
            disabled={!chosen || loading}
            onClick={complete}
            className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            Save my preference
          </button>
        </section>
      )}
    </PortalPageShell>
  );
};

export default DecisionAidFlow;
