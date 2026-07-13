import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DEFAULT_SYDNEY_LOCATION_ID,
  getSydneyLocation,
  type SydneyLocation,
} from '../demo/fixtures/doctorsGeo';

const STORAGE_KEY = 'acufore_sydney_location_id';

interface LocationContextValue {
  locationId: string;
  location: SydneyLocation;
  coords: { lat: number; lng: number };
  setLocationId: (id: string) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locationId, setLocationIdState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_SYDNEY_LOCATION_ID;
    } catch {
      return DEFAULT_SYDNEY_LOCATION_ID;
    }
  });

  const setLocationId = useCallback((id: string) => {
    setLocationIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const location = useMemo(() => getSydneyLocation(locationId), [locationId]);
  const coords = useMemo(() => ({ lat: location.lat, lng: location.lng }), [location]);

  const value = useMemo(
    () => ({ locationId, location, coords, setLocationId }),
    [locationId, location, coords, setLocationId]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

export function useLocationContext(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocationContext must be used within LocationProvider');
  }
  return ctx;
}
