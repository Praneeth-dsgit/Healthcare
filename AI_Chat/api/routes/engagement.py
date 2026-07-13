"""
Patient Engagement Platform Routes
Preferences, multi-channel outreach, care gaps, adherence, SDOH, decision aids, metrics.
"""
from __future__ import annotations

import json
import logging
import traceback
from datetime import datetime

from flask import Blueprint, g, jsonify, request

from config import db
from utils.jwt_utils import require_jwt
from services import engagement_orchestrator as orchestrator
from services import engagement_rules_engine as rules

logger = logging.getLogger(__name__)

engagement_bp = Blueprint('engagement', __name__, url_prefix='/api/engagement')


def _row_to_dict(row):
    if row is None:
        return {}
    if hasattr(row, '_mapping'):
        return dict(row._mapping)
    try:
        return dict(row)
    except Exception:
        return {}


def _is_staff() -> bool:
    role = (getattr(g, 'role', None) or getattr(g, 'user_role', None) or '').lower()
    if role in ('admin', 'doctor', 'employee', 'non_medical_staff', 'nurse', 'staff'):
        return True
    # Fallback: no patient_id usually means staff token
    return not bool(getattr(g, 'patient_id', None))


@engagement_bp.route('/preferences', methods=['GET', 'PUT', 'OPTIONS'])
@require_jwt
def preferences():
    patient_id = request.args.get('patient_id') or g.patient_id
    if request.method == 'PUT':
        data = request.get_json() or {}
        if not patient_id:
            patient_id = data.get('patient_id') or g.patient_id
        if not patient_id:
            return jsonify({'success': False, 'error': 'patient_id required'}), 400
        if g.patient_id and patient_id != g.patient_id and not _is_staff():
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        prefs = orchestrator.update_preferences(patient_id, data)
        return jsonify({'success': True, 'preferences': prefs}), 200

    if not patient_id:
        return jsonify({'success': False, 'error': 'patient_id required'}), 400
    if g.patient_id and patient_id != g.patient_id and not _is_staff():
        return jsonify({'success': False, 'error': 'Forbidden'}), 403
    prefs = orchestrator.ensure_preferences(patient_id)
    return jsonify({'success': True, 'preferences': prefs}), 200


@engagement_bp.route('/send', methods=['POST', 'OPTIONS'])
@require_jwt
def send_engagement():
    data = request.get_json() or {}
    patient_id = data.get('patient_id') or g.patient_id
    if not patient_id:
        return jsonify({'success': False, 'error': 'patient_id required'}), 400
    if g.patient_id and patient_id != g.patient_id and not _is_staff():
        return jsonify({'success': False, 'error': 'Forbidden'}), 403

    event_type = data.get('event_type') or 'manual'
    channels = data.get('channels')
    scheduled_at = data.get('scheduled_at')
    scheduled_dt = None
    if scheduled_at:
        try:
            scheduled_dt = datetime.fromisoformat(str(scheduled_at).replace('Z', ''))
        except Exception:
            return jsonify({'success': False, 'error': 'Invalid scheduled_at'}), 400

    result = orchestrator.create_event(
        patient_id,
        event_type,
        channels=channels,
        title=data.get('title'),
        message=data.get('message'),
        scheduled_at=scheduled_dt,
        payload={
            'custom_message': data.get('message') or data.get('custom_message'),
            **(data.get('payload') or {}),
        },
        campaign_id=data.get('campaign_id'),
        related_appointment_id=data.get('appointment_id'),
        send_now=not bool(scheduled_dt),
        personalize=bool(data.get('personalize')),
    )
    status = 200 if result.get('success') else 400
    return jsonify(result), status


@engagement_bp.route('/events', methods=['GET', 'OPTIONS'])
@require_jwt
def events():
    patient_id = request.args.get('patient_id')
    if g.patient_id and not _is_staff():
        patient_id = g.patient_id
    status = request.args.get('status')
    limit = int(request.args.get('limit', 50))
    items = orchestrator.list_events(patient_id=patient_id, status=status, limit=limit)
    return jsonify({'success': True, 'events': items}), 200


@engagement_bp.route('/metrics', methods=['GET', 'OPTIONS'])
@require_jwt
def metrics():
    days = int(request.args.get('days', 30))
    summary = orchestrator.get_metrics_summary(days=days)
    return jsonify({'success': True, 'metrics': summary}), 200


