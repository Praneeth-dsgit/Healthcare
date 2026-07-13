import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Video, Mic, MicOff, VideoOff, PhoneOff, MessageSquare, FileText,
  Pill, CreditCard, ChevronDown, ChevronUp, User, Monitor, CheckCircle,
} from 'lucide-react';
import BandwidthIndicator from './BandwidthIndicator';
import TelemedicineChatPanel from './TelemedicineChatPanel';
import TelemedicineDocShare from './TelemedicineDocShare';
import TelemedicinePrescribePanel from './TelemedicinePrescribePanel';
import TelemedicinePrescriptionView from './TelemedicinePrescriptionView';
import TelemedicinePaymentPanel from './TelemedicinePaymentPanel';
import TelemedicineLiveTranscript from './TelemedicineLiveTranscript';
import {
  telemedicineService,
  type TelemedicineVisit,
  type VisitAuditEvent,
  type VisitPayment,
  type BandwidthQuality,
} from '../../services/telemedicineService';
import {
  TelemedicinePeerConnection,
  type LanPeerStatus,
  getLanJoinUrl,
  resolveTelemedicineVisitId,
} from '../../services/telemedicinePeerService';
import TelemedicineJitsiEmbed from './TelemedicineJitsiEmbed';
import {
  getTelemedicineVideoProvider,
  jitsiRoomName,
} from '../../services/telemedicineVideoConfig';
import type { JitsiMeetExternalAPI } from '../../types/jitsi';

type DrawerTab = 'chat' | 'docs' | 'rx' | 'payment';

interface TelemedicineRoomProps {
  role?: 'patient' | 'doctor';
  visitId?: string;
  onExit?: () => void;
}

