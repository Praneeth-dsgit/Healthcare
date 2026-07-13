import { getSydneyLocation, haversineKm, type SydneyLocation } from './doctorsGeo';

export interface PharmacyFixture {
  facility_id: number;
  name: string;
  address: string;
  suburb: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  lat: number;
  lng: number;
  location_id: string;
  is_open: boolean;
  hours: string;
  services: string[];
}

function pharmacyAt(
  locationId: string,
  partial: Omit<PharmacyFixture, 'suburb' | 'city' | 'state' | 'lat' | 'lng' | 'location_id'>
): PharmacyFixture {
  const loc = getSydneyLocation(locationId);
  return {
    ...partial,
    location_id: loc.id,
    suburb: loc.suburb,
    city: 'Sydney',
    state: 'NSW',
    lat: loc.lat + (partial.facility_id % 5) * 0.002,
    lng: loc.lng + (partial.facility_id % 3) * 0.002,
  };
}

export const FIXTURE_PHARMACIES: PharmacyFixture[] = [
  pharmacyAt('sydney-cbd', {
    facility_id: 501,
    name: 'CityCare Pharmacy',
    address: '88 George Street',
    zip_code: '2000',
    phone: '02 9251 4400',
    is_open: true,
    hours: 'Mon–Fri 7am–9pm, Sat–Sun 8am–8pm',
    services: ['Prescriptions', 'Vaccinations', 'Health checks'],
  }),
  pharmacyAt('parramatta', {
    facility_id: 502,
    name: 'Parramatta Chemist',
    address: '12 Church Street',
    zip_code: '2150',
    phone: '02 9635 2200',
    is_open: true,
    hours: 'Mon–Sun 8am–10pm',
    services: ['Prescriptions', 'Compounding', 'Delivery'],
  }),
  pharmacyAt('bondi', {
    facility_id: 503,
    name: 'Bondi Beach Pharmacy',
    address: '180 Campbell Parade',
    zip_code: '2026',
    phone: '02 9130 5500',
    is_open: true,
    hours: 'Mon–Sun 7:30am–9pm',
    services: ['Prescriptions', 'Travel health', 'Skin care'],
  }),
  pharmacyAt('chatswood', {
    facility_id: 504,
    name: 'Chatswood Wellness Pharmacy',
    address: '45 Victoria Avenue',
    zip_code: '2067',
    phone: '02 9411 3300',
    is_open: false,
    hours: 'Mon–Fri 8am–7pm, Sat 9am–5pm',
    services: ['Prescriptions', 'Diabetes care'],
  }),
  pharmacyAt('liverpool', {
    facility_id: 505,
    name: 'Liverpool Family Pharmacy',
    address: '3 Macquarie Street',
    zip_code: '2170',
    phone: '02 9821 7700',
    is_open: true,
    hours: 'Mon–Sun 8am–9pm',
    services: ['Prescriptions', 'Baby care', 'Delivery'],
  }),
  pharmacyAt('manly', {
    facility_id: 506,
    name: 'Manly Harbour Chemist',
    address: '22 The Corso',
    zip_code: '2095',
    phone: '02 9977 1200',
    is_open: true,
    hours: 'Mon–Sun 8am–8pm',
    services: ['Prescriptions', 'First aid'],
  }),
  pharmacyAt('hurstville', {
    facility_id: 507,
    name: 'Hurstville MedPlus Pharmacy',
    address: '9 Forest Road',
    zip_code: '2220',
    phone: '02 9580 6600',
    is_open: true,
    hours: 'Mon–Fri 8am–8pm, Sat–Sun 9am–6pm',
    services: ['Prescriptions', 'Chinese medicine consult'],
  }),
  pharmacyAt('darlinghurst', {
    facility_id: 508,
    name: 'Darlinghurst Late Night Pharmacy',
    address: '301 Oxford Street',
    zip_code: '2010',
    phone: '02 9331 4400',
    is_open: true,
    hours: '24 hours',
    services: ['Prescriptions', 'Emergency supply', 'Delivery'],
  }),
];

export interface GeoPharmacy extends PharmacyFixture {
  distanceKm?: number;
}

export function enrichPharmaciesWithDistance(
  pharmacies: PharmacyFixture[],
  lat: number,
  lng: number
): GeoPharmacy[] {
  return pharmacies
    .map((p) => ({
      ...p,
      distanceKm: Math.round(haversineKm(lat, lng, p.lat, p.lng) * 10) / 10,
    }))
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
}

export function filterPharmaciesByLocation(
  pharmacies: GeoPharmacy[],
  location: SydneyLocation,
  maxDistanceKm?: number
): GeoPharmacy[] {
  let filtered = pharmacies;
  if (maxDistanceKm) {
    filtered = filtered.filter((p) => (p.distanceKm ?? 999) <= maxDistanceKm);
  }
  return filtered;
}
