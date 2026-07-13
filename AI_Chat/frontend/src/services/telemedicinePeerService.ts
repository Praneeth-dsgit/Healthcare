import { getApiRoot } from '../utils/apiBase';

export type LanPeerState =
  | 'checking'
  | 'waiting_peer'
  | 'connecting'
  | 'connected'
  | 'unavailable'
  | 'failed';

export interface LanPeerStatus {
  state: LanPeerState;
  peerRole?: 'patient' | 'doctor';
  localAddress?: string;
  error?: string;
}

interface SignalMessage {
  id: string;
  from: 'patient' | 'doctor';
  type: 'join' | 'offer' | 'answer' | 'ice-candidate' | 'leave';
  payload: unknown;
  at: number;
}

const POLL_MS = 500;

/** STUN + optional TURN (set VITE_TURN_* in .env for calls across different networks). */
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turnUrl?.trim()) {
    servers.push({
      urls: turnUrl.trim(),
      username: (import.meta.env.VITE_TURN_USERNAME as string) || undefined,
      credential: (import.meta.env.VITE_TURN_CREDENTIAL as string) || undefined,
    });
  }
  return servers;
}

async function signalingFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${getApiRoot()}/telemedicine/signaling${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function isLanSignalingAvailable(): Promise<boolean> {
  try {
    const res = await signalingFetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}

export function resolveTelemedicineVisitId(
  pathname: string,
  paramVisitId?: string
): string | undefined {
  if (paramVisitId) return paramVisitId;
  const match = pathname.match(/\/(?:portal\/telemedicine|app\/general)\/visit\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function getLanJoinUrl(visitId: string, role: 'patient' | 'doctor'): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const path =
    role === 'patient'
      ? `/portal/telemedicine/visit/${visitId}`
      : `/app/general/visit/${visitId}`;
  return `${base}${path}`;
}

export class TelemedicinePeerConnection {
  private visitId: string;
  private role: 'patient' | 'doctor';
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPollSince = 0;
  private processedSignalIds = new Set<string>();
  private makingOffer = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private remoteMediaStream: MediaStream | null = null;
  private firstPoll = true;
  private patientPresenceSeen = false;
  private onRemoteStream: (stream: MediaStream) => void;
  private onStatus: (status: LanPeerStatus) => void;
  private closed = false;

  constructor(
    visitId: string,
    role: 'patient' | 'doctor',
    onRemoteStream: (stream: MediaStream) => void,
    onStatus: (status: LanPeerStatus) => void
  ) {
    this.visitId = visitId;
    this.role = role;
    this.onRemoteStream = onRemoteStream;
    this.onStatus = onStatus;
  }

  async start(): Promise<void> {
    this.onStatus({ state: 'checking', peerRole: this.role });

    const available = await isLanSignalingAvailable();
    if (!available) {
      this.onStatus({
        state: 'unavailable',
        peerRole: this.role,
        error: 'Signaling server not reachable',
      });
      return;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (err) {
      this.onStatus({
        state: 'failed',
        peerRole: this.role,
        error: err instanceof Error ? err.message : 'Camera/mic permission denied',
      });
      return;
    }

    this.pc = new RTCPeerConnection({ iceServers: buildIceServers() });
    this.localStream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!);
    });

    this.pc.ontrack = (event) => {
      if (!this.remoteMediaStream) {
        this.remoteMediaStream = event.streams[0] ?? new MediaStream();
      }
      if (event.track && !this.remoteMediaStream.getTracks().some((t) => t.id === event.track.id)) {
        this.remoteMediaStream.addTrack(event.track);
      }
      this.onRemoteStream(this.remoteMediaStream);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        void this.sendSignal('ice-candidate', event.candidate.toJSON());
      } else {
        void this.sendSignal('ice-candidate', { candidate: '', sdpMid: null, sdpMLineIndex: null });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc?.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        this.onStatus({ state: 'connected', peerRole: this.role, localAddress: this.getHostHint() });
      } else if (iceState === 'failed') {
        void this.restartIce('ICE failed — retrying…');
      } else if (iceState === 'disconnected') {
        this.onStatus({
          state: 'connecting',
          peerRole: this.role,
          error: 'Peer disconnected — reconnecting…',
          localAddress: this.getHostHint(),
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === 'connected') {
        this.onStatus({ state: 'connected', peerRole: this.role, localAddress: this.getHostHint() });
      } else if (state === 'connecting') {
        this.onStatus({ state: 'connecting', peerRole: this.role, localAddress: this.getHostHint() });
      } else if (state === 'failed' || state === 'disconnected') {
        this.onStatus({
          state: 'failed',
          peerRole: this.role,
          error: `Connection ${state}`,
          localAddress: this.getHostHint(),
        });
      }
    };

    await this.sendSignal('join', { at: Date.now() });
    this.onStatus({ state: 'waiting_peer', peerRole: this.role, localAddress: this.getHostHint() });

    this.lastPollSince = 0;
    this.firstPoll = true;
    this.pollTimer = setInterval(() => void this.pollSignals(), POLL_MS);
    void this.pollSignals();

    if (this.role === 'doctor') {
      setTimeout(() => void this.maybeCreateOffer(), 800);
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  setMicEnabled(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  setCameraEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  private getHostHint(): string {
    if (typeof window === 'undefined') return '';
    return window.location.host;
  }

  private async sendSignal(type: SignalMessage['type'], payload: unknown): Promise<void> {
    if (this.closed) return;
    try {
      await signalingFetch(`/${encodeURIComponent(this.visitId)}`, {
        method: 'POST',
        body: JSON.stringify({ role: this.role, type, payload }),
      });
    } catch {
      /* polling will surface failures */
    }
  }

  private async pollSignals(): Promise<void> {
    if (this.closed || !this.pc) return;
    try {
      const sinceParam = this.firstPoll ? 0 : this.lastPollSince;
      const res = await signalingFetch(
        `/${encodeURIComponent(this.visitId)}?role=${this.role}&since=${sinceParam}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const signals = (data.signals || []) as SignalMessage[];
      const presence = data.presence || {};
      this.firstPoll = false;

      if (presence.patient && presence.doctor) {
        if (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed') {
          this.onStatus({ state: 'connected', peerRole: this.role, localAddress: this.getHostHint() });
        } else if (this.pc.connectionState !== 'connected') {
          this.onStatus({
            state: this.pc.connectionState === 'connecting' ? 'connecting' : 'waiting_peer',
            peerRole: this.role,
            localAddress: this.getHostHint(),
          });
        }
      }

      if (
        this.role === 'doctor' &&
        presence.patient &&
        !this.patientPresenceSeen
      ) {
        this.patientPresenceSeen = true;
        if (this.pc.currentLocalDescription && !this.remoteDescriptionSet) {
          void this.resendOffer();
        }
      }

      for (const signal of signals) {
        if (this.processedSignalIds.has(signal.id)) continue;
        this.processedSignalIds.add(signal.id);
        this.lastPollSince = Math.max(this.lastPollSince, signal.at);
        await this.handleSignal(signal);
      }

      if (this.role === 'doctor' && presence.patient && !this.makingOffer && !this.pc.currentLocalDescription) {
        void this.maybeCreateOffer();
      }
    } catch {
      /* ignore transient poll errors */
    }
  }

  private async restartIce(reason: string): Promise<void> {
    if (!this.pc || this.closed || this.makingOffer) return;
    this.onStatus({
      state: 'connecting',
      peerRole: this.role,
      error: reason,
      localAddress: this.getHostHint(),
    });
    if (this.role === 'doctor') {
      await this.resendOffer(true);
    }
  }

  private async resendOffer(iceRestart = false): Promise<void> {
    if (!this.pc || this.makingOffer || this.closed || this.role !== 'doctor') return;
    this.makingOffer = true;
    try {
      this.onStatus({ state: 'connecting', peerRole: this.role, localAddress: this.getHostHint() });
      const offer = await this.pc.createOffer({ iceRestart });
      await this.pc.setLocalDescription(offer);
      await this.sendSignal('offer', offer);
    } catch (err) {
      console.warn('Telemedicine re-offer failed:', err);
    } finally {
      this.makingOffer = false;
    }
  }

  private async maybeCreateOffer(): Promise<void> {
    if (!this.pc || this.makingOffer || this.closed || this.role !== 'doctor') return;
    if (this.pc.currentLocalDescription) return;
    this.makingOffer = true;
    try {
      this.onStatus({ state: 'connecting', peerRole: this.role, localAddress: this.getHostHint() });
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.sendSignal('offer', offer);
    } finally {
      this.makingOffer = false;
    }
  }

  private async flushPendingIce(): Promise<void> {
    if (!this.pc || !this.remoteDescriptionSet) return;
    const queued = [...this.pendingIce];
    this.pendingIce = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* ignore duplicate / invalid candidates */
      }
    }
  }

  private async setRemoteDescription(
    description: RTCSessionDescriptionInit
  ): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(description));
    this.remoteDescriptionSet = true;
    await this.flushPendingIce();
  }

  private async addRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    if (!candidate.candidate) {
      if (this.remoteDescriptionSet) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate({ candidate: '' }));
        } catch {
          /* end-of-candidates optional */
        }
      }
      return;
    }
    if (!this.remoteDescriptionSet) {
      this.pendingIce.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      /* ignore duplicate / early candidates */
    }
  }

  private async handleSignal(signal: SignalMessage): Promise<void> {
    if (!this.pc || this.closed) return;

    try {
      if (signal.type === 'offer' && this.role === 'patient') {
        const offer = signal.payload as RTCSessionDescriptionInit;
        if (this.pc.signalingState === 'have-local-offer') {
          await this.pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
        }
        await this.setRemoteDescription(offer);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.sendSignal('answer', answer);
        this.onStatus({ state: 'connecting', peerRole: this.role, localAddress: this.getHostHint() });
        return;
      }

      if (signal.type === 'answer' && this.role === 'doctor') {
        await this.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        return;
      }

      if (signal.type === 'ice-candidate') {
        await this.addRemoteIceCandidate(signal.payload as RTCIceCandidateInit);
      }
    } catch (err) {
      console.warn('Telemedicine signal handling failed:', signal.type, err);
      this.onStatus({
        state: 'failed',
        peerRole: this.role,
        error: err instanceof Error ? err.message : 'Signaling error',
        localAddress: this.getHostHint(),
      });
    }
  }

  async stop(): Promise<void> {
    this.closed = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.sendSignal('leave', {});
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }
}
