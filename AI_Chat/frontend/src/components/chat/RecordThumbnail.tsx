import React, { useEffect, useState } from 'react';
import { FileText, ImageIcon, Loader2 } from 'lucide-react';
import { recordService, MedicalRecord } from '../../services/recordService';

interface RecordThumbnailProps {
  record: Pick<MedicalRecord, 'record_id' | 'title' | 'file_type' | 'file_url'>;
}

/** Lazily loads an authenticated image blob so records can render as tiles/previews. */
const RecordThumbnail: React.FC<RecordThumbnailProps> = ({ record }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = (record.file_type || '').startsWith('image/');

  useEffect(() => {
    if (!isImage || !record.file_url) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    recordService
      .downloadRecord(record.record_id)
      .then((res) => {
        if (cancelled) return;
        if (res) {
          objectUrl = URL.createObjectURL(res.blob);
          setUrl(objectUrl);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record.record_id, record.file_url, isImage]);

  if (isImage && url && !failed) {
    return (
      <img
        src={url}
        alt={record.title}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-500">
      {isImage && !failed ? (
        <Loader2 size={20} className="animate-spin" />
      ) : isImage ? (
        <ImageIcon size={22} className="text-sky-400" />
      ) : (
        <FileText size={22} className="text-amber-400" />
      )}
      <span className="px-1 text-center text-[9px] uppercase tracking-wide">
        {(record.file_type || 'file').split('/').pop()}
      </span>
    </div>
  );
};

export default RecordThumbnail;
