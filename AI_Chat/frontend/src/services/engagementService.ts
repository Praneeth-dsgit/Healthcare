/**
 * Engagement platform API client (preferences, tasks, adherence, SDOH, decision aids, metrics).
 */
import { getAuthHeaders, authenticatedFetch } from './authService';
import { getApiBaseUrl } from '../utils/apiBase';

const API = `${getApiBaseUrl()}/api/engagement`;

export interface EngagementPreferences {
  patient_id?: string;
  channel_in_app?: boolean | number;
  channel_email?: boolean | number;
  channel_sms?: boolean | number;
  channel_whatsapp?: boolean | number;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  language?: string;
  appointment_reminders?: boolean | number;
  medication_reminders?: boolean | number;
  preventive_reminders?: boolean | number;
  marketing_opt_in?: boolean | number;
}

export interface EngagementEvent {
  event_id: number;
  patient_id: string;
  event_type: string;
  channel: string;
  title?: string;
  message: string;
  status: string;
  scheduled_at?: string;
  sent_at?: string;
  created_at?: string;
}

export interface CareGap {
  care_gap_id: number;
  patient_id: string;
  gap_type: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  due_date?: string;
}

export interface SdohResource {
  resource_id: number;
  category: string;
  title: string;
  description?: string;
  url?: string;
  phone?: string;
  region?: string;
}

export interface DecisionAidSession {
  session_id: number;
  topic: string;
  options_json?: string;
  preference_json?: string;
  chosen_option?: string;
  status: string;
}

export interface EngagementMetrics {
  days: number;
  reminders_sent: number;
  reminders_failed: number;
  by_channel: Record<string, number>;
  by_type: Record<string, number>;
  appointments_scheduled: number;
  appointments_completed: number;
  appointments_no_show: number;
  show_rate_pct: number | null;
  portal_notifications_unread: number;
  med_checkins: number;
  satisfaction_responses: number;
  satisfaction_avg: number;
}

class EngagementService {
  async getPreferences() {
    const res = await authenticatedFetch(`${API}/preferences`, { headers: getAuthHeaders() });
    return res.json();
  }

  async updatePreferences(data: Partial<EngagementPreferences>) {
    const res = await authenticatedFetch(`${API}/preferences`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async getTasks() {
    const res = await authenticatedFetch(`${API}/tasks`, { headers: getAuthHeaders() });
    return res.json();
  }

  async getEvents(params?: { patient_id?: string; status?: string; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.patient_id) q.set('patient_id', params.patient_id);
    if (params?.status) q.set('status', params.status);
    if (params?.limit) q.set('limit', String(params.limit));
    const res = await authenticatedFetch(`${API}/events?${q}`, { headers: getAuthHeaders() });
    return res.json();
  }

  async send(payload: {
    patient_id: string;
    message: string;
    channels?: string[];
    event_type?: string;
    title?: string;
    personalize?: boolean;
  }) {
    const res = await authenticatedFetch(`${API}/send`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async getMetrics(days = 30) {
    const res = await authenticatedFetch(`${API}/metrics?days=${days}`, { headers: getAuthHeaders() });
    return res.json();
  }

  async logAdherence(data: {
    medication_name: string;
    action: 'taken' | 'skipped' | 'snoozed';
    dosage?: string;
    notes?: string;
  }) {
    const res = await authenticatedFetch(`${API}/adherence`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async getAdherenceLogs() {
    const res = await authenticatedFetch(`${API}/adherence`, { headers: getAuthHeaders() });
    return res.json();
  }

  async getCareGaps(patientId?: string) {
    const q = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
    const res = await authenticatedFetch(`${API}/care-gaps${q}`, { headers: getAuthHeaders() });
    return res.json();
  }

  async updateCareGapStatus(gapId: number, status: string) {
    const res = await authenticatedFetch(`${API}/care-gaps/${gapId}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    return res.json();
  }

  async scanCareGaps() {
    const res = await authenticatedFetch(`${API}/care-gaps/scan`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    });
    return res.json();
  }

  async getSdohAssessment() {
    const res = await authenticatedFetch(`${API}/sdoh/assessment`, { headers: getAuthHeaders() });
    return res.json();
  }

  async saveSdohAssessment(data: Record<string, unknown>) {
    const res = await authenticatedFetch(`${API}/sdoh/assessment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async getSdohResources(category?: string) {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await authenticatedFetch(`${API}/sdoh/resources${q}`, { headers: getAuthHeaders() });
    return res.json();
  }

  async createDecisionAid(topic: string) {
    const res = await authenticatedFetch(`${API}/decision-aids`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ topic }),
    });
    return res.json();
  }

  async completeDecisionAid(sessionId: number, chosen_option: string, preferences?: Record<string, unknown>) {
    const res = await authenticatedFetch(`${API}/decision-aids/${sessionId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ chosen_option, preferences, status: 'completed' }),
    });
    return res.json();
  }

  async getDecisionAids() {
    const res = await authenticatedFetch(`${API}/decision-aids`, { headers: getAuthHeaders() });
    return res.json();
  }

  async submitSatisfaction(score: number, feedback?: string, appointmentId?: number) {
    const res = await authenticatedFetch(`${API}/satisfaction`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ score, feedback, appointment_id: appointmentId }),
    });
    return res.json();
  }

  async createCampaign(data: {
    name: string;
    message_template: string;
    channels?: string[];
    patient_ids?: string[];
    send_now?: boolean;
  }) {
    const res = await authenticatedFetch(`${API}/campaigns`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async runJob(job: string) {
    const res = await authenticatedFetch(`${API}/jobs/run`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ job }),
    });
    return res.json();
  }

  async getRisk(patientId: string) {
    const res = await authenticatedFetch(`${API}/risk/${encodeURIComponent(patientId)}`, {
      headers: getAuthHeaders(),
    });
    return res.json();
  }
}

export const engagementService = new EngagementService();
