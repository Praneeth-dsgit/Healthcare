/**
 * Doctor prescribe panel with AI draft, mandatory review, and standard PDF delivery.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';
import { patientService } from '../../services/patientService';
import { doctorService } from '../../services/doctorService';
import { authenticatedFetch, getAuthHeaders, isAuthenticated } from '../../services/authService';
import { getApiRoot } from '../../utils/apiBase';
import { prescriptionPdfBlob, type PrescriptionPdfOptions } from '../../utils/prescriptionPdf';
import {
  telemedicineService,
  type VisitPrescription,
  type VisitPrescriptionMedication,
} from '../../services/telemedicineService';

interface TelemedicinePrescribePanelProps {
  visitId: string;
  doctorName?: string;
  patientName?: string;
  patientId?: string;
  sessionEnded?: boolean;
  onFinalized?: (prescription: VisitPrescription) => void;
}

const emptyMed = (): VisitPrescriptionMedication => ({
  name: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
});

const TelemedicinePrescribePanel: React.FC<TelemedicinePrescribePanelProps> = ({
  visitId,
  doctorName,
  patientName,
  patientId,
  sessionEnded = false,
  onFinalized,
}) => {
  const [diagnosis, setDiagnosis] = useState('');
  const [medications, setMedications] = useState<VisitPrescriptionMedication[]>([emptyMed()]);
  const [notes, setNotes] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [doctorQualification, setDoctorQualification] = useState('');
  const [resolvedPatientId, setResolvedPatientId] = useState(patientId || '');
  const [resolvedPatientName, setResolvedPatientName] = useState(patientName || '');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) return;
    void doctorService.getCurrentDoctor().then((r) => {
      if (r.success && r.doctor) {
        const d = r.doctor;
        const qual = [d.qualification, d.specialty_name].filter(Boolean).join(', ');
        if (qual) setDoctorQualification(qual);
      }
    });
  }, []);

  useEffect(() => {
    const pid = patientId || resolvedPatientId;
    if (!pid) return;
    void patientService.getPatientById(pid).then((r) => {
      if (r.success && r.patient) {
        const p = r.patient;
        setResolvedPatientId(p.patient_id);
        setResolvedPatientName(
          `${p.first_name || ''} ${p.last_name || ''}`.trim() || patientName || ''
        );
        if (p.date_of_birth) {
          const dob = new Date(p.date_of_birth);
          const today = new Date();
          let age = today.getFullYear() - dob.getFullYear();
          const m = today.getMonth() - dob.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
          setPatientAge(String(age));
        }
        setPatientGender(p.gender || '');
      }
    });
  }, [patientId, patientName, resolvedPatientId]);

  const applyDraft = (draft: VisitPrescription) => {
    if (draft.diagnosis) setDiagnosis(draft.diagnosis);
    if (draft.notes) setNotes(draft.notes);
    if (draft.aiSummary) setAiSummary(draft.aiSummary);
    if (draft.medications?.length) {
      setMedications(
        draft.medications.map((m) => ({
          name: m.name || '',
          dosage: m.dosage || '',
          frequency: m.frequency || '',
          duration: m.duration || '',
          instructions: m.instructions || '',
        }))
      );
    }
  };

  const loadOrGenerateDraft = async () => {
    setGenerating(true);
    setError(null);

    const existing = await telemedicineService.getPrescription(visitId);
    if (existing.prescription?.status === 'sent') {
      applyDraft(existing.prescription);
      setSent(true);
      setDraftLoaded(true);
      setGenerating(false);
      return;
    }

    if (existing.prescription && existing.prescription.medications?.length) {
      applyDraft(existing.prescription);
      setDraftLoaded(true);
      setGenerating(false);
      return;
    }

    const result = await telemedicineService.generatePrescriptionDraft(visitId, {
      patientName: resolvedPatientName || patientName,
      doctorName: doctorName,
    });

    setGenerating(false);
    if (result.success && result.draft) {
      applyDraft(result.draft);
      setDraftLoaded(true);
    } else {
      setError(result.error || 'Could not generate AI prescription draft');
      setDraftLoaded(true);
    }
  };

  useEffect(() => {
    if (sessionEnded && !draftLoaded) {
      void loadOrGenerateDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEnded, draftLoaded]);

  const updateMed = (index: number, field: keyof VisitPrescriptionMedication, value: string) => {
    setMedications((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  const uploadPrescriptionPdf = async (pdfOptions: PrescriptionPdfOptions): Promise<number | undefined> => {
    const pdfBlob = prescriptionPdfBlob(pdfOptions);
    const date = pdfOptions.prescriptionDate;
    const pid = pdfOptions.patientId;
    const pdfFile = new File(
      [pdfBlob],
      `Prescription_${pid}_${date}.pdf`,
      { type: 'application/pdf' }
    );

    const formData = new FormData();
    formData.append('file', pdfFile);
    formData.append('patient_id', pid);
    formData.append('record_type', 'prescription');
    formData.append('title', `Prescription - ${date}`);
    formData.append('visit_date', date);
    formData.append(
      'description',
      `Telemedicine prescription\nDiagnosis: ${pdfOptions.diagnosis || 'N/A'}\n${pdfOptions.clinicalSummary || ''}`
    );

    const headers = getAuthHeaders() as Record<string, string>;
    delete headers['Content-Type'];
    if (pid) headers['X-Patient-ID'] = pid;

    try {
      const response = await authenticatedFetch(`${getApiRoot()}/patient/medical-records`, {
        method: 'POST',
        headers,
        body: formData,
      });
      const result = await response.json();
      if (result.success && result.record?.record_id) {
        return result.record.record_id as number;
      }
    } catch {
      /* PDF upload optional when offline/demo */
    }
    return undefined;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const validMeds = medications.filter((m) => m.name.trim());
    if (validMeds.length === 0) {
      setError('Add at least one medication');
      return;
    }
    if (!reviewed) {
      setError('Please confirm you have reviewed the prescription');
      return;
    }

    const pid = resolvedPatientId || patientId || 'UNKNOWN';
    const prescriptionDate = new Date().toISOString().split('T')[0];

    setSaving(true);
    setError(null);

    const pdfOptions: PrescriptionPdfOptions = {
      patientId: pid,
      patientName: resolvedPatientName || patientName || 'Patient',
      patientAge: patientAge || 'N/A',
      patientGender: patientGender || 'N/A',
      prescriptionDate,
      diagnosis,
      medications: validMeds.map((m) => ({
        name: m.name.trim(),
        dosage: (m.dosage || '').trim(),
        frequency: (m.frequency || '').trim(),
        duration: (m.duration || '').trim(),
        instructions: (m.instructions || '').trim(),
      })),
      additionalNotes: notes.trim(),
      clinicalSummary: aiSummary.trim(),
      doctorName: doctorName || 'Doctor',
      doctorQualification: doctorQualification,
      doctorLicense: '',
    };

    const pdfRecordId = await uploadPrescriptionPdf(pdfOptions);

    const result = await telemedicineService.savePrescription(visitId, {
      diagnosis: diagnosis.trim() || undefined,
      medications: validMeds,
      notes: notes.trim() || undefined,
      aiSummary: aiSummary.trim() || undefined,
      doctorName,
      doctorQualification,
      patientId: pid,
      patientName: pdfOptions.patientName,
      patientAge: pdfOptions.patientAge,
      patientGender: pdfOptions.patientGender,
      reviewed: true,
      finalize: true,
      pdfRecordId,
    });

    setSaving(false);

    if (result.success && result.prescription) {
      setSent(true);
      onFinalized?.(result.prescription);
    } else {
      setError('Could not send prescription');
    }
  };

  if (!sessionEnded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Sparkles className="h-8 w-8 text-teal-500/60" />
        <p className="text-sm font-semibold text-slate-300">Prescription after visit</p>
        <p className="text-xs text-slate-500">
          End the session to generate an AI-assisted prescription draft from the live transcript.
          You must review and confirm before sending to the patient.
        </p>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        <p className="text-sm font-semibold text-slate-300">Generating prescription draft…</p>
        <p className="text-xs text-slate-500">Analyzing visit transcript and conversation</p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <CheckCircle className="h-10 w-10 text-emerald-400" />
        <p className="text-sm font-semibold text-emerald-300">Prescription sent</p>
        <p className="text-xs text-slate-500">
          Standard Acufore prescription PDF delivered to the patient.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-bold text-amber-100">AI-generated draft</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-100/80">
              Review every field below before sending. Mandatory confirmation is required.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4 sm:p-5">
      {(resolvedPatientName || patientName) && (
        <p className="text-sm text-slate-400">
          Prescribing for{' '}
          <span className="font-semibold text-slate-200">
            {resolvedPatientName || patientName}
          </span>
        </p>
      )}

      <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Sparkles className="h-3.5 w-3.5 text-teal-400" /> AI visit summary
      </label>
      <textarea
        value={aiSummary}
        onChange={(e) => setAiSummary(e.target.value)}
        rows={4}
        placeholder="Clinical summary from conversation…"
        className="form-field w-full resize-y py-2.5 text-sm leading-relaxed"
      />
      </div>

      <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Diagnosis</label>
      <input
        value={diagnosis}
        onChange={(e) => setDiagnosis(e.target.value)}
        placeholder="e.g. Upper respiratory infection"
        className="form-field w-full py-2.5 text-sm"
      />
      </div>

      <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Medications</p>
      <div className="space-y-4">
        {medications.map((med, i) => (
          <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-500">Medication #{i + 1}</span>
              {medications.length > 1 && (
                <button
                  type="button"
                  onClick={() => setMedications((prev) => prev.filter((_, j) => j !== i))}
                  className="text-slate-500 hover:text-red-400"
                  aria-label="Remove medication"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <input
              value={med.name}
              onChange={(e) => updateMed(i, 'name', e.target.value)}
              placeholder="Medicine name"
              className="form-field mb-3 w-full py-2 text-sm"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={med.dosage}
                onChange={(e) => updateMed(i, 'dosage', e.target.value)}
                placeholder="Dose"
                className="form-field py-2 text-sm"
              />
              <input
                value={med.frequency}
                onChange={(e) => updateMed(i, 'frequency', e.target.value)}
                placeholder="Frequency"
                className="form-field py-2 text-sm"
              />
              <input
                value={med.duration}
                onChange={(e) => updateMed(i, 'duration', e.target.value)}
                placeholder="Duration"
                className="form-field py-2 text-sm"
              />
            </div>
            <input
              value={med.instructions || ''}
              onChange={(e) => updateMed(i, 'instructions', e.target.value)}
              placeholder="Instructions (e.g. take after food)"
              className="form-field mt-3 w-full py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setMedications((prev) => [...prev, emptyMed()])}
        className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-teal-400 hover:text-teal-300"
      >
        <Plus className="h-4 w-4" /> Add medication
      </button>
      </div>

      <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Additional notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Take after food, follow-up, etc."
        className="form-field w-full resize-y py-2.5 text-sm leading-relaxed"
      />
      </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-slate-800 bg-slate-950/80 p-4 sm:p-5">
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
          reviewed
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-amber-500/40 bg-amber-500/5'
        }`}
      >
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <span className="text-sm leading-relaxed text-slate-200">
          <strong className="text-slate-100">Mandatory confirmation:</strong> I have reviewed this
          AI-generated prescription, verified all medications and dosages, and confirm it is accurate
          before sending to the patient.
        </span>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={saving || !reviewed}
        className="primary-button w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
      >
        {saving ? 'Sending…' : 'Send prescription to patient'}
      </button>
      </div>
    </form>
  );
};

export default TelemedicinePrescribePanel;
