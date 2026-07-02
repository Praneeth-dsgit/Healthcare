import { MedicalRecord } from '../../services/recordService';
import { PatientInfo } from '../../types';

export interface LinkedPatientState {
  patientId: string;
  displayName: string;
  patientInfo: PatientInfo;
  /** The specific records the staff attached for analysis (not the patient's full history). */
  records: MedicalRecord[];
}
