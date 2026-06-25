import type { MedicalRecord } from '../services/recordService';

/** Parse filename from Content-Disposition response header. */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8 = /filename\*=UTF-8''([^;\n]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1].trim();
  const plain = /filename=([^;\n]+)/i.exec(header);
  if (plain?.[1]) return plain[1].trim().replace(/^"|"$/g, '');
  return null;
}

/** Build a safe download filename when the server header is missing. */
export function getMedicalRecordDownloadName(record: MedicalRecord): string {
  const title = (record.title || `record-${record.record_id}`).trim();
  if (/\.(pdf|png|jpe?g|gif|webp|bmp)$/i.test(title)) {
    return title.replace(/[<>:"/\\|?*]+/g, '_');
  }

  const pathHint = record.file_url || '';
  const pathExt = pathHint.match(/\.(pdf|png|jpe?g|gif|webp)$/i)?.[0]?.toLowerCase();
  if (pathExt) {
    return `${title.replace(/[<>:"/\\|?*]+/g, '_')}${pathExt}`;
  }

  const ft = (record.file_type || '').toLowerCase();
  if (ft.includes('png')) return `${title}.png`;
  if (ft.includes('jpeg') || ft.includes('jpg')) return `${title}.jpg`;
  if (ft.includes('gif')) return `${title}.gif`;
  if (ft.includes('webp')) return `${title}.webp`;
  if (ft.includes('pdf')) return `${title}.pdf`;

  if (record.record_type === 'radiology_report') return `${title}.png`;
  if (record.record_type === 'lab_report') return `${title}.pdf`;
  return `${title}.pdf`;
}
