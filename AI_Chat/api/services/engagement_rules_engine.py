"""Engagement rules engine: appointment, medication, preventive, follow-up, risk."""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from config import db
from services import engagement_orchestrator as orchestrator

logger = logging.getLogger(__name__)


def _row_to_dict(row) -> Dict[str, Any]:
    if row is None:
        return {}
    if hasattr(row, '_mapping'):
        return dict(row._mapping)
    try:
        return dict(row)
    except Exception:
        return {}


def schedule_appointment_reminders(window_hours: int = 24) -> Dict[str, Any]:
    """Create reminders for appointments roughly `window_hours` ahead."""
    # Match appointments whose start is between window_hours and window_hours-1 from now
    lower = window_hours - 1
    rows = db.session.execute(
        db.text(
            """
            SELECT a.appointment_id, a.patient_id, a.appointment_date, a.appointment_time,
                   a.status, CONCAT(d.first_name, ' ', d.last_name) AS doctor_name
            FROM appointments a
            LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
            WHERE a.status IN ('scheduled', 'confirmed')
              AND TIMESTAMP(a.appointment_date, a.appointment_time)
                  BETWEEN DATE_ADD(NOW(), INTERVAL :lower HOUR)
                      AND DATE_ADD(NOW(), INTERVAL :upper HOUR)
            """
        ),
        {'lower': lower, 'upper': window_hours},
    ).fetchall()

    created = 0
    for row in rows:
        appt = _row_to_dict(row)
        patient_id = appt.get('patient_id')
        appointment_id = appt.get('appointment_id')
        if not patient_id or not appointment_id:
            continue
        existing = db.session.execute(
            db.text(
                """
                SELECT event_id FROM engagement_events
                WHERE related_appointment_id = :aid
                  AND event_type = 'appointment_reminder'
                  AND payload_json LIKE :window_tag
                  AND status IN ('pending', 'scheduled', 'sent')
                LIMIT 1
                """
            ),
            {'aid': appointment_id, 'window_tag': f'%"window_hours": {window_hours}%'},
        ).fetchone()
        if existing:
            continue
        orchestrator.create_event(
            patient_id,
            'appointment_reminder',
            send_now=True,
            related_appointment_id=appointment_id,
            payload={
                'appointment_date': str(appt.get('appointment_date') or ''),
                'appointment_time': str(appt.get('appointment_time') or '')[:8],
                'doctor_name': appt.get('doctor_name'),
                'window_hours': window_hours,
            },
        )
        created += 1
    return {'success': True, 'window_hours': window_hours, 'created': created}


def process_no_show_followups() -> Dict[str, Any]:
    rows = db.session.execute(
        db.text(
            """
            SELECT a.appointment_id, a.patient_id, a.appointment_date, a.appointment_time
            FROM appointments a
            WHERE a.status = 'no_show'
              AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 2 DAY)
            """
        )
    ).fetchall()
    created = 0
    for row in rows:
        appt = _row_to_dict(row)
        appointment_id = appt.get('appointment_id')
        patient_id = appt.get('patient_id')
        existing = db.session.execute(
            db.text(
                """
                SELECT event_id FROM engagement_events
                WHERE related_appointment_id = :aid AND event_type = 'appointment_no_show'
                LIMIT 1
                """
            ),
            {'aid': appointment_id},
        ).fetchone()
        if existing:
            continue
        orchestrator.create_event(
            patient_id,
            'appointment_no_show',
            send_now=True,
            related_appointment_id=appointment_id,
            payload={
                'appointment_date': str(appt.get('appointment_date') or ''),
                'appointment_time': str(appt.get('appointment_time') or '')[:8],
            },
        )
        created += 1
    return {'success': True, 'created': created}


