"""Central engagement orchestrator: preferences, scheduling, multi-channel dispatch."""
from __future__ import annotations

import json
import logging
from datetime import datetime, time
from typing import Any, Dict, List, Optional, Sequence

from config import db
from services.engagement_channels import send_email, send_in_app, send_sms, send_whatsapp
from services.engagement_content_service import personalize_with_ai, render_template

logger = logging.getLogger(__name__)

ALL_CHANNELS = ('in_app', 'email', 'sms', 'whatsapp')


def _row_to_dict(row) -> Dict[str, Any]:
    if row is None:
        return {}
    if hasattr(row, '_mapping'):
        return dict(row._mapping)
    try:
        return dict(row)
    except Exception:
        return {}


def ensure_preferences(patient_id: str) -> Dict[str, Any]:
    row = db.session.execute(
        db.text('SELECT * FROM patient_engagement_preferences WHERE patient_id = :pid'),
        {'pid': patient_id},
    ).fetchone()
    if row:
        return _row_to_dict(row)

    db.session.execute(
        db.text(
            """
            INSERT INTO patient_engagement_preferences (patient_id)
            VALUES (:pid)
            """
        ),
        {'pid': patient_id},
    )
    db.session.commit()
    row = db.session.execute(
        db.text('SELECT * FROM patient_engagement_preferences WHERE patient_id = :pid'),
        {'pid': patient_id},
    ).fetchone()
    return _row_to_dict(row)


