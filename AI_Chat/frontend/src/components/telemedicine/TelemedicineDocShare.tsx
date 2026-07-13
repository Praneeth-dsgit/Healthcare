import React, { useEffect, useState } from 'react';
import { FileText, Share2, Check } from 'lucide-react';
import { telemedicineService, type VisitDocument } from '../../services/telemedicineService';

interface TelemedicineDocShareProps {
  visitId: string;
}

const TelemedicineDocShare: React.FC<TelemedicineDocShareProps> = ({ visitId }) => {
  const [docs, setDocs] = useState<VisitDocument[]>([]);
  const [shared, setShared] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');

  useEffect(() => {
    telemedicineService.getDocuments().then((r) => setDocs(r.documents));
  }, []);

  const handleShare = async (doc: VisitDocument) => {
    await telemedicineService.shareDocument(visitId, doc);
    setShared((prev) => new Set(prev).add(doc.id));
    setToast(`Shared: ${doc.name}`);
    setTimeout(() => setToast(''), 2500);
  };

  return (
    <div className="flex h-full flex-col p-3">
      {toast && (
        <div className="mb-3 rounded-lg bg-teal-500/20 px-3 py-2 text-xs font-semibold text-teal-300">
          {toast}
        </div>
      )}
      <p className="mb-3 text-xs text-slate-400">Select documents to share during this visit</p>
      <div className="space-y-2 overflow-y-auto">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/50 p-3"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-teal-400" />
              <div>
                <p className="text-sm font-medium text-slate-200">{doc.name}</p>
                <p className="text-xs text-slate-500">
                  {doc.type} · {doc.size}
                </p>
              </div>
            </div>
            {shared.has(doc.id) ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <Check className="h-4 w-4" /> Shared
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleShare(doc)}
                className="ghost-button flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-teal-300"
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TelemedicineDocShare;
