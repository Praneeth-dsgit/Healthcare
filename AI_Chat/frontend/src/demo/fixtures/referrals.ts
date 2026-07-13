import type { Referral, ReferralPatient, ReferralSpecialist, ReferralRecord } from '../../services/referralService';

export const FIXTURE_REFERRAL_PATIENTS: ReferralPatient[] = [
  { patient_id: 'PAT-demo-1', name: 'Rajesh Kumar', age: 45, gender: 'Male' },
  { patient_id: 'PAT-demo-2', name: 'Lakshmi Devi', age: 62, gender: 'Female' },
  { patient_id: 'PAT-demo-3', name: 'Arun Patel', age: 33, gender: 'Male' },
];

export const FIXTURE_SPECIALISTS: ReferralSpecialist[] = [
  { doctor_id: 201, name: 'Dr. Vikram Reddy', specialty: 'Cardiology', facility: 'HeartCare Institute' },
  { doctor_id: 202, name: 'Dr. Meera Iyer', specialty: 'Neurology', facility: 'NeuroCare Center' },
  { doctor_id: 203, name: 'Dr. Karan Singh', specialty: 'Orthopedics', facility: 'Bone & Joint Hospital' },
  { doctor_id: 204, name: 'Dr. Divya Rao', specialty: 'Endocrinology', facility: 'Diabetes Care Clinic' },
];

export const FIXTURE_REFERRAL_RECORDS: ReferralRecord[] = [
  { id: 'rec-1', title: 'ECG Report - Jan 2026', type: 'Cardiology' },
  { id: 'rec-2', title: 'Complete Blood Count', type: 'Lab' },
  { id: 'rec-3', title: 'Chest X-Ray', type: 'Radiology' },
  { id: 'rec-4', title: 'Current Medications List', type: 'Prescription' },
];

export const FIXTURE_REFERRALS: Referral[] = [
  {
    id: 'ref-incoming-1',
    direction: 'incoming',
    fromDoctorId: 202,
    toDoctorId: 201,
    patientName: 'Lakshmi Devi',
    patientId: 'PAT-demo-2',
    fromDoctor: 'Dr. Suresh Menon',
    toDoctor: 'Dr. Vikram Reddy',
    specialty: 'Cardiology',
    urgency: 'routine',
    status: 'pending',
    clinicalNotes: 'Patient reports intermittent chest discomfort. ECG shows mild ST changes. Please evaluate for further cardiac workup.',
    attachedRecords: ['rec-1', 'rec-2'],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    consentStatus: 'approved',
  },
];
