/**
 * Patient Dashboard Component
 * Main dashboard for patient with Patient ID as central identifier
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Calendar, FileText, Users, 
  Clock, ArrowRight, Plus, Scan, Stethoscope, Brain, 
  Baby, Eye, Pill, Wind, Sparkles, RefreshCw, MapPin
} from 'lucide-react';
import { 
  Cardiology,
  Oncology,
  Gynecology,
  Orthopaedics,
  SkinCancer
} from 'healthicons-react';
import { patientService, Patient, FamilyMember, peekHealthSummaryCache } from '../../services/patientService';
import { appointmentService, Appointment } from '../../services/appointmentService';
import { radiologyService, RadiologyBooking } from '../../services/radiologyService';
import { doctorService, Specialty } from '../../services/doctorService';
import { getAppointmentStatusColor, getAppointmentStatusContainer } from '../../utils/appointmentStatusColors';
import { useAnimatedCounter } from '../../hooks/useAnimatedCounter';

const PatientDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [upcomingRadiologyBookings, setUpcomingRadiologyBookings] = useState<RadiologyBooking[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingFamilyMembers, setLoadingFamilyMembers] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [healthSummary, setHealthSummary] = useState<string | null>(
    () => peekHealthSummaryCache()?.summary ?? null
  );
  const [healthSummaryLoading, setHealthSummaryLoading] = useState(false);
  const [healthSummaryError, setHealthSummaryError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadHealthSummary = async (refresh = false) => {
    if (!refresh) {
      const cached = peekHealthSummaryCache();
      if (cached?.summary) {
        setHealthSummary(cached.summary);
        setHealthSummaryError(null);
        return;
      }
    }

    setHealthSummaryLoading(true);
    setHealthSummaryError(null);
    try {
      const result = await patientService.getHealthSummary(refresh);
      if (result.success && result.summary) {
        setHealthSummary(result.summary);
      } else {
        setHealthSummaryError(result.error || 'Could not load AI summary');
      }
    } catch {
      setHealthSummaryError('Could not load AI summary');
    } finally {
      setHealthSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (patient && !loading) {
      loadHealthSummary();
    }
  }, [patient, loading]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load patient profile
      const patientResult = await patientService.getProfile();
      console.log('Patient profile result:', patientResult);
      
      if (patientResult.success && patientResult.patient) {
        setPatient(patientResult.patient);
        // Store patient_id in localStorage if not already there
        if (!sessionStorage.getItem('patient_id')) {
          sessionStorage.setItem('patient_id', patientResult.patient.patient_id);
        }
      } else {
        console.error('Failed to load patient profile:', patientResult.error);
        // Show error message
        console.error('Patient ID from sessionStorage:', sessionStorage.getItem('patient_id'));
        console.error('User Email from sessionStorage:', sessionStorage.getItem('userEmail'));
      }

      // Load upcoming appointments
      const appointmentsResult = await appointmentService.getAppointments();
      if (appointmentsResult.success && appointmentsResult.appointments) {
        const now = new Date();
        const upcoming = appointmentsResult.appointments
          .filter(apt => {
            // Only show appointments that are scheduled/confirmed AND in the future
            const appointmentDateTime = new Date(`${apt.appointment_date}T${apt.appointment_time}`);
            return (apt.status === 'scheduled' || (apt.status as string) === 'confirmed') && appointmentDateTime > now;
          })
          .sort((a, b) => {
            const dateA = new Date(`${a.appointment_date}T${a.appointment_time}`);
            const dateB = new Date(`${b.appointment_date}T${b.appointment_time}`);
            return dateA.getTime() - dateB.getTime();
          })
          .slice(0, 5);
        setUpcomingAppointments(upcoming);
      }

      // Load upcoming radiology bookings
      const radiologyResult = await radiologyService.getBookings();
      if (radiologyResult.success && radiologyResult.bookings) {
        const upcoming = radiologyResult.bookings
          .filter(booking => {
            const bookingDate = new Date(booking.appointment_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            bookingDate.setHours(0, 0, 0, 0);
            return bookingDate >= today && booking.status === 'scheduled';
          })
          .sort((a, b) => {
            const dateA = new Date(`${a.appointment_date}T${a.appointment_time}`);
            const dateB = new Date(`${b.appointment_date}T${b.appointment_time}`);
            return dateA.getTime() - dateB.getTime();
          })
          .slice(0, 5);
        setUpcomingRadiologyBookings(upcoming);
      }

      // Load family members
      await loadFamilyMembers();
      
      // Load specialties
      const specialtiesResult = await doctorService.getSpecialties();
      if (specialtiesResult.success && specialtiesResult.specialties) {
        setSpecialties(specialtiesResult.specialties);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFamilyMembers = async () => {
    setLoadingFamilyMembers(true);
    try {
      const result = await patientService.getFamilyMembers();
      if (result.success && result.family_members) {
        setFamilyMembers(result.family_members);
      }
    } catch (error) {
      console.error('Error loading family members:', error);
    } finally {
      setLoadingFamilyMembers(false);
    }
  };

  const handleViewFamilyMembers = () => {
    navigate('/portal/family');
  };

  const handleAddFamilyMember = () => {
    navigate('/portal/family', { state: { showAddForm: true } });
  };

  const appointmentsCount = useAnimatedCounter(upcomingAppointments.length);
  const scansCount = useAnimatedCounter(upcomingRadiologyBookings.length);
  const familyCount = useAnimatedCounter(familyMembers.length);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="premium-card w-full max-w-md p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="healthcare-loading"></div>
            <div>
              <p className="font-bold text-slate-100">Loading your health dashboard</p>
              <p className="text-sm text-slate-500">Preparing appointments, records, and care options.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="skeleton-line h-3 rounded"></div>
            <div className="skeleton-line h-3 w-4/5 rounded"></div>
            <div className="skeleton-line h-3 w-2/3 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6">
        <div className="premium-card border-amber-200 bg-amber-50 p-5">
          <p className="mb-2 font-bold text-amber-900">Patient profile not found.</p>
          <p className="mb-3 text-sm text-amber-800">
            Your patient ID may not be linked correctly. Please try:
          </p>
          <ul className="mb-3 list-inside list-disc space-y-1 text-sm text-amber-800">
            <li>Logout and login again</li>
            <li>Check browser console for errors</li>
            <li>Verify your patient_id in localStorage</li>
          </ul>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  const patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ') || 'Patient';

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6 animate-stagger-children">
        <div className="premium-card overflow-hidden">
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_minmax(10rem,12rem)] xl:grid-cols-[1.2fr_13rem]">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-teal-300">Care Overview</p>
              <h1 className="mt-1 text-2xl font-extrabold text-slate-100 sm:text-3xl">Hello, {patientName}</h1>

              <div className="mt-3 rounded-xl border border-teal-500/25 bg-teal-500/5 p-3 sm:p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-teal-300" />
                    <span className="text-xs font-bold uppercase tracking-wide text-teal-300">
                      AI Health Summary
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadHealthSummary(true)}
                    disabled={healthSummaryLoading}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-teal-200 disabled:opacity-50"
                    title="Refresh summary"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${healthSummaryLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
                {healthSummaryLoading && !healthSummary ? (
                  <div className="space-y-2 py-1">
                    <div className="skeleton-line h-3 w-full rounded" />
                    <div className="skeleton-line h-3 w-5/6 rounded" />
                    <div className="skeleton-line h-3 w-4/6 rounded" />
                  </div>
                ) : healthSummaryError ? (
                  <p className="text-sm text-amber-300/90">{healthSummaryError}</p>
                ) : healthSummary ? (
                  <div className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
                    {healthSummary}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Generating your personalized overview…</p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => navigate('/portal/engagement')}
                  className="healthcare-button inline-flex items-center gap-2 px-4 py-2 text-sm"
                >
                  <Sparkles className="h-4 w-4" />
                  Engagement Hub
                </button>
                <button
                  onClick={() => navigate('/portal/doctors?near=1')}
                  className="ghost-button inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
                >
                  <MapPin className="h-4 w-4" />
                  Find doctors near me
                </button>
                <button
                  onClick={() => navigate('/portal/appointments/book')}
                  className="ghost-button inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
                >
                  <Calendar className="h-4 w-4" />
                  Book Appointment
                </button>
                <button
                  onClick={() => navigate('/portal/records')}
                  className="ghost-button inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
                >
                  <FileText className="h-4 w-4" />
                  View Records
                </button>
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2">
              <div className="soft-panel flex min-h-[4rem] min-w-0 flex-col justify-center rounded-xl p-2.5 ring-1 ring-teal-500/20 transition-all duration-300 hover:ring-teal-400/40 sm:min-h-[4.25rem] lg:min-h-[3.75rem] lg:px-3 lg:py-2.5">
                <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Appointments
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums leading-none text-sky-300 sm:text-3xl lg:mt-1.5 lg:text-2xl">
                  {appointmentsCount}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">Upcoming</p>
              </div>
              <div className="soft-panel flex min-h-[4rem] min-w-0 flex-col justify-center rounded-xl p-2.5 ring-1 ring-teal-500/20 transition-all duration-300 hover:ring-teal-400/40 sm:min-h-[4.25rem] lg:min-h-[3.75rem] lg:px-3 lg:py-2.5">
                <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Scans
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums leading-none text-violet-300 sm:text-3xl lg:mt-1.5 lg:text-2xl">
                  {scansCount}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">Scheduled</p>
              </div>
              <div className="soft-panel flex min-h-[4rem] min-w-0 flex-col justify-center rounded-xl p-2.5 ring-1 ring-teal-500/20 transition-all duration-300 hover:ring-teal-400/40 sm:min-h-[4.25rem] lg:min-h-[3.75rem] lg:px-3 lg:py-2.5">
                <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Family
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums leading-none text-emerald-300 sm:text-3xl lg:mt-1.5 lg:text-2xl">
                  {familyCount}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">Members</p>
              </div>
            </div>
          </div>
        </div>
        {/* Profile Completion Reminder */}
        {(!patient.first_name || !patient.last_name) && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
            <p className="text-sm font-semibold text-sky-200">
              Complete your profile to personalize your experience.
              <a href="/portal/profile" className="ml-1 underline">Edit Profile</a>
            </p>
          </div>
        )}

        {/* Upcoming Appointments, Radiology Bookings, and Family Members */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Upcoming Appointments */}
          <div className="premium-card premium-card-hover flex h-[450px] flex-col p-6">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="section-heading flex items-center">
                <Clock className="h-5 w-5 mr-2 text-sky-300" />
                Appointments
              </h2>
              {upcomingAppointments.length > 0 && (
                <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                  {upcomingAppointments.length}
                </span>
              )}
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              {upcomingAppointments.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-slate-500">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/15">
                    <Calendar className="h-7 w-7 text-sky-400" />
                  </div>
                  <p className="font-semibold text-slate-300">No upcoming appointments</p>
                  <button 
                    onClick={() => navigate('/portal/appointments/book')}
                    className="mt-4 text-sm font-bold text-sky-300 hover:text-sky-200"
                  >
                    Book Appointment
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {upcomingAppointments.map((apt) => {
                      // Get family member name - prefer API data, fallback to local state
                      const bookedFor = apt.family_member_id 
                        ? (apt.family_member_first_name && apt.family_member_last_name
                            ? `${apt.family_member_first_name} ${apt.family_member_last_name}`
                            : (() => {
                                const familyMember = familyMembers.find(fm => fm.family_member_id === apt.family_member_id);
                                return familyMember ? `${familyMember.first_name} ${familyMember.last_name}` : 'Family Member';
                              })())
                        : 'Myself';
                      const doctorName = apt.doctor_first_name && apt.doctor_last_name
                        ? `Dr. ${apt.doctor_first_name} ${apt.doctor_last_name}`
                        : 'Doctor';

                      return (
                        <div key={apt.appointment_id} className={`cursor-pointer rounded-xl border p-3 transition-all duration-200 hover:border-sky-500/40 hover:shadow-sm ${getAppointmentStatusContainer(apt.status)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-bold text-slate-100">
                                {new Date(apt.appointment_date).toLocaleDateString()}
                              </p>
                              <p className="text-sm text-slate-400">{apt.appointment_time}</p>
                            </div>
                            <span className={`status-pill ${getAppointmentStatusColor(apt.status)}`}>
                              {(apt.status as string) === 'confirmed' ? 'Scheduled' : apt.status}
                            </span>
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-700/60">
                            <p className="text-xs text-slate-400">
                              <span className="font-medium">Doctor:</span> {doctorName}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              <span className="font-medium">For:</span> {bookedFor}
                            </p>
                            {apt.facility_name && (
                              <p className="text-xs text-slate-400 mt-1">
                                {apt.facility_name}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-auto pt-4 border-t border-slate-700/60 flex-shrink-0">
                    <button
                      onClick={() => navigate('/portal/appointments')}
                      className="flex w-full items-center justify-center rounded-lg py-2 text-center text-sm font-bold text-sky-300 transition-colors hover:bg-sky-500/10 hover:text-sky-200"
                    >
                      View All {upcomingAppointments.length > 1 ? `${upcomingAppointments.length} Appointments` : 'Appointment'}
                      <ArrowRight className="inline h-4 w-4 ml-2" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Upcoming Radiology Bookings */}
          <div className="premium-card premium-card-hover flex flex-col p-6" style={{ minHeight: '400px' }}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="section-heading flex items-center">
                <Scan className="h-5 w-5 mr-2 text-purple-600" />
                Radiology
              </h2>
              {upcomingRadiologyBookings.length > 0 && (
                <span className="status-pill border-violet-200 bg-violet-50 text-violet-700">
                  {upcomingRadiologyBookings.length}
                </span>
              )}
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              {upcomingRadiologyBookings.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-slate-500">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50">
                    <Scan className="h-7 w-7 text-violet-500" />
                  </div>
                  <p className="font-semibold text-slate-300">No upcoming scans</p>
                  <button 
                    onClick={() => navigate('/portal/radiology/book')}
                    className="mt-4 text-sm font-bold text-violet-600 hover:text-violet-700"
                  >
                    Book Scan
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {upcomingRadiologyBookings.map((booking) => {
                      const SCAN_TYPE_LABELS: Record<string, string> = {
                        mri: 'MRI',
                        ct: 'CT Scan',
                        xray: 'X-Ray',
                        ultrasound: 'Ultrasound',
                        mammography: 'Mammography',
                        pet_scan: 'PET Scan',
                        other: 'Other',
                      };
                      
                      const bookedFor = booking.family_member_id 
                        ? (booking.family_member_first_name && booking.family_member_last_name
                            ? `${booking.family_member_first_name} ${booking.family_member_last_name}`
                            : (() => {
                                const familyMember = familyMembers.find(fm => fm.family_member_id === booking.family_member_id);
                                return familyMember ? `${familyMember.first_name} ${familyMember.last_name}` : 'Family Member';
                              })())
                        : 'Myself';

                      return (
                        <div key={booking.booking_id} className="cursor-pointer rounded-xl border border-slate-200 p-3 transition-all duration-200 hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-bold text-slate-100">
                                {SCAN_TYPE_LABELS[booking.scan_type] || booking.scan_type}
                              </p>
                              <p className="text-sm text-slate-600">
                                {new Date(booking.appointment_date).toLocaleDateString()} at {booking.appointment_time}
                              </p>
                            </div>
                            <span className="status-pill border-violet-200 bg-violet-50 text-violet-700">
                              {booking.status}
                            </span>
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-700/60">
                            {booking.body_part && (
                              <p className="text-xs text-slate-400">
                                <span className="font-medium">Body Part:</span> {booking.body_part}
                              </p>
                            )}
                            <p className="text-xs text-slate-400 mt-1">
                              <span className="font-medium">For:</span> {bookedFor}
                            </p>
                            {booking.facility_name && (
                              <p className="text-xs text-slate-400 mt-1">
                                {booking.facility_name}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-auto pt-4 border-t border-slate-700/60 flex-shrink-0">
                    <button
                      onClick={() => navigate('/portal/radiology')}
                      className="flex w-full items-center justify-center rounded-lg py-2 text-center text-sm font-bold text-violet-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
                    >
                      View All {upcomingRadiologyBookings.length > 1 ? `${upcomingRadiologyBookings.length} Bookings` : 'Booking'}
                      <ArrowRight className="inline h-4 w-4 ml-2" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Family Members */}
          <div className="premium-card premium-card-hover flex flex-col p-6" style={{ minHeight: '400px' }}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="section-heading flex items-center">
                <Users className="h-5 w-5 mr-2 text-green-600" />
                Your Family
              </h2>
              <button 
                onClick={handleAddFamilyMember}
                className="flex items-center rounded-lg px-2 py-1 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </button>
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              {loadingFamilyMembers ? (
                <div className="text-center py-8 flex-1 flex items-center justify-center">
                  <div>
                    <div className="healthcare-loading mx-auto"></div>
                    <p className="text-slate-400 mt-2">Loading...</p>
                  </div>
                </div>
              ) : familyMembers.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-slate-500">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                    <Users className="h-7 w-7 text-emerald-500" />
                  </div>
                  <p className="font-semibold text-slate-300">No family members added</p>
                  <button 
                    onClick={handleAddFamilyMember}
                    className="mt-4 text-sm font-bold text-emerald-600 hover:text-emerald-700"
                  >
                    Add Family Member
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {familyMembers.slice(0, 3).map((member) => (
                      <div 
                        key={member.family_member_id} 
                        className="cursor-pointer rounded-xl border border-slate-200 p-3 transition-all duration-200 hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-sm"
                        onClick={handleViewFamilyMembers}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <div className="mr-3 rounded-full bg-emerald-100 p-2">
                              <User className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-100">
                                {member.first_name} {member.last_name}
                              </p>
                              <p className="text-sm capitalize text-slate-600">{member.relationship}</p>
                            </div>
                          </div>
                          {member.date_of_birth && (
                            <p className="text-xs text-slate-400">
                              {new Date(member.date_of_birth).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto pt-4 border-t border-slate-700/60 flex-shrink-0">
                    <button
                      onClick={handleViewFamilyMembers}
                      className="flex w-full items-center justify-center rounded-lg py-2 text-center text-sm font-bold text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      View All {familyMembers.length > 1 ? `${familyMembers.length} Family Members` : 'Family Member'}
                      <ArrowRight className="inline h-4 w-4 ml-2" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Specialty Icons */}
        <div className="premium-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-heading">Find Doctors by Specialty</h2>
            {specialties.length > 8 && (
              <button
                onClick={() => navigate('/portal/appointments/book')}
                className="flex items-center gap-1 text-sm font-bold text-sky-300 transition-all duration-200 hover:text-sky-200 hover:underline"
                title="View All Specialties"
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-6 justify-center md:justify-start">
            {specialties.slice(0, 8).map((specialty) => {
              // Map specialty names to icons
              const getIcon = (name: string) => {
                const lowerName = name.toLowerCase();
                if (lowerName.includes('cardio') || lowerName.includes('heart')) return Cardiology;
                if (lowerName.includes('dermat') || lowerName.includes('skin')) return SkinCancer;
                if (lowerName.includes('gyneco') || lowerName.includes('obstet') || lowerName.includes('women')) return Gynecology;
                if (lowerName.includes('onco') || lowerName.includes('cancer')) return Oncology;
                if (lowerName.includes('ortho') || lowerName.includes('bone')) return Orthopaedics;
                if (lowerName.includes('neuro') || lowerName.includes('brain')) return Brain;
                if (lowerName.includes('pediatric') || lowerName.includes('child')) return Baby;
                if (lowerName.includes('ophthal') || lowerName.includes('eye')) return Eye;
                if (lowerName.includes('pulmo') || lowerName.includes('lung') || lowerName.includes('respiratory')) return Wind;
                if (lowerName.includes('pharma') || lowerName.includes('medicine')) return Pill;
                return Stethoscope;
              };
              
              const IconComponent = getIcon(specialty.name);
              const colors = [
                'bg-blue-100 text-blue-600 hover:bg-blue-200',
                'bg-green-100 text-green-600 hover:bg-green-200',
                'bg-purple-100 text-purple-600 hover:bg-purple-200',
                'bg-red-100 text-red-600 hover:bg-red-200',
                'bg-yellow-100 text-yellow-600 hover:bg-yellow-200',
                'bg-pink-100 text-pink-600 hover:bg-pink-200',
                'bg-indigo-100 text-indigo-600 hover:bg-indigo-200',
                'bg-teal-100 text-teal-600 hover:bg-teal-200',
              ];
              const colorIndex = specialty.specialty_id % colors.length;
              
              return (
                <div key={specialty.specialty_id} className="flex flex-col items-center">
                  <button
                    onClick={() => navigate(`/portal/appointments/book`, { state: { specialtyId: specialty.specialty_id } })}
                    className={`flex h-20 w-20 items-center justify-center rounded-2xl ${colors[colorIndex]} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group`}
                    title={specialty.name}
                  >
                    <IconComponent className="h-8 w-8" />
                  </button>
                  <span className="text-xs font-medium text-slate-300 text-center mt-2 max-w-[80px] leading-tight">{specialty.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Patient Info Summary */}
        <div className="premium-card p-6">
          <h2 className="section-heading mb-4">Profile Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-400">Date of Birth</p>
              <p className="font-medium text-slate-100">
                {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString() : 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Gender</p>
              <p className="font-medium text-slate-100 capitalize">{patient.gender}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Phone</p>
              <p className="font-medium text-slate-100">{patient.phone || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Email</p>
              <p className="font-medium text-slate-100">{patient.email || 'Not set'}</p>
            </div>
            {patient.blood_type && (
              <div>
                <p className="text-sm text-slate-400">Blood Type</p>
                <p className="font-medium text-slate-100">{patient.blood_type}</p>
              </div>
            )}
            {patient.bmi && (
              <div>
                <p className="text-sm text-slate-400">BMI</p>
                <p className="font-medium text-slate-100">{patient.bmi.toFixed(1)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;

