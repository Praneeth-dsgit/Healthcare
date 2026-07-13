/**
 * Doctors Component - Search and browse doctors by specialty/department
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Stethoscope,
  MapPin,
  Clock,
  DollarSign,
  User,
  Calendar,
  ChevronDown,
  ChevronUp,
  Filter,
  List,
  Navigation,
  Star,
  Languages,
  Shield,
} from 'lucide-react';
import { doctorService, Doctor, Specialty } from '../../services/doctorService';
import { doctorLocationService, type GeoDoctor } from '../../services/doctorLocationService';
import { INSURANCE_OPTIONS, LANGUAGE_OPTIONS } from '../../demo/fixtures/doctorsGeo';
import { useLocationContext } from '../../context/LocationContext';
import SegmentTabs from '../ui/SegmentTabs';
import {
  PortalPageShell,
  PortalPageHero,
  portalInputClass,
} from './portalPageLayout';

function getDepartmentName(doctor: Doctor): string {
  const name = doctor.specialty?.name || doctor.specialty_name || '';
  return name.trim() || 'General & other';
}

function compareDoctorsByName(a: Doctor, b: Doctor): number {
  const last = a.last_name.localeCompare(b.last_name, undefined, { sensitivity: 'base' });
  if (last !== 0) return last;
  return a.first_name.localeCompare(b.first_name, undefined, { sensitivity: 'base' });
}

function geoDoctorToDoctor(geo: GeoDoctor): Doctor {
  return {
    doctor_id: geo.doctor_id,
    specialty_id: 0,
    first_name: geo.first_name,
    last_name: geo.last_name,
    qualification: geo.qualification,
    experience_years: geo.experience_years,
    consultation_fee: geo.consultation_fee,
    is_available: geo.is_available,
    is_active: true,
    specialty_name: geo.specialty_name,
    facility_name: geo.facility_name,
    facility_city: geo.facility_city,
  };
}

interface GeoDoctorCardProps {
  doctor: GeoDoctor;
  onBook: (doctor: GeoDoctor) => void;
}

const GeoDoctorCard: React.FC<GeoDoctorCardProps & { rank?: number }> = ({ doctor, onBook, rank }) => (
  <article className="premium-card flex h-full flex-col p-5 transition-all hover:ring-1 hover:ring-teal-500/30">
    {(rank != null && rank <= 3) || doctor.is_available ? (
      <div className="mb-3 flex items-center justify-between gap-2">
        {rank != null && rank <= 3 ? (
          <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-300">
            #{rank} nearest
          </span>
        ) : (
          <span aria-hidden className="shrink-0" />
        )}
        {doctor.is_available ? (
          <span className="ml-auto shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            Available
          </span>
        ) : null}
      </div>
    ) : null}
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/15">
          <User className="h-6 w-6 text-teal-300" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-100">
            Dr. {doctor.first_name} {doctor.last_name}
          </h3>
          <p className="text-sm text-slate-400">{doctor.specialty_name}</p>
        </div>
      </div>
      <div className="mb-4 space-y-2 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            {doctor.rating} ({doctor.reviewCount} reviews)
          </span>
        </div>
        {doctor.distanceKm != null && (
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 shrink-0 text-teal-400" />
            <span>{doctor.distanceKm} km away</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-teal-400" />
          <span>
            <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-semibold text-teal-300">
              {doctor.suburb}
            </span>
            <span className="ml-1.5 text-slate-400">{doctor.facility_name}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 shrink-0 text-slate-500" />
          <span>A${doctor.consultation_fee}</span>
        </div>
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 shrink-0 text-slate-500" />
          <span>{doctor.languages.join(', ')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">{doctor.insuranceAccepted.join(', ')}</span>
        </div>
      </div>
    </div>
    <button
      type="button"
      onClick={() => onBook(doctor)}
      className="portal-accent-button mt-auto flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
    >
      <Calendar className="h-4 w-4" />
      Book {doctor.is_available ? 'Appointment' : 'Anyway'}
    </button>
  </article>
);

interface DoctorCardProps {
  doctor: Doctor;
  onBook: (doctor: Doctor) => void;
}

const DoctorCard: React.FC<DoctorCardProps> = ({ doctor, onBook }) => (
  <article className="premium-card flex h-full flex-col p-5 transition-all hover:ring-1 hover:ring-teal-500/30">
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/15">
            <User className="h-6 w-6 text-teal-300" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100">
              Dr. {doctor.first_name} {doctor.last_name}
            </h3>
            <p className="text-sm text-slate-400">{getDepartmentName(doctor)}</p>
          </div>
        </div>
        {doctor.is_available && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            Available
          </span>
        )}
      </div>
      <div className="mb-4 space-y-2 text-sm text-slate-400">
        {doctor.qualification && (
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 shrink-0 text-slate-500" />
            <span>{doctor.qualification}</span>
          </div>
        )}
        {doctor.experience_years != null && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-slate-500" />
            <span>{doctor.experience_years} years experience</span>
          </div>
        )}
        {doctor.facility_name && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
            <span>{doctor.facility_name}</span>
          </div>
        )}
        {doctor.consultation_fee != null && (
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 shrink-0 text-slate-500" />
            <span>₹{doctor.consultation_fee}</span>
          </div>
        )}
      </div>
      {doctor.bio && <p className="mb-4 line-clamp-2 text-sm text-slate-500">{doctor.bio}</p>}
    </div>
    <button
      type="button"
      onClick={() => onBook(doctor)}
      className="portal-accent-button mt-auto flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
    >
      <Calendar className="h-4 w-4" />
      Book Appointment
    </button>
  </article>
);

interface DepartmentGroup {
  department: string;
  doctors: Doctor[];
}

interface DepartmentSectionHeaderProps {
  department: string;
  doctorCount: number;
  departments: DepartmentGroup[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onJumpTo: (department: string) => void;
}

const DepartmentSectionHeader: React.FC<DepartmentSectionHeaderProps> = ({
  department,
  doctorCount,
  departments,
  isOpen,
  onToggle,
  onClose,
  onJumpTo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="group flex items-center gap-2 rounded-lg px-1 py-0.5 text-left text-sm font-bold uppercase tracking-wide text-teal-300 transition-colors hover:text-teal-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Jump to another department"
      >
        <Stethoscope className="h-4 w-4" />
        {department}
        <ChevronDown
          className={`h-4 w-4 text-teal-400/80 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div
          role="listbox"
          aria-label="Jump to department"
          className="absolute left-0 top-full z-30 mt-1 min-w-[14rem] max-w-xs rounded-lg border border-slate-700/80 bg-slate-900 py-1 shadow-xl ring-1 ring-black/20"
        >
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Jump to department
          </p>
          <ul className="max-h-52 overflow-y-auto">
            {departments.map(({ department: dept, doctors: deptDoctors }) => (
              <li key={dept}>
                <button
                  type="button"
                  role="option"
                  aria-selected={dept === department}
                  onClick={() => onJumpTo(dept)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-teal-500/10 hover:text-teal-200 ${
                    dept === department ? 'bg-teal-500/15 font-semibold text-teal-200' : 'text-slate-200'
                  }`}
                >
                  <span className="truncate">{dept}</span>
                  <span className="shrink-0 text-xs text-slate-500">{deptDoctors.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <span className="ml-3 rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
        {doctorCount} doctor{doctorCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
};

const Doctors: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { coords, location: selectedSydneyLocation, locationId } = useLocationContext();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [geoDoctors, setGeoDoctors] = useState<GeoDoctor[]>([]);
  const [viewMode, setViewMode] = useState<'browse' | 'near'>(
    searchParams.get('near') === '1' ? 'near' : 'browse'
  );
  const [maxDistance, setMaxDistance] = useState<number | undefined>(undefined);
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [geoLoading, setGeoLoading] = useState(false);
  const [nearFiltersOpen, setNearFiltersOpen] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<number | null>(null);
  const [selectedSpecialtyName, setSelectedSpecialtyName] = useState('');
  const [browseDistanceMap, setBrowseDistanceMap] = useState<Map<number, number>>(new Map());
  const [openDeptNav, setOpenDeptNav] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (searchParams.get('near') === '1') {
      setViewMode('near');
    }
  }, [searchParams]);

  useEffect(() => {
    if (viewMode === 'near') {
      loadNearbyDoctors();
    }
  }, [viewMode, maxDistance, insuranceFilter, languageFilter, minRating, selectedSpecialtyName, coords, locationId]);

  useEffect(() => {
    if (viewMode !== 'browse') return;
    void doctorLocationService
      .searchDoctorsGeo({ lat: coords.lat, lng: coords.lng, maxDistanceKm: 50 })
      .then((r) => {
        const map = new Map<number, number>();
        r.doctors.forEach((d) => map.set(d.doctor_id, d.distanceKm ?? 999));
        setBrowseDistanceMap(map);
      });
  }, [viewMode, coords, locationId]);

  const loadNearbyDoctors = async () => {
    setGeoLoading(true);
    try {
      const result = await doctorLocationService.searchDoctorsGeo({
        lat: coords.lat,
        lng: coords.lng,
        maxDistanceKm: maxDistance,
        insurance: insuranceFilter || undefined,
        language: languageFilter || undefined,
        minRating,
        search: searchTerm || undefined,
        specialty: selectedSpecialtyName || undefined,
      });
      setGeoDoctors(result.doctors);
    } finally {
      setGeoLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    handleSearch();
  }, [selectedSpecialty]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [doctorsResult, specialtiesResult] = await Promise.all([
        doctorService.searchDoctors({}),
        doctorService.getSpecialties(),
      ]);

      if (doctorsResult.success) {
        setDoctors(doctorsResult.doctors || []);
      }
      if (specialtiesResult.success) {
        setSpecialties(specialtiesResult.specialties || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (viewMode === 'near') {
      await loadNearbyDoctors();
      return;
    }
    setLoading(true);
    try {
      const result = await doctorService.searchDoctors({
        search: searchTerm || undefined,
        specialty_id: selectedSpecialty || undefined,
      });
      if (result.success) {
        setDoctors(result.doctors || []);
      }
    } catch (error) {
      console.error('Error searching doctors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = (doctor: Doctor) => {
    navigate('/portal/appointments/book', {
      state: { doctorId: doctor.doctor_id, preselectedDoctor: doctor },
    });
  };

  const handleBookGeoDoctor = (doctor: GeoDoctor) => {
    navigate('/portal/appointments/book', {
      state: {
        doctorId: doctor.doctor_id,
        preselectedDoctor: geoDoctorToDoctor(doctor),
      },
    });
  };

  const handleSpecialtyChange = (specialtyId: number | null) => {
    setSelectedSpecialty(specialtyId);
    const spec = specialties.find((s) => s.specialty_id === specialtyId);
    setSelectedSpecialtyName(spec?.name || '');
  };

  const doctorsByDepartment = useMemo(() => {
    const locationFiltered =
      browseDistanceMap.size > 0
        ? doctors.filter((d) => browseDistanceMap.has(d.doctor_id))
        : doctors;
    const groups = new Map<string, Doctor[]>();
    for (const doctor of locationFiltered) {
      const department = getDepartmentName(doctor);
      const list = groups.get(department) ?? [];
      list.push(doctor);
      groups.set(department, list);
    }
    return Array.from(groups.entries())
      .sort(([deptA], [deptB]) => deptA.localeCompare(deptB, undefined, { sensitivity: 'base' }))
      .map(([department, deptDoctors]) => ({
        department,
        doctors: [...deptDoctors].sort((a, b) => {
          const distA = browseDistanceMap.get(a.doctor_id) ?? 999;
          const distB = browseDistanceMap.get(b.doctor_id) ?? 999;
          if (distA !== distB) return distA - distB;
          return compareDoctorsByName(a, b);
        }),
      }));
  }, [doctors, browseDistanceMap]);

  const scrollToDepartment = useCallback((department: string) => {
    sectionRefs.current[department]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setOpenDeptNav(null);
  }, []);

  const activeNearFilterCount = useMemo(() => {
    let count = 0;
    if (maxDistance) count += 1;
    if (insuranceFilter) count += 1;
    if (languageFilter) count += 1;
    if (minRating) count += 1;
    return count;
  }, [maxDistance, insuranceFilter, languageFilter, minRating]);

  const nearFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (maxDistance) parts.push(`≤${maxDistance} km`);
    if (insuranceFilter) parts.push(insuranceFilter);
    if (languageFilter) parts.push(languageFilter);
    if (minRating) parts.push(`${minRating}+★`);
    return parts.length ? parts.join(' · ') : 'No filters applied';
  }, [maxDistance, insuranceFilter, languageFilter, minRating]);

  const clearNearFilters = () => {
    setMaxDistance(undefined);
    setInsuranceFilter('');
    setLanguageFilter('');
    setMinRating(undefined);
  };

  useEffect(() => {
    if (!openDeptNav) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDeptNav(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openDeptNav]);

  return (
    <PortalPageShell>
      <PortalPageHero
        eyebrow={
          <span className="flex items-center gap-2">
            Care network
          </span>
        }
        title="Find Doctors"
        subtitle={
          viewMode === 'near'
            ? `Doctors nearest to ${selectedSydneyLocation.name}, Sydney NSW`
            : `Browse doctors within 50 km of ${selectedSydneyLocation.name}, Sydney NSW`
        }
        icon={<Stethoscope />}
        badges={
          <span className="rounded-full bg-teal-500/15 px-3 py-1 text-sm font-bold text-teal-200">
            {viewMode === 'near' ? geoDoctors.length : doctors.length} doctor
            {(viewMode === 'near' ? geoDoctors.length : doctors.length) !== 1 ? 's' : ''}{' '}
            {viewMode === 'near' ? 'near you' : 'found'}
          </span>
        }
        actions={
          <div className="flex w-full min-w-0 flex-col gap-2 sm:min-w-[18rem] lg:min-w-[20rem] xl:min-w-[32rem] xl:flex-row xl:items-center xl:flex-wrap">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className={`${portalInputClass} py-2 pl-9 text-sm`}
              />
            </div>
            <select
              value={selectedSpecialty || ''}
              onChange={(e) =>
                handleSpecialtyChange(e.target.value ? parseInt(e.target.value, 10) : null)
              }
              className={`${portalInputClass} w-full shrink-0 py-2 text-sm xl:w-44`}
            >
              <option value="">All specialties</option>
              {specialties.map((specialty) => (
                <option key={specialty.specialty_id} value={specialty.specialty_id}>
                  {specialty.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSearch}
              className="portal-accent-button shrink-0 rounded-lg px-5 py-2 text-sm font-bold whitespace-nowrap"
            >
              Search
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentTabs
          tabs={[
            { id: 'browse', label: 'Browse all', icon: List },
            { id: 'near', label: 'Nearest to you', icon: Navigation },
          ]}
          activeTab={viewMode}
          onChange={(id) => {
            const mode = id as 'browse' | 'near';
            setViewMode(mode);
          }}
        />

        {viewMode === 'near' && (
          <div className="relative ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setNearFiltersOpen((open) => !open)}
              className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 text-left transition-colors hover:bg-slate-800/60"
              aria-expanded={nearFiltersOpen}
            >
              <Filter className="h-3.5 w-3.5 shrink-0 text-teal-400" />
              <span className="text-xs font-bold text-slate-200">Filters</span>
              {activeNearFilterCount > 0 && (
                <span className="rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-300">
                  {activeNearFilterCount}
                </span>
              )}
              {!nearFiltersOpen && (
                <span className="hidden max-w-[10rem] truncate text-[11px] text-slate-500 sm:inline">
                  {nearFilterSummary}
                </span>
              )}
              {nearFiltersOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              )}
            </button>

            {nearFiltersOpen && (
              <div className="premium-card absolute right-0 top-full z-20 mt-2 w-[min(calc(100vw-2rem),22rem)] overflow-hidden shadow-xl sm:w-80">
                <div className="px-3 pb-3 pt-2 sm:px-4">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Distance
                      </label>
                      <select
                        value={maxDistance ?? ''}
                        onChange={(e) => setMaxDistance(e.target.value ? Number(e.target.value) : undefined)}
                        className={`${portalInputClass} w-full py-1.5 text-xs`}
                      >
                        <option value="">Any</option>
                        <option value="5">≤ 5 km</option>
                        <option value="10">≤ 10 km</option>
                        <option value="25">≤ 25 km</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Insurance
                      </label>
                      <select
                        value={insuranceFilter}
                        onChange={(e) => setInsuranceFilter(e.target.value)}
                        className={`${portalInputClass} w-full py-1.5 text-xs`}
                      >
                        <option value="">All</option>
                        {INSURANCE_OPTIONS.map((i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Language
                      </label>
                      <select
                        value={languageFilter}
                        onChange={(e) => setLanguageFilter(e.target.value)}
                        className={`${portalInputClass} w-full py-1.5 text-xs`}
                      >
                        <option value="">All</option>
                        {LANGUAGE_OPTIONS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Rating
                      </label>
                      <select
                        value={minRating ?? ''}
                        onChange={(e) => setMinRating(e.target.value ? Number(e.target.value) : undefined)}
                        className={`${portalInputClass} w-full py-1.5 text-xs`}
                      >
                        <option value="">Any</option>
                        <option value="4.5">4.5+</option>
                        <option value="4">4+</option>
                      </select>
                    </div>
                  </div>
                  {activeNearFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearNearFilters}
                      className="mt-2 text-[11px] font-semibold text-slate-500 hover:text-teal-300"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {viewMode === 'near' ? (
        geoLoading ? (
          <div className="premium-card py-16 text-center">
            <div className="healthcare-loading mx-auto mb-3" />
            <p className="text-slate-400">Finding doctors near you…</p>
          </div>
        ) : geoDoctors.length === 0 ? (
          <div className="premium-card p-12 text-center">
            <Navigation className="mx-auto mb-4 h-12 w-12 text-slate-600" />
            <h3 className="text-lg font-bold text-slate-200">No nearby doctors match your filters</h3>
            <p className="mt-1 text-sm text-slate-500">Try widening the distance or clearing filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Suggested doctors sorted by distance from {selectedSydneyLocation.name}, Sydney.
            </p>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {geoDoctors.map((doctor, index) => (
                <GeoDoctorCard
                  key={doctor.doctor_id}
                  doctor={doctor}
                  onBook={handleBookGeoDoctor}
                  rank={index + 1}
                />
              ))}
            </div>
          </div>
        )
      ) : loading ? (
        <div className="premium-card py-16 text-center">
          <div className="healthcare-loading mx-auto mb-3" />
          <p className="text-slate-400">Loading doctors…</p>
        </div>
      ) : doctors.length === 0 ? (
        <div className="premium-card p-12 text-center">
          <Stethoscope className="mx-auto mb-4 h-12 w-12 text-slate-600" />
          <h3 className="text-lg font-bold text-slate-200">No doctors found</h3>
          <p className="mt-1 text-sm text-slate-500">Try adjusting your search criteria</p>
        </div>
      ) : (
        <div className="space-y-8">
          {doctorsByDepartment.map(({ department, doctors: deptDoctors }) => (
            <section
              key={department}
              ref={(el) => {
                sectionRefs.current[department] = el;
              }}
              className="scroll-mt-24"
            >
              <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-700/60 pb-3">
                <DepartmentSectionHeader
                  department={department}
                  doctorCount={deptDoctors.length}
                  departments={doctorsByDepartment}
                  isOpen={openDeptNav === department}
                  onToggle={() =>
                    setOpenDeptNav((current) => (current === department ? null : department))
                  }
                  onClose={() => setOpenDeptNav(null)}
                  onJumpTo={scrollToDepartment}
                />
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {deptDoctors.map((doctor) => (
                  <DoctorCard
                    key={doctor.doctor_id}
                    doctor={doctor}
                    onBook={handleBookAppointment}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PortalPageShell>
  );
};

export default Doctors;

