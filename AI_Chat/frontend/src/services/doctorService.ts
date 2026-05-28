/**
 * Doctor Service - API calls for doctor search and information
 * Protected routes use JWT (Authorization: Bearer).
 */

import { getAuthHeaders, authenticatedFetch } from './authService';

import { getApiRoot } from '../utils/apiBase';

const API_BASE = getApiRoot();

export interface Doctor {
  doctor_id: number;
  specialty_id: number;
  first_name: string;
  last_name: string;
  qualification: string;
  experience_years: number;
  consultation_fee: number;
  is_available: boolean;
  is_active: boolean;
  bio?: string;
  languages?: string;
  specialty_name?: string; // Direct specialty name from API
  specialty?: {
    specialty_id: number;
    name: string;
    description?: string;
  };
  facility_id?: number;
  facility_name?: string;
  facility_address?: string;
  facility_city?: string;
  facility_type?: string;
}

export interface Specialty {
  specialty_id: number;
  name: string;
  description?: string;
}

class DoctorService {
  async searchDoctors(params: {
    specialty_id?: number;
    facility_id?: number;
    search?: string;
  }): Promise<{ success: boolean; doctors?: Doctor[]; error?: string }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.specialty_id) queryParams.append('specialty_id', params.specialty_id.toString());
      if (params.facility_id) queryParams.append('facility_id', params.facility_id.toString());
      if (params.search) queryParams.append('search', params.search);

      const response = await fetch(`${API_BASE}/doctors/search?${queryParams}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getDoctor(doctorId: number): Promise<{ success: boolean; doctor?: Doctor; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/doctors/${doctorId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getSpecialties(): Promise<{ success: boolean; specialties?: Specialty[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/specialties`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getDoctorAvailability(doctorId: number, date: string): Promise<{ success: boolean; slots?: string[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/doctors/${doctorId}/availability?date=${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getCurrentDoctor(): Promise<{ success: boolean; doctor?: Doctor; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/doctors/me`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getPatientFamilyMembers(patientId: string): Promise<{ success: boolean; family_members?: any[]; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/doctors/patients/${patientId}/family-members`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getPrescriptions(doctorId?: number): Promise<{ success: boolean; prescriptions?: any[]; count?: number; error?: string }> {
    try {
      const queryParams = new URLSearchParams();
      if (doctorId) {
        queryParams.append('doctor_id', doctorId.toString());
      }
      const response = await authenticatedFetch(`${API_BASE}/doctors/prescriptions?${queryParams}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }
}

export const doctorService = new DoctorService();

