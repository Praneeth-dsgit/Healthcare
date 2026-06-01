/**
 * Admin Service
 * Uses JWT (Authorization: Bearer).
 */

import { getAuthHeaders, authenticatedFetch } from './authService';
import { getApiBaseUrl } from '../utils/apiBase';

const API_BASE = getApiBaseUrl();

export interface User {
  id: number;
  email: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  role?: string;
  user_role: string;
  patient_id?: string;
  employee_id?: string;
  doctor_id?: number;
  specialty_id?: number;
  specialty_name?: string;
}

export interface Specialty {
  specialty_id: number;
  name: string;
  description?: string;
}

export interface DoctorProfileData {
  qualification?: string;
  experience_years?: number;
  consultation_fee?: number;
  bio?: string;
  facility_id?: number;
  is_available?: boolean;
}

export interface AdminFacility {
  facility_id: number;
  name: string;
  city?: string;
  type?: string;
}

export interface DoctorProfile extends DoctorProfileData {
  doctor_id: number;
  facility_name?: string;
}

export interface CreateUserData extends DoctorProfileData {
  email: string;
  password: string;
  role: 'doctor' | 'radiology' | 'lab_technician' | 'non_medical_staff' | 'admin';
  first_name?: string;
  last_name?: string;
  phone?: string;
  specialty_id?: number;
  doctor_id?: number;
}

export interface UpdateUserData extends DoctorProfileData {
  email?: string;
  password?: string;
  role?: string;
  specialty_id?: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export interface UnassignedStaff {
  doctor_id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  specialty_id: number;
  specialty_name?: string;
  qualification?: string;
  experience_years?: number;
  is_active: boolean;
  created_at?: string;
}

export interface AssignRoleData {
  email: string;
  password: string;
  role: 'doctor' | 'radiology' | 'lab_technician' | 'non_medical_staff' | 'admin';
  doctor_id?: number;
  specialty_id?: number;
}

class AdminService {
  async listUsers(params?: {
    role?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<{ success: boolean; users?: User[]; pagination?: any; error?: string }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.role) queryParams.append('role', params.role);
      if (params?.search) queryParams.append('search', params.search);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.per_page) queryParams.append('per_page', params.per_page.toString());

      const response = await authenticatedFetch(`${API_BASE}/api/admin/users?${queryParams}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async createUser(userData: CreateUserData): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getUserDoctor(
    userId: number
  ): Promise<{ success: boolean; profile?: DoctorProfile; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/users/${userId}/doctor`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      return await response.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async updateUser(
    userId: number,
    userData: UpdateUserData
  ): Promise<{ success: boolean; message?: string; doctor_id?: number; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async deleteUser(userId: number): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async verifyUser(userId: number, isVerified: boolean): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/users/${userId}/verify`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_verified: isVerified }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getSpecialties(): Promise<{ success: boolean; specialties?: Specialty[]; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/specialties`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async listUnassignedStaff(): Promise<{ success: boolean; staff?: UnassignedStaff[]; count?: number; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/unassigned-staff`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async repairMissingDoctorProfiles(): Promise<{
    success: boolean;
    message?: string;
    repaired?: { email: string; doctor_id: number }[];
    error?: string;
  }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/users/repair-missing-doctors`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      return await response.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async assignRoleToStaff(assignData: AssignRoleData): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(assignData),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async listFacilities(): Promise<{ success: boolean; facilities?: AdminFacility[]; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/facilities`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      return await response.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async getDoctorProfile(doctorId: number): Promise<{ success: boolean; profile?: DoctorProfile; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/doctors/${doctorId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      return await response.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async updateDoctorProfile(
    doctorId: number,
    profile: DoctorProfileData
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/admin/doctors/${doctorId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(profile),
      });
      return await response.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }
}

export const adminService = new AdminService();

