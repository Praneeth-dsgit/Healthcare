import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileStack, Loader2, RefreshCw, Trash2, FileText, ImageIcon } from 'lucide-react';
import { recordService, MedicalRecord } from '../../services/recordService';
import { linkPatientFromDatabase } from '../../utils/staffLinkPatient';
import type { Capability } from '../../services/roleService';
import type { LinkedPatientState } from './StaffPatientPanel.types';
import { setStaffPatientDragData } from '../../utils/staffPatientDrag';
import StaffMedicalRecordUpload from './StaffMedicalRecordUpload';

type StaffRecordRow = MedicalRecord & {
  first_name: string;
  last_name: string;
  date_of_birth?: string;
};

interface StaffPatientsRecordsTabProps {
  capability: Capability;
  linkedPatient: LinkedPatientState | null;
  onLinkedPatientChange: (patient: LinkedPatientState | null) => void;
}

const StaffPatientsRecordsTab: React.FC<StaffPatientsRecordsTabProps> = ({
  capability,
  linkedPatient,
  onLinkedPatientChange,
}) => {
  const [records, setRecords] = useState<StaffRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const staffCapability =
    capability === 'lab' || capability === 'radiology' ? capability : undefined;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await recordService.listStaffMedicalRecords({
      capability: staffCapability,
      search: filter.trim().length >= 2 ? filter.trim() : undefined,
    });
    setLoading(false);
    if (result.success && result.records) {
      setRecords(result.records as StaffRecordRow[]);
    } else {
      setRecords([]);
      setError(result.error || 'Could not load records');
    }
  }, [staffCapability, filter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRecords();
    }, filter.trim().length >= 2 ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadRecords, filter]);

  const directoryPatients = useMemo(() => {
    const map = new Map<string, { patient_id: string; first_name: string; last_name: string }>();
    for (const r of records) {
      if (!map.has(r.patient_id)) {
        map.set(r.patient_id, {
          patient_id: r.patient_id,
          first_name: r.first_name,
          last_name: r.last_name,
        });
      }
    }
    return Array.from(map.values());
  }, [records]);

  const linkPatientById = async (
    patientId: string,
    hint?: { first_name: string; last_name: string; date_of_birth?: string }
  ) => {
    const fromRecord = records.find((r) => r.patient_id === patientId);
    const first = fromRecord?.first_name ?? hint?.first_name ?? '';
    const last = fromRecord?.last_name ?? hint?.last_name ?? '';
    const dob = fromRecord?.date_of_birth ?? hint?.date_of_birth;

    setLinkingId(patientId);
    const { state, error: linkError } = await linkPatientFromDatabase(
      patientId,
      first,
      last,
      capability,
      dob
    );
    setLinkingId(null);
    if (state) {
      onLinkedPatientChange(state);
      setError(null);
    } else if (linkError) {
      setError(linkError);
    }
  };

  const handleSelectRecord = async (record: StaffRecordRow) => {
    await linkPatientById(record.patient_id, record);
  };

  const handleDeleteRecord = async (record: StaffRecordRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const label = record.title || 'this file';
    const confirmed = window.confirm(
      `Delete "${label}"?\n\nThis will permanently remove the file from medical records. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(record.record_id);
    setError(null);
    const result = await recordService.deleteMedicalRecord(record.record_id);
    setDeletingId(null);

    if (!result.success) {
      setError(result.error || 'Could not delete record');
      return;
    }

    await loadRecords();

    if (linkedPatient?.patientId === record.patient_id) {
      const nameParts = linkedPatient.displayName.trim().split(/\s+/);
      const { state } = await linkPatientFromDatabase(
        linkedPatient.patientId,
        nameParts[0] ?? '',
        nameParts.slice(1).join(' '),
        capability
      );
      if (state) {
        onLinkedPatientChange(state);
      } else {
        onLinkedPatientChange(null);
      }
    }
  };

  const title =
    capability === 'lab'
      ? 'Patients with lab records'
      : capability === 'radiology'
        ? 'Patients with imaging records'
        : 'Patients with records';

  const showRecordUpload = capability === 'lab' || capability === 'radiology';

  const fileIcon = (record: StaffRecordRow) => {
    const ft = record.file_type || '';
    if (ft.startsWith('image/')) return <ImageIcon size={14} className="shrink-0 text-sky-400" />;
    return <FileText size={14} className="shrink-0 text-amber-400" />;
  };

  return (
    <div className="premium-card flex w-72 shrink-0 flex-col overflow-hidden xl:w-80">
      <div className="border-b border-slate-700/50 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="section-heading flex items-center gap-1.5 text-sm text-slate-200">
            <FileStack size={16} className="text-[var(--portal-accent)]" />
            {title}
          </h2>
          <button
            type="button"
            onClick={() => loadRecords()}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by patient, title…"
          className="form-field w-full py-1.5 text-sm"
        />
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          {records.length} record{records.length === 1 ? '' : 's'}. Drag into the chat box or click
          to link the patient.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar p-2">
        {loading && records.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            Loading…
          </div>
        ) : error && records.length === 0 ? (
          <p className="py-4 text-center text-xs text-red-400">{error}</p>
        ) : records.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">No medical records found.</p>
        ) : (
          <ul className="space-y-1">
            {records.map((record) => {
              const isActive = linkedPatient?.patientId === record.patient_id;
              const isLinking = linkingId === record.patient_id;
              const isDeleting = deletingId === record.record_id;
              const recordDate = record.visit_date?.slice(0, 10) || record.created_at?.slice(0, 10);

              return (
                <li key={record.record_id}>
                  <div
                    role="button"
                    tabIndex={0}
                    draggable={!isLinking && !isDeleting}
                    onDragStart={(e) => {
                      setStaffPatientDragData(e.dataTransfer, {
                        patient_id: record.patient_id,
                        first_name: record.first_name,
                        last_name: record.last_name,
                        date_of_birth: record.date_of_birth,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectRecord(record);
                      }
                    }}
                    onClick={() => !isLinking && !isDeleting && handleSelectRecord(record)}
                    className={`w-full cursor-grab rounded-xl border px-3 py-2.5 text-left transition-colors active:cursor-grabbing ${
                      isActive
                        ? 'border-[var(--portal-accent)] bg-[color-mix(in_srgb,var(--portal-accent)_18%,transparent)]'
                        : 'border-slate-700/40 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/60'
                    } ${isLinking || isDeleting ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">{fileIcon(record)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">{record.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-300">
                          {record.first_name} {record.last_name}
                        </p>
                        <p className="truncate font-mono text-[10px] text-slate-500">{record.patient_id}</p>
                        {recordDate && (
                          <p className="mt-1 text-[10px] text-slate-500">{recordDate}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {isLinking ? (
                          <Loader2 size={14} className="animate-spin text-slate-400" />
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteRecord(record, e)}
                            disabled={isDeleting}
                            className="rounded p-1 text-slate-500 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
                            title="Delete record"
                            aria-label={`Delete ${record.title}`}
                          >
                            {isDeleting ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {error && records.length > 0 && (
          <p className="mt-2 text-center text-xs text-red-400">{error}</p>
        )}
      </div>

      {showRecordUpload && (
        <StaffMedicalRecordUpload
          capability={capability}
          directoryPatients={directoryPatients}
          selectedPatientId={linkedPatient?.patientId}
          onUploadSuccess={() => loadRecords()}
          onAttachToChat={(pid) => linkPatientById(pid)}
        />
      )}
    </div>
  );
};

export default StaffPatientsRecordsTab;
