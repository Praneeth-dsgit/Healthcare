/**
 * Patient Service - API calls for patient-related operations
 * Uses JWT (Authorization: Bearer); identity from token.
 */

import { getAuthHeaders, authenticatedFetch } from './authService';

import { getApiRoot } from '../utils/apiBase';

const API_BASE = getApiRoot();

export interface Patient {
  patient_id: string;
  user_id?: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  blood_type?: string;
  height_cm?: number;
  weight_kg?: number;
  bmi?: number;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  is_active: boolean;
  created_at: string;
}

export interface FamilyMember {
  family_member_id: number;
  primary_patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  relationship: 'self' | 'spouse' | 'child' | 'parent' | 'sibling' | 'other';
  phone?: string;
  email?: string;
  blood_type?: string;
  height_cm?: number;
  weight_kg?: number;
  medical_history?: string;
  allergies?: string;
  is_active: boolean;
}

class PatientService {
  getPatientId(): string | null {
    return sessionStorage.getItem('patient_id');
  }

  // Patient Profile
  async getProfile(): Promise<{ success: boolean; patient?: Patient; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/profile`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      
      console.log('Profile API response status:', response.status);
      const data = await response.json();
      console.log('Profile API response data:', data);
      
      if (!response.ok) {
        console.error('Profile API error:', data);
        return { success: false, error: data.error || 'Failed to fetch profile' };
      }
      
      return data;
    } catch (error) {
      console.error('Network error fetching profile:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async updateProfile(patientData: Partial<Patient>): Promise<{ success: boolean; patient?: Patient; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(patientData),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Family Members
  async getFamilyMembers(): Promise<{ success: boolean; family_members?: FamilyMember[]; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/family-members`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async addFamilyMember(memberData: Omit<FamilyMember, 'family_member_id' | 'primary_patient_id' | 'is_active'>): Promise<{ success: boolean; family_member?: FamilyMember; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/family-members`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(memberData),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async updateFamilyMember(memberId: number, memberData: Partial<FamilyMember>): Promise<{ success: boolean; family_member?: FamilyMember; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/family-members/${memberId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(memberData),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async deleteFamilyMember(memberId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/family-members/${memberId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Get list of all patients (for doctors)
  // If doctorId is provided, only returns patients who have appointments with that doctor
  async listPatients(search?: string, doctorId?: number): Promise<{ success: boolean; patients?: Array<{patient_id: string; first_name: string; last_name: string; date_of_birth: string; gender: string; age?: number; email?: string; phone?: string}>; error?: string }> {
    try {
      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (doctorId) queryParams.append('doctor_id', doctorId.toString());

      const response = await authenticatedFetch(`${API_BASE}/patient/list?${queryParams}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Get patient by ID (for auto-fill)
  async getPatientById(patientId: string): Promise<{ success: boolean; patient?: Patient; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/profile?patient_id=${patientId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getHealthSummary(refresh = false): Promise<{
    success: boolean;
    summary?: string;
    generated_at?: string;
    error?: string;
  }> {
    try {
      const url = `${API_BASE}/patient-portal/health-summary${refresh ? '?refresh=1' : ''}`;
      const response = await authenticatedFetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to load health summary' };
      }
      return data;
    } catch (error) {
      console.error('Error fetching health summary:', error);
      return { success: false, error: 'Network error' };
    }
  }
}

export const patientService = new PatientService();

