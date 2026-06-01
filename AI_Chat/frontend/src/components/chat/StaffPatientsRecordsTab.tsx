import React, { useCallback, useEffect, useState } from 'react';
import { Users, Loader2, RefreshCw } from 'lucide-react';
import { recordService } from '../../services/recordService';
import { linkPatientFromDatabase } from '../../utils/staffLinkPatient';
import type { Capability } from '../../services/roleService';
import type { LinkedPatientState } from './StaffPatientPanel.types';
import { setStaffPatientDragData } from '../../utils/staffPatientDrag';

interface PatientWithRecords {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  record_count: number;
  latest_record_date?: string;
}

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
  const [patients, setPatients] = useState<PatientWithRecords[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const staffCapability =
    capability === 'lab' || capability === 'radiology' ? capability : 'general';

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await recordService.listPatientsWithRecords({
      capability: staffCapability === 'general' ? undefined : staffCapability,
      search: filter.trim().length >= 2 ? filter.trim() : undefined,
    });
    setLoading(false);
    if (result.success && result.patients) {
      setPatients(result.patients);
    } else {
      setPatients([]);
      setError(result.error || 'Could not load patient list');
    }
  }, [staffCapability, filter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDirectory();
    }, filter.trim().length >= 2 ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadDirectory, filter]);

  const handleSelect = async (p: PatientWithRecords) => {
    setLinkingId(p.patient_id);
    const { state, error: linkError } = await linkPatientFromDatabase(
      p.patient_id,
      p.first_name,
      p.last_name,
      capability,
      p.date_of_birth
    );
    setLinkingId(null);
    if (state) {
      onLinkedPatientChange(state);
    } else if (linkError) {
      setError(linkError);
    }
  };

  const title =
    capability === 'lab'
      ? 'Patients with lab records'
      : capability === 'radiology'
        ? 'Patients with imaging records'
        : 'Patients with records';

  return (
    <div className="premium-card flex w-72 shrink-0 flex-col overflow-hidden xl:w-80">
      <div className="border-b border-slate-700/50 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="section-heading flex items-center gap-1.5 text-sm text-slate-200">
            <Users size={16} className="text-[var(--portal-accent)]" />
            {title}
          </h2>
          <button
            type="button"
            onClick={() => loadDirectory()}
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
          placeholder="Filter by name or ID…"
          className="form-field w-full py-1.5 text-sm"
        />
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          {patients.length} patient{patients.length === 1 ? '' : 's'} with records. Drag into the chat
          box or click to link.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar p-2">
        {loading && patients.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            Loading…
          </div>
        ) : error && patients.length === 0 ? (
          <p className="py-4 text-center text-xs text-red-400">{error}</p>
        ) : patients.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">No patients with medical records found.</p>
        ) : (
          <ul className="space-y-1">
            {patients.map((p) => {
              const isActive = linkedPatient?.patientId === p.patient_id;
              const isLinking = linkingId === p.patient_id;
              return (
                <li key={p.patient_id}>
                  <div
                    role="button"
                    tabIndex={0}
                    draggable={!isLinking}
                    onDragStart={(e) => {
                      setStaffPatientDragData(e.dataTransfer, {
                        patient_id: p.patient_id,
                        first_name: p.first_name,
                        last_name: p.last_name,
                        date_of_birth: p.date_of_birth,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(p);
                      }
                    }}
                    onClick={() => !isLinking && handleSelect(p)}
                    className={`w-full cursor-grab rounded-xl border px-3 py-2.5 text-left transition-colors active:cursor-grabbing ${
                      isActive
                        ? 'border-[var(--portal-accent)] bg-[color-mix(in_srgb,var(--portal-accent)_18%,transparent)]'
                        : 'border-slate-700/40 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/60'
                    } ${isLinking ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                          {p.patient_id}
                        </p>
                      </div>
                      {isLinking ? (
                        <Loader2 size={14} className="mt-1 shrink-0 animate-spin text-slate-400" />
                      ) : (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isActive ? 'bg-sky-500/25 text-sky-300' : 'bg-slate-700/80 text-slate-400'
                          }`}
                        >
                          {p.record_count}
                        </span>
                      )}
                    </div>
                    {p.latest_record_date && (
                      <p className="mt-1 text-[10px] text-slate-500">
                        Latest: {p.latest_record_date.slice(0, 10)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default StaffPatientsRecordsTab;
