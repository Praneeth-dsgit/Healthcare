"""Load patient profile and medical records from the database for staff AI chat."""
from typing import Any, Dict, List, Optional

from db_read_agent import DatabaseAgent

RECORD_TYPES_BY_CAPABILITY = {
    'lab': ['lab_report', 'visit_summary', 'discharge_summary', 'prescription', 'other'],
    'radiology': ['radiology_report', 'visit_summary', 'discharge_summary', 'other'],
    'general': None,
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
