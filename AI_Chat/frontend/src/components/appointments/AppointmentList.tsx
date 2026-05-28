/**
 * Appointment List Component
 * View all appointments with options to view details, cancel, reschedule
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, MapPin, Plus, X, Edit2, Filter, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { appointmentService, Appointment } from '../../services/appointmentService';
import { patientService, FamilyMember } from '../../services/patientService';
import { getAppointmentStatusColor, getAppointmentStatusContainer } from '../../utils/appointmentStatusColors';

const AppointmentList: React.FC = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [showMonthFilter, setShowMonthFilter] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);
  const [availableSlots, setAvailableSlots] = useState<Record<string, Array<{time: string, displayTime: string}>>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateRangeOffset, setDateRangeOffset] = useState<number>(0);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('');
  const [rescheduling, setRescheduling] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Reset month filter when switching tabs
  useEffect(() => {
    setSelectedMonth('all');
    setShowMonthFilter(false);
  }, [filter]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMonthFilter) {
        const target = event.target as HTMLElement;
        if (!target.closest('.month-filter-container')) {
          setShowMonthFilter(false);
        }
      }
    };

    if (showMonthFilter) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMonthFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [appointmentsResult, familyResult] = await Promise.all([
        appointmentService.getAppointments(),
        patientService.getFamilyMembers(),
      ]);

      if (appointmentsResult.success && appointmentsResult.appointments) {
        setAppointments(appointmentsResult.appointments);
      }
      if (familyResult.success && familyResult.family_members) {
        setFamilyMembers(familyResult.family_members);
      }
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async (doctorId: number) => {
    try {
      setLoadingSlots(true);
      const response = await fetch('http://localhost:5000/api/patient-engagement/available-slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          doctorId: doctorId
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
        }
      } else {
        console.error('Failed to fetch available slots:', data.error);
        alert(data.error || 'Failed to fetch available slots');
      }
    } catch (err) {
      console.error('Error fetching available slots:', err);
      alert('Error fetching available slots');
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleRescheduleClick = async (apt: Appointment) => {
    setRescheduleAppointment(apt);
    setRescheduleDate('');
    setRescheduleTime('');
    setSelectedDate('');
    setDateRangeOffset(0);
    await fetchAvailableSlots(apt.doctor_id);
  };

  const handleReschedule = async () => {
    if (!rescheduleAppointment || !rescheduleDate || !rescheduleTime) {
      alert('Please select a date and time');
      return;
    }

    setRescheduling(true);
    try {
      const result = await appointmentService.rescheduleAppointment(
        rescheduleAppointment.appointment_id,
        rescheduleDate,
        rescheduleTime
      );
      
      if (result.success) {
        setRescheduleAppointment(null);
        setRescheduleDate('');
        setRescheduleTime('');
        setAvailableSlots({});
        await loadData();
        alert('Appointment rescheduled successfully!');
      } else {
        alert(result.error || 'Failed to reschedule appointment');
      }
    } catch (error) {
      console.error('Error rescheduling appointment:', error);
      alert('Error rescheduling appointment');
    } finally {
      setRescheduling(false);
    }
  };

  const handleCancel = async (apt: Appointment) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      const result = await appointmentService.cancelAppointment(apt.appointment_id);
      if (result.success) {
        await loadData();
        alert('Appointment cancelled successfully!');
      } else {
        alert(result.error || 'Failed to cancel appointment');
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      alert('Error cancelling appointment');
    }
  };

  const getBookedFor = (apt: Appointment): string => {
    if (apt.family_member_id) {
      if (apt.family_member_first_name && apt.family_member_last_name) {
        return `${apt.family_member_first_name} ${apt.family_member_last_name}`;
      }
      const familyMember = familyMembers.find(fm => fm.family_member_id === apt.family_member_id);
      return familyMember ? `${familyMember.first_name} ${familyMember.last_name}` : 'Family Member';
    }
    return 'Myself';
  };

  const getDoctorName = (apt: Appointment): string => {
    if (apt.doctor_first_name && apt.doctor_last_name) {
      return `Dr. ${apt.doctor_first_name} ${apt.doctor_last_name}`;
    }
    return 'Doctor';
  };

  // Get available months from filtered appointments
  const getAvailableMonths = (): Array<{ value: string; label: string }> => {
    const months = new Set<string>();
    
    // Get appointments that match the current filter (upcoming or past)
    appointments.forEach(apt => {
      if (!apt.appointment_date) return;
      
      try {
        const appointmentDate = new Date(apt.appointment_date);
        if (isNaN(appointmentDate.getTime())) {
          console.warn('Invalid appointment date:', apt.appointment_date);
          return;
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        appointmentDate.setHours(0, 0, 0, 0);
        
        let matchesFilter = false;
        if (filter === 'upcoming') {
          matchesFilter = appointmentDate >= today && apt.status !== 'completed' && apt.status !== 'cancelled';
        } else if (filter === 'past') {
          matchesFilter = appointmentDate < today || apt.status === 'completed' || apt.status === 'cancelled';
        }
        
        if (matchesFilter) {
          const year = appointmentDate.getFullYear();
          const month = appointmentDate.getMonth() + 1;
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
          months.add(monthKey);
        }
      } catch (error) {
        console.error('Error processing appointment date:', apt.appointment_date, error);
      }
    });
    
    const monthOptions = Array.from(months)
      .sort()
      .reverse()
      .map(monthKey => {
        try {
          const parts = monthKey.split('-');
          if (parts.length !== 2) return null;
          
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          
          if (isNaN(year) || isNaN(month)) return null;
          
          const date = new Date(year, month, 1);
          if (isNaN(date.getTime())) return null;
          
          return {
            value: monthKey,
            label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          };
        } catch (error) {
          console.error('Error formatting month:', monthKey, error);
          return null;
        }
      })
      .filter((item): item is { value: string; label: string } => item !== null);
    
    // Always return at least "All Months"
    return [{ value: 'all', label: 'All Months' }, ...monthOptions];
  };

  const filteredAppointments = appointments.filter(apt => {
    const appointmentDate = new Date(apt.appointment_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    appointmentDate.setHours(0, 0, 0, 0);

    // Filter by upcoming/past
    let matchesTimeFilter = false;
    if (filter === 'upcoming') {
      matchesTimeFilter = appointmentDate >= today && apt.status !== 'completed' && apt.status !== 'cancelled';
    } else if (filter === 'past') {
      matchesTimeFilter = appointmentDate < today || apt.status === 'completed' || apt.status === 'cancelled';
    }

    // Filter by month
    let matchesMonthFilter = true;
    if (selectedMonth !== 'all') {
      const aptYear = appointmentDate.getFullYear();
      const aptMonth = String(appointmentDate.getMonth() + 1).padStart(2, '0');
      matchesMonthFilter = `${aptYear}-${aptMonth}` === selectedMonth;
    }

    return matchesTimeFilter && matchesMonthFilter;
  }).sort((a, b) => {
    const dateA = new Date(`${a.appointment_date}T${a.appointment_time}`);
    const dateB = new Date(`${b.appointment_date}T${b.appointment_time}`);
    return filter === 'upcoming' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Appointments</h1>
          <button
            onClick={() => navigate('/portal/appointments/book')}
            className="bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:scale-105 text-white px-6 py-2 rounded-lg flex items-center transition-all duration-200"
          >
            <Plus className="h-5 w-5 mr-2" />
            Book Appointment
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow-md hover:shadow-lg mb-6 transition-all duration-300">
          <div className="flex border-b border-gray-200 relative">
            <button
              onClick={() => {
                setFilter('upcoming');
                setSelectedMonth('all');
                setShowMonthFilter(false);
              }}
              className={`flex-1 px-6 py-3 text-sm font-medium flex items-center justify-between ${
                filter === 'upcoming'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span>
              Upcoming ({appointments.filter(a => {
                const date = new Date(a.appointment_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                date.setHours(0, 0, 0, 0);
                return date >= today && a.status !== 'completed' && a.status !== 'cancelled';
              }).length})
              </span>
              {filter === 'upcoming' && (
                <div className="relative month-filter-container">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMonthFilter(!showMonthFilter);
                    }}
                    className={`p-1.5 rounded-md transition-all duration-200 ${
                      selectedMonth !== 'all' 
                        ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' 
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                    title="Filter by month"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                  {showMonthFilter && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[180px]">
                      <div className="p-2">
                        <select
                          value={selectedMonth}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setSelectedMonth(newValue);
                            // Close dropdown after a small delay to allow the selection to register
                            setTimeout(() => {
                              setShowMonthFilter(false);
                            }, 100);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-all duration-200"
                          autoFocus
                        >
                          {getAvailableMonths().map(month => (
                            <option key={month.value} value={month.value}>
                              {month.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </button>
            <button
              onClick={() => {
                setFilter('past');
                setSelectedMonth('all');
                setShowMonthFilter(false);
              }}
              className={`flex-1 px-6 py-3 text-sm font-medium flex items-center justify-between ${
                filter === 'past'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span>
              Past ({appointments.filter(a => {
                const date = new Date(a.appointment_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                date.setHours(0, 0, 0, 0);
                return date < today || a.status === 'completed' || a.status === 'cancelled';
              }).length})
              </span>
              {filter === 'past' && (
                <div className="relative month-filter-container">
            <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMonthFilter(!showMonthFilter);
                    }}
                    className={`p-1.5 rounded-md transition-all duration-200 ${
                      selectedMonth !== 'all' 
                        ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' 
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
                    title="Filter by month"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                  {showMonthFilter && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[180px]">
                      <div className="p-2">
                        <select
                          value={selectedMonth}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setSelectedMonth(newValue);
                            // Close dropdown after a small delay to allow the selection to register
                            setTimeout(() => {
                              setShowMonthFilter(false);
                            }, 100);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-all duration-200"
                          autoFocus
                        >
                          {getAvailableMonths().map(month => (
                            <option key={month.value} value={month.value}>
                              {month.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Appointments List */}
        {filteredAppointments.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md hover:shadow-lg p-12 text-center transition-all duration-300">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 mb-4">
              {filter === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}
            </p>
            {filter === 'upcoming' && (
              <button
                onClick={() => navigate('/portal/appointments/book')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
              >
                Book Appointment
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAppointments.map((apt) => {
              const bookedFor = getBookedFor(apt);
              const doctorName = getDoctorName(apt);
              const appointmentDateTime = new Date(`${apt.appointment_date}T${apt.appointment_time}`);
              const isUpcoming = filter === 'upcoming' && apt.status !== 'completed' && apt.status !== 'cancelled';

              return (
                <div key={apt.appointment_id} className={`rounded-lg shadow-md hover:shadow-lg p-6 border transition-all duration-300 hover:scale-[1.01] ${getAppointmentStatusContainer(apt.status)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center text-gray-600">
                          <Calendar className="h-5 w-5 mr-2" />
                          <span className="font-medium">
                            {appointmentDateTime.toLocaleDateString('en-US', { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </span>
                        </div>
                        <div className="flex items-center text-gray-600">
                          <Clock className="h-5 w-5 mr-2" />
                          <span>{appointmentDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getAppointmentStatusColor(apt.status)}`}>
                          {(apt.status as string) === 'confirmed' ? 'Scheduled' : apt.status}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center text-gray-700">
                          <User className="h-4 w-4 mr-2 text-gray-500" />
                          <span className="font-medium">Doctor:</span>
                          <span className="ml-2">{doctorName}</span>
                        </div>
                        <div className="flex items-center text-gray-700">
                          <User className="h-4 w-4 mr-2 text-gray-500" />
                          <span className="font-medium">For:</span>
                          <span className="ml-2">{bookedFor}</span>
                        </div>
                        {apt.facility_name && (
                          <div className="flex items-center text-gray-700">
                            <MapPin className="h-4 w-4 mr-2 text-gray-500" />
                            <span>{apt.facility_name}</span>
                          </div>
                        )}
                        {apt.reason && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">Reason:</span> {apt.reason}
                          </div>
                        )}
                        {apt.appointment_type && (
                          <div className="text-xs text-gray-500 capitalize">
                            Type: {apt.appointment_type.replace('_', ' ')}
                          </div>
                        )}
                      </div>
                    </div>

                    {isUpcoming && (
                    <div className="flex gap-2 ml-4">
                          <button
                          onClick={() => handleRescheduleClick(apt)}
                          className="p-2 text-blue-600 hover:bg-blue-50 hover:shadow-md hover:scale-110 rounded-lg transition-all duration-200"
                            title="Reschedule"
                          >
                            <Edit2 className="h-5 w-5" />
                          </button>
                          <button
                          onClick={() => handleCancel(apt)}
                          className="p-2 text-red-600 hover:bg-red-50 hover:shadow-md hover:scale-110 rounded-lg transition-all duration-200"
                            title="Cancel"
                          >
                            <X className="h-5 w-5" />
                          </button>
                      </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reschedule Modal */}
        {rescheduleAppointment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl hover:shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                  Reschedule Appointment
                </h2>
                <button
                  onClick={() => {
                    setRescheduleAppointment(null);
                    setRescheduleDate('');
                    setRescheduleTime('');
                    setAvailableSlots({});
                    setDateRangeOffset(0);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Current Appointment Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-blue-900 mb-2">Current Appointment</h3>
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Date:</span> {new Date(rescheduleAppointment.appointment_date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Time:</span> {new Date(`2000-01-01T${rescheduleAppointment.appointment_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Doctor:</span> {getDoctorName(rescheduleAppointment)}
                  </p>
                </div>

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
                                setRescheduleDate(date);
                                setRescheduleTime('');
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
                            const isSelected = rescheduleDate === selectedDate && rescheduleTime === slot.time;
                            return (
                              <button
                                key={slot.time}
                                onClick={() => {
                                  setRescheduleDate(selectedDate);
                                  setRescheduleTime(slot.time);
                                }}
                                className={`p-3 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                                    : 'border-gray-200 hover:border-blue-300 bg-white'
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
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setRescheduleAppointment(null);
                    setRescheduleDate('');
                    setRescheduleTime('');
                    setAvailableSlots({});
                    setDateRangeOffset(0);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReschedule}
                  disabled={!rescheduleDate || !rescheduleTime || rescheduling}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-lg hover:scale-105 disabled:bg-gray-300 disabled:hover:scale-100 disabled:hover:shadow-none disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                >
                  {rescheduling ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Rescheduling...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Confirm Reschedule
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppointmentList;

