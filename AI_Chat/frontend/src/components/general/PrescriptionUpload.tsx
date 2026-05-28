/**
 * Prescription Upload Component
 * Upload prescriptions for patients by patient ID
 */

import React, { useState, useEffect } from 'react';
import { Upload, Search, FileText, X, CheckCircle, FileEdit, List, Calendar, User, Download } from 'lucide-react';
import PrescriptionTemplate from './PrescriptionTemplate';
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

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('template')}
              className={`
                flex-1 flex items-center justify-center space-x-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === 'template'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <FileEdit size={18} />
              <span>Create Prescription</span>
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`
                flex-1 flex items-center justify-center space-x-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === 'upload'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <Upload size={18} />
              <span>Upload File</span>
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`
                flex-1 flex items-center justify-center space-x-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === 'list'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <List size={18} />
              <span>My Prescriptions</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'template' ? (
        <PrescriptionTemplate 
          onPrescriptionSaved={loadPrescriptions}
          initialPatientId={initialPatientId}
        />
      ) : activeTab === 'list' ? (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">My Prescribed Prescriptions</h2>
          
          {loadingPrescriptions ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto text-gray-400" size={48} />
              <p className="mt-4 text-gray-600">No prescriptions found</p>
              <p className="text-sm text-gray-500 mt-2">Prescriptions you create will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {prescriptions.map((prescription) => (
                <div
                  key={prescription.record_id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <FileText className="text-blue-600" size={20} />
                        <h3 className="text-lg font-semibold text-gray-900">{prescription.title}</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm text-gray-600">
                        <div className="flex items-center space-x-2">
                          <User size={16} className="text-gray-400" />
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
                          <span className="text-gray-400">Patient ID:</span>
                          <span className="font-mono text-xs">{prescription.patient_id}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Calendar size={16} className="text-gray-400" />
                          <span>Visit Date: {formatDate(prescription.visit_date)}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Calendar size={16} className="text-gray-400" />
                          <span>Created: {formatDate(prescription.created_at)}</span>
                        </div>
                      </div>
                      
                      {prescription.description && (
                        <p className="mt-3 text-sm text-gray-700">{prescription.description}</p>
                      )}
                    </div>
                    
                    {prescription.file_url && (
                      <button
                        onClick={() => handleDownload(prescription.file_url!, prescription.title)}
                        className="ml-4 flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Upload Prescription</h2>

        {/* Patient ID Search */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Patient ID <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Enter patient ID (e.g., PAT123456)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* File Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Prescription File <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
            <div className="space-y-1 text-center">
              {selectedFile ? (
                <div className="flex items-center justify-center space-x-2">
                  <FileText className="text-blue-600" size={24} />
                  <span className="text-sm text-gray-700">{selectedFile.name}</span>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="ml-2 text-red-600 hover:text-red-800"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto text-gray-400" size={24} />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="prescription-file"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
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
                  <p className="text-xs text-gray-500">PDF or images up to 10MB</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Prescription Notes */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes (Optional)
          </label>
          <textarea
            value={prescriptionNotes}
            onChange={(e) => setPrescriptionNotes(e.target.value)}
            placeholder="Add any additional notes about this prescription..."
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {uploadSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
            <CheckCircle className="text-green-600" size={20} />
            <p className="text-sm text-green-800">Prescription uploaded successfully!</p>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={uploading || !patientId.trim() || !selectedFile}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
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

