import type { TelemedicineVisit, VisitDocument, VisitChatMessage, TelemedicineDoctor } from '../../services/telemedicineService';
import { FIXTURE_GEO_DOCTORS } from './doctorsGeo';

/** Demo doctor IDs that offer telemedicine (Sydney seed 101–122 available + Dr Ganesh). */
export const TELEMEDICINE_DOCTOR_IDS = new Set([
  16,
  101, 102, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 115, 116, 117, 118, 119, 120, 121, 122,
]);

export const GANESH_TELEMEDICINE_DOCTOR: TelemedicineDoctor = {
  doctor_id: 16,
  first_name: 'Ganesh',
  last_name: 'ch',
  specialty_name: 'General Medicine',
  qualification: 'MBBS, MD',
  experience_years: 15,
  consultation_fee: 800,
  is_available: true,
  facility_name: 'Acufore Telehealth',
  facility_city: 'Sydney',
};

export function buildDemoTelemedicineDoctors(): TelemedicineDoctor[] {
  const fromGeo = FIXTURE_GEO_DOCTORS.filter((d) => TELEMEDICINE_DOCTOR_IDS.has(d.doctor_id)).map((d) => ({
    doctor_id: d.doctor_id,
    first_name: d.first_name,
    last_name: d.last_name,
    specialty_name: d.specialty_name,
    qualification: d.qualification,
    experience_years: d.experience_years,
    consultation_fee: d.consultation_fee,
    is_available: d.is_available,
    facility_name: d.facility_name,
    facility_city: d.facility_city,
  }));

  const ids = new Set(fromGeo.map((d) => d.doctor_id));
  const merged = ids.has(GANESH_TELEMEDICINE_DOCTOR.doctor_id)
    ? fromGeo
    : [GANESH_TELEMEDICINE_DOCTOR, ...fromGeo];

  return merged.sort((a, b) => {
    if (a.is_available !== b.is_available) return a.is_available ? -1 : 1;
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });
}

export const CONSENT_TEXT =
  'I consent to receive telehealth services and understand that my health information will be handled per HIPAA guidelines. I understand this session may be recorded for quality and medical record purposes, and recordings are retained per hospital policy. I authorize payment for this telehealth visit per the disclosed consultation fee.';

export const FIXTURE_VISITS: TelemedicineVisit[] = [
  {
    id: 'visit-demo-1',
    appointmentId: 9001,
    patientName: 'Rajesh Kumar',
    doctorName: 'Dr. Ganesh ch',
    doctorId: 16,
    specialty: 'Cardiology',
    scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    status: 'scheduled',
    visitMode: 'video',
    durationMinutes: 30,
    fee: 800,
    canJoin: true,
  },
  {
    id: 'visit-demo-2',
    appointmentId: 9002,
    patientName: 'Rajesh Kumar',
    doctorName: 'Dr. Ganesh ch',
    doctorId: 16,
    specialty: 'Cardiology',
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    visitMode: 'video',
    durationMinutes: 45,
    fee: 1200,
    canJoin: false,
  },
];

export const FIXTURE_VISIT_DOCS: VisitDocument[] = [
  { id: 'doc-1', name: 'Recent Lab Report.pdf', type: 'lab', size: '245 KB' },
  { id: 'doc-2', name: 'Prescription History.pdf', type: 'prescription', size: '128 KB' },
  { id: 'doc-3', name: 'Chest X-Ray Summary.pdf', type: 'imaging', size: '1.2 MB' },
];

export const FIXTURE_CHAT_SEED: VisitChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'doctor',
    senderName: 'Dr. Ganesh ch',
    text: 'Good morning! Can you hear me clearly?',
    at: new Date().toISOString(),
  },
];