def update_preferences(patient_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    ensure_preferences(patient_id)
    fields = {
        'channel_in_app': data.get('channel_in_app'),
        'channel_email': data.get('channel_email'),
        'channel_sms': data.get('channel_sms'),
        'channel_whatsapp': data.get('channel_whatsapp'),
        'quiet_hours_start': data.get('quiet_hours_start'),
        'quiet_hours_end': data.get('quiet_hours_end'),
        'language': data.get('language'),
        'appointment_reminders': data.get('appointment_reminders'),
        'medication_reminders': data.get('medication_reminders'),
        'preventive_reminders': data.get('preventive_reminders'),
        'marketing_opt_in': data.get('marketing_opt_in'),
    }
    sets = []
    params: Dict[str, Any] = {'pid': patient_id}
    for key, value in fields.items():
        if value is None:
            continue
        sets.append(f'{key} = :{key}')
        if isinstance(value, bool):
            params[key] = 1 if value else 0
        else:
            params[key] = value
    if sets:
        db.session.execute(
            db.text(
                f"UPDATE patient_engagement_preferences SET {', '.join(sets)} WHERE patient_id = :pid"
            ),
            params,
        )
        db.session.commit()
    return ensure_preferences(patient_id)


def get_patient_contact(patient_id: str) -> Dict[str, Any]:
    row = db.session.execute(
        db.text(
            """
            SELECT patient_id, first_name, last_name, email, phone
            FROM patients WHERE patient_id = :pid LIMIT 1
            """
        ),
        {'pid': patient_id},
    ).fetchone()
    return _row_to_dict(row)


def _in_quiet_hours(prefs: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    start = prefs.get('quiet_hours_start')
    end = prefs.get('quiet_hours_end')
    if not start or not end:
        return False
    now = now or datetime.now()
    current = now.time() if isinstance(now, datetime) else now

    def _as_time(value) -> Optional[time]:
        if isinstance(value, time):
            return value
        if isinstance(value, datetime):
            return value.time()
        if isinstance(value, str) and value:
            parts = value.split(':')
            try:
                return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
            except Exception:
                return None
        return None

    start_t = _as_time(start)
    end_t = _as_time(end)
    if not start_t or not end_t:
        return False
    if start_t <= end_t:
        return start_t <= current <= end_t
    return current >= start_t or current <= end_t


def resolve_channels(
    prefs: Dict[str, Any],
    requested: Optional[Sequence[str]] = None,
    event_type: str = 'manual',
) -> List[str]:
    if event_type.startswith('appointment') and not prefs.get('appointment_reminders', 1):
        return ['in_app'] if prefs.get('channel_in_app', 1) else []
    if event_type.startswith('medication') and not prefs.get('medication_reminders', 1):
        return ['in_app'] if prefs.get('channel_in_app', 1) else []
    if event_type in ('preventive_reminder', 'care_gap') and not prefs.get('preventive_reminders', 1):
        return ['in_app'] if prefs.get('channel_in_app', 1) else []

    enabled = []
    if prefs.get('channel_in_app', 1):
        enabled.append('in_app')
    if prefs.get('channel_email', 1):
        enabled.append('email')
    if prefs.get('channel_sms', 0):
        enabled.append('sms')
    if prefs.get('channel_whatsapp', 0):
        enabled.append('whatsapp')

    if requested:
        requested_norm = [c for c in requested if c in ALL_CHANNELS]
        return [c for c in requested_norm if c in enabled] or (['in_app'] if 'in_app' in enabled else enabled[:1])
    return enabled or ['in_app']


def create_event(
    patient_id: str,
    event_type: str,
    *,
    channels: Optional[Sequence[str]] = None,
    title: Optional[str] = None,
    message: Optional[str] = None,
    scheduled_at: Optional[datetime] = None,
    payload: Optional[Dict[str, Any]] = None,
    campaign_id: Optional[int] = None,
    related_appointment_id: Optional[int] = None,
    related_care_gap_id: Optional[int] = None,
    send_now: bool = False,
    personalize: bool = False,
) -> Dict[str, Any]:
    prefs = ensure_preferences(patient_id)
    contact = get_patient_contact(patient_id)
    patient_name = f"{contact.get('first_name') or ''} {contact.get('last_name') or ''}".strip() or 'Patient'

    if not title or not message:
        tpl_title, tpl_message = render_template(
            event_type,
            patient_name,
            appointment_date=(payload or {}).get('appointment_date'),
            appointment_time=(payload or {}).get('appointment_time'),
            doctor_name=(payload or {}).get('doctor_name'),
            medication_name=(payload or {}).get('medication_name'),
            dosage=(payload or {}).get('dosage'),
            gap_title=(payload or {}).get('gap_title'),
            custom_message=(payload or {}).get('custom_message'),
        )
        title = title or tpl_title
        message = message or tpl_message

    if personalize:
        message = personalize_with_ai(message)

    channel_list = resolve_channels(prefs, channels, event_type)
    if not channel_list:
        return {'success': False, 'error': 'No enabled channels for this patient'}

    status = 'scheduled' if scheduled_at and not send_now else 'pending'
    created_ids: List[int] = []

    for channel in channel_list:
        result = db.session.execute(
            db.text(
                """
                INSERT INTO engagement_events (
                    patient_id, event_type, channel, title, message, payload_json,
                    status, scheduled_at, campaign_id, related_appointment_id, related_care_gap_id
                ) VALUES (
                    :patient_id, :event_type, :channel, :title, :message, :payload_json,
                    :status, :scheduled_at, :campaign_id, :related_appointment_id, :related_care_gap_id
                )
                """
            ),
            {
                'patient_id': patient_id,
                'event_type': event_type,
                'channel': channel,
                'title': (title or '')[:255],
                'message': message,
                'payload_json': json.dumps(payload or {}),
                'status': status,
                'scheduled_at': scheduled_at,
                'campaign_id': campaign_id,
                'related_appointment_id': related_appointment_id,
                'related_care_gap_id': related_care_gap_id,
            },
        )
        created_ids.append(int(result.lastrowid))
    db.session.commit()

    results = []
    if send_now or not scheduled_at:
        for event_id in created_ids:
            results.append(dispatch_event(event_id))

    return {
        'success': True,
        'event_ids': created_ids,
        'channels': channel_list,
        'dispatch_results': results,
    }


def dispatch_event(event_id: int) -> Dict[str, Any]:
    row = db.session.execute(
        db.text('SELECT * FROM engagement_events WHERE event_id = :eid'),
        {'eid': event_id},
    ).fetchone()
    if not row:
        return {'success': False, 'error': 'Event not found'}

    event = _row_to_dict(row)
    if event.get('status') in ('sent', 'cancelled'):
        return {'success': True, 'skipped': True, 'status': event.get('status')}

    prefs = ensure_preferences(event['patient_id'])
    if _in_quiet_hours(prefs) and event.get('channel') != 'in_app':
        db.session.execute(
            db.text(
                """
                UPDATE engagement_events
                SET status = 'scheduled', scheduled_at = DATE_ADD(NOW(), INTERVAL 1 HOUR)
                WHERE event_id = :eid
                """
            ),
            {'eid': event_id},
        )
        db.session.commit()
        return {'success': True, 'deferred': True, 'reason': 'quiet_hours'}

    contact = get_patient_contact(event['patient_id'])
    channel = event.get('channel')
    title = event.get('title') or 'Acufore Health'
    message = event.get('message') or ''

    if channel == 'in_app':
        result = send_in_app(event['patient_id'], title, message, notification_type=event.get('event_type') or 'engagement')
    elif channel == 'email':
        email = contact.get('email')
        if not email:
            result = {'success': False, 'channel': 'email', 'error': 'No email on file'}
        else:
            result = send_email(email, title, message)
    elif channel == 'sms':
        phone = contact.get('phone')
        if not phone:
            result = {'success': False, 'channel': 'sms', 'error': 'No phone on file'}
        else:
            result = send_sms(phone, message)
    elif channel == 'whatsapp':
        result = send_whatsapp(event['patient_id'], message, phone=contact.get('phone'))
    else:
        result = {'success': False, 'error': f'Unknown channel: {channel}'}

    if result.get('success'):
        db.session.execute(
            db.text(
                """
                UPDATE engagement_events
                SET status = 'sent', sent_at = NOW(), response_json = :resp, error_message = NULL
                WHERE event_id = :eid
                """
            ),
            {'eid': event_id, 'resp': json.dumps(result)},
        )
    else:
        db.session.execute(
            db.text(
                """
                UPDATE engagement_events
                SET status = 'failed', response_json = :resp, error_message = :err
                WHERE event_id = :eid
                """
            ),
            {
                'eid': event_id,
                'resp': json.dumps(result),
                'err': (result.get('error') or 'send failed')[:500],
            },
        )
    db.session.commit()
    return {'success': bool(result.get('success')), 'event_id': event_id, 'result': result}


def process_due_events(limit: int = 100) -> Dict[str, Any]:
    rows = db.session.execute(
        db.text(
            """
            SELECT event_id FROM engagement_events
            WHERE status IN ('pending', 'scheduled')
              AND (scheduled_at IS NULL OR scheduled_at <= NOW())
            ORDER BY COALESCE(scheduled_at, created_at) ASC
            LIMIT :lim
            """
        ),
        {'lim': limit},
    ).fetchall()
    sent = 0
    failed = 0
    for row in rows:
        event_id = row[0] if not hasattr(row, '_mapping') else row._mapping['event_id']
        out = dispatch_event(int(event_id))
        if out.get('success') and not out.get('deferred') and not out.get('skipped'):
            sent += 1
        elif not out.get('success'):
            failed += 1
    return {'success': True, 'processed': len(rows), 'sent': sent, 'failed': failed}


def list_events(
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    clauses = ['1=1']
    params: Dict[str, Any] = {'lim': limit}
    if patient_id:
        clauses.append('patient_id = :pid')
        params['pid'] = patient_id
    if status:
        clauses.append('status = :status')
        params['status'] = status
    rows = db.session.execute(
        db.text(
            f"""
            SELECT * FROM engagement_events
            WHERE {' AND '.join(clauses)}
            ORDER BY COALESCE(sent_at, scheduled_at, created_at) DESC
            LIMIT :lim
            """
        ),
        params,
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_metrics_summary(days: int = 30) -> Dict[str, Any]:
    days = max(1, min(int(days), 365))
    sent = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS c FROM engagement_events
            WHERE status = 'sent' AND sent_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
            """
        ),
        {'days': days},
    ).fetchone()
    failed = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS c FROM engagement_events
            WHERE status = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
            """
        ),
        {'days': days},
    ).fetchone()
    by_channel = db.session.execute(
        db.text(
            """
            SELECT channel, COUNT(*) AS c FROM engagement_events
            WHERE status = 'sent' AND sent_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
            GROUP BY channel
            """
        ),
        {'days': days},
    ).fetchall()
    by_type = db.session.execute(
        db.text(
            """
            SELECT event_type, COUNT(*) AS c FROM engagement_events
            WHERE status = 'sent' AND sent_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
            GROUP BY event_type
            """
        ),
        {'days': days},
    ).fetchall()

    appt_stats = db.session.execute(
        db.text(
            """
            SELECT
              SUM(CASE WHEN status IN ('scheduled', 'confirmed') THEN 1 ELSE 0 END) AS scheduled,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_show
            FROM appointments
            WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
            """
        ),
        {'days': days},
    ).fetchone()
    appt = _row_to_dict(appt_stats)

    unread = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS c FROM notifications
            WHERE is_read = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
            """
        ),
        {'days': days},
    ).fetchone()

    med_checkins = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS c FROM medication_adherence_logs
            WHERE logged_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
            """
        ),
        {'days': days},
    ).fetchone()

    satisfaction = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS responses, COALESCE(AVG(score), 0) AS avg_score
            FROM engagement_satisfaction
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
            """
        ),
        {'days': days},
    ).fetchone()
    sat = _row_to_dict(satisfaction)

    scheduled = int(appt.get('scheduled') or 0)
    completed = int(appt.get('completed') or 0)
    no_show = int(appt.get('no_show') or 0)
    show_denom = completed + no_show
    show_rate = round((completed / show_denom) * 100, 1) if show_denom else None

    return {
        'days': days,
        'reminders_sent': int((_row_to_dict(sent).get('c') if sent else 0) or 0),
        'reminders_failed': int((_row_to_dict(failed).get('c') if failed else 0) or 0),
        'by_channel': {(_row_to_dict(r).get('channel') or 'unknown'): int(_row_to_dict(r).get('c') or 0) for r in by_channel},
        'by_type': {(_row_to_dict(r).get('event_type') or 'unknown'): int(_row_to_dict(r).get('c') or 0) for r in by_type},
        'appointments_scheduled': scheduled,
        'appointments_completed': completed,
        'appointments_no_show': no_show,
        'show_rate_pct': show_rate,
        'portal_notifications_unread': int((_row_to_dict(unread).get('c') if unread else 0) or 0),
        'med_checkins': int((_row_to_dict(med_checkins).get('c') if med_checkins else 0) or 0),
        'satisfaction_responses': int(sat.get('responses') or 0),
        'satisfaction_avg': round(float(sat.get('avg_score') or 0), 2),
    }
