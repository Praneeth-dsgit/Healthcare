/**
 * Chat Interface Component
 * Simplified chat interface for the floating General Health Assistant
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Menu, X, Stethoscope, FileText, Users, HelpCircle } from 'lucide-react';
import { Message } from '../../types';
import { getApiBaseUrl } from '../../utils/apiBase';
import ChatMessage from '../ChatMessage';
import LoadingDots from '../LoadingDots';

const ChatInterface: React.FC = () => {
  const loadMessagesFromStorage = (): Message[] => {
    try {
      const stored = localStorage.getItem('general_practitioner_chat_messages');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((msg: Message) => ({
          ...msg,
          timestamp: msg.timestamp || new Date().toISOString(),
        }));
      }
    } catch (error) {
      console.error('Error loading messages from storage:', error);
    }
    return [];
  };

  const saveMessagesToStorage = (msgs: Message[]) => {
    try {
      localStorage.setItem('general_practitioner_chat_messages', JSON.stringify(msgs));
    } catch (error) {
      console.error('Error saving messages to storage:', error);
    }
  };

  const [messages, setMessages] = useState<Message[]>(loadMessagesFromStorage);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (messages.length > 0) {
      saveMessagesToStorage(messages);
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showQuickOptions) {
        const target = event.target as HTMLElement;
        if (!target.closest('.quick-options-container')) {
          setShowQuickOptions(false);
        }
      }
    };

    if (showQuickOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showQuickOptions]);

  const handleQuickAction = async (query: string) => {
    if (isLoading) return;
    const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
    await handleSubmitWithQuery(query, syntheticEvent);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    await handleSubmitWithQuery(input.trim(), e);
  };

  const handleSubmitWithQuery = async (queryToSubmit: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!queryToSubmit.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: queryToSubmit.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const API_BASE = getApiBaseUrl();
      const { authenticatedFetch, getAuthHeaders } = await import('../../services/authService');
      const response = await authenticatedFetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: queryToSubmit.trim(),
          capability: 'general',
          patientInfo: null,
          fileContext: null,
          fileFindings: null,
          previousAiMessage: null,
          resetMessage: null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from server');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      let assistantContent = '';
      let hasStartedReceiving = false;

      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            let content = line.slice(6);
            if (content === '[DONE]') continue;

            if (content.startsWith('[ERROR]')) {
              throw new Error(content.slice(8));
            }

            if (!content) continue;

            let processedContent = content.replace(/\\n/g, '\n');
            processedContent = processedContent.replace(/\\t/g, '\t');
            processedContent = processedContent.replace(/\\\\/g, '\\');

            assistantContent += processedContent;
            hasStartedReceiving = true;

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
              )
            );
          }
        }
      }

      if (!hasStartedReceiving || !assistantContent.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: 'I apologize, but I encountered an error processing your request.' }
              : msg
          )
        );
      }
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActionClass =
    'w-full flex items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2.5 text-left text-xs text-slate-200 transition hover:border-sky-500/40 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="relative flex h-full flex-col bg-slate-950/40">
      <div className="hide-scrollbar flex-1 space-y-1 overflow-y-auto p-3 sm:p-4">
        {!hasMessages ? (
          <div className="flex h-full min-h-[200px] items-center justify-center px-2">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/15">
                <Stethoscope className="h-7 w-7 text-sky-300" />
              </div>
              <p className="text-sm font-semibold text-slate-100">General Health Assistant</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Ask about treatment protocols, medications, or conditions. Suggestions are grounded
                in the Medicine &amp; Condition Lookup database when relevant.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} variant="staff" />
          ))
        )}
        {isLoading && (
          <div className="flex items-start space-x-3 px-1">
            <div className="flex-shrink-0 rounded-full border border-sky-500/30 bg-sky-500/20 p-2.5 shadow-lg">
              <Stethoscope size={20} className="text-sky-300" />
            </div>
            <div className="max-w-[85%] rounded-lg rounded-tl-none border border-slate-700/50 bg-slate-800/95 p-3 shadow-md">
              <LoadingDots tone="dark" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="quick-options-container absolute bottom-[4.75rem] right-3 z-20">
        <div
          className={`absolute bottom-full right-0 mb-2 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/95 shadow-xl transition-all duration-300 ease-in-out ${
            showQuickOptions
              ? 'max-h-96 translate-y-0 opacity-100'
              : 'pointer-events-none max-h-0 translate-y-2 opacity-0'
          }`}
          style={{ width: '220px' }}
        >
          <div className="space-y-1 p-2">
            <button
              type="button"
              onClick={() => {
                handleQuickAction('Suggest medicines and first-line treatment for hypertension');
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className={quickActionClass}
            >
              <span>Medicine suggestions</span>
              <Stethoscope size={14} className="shrink-0 text-sky-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                handleQuickAction('What are the latest treatment protocols for common conditions?');
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className={quickActionClass}
            >
              <span>Treatment protocols</span>
              <Stethoscope size={14} className="shrink-0 text-sky-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                handleQuickAction('Help me understand diagnostic criteria for common conditions');
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className={quickActionClass}
            >
              <span>Diagnostic help</span>
              <FileText size={14} className="shrink-0 text-sky-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                handleQuickAction('What are the best practices for patient care management?');
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className={quickActionClass}
            >
              <span>Care management</span>
              <Users size={14} className="shrink-0 text-sky-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                handleQuickAction('I need help with a medical question');
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className={quickActionClass}
            >
              <span>General help</span>
              <HelpCircle size={14} className="shrink-0 text-sky-400" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowQuickOptions(!showQuickOptions)}
          disabled={isLoading}
          className="portal-accent-button flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          title="Quick actions"
        >
          {showQuickOptions ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="chat-glass-input shrink-0 border-t border-slate-700/50 p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask a clinical question…"
            className="form-field hide-scrollbar min-h-[40px] max-h-[120px] flex-1 resize-none py-2.5 text-sm"
            rows={1}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="portal-accent-button flex shrink-0 items-center justify-center rounded-lg px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;
