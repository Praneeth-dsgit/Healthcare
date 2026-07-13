/**
 * Doctor Medical Records — patient list then records for selected patient
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  FileText,
  Download,
  Calendar,
  User,
  ArrowLeft,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { doctorService } from '../../services/doctorService';
import { patientService } from '../../services/patientService';
import { recordService, type MedicalRecord } from '../../services/recordService';
import { getMedicalRecordDownloadName } from '../../utils/medicalRecordDownload';

interface PatientRow {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
  age?: number;
}

interface DoctorMedicalRecordsProps {
  initialPatientId?: string;
}

const RECORD_TYPES = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'radiology_report', label: 'Radiology Report' },
  { value: 'visit_summary', label: 'Visit Summary' },
  { value: 'discharge_summary', label: 'Discharge Summary' },
  { value: 'other', label: 'Other' },
];

const DoctorMedicalRecords: React.FC<DoctorMedicalRecordsProps> = ({ initialPatientId }) => {
  const [doctorId, setDoctorId] = useState<number | undefined>();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void doctorService.getCurrentDoctor().then((r) => {
      if (r.success && r.doctor) setDoctorId(r.doctor.doctor_id);
    });
  }, []);

  useEffect(() => {
    if (doctorId === undefined) return;
    const timer = setTimeout(() => {
      void loadPatients(patientSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch, doctorId]);

  useEffect(() => {
    if (!initialPatientId?.trim() || doctorId === undefined) return;
    void selectPatientById(initialPatientId.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPatientId, doctorId]);

  const loadPatients = async (search: string = '') => {
    if (doctorId === undefined) return;
    setLoadingPatients(true);
    setError(null);
    try {
      const result = await patientService.listPatients(search || undefined, doctorId);
      if (result.success && result.patients) {
        setPatients(result.patients);
      } else {
        setPatients([]);
      }
    } catch {
      setError('Could not load patients');
      setPatients([]);
    } finally {
      setLoadingPatients(false);
    }
  };

  const loadRecords = async (patientId: string) => {
    setLoadingRecords(true);
    setError(null);
    try {
      const result = await recordService.getRecordsForPatient(patientId, {
        capability: 'general',
        type: filterType || undefined,
      });
      if (result.success && result.records) {
        setRecords(result.records);
      } else {
        setRecords([]);
        if (result.error) setError(result.error);
      }
    } catch {
      setError('Could not load medical records');
      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  };

  const selectPatientById = async (patientId: string) => {
    let patient = patients.find((p) => p.patient_id === patientId);
    if (!patient) {
      const detail = await patientService.getPatientById(patientId);
      if (detail.success && detail.patient) {
        const p = detail.patient;
        patient = {
          patient_id: p.patient_id,
          first_name: p.first_name,
          last_name: p.last_name,
          date_of_birth: p.date_of_birth,
          gender: p.gender,
        };
        setPatients((prev) =>
          prev.some((x) => x.patient_id === patientId) ? prev : [...prev, patient!]
        );
      }
    }
    if (patient) {
      setSelectedPatient(patient);
      await loadRecords(patient.patient_id);
    }
  };

  const handlePatientSelect = (patient: PatientRow) => {
    setSelectedPatient(patient);
    setRecordSearch('');
    void loadRecords(patient.patient_id);
  };

  useEffect(() => {
    if (selectedPatient) {
      void loadRecords(selectedPatient.patient_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  const filteredRecords = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.record_type.toLowerCase().includes(q)
    );
  }, [records, recordSearch]);

  const handleDownload = async (record: MedicalRecord) => {
    const result = await recordService.downloadRecord(record.record_id);
    if (!result) {
      setError('Could not download file');
      return;
    }
    const url = window.URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename || getMedicalRecordDownloadName(record);
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const patientLabel = (p: PatientRow) =>
    `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.patient_id;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Medical Records</h2>
        <p className="mt-1 text-sm text-slate-400">
          Select a patient to view their medical records, lab reports, and prescriptions.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,300px)_1fr] lg:items-stretch">
        {/* Patients list */}
        <div className="premium-card flex h-[min(560px,calc(100vh-14rem))] flex-col overflow-hidden">
          <div className="shrink-0 border-b border-slate-700/50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <User className="h-4 w-4 text-sky-400" />
              Patients
            </h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Search patients…"
                className="form-field w-full py-2 pl-9 text-sm"
              />
            </div>
          </div>

          <div className="min-h-[200px] flex-1 overflow-y-auto p-2">
            {loadingPatients ? (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
              </div>
            ) : patients.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-slate-500">
                No patients found. Patients with appointments under your account appear here.
              </p>
            ) : (
              <ul className="space-y-1">
                {patients.map((patient) => {
                  const active = selectedPatient?.patient_id === patient.patient_id;
                  return (
                    <li key={patient.patient_id}>
                      <button
                        type="button"
                        onClick={() => handlePatientSelect(patient)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                          active
                            ? 'border-sky-500/50 bg-sky-500/10'
                            : 'border-transparent hover:border-slate-700/50 hover:bg-slate-800/40'
                        }`}
                      >
                        <p className="font-medium text-slate-100">{patientLabel(patient)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          ID: {patient.patient_id}
                          {patient.age != null && ` · ${patient.age}y`}
                          {patient.gender && ` · ${patient.gender}`}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Records panel */}
        <div className="premium-card flex h-[min(560px,calc(100vh-14rem))] flex-col overflow-hidden">
          {!selectedPatient ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <FolderOpen className="h-12 w-12 text-slate-600" />
              <p className="font-medium text-slate-300">Select a patient</p>
              <p className="max-w-xs text-sm text-slate-500">
                Choose a patient from the list to view their medical records.
              </p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-slate-700/50 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setRecords([]);
                    }}
                    className="ghost-button flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 lg:hidden"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Records for {patientLabel(selectedPatient)}
                  </h3>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                    {selectedPatient.patient_id}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={recordSearch}
                      onChange={(e) => setRecordSearch(e.target.value)}
                      placeholder="Search records…"
                      className="form-field w-full py-2 pl-9 text-sm"
                    />
                  </div>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="form-field shrink-0 py-2 text-sm sm:w-40"
                  >
                    <option value="">All types</option>
                    {RECORD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {loadingRecords ? (
                  <div className="flex items-center justify-center py-16 text-slate-500">
                    <Loader2 className="h-7 w-7 animate-spin text-sky-400" />
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="py-16 text-center">
                    <FileText className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                    <p className="text-sm text-slate-400">No medical records for this patient.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRecords.map((record) => (
                      <article
                        key={record.record_id}
                        className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-sky-400" />
                              <h4 className="font-semibold text-slate-100">{record.title}</h4>
                              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                                {record.record_type.replace(/_/g, ' ')}
                              </span>
                            </div>
                            {record.description && (
                              <p className="mt-2 line-clamp-3 text-sm text-slate-400">
                                {record.description}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {record.visit_date
                                  ? new Date(record.visit_date).toLocaleDateString()
                                  : new Date(record.created_at).toLocaleDateString()}
                              </span>
                              {record.family_member_first_name && (
                                <span>
                                  Family: {record.family_member_first_name}{' '}
                                  {record.family_member_last_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDownload(record)}
                            className="ghost-button flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-sky-300"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Download</span>
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorMedicalRecords;
