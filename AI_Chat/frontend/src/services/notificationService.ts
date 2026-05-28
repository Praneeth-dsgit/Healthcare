/**
 * Notification Service
 * Uses JWT (Authorization: Bearer).
 */

import { getAuthHeaders, authenticatedFetch } from './authService';
import { getApiBaseUrl } from '../utils/apiBase';

const API_BASE = getApiBaseUrl();

export interface Notification {
  notification_id: number;
  patient_id: string;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  appointment_id?: number;
}

class NotificationService {
  getPatientId(): string | null {
    return sessionStorage.getItem('patient_id');
  }

  async getNotifications(unreadOnly: boolean = false): Promise<{ success: boolean; notifications?: Notification[]; error?: string }> {
    try {
      const queryParam = unreadOnly ? '?unread_only=true' : '';
      const response = await authenticatedFetch(`${API_BASE}/api/notifications/patient${queryParam}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/notifications/patient/${notificationId}/read`, {
        method: 'PUT',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/notifications/patient/read-all`, {
        method: 'PUT',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Clear all notifications for the current patient
   */
  async clearAllNotifications(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/notifications/patient/clear-all`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }
}

export const notificationService = new NotificationService();

