"""Extract text/findings from stored medical record files (PDF/images)."""
import base64
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

PATIENT_RECORD_TYPES = (
    'lab_report',
    'radiology_report',
    'visit_summary',
    'discharge_summary',
    'prescription',
)


def resolve_record_file_path(record: Dict[str, Any]) -> Optional[str]:
    path = record.get('file_path') or record.get('file_url')
    if path and os.path.isfile(path):
        return path
    return None


def _capability_for_record(record: Dict[str, Any]) -> str:
    rtype = record.get('record_type') or ''
    if rtype == 'radiology_report':
        return 'radiology'
    if rtype == 'lab_report':
        return 'lab'
    return 'general'


def extract_text_from_pdf(file_path: str, max_chars: int = 15000) -> str:
    import fitz

    doc = fitz.open(file_path)
    try:
        text = '\n'.join(page.get_text() for page in doc).strip()
    finally:
        doc.close()
    if not text:
        return ''
    if len(text) > max_chars:
        return text[:max_chars] + '\n… [truncated]'
    return text


def extract_content_from_record_file(
    record: Dict[str, Any],
    max_chars: int = 2500,
    allow_image_vision: bool = True,
) -> str:
    """Return plain-text findings/results from description or stored file."""
    description = (record.get('description') or '').strip()
    if description:
        return description[:max_chars]

    file_path = resolve_record_file_path(record)
    if not file_path:
        return ''

    title = record.get('title') or 'Medical record'
    ext = os.path.splitext(file_path)[1].lower()
    capability = _capability_for_record(record)

    try:
        if ext == '.pdf':
            text = extract_text_from_pdf(file_path, max_chars=max_chars)
            if text:
                return text
            return (
                'PDF report is on file but text could not be extracted automatically. '
                'Please open the report in Medical Records or ask your care team.'
            )

        if allow_image_vision and ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'):
            with open(file_path, 'rb') as img_file:
                img_bytes = base64.b64encode(img_file.read())
            fmt = ext.lstrip('.').replace('jpg', 'jpeg')
            from services.file_service import interpret_image_with_openai

            analysis = interpret_image_with_openai(
                img_bytes, image_format=fmt, capability=capability
            )
            if analysis:
                return analysis[:max_chars]
            return f'Imaging study "{title}" is on file; automated reading did not return text.'

    except Exception as exc:
        logger.error('Failed to extract record file %s: %s', file_path, exc)
        return f'Could not read stored file for "{title}".'

    return ''


def enrich_record_dict(record: Dict[str, Any], **extract_kwargs) -> Dict[str, Any]:
    enriched = dict(record)
    content = extract_content_from_record_file(record, **extract_kwargs)
    if content and not (record.get('description') or '').strip():
        enriched['description'] = content
        enriched['content_from_file'] = True
    return enriched


def format_records_section(
    records: List[Dict[str, Any]],
    section_title: str,
    label: str,
    max_items: int = 10,
) -> str:
    if not records:
        return ''
    lines = [section_title]
    for idx, record in enumerate(records[:max_items], 1):
        title = record.get('title') or 'Medical record'
        vdate = record.get('visit_date') or record.get('created_at') or ''
        if hasattr(vdate, 'isoformat'):
            vdate = vdate.isoformat()[:10]
        else:
            vdate = str(vdate)[:10] if vdate else ''
        lines.append(f'{idx}. {title}' + (f' - {vdate}' if vdate else ''))
        content = (record.get('description') or '').strip()
        if content:
            lines.append(f'   {label}: {content}')
        elif resolve_record_file_path(record):
            lines.append(
                f'   {label}: Report file is on record; open Medical Records for the full document.'
            )
    return '\n'.join(lines)


