/**
 * Floating Chat Bot Button
 * Opens the chat interface in a modal/overlay
 * Used in General Practitioner Dashboard - shows "General Health Assistant"
 */

import React, { useState } from 'react';
import { MessageSquare, X, Minimize2, Maximize2 } from 'lucide-react';
import ChatInterface from './ChatInterface';

const FloatingChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const toggleChat = () => {
    setIsOpen(!isOpen);
    setIsMinimized(false);
  };

  const minimizeChat = () => {
    setIsMinimized(true);
  };

  const maximizeChat = () => {
    setIsMinimized(false);
  };

  const closeChat = () => {
    try {
      localStorage.removeItem('general_practitioner_chat_messages');
    } catch (error) {
      console.error('Error clearing chat messages:', error);
    }
    setIsOpen(false);
    setIsMinimized(false);
    setShowCloseConfirm(false);
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCloseConfirm(true);
  };

  return (
    <div data-portal="doctor" className="general-health-assistant">
      {!isOpen && (
        <button
          type="button"
          onClick={toggleChat}
          className="portal-accent-button group fixed bottom-6 right-6 z-50 flex items-center justify-center overflow-hidden rounded-full px-4 py-4 shadow-lg transition-all duration-200 hover:scale-105"
          aria-label="Open General Health Assistant"
        >
          <div className="flex items-center gap-0 transition-all duration-300 group-hover:gap-3">
            <MessageSquare
              size={24}
              className="flex-shrink-0 text-slate-900 transition-transform duration-300 group-hover:-rotate-12"
            />
            <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold text-slate-900 opacity-0 transition-all duration-300 group-hover:max-w-[200px] group-hover:opacity-100">
              General Health Assistant
            </span>
          </div>
        </button>
      )}

      {isOpen && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6">
          <div
            className={`premium-card pointer-events-auto flex flex-col overflow-hidden border border-sky-500/25 shadow-2xl transition-all duration-300 ${
              isMinimized
                ? 'h-14 w-[min(100vw-2rem,320px)] cursor-pointer'
                : 'h-[min(600px,85vh)] w-[min(100vw-2rem,420px)]'
            }`}
            onClick={() => isMinimized && maximizeChat()}
            role="dialog"
            aria-label="General Health Assistant"
          >
            <div
              className={`flex shrink-0 items-center justify-between border-b border-sky-500/20 ${
                isMinimized
                  ? 'bg-slate-900/90 px-4 py-2'
                  : 'bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/60 px-4 py-3'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/20">
                  <MessageSquare size={16} className="text-sky-300" />
                </div>
                <h3 className="truncate text-sm font-semibold text-slate-100">
                  {isMinimized ? (
                    <span className="text-sky-300">General Health Assistant</span>
                  ) : (
                    'General Health Assistant'
                  )}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMinimized) {
                      maximizeChat();
                    } else {
                      minimizeChat();
                    }
                  }}
                  className="ghost-button rounded-lg p-1.5 text-slate-300 hover:text-sky-200"
                  aria-label={isMinimized ? 'Maximize' : 'Minimize'}
                  title={isMinimized ? 'Maximize' : 'Minimize'}
                >
                  {isMinimized ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
                </button>
                {!isMinimized && (
                  <button
                    type="button"
                    onClick={handleCloseClick}
                    className="ghost-button rounded-lg p-1.5 text-slate-300 hover:text-red-300"
                    aria-label="Close"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            <div
              className={`relative min-h-0 flex-1 overflow-hidden transition-opacity duration-200 ${
                isMinimized ? 'pointer-events-none h-0 opacity-0' : 'opacity-100'
              }`}
            >
              <ChatInterface />

              {showCloseConfirm && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
                  <div className="premium-card w-full max-w-xs border border-sky-500/20 p-5 text-center">
                    <p className="mb-4 text-sm text-slate-300">
                      Closing will clear chat history. Continue?
                    </p>
                    <div className="flex justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowCloseConfirm(false)}
                        className="btn-secondary rounded-lg px-4 py-2 text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={closeChat}
                        className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isOpen && !isMinimized && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={minimizeChat}
          aria-hidden
        />
      )}
    </div>
  );
};

export default FloatingChatBot;
