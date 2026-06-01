/**
 * Edit Appointment Modal Component
 * Modal for editing appointment details
 */

import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, FileText, User } from 'lucide-react';
import { Appointment } from '../../services/appointmentService';

interface EditAppointmentModalProps {
  appointment: Appointment;
  onClose: () => void;
  onSave: (updates: Partial<Appointment>) => void;
}

const EditAppointmentModal: React.FC<EditAppointmentModalProps> = ({
  appointment,
  onClose,
  onSave,
}) => {
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentType, setAppointmentType] = useState(appointment.appointment_type || 'consultation');
  const [reason, setReason] = useState(appointment.reason || '');
  const [notes, setNotes] = useState(appointment.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appointment.appointment_date) {
      const date = new Date(appointment.appointment_date);
      setAppointmentDate(date.toISOString().split('T')[0]);
    }

    if (appointment.appointment_time) {
      const timeStr = appointment.appointment_time.includes('T')
        ? appointment.appointment_time.split('T')[1]
        : appointment.appointment_time;
      setAppointmentTime(timeStr.substring(0, 5));
    }
  }, [appointment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const updates: Partial<Appointment> = {};
    if (appointmentDate) updates.appointment_date = appointmentDate;
    if (appointmentTime) updates.appointment_time = appointmentTime;
    if (appointmentType) updates.appointment_type = appointmentType as Appointment['appointment_type'];
    if (reason !== undefined) updates.reason = reason;
    if (notes !== undefined) updates.notes = notes;

    onSave(updates);
    setSaving(false);
  };

  const patientLabel =
    appointment.family_member_first_name && appointment.family_member_last_name
      ? `${appointment.family_member_first_name} ${appointment.family_member_last_name}`
      : appointment.patient_first_name && appointment.patient_last_name
        ? `${appointment.patient_first_name} ${appointment.patient_last_name}`
        : appointment.patient_email
          ? appointment.patient_email.split('@')[0]
          : 'Patient';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="modal-surface max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-700/60 p-6">
          <h2 className="text-xl font-semibold text-slate-100">Edit Appointment</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 transition-colors hover:text-slate-200"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
            <label className="mb-2 block text-sm font-medium text-slate-400">Patient</label>
            <div className="flex items-center gap-2 text-slate-100">
              <User size={16} className="text-slate-500" />
              <span>{patientLabel}</span>
              {appointment.patient_id && (
                <span className="text-xs text-slate-500">({appointment.patient_id})</span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              <Calendar className="mr-2 inline" size={16} />
              Appointment Date
            </label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="form-field w-full"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              <Clock className="mr-2 inline" size={16} />
              Appointment Time
            </label>
            <input
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              className="form-field w-full"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Appointment Type</label>
            <select
              value={appointmentType}
              onChange={(e) => setAppointmentType(e.target.value)}
              className="form-field w-full"
            >
              <option value="consultation">Consultation</option>
              <option value="follow_up">Follow Up</option>
              <option value="emergency">Emergency</option>
              <option value="routine">Routine</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Reason for Visit</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for visit..."
              className="form-field w-full"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              <FileText className="mr-2 inline" size={16} />
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes..."
              rows={4}
              className="form-field w-full resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-700/60 pt-4">
            <button type="button" onClick={onClose} className="ghost-button rounded-lg px-4 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="portal-accent-button flex items-center gap-2 rounded-lg px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-slate-900" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditAppointmentModal;
