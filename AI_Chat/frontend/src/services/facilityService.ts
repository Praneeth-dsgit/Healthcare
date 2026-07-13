/**
 * Facility Service - API calls for healthcare facility search
 */

import { getApiRoot } from '../utils/apiBase';
import { demoDelay } from '../demo/demoConfig';
import {
  FIXTURE_PHARMACIES,
  enrichPharmaciesWithDistance,
  filterPharmaciesByLocation,
  type GeoPharmacy,
} from '../demo/fixtures/pharmaciesGeo';
import { getSydneyLocation, haversineKm } from '../demo/fixtures/doctorsGeo';

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
  lat?: number;
  lng?: number;
  distanceKm?: number;
}

export interface FacilitySearchGeoParams {
  lat: number;
  lng: number;
  locationId?: string;
  maxDistanceKm?: number;
  type?: string;
  search?: string;
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

  async searchFacilitiesGeo(
    params: FacilitySearchGeoParams
  ): Promise<{ success: boolean; facilities: Facility[] }> {
    const { lat, lng, locationId, maxDistanceKm, type, search } = params;
    let facilities: Facility[] = [];

    try {
      const result = await this.searchFacilities({
        type,
        search,
        city: locationId ? getSydneyLocation(locationId).suburb : undefined,
      });
      if (result.success && result.facilities?.length) {
        facilities = result.facilities.map((f, i) => {
          const fixture = FIXTURE_PHARMACIES.find((p) => p.facility_id === f.facility_id);
          const fLat = fixture?.lat ?? lat + (i % 7) * 0.01;
          const fLng = fixture?.lng ?? lng + (i % 5) * 0.01;
          return {
            ...f,
            lat: fLat,
            lng: fLng,
            distanceKm: Math.round(haversineKm(lat, lng, fLat, fLng) * 10) / 10,
          };
        });
      }
    } catch {
      /* fall through to fixtures */
    }

    if (facilities.length === 0 && !type) {
      const fallback = await this.searchFacilities({ search });
      if (fallback.success && fallback.facilities?.length) {
        facilities = fallback.facilities.map((f, i) => {
          const fLat = lat + (i % 7) * 0.008;
          const fLng = lng + (i % 5) * 0.008;
          return {
            ...f,
            lat: fLat,
            lng: fLng,
            distanceKm: Math.round(haversineKm(lat, lng, fLat, fLng) * 10) / 10,
          };
        });
      }
    }

    if (facilities.length === 0 && type === 'pharmacy') {
      const pharmacyFixtures = type === 'pharmacy' ? FIXTURE_PHARMACIES : [];
      const genericFixtures: Facility[] = pharmacyFixtures.map((p) => ({
        facility_id: p.facility_id,
        name: p.name,
        type: 'pharmacy' as const,
        address: p.address,
        city: p.city,
        state: p.state,
        zip_code: p.zip_code,
        country: 'Australia',
        phone: p.phone,
        is_active: p.is_open,
        services: p.services,
        operating_hours: p.hours,
        lat: p.lat,
        lng: p.lng,
      }));
      facilities = enrichPharmaciesWithDistance(
        genericFixtures.map((f) => ({
          facility_id: f.facility_id,
          name: f.name,
          address: f.address,
          suburb: f.city,
          city: f.city,
          state: f.state,
          zip_code: f.zip_code,
          phone: f.phone || '',
          lat: f.lat!,
          lng: f.lng!,
          location_id: locationId || 'sydney-cbd',
          is_open: f.is_active,
          hours: f.operating_hours || '',
          services: f.services || [],
        })),
        lat,
        lng
      ).map((p) => ({
        facility_id: p.facility_id,
        name: p.name,
        type: 'pharmacy' as const,
        address: p.address,
        city: p.suburb,
        state: p.state,
        zip_code: p.zip_code,
        country: 'Australia',
        phone: p.phone,
        is_active: p.is_open,
        services: p.services,
        operating_hours: p.hours,
        lat: p.lat,
        lng: p.lng,
        distanceKm: p.distanceKm,
      }));
    }

    if (maxDistanceKm) {
      facilities = facilities.filter((f) => (f.distanceKm ?? 999) <= maxDistanceKm);
    }
    if (search) {
      const q = search.toLowerCase();
      facilities = facilities.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.address.toLowerCase().includes(q) ||
          f.city.toLowerCase().includes(q)
      );
    }

    facilities.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    return demoDelay({ success: true, facilities });
  }

  async searchPharmaciesGeo(params: {
    lat: number;
    lng: number;
    locationId?: string;
    maxDistanceKm?: number;
    search?: string;
  }): Promise<{ success: boolean; pharmacies: GeoPharmacy[] }> {
    const { lat, lng, locationId, maxDistanceKm, search } = params;
    let pharmacies = enrichPharmaciesWithDistance(FIXTURE_PHARMACIES, lat, lng);

    if (locationId) {
      const loc = getSydneyLocation(locationId);
      pharmacies = filterPharmaciesByLocation(pharmacies, loc, maxDistanceKm);
    } else if (maxDistanceKm) {
      pharmacies = pharmacies.filter((p) => (p.distanceKm ?? 999) <= maxDistanceKm);
    }

    if (search) {
      const q = search.toLowerCase();
      pharmacies = pharmacies.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          p.suburb.toLowerCase().includes(q)
      );
    }

    return demoDelay({ success: true, pharmacies });
  }
}

export const facilityService = new FacilityService();

