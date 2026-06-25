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
    'analyze', 'interpret', 'report', 'findings', 'above', 'review',
    'explain', 'what does', 'summarize', 'read the', 'this scan', 'this image',
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


def _extract_text_from_pdf(file_path: str, max_chars: int = 15000) -> str:
    from services.medical_record_content_service import extract_text_from_pdf
    return extract_text_from_pdf(file_path, max_chars=max_chars)


def _extract_findings_from_record_file(record: Dict, capability: str) -> Optional[str]:
    from services.medical_record_content_service import extract_content_from_record_file

    file_path = record.get('file_path') or record.get('file_url')
    if not file_path:
        return None
    record = {**record, 'file_path': file_path}
    content = extract_content_from_record_file(record, max_chars=15000, allow_image_vision=True)
    if not content:
        return None
    title = record.get('title') or 'Medical record'
    return f"=== {title} ===\n{content}"


def enrich_file_findings_from_stored_records(
    patient_info: Optional[Dict[str, Any]],
    capability: str,
    user_message: str,
    existing_file_findings: Optional[str] = None,
) -> Optional[str]:
    """
    When staff asks to analyze a linked patient's report, load the latest stored
    radiology/lab file from disk into file_findings for the AI prompt.
    """
    if existing_file_findings:
        return existing_file_findings
    if not patient_info or capability not in PRIMARY_RECORD_TYPE:
        return None
    if not _should_load_stored_record_content(user_message):
        return None

    records = patient_info.get('medicalRecords') or []
    target = _pick_primary_record(records, capability)
    if not target:
        return None

    return _extract_findings_from_record_file(target, capability)
