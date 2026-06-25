/**
 * Medical Records Component
 * View and download medical records
 */

import React, { useState, useEffect } from 'react';
import { FileText, Download, Calendar, Search, Stethoscope, User } from 'lucide-react';
import { recordService, MedicalRecord } from '../../services/recordService';
import { patientService, FamilyMember, Patient } from '../../services/patientService';
import {
  PortalPageShell,
  PortalPageHero,
  PortalLoading,
  portalInputClass,
} from '../patient/portalPageLayout';
import { getMedicalRecordDownloadName } from '../../utils/medicalRecordDownload';

// Component to format prescription description
const PrescriptionDescription: React.FC<{ 
  description: string; 
  patient?: Patient | null; 
  familyMember?: { first_name?: string; last_name?: string; date_of_birth?: string; gender?: string } | null;
}> = ({ description, patient, familyMember }) => {
  // Calculate age from date of birth
  const calculateAge = (dateOfBirth?: string): string => {
    if (!dateOfBirth) return 'N/A';
    try {
      const dob = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      return age.toString();
    } catch {
      return 'N/A';
    }
  };

  // Get patient name
  const getPatientName = (): string => {
    if (familyMember) {
      return `${familyMember.first_name || ''} ${familyMember.last_name || ''}`.trim() || 'N/A';
    }
    if (patient) {
      return `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'N/A';
    }
    return 'N/A';
  };

  // Get patient age
  const getPatientAge = (): string => {
    if (familyMember?.date_of_birth) {
      return calculateAge(familyMember.date_of_birth);
    }
    if (patient?.date_of_birth) {
      return calculateAge(patient.date_of_birth);
    }
    return 'N/A';
  };

  // Get patient gender
  const getPatientGender = (): string => {
    if (familyMember?.gender) {
      return familyMember.gender;
    }
    if (patient?.gender) {
      return patient.gender;
    }
    return 'N/A';
  };

  // Parse the description to extract structured information
  const parseDescription = (desc: string) => {
    const lines = desc.split('\n').filter(line => line.trim());
    const info: Record<string, string> = {};
    
    lines.forEach(line => {
      // Patient info line: "Patient: N/A Age: N/A | Gender: N/A"
      if (line.includes('Patient:')) {
        const patientMatch = line.match(/Patient:\s*([^A]*?)\s*Age:\s*([^|]*?)\s*\|?\s*Gender:\s*(.*)/);
        if (patientMatch) {
          info.patient = patientMatch[1].trim() || 'N/A';
          info.age = patientMatch[2].trim() || 'N/A';
          info.gender = patientMatch[3].trim() || 'N/A';
        }
      }
      // Diagnosis line: "Diagnosis: fever"
      else if (line.includes('Diagnosis:')) {
        info.diagnosis = line.replace('Diagnosis:', '').trim() || 'N/A';
      }
      // Medications line: "Medications: dolo (500, 2)"
      else if (line.includes('Medications:')) {
        info.medications = line.replace('Medications:', '').trim() || 'N/A';
      }
      // Prescribed by line: "Prescribed by: Dr. Amit Patel"
      else if (line.includes('Prescribed by:')) {
        info.prescribedBy = line.replace('Prescribed by:', '').trim() || 'N/A';
      }
      // Notes line: "Notes: ..."
      else if (line.includes('Notes:')) {
        info.notes = line.replace('Notes:', '').trim() || '';
      }
    });
    
    return info;
  };

  const prescriptionInfo = parseDescription(description);
  
  // Override patient info from patient/family member data if available
  if (prescriptionInfo.patient === 'N/A' || !prescriptionInfo.patient) {
    prescriptionInfo.patient = getPatientName();
  }
  if (prescriptionInfo.age === 'N/A' || !prescriptionInfo.age) {
    prescriptionInfo.age = getPatientAge();
  }
  if (prescriptionInfo.gender === 'N/A' || !prescriptionInfo.gender) {
    prescriptionInfo.gender = getPatientGender();
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Patient Information */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div>
          <span className="font-semibold text-gray-700">Patient: </span>
          <span className="text-gray-900">{prescriptionInfo.patient}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Age: </span>
          <span className="text-gray-900">{prescriptionInfo.age}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Gender: </span>
          <span className="text-gray-900">{prescriptionInfo.gender}</span>
        </div>
      </div>

      {/* Diagnosis */}
      {prescriptionInfo.diagnosis && prescriptionInfo.diagnosis !== 'N/A' && (
        <div>
          <span className="font-semibold text-gray-700">Diagnosis: </span>
          <span className="text-gray-900">{prescriptionInfo.diagnosis}</span>
        </div>
      )}

      {/* Medications */}
      {prescriptionInfo.medications && prescriptionInfo.medications !== 'N/A' && (
        <div>
          <span className="font-semibold text-gray-700">Medications: </span>
          <span className="text-gray-900">{prescriptionInfo.medications}</span>
        </div>
      )}

      {/* Prescribed By */}
      {prescriptionInfo.prescribedBy && prescriptionInfo.prescribedBy !== 'N/A' && (
        <div>
          <span className="font-semibold text-gray-700">Prescribed by: </span>
          <span className="text-gray-900">{prescriptionInfo.prescribedBy}</span>
        </div>
      )}

      {/* Notes */}
      {prescriptionInfo.notes && (
        <div className="pt-2 border-t border-gray-200">
          <span className="font-semibold text-gray-700">Notes: </span>
          <span className="text-gray-900">{prescriptionInfo.notes}</span>
        </div>
      )}
    </div>
  );
};

const RECORD_TYPES = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'radiology_report', label: 'Radiology Report' },
  { value: 'visit_summary', label: 'Visit Summary' },
  { value: 'discharge_summary', label: 'Discharge Summary' },
  { value: 'other', label: 'Other' },
];

const MedicalRecords: React.FC = () => {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<string>('all'); // 'all', 'self', or family_member_id
  const [patient, setPatient] = useState<Patient | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  useEffect(() => {
    loadPatientData();
  }, []);

  useEffect(() => {
    loadRecords();
  }, [filterType, selectedPerson]);

  const loadPatientData = async () => {
    try {
      const [patientResult, familyResult] = await Promise.all([
        patientService.getProfile(),
        patientService.getFamilyMembers(),
      ]);
      if (patientResult.success && patientResult.patient) {
        setPatient(patientResult.patient);
      }
      if (familyResult.success && familyResult.family_members) {
        setFamilyMembers(familyResult.family_members);
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      const result = await recordService.getRecords({
        type: filterType || undefined,
        family_member_id: selectedPerson === 'all' ? undefined : selectedPerson,
      });
      if (result.success && result.records) {
        setRecords(result.records);
      }
    } catch (error) {
      console.error('Error loading records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (record: MedicalRecord) => {
    try {
      const result = await recordService.downloadRecord(record.record_id);
      if (result) {
        const url = window.URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          result.filename || getMedicalRecordDownloadName(record);
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading record:', error);
    }
  };

  const filteredRecords = records.filter((record) => {
    if (searchTerm) {
      return (
        record.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return true;
  });

  if (loading) {
    return <PortalLoading message="Loading medical records…" />;
  }

  return (
    <PortalPageShell>
        <PortalPageHero
          eyebrow="Health documents"
          title="Medical Records"
          subtitle="Search, filter, and download your visit summaries, labs, and prescriptions."
          icon={<FileText />}
          badges={
            <span className="rounded-full bg-teal-500/15 px-3 py-1 text-sm font-semibold text-teal-200">
              {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
            </span>
          }
          actions={
            <div className="flex w-full min-w-0 flex-col gap-2 sm:min-w-[18rem] lg:min-w-[20rem] xl:min-w-[32rem] xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`${portalInputClass} py-2 pl-9 text-sm`}
                />
              </div>
              <div className="relative w-full shrink-0 xl:w-44">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <select
                  value={selectedPerson}
                  onChange={(e) => setSelectedPerson(e.target.value)}
                  className={`${portalInputClass} appearance-none py-2 pl-9 text-sm`}
                >
                  <option value="all">All records</option>
                  <option value="self">
                    {patient ? `${patient.first_name} ${patient.last_name} (Me)` : 'My records'}
                  </option>
                  {familyMembers.map((member) => (
                    <option key={member.family_member_id} value={String(member.family_member_id)}>
                      {member.first_name} {member.last_name} ({member.relationship})
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className={`${portalInputClass} w-full shrink-0 py-2 text-sm xl:w-40`}
              >
                <option value="">All types</option>
                {RECORD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          }
        />

        {/* Records List */}
        {filteredRecords.length === 0 ? (
          <div className="premium-card p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">No medical records found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredRecords.map((record) => (
              <div key={record.record_id} className={`premium-card transition-all duration-300 ${
                record.record_type === 'prescription' ? 'p-6 border-l-4 border-blue-500' : 'p-6'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Header with Icon, Title, and Tags */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className={`rounded-full p-2 flex-shrink-0 ${
                        record.record_type === 'prescription' 
                          ? 'bg-blue-100' 
                          : 'bg-gray-100'
                      }`}>
                        <FileText className={`h-5 w-5 ${
                          record.record_type === 'prescription' 
                            ? 'text-blue-600' 
                            : 'text-gray-600'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="text-xl font-bold text-gray-900">{record.title}</h3>
                          <span className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-medium capitalize">
                            {record.record_type.replace('_', ' ')}
                          </span>
                          {record.family_member_id ? (
                            <span className="bg-purple-100 text-purple-700 text-xs px-2.5 py-1 rounded-full font-medium">
                              {record.family_member_first_name && record.family_member_last_name
                                ? `${record.family_member_first_name} ${record.family_member_last_name}`
                                : 'Family Member'}
                            </span>
                          ) : (
                            <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">
                              {patient ? `${patient.first_name} ${patient.last_name}` : 'My Record'}
                            </span>
                          )}
                        </div>
                        
                        {/* Description - Formatted for prescriptions */}
                        {record.description && (
                          <div className="text-gray-700 mb-4">
                            {record.record_type === 'prescription' ? (
                              <PrescriptionDescription 
                                description={record.description}
                                patient={record.family_member_id ? null : patient}
                                familyMember={record.family_member_id 
                                  ? familyMembers.find(fm => fm.family_member_id === record.family_member_id) || null
                                  : null
                                }
                              />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">{record.description}</p>
                            )}
                          </div>
                        )}
                        
                        {/* Date and Facility Info */}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(record.visit_date).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          {record.facility_id && (
                            <span className="flex items-center gap-1">
                              <Stethoscope className="h-4 w-4" />
                              Facility ID: {record.facility_id}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Download Button */}
                  {(record.file_url || record.record_type === 'prescription') && (
                    <button
                      onClick={() => handleDownload(record)}
                      className="ml-4 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 hover:shadow-lg hover:scale-105 flex items-center gap-2 transition-all duration-200 font-medium"
                      title="Download record"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
    </PortalPageShell>
  );
};

export default MedicalRecords;

