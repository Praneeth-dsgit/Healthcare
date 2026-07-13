export interface SydneyLocation {
  id: string;
  name: string;
  suburb: string;
  state: string;
  lat: number;
  lng: number;
}

/** 10 Sydney, Australia areas for nearest-doctor suggestions. */
export const SYDNEY_LOCATIONS: SydneyLocation[] = [
  { id: 'sydney-cbd', name: 'Sydney CBD', suburb: 'Sydney', state: 'NSW', lat: -33.8688, lng: 151.2093 },
  { id: 'parramatta', name: 'Parramatta', suburb: 'Parramatta', state: 'NSW', lat: -33.815, lng: 151.0011 },
  { id: 'bondi', name: 'Bondi', suburb: 'Bondi', state: 'NSW', lat: -33.8915, lng: 151.2767 },
  { id: 'chatswood', name: 'Chatswood', suburb: 'Chatswood', state: 'NSW', lat: -33.7969, lng: 151.183 },
  { id: 'liverpool', name: 'Liverpool', suburb: 'Liverpool', state: 'NSW', lat: -33.92, lng: 150.923 },
  { id: 'manly', name: 'Manly', suburb: 'Manly', state: 'NSW', lat: -33.7963, lng: 151.2877 },
  { id: 'hurstville', name: 'Hurstville', suburb: 'Hurstville', state: 'NSW', lat: -33.9677, lng: 151.1026 },
  { id: 'penrith', name: 'Penrith', suburb: 'Penrith', state: 'NSW', lat: -33.7509, lng: 150.694 },
  { id: 'darlinghurst', name: 'Darlinghurst', suburb: 'Darlinghurst', state: 'NSW', lat: -33.8794, lng: 151.2193 },
  { id: 'campbelltown', name: 'Campbelltown', suburb: 'Campbelltown', state: 'NSW', lat: -34.065, lng: 150.814 },
];

export const DEFAULT_SYDNEY_LOCATION_ID = 'sydney-cbd';

export function getSydneyLocation(id: string): SydneyLocation {
  return SYDNEY_LOCATIONS.find((l) => l.id === id) ?? SYDNEY_LOCATIONS[0];
}

export interface GeoDoctorFixture {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty_name: string;
  qualification: string;
  experience_years: number;
  consultation_fee: number;
  is_available: boolean;
  lat: number;
  lng: number;
  location_id: string;
  suburb: string;
  rating: number;
  reviewCount: number;
  languages: string[];
  insuranceAccepted: string[];
  facility_name: string;
  facility_address: string;
  facility_city: string;
}

function doctorAtLocation(
  locationId: string,
  partial: Omit<GeoDoctorFixture, 'location_id' | 'suburb' | 'lat' | 'lng' | 'facility_city'>
): GeoDoctorFixture {
  const loc = getSydneyLocation(locationId);
  return {
    ...partial,
    location_id: loc.id,
    suburb: loc.suburb,
    lat: loc.lat,
    lng: loc.lng,
    facility_city: 'Sydney',
    facility_address: `${partial.facility_name}, ${loc.suburb}`,
  };
}

