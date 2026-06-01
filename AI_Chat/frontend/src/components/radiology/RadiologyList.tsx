/**
 * Radiology List Component
 * View all radiology bookings with options to view details, cancel, download reports
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scan, Calendar, Clock, MapPin, User, Plus, X, Download, FileText, Edit2, Filter } from 'lucide-react';
import { radiologyService, RadiologyBooking } from '../../services/radiologyService';
import { patientService, FamilyMember } from '../../services/patientService';
import {
  PortalPageShell,
  PortalPageHero,
  PortalLoading,
} from '../patient/portalPageLayout';

const SCAN_TYPE_LABELS: Record<string, string> = {
  mri: 'MRI',
  ct: 'CT Scan',
  xray: 'X-Ray',
  ultrasound: 'Ultrasound',
  mammography: 'Mammography',
  pet_scan: 'PET Scan',
  other: 'Other',
};

const STATUS_PILL_CLASS: Record<string, string> = {
  scheduled: 'bg-violet-500/15 text-violet-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  cancelled: 'bg-red-500/15 text-red-300',
  no_show: 'bg-slate-500/15 text-slate-400',
};

const RadiologyList: React.FC = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<RadiologyBooking[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [showMonthFilter, setShowMonthFilter] = useState(false);

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
      const [bookingsResult, familyResult] = await Promise.all([
        radiologyService.getBookings(),
        patientService.getFamilyMembers(),
      ]);

      if (bookingsResult.success && bookingsResult.bookings) {
        setBookings(bookingsResult.bookings);
      }
      if (familyResult.success && familyResult.family_members) {
        setFamilyMembers(familyResult.family_members);
      }
    } catch (error) {
      console.error('Error loading radiology bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBookedFor = (booking: RadiologyBooking): string => {
    if (booking.family_member_id) {
      if (booking.family_member_first_name && booking.family_member_last_name) {
        return `${booking.family_member_first_name} ${booking.family_member_last_name}`;
      }
      const familyMember = familyMembers.find(fm => fm.family_member_id === booking.family_member_id);
      return familyMember ? `${familyMember.first_name} ${familyMember.last_name}` : 'Family Member';
    }
    return 'Myself';
  };

  const getDoctorName = (booking: RadiologyBooking): string => {
    if (booking.doctor_first_name && booking.doctor_last_name) {
      return `Dr. ${booking.doctor_first_name} ${booking.doctor_last_name}`;
    }
    return booking.referring_doctor_id ? 'Doctor' : 'Not specified';
  };

  // Get available months from filtered bookings
  const getAvailableMonths = (): Array<{ value: string; label: string }> => {
    const months = new Set<string>();
    
    // Get bookings that match the current filter (upcoming or past)
    bookings.forEach(booking => {
      if (!booking.appointment_date) return;
      
      try {
        const appointmentDate = new Date(booking.appointment_date);
        if (isNaN(appointmentDate.getTime())) {
          console.warn('Invalid booking date:', booking.appointment_date);
          return;
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        appointmentDate.setHours(0, 0, 0, 0);
        
        let matchesFilter = false;
        if (filter === 'upcoming') {
          matchesFilter = appointmentDate >= today && booking.status === 'scheduled';
        } else if (filter === 'past') {
          matchesFilter = appointmentDate < today || booking.status === 'completed' || booking.status === 'cancelled';
        }
        
        if (matchesFilter) {
          const year = appointmentDate.getFullYear();
          const month = appointmentDate.getMonth() + 1;
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
          months.add(monthKey);
        }
      } catch (error) {
        console.error('Error processing booking date:', booking.appointment_date, error);
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

  const filteredBookings = bookings.filter(booking => {
    const appointmentDate = new Date(booking.appointment_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    appointmentDate.setHours(0, 0, 0, 0);

    // Filter by upcoming/past
    let matchesTimeFilter = false;
    if (filter === 'upcoming') {
      matchesTimeFilter = appointmentDate >= today && booking.status === 'scheduled';
    } else if (filter === 'past') {
      matchesTimeFilter = appointmentDate < today || booking.status === 'completed' || booking.status === 'cancelled';
    }

    // Filter by month
    let matchesMonthFilter = true;
    if (selectedMonth !== 'all') {
      const bookingYear = appointmentDate.getFullYear();
      const bookingMonth = String(appointmentDate.getMonth() + 1).padStart(2, '0');
      matchesMonthFilter = `${bookingYear}-${bookingMonth}` === selectedMonth;
    }

    return matchesTimeFilter && matchesMonthFilter;
  }).sort((a, b) => {
    const dateA = new Date(`${a.appointment_date}T${a.appointment_time}`);
    const dateB = new Date(`${b.appointment_date}T${b.appointment_time}`);
    return filter === 'upcoming' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
  });

  const handleCancel = async (bookingId: number) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) {
      return;
    }
    try {
      const result = await radiologyService.cancelBooking(bookingId);
      if (result.success) {
        loadData();
      } else {
        alert(result.error || 'Failed to cancel booking');
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking. Please try again.');
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeString: string): string => {
    if (!timeString) return '';
    const time = timeString.split(':');
    if (time.length >= 2) {
      const hours = parseInt(time[0]);
      const minutes = time[1];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes} ${ampm}`;
    }
    return timeString;
  };

  if (loading) {
    return <PortalLoading message="Loading radiology bookings…" />;
  }

  return (
    <PortalPageShell>
        <PortalPageHero
          eyebrow="Imaging"
          title="My Radiology Bookings"
          subtitle="Schedule and track CT, MRI, X-ray, and other scans."
          icon={<Scan />}
          actions={
            <button
              type="button"
              onClick={() => navigate('/portal/radiology/book')}
              className="portal-accent-button inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold"
            >
              <Plus className="h-4 w-4" />
              Book Scan
            </button>
          }
        />

        {/* Filter Tabs */}
        <div className="content-panel mb-6 p-2 transition-all duration-300">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setFilter('upcoming');
                setSelectedMonth('all');
                setShowMonthFilter(false);
              }}
              className={`flex flex-1 items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                filter === 'upcoming'
                  ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <span>
              Upcoming ({bookings.filter(b => {
                const date = new Date(b.appointment_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                date.setHours(0, 0, 0, 0);
                return date >= today && b.status === 'scheduled';
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
              type="button"
              onClick={() => {
                setFilter('past');
                setSelectedMonth('all');
                setShowMonthFilter(false);
              }}
              className={`flex flex-1 items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                filter === 'past'
                  ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <span>
              Past ({bookings.filter(b => {
                const date = new Date(b.appointment_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                date.setHours(0, 0, 0, 0);
                return date < today || b.status === 'completed' || b.status === 'cancelled';
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

        {/* Bookings List */}
        {filteredBookings.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md hover:shadow-lg p-12 text-center transition-all duration-300">
            <Scan className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Radiology Bookings</h3>
            <p className="text-gray-600 mb-6">
              {filter === 'upcoming' 
                ? "You don't have any upcoming radiology bookings."
                : "You don't have any past radiology bookings."}
            </p>
            <button
              onClick={() => navigate('/portal/radiology/book')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg inline-flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Book Your First Scan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredBookings.map((booking) => {
              const scanTitle = SCAN_TYPE_LABELS[booking.scan_type] || booking.scan_type;
              const isUpcoming = filter === 'upcoming' && booking.status === 'scheduled';

              return (
                <article
                  key={booking.booking_id}
                  className="premium-card flex h-full flex-col p-5 transition-all hover:ring-1 hover:ring-teal-500/30"
                >
                  <div className="flex flex-1 flex-col">
                    <div className="mb-4 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/15">
                          <Scan className="h-6 w-6 text-teal-300" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-slate-100">{scanTitle}</h3>
                          <p className="text-sm text-slate-400">
                            {booking.body_part ? `Body part: ${booking.body_part}` : formatDate(booking.appointment_date)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_PILL_CLASS[booking.status] || STATUS_PILL_CLASS.scheduled}`}
                      >
                        {booking.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mb-4 space-y-2 text-sm text-slate-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 shrink-0 text-slate-500" />
                        <span>{formatDate(booking.appointment_date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0 text-slate-500" />
                        <span>{formatTime(booking.appointment_time)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="truncate">
                          {booking.facility_name || `Facility ID: ${booking.facility_id}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 shrink-0 text-slate-500" />
                        <span>For: {getBookedFor(booking)}</span>
                      </div>
                      {booking.referring_doctor_id && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="truncate">Referred by: {getDoctorName(booking)}</span>
                        </div>
                      )}
                    </div>

                    {booking.reason && (
                      <p className="mb-4 line-clamp-2 text-sm text-slate-500">{booking.reason}</p>
                    )}
                  </div>

                  {booking.report_available && booking.report_url ? (
                    <a
                      href={booking.report_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-accent-button mt-auto flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
                    >
                      <Download className="h-4 w-4" />
                      Download Report
                    </a>
                  ) : isUpcoming ? (
                    <div className="mt-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => alert('Edit/Update functionality coming soon')}
                        className="portal-accent-button flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(booking.booking_id)}
                        className="ghost-button flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-red-300 hover:text-red-200"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                    </div>
                  ) : filter === 'past' && booking.report_available && !booking.report_url ? (
                    <div className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-bold text-emerald-300">
                      <FileText className="h-4 w-4" />
                      Report Available
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
    </PortalPageShell>
  );
};

export default RadiologyList;

