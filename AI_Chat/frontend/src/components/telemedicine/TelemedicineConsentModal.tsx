import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, X } from 'lucide-react';

interface TelemedicineConsentModalProps {
  open: boolean;
  consentText: string;
  onAccept: () => void;
  onClose: () => void;
}

const TelemedicineConsentModal: React.FC<TelemedicineConsentModalProps> = ({
  open,
  consentText,
  onAccept,
  onClose,
}) => {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (open) setAccepted(false);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="telehealth-consent-title"
    >
      <div className="premium-card max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15">
              <Shield className="h-5 w-5 text-teal-300" />
            </div>
            <div>
              <h2 id="telehealth-consent-title" className="text-lg font-bold text-slate-100">
                Telehealth Consent
              </h2>
              <p className="text-sm text-slate-400">Required before joining your telemedicine session</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="ghost-button rounded-lg p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-700/50 p-4 hover:border-teal-500/30">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 shrink-0"
          />
          <span className="text-sm leading-relaxed text-slate-300">{consentText}</span>
        </label>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="ghost-button flex-1 rounded-xl py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={!accepted}
            onClick={onAccept}
            className="primary-button flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            Accept & Join
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TelemedicineConsentModal;