export const FIXTURE_GEO_DOCTORS: GeoDoctorFixture[] = [
  doctorAtLocation('sydney-cbd', {
    doctor_id: 101,
    first_name: 'Emily',
    last_name: 'Watson',
    specialty_name: 'General Medicine',
    qualification: 'MBBS, FRACGP',
    experience_years: 12,
    consultation_fee: 85,
    is_available: true,
    rating: 4.8,
    reviewCount: 214,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'Cash'],
    facility_name: 'Harbour Medical Centre',
  }),
  doctorAtLocation('parramatta', {
    doctor_id: 102,
    first_name: 'James',
    last_name: 'Chen',
    specialty_name: 'Cardiology',
    qualification: 'MBBS, FRACP',
    experience_years: 18,
    consultation_fee: 150,
    is_available: true,
    rating: 4.9,
    reviewCount: 389,
    languages: ['English', 'Mandarin'],
    insuranceAccepted: ['Medicare', 'Medibank', 'Cash'],
    facility_name: 'Westmead Heart Clinic',
  }),
  doctorAtLocation('bondi', {
    doctor_id: 103,
    first_name: 'Sophie',
    last_name: 'Nguyen',
    specialty_name: 'Pediatrics',
    qualification: 'MBBS, DCH',
    experience_years: 9,
    consultation_fee: 95,
    is_available: false,
    rating: 4.7,
    reviewCount: 156,
    languages: ['English', 'Vietnamese'],
    insuranceAccepted: ['Medicare', 'HCF', 'Cash'],
    facility_name: 'Bondi Kids Health',
  }),
  doctorAtLocation('chatswood', {
    doctor_id: 104,
    first_name: 'Michael',
    last_name: 'Patel',
    specialty_name: 'Orthopedics',
    qualification: 'MBBS, FRACS',
    experience_years: 15,
    consultation_fee: 180,
    is_available: true,
    rating: 4.6,
    reviewCount: 98,
    languages: ['English', 'Hindi'],
    insuranceAccepted: ['Medicare', 'Bupa', 'Cash'],
    facility_name: 'North Shore Ortho',
  }),
  doctorAtLocation('liverpool', {
    doctor_id: 105,
    first_name: 'Sarah',
    last_name: 'Okafor',
    specialty_name: 'Dermatology',
    qualification: 'MBBS, FACD',
    experience_years: 7,
    consultation_fee: 120,
    is_available: true,
    rating: 4.5,
    reviewCount: 72,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Medibank', 'Cash'],
    facility_name: 'South West Skin Clinic',
  }),
  doctorAtLocation('manly', {
    doctor_id: 106,
    first_name: 'David',
    last_name: 'Murphy',
    specialty_name: 'General Medicine',
    qualification: 'MBBS, FRACGP',
    experience_years: 20,
    consultation_fee: 90,
    is_available: true,
    rating: 4.8,
    reviewCount: 267,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'HCF'],
    facility_name: 'Manly Family Practice',
  }),
  doctorAtLocation('hurstville', {
    doctor_id: 107,
    first_name: 'Lisa',
    last_name: 'Zhang',
    specialty_name: 'Endocrinology',
    qualification: 'MBBS, FRACP',
    experience_years: 14,
    consultation_fee: 140,
    is_available: true,
    rating: 4.7,
    reviewCount: 131,
    languages: ['English', 'Mandarin', 'Cantonese'],
    insuranceAccepted: ['Medicare', 'Medibank', 'Cash'],
    facility_name: 'St George Diabetes Care',
  }),
  doctorAtLocation('penrith', {
    doctor_id: 108,
    first_name: 'Andrew',
    last_name: 'Taylor',
    specialty_name: 'Sports Medicine',
    qualification: 'MBBS, FACSP',
    experience_years: 11,
    consultation_fee: 110,
    is_available: true,
    rating: 4.6,
    reviewCount: 88,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'Cash'],
    facility_name: 'Penrith Active Health',
  }),
  doctorAtLocation('darlinghurst', {
    doctor_id: 109,
    first_name: 'Rachel',
    last_name: 'Kim',
    specialty_name: 'Mental Health',
    qualification: 'MBBS, FRANZCP',
    experience_years: 10,
    consultation_fee: 200,
    is_available: true,
    rating: 4.9,
    reviewCount: 195,
    languages: ['English', 'Korean'],
    insuranceAccepted: ['Medicare', 'Medibank', 'HCF'],
    facility_name: 'Inner City Mind Clinic',
  }),
  doctorAtLocation('campbelltown', {
    doctor_id: 110,
    first_name: 'Thomas',
    last_name: 'Baker',
    specialty_name: 'General Medicine',
    qualification: 'MBBS, FRACGP',
    experience_years: 16,
    consultation_fee: 80,
    is_available: true,
    rating: 4.5,
    reviewCount: 142,
    languages: ['English', 'Arabic'],
    insuranceAccepted: ['Medicare', 'HCF', 'Cash'],
    facility_name: 'Macarthur Medical Hub',
  }),
  doctorAtLocation('sydney-cbd', {
    doctor_id: 111,
    first_name: 'Charlotte',
    last_name: 'Mitchell',
    specialty_name: 'Ophthalmology',
    qualification: 'MBBS, FRANZCO',
    experience_years: 13,
    consultation_fee: 165,
    is_available: true,
    rating: 4.8,
    reviewCount: 178,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'Medibank'],
    facility_name: 'Circular Quay Eye Centre',
  }),
  doctorAtLocation('parramatta', {
    doctor_id: 112,
    first_name: 'Lachlan',
    last_name: "O'Brien",
    specialty_name: 'Gastroenterology',
    qualification: 'MBBS, FRACP',
    experience_years: 17,
    consultation_fee: 155,
    is_available: true,
    rating: 4.7,
    reviewCount: 203,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Medibank', 'Cash'],
    facility_name: 'Parramatta Digestive Health',
  }),
  doctorAtLocation('bondi', {
    doctor_id: 113,
    first_name: 'Matilda',
    last_name: 'Fraser',
    specialty_name: "Women's Health",
    qualification: 'MBBS, FRANZCOG',
    experience_years: 11,
    consultation_fee: 130,
    is_available: true,
    rating: 4.9,
    reviewCount: 241,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'HCF'],
    facility_name: "Bondi Women's Clinic",
  }),
  doctorAtLocation('chatswood', {
    doctor_id: 114,
    first_name: 'William',
    last_name: 'Hughes',
    specialty_name: 'Neurology',
    qualification: 'MBBS, FRACP',
    experience_years: 19,
    consultation_fee: 195,
    is_available: false,
    rating: 4.8,
    reviewCount: 312,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'Cash'],
    facility_name: 'North Shore Neurology',
  }),
  doctorAtLocation('liverpool', {
    doctor_id: 115,
    first_name: 'Cooper',
    last_name: 'Stevens',
    specialty_name: 'Urology',
    qualification: 'MBBS, FRACS',
    experience_years: 14,
    consultation_fee: 175,
    is_available: true,
    rating: 4.6,
    reviewCount: 119,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Medibank', 'HCF'],
    facility_name: 'South West Urology',
  }),
  doctorAtLocation('manly', {
    doctor_id: 116,
    first_name: 'Pippa',
    last_name: 'Collins',
    specialty_name: 'ENT',
    qualification: 'MBBS, FRACS',
    experience_years: 10,
    consultation_fee: 145,
    is_available: true,
    rating: 4.7,
    reviewCount: 94,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'Cash'],
    facility_name: 'Manly Ear Nose Throat',
  }),
  doctorAtLocation('hurstville', {
    doctor_id: 117,
    first_name: 'Angus',
    last_name: 'McKenzie',
    specialty_name: 'Rheumatology',
    qualification: 'MBBS, FRACP',
    experience_years: 16,
    consultation_fee: 160,
    is_available: true,
    rating: 4.5,
    reviewCount: 87,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'HCF', 'Cash'],
    facility_name: 'St George Rheumatology',
  }),
  doctorAtLocation('penrith', {
    doctor_id: 118,
    first_name: 'Holly',
    last_name: 'Robinson',
    specialty_name: 'Obstetrics',
    qualification: 'MBBS, FRANZCOG',
    experience_years: 12,
    consultation_fee: 135,
    is_available: true,
    rating: 4.8,
    reviewCount: 176,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'Medibank'],
    facility_name: 'Nepean Maternity Care',
  }),
  doctorAtLocation('darlinghurst', {
    doctor_id: 119,
    first_name: 'Finn',
    last_name: 'Campbell',
    specialty_name: 'Psychiatry',
    qualification: 'MBBS, FRANZCP',
    experience_years: 8,
    consultation_fee: 210,
    is_available: true,
    rating: 4.9,
    reviewCount: 164,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Medibank', 'HCF'],
    facility_name: 'Darlinghurst Psychiatry',
  }),
  doctorAtLocation('campbelltown', {
    doctor_id: 120,
    first_name: 'Sienna',
    last_name: 'Walker',
    specialty_name: 'Allergy & Immunology',
    qualification: 'MBBS, FRACP',
    experience_years: 9,
    consultation_fee: 125,
    is_available: true,
    rating: 4.6,
    reviewCount: 103,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'Cash'],
    facility_name: 'Macarthur Allergy Clinic',
  }),
  doctorAtLocation('sydney-cbd', {
    doctor_id: 121,
    first_name: 'Jack',
    last_name: 'Thompson',
    specialty_name: 'Pulmonology',
    qualification: 'MBBS, FRACP',
    experience_years: 15,
    consultation_fee: 170,
    is_available: true,
    rating: 4.7,
    reviewCount: 148,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Medibank', 'Cash'],
    facility_name: 'Martin Place Respiratory',
  }),
  doctorAtLocation('bondi', {
    doctor_id: 122,
    first_name: 'Ella',
    last_name: 'Martin',
    specialty_name: 'Physiotherapy',
    qualification: 'BPhysio, APAM',
    experience_years: 7,
    consultation_fee: 95,
    is_available: true,
    rating: 4.8,
    reviewCount: 221,
    languages: ['English'],
    insuranceAccepted: ['Medicare', 'Bupa', 'HCF', 'Cash'],
    facility_name: 'Bondi Beach Physio',
  }),
];

export const INSURANCE_OPTIONS = ['Medicare', 'Bupa', 'Medibank', 'HCF', 'Cash'];
export const LANGUAGE_OPTIONS = ['English', 'Mandarin', 'Cantonese', 'Vietnamese', 'Arabic', 'Hindi', 'Korean'];

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