@engagement_bp.route('/tasks', methods=['GET', 'OPTIONS'])
@require_jwt
def tasks():
    """Upcoming reminders + open care gaps for patient Engagement Hub."""
    patient_id = g.patient_id or request.args.get('patient_id')
    if not patient_id:
        return jsonify({'success': False, 'error': 'patient_id required'}), 400
    events = orchestrator.list_events(patient_id=patient_id, limit=30)
    upcoming = [e for e in events if e.get('status') in ('pending', 'scheduled', 'sent')]
    gaps = rules.list_open_care_gaps(patient_id=patient_id, limit=50)
    risk = db.session.execute(
        db.text('SELECT * FROM patient_risk_scores WHERE patient_id = :pid'),
        {'pid': patient_id},
    ).fetchone()
    return jsonify({
        'success': True,
        'events': upcoming,
        'care_gaps': gaps,
        'risk': _row_to_dict(risk) if risk else None,
    }), 200


@engagement_bp.route('/adherence', methods=['POST', 'GET', 'OPTIONS'])
@require_jwt
def adherence():
    patient_id = g.patient_id or request.args.get('patient_id')
    if request.method == 'GET':
        if not patient_id:
            return jsonify({'success': False, 'error': 'patient_id required'}), 400
        rows = db.session.execute(
            db.text(
                """
                SELECT * FROM medication_adherence_logs
                WHERE patient_id = :pid
                ORDER BY logged_at DESC LIMIT 50
                """
            ),
            {'pid': patient_id},
        ).fetchall()
        return jsonify({'success': True, 'logs': [_row_to_dict(r) for r in rows]}), 200

    data = request.get_json() or {}
    patient_id = data.get('patient_id') or patient_id
    if not patient_id:
        return jsonify({'success': False, 'error': 'patient_id required'}), 400
    if g.patient_id and patient_id != g.patient_id and not _is_staff():
        return jsonify({'success': False, 'error': 'Forbidden'}), 403

    action = (data.get('action') or '').lower()
    if action not in ('taken', 'skipped', 'snoozed'):
        return jsonify({'success': False, 'error': 'action must be taken|skipped|snoozed'}), 400
    medication_name = (data.get('medication_name') or 'medication').strip()
    db.session.execute(
        db.text(
            """
            INSERT INTO medication_adherence_logs
              (patient_id, medication_name, dosage, action, scheduled_for, notes)
            VALUES (:pid, :med, :dosage, :action, :scheduled_for, :notes)
            """
        ),
        {
            'pid': patient_id,
            'med': medication_name[:255],
            'dosage': data.get('dosage'),
            'action': action,
            'scheduled_for': data.get('scheduled_for'),
            'notes': data.get('notes'),
        },
    )
    db.session.commit()
    return jsonify({'success': True}), 200


@engagement_bp.route('/care-gaps', methods=['GET', 'OPTIONS'])
@require_jwt
def care_gaps():
    patient_id = request.args.get('patient_id')
    if g.patient_id and not _is_staff():
        patient_id = g.patient_id
    items = rules.list_open_care_gaps(patient_id=patient_id, limit=int(request.args.get('limit', 100)))
    return jsonify({'success': True, 'care_gaps': items}), 200


@engagement_bp.route('/care-gaps/scan', methods=['POST', 'OPTIONS'])
@require_jwt
def care_gaps_scan():
    if not _is_staff():
        return jsonify({'success': False, 'error': 'Staff only'}), 403
    result = rules.scan_care_gaps()
    return jsonify(result), 200


@engagement_bp.route('/care-gaps/<int:gap_id>/status', methods=['PUT', 'OPTIONS'])
@require_jwt
def care_gap_status(gap_id: int):
    data = request.get_json() or {}
    status = (data.get('status') or '').lower()
    if status not in ('open', 'scheduled', 'closed', 'dismissed'):
        return jsonify({'success': False, 'error': 'Invalid status'}), 400
    row = db.session.execute(
        db.text('SELECT patient_id FROM care_gaps WHERE care_gap_id = :gid'),
        {'gid': gap_id},
    ).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    owner = row[0] if not hasattr(row, '_mapping') else row._mapping['patient_id']
    if g.patient_id and owner != g.patient_id and not _is_staff():
        return jsonify({'success': False, 'error': 'Forbidden'}), 403
    closed_sql = ', closed_at = NOW()' if status in ('closed', 'dismissed') else ''
    db.session.execute(
        db.text(f'UPDATE care_gaps SET status = :status{closed_sql} WHERE care_gap_id = :gid'),
        {'status': status, 'gid': gap_id},
    )
    db.session.commit()
    return jsonify({'success': True}), 200


