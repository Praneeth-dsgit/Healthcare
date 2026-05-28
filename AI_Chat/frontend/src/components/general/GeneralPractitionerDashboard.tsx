/**
 * General Practitioner Dashboard
 * Main dashboard for general medicine practitioners
 */

import React, { useState, useEffect } from 'react';
import { Calendar, FileText, Search, BarChart3, User, LogOut, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DoctorAppointments from './DoctorAppointments';
import PrescriptionUpload from './PrescriptionUpload';
import MedicineLookup from './MedicineLookup';
import ReportsAnalytics from './ReportsAnalytics';
import { doctorService, Doctor } from '../../services/doctorService';
import { roleService } from '../../services/roleService';

type TabType = 'appointments' | 'prescriptions' | 'medicine' | 'analytics';

const GeneralPractitionerDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('appointments');
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loadingDoctor, setLoadingDoctor] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [prescriptionPatientId, setPrescriptionPatientId] = useState<string | null>(null);
  const navigate = useNavigate();

  const tabs = [
    { id: 'appointments' as TabType, label: 'Appointments', icon: Calendar },
    { id: 'prescriptions' as TabType, label: 'Prescriptions', icon: FileText },
    { id: 'medicine' as TabType, label: 'Medicine Lookup', icon: Search },
    { id: 'analytics' as TabType, label: 'Reports & Analytics', icon: BarChart3 },
  ];

  useEffect(() => {
    loadDoctorInfo();
  }, []);

  const loadDoctorInfo = async () => {
    setLoadingDoctor(true);
    try {
      const result = await doctorService.getCurrentDoctor();
      if (result.success && result.doctor) {
        setDoctor(result.doctor);
      }
    } catch (error) {
      console.error('Error loading doctor info:', error);
    } finally {
      setLoadingDoctor(false);
    }
  };

  const handleLogout = () => {
    import('../../services/authService').then((m) => m.clearAuth());
    // Clear role cache
    roleService.clearCache();
    navigate('/login');
  };

  const doctorName = doctor 
    ? `${doctor.first_name} ${doctor.last_name}`.trim() 
    : 'Doctor';
  const doctorSpecialty = doctor?.specialty_name || 'General Practitioner';

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-300 shadow-sm border-b border-gray-100">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div>
                <h1 className="text-xl font-bold text-blue-600">Acufore Health</h1>
                <p className="text-xs text-gray-500">Healthcare Management</p>
              </div>
              <div className="h-12 w-px bg-gray-300"></div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">General Practitioner Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">Manage appointments, prescriptions, and patient care</p>
              </div>
            </div>
            
            {/* Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-sm font-medium text-gray-900">
                      {loadingDoctor ? 'Loading...' : doctorName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {loadingDoctor ? '' : doctorSpecialty}
                    </p>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                    <div className="py-1">
                      <div className="px-4 py-3 border-b border-gray-200 sm:hidden">
                        <p className="text-sm font-medium text-gray-900">{doctorName}</p>
                        <p className="text-xs text-gray-500 mt-1">{doctorSpecialty}</p>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Logout
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'appointments' && (
            <DoctorAppointments
              onPrescribe={(patientId) => {
                setPrescriptionPatientId(patientId);
                setActiveTab('prescriptions');
              }}
            />
          )}
          {activeTab === 'prescriptions' && (
            <PrescriptionUpload initialPatientId={prescriptionPatientId || undefined} />
          )}
          {activeTab === 'medicine' && <MedicineLookup />}
          {activeTab === 'analytics' && <ReportsAnalytics />}
        </div>
      </div>
    </div>
  );
};

export default GeneralPractitionerDashboard;

