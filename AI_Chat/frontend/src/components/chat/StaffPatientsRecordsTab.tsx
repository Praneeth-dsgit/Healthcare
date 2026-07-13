import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileStack, Loader2, RefreshCw, Trash2, ChevronRight, ArrowLeft, User } from 'lucide-react';
import { recordService, MedicalRecord } from '../../services/recordService';
import { linkPatientFromDatabase } from '../../utils/staffLinkPatient';
import type { Capability } from '../../services/roleService';
import type { LinkedPatientState } from './StaffPatientPanel.types';
import { setStaffPatientDragData } from '../../utils/staffPatientDrag';
import StaffMedicalRecordUpload from './StaffMedicalRecordUpload';
import RecordThumbnail from './RecordThumbnail';

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
  const [selectedDirectoryPatientId, setSelectedDirectoryPatientId] = useState<string | null>(null);
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

  const patientGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        patient_id: string;
        first_name: string;
        last_name: string;
        date_of_birth?: string;
        record_count: number;
        latest_date?: string;
      }
    >();
    for (const r of records) {
      const existing = map.get(r.patient_id);
      const rDate = r.visit_date?.slice(0, 10) || r.created_at?.slice(0, 10);
      if (existing) {
        existing.record_count += 1;
        if (rDate && (!existing.latest_date || rDate > existing.latest_date)) {
          existing.latest_date = rDate;
        }
      } else {
        map.set(r.patient_id, {
          patient_id: r.patient_id,
          first_name: r.first_name,
          last_name: r.last_name,
          date_of_birth: r.date_of_birth,
          record_count: 1,
          latest_date: rDate,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );
  }, [records]);

  const directoryPatients = useMemo(
    () =>
      patientGroups.map((p) => ({
        patient_id: p.patient_id,
        first_name: p.first_name,
        last_name: p.last_name,
      })),
    [patientGroups]
  );

  const selectedPatient = useMemo(
    () => patientGroups.find((p) => p.patient_id === selectedDirectoryPatientId) || null,
    [patientGroups, selectedDirectoryPatientId]
  );

  const selectedPatientRecords = useMemo(
    () => records.filter((r) => r.patient_id === selectedDirectoryPatientId),
    [records, selectedDirectoryPatientId]
  );

  // If the selected patient disappears after a refresh/filter, return to the list.
  useEffect(() => {
    if (selectedDirectoryPatientId && !selectedPatient) {
      setSelectedDirectoryPatientId(null);
    }
  }, [selectedDirectoryPatientId, selectedPatient]);

  const linkPatientById = async (
    patientId: string,
    hint?: { first_name: string; last_name: string; date_of_birth?: string },
    attachRecords: MedicalRecord[] = []
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
      dob,
      attachRecords
    );
    setLinkingId(null);
    if (state) {
      onLinkedPatientChange(state);
      setError(null);
    } else if (linkError) {
      setError(linkError);
    }
  };

  // Strip the staff-directory-only fields so we attach a clean MedicalRecord.
  const toMedicalRecord = (row: StaffRecordRow): MedicalRecord => {
    const { first_name: _f, last_name: _l, date_of_birth: _d, ...record } = row;
    void _f;
    void _l;
    void _d;
    return record;
  };

  const handleSelectRecord = async (record: StaffRecordRow) => {
    const attached = toMedicalRecord(record);

    // Same patient already linked: toggle this record in/out of the attached set.
    if (linkedPatient && linkedPatient.patientId === record.patient_id) {
      const exists = linkedPatient.records.some((r) => r.record_id === record.record_id);
      const nextRecords = exists
        ? linkedPatient.records.filter((r) => r.record_id !== record.record_id)
        : [...linkedPatient.records, attached];
      onLinkedPatientChange({ ...linkedPatient, records: nextRecords });
      return;
    }

    // Different/no patient: link this patient and attach only this record.
    await linkPatientById(record.patient_id, record, [attached]);
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

    // Drop the deleted record from the attached set if it was selected.
    if (
      linkedPatient?.patientId === record.patient_id &&
      linkedPatient.records.some((r) => r.record_id === record.record_id)
    ) {
      onLinkedPatientChange({
        ...linkedPatient,
        records: linkedPatient.records.filter((r) => r.record_id !== record.record_id),
      });
    }
  };

  const recordsLabel =
    capability === 'lab' ? 'lab records' : capability === 'radiology' ? 'imaging records' : 'records';

  const listTitle =
    capability === 'lab'
      ? 'Patients with lab records'
      : capability === 'radiology'
        ? 'Patients with imaging records'
        : 'Patients with records';

  const showRecordUpload = capability === 'lab' || capability === 'radiology';

  const renderPatientList = () => {
    if (loading && records.length === 0) {
      return (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          Loading…
        </div>
      );
    }
    if (error && records.length === 0) {
      return <p className="py-4 text-center text-xs text-red-400">{error}</p>;
    }
    if (patientGroups.length === 0) {
      return <p className="py-6 text-center text-xs text-slate-500">No patients found.</p>;
    }
    return (
      <ul className="space-y-1">
        {patientGroups.map((p) => (
          <li key={p.patient_id}>
            <button
              type="button"
              onClick={() => setSelectedDirectoryPatientId(p.patient_id)}
              className="flex w-full items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-900/30 px-3 py-2.5 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[var(--portal-accent)]">
                <User size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">
                  {p.first_name} {p.last_name}
                </p>
                <p className="truncate font-mono text-[10px] text-slate-500">{p.patient_id}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {p.record_count} {p.record_count === 1 ? 'record' : 'records'}
                  {p.latest_date ? ` · latest ${p.latest_date}` : ''}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-500" />
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const renderRecordTiles = () => {
    if (selectedPatientRecords.length === 0) {
      return (
        <p className="py-6 text-center text-xs text-slate-500">
          No {recordsLabel} for this patient.
        </p>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2">
        {selectedPatientRecords.map((record) => {
          const isActive =
            linkedPatient?.patientId === record.patient_id &&
            linkedPatient.records.some((r) => r.record_id === record.record_id);
          const isLinking = linkingId === record.patient_id;
          const isDeleting = deletingId === record.record_id;
          const recordDate = record.visit_date?.slice(0, 10) || record.created_at?.slice(0, 10);

          return (
            <div
              key={record.record_id}
              role="button"
              tabIndex={0}
              draggable={!isLinking && !isDeleting}
              onDragStart={(e) => {
                setStaffPatientDragData(e.dataTransfer, {
                  patient_id: record.patient_id,
                  first_name: record.first_name,
                  last_name: record.last_name,
                  date_of_birth: record.date_of_birth,
                  record: {
                    record_id: record.record_id,
                    title: record.title,
                    record_type: record.record_type,
                    file_type: record.file_type,
                    file_url: record.file_url,
                    visit_date: record.visit_date,
                    created_at: record.created_at,
                  },
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectRecord(record);
                }
              }}
              onClick={() => !isLinking && !isDeleting && handleSelectRecord(record)}
              className={`group relative cursor-grab overflow-hidden rounded-xl border transition-colors active:cursor-grabbing ${
                isActive
                  ? 'border-[var(--portal-accent)] bg-[color-mix(in_srgb,var(--portal-accent)_18%,transparent)]'
                  : 'border-slate-700/40 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/60'
              } ${isLinking || isDeleting ? 'pointer-events-none opacity-60' : ''}`}
            >
              <div className="aspect-square w-full overflow-hidden bg-slate-950/40">
                <RecordThumbnail record={record} />
              </div>
              <button
                type="button"
                onClick={(e) => handleDeleteRecord(record, e)}
                disabled={isDeleting}
                className="absolute right-1 top-1 rounded-lg bg-slate-950/70 p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-500/70 hover:text-white group-hover:opacity-100 disabled:opacity-50"
                title="Delete record"
                aria-label={`Delete ${record.title}`}
              >
                {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </button>
              {isLinking && (
                <span className="absolute left-1 top-1 rounded-lg bg-slate-950/70 p-1 text-slate-300">
                  <Loader2 size={12} className="animate-spin" />
                </span>
              )}
              <div className="px-2 py-1.5">
                <p className="truncate text-[11px] font-semibold text-slate-100">{record.title}</p>
                {recordDate && <p className="text-[10px] text-slate-500">{recordDate}</p>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="premium-card flex w-72 shrink-0 flex-col overflow-hidden xl:w-80">
      <div className="border-b border-slate-700/50 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          {selectedPatient ? (
            <button
              type="button"
              onClick={() => setSelectedDirectoryPatientId(null)}
              className="flex min-w-0 items-center gap-1.5 text-sm text-slate-200 hover:text-white"
              title="Back to patients"
            >
              <ArrowLeft size={16} className="shrink-0 text-[var(--portal-accent)]" />
              <span className="truncate font-semibold">
                {selectedPatient.first_name} {selectedPatient.last_name}
              </span>
            </button>
          ) : (
            <h2 className="section-heading flex items-center gap-1.5 text-sm text-slate-200">
              <FileStack size={16} className="text-[var(--portal-accent)]" />
              {listTitle}
            </h2>
          )}
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
          {selectedPatient
            ? `${selectedPatientRecords.length} ${recordsLabel}. Click a tile to attach (click more to add); drag into the chat box. Click again to remove.`
            : `${patientGroups.length} patient${patientGroups.length === 1 ? '' : 's'}. Select a patient to view their ${recordsLabel}.`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar p-2">
        {selectedPatient ? renderRecordTiles() : renderPatientList()}

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
