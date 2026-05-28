/**
 * JWT-based auth: access + refresh tokens in sessionStorage (per-tab).
 * No session cookies. Use Authorization: Bearer <accessToken> for API calls.
 */

import { getApiBaseUrl } from '../utils/apiBase';

const API_BASE = getApiBaseUrl();

const KEY_ACCESS = 'accessToken';
const KEY_REFRESH = 'refreshToken';
const KEY_EMAIL = 'userEmail';
const KEY_PATIENT_ID = 'patient_id';
const KEY_AUTH = 'isAuthenticated';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(KEY_ACCESS);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(KEY_REFRESH);
}

export function setTokens(accessToken: string, refreshToken: string, email: string, patientId?: string | null): void {
  sessionStorage.setItem(KEY_ACCESS, accessToken);
  sessionStorage.setItem(KEY_REFRESH, refreshToken);
  sessionStorage.setItem(KEY_EMAIL, email);
  sessionStorage.setItem(KEY_AUTH, 'true');
  if (patientId != null && patientId !== '') {
    sessionStorage.setItem(KEY_PATIENT_ID, patientId);
  } else {
    sessionStorage.removeItem(KEY_PATIENT_ID);
  }
}

export function clearAuth(): void {
  sessionStorage.removeItem(KEY_ACCESS);
  sessionStorage.removeItem(KEY_REFRESH);
  sessionStorage.removeItem(KEY_EMAIL);
  sessionStorage.removeItem(KEY_PATIENT_ID);
  sessionStorage.removeItem(KEY_AUTH);
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(KEY_AUTH) === 'true' && !!getAccessToken();
}

export function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Try to refresh the access token. Returns new access token or null on failure.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) {
        clearAuth();
        return null;
      }
      const data = await res.json();
      const newAccess = data.accessToken;
      if (newAccess) {
        sessionStorage.setItem(KEY_ACCESS, newAccess);
        return newAccess;
      }
      return null;
    } catch {
      clearAuth();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/**
 * Fetch with Authorization: Bearer and retry once after refresh on 401.
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Authorization')) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  // Don't set Content-Type for FormData - browser must set multipart boundary
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  let res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(url, { ...options, headers });
    }
  }
  return res;
}
