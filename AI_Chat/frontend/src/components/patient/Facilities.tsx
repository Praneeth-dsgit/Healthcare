/**
 * Facilities Component - Search facilities and find doctors in preferred facilities
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Clock,
  Stethoscope,
  Calendar,
  User,
  Scan,
  Navigation,
  ArrowLeft,
} from 'lucide-react';
import { facilityService, Facility } from '../../services/facilityService';
import { doctorService, Doctor } from '../../services/doctorService';
import { useLocationContext } from '../../context/LocationContext';
import {
  PortalPageShell,
  PortalPageHero,
  portalInputClass,
} from './portalPageLayout';

const Facilities: React.FC = () => {
  const navigate = useNavigate();
  const { coords, location: selectedLocation, locationId } = useLocationContext();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFacilityType, setSelectedFacilityType] = useState<string>('');
  const [selectedFacility, setSelectedFacility] = useState<number | null>(null);
  const [showDoctors, setShowDoctors] = useState(false);

  const [maxDistance, setMaxDistance] = useState<number | undefined>(25);

  const loadFacilities = useCallback(async () => {
    setLoading(true);
    try {
      const result = await facilityService.searchFacilitiesGeo({
        lat: coords.lat,
        lng: coords.lng,
        locationId,
        maxDistanceKm: maxDistance,
        type: selectedFacilityType || undefined,
        search: searchTerm || undefined,
      });
      if (result.success) {
        setFacilities(result.facilities || []);
      }
    } catch (error) {
      console.error('Error loading facilities:', error);
    } finally {
      setLoading(false);
    }
  }, [coords.lat, coords.lng, locationId, maxDistance, selectedFacilityType, searchTerm]);

  useEffect(() => {
    void loadFacilities();
  }, [loadFacilities]);

  useEffect(() => {
    if (selectedFacility) {
      void loadDoctorsForFacility(selectedFacility);
    } else {
      setDoctors([]);
      setShowDoctors(false);
    }
  }, [selectedFacility]);

  const handleSearch = () => {
    void loadFacilities();
  };

  const loadDoctorsForFacility = async (facilityId: number) => {
    setLoading(true);
    try {
      const result = await doctorService.searchDoctors({
        facility_id: facilityId,
      });
      if (result.success) {
        setDoctors(result.doctors || []);
        setShowDoctors(true);
      }
    } catch (error) {
      console.error('Error loading doctors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = (doctor: Doctor) => {
    navigate('/portal/appointments/book', { state: { doctorId: doctor.doctor_id } });
  };

  const handleFacilitySelect = (facilityId: number) => {
    setSelectedFacility(facilityId);
  };

  const handleBookRadiology = () => {
    navigate('/portal/radiology/book');
  };

  const handleBackToFacilities = () => {
    setShowDoctors(false);
    setSelectedFacility(null);
  };

  const selectedFacilityData = selectedFacility
    ? facilities.find((f) => f.facility_id === selectedFacility)
    : undefined;

  return (
    <PortalPageShell>
      <PortalPageHero
        eyebrow={
          showDoctors && selectedFacility ? (
            <button
              type="button"
              onClick={handleBackToFacilities}
              className="ghost-button -ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide text-teal-300 transition-colors hover:text-teal-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Facilities
            </button>
          ) : (
            'Locations'
          )
        }
        title={
          showDoctors && selectedFacilityData
            ? `Doctors at ${selectedFacilityData.name}`
            : 'Find Facilities'
        }
        subtitle={
          showDoctors && selectedFacility
            ? 'Browse doctors at this location and book an appointment.'
            : `Hospitals and clinics near ${selectedLocation.name}, Sydney NSW`
        }
        icon={<Building2 />}
        badges={
          showDoctors && selectedFacility ? (
            <span className="rounded-full bg-teal-500/15 px-3 py-1 text-sm font-bold text-teal-200">
              {doctors.length} doctor{doctors.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="rounded-full bg-teal-500/15 px-3 py-1 text-sm font-bold text-teal-200">
              {facilities.length} facilit{facilities.length !== 1 ? 'ies' : 'y'}
            </span>
          )
        }
        actions={
          !showDoctors ? (
            <div className="flex w-full min-w-0 flex-col gap-2 sm:min-w-[18rem] lg:min-w-[20rem] xl:min-w-[32rem] xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search name, city, address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className={`${portalInputClass} py-2 pl-9 text-sm`}
                />
              </div>
              <select
                value={maxDistance ?? ''}
                onChange={(e) => setMaxDistance(e.target.value ? Number(e.target.value) : undefined)}
                className={`${portalInputClass} w-full shrink-0 py-2 text-sm xl:w-32`}
              >
                <option value="">Any distance</option>
                <option value="10">≤ 10 km</option>
                <option value="25">≤ 25 km</option>
                <option value="50">≤ 50 km</option>
              </select>
              <select
                value={selectedFacilityType}
                onChange={(e) => setSelectedFacilityType(e.target.value)}
                className={`${portalInputClass} w-full shrink-0 py-2 text-sm xl:w-48`}
              >
                <option value="">All facility types</option>
                <option value="hospital">Hospitals</option>
                <option value="clinic">Clinics</option>
                <option value="diagnostic_center">Radiology / diagnostic</option>
                <option value="other">Other</option>
              </select>
              <button
                type="button"
                onClick={handleSearch}
                className="portal-accent-button shrink-0 rounded-lg px-5 py-2 text-sm font-bold whitespace-nowrap"
              >
                Search
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Results Section */}
      {loading && !showDoctors ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading facilities...</p>
        </div>
      ) : showDoctors && selectedFacility ? (
        <div>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading doctors...</p>
            </div>
          ) : doctors.length === 0 ? (
            <div className="premium-card hover:shadow-lg p-12 text-center transition-all duration-300">
              <Stethoscope className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No doctors found</h3>
              <p className="text-gray-600">No doctors are available at this facility</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {doctors.map((doctor) => (
                <div
                  key={doctor.doctor_id}
                  className="premium-card p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex flex-col h-full"
                >
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="text-blue-600" size={24} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            Dr. {doctor.first_name} {doctor.last_name}
                          </h3>
                          {(doctor.specialty?.name || (doctor as any).specialty_name) && (
                            <p className="text-sm text-gray-600">
                              {doctor.specialty?.name || (doctor as any).specialty_name}
                            </p>
                          )}
                        </div>
                      </div>
                      {doctor.is_available && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                          Available
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 mb-4">
                      {doctor.qualification && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Stethoscope size={16} className="text-gray-400" />
                          <span>{doctor.qualification}</span>
                        </div>
                      )}
                      {doctor.experience_years && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock size={16} className="text-gray-400" />
                          <span>{doctor.experience_years} years</span>
                        </div>
                      )}
                      {doctor.consultation_fee && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Fee:</span> ₹{doctor.consultation_fee}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleBookAppointment(doctor)}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-lg hover:scale-105 transition-all duration-200 font-medium flex items-center justify-center gap-2 mt-auto"
                  >
                    <Calendar size={18} />
                    Book Appointment
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : facilities.length === 0 ? (
        <div className="premium-card hover:shadow-lg p-12 text-center transition-all duration-300">
          <Building2 className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No facilities found</h3>
          <p className="text-gray-600">Try adjusting your search criteria</p>
        </div>
      ) : (
        /* Facilities List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {facilities.map((facility) => (
            <div
              key={facility.facility_id}
              className="premium-card p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex flex-col h-full"
            >
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      facility.type === 'diagnostic_center' 
                        ? 'bg-purple-100' 
                        : 'bg-blue-100'
                    }`}>
                      {facility.type === 'diagnostic_center' ? (
                        <Scan className="text-purple-600" size={24} />
                      ) : (
                        <Building2 className="text-blue-600" size={24} />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{facility.name}</h3>
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded mt-1 ${
                        facility.type === 'diagnostic_center' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {facility.type === 'diagnostic_center' ? 'RADIOLOGY CENTER' : facility.type.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {facility.is_active && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                      Active
                    </span>
                  )}
                </div>

                <div className="space-y-2 mb-4">
                  {facility.distanceKm != null && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Navigation size={16} className="text-teal-500" />
                      <span>{facility.distanceKm} km away</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <MapPin size={16} className="text-gray-400 mt-0.5" />
                    <span>{facility.address}, {facility.city}, {facility.state} {facility.zip_code}</span>
                  </div>
                  {facility.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone size={16} className="text-gray-400" />
                      <span>{facility.phone}</span>
                    </div>
                  )}
                  {facility.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail size={16} className="text-gray-400" />
                      <span>{facility.email}</span>
                    </div>
                  )}
                  {facility.website && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Globe size={16} className="text-gray-400" />
                      <a href={facility.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {facility.website}
                      </a>
                    </div>
                  )}
                </div>

                {facility.services && facility.services.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Services:</p>
                    <div className="flex flex-wrap gap-2">
                      {facility.services.map((service, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {facility.type === 'diagnostic_center' ? (
                <button
                  onClick={handleBookRadiology}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 hover:shadow-lg hover:scale-105 transition-all duration-200 font-medium flex items-center justify-center gap-2 mt-auto"
                >
                  <Scan size={18} />
                  Book Radiology Scan
                </button>
              ) : (
                <button
                  onClick={() => handleFacilitySelect(facility.facility_id)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-lg hover:scale-105 transition-all duration-200 font-medium flex items-center justify-center gap-2 mt-auto"
                >
                  <Stethoscope size={18} />
                  View Doctors at this Facility
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </PortalPageShell>
  );
};

export default Facilities;

