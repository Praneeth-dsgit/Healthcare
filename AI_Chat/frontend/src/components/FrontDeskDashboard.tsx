/**
 * Front Desk Dashboard - HMS Receptionist UI
 * Administrative & billing access only. No clinical notes or prescription editing.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  UserPlus,
  Calendar,
  CreditCard,
  ListOrdered,
  FileText,
  LogOut,
  Users,
  Clock,
  CheckCircle,
  DollarSign,
  Stethoscope,
  User,
  CalendarPlus,
  Receipt,
  Search,
  Printer,
  X,
  ChevronRight,
  Upload,
  AlertCircle,
} from 'lucide-react';

import { getApiBaseUrl } from '../utils/apiBase';

const API_BASE = `${getApiBaseUrl()}/api/patient-engagement`;

type NavTab = 'dashboard' | 'registration' | 'appointments' | 'billing' | 'queue' | 'reports';

interface Doctor {
  id: number;
  name: string;
  department_id: number;
  department_name: string;
}

interface Department {
  id: number;
  name: string;
}

interface DailyAppointment {
  id: string;
  appointmentDate: string;
  patientName: string;
  patientPhone: string;
  appointmentTime: string;
  doctorName: string;
  department: string;
  status: string;
}

interface FrontDeskStats {
  todayAppointments: number;
  waitingPatients: number;
  completedVisits: number;
  pendingPayments: number;
  todayRevenue: number;
  doctorsAvailable: number;
}

interface RegistrationForm {
  fullName: string;
  mobile: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  idProofFile: File | null;
}

interface BillItem {
  id: string;
  serviceName: string;
  quantity: number;
  price: number;
  total: number;
}

interface QueueItem {
  token: string;
  patientName: string;
  doctorName: string;
  status: 'waiting' | 'in_consultation' | 'completed';
  appointmentId: string;
}

const FrontDeskDashboard: React.FC<{
  sessionId?: string | null;
  onLogout?: () => void;
  forcedTab?: NavTab;
  hideNav?: boolean;
}> = ({ sessionId, onLogout, forcedTab, hideNav = false }) => {
  const [activeTab, setActiveTab] = useState<NavTab>(forcedTab ?? 'dashboard');
  const [stats, setStats] = useState<FrontDeskStats>({
    todayAppointments: 0,
    waitingPatients: 0,
    completedVisits: 0,
    pendingPayments: 0,
    todayRevenue: 0,
    doctorsAvailable: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [dailyAppointments, setDailyAppointments] = useState<DailyAppointment[]>([]);

  // Registration form
  const [regForm, setRegForm] = useState<RegistrationForm>({
    fullName: '',
    mobile: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    idProofFile: null,
  });
  const [uhid, setUhid] = useState<string>('');
  const [regSaving, setRegSaving] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  // Appointment booking
  const [aptDoctorId, setAptDoctorId] = useState('');
  const [aptDate, setAptDate] = useState('');
  const [aptTime, setAptTime] = useState('');
  const [aptVisitType, setAptVisitType] = useState<'new' | 'followup'>('new');
  const [aptNotes, setAptNotes] = useState('');
  const [aptPatientName, setAptPatientName] = useState('');
  const [aptPatientPhone, setAptPatientPhone] = useState('');
  const [aptSubmitting, setAptSubmitting] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Record<string, Array<{ time: string; displayTime: string }>>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Billing
  const [billingPatientSearch, setBillingPatientSearch] = useState('');
  const [billingService, setBillingService] = useState('');
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'card' | 'upi'>('cash');
  const [billingPatientId, setBillingPatientId] = useState<string | null>(null);

  // Queue
  const [queueList, setQueueList] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  useEffect(() => {
    if (forcedTab) setActiveTab(forcedTab);
  }, [forcedTab]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [appRes, doctorsRes] = await Promise.all([
        fetch(`${API_BASE}/daily-appointments`),
        fetch(`${API_BASE}/doctors`),
      ]);
      const appData = await appRes.json();
      const doctorsData = await doctorsRes.json();

      const appointments: DailyAppointment[] = (appData.appointments || []).map((a: any) => ({
        id: String(a.appointment_id ?? a.id ?? ''),
        appointmentDate: a.appointment_date ? new Date(a.appointment_date).toLocaleDateString() : '',
        patientName: a.patient_name || '',
        patientPhone: a.patient_phone || '',
        appointmentTime: a.appointment_date ? new Date(a.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        doctorName: a.doctor_name || '',
        department: a.department_name || '',
        status: a.status || 'scheduled',
      }));

      setDailyAppointments(appointments);
      const todayCount = appointments.length;
      const waiting = appointments.filter((a) => a.status === 'scheduled' || a.status === 'pending').length;
      const completed = appointments.filter((a) => a.status === 'completed').length;

      const docList = doctorsData.doctors || [];
      setDoctors(docList.map((d: any) => ({
        id: Number(d.id ?? d.doctor_id),
        name: String(d.name ?? d.first_name ?? ''),
        department_id: Number(d.department_id ?? 0),
        department_name: String(d.department_name ?? ''),
      })));

      setStats({
        todayAppointments: todayCount,
        waitingPatients: waiting,
        completedVisits: completed,
        pendingPayments: 0, // placeholder; can be wired to billing API
        todayRevenue: 0,    // placeholder
        doctorsAvailable: docList.length,
      });
    } catch (e) {
      console.error('Fetch stats error', e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/departments`);
      const data = await res.json();
      if (data.success && data.departments) {
        setDepartments(data.departments.map((d: any) => ({ id: Number(d.id ?? d.department_id), name: String(d.name) })));
      }
    } catch (e) {
      console.error('Fetch departments error', e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchDepartments();
  }, [fetchStats, fetchDepartments]);

  useEffect(() => {
    if (activeTab === 'queue' || activeTab === 'dashboard') {
      setLoadingQueue(true);
      fetch(`${API_BASE}/daily-appointments`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.appointments) {
            const list: QueueItem[] = data.appointments.map((a: any, i: number) => ({
              token: String(i + 1),
              patientName: a.patient_name || '',
              doctorName: a.doctor_name || '',
              status: (a.status === 'completed' ? 'completed' : a.status === 'in_consultation' ? 'in_consultation' : 'waiting') as QueueItem['status'],
              appointmentId: String(a.appointment_id ?? a.id ?? ''),
            }));
            setQueueList(list);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingQueue(false));
    }
  }, [activeTab]);

  const generateUHID = () => {
    const date = new Date();
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear().toString().slice(-2);
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `UHID-${y}${m}${d}-${r}`;
  };

  const handleRegistrationSave = async () => {
    const [first = '', ...rest] = regForm.fullName.trim().split(/\s+/);
    const last = rest.join(' ') || first;
    if (!first || !regForm.mobile || !regForm.dateOfBirth || !regForm.gender) {
      alert('Please fill Full Name, Mobile, Date of Birth, and Gender.');
      return;
    }
    setRegSaving(true);
    setRegSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/front-desk/register-patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: first,
          last_name: last,
          phone: regForm.mobile,
          date_of_birth: regForm.dateOfBirth,
          gender: regForm.gender,
          address: regForm.address || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.uhid) {
        setUhid(data.uhid);
        setRegSuccess(true);
        setRegForm({ fullName: '', mobile: '', dateOfBirth: '', gender: '', address: '', idProofFile: null });
      } else {
        alert(data.error || 'Registration failed.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error. Please try again.');
    } finally {
      setRegSaving(false);
    }
  };

  const handleRegistrationClear = () => {
    setRegForm({ fullName: '', mobile: '', dateOfBirth: '', gender: '', address: '', idProofFile: null });
    setUhid('');
    setRegSuccess(false);
  };

  const fetchSlots = useCallback(async () => {
    if (!aptDoctorId) return;
    setLoadingSlots(true);
    try {
      const res = await fetch(`${API_BASE}/available-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId: aptDoctorId }),
      });
      const data = await res.json();
      if (data.success && data.availableSlots) {
        const slots: Record<string, Array<{ time: string; displayTime: string }>> = {};
        for (const [date, arr] of Object.entries(data.availableSlots as Record<string, Array<{ time: string; displayTime?: string }>>)) {
          slots[date] = (arr || []).map((s: any) => ({
            time: s.time,
            displayTime: s.displayTime || s.display_time || s.time,
          }));
        }
        setAvailableSlots(slots);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSlots(false);
    }
  }, [aptDoctorId]);

  useEffect(() => {
    if (aptDoctorId) fetchSlots();
    else setAvailableSlots({});
  }, [aptDoctorId, fetchSlots]);

  const handleBookAppointment = async () => {
    if (!aptPatientName || !aptPatientPhone || !aptDoctorId || !aptDate || !aptTime) {
      alert('Please fill Patient Name, Phone, Doctor, Date and Time.');
      return;
    }
    const dept = doctors.find((d) => d.id.toString() === aptDoctorId);
    setAptSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/book-appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: aptPatientName,
          patientPhone: aptPatientPhone,
          doctorId: aptDoctorId,
          departmentId: dept?.department_id ?? '',
          appointmentDate: aptDate,
          appointmentTime: aptTime,
          reason: aptNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Appointment booked successfully.');
        setAptPatientName('');
        setAptPatientPhone('');
        setAptDate('');
        setAptTime('');
        setAptNotes('');
        fetchStats();
      } else {
        alert(data.error || 'Booking failed.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error.');
    } finally {
      setAptSubmitting(false);
    }
  };

  const addBillItem = () => {
    if (!billingService) return;
    const price = 500; // placeholder
    const qty = 1;
    setBillItems((prev) => [
      ...prev,
      { id: Date.now().toString(), serviceName: billingService, quantity: qty, price, total: price * qty },
    ]);
    setBillingService('');
  };

  const removeBillItem = (id: string) => {
    setBillItems((prev) => prev.filter((i) => i.id !== id));
  };

  const billSubtotal = billItems.reduce((s, i) => s + i.total, 0);
  const billTotal = Math.max(0, billSubtotal - discount);
  const displayTab = forcedTab ?? activeTab;

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'registration', label: 'New Registration', icon: <UserPlus className="w-4 h-4" /> },
    { id: 'appointments', label: 'Appointments', icon: <Calendar className="w-4 h-4" /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'queue', label: 'Queue Management', icon: <ListOrdered className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {!hideNav && (
        <>
      {/* Access control note */}
      <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200/90">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Front Desk — Administrative & billing access only. No access to clinical notes or prescription editing.</span>
      </div>

      {/* Top horizontal nav */}
      <nav className="flex shrink-0 items-center gap-1 border-b border-slate-700/50 bg-slate-900/50 px-4 py-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === item.id
                ? 'portal-accent-button shadow-md'
                : 'text-slate-400 hover:bg-slate-800/60'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="flex-1" />
        {onLogout && (
        <button
          onClick={onLogout}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-red-500/15 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
        )}
      </nav>
        </>
      )}

      {/* Main content */}
      <main className="content-panel min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {displayTab === 'dashboard' && (
          <>
            <h1 className="section-heading text-xl font-semibold text-slate-100 mb-4">Dashboard</h1>
            {loadingStats ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--portal-accent)] border-t-transparent" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                  {[
                    { label: "Today's Appointments", value: stats.todayAppointments, icon: <Calendar className="w-5 h-5" />, color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
                    { label: 'Waiting Patients', value: stats.waitingPatients, icon: <Clock className="w-5 h-5" />, color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
                    { label: 'Completed Visits', value: stats.completedVisits, icon: <CheckCircle className="w-5 h-5" />, color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
                    { label: 'Pending Payments', value: stats.pendingPayments, icon: <CreditCard className="w-5 h-5" />, color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
                    { label: "Today's Revenue", value: `₹${stats.todayRevenue}`, icon: <DollarSign className="w-5 h-5" />, color: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
                    { label: 'Doctor Availability', value: stats.doctorsAvailable, icon: <Stethoscope className="w-5 h-5" />, color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="premium-card premium-card-hover rounded-xl p-4 transition-all duration-200"
                    >
                      <div className={`inline-flex p-2 rounded-lg border ${card.color} mb-3`}>{card.icon}</div>
                      <p className="text-2xl font-bold text-slate-100">{card.value}</p>
                      <p className="text-xs font-medium text-slate-400 mt-0.5">{card.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-slate-300 mb-3">Quick Actions</h2>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { label: 'New Patient', icon: <UserPlus className="w-5 h-5" />, tab: 'registration' as NavTab },
                      { label: 'Book Appointment', icon: <CalendarPlus className="w-5 h-5" />, tab: 'appointments' as NavTab },
                      { label: 'Create Bill', icon: <Receipt className="w-5 h-5" />, tab: 'billing' as NavTab },
                      { label: 'Search Patient', icon: <Search className="w-5 h-5" />, tab: 'dashboard' as NavTab },
                      { label: 'Print Receipt', icon: <Printer className="w-5 h-5" />, tab: 'billing' as NavTab },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        onClick={() => setActiveTab(btn.tab)}
                        className="ghost-button flex items-center gap-2 rounded-xl border border-slate-600/80 px-5 py-3 font-semibold text-slate-200 transition-all hover:border-[var(--portal-accent)] hover:bg-[var(--portal-accent-muted)] hover:text-amber-100"
                      >
                        {btn.icon}
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {displayTab === 'registration' && (
          <div className="max-w-3xl">
            <h1 className="section-heading text-xl font-semibold text-slate-100 mb-4">New Patient Registration</h1>
            <div className="premium-card rounded-xl p-6 border border-slate-700/50">
              {regSuccess && (
                <div className="mb-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-200 text-sm">
                  Patient registered. UHID: <strong>{uhid}</strong>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label block mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={regForm.fullName}
                    onChange={(e) => setRegForm((p) => ({ ...p, fullName: e.target.value }))}
                    className="form-field w-full"
                    placeholder="Full Name"
                  />
                </div>
                <div>
                  <label className="form-label block mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    value={regForm.mobile}
                    onChange={(e) => setRegForm((p) => ({ ...p, mobile: e.target.value }))}
                    className="form-field w-full"
                    placeholder="Mobile"
                  />
                </div>
                <div>
                  <label className="form-label block mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    value={regForm.dateOfBirth}
                    onChange={(e) => setRegForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                    className="form-field w-full"
                  />
                </div>
                <div>
                  <label className="form-label block mb-1">Gender *</label>
                  <select
                    value={regForm.gender}
                    onChange={(e) => setRegForm((p) => ({ ...p, gender: e.target.value }))}
                    className="form-field w-full"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="form-label block mb-1">Address</label>
                  <input
                    type="text"
                    value={regForm.address}
                    onChange={(e) => setRegForm((p) => ({ ...p, address: e.target.value }))}
                    className="form-field w-full"
                    placeholder="Address"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label block mb-1">ID Proof Upload</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setRegForm((p) => ({ ...p, idProofFile: e.target.files?.[0] ?? null }))}
                      className="text-sm text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-slate-200"
                    />
                    <Upload className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleRegistrationSave}
                  disabled={regSaving}
                  className="portal-accent-button rounded-lg px-5 py-2.5 font-medium disabled:opacity-50"
                >
                  {regSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleRegistrationClear}
                  className="ghost-button rounded-lg px-5 py-2.5 font-medium"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-3">UHID will be auto-generated on save.</p>
            </div>
          </div>
        )}

        {displayTab === 'appointments' && (
          <div className="max-w-2xl">
            <h1 className="section-heading text-xl font-semibold text-slate-100 mb-4">Book Appointment</h1>
            <div className="premium-card rounded-xl p-6 border border-slate-700/50 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label block mb-1">Patient Name *</label>
                  <input
                    type="text"
                    value={aptPatientName}
                    onChange={(e) => setAptPatientName(e.target.value)}
                    className="form-field w-full"
                    placeholder="Patient Name"
                  />
                </div>
                <div>
                  <label className="form-label block mb-1">Patient Phone *</label>
                  <input
                    type="tel"
                    value={aptPatientPhone}
                    onChange={(e) => setAptPatientPhone(e.target.value)}
                    className="form-field w-full"
                    placeholder="Phone"
                  />
                </div>
              </div>
              <div>
                <label className="form-label block mb-1">Doctor *</label>
                <select
                  value={aptDoctorId}
                  onChange={(e) => setAptDoctorId(e.target.value)}
                  className="form-field w-full"
                >
                  <option value="">Select Doctor</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} — {d.department_name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">Doctor availability: {aptDoctorId ? 'Available' : 'Select doctor'}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label block mb-1">Date</label>
                  <input
                    type="date"
                    value={aptDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setAptDate(e.target.value)}
                    className="form-field w-full"
                  />
                </div>
                <div>
                  <label className="form-label block mb-1">Time slot</label>
                  <select
                    value={aptTime}
                    onChange={(e) => setAptTime(e.target.value)}
                    className="form-field w-full"
                  >
                    <option value="">Select time</option>
                    {aptDate && availableSlots[aptDate]?.map((s) => (
                      <option key={s.time} value={s.time}>{s.displayTime}</option>
                    ))}
                  </select>
                  {aptDoctorId && !aptDate && (
                    <button type="button" onClick={fetchSlots} disabled={loadingSlots} className="mt-1 text-xs text-amber-400 hover:text-amber-300">
                      {loadingSlots ? 'Loading...' : 'Pick date first to load slots'}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="form-label block mb-1">Visit Type</label>
                <select
                  value={aptVisitType}
                  onChange={(e) => setAptVisitType(e.target.value as 'new' | 'followup')}
                  className="form-field w-full"
                >
                  <option value="new">New</option>
                  <option value="followup">Follow-up</option>
                </select>
              </div>
              <div>
                <label className="form-label block mb-1">Notes</label>
                <textarea
                  value={aptNotes}
                  onChange={(e) => setAptNotes(e.target.value)}
                  className="form-field w-full"
                  rows={2}
                  placeholder="Notes"
                />
              </div>
              <button
                onClick={handleBookAppointment}
                disabled={aptSubmitting}
                className="portal-accent-button w-full rounded-lg py-3 font-semibold disabled:opacity-50"
              >
                {aptSubmitting ? 'Booking...' : 'Book Appointment'}
              </button>
            </div>
          </div>
        )}

        {displayTab === 'billing' && (
          <div className="max-w-4xl">
            <h1 className="section-heading text-xl font-semibold text-slate-100 mb-4">Billing</h1>
            <div className="premium-card rounded-xl p-6 border border-slate-700/50 space-y-4">
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="form-label block mb-1">Patient Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={billingPatientSearch}
                      onChange={(e) => setBillingPatientSearch(e.target.value)}
                      placeholder="Search by name or ID"
                      className="form-field w-full pl-10"
                    />
                  </div>
                </div>
                <div className="flex gap-2 items-end">
                  <div>
                    <label className="form-label block mb-1">Service</label>
                    <div className="flex gap-2">
                      <select
                        value={billingService}
                        onChange={(e) => setBillingService(e.target.value)}
                        className="form-field"
                      >
                        <option value="">Select service</option>
                        <option value="Consultation">Consultation</option>
                        <option value="Lab Test">Lab Test</option>
                        <option value="Radiology">Radiology</option>
                        <option value="Procedure">Procedure</option>
                        <option value="Medication">Medication</option>
                      </select>
                      <button
                        type="button"
                        onClick={addBillItem}
                        className="ghost-button rounded-lg px-4 py-2 font-medium"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border border-slate-700/50 rounded-lg overflow-hidden">
                <table className="data-table-body w-full text-sm">
                  <thead className="data-table-head">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold">Service</th>
                      <th className="text-right py-2 px-3 font-semibold">Qty</th>
                      <th className="text-right py-2 px-3 font-semibold">Price</th>
                      <th className="text-right py-2 px-3 font-semibold">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {billItems.map((item) => (
                      <tr key={item.id} className="data-table-row border-t border-slate-700/40">
                        <td className="py-2 px-3 text-slate-200">{item.serviceName}</td>
                        <td className="text-right py-2 px-3">{item.quantity}</td>
                        <td className="text-right py-2 px-3">₹{item.price}</td>
                        <td className="text-right py-2 px-3">₹{item.total}</td>
                        <td>
                          <button type="button" onClick={() => removeBillItem(item.id)} className="rounded p-1 text-red-400 hover:bg-red-500/15">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <div>
                  <label className="form-label block mb-1">Discount (₹) — restricted</label>
                  <input
                    type="number"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    className="form-field w-28"
                  />
                </div>
                <div>
                  <label className="form-label block mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as 'cash' | 'card' | 'upi')}
                    className="form-field"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="upi">UPI</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-4">
                <div className="text-lg font-bold text-slate-100">
                  Total: <span className="text-amber-400">₹{billTotal}</span>
                </div>
                <div className="flex gap-3">
                  <button type="button" className="portal-accent-button rounded-lg px-5 py-2.5 font-semibold">
                    Generate Invoice
                  </button>
                  <button type="button" className="ghost-button flex items-center gap-2 rounded-lg px-5 py-2.5 font-semibold">
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {displayTab === 'queue' && (
          <div>
            <h1 className="section-heading text-xl font-semibold text-slate-100 mb-4">Queue Management</h1>
            {loadingQueue ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--portal-accent)] border-t-transparent" />
              </div>
            ) : (
              <div className="premium-card rounded-xl border border-slate-700/50 overflow-hidden">
                <table className="data-table-body w-full text-sm">
                  <thead className="data-table-head">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold">Token</th>
                      <th className="text-left py-3 px-4 font-semibold">Patient</th>
                      <th className="text-left py-3 px-4 font-semibold">Doctor</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                      <th className="text-right py-3 px-4 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueList.map((q) => (
                      <tr key={q.appointmentId} className="data-table-row border-t border-slate-700/40">
                        <td className="py-3 px-4 font-medium text-slate-100">{q.token}</td>
                        <td className="py-3 px-4 text-slate-300">{q.patientName}</td>
                        <td className="py-3 px-4 text-slate-300">{q.doctorName}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            q.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                            q.status === 'in_consultation' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {q.status === 'completed' ? 'Completed' : q.status === 'in_consultation' ? 'In Consultation' : 'Waiting'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {q.status === 'waiting' && (
                            <button type="button" className="portal-accent-button inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium">
                              Call Next <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {queueList.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No patients in queue.</div>
                )}
              </div>
            )}
          </div>
        )}

        {displayTab === 'reports' && (
          <div>
            <h1 className="section-heading text-xl font-semibold text-slate-100 mb-4">Reports</h1>
            <div className="premium-card rounded-xl p-8 border border-slate-700/50 text-center text-slate-400">
              <FileText className="mx-auto mb-3 h-12 w-12 text-slate-500" />
              <p>Reports and analytics (daily summaries, revenue, appointments) can be configured here.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default FrontDeskDashboard;
