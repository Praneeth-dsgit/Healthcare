import { demoDelay, DEMO_FEATURES_ENABLED } from '../demo/demoConfig';
import {
  getDemoState,
  updateDemoState,
  upsertDemoVisitAudit,
  appendVisitChat,
  appendDemoItem,
} from '../demo/demoStorage';
import {
  FIXTURE_VISITS,
  FIXTURE_VISIT_DOCS,
  FIXTURE_CHAT_SEED,
  CONSENT_TEXT,
  buildDemoTelemedicineDoctors,
} from '../demo/fixtures/telemedicine';
import { haversineKm, FIXTURE_GEO_DOCTORS } from '../demo/fixtures/doctorsGeo';
import { getApiRoot } from '../utils/apiBase';
import { authenticatedFetch, getAuthHeaders, isAuthenticated } from './authService';
import type { AppointmentBookingData } from './appointmentService';

export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type BandwidthQuality = 'good' | 'fair' | 'low';

export interface TelemedicineVisit {
  id: string;
  appointmentId?: number;
  patientId?: string;
  patientName: string;
  doctorName: string;
  doctorId: number;
  specialty: string;
  reason?: string;
  scheduledAt: string;
  status: VisitStatus;
  visitMode: 'video';
  durationMinutes: number;
  fee: number;
  canJoin: boolean;
}

export interface TelemedicineDoctor {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty_name?: string;
  qualification?: string;
  experience_years?: number;
  consultation_fee?: number;
  is_available?: boolean;
  facility_id?: number;
  facility_name?: string;
  facility_city?: string;
  distance_km?: number;
}

export interface TelemedicineDoctorQuery {
  search?: string;
  specialty?: string;
  lat?: number;
  lng?: number;
  maxKm?: number;
}

export interface VisitDocument {
  id: string;
  name: string;
  type: string;
  size: string;
}

export interface VisitChatMessage {
  id: string;
  sender: 'patient' | 'doctor' | 'system';
  senderName?: string;
  text: string;
  at: string;
  at_ts?: number;
}

export interface VisitAuditEvent {
  action: string;
  at: string;
  detail?: string;
}

export interface VisitPrescriptionMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface VisitTranscriptEntry {
  id: string;
  role: 'patient' | 'doctor';
  speakerName?: string;
  text: string;
  at: string;
  at_ts?: number;
  isFinal?: boolean;
}

export interface VisitPrescription {
  diagnosis?: string;
  medications: VisitPrescriptionMedication[];
  notes?: string;
  aiSummary?: string;
  prescribedAt: string;
  doctorName?: string;
  doctorQualification?: string;
  patientId?: string;
  patientName?: string;
  patientAge?: string;
  patientGender?: string;
  status?: 'draft' | 'sent';
  reviewed?: boolean;
  pdfRecordId?: number;
}

export interface VisitPayment {
  status: 'pending' | 'paid';
  amount: number;
  paidAt?: string;
}

