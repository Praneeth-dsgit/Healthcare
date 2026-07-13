/**
 * SDOH screening + resource directory for patient portal.
 */
import React, { useEffect, useState } from 'react';
import { ExternalLink, HeartHandshake } from 'lucide-react';
import { engagementService, SdohResource } from '../../services/engagementService';
import { PortalPageShell, PortalPageHero, PortalLoading } from './portalPageLayout';

const SDOHScreening: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resources, setResources] = useState<SdohResource[]>([]);
  const [form, setForm] = useState({
    transportation_need: false,
    financial_stress: false,
    housing_instability: false,
    food_insecurity: false,
    health_literacy_score: 3,
    notes: '',
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [a, r] = await Promise.all([
          engagementService.getSdohAssessment(),
          engagementService.getSdohResources(),
        ]);
        if (a.success && a.assessment) {
          setForm({
            transportation_need: !!a.assessment.transportation_need,
            financial_stress: !!a.assessment.financial_stress,
            housing_instability: !!a.assessment.housing_instability,
            food_insecurity: !!a.assessment.food_insecurity,
            health_literacy_score: a.assessment.health_literacy_score || 3,
            notes: a.assessment.notes || '',
          });
        }
        if (r.success) setResources(r.resources || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await engagementService.saveSdohAssessment(form);
      setMessage(result.success ? 'Support needs saved. Resources below may help.' : result.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PortalPageShell>
        <PortalLoading message="Loading support screening…" />
      </PortalPageShell>
    );
  }

  return (
    <PortalPageShell>
      <PortalPageHero
        title="Support beyond clinical care"
        subtitle="Tell us about non-clinical needs so we can point you to helpful resources."
        icon={<HeartHandshake />}
      />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-200">
          {message}
        </div>
      )}

      <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-3 text-sm text-slate-200">
        {[
          ['transportation_need', 'I sometimes need help getting to appointments'],
          ['financial_stress', 'Medical costs are a concern for me'],
          ['housing_instability', 'Housing stability is a concern'],
          ['food_insecurity', 'I sometimes worry about having enough food'],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={(form as any)[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
              className="h-4 w-4 accent-teal-500"
            />
          </label>
        ))}
        <label className="block text-xs text-slate-400">
          Health literacy comfort (1 = need plain language help, 5 = very comfortable)
          <input
            type="range"
            min={1}
            max={5}
            value={form.health_literacy_score}
            onChange={(e) => setForm((f) => ({ ...f, health_literacy_score: Number(e.target.value) }))}
            className="mt-2 w-full"
          />
          <span className="text-slate-200">Score: {form.health_literacy_score}</span>
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Anything else our care team should know?"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          rows={3}
        />
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-xl bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save screening'}
        </button>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-100">Resource directory</h2>
        <ul className="space-y-3">
          {resources.map((r) => (
            <li key={r.resource_id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="text-xs uppercase tracking-wide text-teal-300">{r.category}</div>
              <div className="font-semibold text-slate-100">{r.title}</div>
              <p className="mt-1 text-sm text-slate-400">{r.description}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {r.phone && <span className="text-slate-300">{r.phone}</span>}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-300 hover:underline">
                    Open <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </PortalPageShell>
  );
};

export default SDOHScreening;
