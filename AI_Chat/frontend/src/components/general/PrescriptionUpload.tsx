/**
 * Prescription Upload Component
 * Upload prescriptions for patients by patient ID
 */

import React, { useState, useEffect } from 'react';
import { Upload, Search, FileText, X, CheckCircle, FileEdit, List, Calendar, User, Download } from 'lucide-react';
import PrescriptionTemplate from './PrescriptionTemplate';
import SegmentTabs from '../ui/SegmentTabs';
import { doctorService } from '../../services/doctorService';
import { getAuthHeaders, authenticatedFetch } from '../../services/authService';
import { getApiBaseUrl, getApiRoot } from '../../utils/apiBase';

interface Prescription {
  record_id: number;
  patient_id: string;
  patient_first_name?: string;
  patient_last_name?: string;
  patient_email?: string;
  family_member_first_name?: string;
  family_member_last_name?: string;
  title: string;
  description?: string;
  visit_date: string;
  created_at: string;
  file_url?: string;
  file_type?: string;
}

interface PrescriptionUploadProps {
  initialPatientId?: string;
}

const PrescriptionUpload: React.FC<PrescriptionUploadProps> = ({ initialPatientId }) => {
  const [activeTab, setActiveTab] = useState<'template' | 'upload' | 'list'>('template');
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);
  const [doctorId, setDoctorId] = useState<number | undefined>(undefined);
  const [patientId, setPatientId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prescriptionNotes, setPrescriptionNotes] = useState('');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
        setError('Please upload a PDF or image file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  useEffect(() => {
    loadDoctorInfo();
  }, []);

  useEffect(() => {
    if (activeTab === 'list' && doctorId !== undefined) {
      loadPrescriptions();
    }
  }, [activeTab, doctorId]);

  const loadDoctorInfo = async () => {
    try {
      const result = await doctorService.getCurrentDoctor();
      if (result.success && result.doctor) {
        setDoctorId(result.doctor.doctor_id);
      }
    } catch (error) {
      console.error('Error loading doctor info:', error);
    }
  };

  const loadPrescriptions = async () => {
    if (doctorId === undefined) {
      return;
    }
    setLoadingPrescriptions(true);
    try {
      const result = await doctorService.getPrescriptions(doctorId);
      if (result.success && result.prescriptions) {
        setPrescriptions(result.prescriptions);
      }
    } catch (error) {
      console.error('Error loading prescriptions:', error);
    } finally {
      setLoadingPrescriptions(false);
    }
  };

  const handleDownload = (fileUrl: string, fileName: string) => {
    if (fileUrl) {
      const API_BASE = getApiBaseUrl();
      const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${API_BASE}${fileUrl}`;
      window.open(fullUrl, '_blank');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const handleUpload = async () => {
    if (!patientId.trim()) {
      setError('Please enter a patient ID');
      return;
    }
    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('patient_id', patientId.trim());
      formData.append('record_type', 'prescription');
      formData.append('title', `Prescription - ${selectedFile.name}`);
      if (doctorId) {
        formData.append('doctor_id', doctorId.toString());
      }
      if (prescriptionNotes) {
        formData.append('description', prescriptionNotes);
      }

      // Upload directly to API endpoint (FormData: omit Content-Type so browser sets multipart boundary)
      const API_BASE = getApiRoot();
      const headers = getAuthHeaders() as Record<string, string>;
      delete headers['Content-Type'];
      if (patientId.trim()) headers['X-Patient-ID'] = patientId.trim();
      const response = await authenticatedFetch(`${API_BASE}/patient/medical-records`, {
        method: 'POST',
        headers,
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        setUploadSuccess(true);
        setSelectedFile(null);
        setPrescriptionNotes('');
        setPatientId('');
        // Reset file input
        const fileInput = document.getElementById('prescription-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        
        setTimeout(() => setUploadSuccess(false), 3000);
        // Reload prescriptions list if on that tab
        if (activeTab === 'list') {
          loadPrescriptions();
        }
      } else {
        setError(result.error || 'Failed to upload prescription');
      }
    } catch (err) {
      setError('An error occurred while uploading the prescription');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const prescriptionTabs = [
    { id: 'template', label: 'Create Prescription', icon: FileEdit },
    { id: 'upload', label: 'Upload File', icon: Upload },
    { id: 'list', label: 'My Prescriptions', icon: List },
  ];

  return (
    <div className="space-y-5">
      <SegmentTabs
        tabs={prescriptionTabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'template' | 'upload' | 'list')}
        className="w-full max-w-2xl"
      />

      {activeTab === 'template' ? (
        <PrescriptionTemplate 
          onPrescriptionSaved={loadPrescriptions}
          initialPatientId={initialPatientId}
        />
      ) : activeTab === 'list' ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-100">My Prescribed Prescriptions</h2>
          
          {loadingPrescriptions ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-sky-400" />
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto text-slate-500" size={48} />
              <p className="mt-4 text-slate-400">No prescriptions found</p>
              <p className="mt-2 text-sm text-slate-500">Prescriptions you create will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {prescriptions.map((prescription) => (
                <div
                  key={prescription.record_id}
                  className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4 transition-colors hover:border-sky-500/30"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <FileText className="text-sky-300" size={20} />
                        <h3 className="text-lg font-semibold text-slate-100">{prescription.title}</h3>
                      </div>
                      
                      <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-slate-400 md:grid-cols-2">
                        <div className="flex items-center space-x-2">
                          <User size={16} className="text-slate-500" />
                          <span>
                            {prescription.family_member_first_name && prescription.family_member_last_name
                              ? `${prescription.family_member_first_name} ${prescription.family_member_last_name}`
                              : prescription.patient_first_name && prescription.patient_last_name
                              ? `${prescription.patient_first_name} ${prescription.patient_last_name}`
                              : prescription.patient_email
                              ? prescription.patient_email.split('@')[0]
                              : 'Patient'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-500">Patient ID:</span>
                          <span className="font-mono text-xs">{prescription.patient_id}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Calendar size={16} className="text-slate-500" />
                          <span>Visit Date: {formatDate(prescription.visit_date)}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Calendar size={16} className="text-slate-500" />
                          <span>Created: {formatDate(prescription.created_at)}</span>
                        </div>
                      </div>
                      
                      {prescription.description && (
                        <p className="mt-3 text-sm text-slate-300">{prescription.description}</p>
                      )}
                    </div>
                    
                    {prescription.file_url && (
                      <button
                        type="button"
                        onClick={() => handleDownload(prescription.file_url!, prescription.title)}
                        className="portal-accent-button ml-4 flex items-center gap-2 rounded-lg px-4 py-2"
                      >
                        <Download size={18} />
                        <span>Download</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-100">Upload Prescription</h2>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Patient ID <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Enter patient ID (e.g., PAT123456)"
              className="form-field w-full py-2 pl-10"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Prescription File <span className="text-red-400">*</span>
          </label>
          <div className="mt-1 flex justify-center rounded-lg border-2 border-dashed border-slate-600 px-6 pb-6 pt-5 transition-colors hover:border-sky-500/50">
            <div className="space-y-1 text-center">
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="text-sky-300" size={24} />
                  <span className="text-sm text-slate-300">{selectedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="ml-2 text-red-400 hover:text-red-300"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto text-slate-500" size={24} />
                  <div className="flex text-sm text-slate-400">
                    <label
                      htmlFor="prescription-file"
                      className="relative cursor-pointer font-medium text-sky-300 hover:text-sky-200"
                    >
                      <span>Upload a file</span>
                      <input
                        id="prescription-file"
                        name="prescription-file"
                        type="file"
                        className="sr-only"
                        accept=".pdf,image/*"
                        onChange={handleFileSelect}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-slate-500">PDF or images up to 10MB</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Notes (Optional)</label>
          <textarea
            value={prescriptionNotes}
            onChange={(e) => setPrescriptionNotes(e.target.value)}
            placeholder="Add any additional notes about this prescription..."
            rows={4}
            className="form-field w-full resize-none"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/35 bg-red-500/10 p-3">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {uploadSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3">
            <CheckCircle className="text-emerald-400" size={20} />
            <p className="text-sm text-emerald-300">Prescription uploaded successfully!</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || !patientId.trim() || !selectedFile}
          className="portal-accent-button flex w-full items-center justify-center gap-2 rounded-lg py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Upload size={20} />
              <span>Upload Prescription</span>
            </>
          )}
        </button>
        </div>
      )}
    </div>
  );
};

export default PrescriptionUpload;

