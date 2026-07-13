/**
 * Doctor Appointments Component
 * View appointments for the logged-in doctor
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, MapPin, Search, Edit, Pill, FolderOpen } from 'lucide-react';
import { appointmentService, Appointment } from '../../services/appointmentService';
import EditAppointmentModal from './EditAppointmentModal';
import { getAppointmentStatusColor, getAppointmentStatusContainer } from '../../utils/appointmentStatusColors';
import SegmentTabs from '../ui/SegmentTabs';

interface DoctorAppointmentsProps {
  onPrescribe?: (patientId: string, patientName: string) => void;
  onViewRecords?: (patientId: string, patientName: string) => void;
}

const FILTER_TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'today', label: 'Today' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' },
];

const DoctorAppointments: React.FC<DoctorAppointmentsProps> = ({ onPrescribe, onViewRecords }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'today' | 'past'>('upcoming');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const result = await appointmentService.getAppointments();
      if (result.success && result.appointments) {
        setAppointments(result.appointments);
      }
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAppointments = appointments.filter((apt) => {
    const matchesFilter = (() => {
      const today = new Date().toISOString().split('T')[0];
      const aptDate = apt.appointment_date.split('T')[0];

      switch (filter) {
        case 'today':
          return aptDate === today;
        case 'upcoming':
          return aptDate >= today && apt.status !== 'completed' && apt.status !== 'cancelled';
        case 'past':
          return aptDate < today || apt.status === 'completed';
        default:
          return true;
      }
    })();

    const matchesSearch =
      searchTerm === '' ||
      `${apt.doctor_first_name} ${apt.doctor_last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${apt.family_member_first_name || ''} ${apt.family_member_last_name || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.facility_name?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    const time = timeString.includes('T') ? timeString.split('T')[1] : timeString;
    return time.substring(0, 5);
  };

  const handleEditAppointment = (appointment: Appointment) => {
    setEditingAppointment(appointment);
  };

  const handleSaveAppointment = async (updatedData: Partial<Appointment>) => {
    if (!editingAppointment) return;

    try {
      const result = await appointmentService.updateAppointment(
        editingAppointment.appointment_id,
        updatedData
      );
      if (result.success) {
        await loadAppointments();
        setEditingAppointment(null);
      } else {
        alert(result.error || 'Failed to update appointment');
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('Failed to update appointment');
    }
  };

  const handlePrescribe = (appointment: Appointment) => {
    const patientName =
      appointment.family_member_first_name && appointment.family_member_last_name
        ? `${appointment.family_member_first_name} ${appointment.family_member_last_name}`
        : appointment.patient_first_name && appointment.patient_last_name
          ? `${appointment.patient_first_name} ${appointment.patient_last_name}`
          : appointment.patient_email
            ? appointment.patient_email.split('@')[0]
            : 'Patient';

    if (onPrescribe) {
      onPrescribe(appointment.patient_id, patientName);
    }
  };

  const handleViewRecords = (appointment: Appointment) => {
    const patientName = getPatientName(appointment);
    if (onViewRecords) {
      onViewRecords(appointment.patient_id, patientName);
    }
  };

  const handleStatusChange = async (appointmentId: number, newStatus: string) => {
    setUpdatingStatus(appointmentId);
    try {
      const result = await appointmentService.updateAppointmentStatus(appointmentId, newStatus);
      if (result.success) {
        await loadAppointments();
      } else {
        alert(result.error || 'Failed to update appointment status');
      }
    } catch (error) {
      console.error('Error updating appointment status:', error);
      alert('Failed to update appointment status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const getPatientName = (appointment: Appointment) => {
    if (
      appointment.family_member_id &&
      appointment.family_member_first_name &&
      appointment.family_member_last_name
    ) {
      return `${appointment.family_member_first_name} ${appointment.family_member_last_name}`;
    }
    if (
      appointment.patient_first_name?.trim() &&
      appointment.patient_last_name?.trim()
    ) {
      return `${appointment.patient_first_name.trim()} ${appointment.patient_last_name.trim()}`;
    }
    if (appointment.patient_email) {
      return appointment.patient_email
        .split('@')[0]
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
    }
    return 'Patient';
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-sky-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-xl font-semibold text-slate-100">My Appointments</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              size={18}
            />
            <input
              type="text"
              placeholder="Search appointments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-field w-full py-2 pl-9 text-sm"
            />
          </div>
          <SegmentTabs
            tabs={FILTER_TABS}
            activeTab={filter}
            onChange={(id) => setFilter(id as typeof filter)}
          />
        </div>
      </div>

      {filteredAppointments.length === 0 ? (
        <div className="rounded-xl border border-slate-700/50 py-12 text-center">
          <Calendar className="mx-auto text-slate-500" size={48} />
          <p className="mt-4 text-slate-400">No appointments found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAppointments.map((appointment) => (
            <div
              key={appointment.appointment_id}
              className={`rounded-xl border-2 p-5 transition-colors ${getAppointmentStatusContainer(appointment.status)}`}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center space-x-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getAppointmentStatusColor(appointment.status)}`}
                    >
                      {(appointment.status as string) === 'confirmed'
                        ? 'Scheduled'
                        : (appointment.status as string) === 'no_show'
                          ? 'Cancelled'
                          : appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                    </span>
                    <span className="text-sm text-slate-400">
                      {appointment.appointment_type === 'video' ? 'Telemedicine' : appointment.appointment_type}
                    </span>
                  </div>

                  <h3 className="mb-2 text-lg font-semibold text-slate-100">{getPatientName(appointment)}</h3>
                  {appointment.patient_id && (
                    <p className="mb-2 text-xs text-slate-500">Patient ID: {appointment.patient_id}</p>
                  )}

                  <div className="grid grid-cols-1 gap-2 text-sm text-slate-400 md:grid-cols-2">
                    <div className="flex items-center space-x-2">
                      <Calendar size={16} className="text-slate-500" />
                      <span>{formatDate(appointment.appointment_date)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock size={16} className="text-slate-500" />
                      <span>{formatTime(appointment.appointment_time)}</span>
                    </div>
                    {appointment.facility_name && (
                      <div className="flex items-center space-x-2">
                        <MapPin size={16} className="text-slate-500" />
                        <span>{appointment.facility_name}</span>
                      </div>
                    )}
                    {appointment.reason && (
                      <div className="flex items-center space-x-2">
                        <User size={16} className="text-slate-500" />
                        <span>{appointment.reason}</span>
                      </div>
                    )}
                  </div>

                  {appointment.notes && (
                    <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
                      <p className="text-sm text-slate-300">{appointment.notes}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2 md:ml-4 md:mt-0 md:flex-row">
                  <button
                    type="button"
                    onClick={() => handleEditAppointment(appointment)}
                    className="portal-accent-button flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm"
                  >
                    <Edit size={16} />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleViewRecords(appointment)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-sm font-medium text-sky-300 transition-colors hover:bg-sky-500/25"
                  >
                    <FolderOpen size={16} />
                    <span>Records</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrescribe(appointment)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
                  >
                    <Pill size={16} />
                    <span>Prescribe</span>
                  </button>

                  <div className="relative">
                    <select
                      value={
                        (appointment.status as string) === 'confirmed'
                          ? 'scheduled'
                          : (appointment.status as string) === 'no_show'
                            ? 'cancelled'
                            : appointment.status
                      }
                      onChange={(e) =>
                        handleStatusChange(appointment.appointment_id, e.target.value)
                      }
                      disabled={updatingStatus === appointment.appointment_id}
                      className="form-field cursor-pointer appearance-none py-2 pl-3 pr-8 text-sm"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    {updatingStatus === appointment.appointment_id && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/80">
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-sky-400" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingAppointment && (
        <EditAppointmentModal
          appointment={editingAppointment}
          onClose={() => setEditingAppointment(null)}
          onSave={handleSaveAppointment}
        />
      )}
    </div>
  );
};

export default DoctorAppointments;
