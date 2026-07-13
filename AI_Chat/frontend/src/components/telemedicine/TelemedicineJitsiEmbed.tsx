/**
 * Embedded Jitsi Meet call — free hosted SFU at meet.jit.si (or self-hosted via VITE_JITSI_DOMAIN).
 * Doctor and patient join the same room name derived from visitId.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type { JitsiMeetExternalAPI } from '../../types/jitsi';
import { getJitsiDomain, jitsiRoomName } from '../../services/telemedicineVideoConfig';

function loadJitsiScript(domain: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();

  const src = `https://${domain}/external_api.js`;
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Jitsi script failed')), { once: true });
      if (window.JitsiMeetExternalAPI) resolve();
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Jitsi Meet'));
    document.head.appendChild(script);
  });
}

export interface TelemedicineJitsiEmbedProps {
  visitId: string;
  displayName: string;
  active?: boolean;
  onJoined?: () => void;
  onApiReady?: (api: JitsiMeetExternalAPI) => void;
}

const TelemedicineJitsiEmbed: React.FC<TelemedicineJitsiEmbedProps> = ({
  visitId,
  displayName,
  active = true,
  onJoined,
  onApiReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetExternalAPI | null>(null);
  const onJoinedRef = useRef(onJoined);
  const onApiReadyRef = useRef(onApiReady);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onJoinedRef.current = onJoined;
    onApiReadyRef.current = onApiReady;
  }, [onJoined, onApiReady]);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    let cancelled = false;
    const domain = getJitsiDomain();
    const roomName = jitsiRoomName(visitId);

    const start = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadJitsiScript(domain);
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;

        apiRef.current?.dispose();
        containerRef.current.innerHTML = '';

        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName,
          width: '100%',
          height: '100%',
          parentNode: containerRef.current,
          userInfo: { displayName },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
            hideConferenceSubject: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            MOBILE_APP_PROMO: false,
            DISPLAY_WELCOME_FOOTER: false,
            HIDE_DEEP_LINKING_LOGO: true,
            JITSI_WATERMARK_LINK: '',
            BRAND_WATERMARK_LINK: '',
            DEFAULT_LOGO_URL: '',
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'desktop',
              'fullscreen',
              'hangup',
              'tileview',
              'settings',
            ],
          },
        });

        apiRef.current = api;
        onApiReadyRef.current?.(api);

        api.addListener('videoConferenceJoined', () => {
          if (!cancelled) {
            setLoading(false);
            onJoinedRef.current?.();
          }
        });

        api.addListener('readyToClose', () => {
          api.dispose();
          apiRef.current = null;
        });

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to start video call');
          setLoading(false);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [visitId, displayName, active]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-amber-400" />
        <p className="text-sm font-semibold text-slate-200">Video call could not start</p>
        <p className="text-xs text-slate-500">{error}</p>
        <p className="mt-2 text-[11px] text-slate-600">
          Room: {jitsiRoomName(visitId)} · {getJitsiDomain()}
        </p>
      </div>
    );
  }

  return (
    <div className="telemedicine-jitsi-zoom relative h-full min-h-[320px] w-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-900/90">
          <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
          <p className="text-xs text-slate-400">Connecting to video…</p>
        </div>
      )}
      <div ref={containerRef} className="telemedicine-jitsi-host h-full w-full" />
    </div>
  );
};

export default TelemedicineJitsiEmbed;