function mergeVisits(): TelemedicineVisit[] {
  const stored = getDemoState().visits as TelemedicineVisit[];
  const ids = new Set(stored.map((v) => v.id));
  const merged = [...stored, ...FIXTURE_VISITS.filter((v) => !ids.has(v.id))];
  return merged.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

export function isDemoVisitId(visitId: string): boolean {
  return visitId.startsWith('visit-demo-');
}

export function withoutDemoVisits(visits: TelemedicineVisit[]): TelemedicineVisit[] {
  return visits.filter((v) => !isDemoVisitId(v.id));
}

function demoTelemedicineDoctors(params?: TelemedicineDoctorQuery): TelemedicineDoctor[] {
  let doctors = buildDemoTelemedicineDoctors();

  if (params?.search) {
    const q = params.search.toLowerCase();
    doctors = doctors.filter(
      (d) =>
        `${d.first_name} ${d.last_name}`.toLowerCase().includes(q) ||
        (d.specialty_name || '').toLowerCase().includes(q)
    );
  }
  if (params?.specialty) {
    const spec = params.specialty.toLowerCase();
    doctors = doctors.filter((d) => (d.specialty_name || '').toLowerCase().includes(spec));
  }
  if (params?.lat != null && params?.lng != null) {
    const maxKm = params.maxKm ?? 50;
    doctors = doctors
      .map((d) => {
        const geo = FIXTURE_GEO_DOCTORS.find((g) => g.doctor_id === d.doctor_id);
        if (!geo) return { ...d, distance_km: d.doctor_id === 16 ? 0 : undefined };
        const distance_km = Math.round(haversineKm(params.lat!, params.lng!, geo.lat, geo.lng) * 10) / 10;
        return { ...d, distance_km };
      })
      .filter((d) => d.distance_km == null || d.distance_km <= maxKm)
      .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  }

  return doctors;
}

function mapApiVisit(v: Record<string, unknown>): TelemedicineVisit {
  return {
    id: String(v.id),
    appointmentId: v.appointmentId as number | undefined,
    patientId: v.patientId ? String(v.patientId) : undefined,
    patientName: String(v.patientName || 'You'),
    doctorName: String(v.doctorName || 'Doctor'),
    doctorId: Number(v.doctorId),
    specialty: String(v.specialty || 'General Medicine'),
    reason: v.reason ? String(v.reason) : undefined,
    scheduledAt: String(v.scheduledAt),
    status: (v.status as VisitStatus) || 'scheduled',
    visitMode: 'video',
    durationMinutes: Number(v.durationMinutes || 30),
    fee: Number(v.fee || 0),
    canJoin: Boolean(v.canJoin),
  };
}

function mapApiChatMessage(m: Record<string, unknown>): VisitChatMessage {
  return {
    id: String(m.id),
    sender: (m.sender as VisitChatMessage['sender']) || 'system',
    senderName: m.senderName ? String(m.senderName) : undefined,
    text: String(m.text || ''),
    at: String(m.at || new Date().toISOString()),
    at_ts: typeof m.at_ts === 'number' ? m.at_ts : undefined,
  };
}

async function chatFetch(visitId: string, init?: RequestInit): Promise<Response> {
  return fetch(`${getApiRoot()}/telemedicine/chat/${encodeURIComponent(visitId)}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

class TelemedicineService {
  async getTelemedicineDoctors(
    params?: TelemedicineDoctorQuery
  ): Promise<{ success: boolean; doctors: TelemedicineDoctor[] }> {
    try {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.specialty) qs.set('specialty', params.specialty);
      if (params?.lat != null) qs.set('lat', String(params.lat));
      if (params?.lng != null) qs.set('lng', String(params.lng));
      if (params?.maxKm != null) qs.set('max_km', String(params.maxKm));

      const query = qs.toString();
      const res = await fetch(
        `${getApiRoot()}/telemedicine/doctors${query ? `?${query}` : ''}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.doctors)) {
        if (data.doctors.length > 0) {
          return { success: true, doctors: data.doctors };
        }
        if (!DEMO_FEATURES_ENABLED) {
          return { success: true, doctors: [] };
        }
      }
    } catch {
      /* fall through to demo */
    }
    if (DEMO_FEATURES_ENABLED) {
      return demoDelay({ success: true, doctors: demoTelemedicineDoctors(params) });
    }
    return { success: true, doctors: [] };
  }

  async getVisits(): Promise<{ success: true; visits: TelemedicineVisit[] }> {
    try {
      const res = await authenticatedFetch(`${getApiRoot()}/telemedicine/visits`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.visits)) {
        const apiVisits = data.visits.map((v: Record<string, unknown>) => mapApiVisit(v));
        if (apiVisits.length > 0) {
          return demoDelay({
            success: true as const,
            visits: apiVisits.sort(
              (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
            ),
          });
        }
        return demoDelay({ success: true as const, visits: [] });
      }
    } catch {
      /* demo fallback */
    }
    if (DEMO_FEATURES_ENABLED) {
      return demoDelay({ success: true as const, visits: mergeVisits() });
    }
    return demoDelay({ success: true as const, visits: [] });
  }

  async getVisit(visitId: string): Promise<{ success: boolean; visit?: TelemedicineVisit }> {
    if (isAuthenticated()) {
      try {
        const res = await authenticatedFetch(`${getApiRoot()}/telemedicine/visits/${encodeURIComponent(visitId)}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.visit) {
            return { success: true, visit: mapApiVisit(data.visit as Record<string, unknown>) };
          }
        } else if (res.status !== 401) {
          /* try fallbacks below for 404 etc. */
        }
      } catch {
        /* fall through */
      }

      try {
        const res = await authenticatedFetch(`${getApiRoot()}/telemedicine/visits`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.visits)) {
            const found = data.visits
              .map((v: Record<string, unknown>) => mapApiVisit(v))
              .find((v: TelemedicineVisit) => v.id === visitId);
            if (found) return { success: true, visit: found };
          }
        }
      } catch {
        /* ignore */
      }
    }

    const visit = isDemoVisitId(visitId)
      ? mergeVisits().find((v) => v.id === visitId)
      : undefined;
    if (visit) return demoDelay({ success: true, visit });

    const appointmentMatch = visitId.match(/^visit-(\d+)$/);
    if (appointmentMatch) {
      return {
        success: true,
        visit: {
          id: visitId,
          appointmentId: Number(appointmentMatch[1]),
          patientName: 'Patient',
          doctorName: 'Doctor',
          doctorId: 0,
          specialty: 'General Medicine',
          scheduledAt: new Date().toISOString(),
          status: 'scheduled',
          visitMode: 'video',
          durationMinutes: 30,
          fee: 0,
          canJoin: true,
        },
      };
    }

    return demoDelay({ success: false });
  }

  async bookTelemedicineAppointment(
    data: AppointmentBookingData
  ): Promise<{
    success: boolean;
    appointment?: unknown;
    visit?: TelemedicineVisit;
    error?: string;
  }> {
    try {
      const res = await authenticatedFetch(`${getApiRoot()}/telemedicine/book`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        if (result.visit) {
          const visit = mapApiVisit(result.visit as Record<string, unknown>);
          appendDemoItem('visits', visit);
          return { success: true, appointment: result.appointment, visit };
        }
        return { success: true, appointment: result.appointment };
      }
      return { success: false, error: result.error || 'Booking failed' };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async createVideoVisit(payload: {
    doctorName: string;
    doctorId: number;
    specialty: string;
    scheduledAt: string;
    patientName?: string;
    fee?: number;
  }): Promise<{ success: true; visit: TelemedicineVisit }> {
    const visit: TelemedicineVisit = {
      id: `visit-${Date.now()}`,
      patientName: payload.patientName || 'You',
      doctorName: payload.doctorName,
      doctorId: payload.doctorId,
      specialty: payload.specialty,
      scheduledAt: payload.scheduledAt,
      status: 'scheduled',
      visitMode: 'video',
      durationMinutes: 30,
      fee: payload.fee || 800,
      canJoin: true,
    };
    appendDemoItem('visits', visit);
    return demoDelay({ success: true as const, visit });
  }

  async joinVisit(visitId: string, role: 'patient' | 'doctor'): Promise<{ success: true }> {
    upsertDemoVisitAudit(visitId, {
      action: `${role}_joined`,
      at: new Date().toISOString(),
      detail: `${role === 'patient' ? 'Patient' : 'Doctor'} joined the telemedicine session`,
    });
    const visits = mergeVisits().map((v) =>
      v.id === visitId ? { ...v, status: 'in_progress' as VisitStatus } : v
    );
    updateDemoState({ visits });
    return demoDelay({ success: true as const });
  }

  async recordConsent(visitId: string): Promise<{ success: true }> {
    upsertDemoVisitAudit(visitId, {
      action: 'consent_accepted',
      at: new Date().toISOString(),
      detail: 'Telehealth consent accepted',
    });
    return demoDelay({ success: true as const });
  }

  async getConsentText() {
    return demoDelay(CONSENT_TEXT);
  }

  async getDocuments(): Promise<{ success: true; documents: VisitDocument[] }> {
    return demoDelay({ success: true as const, documents: FIXTURE_VISIT_DOCS });
  }

  async shareDocument(visitId: string, doc: VisitDocument): Promise<{ success: true }> {
    const state = getDemoState();
    const shared = { ...state.visitSharedDocs };
    shared[visitId] = [...(shared[visitId] || []), doc];
    updateDemoState({ visitSharedDocs: shared });
    upsertDemoVisitAudit(visitId, {
      action: 'document_shared',
      at: new Date().toISOString(),
      detail: doc.name,
    });
    return demoDelay({ success: true as const });
  }

  async getChatMessages(
    visitId: string,
    since = 0
  ): Promise<{ success: true; messages: VisitChatMessage[] }> {
    try {
      const res = await chatFetch(visitId);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          const messages = (data.messages as Record<string, unknown>[])
            .map(mapApiChatMessage)
            .filter((m) => (m.at_ts ?? 0) > since || since === 0);
          return { success: true, messages };
        }
      }
    } catch {
      /* demo fallback */
    }

    const stored = (getDemoState().visitChatMessages[visitId] || []) as VisitChatMessage[];
    const seed = visitId === 'visit-demo-1' ? FIXTURE_CHAT_SEED : [];
    const all = [...seed, ...stored];
    const messages = since > 0 ? all.filter((m) => (m.at_ts ?? 0) > since) : all;
    return demoDelay({ success: true as const, messages });
  }

  async pollChatMessages(
    visitId: string,
    since: number
  ): Promise<{ success: true; messages: VisitChatMessage[]; latestSince: number }> {
    try {
      const res = await fetch(
        `${getApiRoot()}/telemedicine/chat/${encodeURIComponent(visitId)}?since=${since}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          const messages = (data.messages as Record<string, unknown>[]).map(mapApiChatMessage);
          const latestSince = messages.reduce(
            (max, m) => Math.max(max, m.at_ts ?? 0),
            since
          );
          return { success: true, messages, latestSince };
        }
      }
    } catch {
      /* demo fallback */
    }

    const result = await this.getChatMessages(visitId, since);
    const latestSince = result.messages.reduce(
      (max, m) => Math.max(max, m.at_ts ?? new Date(m.at).getTime() / 1000),
      since
    );
    return { success: true, messages: result.messages, latestSince };
  }

  async sendChatMessage(
    visitId: string,
    message: Omit<VisitChatMessage, 'id' | 'at' | 'at_ts'>
  ): Promise<{ success: true; message: VisitChatMessage }> {
    try {
      const res = await chatFetch(visitId, {
        method: 'POST',
        body: JSON.stringify({
          role: message.sender,
          senderName: message.senderName,
          text: message.text,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.message) {
        return { success: true, message: mapApiChatMessage(data.message as Record<string, unknown>) };
      }
    } catch {
      /* demo fallback */
    }

    const full: VisitChatMessage = {
      ...message,
      id: `msg-${Date.now()}`,
      at: new Date().toISOString(),
      at_ts: Date.now() / 1000,
    };
    appendVisitChat(visitId, full);
    return demoDelay({ success: true as const, message: full });
  }

  async signPrescription(visitId: string): Promise<{ success: true }> {
    const signed = [...getDemoState().signedPrescriptions, visitId];
    updateDemoState({ signedPrescriptions: signed });
    upsertDemoVisitAudit(visitId, {
      action: 'prescription_signed',
      at: new Date().toISOString(),
      detail: 'E-signature captured',
    });
    return demoDelay({ success: true as const });
  }

  async getPrescription(
    visitId: string
  ): Promise<{ success: boolean; prescription?: VisitPrescription | null }> {
    try {
      const res = await authenticatedFetch(
        `${getApiRoot()}/telemedicine/visits/${encodeURIComponent(visitId)}/prescription`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return { success: true, prescription: data.prescription as VisitPrescription | null };
        }
      }
    } catch {
      /* demo fallback */
    }
    const stored = getDemoState().visitPrescriptions[visitId] as VisitPrescription | undefined;
    return { success: true, prescription: stored ?? null };
  }

  async savePrescription(
    visitId: string,
    payload: {
      diagnosis?: string;
      medications: VisitPrescriptionMedication[];
      notes?: string;
      aiSummary?: string;
      doctorName?: string;
      doctorQualification?: string;
      patientId?: string;
      patientName?: string;
      patientAge?: string;
      patientGender?: string;
      reviewed?: boolean;
      finalize?: boolean;
      pdfRecordId?: number;
    }
  ): Promise<{ success: boolean; prescription?: VisitPrescription }> {
    const prescription: VisitPrescription = {
      diagnosis: payload.diagnosis,
      medications: payload.medications,
      notes: payload.notes,
      aiSummary: payload.aiSummary,
      doctorName: payload.doctorName,
      doctorQualification: payload.doctorQualification,
      patientId: payload.patientId,
      patientName: payload.patientName,
      patientAge: payload.patientAge,
      patientGender: payload.patientGender,
      status: payload.finalize ? 'sent' : 'draft',
      reviewed: payload.reviewed,
      pdfRecordId: payload.pdfRecordId,
      prescribedAt: new Date().toISOString(),
    };

    try {
      const res = await authenticatedFetch(
        `${getApiRoot()}/telemedicine/visits/${encodeURIComponent(visitId)}/prescription`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'doctor', ...payload }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success && data.prescription) {
        return { success: true, prescription: data.prescription as VisitPrescription };
      }
    } catch {
      /* demo fallback */
    }

    const state = getDemoState();
    updateDemoState({
      visitPrescriptions: { ...state.visitPrescriptions, [visitId]: prescription },
    });
    if (payload.finalize) {
      appendVisitChat(visitId, {
        id: `msg-${Date.now()}-system`,
        sender: 'system',
        text: `Prescription finalized and sent to patient (${payload.medications.length} medication(s)).`,
        at: prescription.prescribedAt,
      });
    }
    upsertDemoVisitAudit(visitId, {
      action: payload.finalize ? 'prescription_sent' : 'prescription_draft',
      at: prescription.prescribedAt,
      detail: `${payload.medications.length} medication(s)`,
    });
    return { success: true, prescription };
  }

  async appendTranscript(
    visitId: string,
    entry: { role: 'patient' | 'doctor'; text: string; speakerName?: string; isFinal?: boolean }
  ): Promise<{ success: boolean }> {
    const full: VisitTranscriptEntry = {
      id: `trx-${Date.now()}-${entry.role}`,
      role: entry.role,
      speakerName: entry.speakerName,
      text: entry.text,
      at: new Date().toISOString(),
      at_ts: Date.now() / 1000,
      isFinal: entry.isFinal ?? true,
    };

    try {
      const res = await authenticatedFetch(
        `${getApiRoot()}/telemedicine/visits/${encodeURIComponent(visitId)}/transcript`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success) return { success: true };
      }
    } catch {
      /* demo fallback */
    }

    const state = getDemoState();
    const existing = (state.visitTranscripts[visitId] || []) as VisitTranscriptEntry[];
    updateDemoState({
      visitTranscripts: {
        ...state.visitTranscripts,
        [visitId]: [...existing, full],
      },
    });
    return { success: true };
  }

  async getTranscript(
    visitId: string
  ): Promise<{ success: boolean; entries: VisitTranscriptEntry[] }> {
    try {
      const res = await authenticatedFetch(
        `${getApiRoot()}/telemedicine/visits/${encodeURIComponent(visitId)}/transcript`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.entries)) {
          return { success: true, entries: data.entries as VisitTranscriptEntry[] };
        }
      }
    } catch {
      /* demo fallback */
    }
    const stored = (getDemoState().visitTranscripts[visitId] || []) as VisitTranscriptEntry[];
    return { success: true, entries: stored };
  }

  async generatePrescriptionDraft(
    visitId: string,
    context: { patientName?: string; doctorName?: string }
  ): Promise<{ success: boolean; draft?: VisitPrescription; error?: string }> {
    try {
      const res = await authenticatedFetch(
        `${getApiRoot()}/telemedicine/visits/${encodeURIComponent(visitId)}/prescription/generate`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'doctor', ...context }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success && data.draft) {
        return { success: true, draft: data.draft as VisitPrescription };
      }
      if (data.error) return { success: false, error: data.error as string };
    } catch {
      /* demo fallback */
    }

    const transcript = await this.getTranscript(visitId);
    const chat = await this.getChatMessages(visitId, 0);
    const conversation = [
      ...transcript.entries.map((e) => `${e.speakerName || e.role}: ${e.text}`),
      ...chat.messages
        .filter((m) => m.sender !== 'system')
        .map((m) => `${m.senderName || m.sender}: ${m.text}`),
    ].join('\n');

    const draft: VisitPrescription = {
      diagnosis: conversation.toLowerCase().includes('fever') ? 'Acute febrile illness' : undefined,
      aiSummary: conversation.trim()
        ? `Visit summary: Discussion between ${context.doctorName || 'doctor'} and ${context.patientName || 'patient'}. Key topics from transcript are reflected below. Please review and edit before sending.`
        : 'No transcript captured. Complete the prescription manually based on your clinical notes.',
      medications: [],
      notes: '',
      doctorName: context.doctorName,
      status: 'draft',
      prescribedAt: new Date().toISOString(),
    };

    const medPatterns = /(?:prescribe|take|tablet|capsule|mg|medicine)\s+[\w\s]+/gi;
    const matches = conversation.match(medPatterns);
    if (matches && matches.length > 0) {
      draft.medications = [
        {
          name: matches[0].slice(0, 80),
          dosage: '',
          frequency: 'as directed',
          duration: '7 days',
          instructions: '',
        },
      ];
    }

    return { success: true, draft };
  }

  async getPayment(visitId: string): Promise<{ success: boolean; payment?: VisitPayment }> {
    try {
      const res = await authenticatedFetch(
        `${getApiRoot()}/telemedicine/visits/${encodeURIComponent(visitId)}/payment`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.payment) {
          return { success: true, payment: data.payment as VisitPayment };
        }
      }
    } catch {
      /* demo fallback */
    }
    const stored = getDemoState().visitPayments[visitId] as VisitPayment | undefined;
    return {
      success: true,
      payment: stored ?? { status: 'pending', amount: 0 },
    };
  }

  async submitPayment(
    visitId: string,
    amount: number
  ): Promise<{ success: boolean; payment?: VisitPayment }> {
    const payment: VisitPayment = {
      status: 'paid',
      amount,
      paidAt: new Date().toISOString(),
    };

    try {
      const res = await authenticatedFetch(
        `${getApiRoot()}/telemedicine/visits/${encodeURIComponent(visitId)}/payment`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'patient', amount }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success && data.payment) {
        return { success: true, payment: data.payment as VisitPayment };
      }
    } catch {
      /* demo fallback */
    }

    const state = getDemoState();
    updateDemoState({
      visitPayments: { ...state.visitPayments, [visitId]: payment },
    });
    appendVisitChat(visitId, {
      id: `msg-${Date.now()}-system`,
      sender: 'system',
      text: `Patient has completed payment of ₹${amount}.`,
      at: payment.paidAt!,
    });
    upsertDemoVisitAudit(visitId, {
      action: 'payment_received',
      at: payment.paidAt!,
      detail: `₹${amount}`,
    });
    return { success: true, payment };
  }

  async isPrescriptionSigned(visitId: string): Promise<boolean> {
    return getDemoState().signedPrescriptions.includes(visitId);
  }

  async getAuditLog(visitId: string): Promise<{ success: true; events: VisitAuditEvent[] }> {
    const events = (getDemoState().visitAuditLogs[visitId] || []) as VisitAuditEvent[];
    return demoDelay({ success: true as const, events });
  }

  async endVisit(visitId: string): Promise<{ success: true }> {
    const visits = mergeVisits().map((v) =>
      v.id === visitId ? { ...v, status: 'completed' as VisitStatus } : v
    );
    updateDemoState({ visits });
    upsertDemoVisitAudit(visitId, {
      action: 'visit_ended',
      at: new Date().toISOString(),
    });
    return demoDelay({ success: true as const });
  }

  getSimulatedBandwidth(): BandwidthQuality {
    const qualities: BandwidthQuality[] = ['good', 'good', 'fair', 'low'];
    return qualities[Math.floor(Math.random() * qualities.length)];
  }
}

export const telemedicineService = new TelemedicineService();
