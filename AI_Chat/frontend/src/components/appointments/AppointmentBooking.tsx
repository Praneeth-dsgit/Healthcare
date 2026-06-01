/**
 * Appointment Booking Component
 * Book appointments with doctors at facilities
 */

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, MapPin, Check, Calendar, ChevronLeft, ChevronRight, X, ArrowLeft } from 'lucide-react';
import { appointmentService, AppointmentBookingData } from '../../services/appointmentService';
import { doctorService, Doctor } from '../../services/doctorService';
import { patientService, FamilyMember } from '../../services/patientService';
import { PortalPageShell, PortalPageHero } from '../patient/portalPageLayout';

const AppointmentBooking: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [availableSlots, setAvailableSlots] = useState<Record<string, Array<{time: string, displayTime: string}>>>({});
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateRangeOffset, setDateRangeOffset] = useState<number>(0);
  const [formData, setFormData] = useState<AppointmentBookingData>({
    doctor_id: 0,
    facility_id: 0,
    appointment_date: '',
    appointment_time: '',
    appointment_type: 'consultation',
    reason: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<number | null>(
    (location.state as any)?.specialtyId || null
  );
  const [specialties, setSpecialties] = useState<any[]>([]);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  // Initialize bookingFor from location state if family member ID is provided
  const [bookingFor, setBookingFor] = useState<'self' | number>(
    (location.state as any)?.familyMemberId || 'self'
  );
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // If specialty ID was passed, set it as the selected specialty
    const specialtyId = (location.state as any)?.specialtyId;
    if (specialtyId && selectedSpecialty !== specialtyId) {
      setSelectedSpecialty(specialtyId);
    }
    // If family member ID was passed, set it as the booking target
    if ((location.state as any)?.familyMemberId) {
      setBookingFor((location.state as any).familyMemberId);
    }
    loadInitialData(specialtyId || selectedSpecialty || null);
  }, [location.state]);

  // Trigger search when selectedSpecialty changes (after initial load)
  useEffect(() => {
    // Only trigger search if initial load is complete and user manually changed specialty
    if (initialLoadComplete && selectedSpecialty !== null) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpecialty]);

  const loadInitialData = async (initialSpecialtyId: number | null = null) => {
    setLoading(true);
    try {
      const [doctorsResult, familyResult, specialtiesResult] = await Promise.all([
        doctorService.searchDoctors({
          specialty_id: initialSpecialtyId || undefined,
        }),
        patientService.getFamilyMembers(),
        doctorService.getSpecialties(),
      ]);

      if (doctorsResult.success) setDoctors(doctorsResult.doctors || []);
      if (familyResult.success) setFamilyMembers(familyResult.family_members || []);
      if (specialtiesResult.success) setSpecialties(specialtiesResult.specialties || []);
      
      setInitialLoadComplete(true);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const result = await doctorService.searchDoctors({
        search: searchTerm || undefined,
        specialty_id: selectedSpecialty || undefined,
      });
      if (result.success) {
        setDoctors(result.doctors || []);
      }
    } catch (error) {
      console.error('Error searching doctors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDoctorSelect = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    // Auto-select the doctor's primary facility
    if (doctor.facility_id) {
      setFormData({ 
        ...formData, 
        doctor_id: doctor.doctor_id,
        facility_id: doctor.facility_id 
      });
    } else {
      setFormData({ ...formData, doctor_id: doctor.doctor_id });
    }
    // Skip facility selection, go directly to date & time (step 2)
    setStep(2);
  };

  const fetchAvailableSlots = async () => {
    if (!selectedDoctor) {
      return;
    }

    try {
      setLoadingSlots(true);
      const response = await fetch('http://localhost:5000/api/patient-engagement/available-slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          doctorId: selectedDoctor.doctor_id
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAvailableSlots(data.availableSlots || {});
        // Set first available date as selected
        const dates = Object.keys(data.availableSlots || {}).filter(date => 
          (data.availableSlots[date] || []).length > 0
        );
        if (dates.length > 0) {
          setSelectedDate(dates[0]);
          setDateRangeOffset(0);
          setShowSlotPicker(true);
        }
      } else {
        console.error('Failed to fetch available slots:', data.error);
      }
    } catch (err) {
      console.error('Error fetching available slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Check if a time slot should be disabled (past or current/next slot)
  const isSlotDisabled = (slotTime: string, selectedDate: string): boolean => {
    if (!slotTime || !selectedDate) return false;
    
    try {
      const now = new Date();
      const currentTime = now.getTime();
      
      // Get today's date string in YYYY-MM-DD format
      const todayStr = now.toISOString().split('T')[0];
      
      // Compare selected date with today (both as strings to avoid timezone issues)
      if (selectedDate !== todayStr) {
        return false; // Not today, all slots available
      }
      
      // Parse slot time (format: "HH:MM" or "HH:MM:SS")
      const timeParts = slotTime.split(':');
      const slotHours = parseInt(timeParts[0], 10);
      const slotMinutes = parseInt(timeParts[1] || '0', 10);
      
      // Create slot datetime by combining today's date with slot time
      const slotDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slotHours, slotMinutes, 0, 0);
      const slotTimeMs = slotDateTime.getTime();
      
      // Calculate slot end time (30-minute slots)
      const slotEndTime = new Date(slotDateTime);
      slotEndTime.setMinutes(slotEndTime.getMinutes() + 30);
      const slotEndTimeMs = slotEndTime.getTime();
      
      // Rule 1: Disable if slot has already passed (slot end time <= current time)
      if (slotEndTimeMs <= currentTime) {
        return true; // Past slot
      }
      
      // Rule 2: Disable if current time is within this slot (current slot)
      if (currentTime >= slotTimeMs && currentTime < slotEndTimeMs) {
        return true; // Current slot
      }
      
      // Rule 3: Disable all slots that start within 1 hour from now
      // This covers: current slot (if we're in one) + next slot
      const oneHourFromNow = currentTime + (60 * 60 * 1000); // 1 hour in milliseconds
      if (slotTimeMs <= oneHourFromNow) {
        return true; // Too soon (within 1 hour buffer = current slot + next slot)
      }
      
      return false;
    } catch (error) {
      console.error('Error in isSlotDisabled:', error, { slotTime, selectedDate });
      return false; // On error, allow the slot
    }
  };

  const handleSlotSelect = (date: string, time: string) => {
    // Don't allow selection of disabled slots
    if (isSlotDisabled(time, date)) {
      return;
    }
    setFormData(prev => ({
      ...prev,
      appointment_date: date,
      appointment_time: time
    }));
    setShowSlotPicker(false);
  };

  useEffect(() => {
    if (selectedDoctor && step === 2) {
      fetchAvailableSlots();
    }
  }, [selectedDoctor, step]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const bookingData: AppointmentBookingData = {
        ...formData,
        family_member_id: bookingFor !== 'self' ? bookingFor : undefined,
      };
      const result = await appointmentService.bookAppointment(bookingData);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setStep(1);
          setFormData({
            doctor_id: 0,
            facility_id: 0,
            appointment_date: '',
            appointment_time: '',
            appointment_type: 'consultation',
            reason: '',
          });
          setSelectedDoctor(null);
        }, 3000);
      }
    } catch (error) {
      console.error('Error booking appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="content-panel max-w-md p-8 text-center">
          <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Appointment Booked!</h2>
          <p className="text-gray-600">Your appointment has been successfully booked.</p>
        </div>
      </div>
    );
  }

  const stepLabels = ['Select doctor', 'Date & time', 'Confirm'];
  const stepShortLabels = ['Doctor', 'Date & time', 'Confirm'];

  return (
    <PortalPageShell className="max-w-4xl">
        <PortalPageHero
          eyebrow={
            <button
              type="button"
              onClick={() => navigate('/portal/appointments')}
              className="ghost-button -ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide text-sky-300 transition-colors hover:text-sky-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to appointments
            </button>
          }
          title="Book Appointment"
          subtitle={`Step ${step} of 3 — ${stepLabels[step - 1]}`}
          icon={<Calendar />}
          actions={
            <div
              className="flex w-full min-w-0 items-start gap-1 sm:min-w-[12rem] sm:gap-2 lg:min-w-[16rem] lg:max-w-xs"
              aria-label={`Booking progress: step ${step} of 3`}
            >
              {[1, 2, 3].map((s) => (
                <React.Fragment key={s}>
                  <div className="flex min-w-0 flex-1 flex-col items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-9 sm:w-9 ${
                        step >= s ? 'bg-sky-500 text-white ring-2 ring-sky-400/30' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {step > s ? <Check className="h-4 w-4" /> : s}
                    </div>
                    <span
                      className={`mt-1 hidden text-center text-[10px] font-semibold leading-tight sm:block ${
                        step >= s ? 'text-sky-300' : 'text-slate-500'
                      }`}
                    >
                      {stepShortLabels[s - 1]}
                    </span>
                  </div>
                  {s < 3 && (
                    <div
                      className={`mt-4 h-0.5 min-w-[0.75rem] flex-1 sm:mt-[1.125rem] ${
                        step > s ? 'bg-sky-500' : 'bg-slate-700'
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          }
        />

        {/* Step 1: Select Doctor */}
        {step === 1 && (
          <div className="content-panel hover:shadow-lg p-6 transition-all duration-300">
            <h2 className="text-xl font-semibold mb-4">Select Doctor</h2>
            <div className="mb-4 flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search doctors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                />
              </div>
              <select
                value={selectedSpecialty || ''}
                onChange={(e) => setSelectedSpecialty(e.target.value ? parseInt(e.target.value) : null)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Specialties</option>
                {specialties.map((s) => (
                  <option key={s.specialty_id} value={s.specialty_id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={handleSearch}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 hover:shadow-lg hover:scale-105 transition-all duration-200"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {doctors.map((doctor) => (
                <div
                  key={doctor.doctor_id}
                  onClick={() => handleDoctorSelect(doctor)}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-600 hover:shadow-md hover:scale-[1.02] cursor-pointer transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Dr. {doctor.first_name} {doctor.last_name}
                      </h3>
                      <p className="text-sm text-gray-600">{doctor.qualification}</p>
                      <p className="text-sm text-gray-600">{doctor.experience_years} years experience</p>
                  <p className="text-sm font-medium text-blue-600 mt-2">
                    ₹{doctor.consultation_fee} consultation fee
                  </p>
                  {doctor.facility_name && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600 flex items-center">
                        <MapPin className="h-3 w-3 mr-1" />
                        <span className="font-medium">{doctor.facility_name}</span>
                      </p>
                      {doctor.facility_address && (
                        <p className="text-xs text-gray-500 mt-1">
                          {doctor.facility_address}, {doctor.facility_city}
                        </p>
                      )}
                    </div>
                  )}
                    </div>
                    {doctor.is_available && (
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Available</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Date & Time */}
        {step === 2 && selectedDoctor && (
          <div className="content-panel hover:shadow-lg p-6 transition-all duration-300">
            <div className="flex items-start gap-3 mb-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-blue-600 hover:text-blue-800 p-1 rounded-lg hover:bg-blue-50 transition-all duration-200 shrink-0"
                aria-label="Back"
                title="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">Select Date & Time</h2>
                {selectedDoctor.facility_name && (
                  <p className="text-sm text-gray-600 mt-1">
                    Facility: <span className="font-medium">{selectedDoctor.facility_name}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date & Time</label>
                <button
                  type="button"
                  onClick={fetchAvailableSlots}
                  disabled={!selectedDoctor || loadingSlots}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed flex items-center justify-between"
                >
                  <span className="text-gray-700">
                    {formData.appointment_date && formData.appointment_time
                      ? `${new Date(formData.appointment_date).toLocaleDateString()} at ${new Date(`2000-01-01T${formData.appointment_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : selectedDoctor
                        ? 'Click to view available slots'
                        : 'Select a doctor first'}
                  </span>
                  <Calendar className="h-5 w-5 text-gray-500" />
                </button>
                {loadingSlots && (
                  <p className="text-sm text-gray-500 mt-1">Loading available slots...</p>
                )}
                {formData.appointment_date && formData.appointment_time && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        appointment_date: '',
                        appointment_time: ''
                      }));
                    }}
                    className="text-sm text-red-600 hover:text-red-800 mt-1"
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Booking For</label>
                <select
                  value={bookingFor === 'self' ? 'self' : bookingFor}
                  onChange={(e) => setBookingFor(e.target.value === 'self' ? 'self' : parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                >
                  <option value="self">Myself</option>
                  {familyMembers.map((member) => (
                    <option key={member.family_member_id} value={member.family_member_id}>
                      {member.first_name} {member.last_name} ({member.relationship})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason (Optional)</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                  rows={3}
                />
              </div>
              <button
                onClick={() => setStep(3)}
                disabled={!formData.appointment_date || !formData.appointment_time}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 hover:shadow-lg hover:scale-105 disabled:bg-gray-300 disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-200"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && selectedDoctor && (
          <div className="content-panel hover:shadow-lg p-6 transition-all duration-300">
            <div className="flex items-start gap-3 mb-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-blue-600 hover:text-blue-800 p-1 rounded-lg hover:bg-blue-50 transition-all duration-200 shrink-0"
                aria-label="Back"
                title="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-xl font-semibold min-w-0">Confirm Appointment</h2>
            </div>
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Doctor</h3>
                <p>Dr. {selectedDoctor?.first_name} {selectedDoctor?.last_name}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Facility</h3>
                <p>{selectedDoctor.facility_name || 'N/A'}</p>
                {selectedDoctor.facility_address && (
                  <p className="text-sm text-gray-600">
                    {selectedDoctor.facility_address}
                    {selectedDoctor.facility_city && `, ${selectedDoctor.facility_city}`}
                  </p>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Date & Time</h3>
                <p>{new Date(formData.appointment_date).toLocaleDateString()}</p>
                <p>{formData.appointment_time}</p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 hover:shadow-lg hover:scale-105 disabled:bg-gray-300 disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-200"
              >
                {loading ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        )}

        {/* Slot Picker Modal */}
        {showSlotPicker && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl hover:shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                  Select Available Time Slot
                </h2>
                <button
                  onClick={() => {
                    setShowSlotPicker(false);
                    setDateRangeOffset(0);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {loadingSlots ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-gray-600">Loading available slots...</p>
                    </div>
                  </div>
                ) : Object.keys(availableSlots).length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600">No available slots found for the next 2 weeks</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Date Navigation */}
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() => {
                          const dates = Object.keys(availableSlots).filter(date => 
                            (availableSlots[date] || []).length > 0
                          ).sort();
                          if (dateRangeOffset > 0) {
                            setDateRangeOffset(prev => prev - 1);
                            const newStartIndex = (dateRangeOffset - 1) * 7;
                            if (dates[newStartIndex]) {
                              setSelectedDate(dates[newStartIndex]);
                            }
                          }
                        }}
                        disabled={dateRangeOffset === 0}
                        className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-sm font-medium text-gray-700">
                        {selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Select a date'}
                      </span>
                      <button
                        onClick={() => {
                          const dates = Object.keys(availableSlots).filter(date => 
                            (availableSlots[date] || []).length > 0
                          ).sort();
                          const maxOffset = Math.floor((dates.length - 1) / 7);
                          if (dateRangeOffset < maxOffset) {
                            setDateRangeOffset(prev => prev + 1);
                            const newStartIndex = (dateRangeOffset + 1) * 7;
                            if (dates[newStartIndex]) {
                              setSelectedDate(dates[newStartIndex]);
                            }
                          }
                        }}
                        disabled={dateRangeOffset >= Math.floor((Object.keys(availableSlots).filter(date => 
                          (availableSlots[date] || []).length > 0
                        ).length - 1) / 7)}
                        className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Available Dates */}
                    <div className="grid grid-cols-7 gap-2 mb-4">
                      {Object.keys(availableSlots)
                        .filter(date => (availableSlots[date] || []).length > 0)
                        .sort()
                        .slice(dateRangeOffset * 7, (dateRangeOffset + 1) * 7)
                        .map(date => {
                          const dateObj = new Date(date);
                          const isSelected = selectedDate === date;
                          const isToday = date === new Date().toISOString().split('T')[0];
                          
                          return (
                            <button
                              key={date}
                              onClick={() => {
                                setSelectedDate(date);
                              }}
                              className={`p-3 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                                  : 'border-gray-200 hover:border-blue-300 bg-white'
                              } ${isToday ? 'ring-2 ring-green-400' : ''}`}
                            >
                              <div className="text-xs text-gray-500 mb-1">
                                {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                              </div>
                              <div className="text-lg font-medium">
                                {dateObj.getDate()}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                {availableSlots[date]?.length || 0} slots
                              </div>
                            </button>
                          );
                        })}
                    </div>

                    {/* Time Slots */}
                    {selectedDate && availableSlots[selectedDate] && (
                      <div>
                        <h3 className="font-semibold mb-3 text-gray-900">
                          Available Times for {new Date(selectedDate).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h3>
                        <div className="grid grid-cols-4 gap-2">
                          {availableSlots[selectedDate].map((slot) => {
                            const isSelected = selectedDate === formData.appointment_date && formData.appointment_time === slot.time;
                            const isDisabled = isSlotDisabled(slot.time, selectedDate);
                            return (
                              <button
                                key={slot.time}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!isDisabled) {
                                    handleSlotSelect(selectedDate, slot.time);
                                  }
                                }}
                                disabled={isDisabled}
                                style={isDisabled ? { pointerEvents: 'none' } : {}}
                                className={`p-3 rounded-lg border-2 transition-all duration-200 ${
                                  isDisabled
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                                    : isSelected
                                    ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold hover:scale-105'
                                    : 'border-gray-200 hover:border-blue-300 bg-white hover:scale-105'
                                }`}
                              >
                                {slot.displayTime}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => {
                    setShowSlotPicker(false);
                    setDateRangeOffset(0);
                  }}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
    </PortalPageShell>
  );
};

export default AppointmentBooking;

