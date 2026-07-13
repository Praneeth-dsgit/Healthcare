/**
 * Patient prescription view — shows finalized prescription and standard PDF download.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pill, Loader2, Download, FileText } from 'lucide-react';
import {
  telemedicineService,
  type VisitPrescription,
} from '../../services/telemedicineService';
import { downloadPrescriptionPdf, prescriptionPdfBlob } from '../../utils/prescriptionPdf';

interface TelemedicinePrescriptionViewProps {
  visitId: string;
}

const TelemedicinePrescriptionView: React.FC<TelemedicinePrescriptionViewProps> = ({ visitId }) => {
  const [prescription, setPrescription] = useState<VisitPrescription | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const result = await telemedicineService.getPrescription(visitId);
    setPrescription(result.prescription ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [visitId]);

  const pdfOptions = useMemo(() => {
    if (!prescription || prescription.status !== 'sent') return null;
    const date = prescription.prescribedAt.split('T')[0];
    return {
      patientId: prescription.patientId || 'PATIENT',
      patientName: prescription.patientName || 'Patient',
      patientAge: prescription.patientAge || 'N/A',
      patientGender: prescription.patientGender || 'N/A',
      prescriptionDate: date,
      diagnosis: prescription.diagnosis || '',
      medications: prescription.medications.map((m) => ({
        name: m.name,
        dosage: m.dosage || '',
        frequency: m.frequency || '',
        duration: m.duration || '',
        instructions: m.instructions || '',
      })),
      additionalNotes: prescription.notes || '',
      clinicalSummary: prescription.aiSummary || '',
      doctorName: prescription.doctorName || 'Doctor',
      doctorQualification: prescription.doctorQualification || '',
      doctorLicense: '',
    };
  }, [prescription]);

  const handleDownload = () => {
    if (!pdfOptions) return;
    downloadPrescriptionPdf(pdfOptions);
  };

  const handlePreview = () => {
    if (!pdfOptions) return;
    const blob = prescriptionPdfBlob(pdfOptions);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (loading && !prescription) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!prescription || prescription.status !== 'sent') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <Pill className="h-8 w-8 text-slate-600" />
        <p className="text-sm text-slate-400">No prescription yet</p>
        <p className="text-xs text-slate-500">
          Your doctor will review and send your prescription after the visit.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto p-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <FileText className="h-4 w-4" />
          Prescription ready
        </div>
        <p className="mt-1 text-[11px] text-emerald-200/70">
          Standard Acufore Health prescription document
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-500"
          >
            <Download className="h-3.5 w-3.5" /> Download PDF
          </button>
          <button
            type="button"
            onClick={handlePreview}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Preview
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-200">Your prescription</p>
          {prescription.doctorName && (
            <span className="text-[10px] text-slate-500">{prescription.doctorName}</span>
          )}
        </div>

        {prescription.aiSummary && (
          <div className="mb-3 rounded-lg bg-slate-950/50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">Clinical summary</p>
            <p className="mt-1 text-xs text-slate-400">{prescription.aiSummary}</p>
          </div>
        )}

        {prescription.diagnosis && (
          <p className="mb-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Diagnosis:</span> {prescription.diagnosis}
          </p>
        )}

        <ul className="space-y-3">
          {prescription.medications.map((med, i) => (
            <li key={i} className="rounded-lg border border-slate-700/40 bg-slate-950/50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-100">{med.name}</p>
              <p className="mt-1 text-xs text-slate-400">
                {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ')}
              </p>
              {med.instructions && (
                <p className="mt-1 text-[11px] text-slate-500">{med.instructions}</p>
              )}
            </li>
          ))}
        </ul>

        {prescription.notes && (
          <p className="mt-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Notes:</span> {prescription.notes}
          </p>
        )}

        <p className="mt-3 text-[10px] text-slate-600">
          Prescribed {new Date(prescription.prescribedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

export default TelemedicinePrescriptionView;
