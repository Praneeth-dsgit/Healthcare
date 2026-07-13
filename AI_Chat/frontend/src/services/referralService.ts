import { getAuthHeaders, authenticatedFetch } from './authService';
import { getApiRoot } from '../utils/apiBase';
import { patientService } from './patientService';
import { recordService } from './recordService';
import { doctorService } from './doctorService';
import { demoDelay, DEMO_FEATURES_ENABLED } from '../demo/demoConfig';
import { getDemoState, updateDemoState, appendDemoItem } from '../demo/demoStorage';
import {
  FIXTURE_REFERRALS,
  FIXTURE_REFERRAL_PATIENTS,
  FIXTURE_SPECIALISTS,
  FIXTURE_REFERRAL_RECORDS,
} from '../demo/fixtures/referrals';

const API_BASE = getApiRoot();

export type ReferralStatus =
  | 'draft'
  | 'pending_consent'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'completed'
  | 'more_info';

export type ReferralDirection = 'incoming' | 'outgoing';

export interface ReferralPatient {
  patient_id: string;
  name: string;
  age: number;
  gender: string;
}

export interface ReferralSpecialist {
  doctor_id: number;
  name: string;
  specialty: string;
  facility: string;
}

export interface ReferralRecord {
  id: string;
  title: string;
  type: string;
}

export interface Referral {
  id: string;
  direction: ReferralDirection;
  fromDoctorId?: number;
  toDoctorId?: number;
  patientName: string;
  patientId: string;
  fromDoctor: string;
  toDoctor: string;
  specialty: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  status: ReferralStatus;
  clinicalNotes: string;
  attachedRecords: string[];
  createdAt: string;
  consentStatus: 'pending' | 'approved' | 'declined';
}

export interface ReferralNotification {
  id: string;
  referralId: string;
  title: string;
  message: string;
  patientId: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
}

