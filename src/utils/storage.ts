import { Message } from '../types';

const STORAGE_KEY = 'medchat-messages';
const SESSIONS_KEY = 'medchat-sessions';
const CURRENT_SESSION_KEY = 'medchat-current-session';

export function saveMessages(messages: Message[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving messages to localStorage:', error);
  }
}

export function getInitialMessages(): Message[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Error retrieving messages from localStorage:', error);
    return [];
  }
}

export function clearMessages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing messages from localStorage:', error);
  }
}

export function saveSessions(sessions: any[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error('Error saving sessions to localStorage:', error);
  }
}

export function getSessions(): any[] {
  try {
    const saved = localStorage.getItem(SESSIONS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Error retrieving sessions from localStorage:', error);
    return [];
  }
}

export function setCurrentSessionId(sessionId: string): void {
  try {
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
  } catch (error) {
    console.error('Error setting current session id:', error);
  }
}

export function getCurrentSessionId(): string | null {
  try {
    return localStorage.getItem(CURRENT_SESSION_KEY);
  } catch (error) {
    console.error('Error getting current session id:', error);
    return null;
  }
}

export function removeSession(sessionId: string): void {
  try {
    const sessions = getSessions();
    const filtered = sessions.filter((s: any) => s.id !== sessionId);
    saveSessions(filtered);
  } catch (error) {
    console.error('Error removing session:', error);
  }
}