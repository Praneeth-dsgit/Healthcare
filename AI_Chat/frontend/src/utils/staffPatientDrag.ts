export const STAFF_PATIENT_DRAG_MIME = 'application/x-acufore-patient';

export interface StaffPatientDragRecord {
  record_id: number;
  title: string;
  record_type: string;
  file_type?: string;
  file_url?: string;
  visit_date?: string;
  created_at?: string;
}

export interface StaffPatientDragPayload {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  /** The specific record being dragged, if any (so the chat attaches just this one). */
  record?: StaffPatientDragRecord;
}

export function setStaffPatientDragData(
  dataTransfer: DataTransfer,
  payload: StaffPatientDragPayload
): void {
  dataTransfer.setData(STAFF_PATIENT_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.effectAllowed = 'link';
}

export function readStaffPatientDragData(
  dataTransfer: DataTransfer
): StaffPatientDragPayload | null {
  const raw = dataTransfer.getData(STAFF_PATIENT_DRAG_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffPatientDragPayload;
  } catch {
    return null;
  }
}

export function isStaffPatientDragEvent(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(STAFF_PATIENT_DRAG_MIME);
}

export function formatPatientInputTag(displayName: string, patientId: string): string {
  return `[Patient: ${displayName} · ${patientId}] `;
}
