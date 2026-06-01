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
  variant?: 'default' | 'staff';
}

const FaqDropdown: React.FC<FaqDropdownProps> = ({
  capability,
  sessionId,
  onSelectPrompt,
  disabled = false,
  className = '',
  variant = 'staff',
}) => {
  const [open, setOpen] = useState(false);
  const [faqs, setFaqs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isStaff = variant === 'staff';

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

  const triggerClass = isStaff
    ? 'flex items-center gap-1 rounded-lg border border-slate-600/80 bg-slate-800/80 px-2 py-1.5 text-sm font-medium text-slate-200 hover:border-[var(--portal-accent)] hover:bg-slate-700/80 focus:outline-none focus:ring-2 focus:ring-[var(--portal-accent)] disabled:cursor-not-allowed disabled:opacity-50'
    : 'flex items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50';

  const panelClass = isStaff
    ? 'faq-dropdown-panel absolute bottom-full right-0 z-50 mb-1 max-h-80 w-72 overflow-hidden rounded-xl shadow-xl'
    : 'absolute bottom-full right-0 z-50 mb-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg';

  const headerClass = isStaff
    ? 'flex items-center justify-between border-b border-slate-600 p-2'
    : 'flex items-center justify-between border-b border-gray-100 p-2';

  const headerLabelClass = isStaff ? 'text-xs font-medium text-slate-400' : 'text-xs font-medium text-gray-600';

  const itemClass = isStaff
    ? 'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-sky-500/10 hover:text-slate-100'
    : 'flex w-full items-start gap-2 rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-blue-50';

  const loadingClass = isStaff ? 'py-3 text-center text-sm text-slate-500' : 'py-3 text-center text-sm text-gray-500';

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        title={`${getCapabilityLabel(capability)} FAQs`}
        className={`${triggerClass} ${className}`}
      >
        FAQs
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={panelClass}>
          <div className={headerClass}>
            <span className={headerLabelClass}>{getCapabilityLabel(capability)} FAQs</span>
            <button
              type="button"
              onClick={() => {
                if (capability && sessionId) {
                  setLoading(true);
                  fetchFaqs(capability, sessionId).then((list) => {
                    setFaqs(list);
                    setLoading(false);
                  });
                }
              }}
              disabled={loading}
              className={
                isStaff
                  ? 'rounded p-1 text-slate-500 hover:text-sky-300 disabled:opacity-50'
                  : 'p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50'
              }
              title="Refresh"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto p-1 hide-scrollbar">
            {loading ? (
              <div className={loadingClass}>Loading...</div>
            ) : (
              prompts.map((prompt, i) => (
                <button key={i} type="button" onClick={() => {
                  setOpen(false);
                  onSelectPrompt(prompt);
                }} className={itemClass}>
                  <PlusCircle
                    size={14}
                    className={`mt-0.5 shrink-0 ${isStaff ? 'text-slate-500' : 'text-gray-400'}`}
                  />
                  <span className="line-clamp-3">{prompt}</span>
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
