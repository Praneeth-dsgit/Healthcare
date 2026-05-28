/**
 * Facility Service - API calls for healthcare facility search
 */

import { getApiRoot } from '../utils/apiBase';

const API_BASE = getApiRoot();

export interface Facility {
  facility_id: number;
  name: string;
  type: 'hospital' | 'clinic' | 'diagnostic_center' | 'pharmacy' | 'other';
  address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  phone?: string;
  email?: string;
  website?: string;
  is_active: boolean;
  services?: string[];
  operating_hours?: string;
}

class FacilityService {
  async searchFacilities(params: {
    type?: string;
    city?: string;
    search?: string;
  }): Promise<{ success: boolean; facilities?: Facility[]; error?: string }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.type) queryParams.append('type', params.type);
      if (params.city) queryParams.append('city', params.city);
      if (params.search) queryParams.append('search', params.search);

      const response = await fetch(`${API_BASE}/facilities/search?${queryParams}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getFacility(facilityId: number): Promise<{ success: boolean; facility?: Facility; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/facilities/${facilityId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }
}

export const facilityService = new FacilityService();

