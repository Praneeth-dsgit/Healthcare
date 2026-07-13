/** Demo feature flag — defaults to enabled for client demos. */
export const DEMO_FEATURES_ENABLED =
  import.meta.env.VITE_DEMO_FEATURES !== 'false';

export const DEMO_DELAY_MS = 300;

import { DEFAULT_SYDNEY_LOCATION_ID, getSydneyLocation } from './fixtures/doctorsGeo';

export const DEFAULT_MAP_CENTER = (() => {
  const loc = getSydneyLocation(DEFAULT_SYDNEY_LOCATION_ID);
  return { lat: loc.lat, lng: loc.lng };
})(); // Sydney CBD

export function demoDelay<T>(value: T, ms = DEMO_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
