/**
 * Telemedicine video: Jitsi Meet (default, free meet.jit.si) or legacy LAN WebRTC.
 */

export type TelemedicineVideoProvider = 'jitsi' | 'webrtc';

export function getTelemedicineVideoProvider(): TelemedicineVideoProvider {
  const raw = (import.meta.env.VITE_TELEMEDICINE_VIDEO as string | undefined)?.trim().toLowerCase();
  return raw === 'webrtc' ? 'webrtc' : 'jitsi';
}

export function getJitsiDomain(): string {
  const domain = (import.meta.env.VITE_JITSI_DOMAIN as string | undefined)?.trim();
  return domain || 'meet.jit.si';
}

/** Stable room name shared by patient + doctor for the same visit. */
export function jitsiRoomName(visitId: string): string {
  const slug = visitId.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 64);
  return `AcuforeHealth-${slug || 'visit'}`;
}