def build_patient_portal_records_context(
    patient_id: str,
    max_records: int = 12,
    max_file_extractions: int = 6,
    max_chars_per_record: int = 2000,
) -> str:
    """
    Build lab/radiology/prescription context with file content for patient portal AI.
    """
    from config import db

    rows = db.session.execute(
        db.text(
            """
            SELECT
                mr.record_id,
                mr.record_type,
                mr.title,
                mr.description,
                mr.file_path,
                mr.file_type,
                mr.visit_date,
                mr.created_at,
                mr.family_member_id,
                fm.first_name AS family_member_first_name,
                fm.last_name AS family_member_last_name
            FROM medical_records mr
            LEFT JOIN family_members fm ON mr.family_member_id = fm.family_member_id
            WHERE mr.patient_id = :patient_id
            ORDER BY mr.visit_date DESC, mr.created_at DESC
            LIMIT :lim
            """
        ),
        {'patient_id': patient_id, 'lim': max_records},
    ).fetchall()

    if not rows:
        return ''

    records: List[Dict[str, Any]] = []
    extractions = 0
    for row in rows:
        rec = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
        for key in ('visit_date', 'created_at'):
            if rec.get(key) and hasattr(rec[key], 'isoformat'):
                rec[key] = rec[key].isoformat()
        needs_file = not (rec.get('description') or '').strip() and resolve_record_file_path(rec)
        if needs_file and extractions < max_file_extractions:
            rec = enrich_record_dict(
                rec,
                max_chars=max_chars_per_record,
                allow_image_vision=True,
            )
            if rec.get('content_from_file'):
                extractions += 1
        records.append(rec)

    patient_records = [r for r in records if not r.get('family_member_id')]
    family_records = [r for r in records if r.get('family_member_id')]

    sections: List[str] = []

    lab = [r for r in patient_records if r.get('record_type') == 'lab_report']
    rad = [r for r in patient_records if r.get('record_type') == 'radiology_report']
    visits = [
        r for r in patient_records
        if r.get('record_type') in ('visit_summary', 'discharge_summary')
    ]
    rx = [r for r in patient_records if r.get('record_type') == 'prescription']

    sections.append(
        format_records_section(
            lab,
            f'\nPATIENT LAB RESULTS & DIAGNOSTICS ({len(lab)} total):',
            'Results',
        )
    )
    sections.append(
        format_records_section(
            rad,
            f'\nPATIENT RADIOLOGY REPORTS ({len(rad)} total):',
            'Findings',
        )
    )
    sections.append(
        format_records_section(
            visits,
            f'\nPATIENT CLINICAL OBSERVATIONS ({len(visits)} total):',
            'Clinical Notes',
        )
    )
    sections.append(
        format_records_section(
            rx,
            f'\nPATIENT PRESCRIPTIONS ({len(rx)} total):',
            'Details',
        )
    )

    if family_records:
        sections.append(f'\nFAMILY MEMBER MEDICAL RECORDS ({len(family_records)} recent):')
        for idx, rec in enumerate(family_records[:8], 1):
            fm_name = f"{rec.get('family_member_first_name', '')} {rec.get('family_member_last_name', '')}".strip()
            title = rec.get('title') or 'Record'
            vdate = str(rec.get('visit_date') or '')[:10]
            line = f'{idx}. [{rec.get("record_type")}] {title} — {fm_name} ({vdate})'
            content = (rec.get('description') or '').strip()
            if content:
                line += f'\n   Summary: {content}'
            sections.append(line)

    return '\n'.join(s for s in sections if s).strip()


MAX_PATIENT_PORTAL_CONTEXT_CHARS = 24000


def truncate_patient_portal_context(
    text: str,
    max_chars: int = MAX_PATIENT_PORTAL_CONTEXT_CHARS,
) -> str:
    """Keep patient-portal chat prompts within a safe size for the model."""
    if not text or len(text) <= max_chars:
        return text or ''
    return (
        text[:max_chars].rstrip()
        + '\n\n[Some older record details were shortened to fit. Key patient data above is preserved.]'
    )


def augment_patient_portal_context(patient_id: str, client_context: str) -> str:
    """
    Append server-side record findings so patient chat has PDF/image content
    even when the frontend only sent metadata.

    When the frontend already sends a large record payload, skip vision
    extractions to avoid duplicating content and exceeding token limits.
    """
    client = (client_context or '').strip()
    record_markers = (
        'PATIENT LAB RESULTS',
        'PATIENT RADIOLOGY',
        'PATIENT PRESCRIPTIONS',
        'MEDICAL RECORD FINDINGS',
    )
    if client and any(marker in client for marker in record_markers) and len(client) >= 8000:
        return truncate_patient_portal_context(client)

    server_records = build_patient_portal_records_context(
        patient_id,
        max_records=6,
        max_file_extractions=2,
        max_chars_per_record=1200,
    )
    if not server_records:
        return truncate_patient_portal_context(client)
    banner = (
        '\n\n=== MEDICAL RECORD FINDINGS (from stored reports — use for lab/radiology answers) ===\n'
    )
    if client:
        return truncate_patient_portal_context(client + banner + server_records)
    return truncate_patient_portal_context(server_records)
