import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Check, User, Stethoscope, FileText, Shield, Search } from 'lucide-react';
import SegmentTabs from '../ui/SegmentTabs';
import {
  referralService,
  type Referral,
  type ReferralPatient,
  type ReferralSpecialist,
  type ReferralRecord,
} from '../../services/referralService';

type SubTab = 'incoming' | 'outgoing' | 'new';

const URGENCY_OPTIONS = [
  { id: 'routine', label: 'Routine' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'emergency', label: 'Emergency' },
] as const;

const ReferralsWorkspace: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('incoming');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [patients, setPatients] = useState<ReferralPatient[]>([]);
  const [specialists, setSpecialists] = useState<ReferralSpecialist[]>([]);
  const [records, setRecords] = useState<ReferralRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState({
    patientId: '',
    patientName: '',
    toDoctorId: 0,
    toDoctor: '',
    specialty: '',
    urgency: 'routine' as Referral['urgency'],
    clinicalNotes: '',
    attachedRecords: [] as string[],
    requestConsent: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specialistSearch, setSpecialistSearch] = useState('');

  const loadReferrals = async () => {
    const dir = subTab === 'incoming' ? 'incoming' : subTab === 'outgoing' ? 'outgoing' : undefined;
    const r = await referralService.getReferrals(dir);
    setReferrals(r.referrals);
  };

  useEffect(() => {
    if (subTab !== 'new') loadReferrals();
  }, [subTab]);

  useEffect(() => {
    if (subTab === 'new') {
      referralService.getPatients().then((r) => setPatients(r.patients));
      referralService.getSpecialists().then((r) => setSpecialists(r.specialists));
    }
  }, [subTab]);

  useEffect(() => {
    if (subTab !== 'new' || !form.patientId) {
      setRecords([]);
      return;
    }

    let cancelled = false;
    setRecordsLoading(true);
    referralService.getRecords(form.patientId).then((r) => {
      if (!cancelled) {
        setRecords(r.records);
        setRecordsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [subTab, form.patientId]);

  const handleStatus = async (id: string, status: Referral['status']) => {
    await referralService.updateReferralStatus(id, status);
    loadReferrals();
  };

  const handleSimulateConsent = async (id: string) => {
    await referralService.simulatePatientConsent(id);
    loadReferrals();
  };

  const handleSubmit = async () => {
    if (!form.toDoctorId) {
      setError('Please select a specialist');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await referralService.createReferral(form);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Failed to send referral');
      return;
    }
    setSubTab('outgoing');
    setWizardStep(0);
    setForm({
      patientId: '',
      patientName: '',
      toDoctorId: 0,
      toDoctor: '',
      specialty: '',
      urgency: 'routine',
      clinicalNotes: '',
      attachedRecords: [],
      requestConsent: true,
    });
  };

  const statusColor = (s: Referral['status']) => {
    const map: Record<string, string> = {
      pending: 'text-amber-300 bg-amber-500/15',
      pending_consent: 'text-orange-300 bg-orange-500/15',
      accepted: 'text-emerald-300 bg-emerald-500/15',
      rejected: 'text-red-300 bg-red-500/15',
      completed: 'text-sky-300 bg-sky-500/15',
    };
    return map[s] || 'text-slate-400 bg-slate-500/15';
  };

  const wizardSteps = ['Patient', 'Specialist', 'Records', 'Notes & Consent'];

  const filteredSpecialists = useMemo(() => {
    const q = specialistSearch.trim().toLowerCase();
    if (!q) return specialists;
    return specialists.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.specialty.toLowerCase().includes(q) ||
        s.facility.toLowerCase().includes(q)
    );
  }, [specialists, specialistSearch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-slate-100">Referrals</h2>
      </div>

      <SegmentTabs
        tabs={[
          { id: 'incoming', label: 'Incoming' },
          { id: 'outgoing', label: 'Outgoing' },
          { id: 'new', label: 'New Referral' },
        ]}
        activeTab={subTab}
        onChange={(id) => setSubTab(id as SubTab)}
      />

      {subTab !== 'new' && (
        <div className="space-y-3">
          {referrals.length === 0 ? (
            <p className="text-sm text-slate-400">No referrals in this view.</p>
          ) : (
            referrals.map((ref) => (
              <div key={ref.id} className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-100">{ref.patientName}</p>
                    <p className="text-sm text-slate-400">
                      {subTab === 'incoming'
                        ? `From ${ref.fromDoctor}`
                        : `From ${ref.fromDoctor} · To ${ref.toDoctor}`}{' '}
                      · {ref.specialty}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{ref.clinicalNotes}</p>
                    {ref.attachedRecords.length > 0 && (
                      <p className="mt-1 text-xs text-sky-400/80">
                        {ref.attachedRecords.length} record{ref.attachedRecords.length === 1 ? '' : 's'} attached
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(ref.status)}`}>
                      {ref.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-500">Consent: {ref.consentStatus}</span>
                  </div>
                </div>
                {subTab === 'incoming' && ref.status === 'pending' && ref.consentStatus === 'approved' && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleStatus(ref.id, 'accepted')}
                      className="primary-button rounded-lg px-3 py-1.5 text-xs font-semibold"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatus(ref.id, 'rejected')}
                      className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold text-red-300"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {subTab === 'outgoing' && ref.status === 'pending_consent' && (
                  <button
                    type="button"
                    onClick={() => handleSimulateConsent(ref.id)}
                    className="mt-3 rounded-lg border border-dashed border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300"
                  >
                    Mark consent as approved
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {subTab === 'new' && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-5">
          <div className="mb-6 flex gap-2">
            {wizardSteps.map((label, i) => (
              <div
                key={label}
                className={`flex-1 rounded-lg py-2 text-center text-xs font-semibold ${
                  i === wizardStep ? 'bg-sky-500/20 text-sky-300' : i < wizardStep ? 'text-emerald-400' : 'text-slate-500'
                }`}
              >
                {i < wizardStep ? <Check className="mx-auto h-4 w-4" /> : label}
              </div>
            ))}
          </div>

          {wizardStep === 0 && (
            <div className="space-y-2">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <User className="h-4 w-4" /> Select patient
              </p>
              {patients.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No patients found. Patients with appointments under your account will appear here.
                </p>
              ) : (
                patients.map((p) => (
                  <button
                    key={p.patient_id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        patientId: p.patient_id,
                        patientName: p.name,
                        attachedRecords: [],
                      })
                    }
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${
                      form.patientId === p.patient_id
                        ? 'border-sky-500/50 bg-sky-500/10'
                        : 'border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <span className="font-medium text-slate-200">{p.name}</span>
                    <span className="text-xs text-slate-500">
                      {p.age}y · {p.gender}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {wizardStep === 1 && (
            <div className="space-y-2">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Stethoscope className="h-4 w-4" /> Select specialist
              </p>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={specialistSearch}
                  onChange={(e) => setSpecialistSearch(e.target.value)}
                  placeholder="Search by name, specialty, or facility…"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500"
                />
              </div>
              {specialists.length === 0 ? (
                <p className="text-sm text-slate-500">No specialists available in the directory.</p>
              ) : filteredSpecialists.length === 0 ? (
                <p className="text-sm text-slate-500">No specialists match your search.</p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {filteredSpecialists.map((s) => (
                  <button
                    key={s.doctor_id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        toDoctorId: s.doctor_id,
                        toDoctor: s.name,
                        specialty: s.specialty,
                      })
                    }
                    className={`flex w-full flex-col rounded-xl border p-3 text-left ${
                      form.toDoctorId === s.doctor_id
                        ? 'border-sky-500/50 bg-sky-500/10'
                        : 'border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <span className="font-medium text-slate-200">{s.name}</span>
                    <span className="text-xs text-slate-500">
                      {s.specialty} · {s.facility}
                    </span>
                  </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-2">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <FileText className="h-4 w-4" /> Attach records
              </p>
              {!form.patientId ? (
                <p className="text-sm text-slate-500">Select a patient first to see their records.</p>
              ) : recordsLoading ? (
                <p className="text-sm text-slate-500">Loading patient records…</p>
              ) : records.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No medical records found for this patient. You can still send the referral without attachments.
                </p>
              ) : (
                records.map((rec) => (
                  <label
                    key={rec.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700/50 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={form.attachedRecords.includes(rec.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.attachedRecords, rec.id]
                          : form.attachedRecords.filter((id) => id !== rec.id);
                        setForm({ ...form, attachedRecords: next });
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-200">{rec.title}</p>
                      <p className="text-xs text-slate-500">{rec.type}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-300">Clinical notes</label>
                <textarea
                  value={form.clinicalNotes}
                  onChange={(e) => setForm({ ...form, clinicalNotes: e.target.value })}
                  rows={4}
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  placeholder="Reason for referral, relevant history…"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-300">Urgency</label>
                <div className="flex gap-2">
                  {URGENCY_OPTIONS.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setForm({ ...form, urgency: u.id })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        form.urgency === u.id ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500'
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-slate-700/50 p-3">
                <input
                  type="checkbox"
                  checked={form.requestConsent}
                  onChange={(e) => setForm({ ...form, requestConsent: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Shield className="h-4 w-4 text-sky-400" /> Request patient consent
                  </p>
                  <p className="text-xs text-slate-500">
                    Patient will receive a notification to approve record sharing before the referral is sent.
                  </p>
                </div>
              </label>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              disabled={wizardStep === 0}
              onClick={() => setWizardStep((s) => s - 1)}
              className="ghost-button flex items-center gap-1 rounded-xl px-4 py-2 text-sm disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {wizardStep < 3 ? (
              <button
                type="button"
                disabled={
                  (wizardStep === 0 && !form.patientId) ||
                  (wizardStep === 1 && !form.toDoctorId)
                }
                onClick={() => setWizardStep((s) => s + 1)}
                className="primary-button flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!form.clinicalNotes || submitting}
                onClick={handleSubmit}
                className="primary-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {submitting ? 'Sending…' : 'Send Referral'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralsWorkspace;
