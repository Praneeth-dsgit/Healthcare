/**
 * Live voice transcription during telemedicine visit.
 * Captures local mic speech and syncs final segments to the visit transcript.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from '../../types';
import {
  telemedicineService,
  type VisitTranscriptEntry,
} from '../../services/telemedicineService';

const POLL_MS = 2000;

interface TelemedicineLiveTranscriptProps {
  visitId: string;
  role: 'patient' | 'doctor';
  speakerName?: string;
  micEnabled?: boolean;
  active?: boolean;
  variant?: 'panel' | 'overlay';
}

const TelemedicineLiveTranscript: React.FC<TelemedicineLiveTranscriptProps> = ({
  visitId,
  role,
  speakerName,
  micEnabled = true,
  active = true,
  variant = 'panel',
}) => {
  const [entries, setEntries] = useState<VisitTranscriptEntry[]>([]);
  const [interim, setInterim] = useState('');
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastFinalRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sinceRef = useRef(0);

  const displayName = speakerName || (role === 'doctor' ? 'Doctor' : 'Patient');

  const mergeEntries = useCallback((incoming: VisitTranscriptEntry[]) => {
    setEntries((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const added = incoming.filter((e) => !ids.has(e.id));
      if (added.length === 0) return prev;
      return [...prev, ...added].sort(
        (a, b) =>
          (a.at_ts ?? new Date(a.at).getTime() / 1000) -
          (b.at_ts ?? new Date(b.at).getTime() / 1000)
      );
    });
  }, []);

  useEffect(() => {
    sinceRef.current = 0;
    setEntries([]);
    void telemedicineService.getTranscript(visitId).then((r) => {
      mergeEntries(r.entries);
      sinceRef.current = r.entries.reduce(
        (max, e) => Math.max(max, e.at_ts ?? new Date(e.at).getTime() / 1000),
        0
      );
    });

    const timer = setInterval(() => {
      void telemedicineService.getTranscript(visitId).then((r) => {
        const newer = r.entries.filter(
          (e) => (e.at_ts ?? new Date(e.at).getTime() / 1000) > sinceRef.current
        );
        if (newer.length > 0) {
          mergeEntries(newer);
          sinceRef.current = r.entries.reduce(
            (max, e) => Math.max(max, e.at_ts ?? new Date(e.at).getTime() / 1000),
            sinceRef.current
          );
        }
      });
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [visitId, mergeEntries]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, interim]);

  useEffect(() => {
    if (!active || !micEnabled) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setSupported(false);
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onstart = () => setRecording(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += text;
        } else {
          interimText += text;
        }
      }

      setInterim(interimText);

      if (finalChunk.trim()) {
        const combined = `${lastFinalRef.current} ${finalChunk}`.trim();
        lastFinalRef.current = combined;
        void telemedicineService.appendTranscript(visitId, {
          role,
          speakerName: displayName,
          text: finalChunk.trim(),
          isFinal: true,
        });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Transcript recognition error:', event.error);
      }
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
      setInterim('');
      if (active && micEnabled) {
        try {
          recognition.start();
        } catch {
          /* restart after brief pause */
        }
      }
    };

    try {
      recognition.start();
    } catch {
      setSupported(false);
    }

    return () => {
      recognition.onend = null;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [visitId, role, displayName, active, micEnabled]);

  if (!supported) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700/50 bg-slate-950/80 px-3 py-4 text-center text-[10px] text-slate-500">
        Live transcript unavailable in this browser.
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 flex-col rounded-xl border border-slate-700/60 bg-slate-950/90 ${
        variant === 'panel' ? 'h-full' : 'max-h-36 backdrop-blur-sm'
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2">
        {recording ? (
          <Mic className="h-3.5 w-3.5 animate-pulse text-red-400" />
        ) : (
          <MicOff className="h-3.5 w-3.5 text-slate-500" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Live transcript
        </span>
        {recording && (
          <span className="ml-auto text-[10px] text-red-300/80">Recording</span>
        )}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {entries.length === 0 && !interim && (
          <p className="text-[11px] text-slate-500">
            Conversation will appear here as you speak…
          </p>
        )}
        {entries.map((e) => (
          <p key={e.id} className="mb-1 text-[11px] leading-relaxed text-slate-300">
            <span
              className={`font-semibold ${
                e.role === 'doctor' ? 'text-teal-300' : 'text-sky-300'
              }`}
            >
              {e.speakerName || e.role}:
            </span>{' '}
            {e.text}
          </p>
        ))}
        {interim && (
          <p className="text-[11px] italic text-slate-500">
            <span className="font-semibold text-slate-400">{displayName}:</span> {interim}…
          </p>
        )}
      </div>
    </div>
  );
};

export default TelemedicineLiveTranscript;
