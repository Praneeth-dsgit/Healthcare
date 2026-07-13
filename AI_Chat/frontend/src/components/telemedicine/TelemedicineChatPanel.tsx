import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { telemedicineService, type VisitChatMessage } from '../../services/telemedicineService';

const CHAT_POLL_MS = 1000;

interface TelemedicineChatPanelProps {
  visitId: string;
  role: 'patient' | 'doctor';
  senderName?: string;
}

function mergeMessages(prev: VisitChatMessage[], incoming: VisitChatMessage[]): VisitChatMessage[] {
  if (incoming.length === 0) return prev;
  const ids = new Set(prev.map((m) => m.id));
  const added = incoming.filter((m) => !ids.has(m.id));
  if (added.length === 0) return prev;
  return [...prev, ...added].sort(
    (a, b) =>
      (a.at_ts ?? new Date(a.at).getTime() / 1000) -
      (b.at_ts ?? new Date(b.at).getTime() / 1000)
  );
}

const TelemedicineChatPanel: React.FC<TelemedicineChatPanelProps> = ({
  visitId,
  role,
  senderName,
}) => {
  const [messages, setMessages] = useState<VisitChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sinceRef = useRef(0);

  const displaySenderName =
    senderName || (role === 'patient' ? 'Patient' : 'Doctor');

  const appendMessages = useCallback((incoming: VisitChatMessage[]) => {
    setMessages((prev) => mergeMessages(prev, incoming));
  }, []);

  useEffect(() => {
    sinceRef.current = 0;
    setMessages([]);
    setLive(false);

    telemedicineService.getChatMessages(visitId, 0).then((r) => {
      appendMessages(r.messages);
      sinceRef.current = r.messages.reduce(
        (max, m) => Math.max(max, m.at_ts ?? new Date(m.at).getTime() / 1000),
        0
      );
      setLive(true);
    });

    const timer = setInterval(() => {
      void telemedicineService.pollChatMessages(visitId, sinceRef.current).then((r) => {
        if (r.messages.length > 0) {
          appendMessages(r.messages);
          sinceRef.current = r.latestSince;
        }
        setLive(true);
      });
    }, CHAT_POLL_MS);

    return () => clearInterval(timer);
  }, [visitId, appendMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const result = await telemedicineService.sendChatMessage(visitId, {
      sender: role,
      senderName: displaySenderName,
      text: text.trim(),
    });
    appendMessages([result.message]);
    sinceRef.current = Math.max(sinceRef.current, result.message.at_ts ?? Date.now() / 1000);
    setText('');
    setSending(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-700/40 px-3 py-2">
        <p className="text-xs font-semibold text-slate-300">Live chat</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            live ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'
          }`}
        >
          {live ? 'Connected' : 'Connecting…'}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-slate-500">
            Messages appear here for both patient and doctor in this visit.
          </p>
        ) : null}
        {messages.map((m) => {
          if (m.sender === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <p className="rounded-full bg-amber-500/10 px-3 py-1 text-center text-[10px] font-medium text-amber-200/90">
                  {m.text}
                </p>
              </div>
            );
          }
          const isMe = m.sender === role;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  isMe ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-200'
                }`}
              >
                {!isMe && m.senderName && (
                  <p className="mb-0.5 text-xs font-semibold text-teal-300">{m.senderName}</p>
                )}
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-slate-700/50 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Type a message…"
          className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <button type="button" onClick={handleSend} disabled={sending} className="primary-button rounded-xl px-3 py-2">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default TelemedicineChatPanel;
