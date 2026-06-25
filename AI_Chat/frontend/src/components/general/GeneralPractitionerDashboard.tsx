/**
 * General Practitioner Dashboard
 * Main dashboard for general medicine practitioners
 */

import React, { useState, useEffect } from 'react';
import { Calendar, FileText, Search, BarChart3, User, LogOut, ChevronDown, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DoctorAppointments from './DoctorAppointments';
import PrescriptionUpload from './PrescriptionUpload';
import MedicineLookup, { LookupMedicineSelection } from './MedicineLookup';
import ReportsAnalytics from './ReportsAnalytics';
import SegmentTabs from '../ui/SegmentTabs';
import StatCard from '../ui/StatCard';
import { doctorService, Doctor } from '../../services/doctorService';
import { roleService } from '../../services/roleService';

type TabType = 'appointments' | 'prescriptions' | 'analytics';

const GeneralPractitionerDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('appointments');
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loadingDoctor, setLoadingDoctor] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [prescriptionPatientId, setPrescriptionPatientId] = useState<string | null>(null);
  const [selectedLookupMedicine, setSelectedLookupMedicine] = useState<{
    selection: LookupMedicineSelection;
    token: number;
  } | null>(null);
  const [diagnosisForLookup, setDiagnosisForLookup] = useState('');
  const navigate = useNavigate();

  const mainTabs = [
    { id: 'appointments' as TabType, label: 'Appointments', icon: Calendar },
    { id: 'prescriptions' as TabType, label: 'Prescriptions', icon: FileText },
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
    roleService.clearCache();
    navigate('/login');
  };

  const doctorName = doctor
    ? `${doctor.first_name} ${doctor.last_name}`.trim()
    : 'Doctor';
  const doctorSpecialty = doctor?.specialty_name || 'General Practitioner';

  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden" data-portal="doctor">
      <div className="app-topbar z-30 shrink-0">
        <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white">
              AH
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-300">Doctor Portal</p>
              <h1 className="truncate text-xl font-extrabold text-slate-100 sm:text-2xl">
                General Practitioner Dashboard
              </h1>
              <p className="mt-0.5 text-sm text-slate-400">
                Manage appointments, prescriptions, and patient care
              </p>
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="ghost-button flex items-center gap-3 rounded-xl px-3 py-2"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15">
                <User className="h-6 w-6 text-sky-300" />
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-bold text-slate-100">
                  {loadingDoctor ? 'Loading...' : doctorName}
                </p>
                <p className="text-xs text-slate-400">
                  {loadingDoctor ? '' : doctorSpecialty}
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />
                <div className="premium-card absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-red-500/15 hover:text-red-300"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex justify-start">
              <div className="grid w-full max-w-md grid-cols-2 gap-3 animate-stagger-children sm:w-auto">
                <StatCard
                  label="Today's Appointments"
                  value="—"
                  icon={Calendar}
                  accentClass="text-sky-300 bg-sky-500/15"
                />
                <StatCard
                  label="Patients Seen"
                  value="—"
                  icon={Users}
                  accentClass="text-sky-300 bg-sky-500/15"
                />
              </div>
            </div>

            <SegmentTabs
              tabs={mainTabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as TabType)}
            />

            <div className="premium-card tab-content-fade p-4 sm:p-6">
              {activeTab === 'appointments' && (
                <DoctorAppointments
                  onPrescribe={(patientId) => {
                    setPrescriptionPatientId(patientId);
                    setActiveTab('prescriptions');
                  }}
                />
              )}
              {activeTab === 'prescriptions' && (
                <PrescriptionUpload
                  initialPatientId={prescriptionPatientId || undefined}
                  selectedLookupMedicine={selectedLookupMedicine || undefined}
                  onDiagnosisChange={setDiagnosisForLookup}
                />
              )}
              {activeTab === 'analytics' && <ReportsAnalytics />}
            </div>
          </div>

          <aside className="premium-card flex h-[min(560px,calc(100vh-8rem))] max-h-[calc(100vh-8rem)] w-full shrink-0 flex-col overflow-hidden xl:sticky xl:top-5 xl:h-[calc(100vh-7rem)] xl:w-[min(100%,420px)]">
            <div className="shrink-0 border-b border-sky-500/20 px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Search className="h-4 w-4 text-sky-400" />
                Medicine Lookup
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">Search diseases, symptoms, and treatments</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
              <MedicineLookup
                embedded
                diagnosisQuery={diagnosisForLookup}
                onSelectMedicine={(selection) => {
                  setSelectedLookupMedicine({ selection, token: Date.now() });
                  setActiveTab('prescriptions');
                }}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default GeneralPractitionerDashboard;