const TelemedicineRoom: React.FC<TelemedicineRoomProps> = ({
  role = 'patient',
  visitId: visitIdProp,
  onExit,
}) => {
  const { visitId: routeVisitId } = useParams<{ visitId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<TelemedicinePeerConnection | null>(null);
  const jitsiApiRef = useRef<JitsiMeetExternalAPI | null>(null);
  const videoProvider = getTelemedicineVideoProvider();
  const useJitsi = videoProvider === 'jitsi';
  const [visit, setVisit] = useState<TelemedicineVisit | null>(null);
  const [jitsiConnected, setJitsiConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [lanStatus, setLanStatus] = useState<LanPeerStatus>({ state: 'checking' });
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('chat');
  const [drawerOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<VisitAuditEvent[]>([]);
  const [bandwidth, setBandwidth] = useState<BandwidthQuality>('good');
  const [elapsed, setElapsed] = useState(0);
  const [cameraError, setCameraError] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<VisitPayment | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [prescriptionSent, setPrescriptionSent] = useState(false);
  const lastPaymentStatus = useRef<string>('pending');

  const id = resolveTelemedicineVisitId(location.pathname, visitIdProp || routeVisitId);
  const counterpartyName =
    role === 'patient'
      ? visit?.doctorName || 'Doctor'
      : visit?.patientName || 'Patient';
  const sessionTitle =
    role === 'patient'
      ? `Telemedicine with ${counterpartyName}`
      : `Patient visit · ${counterpartyName}`;

  const drawerTabs: { id: DrawerTab; label: string; icon: React.ElementType }[] =
    role === 'doctor'
      ? [
          { id: 'chat', label: 'Chat', icon: MessageSquare },
          { id: 'docs', label: 'Documents', icon: FileText },
          { id: 'rx', label: 'Prescribe', icon: Pill },
        ]
      : [
          { id: 'chat', label: 'Chat', icon: MessageSquare },
          { id: 'docs', label: 'Documents', icon: FileText },
          { id: 'rx', label: 'Prescription', icon: Pill },
          { id: 'payment', label: 'Payment', icon: CreditCard },
        ];

  useEffect(() => {
    if (!id) return;
    telemedicineService.getVisit(id).then((r) => r.visit && setVisit(r.visit));
    telemedicineService.joinVisit(id, role);
    telemedicineService.getAuditLog(id).then((r) => setAuditLog(r.events));
    setBandwidth(telemedicineService.getSimulatedBandwidth());

    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [id, role]);

  useEffect(() => {
    if (!id || role !== 'doctor') return;

    const pollPayment = () => {
      void telemedicineService.getPayment(id).then((r) => {
        const payment = r.payment;
        if (!payment) return;
        if (payment.status === 'paid' && lastPaymentStatus.current !== 'paid') {
          setPaymentNotice(payment);
        }
        lastPaymentStatus.current = payment.status;
      });
    };

    pollPayment();
    const timer = setInterval(pollPayment, 3000);
    return () => clearInterval(timer);
  }, [id, role]);

  useEffect(() => {
    if (!id || sessionEnded || useJitsi) return;

    const peer = new TelemedicinePeerConnection(
      id,
      role,
      (stream) => {
        setRemoteStream(stream);
      },
      (status) => {
        setLanStatus(status);
        if (status.state === 'failed' && status.error?.includes('permission')) {
          setCameraError(true);
        }
        const local = peer.getLocalStream();
        if (local && localVideoRef.current) {
          localVideoRef.current.srcObject = local;
          setCameraError(false);
        }
      }
    );
    peerRef.current = peer;
    void peer.start();

    return () => {
      void peer.stop();
      peerRef.current = null;
    };
  }, [id, role, sessionEnded, useJitsi]);

  useEffect(() => {
    if (useJitsi) return;
    const video = remoteVideoRef.current;
    const audio = remoteAudioRef.current;
    if (!remoteStream) return;
    if (video) {
      video.srcObject = remoteStream;
      void video.play().catch(() => undefined);
    }
    if (audio) {
      audio.srcObject = remoteStream;
      void audio.play().catch(() => undefined);
    }
  }, [remoteStream, useJitsi]);

  useEffect(() => {
    if (useJitsi) return;
    peerRef.current?.setMicEnabled(micOn);
  }, [micOn, useJitsi]);

  useEffect(() => {
    if (useJitsi) return;
    peerRef.current?.setCameraEnabled(camOn);
    const local = peerRef.current?.getLocalStream();
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = camOn ? local ?? null : null;
    }
    if (!camOn) setCameraError(false);
  }, [camOn, useJitsi]);

  useEffect(() => {
    if (useJitsi || lanStatus.state !== 'unavailable' || sessionEnded) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (localVideoRef.current && camOn) localVideoRef.current.srcObject = s;
        setCameraError(false);
      })
      .catch(() => setCameraError(true));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [lanStatus.state, camOn, sessionEnded, useJitsi]);

  const jitsiDisplayName =
    role === 'patient'
      ? visit?.patientName || 'Patient'
      : visit?.doctorName || 'Doctor';

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const exitRoom = () => {
    if (onExit) onExit();
    else navigate(role === 'patient' ? '/portal/telemedicine' : '/app/general');
  };

  const handleEnd = async () => {
    if (useJitsi) {
      jitsiApiRef.current?.executeCommand('hangup');
      jitsiApiRef.current?.dispose();
      jitsiApiRef.current = null;
    } else {
      await peerRef.current?.stop();
    }
    await telemedicineService.endVisit(id);

    if (role === 'doctor') {
      setSessionEnded(true);
      setDrawerTab('rx');
      return;
    }

    exitRoom();
  };

  const lanStatusLabel = (() => {
    switch (lanStatus.state) {
      case 'checking':
        return 'Checking LAN signaling…';
      case 'waiting_peer':
        return 'Waiting for peer on the same network…';
      case 'connecting':
        return 'Establishing peer-to-peer connection…';
      case 'connected':
        return 'LAN peer connected';
      case 'unavailable':
        return 'LAN signaling offline — preview mode';
      case 'failed':
        return (
          lanStatus.error?.includes('ICE') || lanStatus.error?.includes('Connection failed')
            ? `${lanStatus.error} — try same Wi‑Fi or configure TURN for remote networks`
            : lanStatus.error || 'Connection failed'
        );
      default:
        return '';
    }
  })();

  const peerJoinUrl = id
    ? getLanJoinUrl(id, role === 'patient' ? 'doctor' : 'patient')
    : '';

  if (!id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-slate-200">
        <p className="mb-4 text-sm">No visit selected.</p>
        <button
          type="button"
          onClick={() => navigate(role === 'patient' ? '/portal/telemedicine' : '/app/general')}
          className="primary-button rounded-lg px-4 py-2 text-sm"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Video className="h-5 w-5 text-teal-400" />
          <div>
            <p className="text-sm font-bold">{sessionTitle}</p>
            <p className="text-xs text-slate-400">
              {role === 'patient' ? visit?.specialty : 'Telemedicine'} · {formatTime(elapsed)}
              {sessionEnded && role === 'doctor' && (
                <span className="ml-2 text-amber-300">· Session ended</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!sessionEnded && (
            <span
              className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline ${
                useJitsi
                  ? jitsiConnected
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-sky-500/15 text-sky-300'
                  : lanStatus.state === 'connected'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : lanStatus.state === 'unavailable'
                      ? 'bg-slate-500/15 text-slate-400'
                      : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {useJitsi
                ? jitsiConnected
                  ? `Video connected · ${jitsiRoomName(id)}`
                  : 'Joining Jitsi Meet…'
                : lanStatusLabel}
            </span>
          )}
          <BandwidthIndicator quality={lanStatus.state === 'connected' ? 'good' : bandwidth} />
          {!sessionEnded && (
            <span className="hidden rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300 sm:inline">
              Recording per policy
            </span>
          )}
        </div>
      </div>

      {role === 'doctor' && paymentNotice?.status === 'paid' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>
            Payment received — ₹{paymentNotice.amount}
            {paymentNotice.paidAt && (
              <span className="ml-2 text-xs text-emerald-300/80">
                {new Date(paymentNotice.paidAt).toLocaleTimeString()}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setPaymentNotice(null)}
            className="ml-auto text-xs text-emerald-300/80 hover:text-emerald-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 flex-col bg-slate-900 p-3 lg:p-4">
            {!sessionEnded && useJitsi && (
              <div className="mb-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-1.5 text-[10px] text-sky-200/80">
                Room <span className="font-mono text-sky-100">{jitsiRoomName(id)}</span>
                {' · '}
                <span className="break-all font-mono">{peerJoinUrl}</span>
              </div>
            )}
            {!sessionEnded && !useJitsi && lanStatus.state === 'waiting_peer' && (
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
                <p className="font-semibold">Same Wi‑Fi / LAN setup</p>
                <p className="mt-1 text-amber-200/80">
                  Open this visit on the other device:{' '}
                  <span className="break-all font-mono text-[11px] text-amber-100">{peerJoinUrl}</span>
                </p>
              </div>
            )}

            <div className="flex min-h-0 flex-1 gap-2 lg:gap-3">
              {!sessionEnded && (
                <div className="flex w-28 shrink-0 flex-col min-h-0 sm:w-32 lg:w-36">
                  <TelemedicineLiveTranscript
                    visitId={id}
                    role={role}
                    speakerName={
                      role === 'patient'
                        ? visit?.patientName || 'Patient'
                        : visit?.doctorName || 'Doctor'
                    }
                    micEnabled={micOn}
                    active={!sessionEnded}
                    variant="panel"
                  />
                </div>
              )}

              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 ring-1 ring-slate-700">
              {!sessionEnded && useJitsi && (
                <TelemedicineJitsiEmbed
                  visitId={id}
                  displayName={jitsiDisplayName}
                  active={!sessionEnded}
                  onJoined={() => setJitsiConnected(true)}
                  onApiReady={(api) => {
                    jitsiApiRef.current = api;
                  }}
                />
              )}
              {!sessionEnded && !useJitsi && (
                <>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`h-full w-full object-cover ${remoteStream ? 'opacity-100' : 'opacity-0'}`}
                  />
                  <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />
                </>
              )}
              {!sessionEnded && !useJitsi && !remoteStream && (
                <div className="absolute inset-0 flex items-center justify-center text-center">
                  <div>
                    <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-sky-500/20">
                      <User className="h-12 w-12 text-sky-300" />
                    </div>
                    <p className="font-semibold text-slate-200">{counterpartyName}</p>
                    <p className="text-sm text-slate-500">{lanStatusLabel}</p>
                  </div>
                </div>
              )}
              {sessionEnded && (
                <div className="flex flex-1 items-center justify-center px-6 text-center">
                  <div>
                    <Pill className="mx-auto mb-3 h-12 w-12 text-teal-400/60" />
                    <p className="font-semibold text-slate-200">Review prescription</p>
                    <p className="mt-1 text-sm text-slate-500">
                      AI draft generated from visit transcript. Edit and send to patient.
                    </p>
                  </div>
                </div>
              )}

              {!sessionEnded && !useJitsi && (
                <div className="absolute bottom-6 right-6 h-28 w-40 overflow-hidden rounded-xl border-2 border-teal-500/40 bg-slate-950 shadow-xl">
                  {camOn && !cameraError ? (
                    <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-xs text-slate-500">
                      <VideoOff className="mb-1 h-5 w-5" />
                      {cameraError ? 'Camera unavailable' : 'Camera off'}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-center gap-3 border-t border-slate-800 px-4 py-4">
            {!sessionEnded ? (
              <>
                {!useJitsi && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMicOn(!micOn)}
                      className={`flex h-12 w-12 items-center justify-center rounded-full ${micOn ? 'bg-slate-700' : 'bg-red-500/80'}`}
                    >
                      {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCamOn(!camOn)}
                      className={`flex h-12 w-12 items-center justify-center rounded-full ${camOn ? 'bg-slate-700' : 'bg-red-500/80'}`}
                    >
                      {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                    </button>
                    <button type="button" className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700" title="Share screen">
                      <Monitor className="h-5 w-5" />
                    </button>
                  </>
                )}
                {useJitsi && (
                  <p className="hidden text-xs text-slate-500 sm:block">
                    Use the Jitsi toolbar for mic, camera &amp; screen share
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleEnd}
                  className="flex h-12 items-center gap-2 rounded-full bg-red-600 px-5 font-semibold hover:bg-red-500"
                >
                  <PhoneOff className="h-5 w-5" /> End visit
                </button>
              </>
            ) : role === 'doctor' ? (
              <button
                type="button"
                onClick={exitRoom}
                className="flex h-12 items-center gap-2 rounded-full bg-slate-700 px-5 font-semibold hover:bg-slate-600"
              >
                {prescriptionSent ? 'Done — exit' : 'Exit without prescribing'}
              </button>
            ) : null}
          </div>

          <div className="border-t border-slate-800 px-4 py-2">
            <button
              type="button"
              onClick={() => setAuditOpen(!auditOpen)}
              className="flex w-full items-center justify-between text-xs font-semibold text-slate-400"
            >
              Audit log ({auditLog.length} events)
              {auditOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {auditOpen && (
              <div className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-slate-500">
                {auditLog.map((e, i) => (
                  <p key={i}>
                    {new Date(e.at).toLocaleTimeString()} — {e.action}
                    {e.detail ? `: ${e.detail}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {drawerOpen && (
          <div className="flex w-full shrink-0 flex-col border-t border-slate-800 lg:w-72 xl:w-80 lg:max-w-[20rem] lg:border-l lg:border-t-0">
            <div className="flex shrink-0 border-b border-slate-800">
              {drawerTabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDrawerTab(t.id)}
                    className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${
                      drawerTab === t.id ? 'text-teal-300 border-b-2 border-teal-400' : 'text-slate-500'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="min-h-[160px] flex-1 overflow-hidden lg:min-h-0">
              {drawerTab === 'chat' && (
                <TelemedicineChatPanel
                  visitId={id}
                  role={role}
                  senderName={
                    role === 'patient'
                      ? visit?.patientName || 'Patient'
                      : visit?.doctorName || 'Doctor'
                  }
                />
              )}
              {drawerTab === 'docs' && <TelemedicineDocShare visitId={id} />}
              {drawerTab === 'rx' && role === 'doctor' && (
                <TelemedicinePrescribePanel
                  visitId={id}
                  doctorName={visit?.doctorName}
                  patientName={visit?.patientName}
                  patientId={visit?.patientId}
                  sessionEnded={sessionEnded}
                  onFinalized={() => setPrescriptionSent(true)}
                />
              )}
              {drawerTab === 'rx' && role === 'patient' && (
                <TelemedicinePrescriptionView visitId={id} />
              )}
              {drawerTab === 'payment' && role === 'patient' && (
                <TelemedicinePaymentPanel visitId={id} fee={visit?.fee || 800} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelemedicineRoom;
