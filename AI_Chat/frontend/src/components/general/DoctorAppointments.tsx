/**
 * Doctor Appointments Component
 * View appointments for the logged-in doctor
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, MapPin, Search, Edit, Pill } from 'lucide-react';
import { appointmentService, Appointment } from '../../services/appointmentService';
import EditAppointmentModal from './EditAppointmentModal';
import { getAppointmentStatusColor, getAppointmentStatusContainer } from '../../utils/appointmentStatusColors';

interface DoctorAppointmentsProps {
  onPrescribe?: (patientId: string, patientName: string) => void;
}

const DoctorAppointments: React.FC<DoctorAppointmentsProps> = ({ onPrescribe }) => {
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
      // TODO: Update API to support doctor_id filter
      // For now, we'll use the patient appointments endpoint
      // In production, this should be /api/doctors/{doctor_id}/appointments
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

    const matchesSearch = searchTerm === '' || 
      `${apt.doctor_first_name} ${apt.doctor_last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${apt.family_member_first_name || ''} ${apt.family_member_last_name || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.facility_name?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
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
      const result = await appointmentService.updateAppointment(editingAppointment.appointment_id, updatedData);
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
    const patientName = appointment.family_member_first_name && appointment.family_member_last_name
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <h2 className="text-xl font-semibold text-gray-900">My Appointments</h2>
          
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search appointments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2">
              {(['all', 'today', 'upcoming', 'past'] as const).map((filterOption) => (
                <button
                  key={filterOption}
                  onClick={() => setFilter(filterOption)}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium transition-colors
                    ${filter === filterOption
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Appointments List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredAppointments.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="mx-auto text-gray-400" size={48} />
            <p className="mt-4 text-gray-600">No appointments found</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {filteredAppointments.map((appointment) => (
              <div key={appointment.appointment_id} className={`p-6 rounded-lg border-2 transition-colors ${getAppointmentStatusContainer(appointment.status)}`}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getAppointmentStatusColor(appointment.status)}`}>
                        {(appointment.status as string) === 'confirmed' ? 'Scheduled' : (appointment.status as string) === 'no_show' ? 'Cancelled' : appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                      </span>
                      <span className="text-sm text-gray-500">{appointment.appointment_type}</span>
                    </div>
                    
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {(() => {
                        // Priority 1: Family member name (if booking for family member)
                        if (appointment.family_member_id && appointment.family_member_first_name && appointment.family_member_last_name) {
                          return `${appointment.family_member_first_name} ${appointment.family_member_last_name}`;
                        }
                        // Priority 2: Patient's own name (if not empty)
                        if (appointment.patient_first_name && appointment.patient_first_name.trim() && 
                            appointment.patient_last_name && appointment.patient_last_name.trim()) {
                          return `${appointment.patient_first_name.trim()} ${appointment.patient_last_name.trim()}`;
                        }
                        // Priority 3: Formatted email username
                        if (appointment.patient_email) {
                          return appointment.patient_email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        }
                        // Fallback
                        return 'Patient';
                      })()}
                    </h3>
                    {appointment.patient_id && (
                      <p className="text-xs text-gray-500 mb-2">Patient ID: {appointment.patient_id}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <Calendar size={16} className="text-gray-400" />
                        <span>{formatDate(appointment.appointment_date)}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock size={16} className="text-gray-400" />
                        <span>{formatTime(appointment.appointment_time)}</span>
                      </div>
                      {appointment.facility_name && (
                        <div className="flex items-center space-x-2">
                          <MapPin size={16} className="text-gray-400" />
                          <span>{appointment.facility_name}</span>
                        </div>
                      )}
                      {appointment.reason && (
                        <div className="flex items-center space-x-2">
                          <User size={16} className="text-gray-400" />
                          <span>{appointment.reason}</span>
                        </div>
                      )}
                    </div>

                    {appointment.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">{appointment.notes}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex flex-col md:flex-row gap-2 mt-4 md:mt-0 md:ml-4">
                    <button
                      onClick={() => handleEditAppointment(appointment)}
                      className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      <Edit size={16} />
                      <span>Edit</span>
                    </button>
                    
                    <button
                      onClick={() => handlePrescribe(appointment)}
                      className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      <Pill size={16} />
                      <span>Prescribe</span>
                    </button>
                    
                    <div className="relative">
                      <select
                        value={(appointment.status as string) === 'confirmed' ? 'scheduled' : (appointment.status as string) === 'no_show' ? 'cancelled' : appointment.status}
                        onChange={(e) => handleStatusChange(appointment.appointment_id, e.target.value)}
                        disabled={updatingStatus === appointment.appointment_id}
                        className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm cursor-pointer appearance-none pr-8"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      {updatingStatus === appointment.appointment_id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-600 bg-opacity-75 rounded-lg">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Edit Appointment Modal */}
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

