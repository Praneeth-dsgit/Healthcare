"""Load patient profile and medical records from the database for staff AI chat."""
import logging
import os
from typing import Any, Dict, List, Optional

from db_read_agent import DatabaseAgent

logger = logging.getLogger(__name__)

RECORD_TYPES_BY_CAPABILITY = {
    'lab': ['lab_report', 'visit_summary', 'discharge_summary', 'prescription', 'other'],
    'radiology': ['radiology_report', 'visit_summary', 'discharge_summary', 'other'],
    'general': None,
}

ANALYZE_RECORD_HINTS = (
    'analyze', 'ananlyze', 'analyse', 'interpret', 'report', 'findings', 'above', 'review',
    'explain', 'what does', 'summarize', 'read the', 'this scan', 'the scan', 'this image',
    'scan', 'x-ray', 'xray', 'mri', 'ct', 'imaging', 'radiolog',
)

PRIMARY_RECORD_TYPE = {
    'radiology': 'radiology_report',
    'lab': 'lab_report',
}


def _calculate_age(dob) -> int:
    if not dob:
        return 0
    from datetime import date, datetime

    if isinstance(dob, str):
        try:
            dob = datetime.strptime(dob[:10], '%Y-%m-%d').date()
        except ValueError:
            return 0
    if not isinstance(dob, date):
        return 0
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def build_patient_info_from_db(
    patient_id: str,
    capability: str = 'general',
) -> Optional[Dict[str, Any]]:
    """Return patient_info dict (camelCase keys) including medicalRecords for AI prompts."""
    agent = DatabaseAgent()
    patient = agent.get_patient_by_identifier(patient_id)
    if not patient:
        return None

    record_types = RECORD_TYPES_BY_CAPABILITY.get(capability)
    medical_records = agent.get_medical_records_for_patient(
        patient_id,
        record_types=record_types,
        limit=25,
    )

    age = patient.get('age') or _calculate_age(patient.get('dob'))
    weight = float(patient.get('weight_kg') or 0)
    height = float(patient.get('height_cm') or 0)

    return {
        'age': age or 0,
        'weight': weight,
        'height': height or 170,
        'gender': (patient.get('gender') or 'other').lower(),
        'bloodPressure': '',
        'allergies': patient.get('allergies') or '',
        'medications': patient.get('medications') or '',
        'medicalHistory': patient.get('medical_history') or '',
        'patientName': f"{patient.get('first_name', '')} {patient.get('last_name', '')}".strip(),
        'patientId': patient.get('patient_id') or patient_id,
        'phone': patient.get('phone', ''),
        'email': patient.get('email', ''),
        'dob': str(patient.get('dob', '')) if patient.get('dob') else '',
        'bloodType': patient.get('blood_type', ''),
        'bmi': float(patient['bmi']) if patient.get('bmi') else None,
        'recentAppointments': patient.get('recent_appointments', []),
        'medicalRecords': medical_records,
    }


def _should_load_stored_record_content(user_message: str) -> bool:
    msg = (user_message or '').lower()
    return any(hint in msg for hint in ANALYZE_RECORD_HINTS)


def _pick_primary_record(records: List[Dict], capability: str) -> Optional[Dict]:
    primary_type = PRIMARY_RECORD_TYPE.get(capability)
    if not primary_type:
        return None
    for rec in records:
        if rec.get('record_type') == primary_type and rec.get('file_path'):
            return rec
    for rec in records:
        if rec.get('file_path'):
            return rec
    return None


def _pick_records_by_ids(
    records: List[Dict],
    record_ids: List[int],
    limit: int = 5,
) -> List[Dict]:
    """Return the records (with a file) matching the staff-selected record_ids,
    preserving the requested order."""
    wanted: List[int] = []
    for rid in record_ids:
        try:
            wanted.append(int(rid))
        except (TypeError, ValueError):
            continue
    by_id = {}
    for rec in records:
        rid = rec.get('record_id')
        if rid is None:
            continue
        try:
            by_id[int(rid)] = rec
        except (TypeError, ValueError):
            continue
    result = []
    for rid in wanted:
        rec = by_id.get(rid)
        if rec and (rec.get('file_path') or rec.get('file_url')):
            result.append(rec)
        if len(result) >= limit:
            break
    return result


def _extract_text_from_pdf(file_path: str, max_chars: int = 15000) -> str:
    from services.medical_record_content_service import extract_text_from_pdf
    return extract_text_from_pdf(file_path, max_chars=max_chars)


def _extract_findings_from_record_file(
    record: Dict,
    capability: str,
    max_chars: int = 15000,
) -> Optional[str]:
    from services.medical_record_content_service import extract_content_from_record_file

    file_path = record.get('file_path') or record.get('file_url')
    if not file_path:
        return None
    record = {**record, 'file_path': file_path}
    content = extract_content_from_record_file(record, max_chars=max_chars, allow_image_vision=True)
    if not content:
        return None
    title = record.get('title') or 'Medical record'
    return f"=== {title} ===\n{content}"


def enrich_file_findings_from_stored_records(
    patient_info: Optional[Dict[str, Any]],
    capability: str,
    user_message: str,
    existing_file_findings: Optional[str] = None,
    record_ids: Optional[List[int]] = None,
) -> Optional[str]:
    """
    When staff asks to analyze a linked patient's report, load stored
    radiology/lab file content from disk into file_findings for the AI prompt.

    If the staff selected specific records (record_ids), analyze exactly those
    files; otherwise fall back to the patient's latest primary record.
    """
    if existing_file_findings:
        return existing_file_findings
    if not patient_info or capability not in PRIMARY_RECORD_TYPE:
        return None

    records = patient_info.get('medicalRecords') or []

    # Staff explicitly attached record(s) — always load them for vision analysis.
    if record_ids:
        targets = _pick_records_by_ids(records, record_ids)
        if targets:
            per_record = 15000 if len(targets) == 1 else max(2500, 15000 // len(targets))
            parts = [
                findings
                for rec in targets
                if (findings := _extract_findings_from_record_file(rec, capability, per_record))
            ]
            if parts:
                logger.info(
                    "Loaded %s attached record(s) for %s analysis via record_ids",
                    len(parts),
                    capability,
                )
                return "\n\n".join(parts)
            logger.warning(
                "Attached record_ids %s could not be extracted for %s",
                record_ids,
                capability,
            )
            return None
        logger.warning(
            "record_ids %s not found in patient medicalRecords; falling back to keyword heuristics",
            record_ids,
        )

    if not _should_load_stored_record_content(user_message):
        return None

    target = _pick_primary_record(records, capability)
    if not target:
        return None

    return _extract_findings_from_record_file(target, capability)
