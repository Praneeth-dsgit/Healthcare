/**
 * Radiology Service - API calls for radiology booking
 * Uses JWT (Authorization: Bearer).
 */

import { getAuthHeaders, authenticatedFetch } from './authService';
import { getApiRoot } from '../utils/apiBase';

const API_BASE = getApiRoot();

export interface RadiologyBooking {
  booking_id: number;
  patient_id: string;
  family_member_id?: number;
  facility_id: number;
  facility_name?: string;
  scan_type: 'mri' | 'ct' | 'xray' | 'ultrasound' | 'mammography' | 'pet_scan' | 'other';
  body_part?: string;
  appointment_date: string;
  appointment_time: string;
  referring_doctor_id?: number;
  doctor_first_name?: string;
  doctor_last_name?: string;
  reason?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  report_available?: boolean;
  report_url?: string;
  created_at: string;
  family_member_first_name?: string;
  family_member_last_name?: string;
}

export interface RadiologyBookingData {
  patient_id?: string;
  family_member_id?: number;
  facility_id: number;
  scan_type: 'mri' | 'ct' | 'xray' | 'ultrasound' | 'mammography' | 'pet_scan' | 'other';
  body_part?: string;
  appointment_date: string;
  appointment_time: string;
  referring_doctor_id?: number;
  reason?: string;
}

class RadiologyService {
  getPatientId(): string | null {
    return sessionStorage.getItem('patient_id');
  }

  async bookRadiology(data: RadiologyBookingData): Promise<{ success: boolean; booking?: RadiologyBooking; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/radiology/bookings`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        return { success: false, error: errorData.error || `Server error: ${response.status}` };
      }

      return await response.json();
    } catch (error) {
      console.error('Radiology booking error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Network error. Please check your connection.' };
    }
  }

  async getBookings(): Promise<{ success: boolean; bookings?: RadiologyBooking[]; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/radiology/bookings`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getBooking(bookingId: number): Promise<{ success: boolean; booking?: RadiologyBooking; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/radiology/bookings/${bookingId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async cancelBooking(bookingId: number, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/radiology/bookings/${bookingId}/cancel`, {
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
}

export const radiologyService = new RadiologyService();
