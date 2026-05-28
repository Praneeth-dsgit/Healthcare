import { Message } from '../types';

const STORAGE_KEY = 'medchat-messages';
const SESSIONS_KEY = 'medchat-sessions';
const CURRENT_SESSION_KEY = 'medchat-current-session';

// Get user-specific storage keys (optionally scoped by capability so radiology/lab/engagement/general have separate session lists)
function getUserEmail(): string {
  return typeof localStorage !== 'undefined' ? (localStorage.getItem('userEmail') || 'anonymous') : 'anonymous';
}

function getUserStorageKey(baseKey: string, capability?: string | null): string {
  const email = getUserEmail();
  const suffix = capability ? `_${capability}` : '';
  return `${email}_${baseKey}${suffix}`;
}

export function saveMessages(messages: Message[]): void {
  try {
    localStorage.setItem(getUserStorageKey(STORAGE_KEY), JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving messages to localStorage:', error);
  }
}

export function getInitialMessages(): Message[] {
  try {
    const saved = localStorage.getItem(getUserStorageKey(STORAGE_KEY));
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Error retrieving messages from localStorage:', error);
    return [];
  }
}

export function clearMessages(): void {
  try {
    localStorage.removeItem(getUserStorageKey(STORAGE_KEY));
  } catch (error) {
    console.error('Error clearing messages from localStorage:', error);
  }
}

/** Save sessions for a capability (e.g. 'radiology', 'lab'). Use same capability so radiology/lab have separate session lists. */
export function saveSessions(sessions: any[], capability?: string | null): void {
  try {
    localStorage.setItem(getUserStorageKey(SESSIONS_KEY, capability ?? undefined), JSON.stringify(sessions));
  } catch (error) {
    console.error('Error saving sessions to localStorage:', error);
  }
}

/** Get sessions for a capability. Radiology and lab each have their own list. */
export function getSessions(capability?: string | null): any[] {
  try {
    const saved = localStorage.getItem(getUserStorageKey(SESSIONS_KEY, capability ?? undefined));
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Error retrieving sessions from localStorage:', error);
    return [];
  }
}

export function setCurrentSessionId(sessionId: string, capability?: string | null): void {
  try {
    localStorage.setItem(getUserStorageKey(CURRENT_SESSION_KEY, capability ?? undefined), sessionId);
  } catch (error) {
    console.error('Error setting current session id:', error);
  }
}

export function getCurrentSessionId(capability?: string | null): string | null {
  try {
    return localStorage.getItem(getUserStorageKey(CURRENT_SESSION_KEY, capability ?? undefined));
  } catch (error) {
    console.error('Error getting current session id:', error);
    return null;
  }
}

export function removeSession(sessionId: string, capability?: string | null): void {
  try {
    const sessions = getSessions(capability);
    const filtered = sessions.filter((s: any) => s.id !== sessionId);
    saveSessions(filtered, capability);
  } catch (error) {
    console.error('Error removing session:', error);
  }
}

// Clear all user-specific data (for logout), including capability-specific session keys
export function clearUserData(): void {
  try {
    const userEmail = getUserEmail();
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${userEmail}_`)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error('Error clearing user data:', error);
  }
}