@engagement_bp.route('/campaigns', methods=['GET', 'POST', 'OPTIONS'])
@require_jwt
def campaigns():
    if not _is_staff():
        return jsonify({'success': False, 'error': 'Staff only'}), 403

    if request.method == 'GET':
        rows = db.session.execute(
            db.text('SELECT * FROM engagement_campaigns ORDER BY created_at DESC LIMIT 50')
        ).fetchall()
        return jsonify({'success': True, 'campaigns': [_row_to_dict(r) for r in rows]}), 200

    data = request.get_json() or {}
    name = (data.get('name') or 'Untitled campaign').strip()
    template = (data.get('message_template') or data.get('message') or '').strip()
    if not template:
        return jsonify({'success': False, 'error': 'message_template required'}), 400
    channels = data.get('channels') or ['in_app', 'email']
    cohort = data.get('cohort') or {}
    result = db.session.execute(
        db.text(
            """
            INSERT INTO engagement_campaigns
              (name, campaign_type, message_template, channels_json, cohort_json, status, scheduled_at, created_by)
            VALUES (:name, :ctype, :template, :channels, :cohort, :status, :scheduled_at, :created_by)
            """
        ),
        {
            'name': name[:255],
            'ctype': data.get('campaign_type') or 'manual',
            'template': template,
            'channels': json.dumps(channels),
            'cohort': json.dumps(cohort),
            'status': 'scheduled' if data.get('scheduled_at') else 'draft',
            'scheduled_at': data.get('scheduled_at'),
            'created_by': getattr(g, 'email', None) or getattr(g, 'user_email', None),
        },
    )
    db.session.commit()
    campaign_id = int(result.lastrowid)

    # Optional immediate send to provided patient_ids
    patient_ids = data.get('patient_ids') or cohort.get('patient_ids') or []
    send_results = []
    if data.get('send_now') and patient_ids:
        for pid in patient_ids:
            send_results.append(
                orchestrator.create_event(
                    pid,
                    data.get('event_type') or 'manual',
                    channels=channels,
                    message=template,
                    campaign_id=campaign_id,
                    send_now=True,
                    personalize=bool(data.get('personalize')),
                    payload={'custom_message': template, 'campaign_id': campaign_id},
                )
            )
        db.session.execute(
            db.text("UPDATE engagement_campaigns SET status = 'completed' WHERE campaign_id = :cid"),
            {'cid': campaign_id},
        )
        db.session.commit()

    return jsonify({'success': True, 'campaign_id': campaign_id, 'send_results': send_results}), 200


@engagement_bp.route('/risk/<patient_id>', methods=['GET', 'POST', 'OPTIONS'])
@require_jwt
def risk(patient_id: str):
    if g.patient_id and patient_id != g.patient_id and not _is_staff():
        return jsonify({'success': False, 'error': 'Forbidden'}), 403
    if request.method == 'POST':
        return jsonify(rules.compute_patient_risk(patient_id)), 200
    row = db.session.execute(
        db.text('SELECT * FROM patient_risk_scores WHERE patient_id = :pid'),
        {'pid': patient_id},
    ).fetchone()
    if not row:
        return jsonify(rules.compute_patient_risk(patient_id)), 200
    return jsonify({'success': True, **_row_to_dict(row)}), 200


