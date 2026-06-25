import React, { useEffect, useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, ChevronDown, X } from 'lucide-react';
import { recordService } from '../../services/recordService';
import { patientService } from '../../services/patientService';
import type { Capability } from '../../services/roleService';

interface StaffMedicalRecordUploadProps {
  capability: 'lab' | 'radiology';
  /** Patients currently shown in the sidebar (with records) */
  directoryPatients: Array<{ patient_id: string; first_name: string; last_name: string }>;
  /** Pre-fill from linked / selected patient */
  selectedPatientId?: string | null;
  onUploadSuccess: () => void;
  /** Link patient to AI chat after a successful upload (loads DB records into context). */
  onAttachToChat?: (patientId: string) => void | Promise<void>;
}

const StaffMedicalRecordUpload: React.FC<StaffMedicalRecordUploadProps> = ({
  capability,
  directoryPatients,
  selectedPatientId,
  onUploadSuccess,
  onAttachToChat,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const recordType = capability === 'lab' ? 'lab_report' : 'radiology_report';
  const accept =
    capability === 'lab'
      ? '.pdf,application/pdf'
      : '.pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf';
  const fileHint =
    capability === 'lab'
      ? 'PDF lab reports'
      : 'PDF reports or images (PNG, JPG)';
  const uploadLabel = capability === 'lab' ? 'Upload lab report' : 'Upload imaging';

  const [patientOptions, setPatientOptions] = useState<
    Array<{ patient_id: string; first_name: string; last_name: string }>
  >([]);

  useEffect(() => {
    if (selectedPatientId) {
      setPatientId(selectedPatientId);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    let cancelled = false;
    const mergePatients = (
      extra: Array<{ patient_id: string; first_name: string; last_name: string }>
    ) => {
      const merged = new Map<string, { patient_id: string; first_name: string; last_name: string }>();
      directoryPatients.forEach((p) => merged.set(p.patient_id, p));
      extra.forEach((p) => merged.set(p.patient_id, p));
      if (!cancelled) setPatientOptions(Array.from(merged.values()));
    };
    mergePatients([]);
    (async () => {
      const res = await patientService.listPatients();
      if (!cancelled && res.success && res.patients) {
        mergePatients(res.patients);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directoryPatients]);

  const handleUpload = async () => {
    const pid = patientId.trim();
    if (!pid) {
      setError('Enter or select a patient ID');
      return;
    }
    if (!file) {
      setError('Choose a file to upload');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('patient_id', pid);
    formData.append('record_type', recordType);
    formData.append(
      'title',
      title.trim() || `${capability === 'lab' ? 'Lab report' : 'Imaging report'} - ${file.name}`
    );

    const result = await recordService.uploadMedicalRecord(formData, pid);

    setUploading(false);

    if (result.success) {
      setSuccess(true);
      setFile(null);
      setTitle('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onUploadSuccess();
      if (onAttachToChat) {
        await onAttachToChat(pid);
      }
      setTimeout(() => setSuccess(false), 5000);
    } else {
      setError(result.error || 'Upload failed');
    }
  };

  const handlePatientIdBlur = async () => {
    const pid = patientId.trim();
    if (pid.length < 4) return;
    const res = await patientService.getPatientById(pid);
    if (!res.success) {
      setError('Patient ID not found. Check the ID or register the patient first.');
    }
  };

  if (!formOpen) {
    return (
      <div className="shrink-0 border-t border-slate-700/50 bg-slate-900/40 p-2">
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="portal-accent-button flex w-full items-center justify-center gap-2 py-2 text-xs font-semibold"
        >
          <Upload size={14} />
          {uploadLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-slate-700/50 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Upload size={14} className="text-[var(--portal-accent)]" />
          {uploadLabel}
        </p>
        <button
          type="button"
          onClick={() => {
            setFormOpen(false);
            setError(null);
          }}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-800/80 hover:text-slate-300"
          title="Close upload form"
          aria-label="Close upload form"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-500">Patient</label>
          <input
            type="text"
            list="staff-upload-patient-ids"
            value={patientId}
            onChange={(e) => {
              setPatientId(e.target.value);
              setError(null);
            }}
            onBlur={handlePatientIdBlur}
            placeholder="Patient ID (PAT-…)"
            className="form-field w-full py-1.5 font-mono text-xs"
          />
          <datalist id="staff-upload-patient-ids">
            {patientOptions.map((p) => (
              <option
                key={p.patient_id}
                value={p.patient_id}
                label={`${p.first_name} ${p.last_name}`}
              />
            ))}
          </datalist>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-500">
            Title <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Report title"
            className="form-field w-full py-1.5 text-xs"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-500">File</label>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="form-field w-full cursor-pointer py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-slate-200"
          />
          <p className="mt-1 text-[10px] text-slate-500">{fileHint}</p>
        </div>

        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {success && (
          <p className="flex items-center gap-1 text-[11px] text-emerald-400">
            <CheckCircle2 size={12} />
            Saved and linked to chat — ask about this patient&apos;s reports
          </p>
        )}

        <p className="text-[10px] leading-snug text-slate-500">
          After upload, the patient is linked to chat (record list + demographics). For AI to
          analyze the file pixels/PDF text in this message, also use the chat upload button.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setFormOpen(false);
              setError(null);
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-600/80 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800/60"
          >
            <X size={12} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="portal-accent-button flex flex-[2] items-center justify-center gap-2 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload size={14} />
                Save to medical records
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaffMedicalRecordUpload;