function computeAge(dateOfBirth?: string): number {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function formatRecordType(recordType: string): string {
  return recordType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function mergeReferrals(): Referral[] {
  const stored = getDemoState().referrals as Referral[];
  return stored;
}

async function resolveCurrentDoctorId(): Promise<number | undefined> {
  const result = await doctorService.getCurrentDoctor();
  if (result.success && result.doctor?.doctor_id) {
    return result.doctor.doctor_id;
  }
  return undefined;
}

function formatDoctorName(
  doctor?: { first_name?: string; last_name?: string }
): string {
  if (!doctor) return 'Unknown physician';
  const name = `Dr. ${doctor.first_name || ''} ${doctor.last_name || ''}`.trim();
  return name || 'Unknown physician';
}

/** Scope demo/local referrals to the logged-in doctor (incoming vs outgoing). */
function filterReferralsForDoctor(
  referrals: Referral[],
  doctorId: number | undefined,
  direction?: ReferralDirection
): Referral[] {
  if (!doctorId) {
    if (direction) return referrals.filter((r) => r.direction === direction);
    return referrals;
  }

  return referrals
    .map((r) => {
      const fromId = r.fromDoctorId;
      const toId = r.toDoctorId;
      if (fromId == null && toId == null) {
        return null;
      }
      let dir: ReferralDirection | null = null;
      if (fromId === doctorId) dir = 'outgoing';
      else if (toId === doctorId) dir = 'incoming';
      if (!dir) return null;

      return {
        ...r,
        direction: dir,
      };
    })
    .filter((r): r is Referral => r !== null)
    .filter((r) => !direction || r.direction === direction);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await authenticatedFetch(`${API_BASE}/referrals${path}`, {
      ...init,
      headers: {
        ...getAuthHeaders(),
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

class ReferralService {
  async getReferrals(
    direction?: ReferralDirection
  ): Promise<{ success: boolean; referrals: Referral[]; error?: string }> {
    const qs = direction ? `?direction=${direction}` : '';
    const data = await apiFetch<{ success: boolean; referrals: Referral[] }>(qs);
    if (data?.success && Array.isArray(data.referrals)) {
      return { success: true, referrals: data.referrals };
    }

    if (DEMO_FEATURES_ENABLED) {
      const doctorId = await resolveCurrentDoctorId();
      let list = filterReferralsForDoctor(mergeReferrals(), doctorId);
      // Only show static fixtures when no doctor profile (offline demo)
      if (!doctorId) {
        const ids = new Set(list.map((r) => r.id));
        list = [...list, ...FIXTURE_REFERRALS.filter((r) => !ids.has(r.id))];
        if (direction) list = list.filter((r) => r.direction === direction);
      } else if (direction) {
        list = list.filter((r) => r.direction === direction);
      }
      return demoDelay({ success: true, referrals: list });
    }
    return { success: false, referrals: [], error: 'Could not load referrals' };
  }

  async getPatients(): Promise<{ success: boolean; patients: ReferralPatient[] }> {
    try {
      const doctorResult = await doctorService.getCurrentDoctor();
      const doctorId =
        doctorResult.success && doctorResult.doctor ? doctorResult.doctor.doctor_id : undefined;

      const result = await patientService.listPatients(undefined, doctorId);
      if (result.success && result.patients && result.patients.length > 0) {
        return {
          success: true,
          patients: result.patients.map((p) => ({
            patient_id: p.patient_id,
            name: `${p.first_name} ${p.last_name}`.trim(),
            age: p.age ?? computeAge(p.date_of_birth),
            gender: p.gender || '—',
          })),
        };
      }

      const withRecords = await recordService.listPatientsWithRecords({ capability: 'general' });
      if (withRecords.success && withRecords.patients && withRecords.patients.length > 0) {
        return {
          success: true,
          patients: withRecords.patients.map((p) => ({
            patient_id: p.patient_id,
            name: `${p.first_name} ${p.last_name}`.trim(),
            age: computeAge(p.date_of_birth),
            gender: p.gender || '—',
          })),
        };
      }
    } catch {
      /* fall through */
    }

    if (DEMO_FEATURES_ENABLED) {
      return demoDelay({ success: true, patients: FIXTURE_REFERRAL_PATIENTS });
    }
    return { success: true, patients: [] };
  }

  async getSpecialists(): Promise<{ success: boolean; specialists: ReferralSpecialist[] }> {
    const data = await apiFetch<{ success: boolean; specialists: ReferralSpecialist[] }>(
      '/specialists'
    );
    if (data?.success && data.specialists) {
      return { success: true, specialists: data.specialists };
    }

    if (DEMO_FEATURES_ENABLED) {
      return demoDelay({ success: true, specialists: FIXTURE_SPECIALISTS });
    }
    return { success: true, specialists: [] };
  }

  async getRecords(patientId?: string): Promise<{ success: boolean; records: ReferralRecord[] }> {
    if (!patientId) {
      return { success: true, records: [] };
    }

    try {
      const result = await recordService.getRecordsForPatient(patientId, { capability: 'general' });
      if (result.success && result.records) {
        return {
          success: true,
          records: result.records.map((r) => ({
            id: String(r.record_id),
            title: r.title,
            type: formatRecordType(r.record_type),
          })),
        };
      }
    } catch {
      /* fall through */
    }

    if (DEMO_FEATURES_ENABLED) {
      return demoDelay({ success: true, records: FIXTURE_REFERRAL_RECORDS });
    }
    return { success: true, records: [] };
  }

  async createReferral(payload: {
    patientId: string;
    patientName: string;
    toDoctorId: number;
    toDoctor: string;
    specialty: string;
    urgency: Referral['urgency'];
    clinicalNotes: string;
    attachedRecords: string[];
    requestConsent: boolean;
  }): Promise<{ success: boolean; referral?: Referral; error?: string }> {
    const data = await apiFetch<{ success: boolean; referral: Referral; error?: string }>('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: payload.patientId,
        toDoctorId: payload.toDoctorId,
        specialty: payload.specialty,
        urgency: payload.urgency,
        clinicalNotes: payload.clinicalNotes,
        attachedRecords: payload.attachedRecords,
        requestConsent: payload.requestConsent,
      }),
    });

    if (data?.success && data.referral) {
      return { success: true, referral: data.referral };
    }

    if (DEMO_FEATURES_ENABLED) {
      const doctorResult = await doctorService.getCurrentDoctor();
      const fromDoctorId = doctorResult.success && doctorResult.doctor
        ? doctorResult.doctor.doctor_id
        : await resolveCurrentDoctorId();
      const fromDoctorLabel = formatDoctorName(doctorResult.doctor);
      const referral: Referral = {
        id: `ref-${Date.now()}`,
        direction: 'outgoing',
        fromDoctorId,
        toDoctorId: payload.toDoctorId,
        patientName: payload.patientName,
        patientId: payload.patientId,
        fromDoctor: fromDoctorLabel,
        toDoctor: payload.toDoctor,
        specialty: payload.specialty,
        urgency: payload.urgency,
        status: payload.requestConsent ? 'pending_consent' : 'pending',
        clinicalNotes: payload.clinicalNotes,
        attachedRecords: payload.attachedRecords,
        createdAt: new Date().toISOString(),
        consentStatus: payload.requestConsent ? 'pending' : 'approved',
      };
      appendDemoItem('referrals', referral);

      if (payload.requestConsent) {
        const notif: ReferralNotification = {
          id: `rnotif-${Date.now()}`,
          referralId: referral.id,
          title: 'Referral consent requested',
          message: `${payload.toDoctor} requests access to your records for a ${payload.specialty} referral.`,
          patientId: payload.patientId,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        appendDemoItem('referralNotifications', notif);
      }
      return demoDelay({ success: true, referral });
    }

    return { success: false, error: data?.error || 'Failed to create referral' };
  }

  async updateReferralStatus(
    referralId: string,
    status: ReferralStatus
  ): Promise<{ success: boolean; error?: string }> {
    const data = await apiFetch<{ success: boolean; error?: string }>(
      `/${encodeURIComponent(referralId)}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }
    );
    if (data?.success) return { success: true };

    if (DEMO_FEATURES_ENABLED) {
      const all = mergeReferrals().map((r) =>
        r.id === referralId ? { ...r, status } : r
      );
      updateDemoState({ referrals: all });
      return demoDelay({ success: true });
    }
    return { success: false, error: 'Failed to update referral' };
  }

  async simulatePatientConsent(referralId: string): Promise<{ success: boolean; error?: string }> {
    const data = await apiFetch<{ success: boolean }>(
      `/${encodeURIComponent(referralId)}/simulate-consent`,
      { method: 'POST' }
    );
    if (data?.success) return { success: true };

    if (DEMO_FEATURES_ENABLED) {
      const referrals = mergeReferrals().map((r) =>
        r.id === referralId
          ? { ...r, consentStatus: 'approved' as const, status: 'pending' as ReferralStatus }
          : r
      );
      const notifs = (getDemoState().referralNotifications as ReferralNotification[]).map((n) =>
        n.referralId === referralId ? { ...n, status: 'approved' as const } : n
      );
      updateDemoState({ referrals, referralNotifications: notifs });
      return demoDelay({ success: true });
    }
    return { success: false, error: 'Failed to update consent' };
  }

  async getReferralNotifications(): Promise<{ success: boolean; notifications: ReferralNotification[] }> {
    const data = await apiFetch<{ success: boolean; notifications: ReferralNotification[] }>(
      '/consent-notifications'
    );
    if (data?.success && data.notifications) {
      return { success: true, notifications: data.notifications };
    }

    if (DEMO_FEATURES_ENABLED) {
      const stored = getDemoState().referralNotifications as ReferralNotification[];
      return demoDelay({ success: true, notifications: stored });
    }
    return { success: true, notifications: [] };
  }

  async respondToConsent(
    notificationId: string,
    approved: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const data = await apiFetch<{ success: boolean }>(
      `/consent-notifications/${encodeURIComponent(notificationId)}/respond`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      }
    );
    if (data?.success) return { success: true };

    if (DEMO_FEATURES_ENABLED) {
      const notifs = (getDemoState().referralNotifications as ReferralNotification[]).map((n) => {
        if (n.id !== notificationId) return n;
        return { ...n, status: approved ? ('approved' as const) : ('declined' as const) };
      });
      const notif = notifs.find((n) => n.id === notificationId);
      if (notif) {
        const referrals = mergeReferrals().map((r) => {
          if (r.id !== notif.referralId) return r;
          return {
            ...r,
            consentStatus: approved ? ('approved' as const) : ('declined' as const),
            status: approved ? ('pending' as ReferralStatus) : ('rejected' as ReferralStatus),
          };
        });
        updateDemoState({ referralNotifications: notifs, referrals });
      }
      return demoDelay({ success: true });
    }
    return { success: false, error: 'Failed to respond to consent' };
  }
}

export const referralService = new ReferralService();
