/**
 * Appointment Service - API calls for appointment booking
 * Uses JWT (Authorization: Bearer).
 */

import { getAuthHeaders, authenticatedFetch } from './authService';

import { getApiRoot } from '../utils/apiBase';

const API_BASE = getApiRoot();

export interface Appointment {
  appointment_id: number;
  patient_id: string;
  family_member_id?: number;
  doctor_id: number;
  facility_id: number;
  appointment_date: string;
  appointment_time: string;
  appointment_type: 'consultation' | 'follow_up' | 'emergency' | 'routine' | 'video';
  reason?: string;
  status: 'scheduled' | 'pending' | 'completed' | 'cancelled';
  notes?: string;
  created_at: string;
  doctor_first_name?: string;
  doctor_last_name?: string;
  facility_name?: string;
  family_member_first_name?: string;
  family_member_last_name?: string;
  patient_first_name?: string;
  patient_last_name?: string;
  patient_email?: string;
}

export interface AppointmentBookingData {
  patient_id?: string;
  family_member_id?: number;
  doctor_id: number;
  facility_id: number;
  appointment_date: string;
  appointment_time: string;
  appointment_type?: 'consultation' | 'follow_up' | 'emergency' | 'routine' | 'video';
  reason?: string;
}

class AppointmentService {
  getPatientId(): string | null {
    return sessionStorage.getItem('patient_id');
  }

  async bookAppointment(data: AppointmentBookingData): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/appointments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const result = await response.json();
      return result;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getAppointments(): Promise<{ success: boolean; appointments?: Appointment[]; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/appointments`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getAppointment(appointmentId: number): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/appointments/${appointmentId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async cancelAppointment(appointmentId: number, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/appointments/${appointmentId}/cancel`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async rescheduleAppointment(appointmentId: number, newDate: string, newTime: string): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/appointments/${appointmentId}/reschedule`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ appointment_date: newDate, appointment_time: newTime }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async updateAppointment(appointmentId: number, updates: {
    appointment_date?: string;
    appointment_time?: string;
    appointment_type?: string;
    reason?: string;
    notes?: string;
  }): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/appointments/${appointmentId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async updateAppointmentStatus(appointmentId: number, status: string): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/appointments/${appointmentId}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }
}

export const appointmentService = new AppointmentService();

