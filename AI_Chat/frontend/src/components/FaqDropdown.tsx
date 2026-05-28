import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, PlusCircle } from 'lucide-react';
import { fetchFaqs, getDefaultFaqs, getCapabilityLabel } from '../utils/faqs';

interface FaqDropdownProps {
  capability: string | null;
  sessionId: string | null;
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
  /** Optional class for the trigger button */
  className?: string;
}

const FaqDropdown: React.FC<FaqDropdownProps> = ({
  capability,
  sessionId,
  onSelectPrompt,
  disabled = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [faqs, setFaqs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && capability && sessionId) {
      setLoading(true);
      fetchFaqs(capability, sessionId).then((list) => {
        setFaqs(list);
        setLoading(false);
      });
    } else {
      setFaqs(capability ? getDefaultFaqs(capability) : []);
    }
  }, [open, capability, sessionId]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const prompts = faqs.length > 0 ? faqs : (capability ? getDefaultFaqs(capability) : []);

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        title={getCapabilityLabel(capability) + ' FAQs'}
        className={`flex items-center gap-1 px-2 py-1.5 rounded text-sm font-medium border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        FAQs
        <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          <div className="p-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">{getCapabilityLabel(capability)} FAQs</span>
            <button
              type="button"
              onClick={() => {
                if (capability && sessionId) {
                  setLoading(true);
                  fetchFaqs(capability, sessionId).then((list) => { setFaqs(list); setLoading(false); });
                }
              }}
              disabled={loading}
              className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="p-1 space-y-0.5 max-h-64 overflow-y-auto">
            {loading ? (
              <div className="text-center py-3 text-gray-500 text-sm">Loading...</div>
            ) : (
              prompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelectPrompt(prompt);
                  }}
                  className="w-full text-left px-2 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded flex items-start gap-2"
                >
                  <PlusCircle size={14} className="flex-shrink-0 mt-0.5 text-gray-400" />
                  <span className="truncate">{prompt}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FaqDropdown;