@engagement_bp.route('/sdoh/assessment', methods=['GET', 'POST', 'OPTIONS'])
@require_jwt
def sdoh_assessment():
    patient_id = g.patient_id or (request.get_json() or {}).get('patient_id') or request.args.get('patient_id')
    if not patient_id:
        return jsonify({'success': False, 'error': 'patient_id required'}), 400
    if g.patient_id and patient_id != g.patient_id and not _is_staff():
        return jsonify({'success': False, 'error': 'Forbidden'}), 403

    if request.method == 'GET':
        row = db.session.execute(
            db.text(
                """
                SELECT * FROM sdoh_assessments
                WHERE patient_id = :pid
                ORDER BY created_at DESC LIMIT 1
                """
            ),
            {'pid': patient_id},
        ).fetchone()
        return jsonify({'success': True, 'assessment': _row_to_dict(row) if row else None}), 200

    data = request.get_json() or {}
    db.session.execute(
        db.text(
            """
            INSERT INTO sdoh_assessments (
              patient_id, transportation_need, financial_stress, health_literacy_score,
              housing_instability, food_insecurity, notes, answers_json
            ) VALUES (
              :pid, :transportation_need, :financial_stress, :health_literacy_score,
              :housing_instability, :food_insecurity, :notes, :answers_json
            )
            """
        ),
        {
            'pid': patient_id,
            'transportation_need': 1 if data.get('transportation_need') else 0,
            'financial_stress': 1 if data.get('financial_stress') else 0,
            'health_literacy_score': data.get('health_literacy_score'),
            'housing_instability': 1 if data.get('housing_instability') else 0,
            'food_insecurity': 1 if data.get('food_insecurity') else 0,
            'notes': data.get('notes'),
            'answers_json': json.dumps(data.get('answers') or data),
        },
    )
    db.session.commit()
    return jsonify({'success': True}), 200


@engagement_bp.route('/sdoh/resources', methods=['GET', 'OPTIONS'])
@require_jwt
def sdoh_resources():
    category = request.args.get('category')
    params = {}
    where = 'is_active = 1'
    if category:
        where += ' AND category = :category'
        params['category'] = category
    rows = db.session.execute(
        db.text(f'SELECT * FROM sdoh_resources WHERE {where} ORDER BY category, title'),
        params,
    ).fetchall()
    return jsonify({'success': True, 'resources': [_row_to_dict(r) for r in rows]}), 200


@engagement_bp.route('/decision-aids', methods=['GET', 'POST', 'OPTIONS'])
@require_jwt
def decision_aids():
    patient_id = g.patient_id or request.args.get('patient_id')
    if request.method == 'GET':
        if not patient_id:
            return jsonify({'success': False, 'error': 'patient_id required'}), 400
        rows = db.session.execute(
            db.text(
                """
                SELECT * FROM decision_aids_sessions
                WHERE patient_id = :pid
                ORDER BY created_at DESC LIMIT 20
                """
            ),
            {'pid': patient_id},
        ).fetchall()
        return jsonify({'success': True, 'sessions': [_row_to_dict(r) for r in rows]}), 200

    data = request.get_json() or {}
    patient_id = data.get('patient_id') or patient_id
    if not patient_id:
        return jsonify({'success': False, 'error': 'patient_id required'}), 400
    if g.patient_id and patient_id != g.patient_id and not _is_staff():
        return jsonify({'success': False, 'error': 'Forbidden'}), 403

    topic = (data.get('topic') or 'care_choice').strip()
    default_options = {
        'telemedicine_vs_in_person': [
            {'id': 'telemedicine', 'label': 'Telemedicine visit', 'pros': ['Convenient', 'No travel'], 'cons': ['Limited exam']},
            {'id': 'in_person', 'label': 'In-person visit', 'pros': ['Full exam', 'On-site tests'], 'cons': ['Travel time']},
        ],
        'screening_options': [
            {'id': 'schedule_now', 'label': 'Schedule screening now', 'pros': ['Earlier detection'], 'cons': ['Time commitment']},
            {'id': 'discuss_clinician', 'label': 'Discuss with clinician first', 'pros': ['Personalized advice'], 'cons': ['Delay']},
            {'id': 'defer', 'label': 'Defer for now', 'pros': ['More time to decide'], 'cons': ['Missed prevention window']},
        ],
        'referral_consent': [
            {'id': 'approve', 'label': 'Approve record sharing', 'pros': ['Faster specialist care'], 'cons': ['Shares clinical data']},
            {'id': 'decline', 'label': 'Decline for now', 'pros': ['Keeps records private'], 'cons': ['May delay referral']},
        ],
    }
    options = data.get('options') or default_options.get(topic) or default_options['telemedicine_vs_in_person']
    result = db.session.execute(
        db.text(
            """
            INSERT INTO decision_aids_sessions
              (patient_id, topic, options_json, preference_json, status, related_appointment_id, related_referral_id)
            VALUES (:pid, :topic, :options, :prefs, 'in_progress', :aid, :rid)
            """
        ),
        {
            'pid': patient_id,
            'topic': topic[:128],
            'options': json.dumps(options),
            'prefs': json.dumps(data.get('preferences') or {}),
            'aid': data.get('appointment_id'),
            'rid': data.get('referral_id'),
        },
    )
    db.session.commit()
    return jsonify({'success': True, 'session_id': int(result.lastrowid), 'options': options}), 200


