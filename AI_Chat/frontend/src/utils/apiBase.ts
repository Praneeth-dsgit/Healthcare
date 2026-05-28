/**
 * Base URL for the backend API (no trailing slash).
 * - Production / preview: VITE_API_BASE_URL, or page hostname:5000.
 * - Dev: if VITE_API_BASE_URL is unset or points at localhost:5000, returns ""
 *   so requests use same origin (/api/...) and Vite proxies to Flask (see vite.config.ts).
 *   Set VITE_DEV_PROXY=0 to force direct URLs to env/hostname instead.
 * - LAN: opening http://192.168.x.x:5173 with .env pointing at localhost would otherwise
 *   call the wrong machine; the proxy fixes that.
 */
function isLocalBackendBase(url: string): boolean {
  const u = url.replace(/\/$/, '').toLowerCase();
  return u === 'http://localhost:5000' || u === 'http://127.0.0.1:5000';
}

export function getApiBaseUrl(): string {
  const envRaw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const trimmed = envRaw && String(envRaw).trim() ? String(envRaw).replace(/\/$/, '') : '';

  if (import.meta.env.DEV && import.meta.env.VITE_DEV_PROXY !== '0') {
    if (!trimmed || isLocalBackendBase(trimmed)) {
      return '';
    }
    return trimmed;
  }

  if (trimmed) {
    return trimmed;
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
}

/** Origin + `/api` for modules that call paths like `/appointments` under `/api`. */
export function getApiRoot(): string {
  const b = getApiBaseUrl();
  return b ? `${b}/api` : '/api';
}
