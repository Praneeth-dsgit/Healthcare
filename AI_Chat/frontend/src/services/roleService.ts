/**
 * Role Service
 * Handles user role detection and capability access control
 */

import { getApiBaseUrl } from '../utils/apiBase';

const API_BASE = getApiBaseUrl();

export type UserRole = 'patient' | 'doctor' | 'radiology' | 'lab_technician' | 'non_medical_staff' | 'admin' | null;

export type Capability = 'general' | 'radiology' | 'lab' | 'engagement';

// Extended role information
export interface RoleInfo {
  role: UserRole;
  doctor_id?: number;
  specialty_id?: number;
  specialty_name?: string;
  is_radiology_doctor?: boolean;
  patient_id?: string;
}

// Define which capabilities are accessible to which roles
// Note: Access is checked more granularly in hasAccess() method
export const CAPABILITY_ACCESS: Record<Capability, UserRole[]> = {
  general: ['doctor'],                    // General Practitioner Dashboard - Doctors only
  radiology: ['doctor', 'radiology'],     // Radiology - Doctors with radiology specialty or radiology role
  lab: ['lab_technician'],                // Lab - Lab technicians only
  engagement: ['non_medical_staff'],      // Patient Engagement - Non-medical staff only
};

// Admin has access to all capabilities (checked separately)

class RoleService {
  private cachedRole: UserRole | null = null;
  private cachedRoleInfo: RoleInfo | null = null;
  private roleCheckPromise: Promise<RoleInfo | null> | null = null;

  /**
   * Get the current user's role
   */
  async getUserRole(): Promise<UserRole> {
    const roleInfo = await this.getRoleInfo();
    return roleInfo?.role || null;
  }

  /**
   * Get detailed role information
   */
  async getRoleInfo(): Promise<RoleInfo | null> {
    // Return cached role info if available
    if (this.cachedRoleInfo !== null) {
      return this.cachedRoleInfo;
    }

    // If a role check is already in progress, return that promise
    if (this.roleCheckPromise) {
      return this.roleCheckPromise;
    }

    // Start a new role check
    this.roleCheckPromise = this.fetchUserRole();
    const roleInfo = await this.roleCheckPromise;
    this.roleCheckPromise = null;
    return roleInfo;
  }

  private async fetchUserRole(): Promise<RoleInfo | null> {
    try {
      const { getAccessToken, authenticatedFetch, getAuthHeaders } = await import('./authService');
      if (!getAccessToken()) {
        console.warn('No access token found');
        this.cachedRole = null;
        this.cachedRoleInfo = null;
        return null;
      }
      const response = await authenticatedFetch(`${API_BASE}/api/user-role`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error('Failed to fetch user role:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        // If 401 or 400, clear cache and return null
        if (response.status === 401 || response.status === 400) {
          this.cachedRole = null;
          this.cachedRoleInfo = null;
          return null;
        }
        
        // For other errors, also clear cache
        this.cachedRole = null;
        this.cachedRoleInfo = null;
        return null;
      }

      const data = await response.json();
      console.log('User role response:', data);
      
      if (data.success && data.role) {
        const roleInfo: RoleInfo = {
          role: data.role as UserRole,
          doctor_id: data.doctor_id,
          specialty_id: data.specialty_id,
          specialty_name: data.specialty_name,
          is_radiology_doctor: data.is_radiology_doctor || false,
          patient_id: data.patient_id,
        };
        
        this.cachedRole = roleInfo.role;
        this.cachedRoleInfo = roleInfo;
        console.log('Role detected:', roleInfo.role);
        return roleInfo;
      }

      console.warn('Role response missing success or role field:', data);
      this.cachedRole = null;
      this.cachedRoleInfo = null;
      return null;
    } catch (error) {
      console.error('Error fetching user role:', error);
      // Check if it's a network error vs other error
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('Network error - check if API server is running');
      }
      this.cachedRole = null;
      this.cachedRoleInfo = null;
      return null;
    }
  }

  /**
   * Check if a user has access to a specific capability
   */
  async hasAccess(capability: Capability): Promise<boolean> {
    const roleInfo = await this.getRoleInfo();
    if (!roleInfo || !roleInfo.role) {
      return false;
    }

    const role = roleInfo.role;

    // Admin has access to everything
    if (role === 'admin') {
      return true;
    }

    // Check access based on capability and role
    switch (capability) {
      case 'general':
        // General: Doctors only (any doctor)
        return role === 'doctor';
      
      case 'radiology':
        // Radiology: Doctors with radiology specialty or radiology role
        return (role === 'doctor' && roleInfo.is_radiology_doctor === true) || role === 'radiology';
      
      case 'lab':
        // Lab: Lab technicians only
        return role === 'lab_technician';
      
      case 'engagement':
        // Patient Engagement: Non-medical staff only
        return role === 'non_medical_staff';
      
      default:
        return false;
    }
  }

  /**
   * Check if user is admin
   */
  async isAdmin(): Promise<boolean> {
    const roleInfo = await this.getRoleInfo();
    return roleInfo?.role === 'admin';
  }

  /**
   * Get all accessible capabilities for the current user
   */
  async getAccessibleCapabilities(): Promise<Capability[]> {
    const role = await this.getUserRole();
    if (!role) {
      return [];
    }

    const capabilities: Capability[] = [];
    for (const [capability, allowedRoles] of Object.entries(CAPABILITY_ACCESS)) {
      if (allowedRoles.includes(role)) {
        capabilities.push(capability as Capability);
      }
    }

    return capabilities;
  }

  /**
   * Clear cached role (useful after logout or role change)
   */
  clearCache(): void {
    this.cachedRole = null;
    this.cachedRoleInfo = null;
    this.roleCheckPromise = null;
  }

  /**
   * Get cached role synchronously (may be null if not fetched yet)
   */
  getCachedRole(): UserRole | null {
    return this.cachedRole;
  }

  /**
   * Get cached role info synchronously (may be null if not fetched yet)
   */
  getCachedRoleInfo(): RoleInfo | null {
    return this.cachedRoleInfo;
  }

  /**
   * Get the default route path based on user role
   * This determines where to redirect users after login
   */
  async getDefaultRoute(): Promise<string> {
    const roleInfo = await this.getRoleInfo();
    if (!roleInfo || !roleInfo.role) {
      return '/login'; // Default to login if no role
    }

    const role = roleInfo.role;

    // Admin goes to admin dashboard
    if (role === 'admin') {
      return '/admin/dashboard';
    }

    // Patients go to patient portal
    if (role === 'patient') {
      return '/portal/dashboard';
    }

    // Doctors - check if radiology or general
    if (role === 'doctor') {
      if (roleInfo.is_radiology_doctor) {
        return '/app/radiology';
      } else {
        return '/app/general';
      }
    }

    // Radiology doctors go to radiology dashboard
    if (role === 'radiology') {
      return '/app/radiology';
    }

    // Lab technicians go to lab
    if (role === 'lab_technician') {
      return '/app/lab';
    }

    // Non-medical staff go to patient engagement
    if (role === 'non_medical_staff') {
      return '/app/engagement';
    }

    // Default fallback
    return '/login';
  }
}

export const roleService = new RoleService();

