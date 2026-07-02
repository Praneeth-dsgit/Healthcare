import { patientService } from '../services/patientService';
import { MedicalRecord } from '../services/recordService';
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

/**
 * Link a patient for staff chat context. `attachRecords` are the specific
 * records the staff selected to attach (the chat analyzes exactly these). Pass
 * an empty array to link the patient for profile context only.
 */
export async function linkPatientFromDatabase(
  patientId: string,
  firstName: string,
  lastName: string,
  capability: Capability,
  dateOfBirth?: string,
  attachRecords: MedicalRecord[] = []
): Promise<{ state: LinkedPatientState | null; error?: string }> {
  // capability retained for signature compatibility with callers/drag handlers
  void capability;
  const displayName = `${firstName} ${lastName}`.trim();

  const profileResult = await patientService.getPatientById(patientId);

  if (!profileResult.success || !profileResult.patient) {
    return { state: null, error: profileResult.error || 'Patient not found' };
  }

  return {
    state: {
      patientId,
      displayName,
      patientInfo: profileToPatientInfo(
        { ...profileResult.patient, date_of_birth: profileResult.patient.date_of_birth || dateOfBirth },
        displayName
      ),
      records: attachRecords,
    },
  };
}
