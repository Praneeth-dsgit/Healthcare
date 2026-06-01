import { MedicalRecord } from '../../services/recordService';
import { PatientInfo } from '../../types';

export interface LinkedPatientState {
  patientId: string;
  displayName: string;
  patientInfo: PatientInfo;
  records: MedicalRecord[];
}
