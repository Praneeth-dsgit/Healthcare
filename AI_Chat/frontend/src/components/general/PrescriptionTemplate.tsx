/**
 * Prescription Template Component
 * Create prescriptions using a structured template
 */

import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Save, Printer, Download, Search, Calendar, ChevronDown } from 'lucide-react';
import { patientService } from '../../services/patientService';
import { doctorService } from '../../services/doctorService';
import { getAuthHeaders, authenticatedFetch } from '../../services/authService';
import { getApiRoot } from '../../utils/apiBase';
import {
  buildPrescriptionPdf,
  downloadPrescriptionPdf,
  prescriptionPdfBlob,
  PrescriptionPdfOptions,
} from '../../utils/prescriptionPdf';
import { LookupMedicineSelection } from './MedicineLookup';

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface PatientOption {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  age?: number;
  email?: string;
  phone?: string;
}

interface PrescriptionTemplateProps {
  onPrescriptionSaved?: () => void;
  initialPatientId?: string;
  selectedLookupMedicine?: {
    selection: LookupMedicineSelection;
    token: number;
  };
  onDiagnosisChange?: (diagnosis: string) => void;
}

const PrescriptionTemplate: React.FC<PrescriptionTemplateProps> = ({
  onPrescriptionSaved,
  initialPatientId,
  selectedLookupMedicine,
  onDiagnosisChange,
}) => {
  const [patientId, setPatientId] = useState(initialPatientId || '');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [prescriptionDate, setPrescriptionDate] = useState(new Date().toISOString().split('T')[0]);
  const [diagnosis, setDiagnosis] = useState('');
  const [medications, setMedications] = useState<Medication[]>([
    { id: '1', name: '', dosage: '', frequency: '', duration: '', instructions: '' }
  ]);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorQualification, setDoctorQualification] = useState('');
  const [doctorLicense, setDoctorLicense] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Patient dropdown state
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [loadingPatientDetails, setLoadingPatientDetails] = useState(false);
  const [doctorId, setDoctorId] = useState<number | undefined>(undefined);
  const [currentDoctorId, setCurrentDoctorId] = useState<number | undefined>(undefined);
  
  // Family member state
  const [prescriptionFor, setPrescriptionFor] = useState<'patient' | 'family_member'>('patient');
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<number | null>(null);
  const [loadingFamilyMembers, setLoadingFamilyMembers] = useState(false);
  const lastPdfSnapshotRef = useRef<PrescriptionPdfOptions | null>(null);

  const computeAge = (dateOfBirth?: string): string => {
    if (!dateOfBirth) return '';
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
    return age.toString();
  };

  const buildPdfOptions = async (): Promise<PrescriptionPdfOptions | null> => {
    const pid = patientId.trim();
    if (!pid) {
      setError('Please select or enter a patient ID');
      return null;
    }

    const filledMeds = medications.filter((m) => m.name.trim());
    if (filledMeds.length === 0) {
      setError('Add at least one medication with a name');
      return null;
    }

    let name = patientName.trim();
    let age = patientAge.trim();
    let gender = patientGender.trim();

    if (!name) {
      const result = await patientService.getPatientById(pid);
      if (result.success && result.patient) {
        const p = result.patient;
        name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        age = age || computeAge(p.date_of_birth);
        gender = gender || p.gender || '';
      }
    }

    let recipientLabel: string | undefined;
    if (prescriptionFor === 'family_member' && selectedFamilyMemberId) {
      const member = familyMembers.find((fm) => fm.family_member_id === selectedFamilyMemberId);
      if (member) {
        recipientLabel = `${member.first_name || ''} ${member.last_name || ''}`.trim();
        if (member.relationship) recipientLabel += ` (${member.relationship})`;
      }
    }

    return {
      patientId: pid,
      patientName: name || 'N/A',
      patientAge: age || 'N/A',
      patientGender: gender || 'N/A',
      prescriptionDate,
      diagnosis,
      medications: filledMeds.map((m) => ({
        name: m.name.trim(),
        dosage: m.dosage.trim(),
        frequency: m.frequency.trim(),
        duration: m.duration.trim(),
        instructions: m.instructions.trim(),
      })),
      additionalNotes,
      doctorName: doctorName.trim(),
      doctorQualification: doctorQualification.trim(),
      doctorLicense: doctorLicense.trim(),
      recipientLabel,
    };
  };

  // Load patients list and doctor info on mount
  useEffect(() => {
    loadDoctorInfo();
  }, []);

  // Load patient details if initialPatientId is provided
  useEffect(() => {
    if (initialPatientId?.trim()) {
      handlePatientSelect(initialPatientId.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPatientId]);

  // Load patients when search changes or doctorId is available
  useEffect(() => {
    if (doctorId === undefined) {
      return; // Wait for doctor ID to be loaded
    }
    const timer = setTimeout(() => {
      loadPatients(patientSearch);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientSearch, doctorId]);

  const loadPatients = async (search: string = '') => {
    if (doctorId === undefined) {
      return; // Wait for doctor ID to be loaded
    }
    setLoadingPatients(true);
    try {
      const result = await patientService.listPatients(search, doctorId);
      if (result.success && result.patients) {
        setPatients(result.patients);
      }
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoadingPatients(false);
    }
  };

  const loadDoctorInfo = async () => {
    try {
      const result = await doctorService.getCurrentDoctor();
      if (result.success && result.doctor) {
        setDoctorName(`${result.doctor.first_name} ${result.doctor.last_name}`.trim());
        setDoctorQualification(result.doctor.qualification || '');
        setDoctorId(result.doctor.doctor_id);
        setCurrentDoctorId(result.doctor.doctor_id);
      }
    } catch (error) {
      console.error('Error loading doctor info:', error);
    }
  };

  const handlePatientSelect = async (selectedPatientId: string) => {
    setPatientId(selectedPatientId);
    setShowPatientDropdown(false);
    setLoadingPatientDetails(true);
    setError(null);
    
    // Clear previous patient data and family member selection
    setPatientName('');
    setPatientAge('');
    setPatientGender('');
    setSelectedFamilyMemberId(null);
    setFamilyMembers([]);
    setPrescriptionFor('patient');
    
    try {
      const result = await patientService.getPatientById(selectedPatientId);
      if (result.success && result.patient) {
        const patient = result.patient;
        setPatientName(`${patient.first_name || ''} ${patient.last_name || ''}`.trim());
        
        // Calculate age from date_of_birth
        if (patient.date_of_birth) {
          setPatientAge(computeAge(patient.date_of_birth));
        }
        
        setPatientGender(patient.gender || '');
        
        // Load family members for this patient
        await loadFamilyMembers(selectedPatientId);
      } else {
        setError(result.error || 'Failed to load patient details');
      }
    } catch (error) {
      console.error('Error loading patient details:', error);
      setError('Error loading patient details');
    } finally {
      setLoadingPatientDetails(false);
    }
  };

  const loadFamilyMembers = async (patientId: string) => {
    setLoadingFamilyMembers(true);
    try {
      const result = await doctorService.getPatientFamilyMembers(patientId);
      if (result.success && result.family_members) {
        setFamilyMembers(result.family_members);
      }
    } catch (error) {
      console.error('Error loading family members:', error);
    } finally {
      setLoadingFamilyMembers(false);
    }
  };

  const handleFamilyMemberSelect = (memberId: number) => {
    setSelectedFamilyMemberId(memberId);
    const member = familyMembers.find(fm => fm.family_member_id === memberId);
    if (member) {
      setPatientName(`${member.first_name || ''} ${member.last_name || ''}`.trim());
      
      // Calculate age from date_of_birth
      if (member.date_of_birth) {
        setPatientAge(computeAge(member.date_of_birth));
      }
      
      setPatientGender(member.gender || '');
    }
  };

  const addMedication = () => {
    setMedications([
      ...medications,
      { id: Date.now().toString(), name: '', dosage: '', frequency: '', duration: '', instructions: '' }
    ]);
  };

  const removeMedication = (id: string) => {
    if (medications.length > 1) {
      setMedications(medications.filter((med) => med.id !== id));
    }
  };

  const updateMedication = (id: string, field: keyof Medication, value: string) => {
    setMedications(
      medications.map((med) => (med.id === id ? { ...med, [field]: value } : med))
    );
  };

  useEffect(() => {
    if (!selectedLookupMedicine?.selection?.name) return;
    const sel = selectedLookupMedicine.selection;

    setMedications((prev) => {
      const firstEmptyIdx = prev.findIndex((m) => !m.name.trim());
      const targetIdx = firstEmptyIdx >= 0 ? firstEmptyIdx : prev.length;
      const next = [...prev];
      const medRow: Medication = {
        id: firstEmptyIdx >= 0 ? next[targetIdx].id : Date.now().toString(),
        name: sel.name,
        dosage: sel.strength || '',
        frequency: '',
        duration: '',
        instructions: sel.indications || '',
      };
      if (firstEmptyIdx >= 0) {
        next[targetIdx] = { ...next[targetIdx], ...medRow };
      } else {
        next.push(medRow);
      }
      return next;
    });
  }, [selectedLookupMedicine?.token]);

  const handlePrint = async () => {
    const options = await buildPdfOptions();
    if (!options) return;
    const doc = buildPrescriptionPdf(options);
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  const handleDownload = async () => {
    setError(null);
    const options = await buildPdfOptions();
    if (!options) {
      if (lastPdfSnapshotRef.current) {
        downloadPrescriptionPdf(lastPdfSnapshotRef.current);
        return;
      }
      return;
    }
    lastPdfSnapshotRef.current = options;
    downloadPrescriptionPdf(options);
  };

  const handleSave = async () => {
    setError(null);
    const pdfOptions = await buildPdfOptions();
    if (!pdfOptions) return;

    if (prescriptionFor === 'family_member' && !selectedFamilyMemberId) {
      setError('Please select a family member');
      return;
    }

    setSaving(true);
    setSuccess(false);

    try {
      lastPdfSnapshotRef.current = pdfOptions;
      const pdfBlob = prescriptionPdfBlob(pdfOptions);
      const pdfFile = new File(
        [pdfBlob],
        `Prescription_${pdfOptions.patientId}_${prescriptionDate}.pdf`,
        { type: 'application/pdf' }
      );

      const formData = new FormData();
      formData.append('file', pdfFile);
      const pid = pdfOptions.patientId;
      formData.append('patient_id', pid);
      formData.append('record_type', 'prescription');
      formData.append('title', `Prescription - ${prescriptionDate}`);
      
      // Include family_member_id if prescription is for a family member
      if (prescriptionFor === 'family_member' && selectedFamilyMemberId) {
        formData.append('family_member_id', selectedFamilyMemberId.toString());
      }
      
      // Include doctor_id if available
      if (currentDoctorId) {
        formData.append('doctor_id', currentDoctorId.toString());
      }
      
      // Create description from prescription data
      const description = `
Patient: ${pdfOptions.patientName}
Patient ID: ${pdfOptions.patientId}
Age: ${pdfOptions.patientAge} | Gender: ${pdfOptions.patientGender}
Diagnosis: ${pdfOptions.diagnosis || 'N/A'}
Medications:
${pdfOptions.medications
  .map(
    (m, i) =>
      `${i + 1}. ${m.name}${m.dosage ? ` — ${m.dosage}` : ''}${m.frequency ? `, ${m.frequency}` : ''}${m.duration ? ` for ${m.duration}` : ''}${m.instructions ? `. ${m.instructions}` : ''}`
  )
  .join('\n')}
${pdfOptions.additionalNotes ? `Notes: ${pdfOptions.additionalNotes}` : ''}
Prescribed by: Dr. ${pdfOptions.doctorName || 'N/A'}
      `.trim();
      
      formData.append('description', description);
      formData.append('visit_date', prescriptionDate);

      // Upload to API (FormData: omit Content-Type so browser sets multipart boundary)
      const API_BASE = getApiRoot();
      const headers = getAuthHeaders() as Record<string, string>;
      delete headers['Content-Type'];
      if (pid) headers['X-Patient-ID'] = pid;
      const response = await authenticatedFetch(`${API_BASE}/patient/medical-records`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
        downloadPrescriptionPdf(pdfOptions);
        if (onPrescriptionSaved) {
          onPrescriptionSaved();
        }
        setTimeout(() => {
          setSuccess(false);
          setPatientId('');
          setPatientName('');
          setPatientAge('');
          setPatientGender('');
          setDiagnosis('');
          setMedications([{ id: '1', name: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
          setAdditionalNotes('');
          setPrescriptionFor('patient');
          setSelectedFamilyMemberId(null);
          setFamilyMembers([]);
        }, 3000);
      } else {
        setError(result.error || 'Failed to save prescription');
      }
    } catch (err) {
      setError('An error occurred while saving the prescription');
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-dropdown-container')) {
        setShowPatientDropdown(false);
      }
    };

    if (showPatientDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPatientDropdown]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-6 text-xl font-semibold text-slate-100">Create Prescription</h2>

        {/* Patient Information */}
        <div className="mb-6">
          <h3 className="mb-4 text-lg font-medium text-slate-200">Patient Information</h3>
          
          {/* Prescription For Toggle */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-300">Prescription For</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="prescriptionFor"
                  value="patient"
                  checked={prescriptionFor === 'patient'}
                  onChange={() => {
                    setPrescriptionFor('patient');
                    setSelectedFamilyMemberId(null);
                    // Reload patient details if patientId is set
                    if (patientId) {
                      handlePatientSelect(patientId);
                    }
                  }}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-300">Patient</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="prescriptionFor"
                  value="family_member"
                  checked={prescriptionFor === 'family_member'}
                  onChange={() => setPrescriptionFor('family_member')}
                  disabled={!patientId || familyMembers.length === 0}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-slate-300">Family Member</span>
                {!patientId && (
                  <span className="text-xs text-gray-500">(Select patient first)</span>
                )}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="patient-dropdown-container">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Patient ID <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  value={patientId}
                  onChange={(e) => {
                    setPatientId(e.target.value);
                    setPatientSearch(e.target.value);
                    setShowPatientDropdown(true);
                  }}
                  onFocus={() => {
                    if (patients.length > 0 || patientSearch) {
                      setShowPatientDropdown(true);
                      loadPatients(patientSearch);
                    }
                  }}
                  placeholder="Search or enter patient ID"
                  className="form-field w-full py-2 pl-10"
                />
                {loadingPatientDetails && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-sky-400"></div>
                  </div>
                )}
                
                {/* Patient Dropdown */}
                {showPatientDropdown && (patients.length > 0 || loadingPatients) && (
                  <div className="premium-card absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg">
                    {loadingPatients ? (
                      <div className="p-4 text-center text-gray-500">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                      </div>
                    ) : patients.length > 0 ? (
                      patients.map((patient) => (
                        <button
                          key={patient.patient_id}
                          type="button"
                          onClick={() => handlePatientSelect(patient.patient_id)}
                          className="w-full border-b border-slate-700/50 px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-sky-500/10"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-slate-100">
                                {patient.first_name} {patient.last_name}
                              </p>
                              <p className="text-sm text-gray-600">
                                ID: {patient.patient_id}
                                {patient.age && ` • Age: ${patient.age}`}
                                {patient.gender && ` • ${patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)}`}
                              </p>
                            </div>
                            <ChevronDown className="text-gray-400 transform rotate-[-90deg]" size={18} />
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        <p className="text-sm">No patients found</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Family Member Dropdown */}
            {prescriptionFor === 'family_member' && patientId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Family Member <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedFamilyMemberId || ''}
                    onChange={(e) => handleFamilyMemberSelect(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a family member</option>
                    {loadingFamilyMembers ? (
                      <option disabled>Loading...</option>
                    ) : familyMembers.length > 0 ? (
                      familyMembers.map((member) => (
                        <option key={member.family_member_id} value={member.family_member_id}>
                          {member.first_name} {member.last_name} ({member.relationship})
                        </option>
                      ))
                    ) : (
                      <option disabled>No family members found</option>
                    )}
                  </select>
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Patient Name</label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Auto-filled from database"
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Age</label>
              <input
                type="text"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
                placeholder="Auto-filled from database"
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
              <select
                value={patientGender}
                onChange={(e) => setPatientGender(e.target.value)}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-not-allowed"
              >
                <option value="">Auto-filled from database</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prescription Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="date"
                  value={prescriptionDate}
                  onChange={(e) => setPrescriptionDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Diagnosis */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Diagnosis</label>
          <input
            type="text"
            value={diagnosis}
            onChange={(e) => {
              const value = e.target.value;
              setDiagnosis(value);
              onDiagnosisChange?.(value);
            }}
            placeholder="Enter diagnosis"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Medications */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-800">Medications</h3>
            <button
              onClick={addMedication}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              <span>Add Medication</span>
            </button>
          </div>
          <div className="space-y-4">
            {medications.map((med, index) => (
              <div key={med.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Medication {index + 1}</span>
                  {medications.length > 1 && (
                    <button
                      onClick={() => removeMedication(med.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medication Name *</label>
                    <input
                      type="text"
                      value={med.name}
                      onChange={(e) => updateMedication(med.id, 'name', e.target.value)}
                      placeholder="e.g., Paracetamol 500mg"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dosage</label>
                    <input
                      type="text"
                      value={med.dosage}
                      onChange={(e) => updateMedication(med.id, 'dosage', e.target.value)}
                      placeholder="e.g., 500mg"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <input
                      type="text"
                      value={med.frequency}
                      onChange={(e) => updateMedication(med.id, 'frequency', e.target.value)}
                      placeholder="e.g., Twice daily"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                    <input
                      type="text"
                      value={med.duration}
                      onChange={(e) => updateMedication(med.id, 'duration', e.target.value)}
                      placeholder="e.g., 7 days"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                    <input
                      type="text"
                      value={med.instructions}
                      onChange={(e) => updateMedication(med.id, 'instructions', e.target.value)}
                      placeholder="e.g., Take after meals"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Notes */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
          <textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Any additional instructions or notes..."
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Doctor Information */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Doctor Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Doctor Name</label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Auto-filled from your profile"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Qualification</label>
              <input
                type="text"
                value={doctorQualification}
                onChange={(e) => setDoctorQualification(e.target.value)}
                placeholder="Auto-filled from your profile"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">License Number</label>
              <input
                type="text"
                value={doctorLicense}
                onChange={(e) => setDoctorLicense(e.target.value)}
                placeholder="Medical license number (optional)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">Prescription saved successfully!</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !patientId.trim()}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Save Prescription</span>
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Download size={18} />
            <span>Download PDF</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <Printer size={18} />
            <span>Print</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionTemplate;