def schedule_medication_reminders() -> Dict[str, Any]:
    """Send medication reminders from active prescriptions / patient current_medications."""
    rows = db.session.execute(
        db.text(
            """
            SELECT patient_id, first_name, last_name, current_medications
            FROM patients
            WHERE current_medications IS NOT NULL AND TRIM(current_medications) <> ''
            """
        )
    ).fetchall()
    created = 0
    today_tag = date.today().isoformat()
    for row in rows:
        patient = _row_to_dict(row)
        patient_id = patient.get('patient_id')
        meds = (patient.get('current_medications') or '').strip()
        if not patient_id or not meds:
            continue
        existing = db.session.execute(
            db.text(
                """
                SELECT event_id FROM engagement_events
                WHERE patient_id = :pid
                  AND event_type = 'medication_reminder'
                  AND DATE(created_at) = CURDATE()
                LIMIT 1
                """
            ),
            {'pid': patient_id},
        ).fetchone()
        if existing:
            continue
        first_med = meds.split(',')[0].strip()[:120] or 'your medication'
        orchestrator.create_event(
            patient_id,
            'medication_reminder',
            send_now=True,
            payload={'medication_name': first_med, 'day': today_tag},
        )
        created += 1
    return {'success': True, 'created': created}


def upsert_care_gap(
    patient_id: str,
    gap_type: str,
    title: str,
    description: str,
    priority: str = 'medium',
    due_date: Optional[date] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[int]:
    existing = db.session.execute(
        db.text(
            """
            SELECT care_gap_id FROM care_gaps
            WHERE patient_id = :pid AND gap_type = :gap_type AND status = 'open'
            LIMIT 1
            """
        ),
        {'pid': patient_id, 'gap_type': gap_type},
    ).fetchone()
    if existing:
        return int(existing[0] if not hasattr(existing, '_mapping') else existing._mapping['care_gap_id'])

    result = db.session.execute(
        db.text(
            """
            INSERT INTO care_gaps (patient_id, gap_type, title, description, priority, due_date, metadata_json)
            VALUES (:pid, :gap_type, :title, :description, :priority, :due_date, :meta)
            """
        ),
        {
            'pid': patient_id,
            'gap_type': gap_type,
            'title': title[:255],
            'description': description,
            'priority': priority,
            'due_date': due_date,
            'meta': json.dumps(metadata or {}),
        },
    )
    db.session.commit()
    return int(result.lastrowid)


def scan_care_gaps() -> Dict[str, Any]:
    """Rule-based preventive / follow-up care gap detection."""
    patients = db.session.execute(
        db.text(
            """
            SELECT patient_id, first_name, last_name, date_of_birth, gender,
                   medical_history, current_medications
            FROM patients WHERE is_active = 1 OR is_active IS NULL
            """
        )
    ).fetchall()
    created = 0
    reminded = 0
    today = date.today()

    for row in patients:
        patient = _row_to_dict(row)
        patient_id = patient.get('patient_id')
        if not patient_id:
            continue

        age = None
        dob = patient.get('date_of_birth')
        if dob:
            if isinstance(dob, str):
                try:
                    dob = datetime.strptime(dob[:10], '%Y-%m-%d').date()
                except Exception:
                    dob = None
            if isinstance(dob, date):
                age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

        gender = (patient.get('gender') or '').lower()
        history = (patient.get('medical_history') or '').lower()

        gaps_to_add = []
        if age is not None and age >= 18:
            gaps_to_add.append(
                ('annual_wellness', 'Annual wellness visit', 'Consider scheduling your yearly wellness checkup.', 'medium')
            )
        if age is not None and age >= 50:
            gaps_to_add.append(
                ('colonoscopy', 'Colon cancer screening', 'Colonoscopy or FIT screening may be due for adults 50+.', 'high')
            )
        if age is not None and gender in ('female', 'f') and age >= 40:
            gaps_to_add.append(
                ('mammogram', 'Breast cancer screening', 'Mammogram screening may be appropriate based on age.', 'high')
            )
        if 'diabet' in history or 'hypertension' in history or 'blood pressure' in history:
            gaps_to_add.append(
                ('chronic_lab', 'Chronic condition lab check', 'Routine labs for chronic condition monitoring may be due.', 'medium')
            )

        # Flu season nudge roughly Apr–Aug southern / Sep–Mar northern — always offer as soft gap
        gaps_to_add.append(
            ('flu_shot', 'Flu vaccination', 'Ask your clinician about seasonal influenza vaccination.', 'low')
        )

        last_completed = db.session.execute(
            db.text(
                """
                SELECT MAX(appointment_date) AS last_date
                FROM appointments
                WHERE patient_id = :pid AND status = 'completed'
                """
            ),
            {'pid': patient_id},
        ).fetchone()
        last_date = _row_to_dict(last_completed).get('last_date')
        if last_date:
            if isinstance(last_date, str):
                try:
                    last_date = datetime.strptime(last_date[:10], '%Y-%m-%d').date()
                except Exception:
                    last_date = None
            if isinstance(last_date, date) and (today - last_date).days >= 7:
                # post-visit follow-up gap if no recent follow-up event
                gaps_to_add.append(
                    ('post_visit_followup', 'Post-visit follow-up', 'Check in after your recent visit and report ongoing symptoms.', 'medium')
                )

        for gap_type, title, description, priority in gaps_to_add:
            gap_id = upsert_care_gap(patient_id, gap_type, title, description, priority)
            if gap_id:
                created += 1
                # Reminder once per open gap
                existing_evt = db.session.execute(
                    db.text(
                        """
                        SELECT event_id FROM engagement_events
                        WHERE related_care_gap_id = :gid AND event_type IN ('preventive_reminder', 'care_gap')
                        LIMIT 1
                        """
                    ),
                    {'gid': gap_id},
                ).fetchone()
                if not existing_evt and priority in ('high', 'urgent', 'medium'):
                    orchestrator.create_event(
                        patient_id,
                        'preventive_reminder',
                        send_now=False,
                        scheduled_at=datetime.now() + timedelta(hours=1),
                        related_care_gap_id=gap_id,
                        payload={'gap_title': title, 'gap_type': gap_type},
                    )
                    reminded += 1

    return {'success': True, 'gaps_touched': created, 'reminders_queued': reminded}


def schedule_followup_sequences() -> Dict[str, Any]:
    """Day-1 and day-7 post-visit follow-ups for completed appointments."""
    created = 0
    for days_ago, label in ((1, 'day1'), (7, 'day7')):
        rows = db.session.execute(
            db.text(
                """
                SELECT appointment_id, patient_id, appointment_date
                FROM appointments
                WHERE status = 'completed'
                  AND appointment_date = DATE_SUB(CURDATE(), INTERVAL :days DAY)
                """
            ),
            {'days': days_ago},
        ).fetchall()
        for row in rows:
            appt = _row_to_dict(row)
            appointment_id = appt.get('appointment_id')
            patient_id = appt.get('patient_id')
            tag = f'%"sequence": "{label}"%'
            existing = db.session.execute(
                db.text(
                    """
                    SELECT event_id FROM engagement_events
                    WHERE related_appointment_id = :aid
                      AND event_type = 'follow_up'
                      AND payload_json LIKE :tag
                    LIMIT 1
                    """
                ),
                {'aid': appointment_id, 'tag': tag},
            ).fetchone()
            if existing:
                continue
            orchestrator.create_event(
                patient_id,
                'follow_up',
                send_now=True,
                related_appointment_id=appointment_id,
                payload={'sequence': label, 'appointment_date': str(appt.get('appointment_date') or '')},
            )
            created += 1
    return {'success': True, 'created': created}


def compute_patient_risk(patient_id: str) -> Dict[str, Any]:
    """Rule-based risk tier for a single patient."""
    patient = _row_to_dict(
        db.session.execute(
            db.text(
                """
                SELECT patient_id, date_of_birth, medical_history, current_medications, allergies
                FROM patients WHERE patient_id = :pid
                """
            ),
            {'pid': patient_id},
        ).fetchone()
    )
    if not patient:
        return {'success': False, 'error': 'Patient not found'}

    score = 0
    factors: List[str] = []
    today = date.today()
    dob = patient.get('date_of_birth')
    age = None
    if dob:
        if isinstance(dob, str):
            try:
                dob = datetime.strptime(dob[:10], '%Y-%m-%d').date()
            except Exception:
                dob = None
        if isinstance(dob, date):
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if age >= 75:
                score += 25
                factors.append('age_75_plus')
            elif age >= 65:
                score += 15
                factors.append('age_65_plus')

    history = (patient.get('medical_history') or '').lower()
    chronic_keywords = ('diabet', 'hypertension', 'heart', 'copd', 'asthma', 'cancer', 'stroke', 'kidney')
    for kw in chronic_keywords:
        if kw in history:
            score += 10
            factors.append(f'condition_{kw}')

    no_shows = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS c FROM appointments
            WHERE patient_id = :pid AND status = 'no_show'
              AND appointment_date >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
            """
        ),
        {'pid': patient_id},
    ).fetchone()
    no_show_count = int(_row_to_dict(no_shows).get('c') or 0)
    if no_show_count >= 2:
        score += 20
        factors.append('multiple_no_shows')
    elif no_show_count == 1:
        score += 8
        factors.append('recent_no_show')

    open_gaps = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS c FROM care_gaps
            WHERE patient_id = :pid AND status = 'open' AND priority IN ('high', 'urgent')
            """
        ),
        {'pid': patient_id},
    ).fetchone()
    gap_count = int(_row_to_dict(open_gaps).get('c') or 0)
    if gap_count:
        score += min(20, gap_count * 8)
        factors.append('open_high_care_gaps')

    med_skips = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS c FROM medication_adherence_logs
            WHERE patient_id = :pid AND action = 'skipped'
              AND logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            """
        ),
        {'pid': patient_id},
    ).fetchone()
    skip_count = int(_row_to_dict(med_skips).get('c') or 0)
    if skip_count >= 3:
        score += 15
        factors.append('medication_gaps')

    if score >= 60:
        tier = 'critical'
    elif score >= 40:
        tier = 'high'
    elif score >= 20:
        tier = 'medium'
    else:
        tier = 'low'

    db.session.execute(
        db.text(
            """
            INSERT INTO patient_risk_scores (patient_id, risk_tier, risk_score, factors_json, computed_at)
            VALUES (:pid, :tier, :score, :factors, NOW())
            ON DUPLICATE KEY UPDATE
              risk_tier = VALUES(risk_tier),
              risk_score = VALUES(risk_score),
              factors_json = VALUES(factors_json),
              computed_at = NOW()
            """
        ),
        {
            'pid': patient_id,
            'tier': tier,
            'score': score,
            'factors': json.dumps(factors),
        },
    )
    db.session.commit()

    if tier in ('high', 'critical'):
        existing = db.session.execute(
            db.text(
                """
                SELECT event_id FROM engagement_events
                WHERE patient_id = :pid AND event_type = 'risk_outreach'
                  AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                LIMIT 1
                """
            ),
            {'pid': patient_id},
        ).fetchone()
        if not existing:
            orchestrator.create_event(
                patient_id,
                'manual',
                send_now=False,
                scheduled_at=datetime.now() + timedelta(hours=2),
                title='Care team check-in',
                message=(
                    'Our care team noticed you may benefit from extra support. '
                    'Please review your Engagement Hub or message us via portal chat.'
                ),
                payload={'custom_message': 'Proactive outreach based on care engagement risk signals.', 'risk_tier': tier},
            )

    return {
        'success': True,
        'patient_id': patient_id,
        'risk_tier': tier,
        'risk_score': score,
        'factors': factors,
    }


def recompute_all_risks(limit: int = 500) -> Dict[str, Any]:
    rows = db.session.execute(
        db.text('SELECT patient_id FROM patients LIMIT :lim'),
        {'lim': limit},
    ).fetchall()
    results = []
    for row in rows:
        pid = row[0] if not hasattr(row, '_mapping') else row._mapping['patient_id']
        results.append(compute_patient_risk(pid))
    return {'success': True, 'processed': len(results)}


def list_open_care_gaps(patient_id: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {'lim': limit}
    where = "status = 'open'"
    if patient_id:
        where += ' AND patient_id = :pid'
        params['pid'] = patient_id
    rows = db.session.execute(
        db.text(
            f"""
            SELECT * FROM care_gaps
            WHERE {where}
            ORDER BY FIELD(priority, 'urgent', 'high', 'medium', 'low'), due_date IS NULL, due_date ASC
            LIMIT :lim
            """
        ),
        params,
    ).fetchall()
    return [_row_to_dict(r) for r in rows]
