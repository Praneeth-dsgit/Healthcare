export interface PatientInfo {
  age: number;
  weight: number;
  gender: 'male' | 'female' | 'other';
  height?: number;
  bloodPressure?: string;
  allergies?: string;
  medications?: string;
  medicalHistory?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  patientInfo?: PatientInfo;
  isError?: boolean;
  // Add file preview support
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
  pdfThumbnail?: string;
}