@engagement_bp.route('/decision-aids/<int:session_id>', methods=['PUT', 'OPTIONS'])
@require_jwt
def decision_aid_update(session_id: int):
    data = request.get_json() or {}
    row = db.session.execute(
        db.text('SELECT patient_id FROM decision_aids_sessions WHERE session_id = :sid'),
        {'sid': session_id},
    ).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    owner = row[0] if not hasattr(row, '_mapping') else row._mapping['patient_id']
    if g.patient_id and owner != g.patient_id and not _is_staff():
        return jsonify({'success': False, 'error': 'Forbidden'}), 403

    chosen = data.get('chosen_option')
    prefs = data.get('preferences')
    status = data.get('status') or ('completed' if chosen else 'in_progress')
    db.session.execute(
        db.text(
            """
            UPDATE decision_aids_sessions
            SET chosen_option = COALESCE(:chosen, chosen_option),
                preference_json = COALESCE(:prefs, preference_json),
                status = :status,
                completed_at = CASE WHEN :status = 'completed' THEN NOW() ELSE completed_at END
            WHERE session_id = :sid
            """
        ),
        {
            'chosen': chosen,
            'prefs': json.dumps(prefs) if prefs is not None else None,
            'status': status,
            'sid': session_id,
        },
    )
    db.session.commit()
    return jsonify({'success': True}), 200


@engagement_bp.route('/satisfaction', methods=['POST', 'OPTIONS'])
@require_jwt
def satisfaction():
    data = request.get_json() or {}
    patient_id = data.get('patient_id') or g.patient_id
    score = data.get('score')
    if not patient_id or score is None:
        return jsonify({'success': False, 'error': 'patient_id and score required'}), 400
    try:
        score_i = int(score)
    except Exception:
        return jsonify({'success': False, 'error': 'score must be integer 1-5'}), 400
    if score_i < 1 or score_i > 5:
        return jsonify({'success': False, 'error': 'score must be 1-5'}), 400
    db.session.execute(
        db.text(
            """
            INSERT INTO engagement_satisfaction (patient_id, appointment_id, score, feedback)
            VALUES (:pid, :aid, :score, :feedback)
            """
        ),
        {
            'pid': patient_id,
            'aid': data.get('appointment_id'),
            'score': score_i,
            'feedback': data.get('feedback'),
        },
    )
    db.session.commit()
    return jsonify({'success': True}), 200


@engagement_bp.route('/jobs/run', methods=['POST', 'OPTIONS'])
@require_jwt
def run_jobs():
    """Manual trigger for staff/dev — process due events and optional rule packs."""
    if not _is_staff():
        return jsonify({'success': False, 'error': 'Staff only'}), 403
    data = request.get_json() or {}
    job = data.get('job') or 'due'
    try:
        if job == 'due':
            return jsonify(orchestrator.process_due_events()), 200
        if job == 'appt_24h':
            return jsonify(rules.schedule_appointment_reminders(24)), 200
        if job == 'appt_2h':
            return jsonify(rules.schedule_appointment_reminders(2)), 200
        if job == 'no_show':
            return jsonify(rules.process_no_show_followups()), 200
        if job == 'medications':
            return jsonify(rules.schedule_medication_reminders()), 200
        if job == 'care_gaps':
            return jsonify(rules.scan_care_gaps()), 200
        if job == 'followups':
            return jsonify(rules.schedule_followup_sequences()), 200
        if job == 'risk':
            return jsonify(rules.recompute_all_risks()), 200
        return jsonify({'success': False, 'error': f'Unknown job {job}'}), 400
    except Exception as exc:
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(exc)}), 500
