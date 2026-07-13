/**
 * Pharmacies — find nearby pharmacies with Sydney location filtering
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Phone,
  Clock,
  Navigation,
  Pill,
  Filter,
} from 'lucide-react';
import { facilityService } from '../../services/facilityService';
import type { GeoPharmacy } from '../../demo/fixtures/pharmaciesGeo';
import { useLocationContext } from '../../context/LocationContext';
import SydneyLocationSelector from '../ui/SydneyLocationSelector';
import {
  PortalPageShell,
  PortalPageHero,
  portalInputClass,
} from './portalPageLayout';

const Pharmacies: React.FC = () => {
  const navigate = useNavigate();
  const { coords, location: selectedLocation, locationId } = useLocationContext();
  const [pharmacies, setPharmacies] = useState<GeoPharmacy[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [maxDistance, setMaxDistance] = useState<number | undefined>(15);

  const loadPharmacies = useCallback(async () => {
    setLoading(true);
    try {
      const result = await facilityService.searchPharmaciesGeo({
        lat: coords.lat,
        lng: coords.lng,
        locationId,
        maxDistanceKm: maxDistance,
        search: searchTerm || undefined,
      });
      setPharmacies(result.pharmacies);
    } finally {
      setLoading(false);
    }
  }, [coords.lat, coords.lng, locationId, maxDistance, searchTerm]);

  useEffect(() => {
    void loadPharmacies();
  }, [loadPharmacies]);

  const handleSearch = () => {
    void loadPharmacies();
  };

  return (
    <PortalPageShell>
      <PortalPageHero
        eyebrow="Care network"
        title="Find Pharmacies"
        subtitle={`Pharmacies near ${selectedLocation.name}, Sydney NSW — sorted by distance`}
        icon={<Pill />}
        badges={
          <span className="rounded-full bg-teal-500/15 px-3 py-1 text-sm font-bold text-teal-200">
            {pharmacies.length} pharmac{pharmacies.length !== 1 ? 'ies' : 'y'} nearby
          </span>
        }
        actions={
          <div className="flex w-full min-w-0 flex-col gap-2 sm:min-w-[18rem] lg:min-w-[20rem] xl:min-w-[32rem] xl:flex-row xl:items-center">
            <SydneyLocationSelector compact className="shrink-0" />
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search pharmacy name or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className={`${portalInputClass} py-2 pl-9 text-sm`}
              />
            </div>
            <select
              value={maxDistance ?? ''}
              onChange={(e) => setMaxDistance(e.target.value ? Number(e.target.value) : undefined)}
              className={`${portalInputClass} w-full shrink-0 py-2 text-sm xl:w-36`}
            >
              <option value="">Any distance</option>
              <option value="5">≤ 5 km</option>
              <option value="10">≤ 10 km</option>
              <option value="15">≤ 15 km</option>
              <option value="25">≤ 25 km</option>
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

      <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
        <Filter className="h-3.5 w-3.5 text-teal-400" />
        <span>
          Showing results for <strong className="text-slate-300">{selectedLocation.name}</strong>
          {maxDistance ? ` within ${maxDistance} km` : ''}
        </span>
      </div>

      {loading ? (
        <div className="premium-card py-16 text-center">
          <div className="healthcare-loading mx-auto mb-3" />
          <p className="text-slate-400">Finding pharmacies near you…</p>
        </div>
      ) : pharmacies.length === 0 ? (
        <div className="premium-card p-12 text-center">
          <Pill className="mx-auto mb-4 h-12 w-12 text-slate-600" />
          <h3 className="text-lg font-bold text-slate-200">No pharmacies found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try another Sydney area or widen the distance filter
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {pharmacies.map((pharmacy) => (
            <article
              key={pharmacy.facility_id}
              className="premium-card flex h-full flex-col p-5 transition-all hover:ring-1 hover:ring-teal-500/30"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
                  <Pill className="h-5 w-5 text-emerald-300" />
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    pharmacy.is_open
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-slate-500/15 text-slate-400'
                  }`}
                >
                  {pharmacy.is_open ? 'Open now' : 'Closed'}
                </span>
              </div>
              <h3 className="font-bold text-slate-100">{pharmacy.name}</h3>
              <div className="mt-3 flex-1 space-y-2 text-sm text-slate-400">
                {pharmacy.distanceKm != null && (
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 shrink-0 text-teal-400" />
                    <span>{pharmacy.distanceKm} km away</span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                  <span>
                    {pharmacy.address}, {pharmacy.suburb} {pharmacy.state} {pharmacy.zip_code}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-slate-500" />
                  <a href={`tel:${pharmacy.phone}`} className="hover:text-teal-300">
                    {pharmacy.phone}
                  </a>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <span>{pharmacy.hours}</span>
                </div>
              </div>
              {pharmacy.services.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {pharmacy.services.map((service) => (
                    <span
                      key={service}
                      className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-slate-400"
                    >
                      {service}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate('/portal/records')}
                className="portal-accent-button mt-4 w-full rounded-lg py-2.5 text-sm font-bold"
              >
                View e-prescriptions
              </button>
            </article>
          ))}
        </div>
      )}
    </PortalPageShell>
  );
};

export default Pharmacies;
