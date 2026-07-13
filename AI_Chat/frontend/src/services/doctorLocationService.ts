import { doctorService } from './doctorService';
import { demoDelay, DEFAULT_MAP_CENTER } from '../demo/demoConfig';
import {
  FIXTURE_GEO_DOCTORS,
  SYDNEY_LOCATIONS,
  haversineKm,
  type GeoDoctorFixture,
} from '../demo/fixtures/doctorsGeo';

export interface GeoDoctor extends GeoDoctorFixture {
  distanceKm?: number;
}

export interface DoctorSearchGeoParams {
  lat?: number;
  lng?: number;
  maxDistanceKm?: number;
  specialty?: string;
  insurance?: string;
  language?: string;
  minRating?: number;
  search?: string;
}

function enrichWithDistance(
  doctors: GeoDoctorFixture[],
  lat: number,
  lng: number
): GeoDoctor[] {
  return doctors.map((d) => ({
    ...d,
    distanceKm: Math.round(haversineKm(lat, lng, d.lat, d.lng) * 10) / 10,
  }));
}

function parseSydneyDoctorBio(bio?: string): {
  languages?: string[];
  insuranceAccepted?: string[];
  location_id?: string;
  suburb?: string;
} {
  if (!bio) return {};
  try {
    const parsed = JSON.parse(bio) as Record<string, unknown>;
    return {
      languages: Array.isArray(parsed.languages) ? (parsed.languages as string[]) : undefined,
      insuranceAccepted: Array.isArray(parsed.insuranceAccepted)
        ? (parsed.insuranceAccepted as string[])
        : undefined,
      location_id: typeof parsed.location_id === 'string' ? parsed.location_id : undefined,
      suburb: typeof parsed.suburb === 'string' ? parsed.suburb : undefined,
    };
  } catch {
    return {};
  }
}

function mergeRealDoctorsWithGeo(
  realDoctors: {
    doctor_id: number;
    first_name: string;
    last_name: string;
    specialty_name?: string;
    specialty?: { name: string };
    consultation_fee?: number;
    is_available?: boolean;
    qualification?: string;
    experience_years?: number;
    facility_name?: string;
    facility_address?: string;
    facility_city?: string;
    facility_lat?: number;
    facility_lng?: number;
    bio?: string;
  }[],
  lat: number,
  lng: number
): GeoDoctor[] {
  const fixtureById = new Map(FIXTURE_GEO_DOCTORS.map((d) => [d.doctor_id, d]));
  const merged: GeoDoctorFixture[] = realDoctors.map((d, i) => {
    const fixture = fixtureById.get(d.doctor_id);
    const meta = parseSydneyDoctorBio(d.bio);
    const loc = meta.location_id
      ? SYDNEY_LOCATIONS.find((l) => l.id === meta.location_id) ?? SYDNEY_LOCATIONS[i % SYDNEY_LOCATIONS.length]
      : SYDNEY_LOCATIONS[i % SYDNEY_LOCATIONS.length];
    const dbLat = d.facility_lat != null ? Number(d.facility_lat) : undefined;
    const dbLng = d.facility_lng != null ? Number(d.facility_lng) : undefined;
    return {
      doctor_id: d.doctor_id,
      first_name: d.first_name,
      last_name: d.last_name,
      specialty_name: d.specialty_name || d.specialty?.name || 'General Medicine',
      qualification: d.qualification || 'MBBS',
      experience_years: d.experience_years || 5,
      consultation_fee: d.consultation_fee || 85,
      is_available: d.is_available ?? true,
      lat: dbLat ?? fixture?.lat ?? loc.lat,
      lng: dbLng ?? fixture?.lng ?? loc.lng,
      location_id: meta.location_id ?? fixture?.location_id ?? loc.id,
      suburb: meta.suburb ?? fixture?.suburb ?? loc.suburb,
      rating: fixture?.rating ?? 4.5,
      reviewCount: fixture?.reviewCount ?? 50,
      languages: meta.languages ?? fixture?.languages ?? ['English'],
      insuranceAccepted: meta.insuranceAccepted ?? fixture?.insuranceAccepted ?? ['Medicare', 'Cash'],
      facility_name: d.facility_name || fixture?.facility_name || `${loc.suburb} Medical Centre`,
      facility_address: d.facility_address || fixture?.facility_address || loc.suburb,
      facility_city: d.facility_city || fixture?.facility_city || 'Sydney',
    };
  });

  const realIds = new Set(merged.map((d) => d.doctor_id));
  const extras = FIXTURE_GEO_DOCTORS.filter((d) => !realIds.has(d.doctor_id));
  return enrichWithDistance([...merged, ...extras], lat, lng);
}

class DoctorLocationService {
  async searchDoctorsGeo(
    params: DoctorSearchGeoParams = {}
  ): Promise<{ success: true; doctors: GeoDoctor[]; center: { lat: number; lng: number } }> {
    const lat = params.lat ?? DEFAULT_MAP_CENTER.lat;
    const lng = params.lng ?? DEFAULT_MAP_CENTER.lng;

    let doctors: GeoDoctor[];
    try {
      const result = await doctorService.searchDoctors({
        search: params.search,
        specialty_id: undefined,
      });
      if (result.success && result.doctors && result.doctors.length > 0) {
        doctors = mergeRealDoctorsWithGeo(result.doctors, lat, lng);
      } else {
        doctors = enrichWithDistance(FIXTURE_GEO_DOCTORS, lat, lng);
      }
    } catch {
      doctors = enrichWithDistance(FIXTURE_GEO_DOCTORS, lat, lng);
    }

    let filtered = doctors;
    if (params.specialty) {
      filtered = filtered.filter((d) =>
        d.specialty_name.toLowerCase().includes(params.specialty!.toLowerCase())
      );
    }
    if (params.insurance) {
      filtered = filtered.filter((d) => d.insuranceAccepted.includes(params.insurance!));
    }
    if (params.language) {
      filtered = filtered.filter((d) => d.languages.includes(params.language!));
    }
    if (params.minRating) {
      filtered = filtered.filter((d) => d.rating >= params.minRating!);
    }
    if (params.maxDistanceKm) {
      filtered = filtered.filter((d) => (d.distanceKm ?? 999) <= params.maxDistanceKm!);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          `${d.first_name} ${d.last_name}`.toLowerCase().includes(q) ||
          d.specialty_name.toLowerCase().includes(q) ||
          d.facility_name.toLowerCase().includes(q) ||
          d.suburb.toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    return demoDelay({ success: true as const, doctors: filtered, center: { lat, lng } });
  }
}

export const doctorLocationService = new DoctorLocationService();
