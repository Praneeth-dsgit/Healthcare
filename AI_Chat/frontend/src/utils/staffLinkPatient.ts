import { patientService } from '../services/patientService';
import { recordService, MedicalRecord } from '../services/recordService';
import { PatientInfo } from '../types';
import type { Capability } from '../services/roleService';
import type { LinkedPatientState } from '../components/chat/StaffPatientPanel.types';

function computeAge(dateOfBirth?: string): number {
  if (!dateOfBirth) return 0;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function profileToPatientInfo(
  patient: {
    patient_id: string;
    first_name: string;
    last_name: string;
    date_of_birth?: string;
    gender?: string;
    weight_kg?: number;
    height_cm?: number;
  },
  displayName: string
): PatientInfo {
  return {
    age: computeAge(patient.date_of_birth),
    weight: patient.weight_kg ?? 0,
    height: patient.height_cm ?? 170,
    gender: (patient.gender as PatientInfo['gender']) || 'other',
    bloodPressure: '',
    allergies: '',
    medications: '',
    medicalHistory: '',
    patientId: patient.patient_id,
    patientName: displayName,
  };
}

export async function linkPatientFromDatabase(
  patientId: string,
  firstName: string,
  lastName: string,
  capability: Capability,
  dateOfBirth?: string
): Promise<{ state: LinkedPatientState | null; error?: string }> {
  const staffCapability =
    capability === 'lab' || capability === 'radiology' ? capability : 'general';
  const displayName = `${firstName} ${lastName}`.trim();

  const [profileResult, recordsResult] = await Promise.all([
    patientService.getPatientById(patientId),
    recordService.getRecordsForPatient(patientId, {
      capability: staffCapability === 'general' ? undefined : staffCapability,
      limit: 40,
    }),
  ]);

  if (!profileResult.success || !profileResult.patient) {
    return { state: null, error: profileResult.error || 'Patient not found' };
  }

  const records: MedicalRecord[] =
    recordsResult.success && recordsResult.records ? recordsResult.records : [];

  return {
    state: {
      patientId,
      displayName,
      patientInfo: profileToPatientInfo(
        { ...profileResult.patient, date_of_birth: profileResult.patient.date_of_birth || dateOfBirth },
        displayName
      ),
      records,
    },
    error: recordsResult.success ? undefined : recordsResult.error,
  };
}
