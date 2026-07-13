"""
Telemedicine: LAN signaling, doctor listing, visit booking, and visit records.
"""
from __future__ import annotations

import logging
import threading
import time
import traceback
from datetime import datetime, timedelta
from typing import Any

from flask import Blueprint, jsonify, request, g

from config import db
from utils.jwt_utils import require_jwt

logger = logging.getLogger(__name__)

telemedicine_bp = Blueprint('telemedicine', __name__, url_prefix='/api/telemedicine')

_lock = threading.Lock()
_rooms: dict[str, dict[str, Any]] = {}
_ROOM_TTL_SEC = 4 * 60 * 60  # 4 hours


def _has_telemedicine_column() -> bool:
    try:
        row = db.session.execute(
            db.text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'doctors' "
                "AND COLUMN_NAME = 'offers_telemedicine'"
            )
        ).fetchone()
        return bool(row and row[0])
    except Exception:
        return False


def doctor_supports_telemedicine(doctor_id: int) -> bool:
    if not _has_telemedicine_column():
        return True
    row = db.session.execute(
        db.text(
            "SELECT offers_telemedicine FROM doctors "
            "WHERE doctor_id = :doctor_id AND is_active = TRUE"
        ),
        {'doctor_id': doctor_id},
    ).fetchone()
    return bool(row and row[0])


def create_visit_for_appointment(
    appointment_id: int,
    patient_id: str,
    doctor_id: int,
    appointment_date: str,
    appointment_time: str,
    fee: float | None = None,
) -> str | None:
    try:
        table = db.session.execute(
            db.text(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'telemedicine_visits'"
            )
        ).fetchone()
        if not table or not table[0]:
            return f'visit-{appointment_id}'

        visit_id = f'visit-{appointment_id}'
        scheduled_at = f'{appointment_date} {appointment_time}'
        db.session.execute(
            db.text(
                """
                INSERT INTO telemedicine_visits (
                    visit_id, appointment_id, patient_id, doctor_id,
                    scheduled_at, status, fee, duration_minutes
                )
                VALUES (
                    :visit_id, :appointment_id, :patient_id, :doctor_id,
                    :scheduled_at, 'scheduled', :fee, 30
                )
                ON DUPLICATE KEY UPDATE
                    scheduled_at = VALUES(scheduled_at),
                    status = 'scheduled',
                    fee = VALUES(fee)
                """
            ),
            {
                'visit_id': visit_id,
                'appointment_id': appointment_id,
                'patient_id': patient_id,
                'doctor_id': doctor_id,
                'scheduled_at': scheduled_at,
                'fee': fee,
            },
        )
        db.session.commit()
        return visit_id
    except Exception as exc:
        logger.warning('Could not create telemedicine visit row: %s', exc)
        return f'visit-{appointment_id}'


def _serialize_visit_row(data: dict) -> dict:
    scheduled = data.get('scheduled_at')
    if hasattr(scheduled, 'isoformat'):
        scheduled_iso = scheduled.isoformat()
    else:
        scheduled_iso = str(scheduled)
    now = datetime.now()
    status = data.get('status', 'scheduled')
    can_join = status in ('scheduled', 'in_progress')
    if status in ('scheduled', 'in_progress') and scheduled:
        if hasattr(scheduled, 'timestamp'):
            start = scheduled
        else:
            start = datetime.fromisoformat(str(scheduled).replace('Z', ''))
        end = start + timedelta(minutes=int(data.get('duration_minutes') or 30))
        can_join = can_join and now <= end + timedelta(hours=24)

    doctor_first = data.get('doctor_first_name', '')
    doctor_last = data.get('doctor_last_name', '')
    return {
        'id': data.get('visit_id'),
        'appointmentId': data.get('appointment_id'),
        'patientId': data.get('patient_id'),
        'patientName': data.get('patient_name') or 'You',
        'doctorName': f"Dr. {doctor_first} {doctor_last}".strip(),
        'doctorId': data.get('doctor_id'),
        'specialty': data.get('specialty_name') or 'General Medicine',
        'reason': data.get('reason'),
        'scheduledAt': scheduled_iso,
        'status': data.get('status', 'scheduled'),
        'visitMode': 'video',
        'durationMinutes': int(data.get('duration_minutes') or 30),
        'fee': float(data.get('fee') or data.get('consultation_fee') or 0),
        'canJoin': can_join,
    }


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import atan2, cos, radians, sin, sqrt

    r = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    return r * 2 * atan2(sqrt(a), sqrt(1 - a))


@telemedicine_bp.route('/doctors', methods=['GET'])
def list_telemedicine_doctors():
    """List doctors available for telemedicine bookings."""
    try:
        search = (request.args.get('search') or '').strip().lower()
        specialty = (request.args.get('specialty') or '').strip().lower()
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        max_km = request.args.get('max_km', type=float, default=50.0)

        tele_filter = 'AND d.offers_telemedicine = TRUE' if _has_telemedicine_column() else ''
        rows = db.session.execute(
            db.text(
                f"""
                SELECT DISTINCT
                    d.doctor_id,
                    d.first_name,
                    d.last_name,
                    d.qualification,
                    d.experience_years,
                    d.consultation_fee,
                    d.is_available,
                    s.name AS specialty_name,
                    f.facility_id,
                    f.name AS facility_name,
                    f.city AS facility_city,
                    f.latitude AS facility_lat,
                    f.longitude AS facility_lng
                FROM doctors d
                LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
                LEFT JOIN doctor_facilities df ON d.doctor_id = df.doctor_id
                    AND df.is_primary = TRUE AND df.is_active = TRUE
                LEFT JOIN facilities f ON df.facility_id = f.facility_id AND f.is_active = TRUE
                WHERE d.is_active = TRUE {tele_filter}
                ORDER BY d.is_available DESC, d.first_name, d.last_name
                """
            )
        ).fetchall()

        doctors = []
        seen = set()
        for row in rows:
            doc = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            did = doc.get('doctor_id')
            if did in seen:
                continue
            seen.add(did)

            full_name = f"{doc.get('first_name', '')} {doc.get('last_name', '')}".lower()
            spec_name = (doc.get('specialty_name') or '').lower()
            if search and search not in full_name and search not in spec_name:
                continue
            if specialty and specialty not in spec_name:
                continue

            f_lat = doc.pop('facility_lat', None)
            f_lng = doc.pop('facility_lng', None)
            if lat is not None and lng is not None and f_lat is not None and f_lng is not None:
                dist = _haversine_km(lat, lng, float(f_lat), float(f_lng))
                if dist > max_km:
                    continue
                doc['distance_km'] = round(dist, 1)

            doctors.append(doc)

        if lat is not None and lng is not None:
            doctors.sort(key=lambda d: (d.get('distance_km') is None, d.get('distance_km') or 999))

        return jsonify({'success': True, 'doctors': doctors}), 200
    except Exception as exc:
        logger.error('Error listing telemedicine doctors: %s', exc)
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to load telemedicine doctors'}), 500


def _parse_visit_appointment_id(visit_id: str) -> int | None:
    if not visit_id.startswith('visit-'):
        return None
    suffix = visit_id[6:]
    if suffix.isdigit():
        return int(suffix)
    return None


def _appointment_status_to_visit_status(status: str | None) -> str:
    mapping = {
        'scheduled': 'scheduled',
        'confirmed': 'scheduled',
        'in_progress': 'in_progress',
        'completed': 'completed',
        'cancelled': 'cancelled',
        'no_show': 'cancelled',
    }
    return mapping.get((status or 'scheduled').lower(), 'scheduled')


def _fetch_visits_from_appointments(where_sql: str, params: dict) -> list[dict]:
    rows = db.session.execute(
        db.text(
            f"""
            SELECT
                CONCAT('visit-', a.appointment_id) AS visit_id,
                a.appointment_id,
                a.patient_id,
                a.doctor_id,
                a.reason,
                CONCAT(a.appointment_date, ' ', a.appointment_time) AS scheduled_at,
                a.status AS appointment_status,
                d.first_name AS doctor_first_name,
                d.last_name AS doctor_last_name,
                d.consultation_fee,
                s.name AS specialty_name,
                p.first_name AS patient_first_name,
                p.last_name AS patient_last_name
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.doctor_id
            LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
            LEFT JOIN patients p ON a.patient_id = p.patient_id
            WHERE a.appointment_type = 'video'
              AND a.status NOT IN ('cancelled', 'no_show')
              AND {where_sql}
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
            """
        ),
        params,
    ).fetchall()

    visits = []
    for row in rows:
        data = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
        data['status'] = _appointment_status_to_visit_status(data.pop('appointment_status', None))
        data['duration_minutes'] = 30
        data['fee'] = data.get('consultation_fee')
        pname = f"{data.get('patient_first_name', '')} {data.get('patient_last_name', '')}".strip()
        data['patient_name'] = pname or 'Patient'
        visits.append(_serialize_visit_row(data))
    return visits


def _fetch_visits(where_sql: str, params: dict) -> list[dict]:
    rows = db.session.execute(
        db.text(
            f"""
            SELECT
                tv.*,
                d.first_name AS doctor_first_name,
                d.last_name AS doctor_last_name,
                d.consultation_fee,
                s.name AS specialty_name,
                p.first_name AS patient_first_name,
                p.last_name AS patient_last_name,
                a.reason
            FROM telemedicine_visits tv
            JOIN doctors d ON tv.doctor_id = d.doctor_id
            LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
            LEFT JOIN patients p ON tv.patient_id = p.patient_id
            LEFT JOIN appointments a ON tv.appointment_id = a.appointment_id
            WHERE {where_sql}
            ORDER BY tv.scheduled_at ASC
            """
        ),
        params,
    ).fetchall()

    visits = []
    for row in rows:
        data = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
        pname = f"{data.get('patient_first_name', '')} {data.get('patient_last_name', '')}".strip()
        data['patient_name'] = pname or 'Patient'
        visits.append(_serialize_visit_row(data))
    return visits


def _telemedicine_table_exists() -> bool:
    table = db.session.execute(
        db.text(
            "SELECT COUNT(*) FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'telemedicine_visits'"
        )
    ).fetchone()
    return bool(table and table[0])


@telemedicine_bp.route('/visits', methods=['GET'])
@require_jwt
def list_patient_visits():
    """List telemedicine visits for the logged-in patient or doctor."""
    try:
        patient_id = g.patient_id
        doctor_id = getattr(g, 'doctor_id', None)

        if not patient_id and not doctor_id:
            return jsonify({'success': False, 'error': 'No patient or doctor record for this user'}), 400

        if not _telemedicine_table_exists():
            if patient_id:
                visits = _fetch_visits_from_appointments(
                    'a.patient_id = :patient_id', {'patient_id': patient_id}
                )
                for visit in visits:
                    visit['patientName'] = visit.get('patientName') or 'You'
            else:
                visits = _fetch_visits_from_appointments(
                    'a.doctor_id = :doctor_id', {'doctor_id': doctor_id}
                )
            return jsonify({'success': True, 'visits': visits}), 200

        if patient_id:
            visits = _fetch_visits('tv.patient_id = :patient_id', {'patient_id': patient_id})
            appt_visits = _fetch_visits_from_appointments(
                'a.patient_id = :patient_id', {'patient_id': patient_id}
            )
            for visit in visits:
                visit['patientName'] = visit.get('patientName') or 'You'
        else:
            visits = _fetch_visits('tv.doctor_id = :doctor_id', {'doctor_id': doctor_id})
            appt_visits = _fetch_visits_from_appointments(
                'a.doctor_id = :doctor_id', {'doctor_id': doctor_id}
            )

        seen = {v['id'] for v in visits}
        for visit in appt_visits:
            if visit['id'] not in seen:
                if patient_id:
                    visit['patientName'] = 'You'
                visits.append(visit)
                seen.add(visit['id'])
        visits.sort(key=lambda v: v.get('scheduledAt', ''))

        return jsonify({'success': True, 'visits': visits}), 200
    except Exception as exc:
        logger.error('Error listing telemedicine visits: %s', exc)
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to load telemedicine visits'}), 500


@telemedicine_bp.route('/visits/<visit_id>', methods=['GET'])
@require_jwt
def get_visit(visit_id: str):
    """Fetch a single telemedicine visit for patient or doctor."""
    try:
        patient_id = g.patient_id
        doctor_id = getattr(g, 'doctor_id', None)

        if not patient_id and not doctor_id:
            return jsonify({'success': False, 'error': 'No patient or doctor record for this user'}), 400

        if not _telemedicine_table_exists():
            appointment_id = _parse_visit_appointment_id(visit_id)
            if not appointment_id:
                return jsonify({'success': False, 'error': 'Visit not found'}), 404
            if patient_id:
                visits = _fetch_visits_from_appointments(
                    'a.appointment_id = :appointment_id AND a.patient_id = :patient_id',
                    {'appointment_id': appointment_id, 'patient_id': patient_id},
                )
            else:
                visits = _fetch_visits_from_appointments(
                    'a.appointment_id = :appointment_id AND a.doctor_id = :doctor_id',
                    {'appointment_id': appointment_id, 'doctor_id': doctor_id},
                )
            if not visits:
                return jsonify({'success': False, 'error': 'Visit not found'}), 404
            visit = visits[0]
            if patient_id:
                visit['patientName'] = visit.get('patientName') or 'You'
            return jsonify({'success': True, 'visit': visit}), 200

        if patient_id:
            visits = _fetch_visits(
                'tv.visit_id = :visit_id AND tv.patient_id = :patient_id',
                {'visit_id': visit_id, 'patient_id': patient_id},
            )
        else:
            visits = _fetch_visits(
                'tv.visit_id = :visit_id AND tv.doctor_id = :doctor_id',
                {'visit_id': visit_id, 'doctor_id': doctor_id},
            )

        if not visits:
            appointment_id = _parse_visit_appointment_id(visit_id)
            if appointment_id:
                if patient_id:
                    visits = _fetch_visits_from_appointments(
                        'a.appointment_id = :appointment_id AND a.patient_id = :patient_id',
                        {'appointment_id': appointment_id, 'patient_id': patient_id},
                    )
                else:
                    visits = _fetch_visits_from_appointments(
                        'a.appointment_id = :appointment_id AND a.doctor_id = :doctor_id',
                        {'appointment_id': appointment_id, 'doctor_id': doctor_id},
                    )

        if not visits:
            return jsonify({'success': False, 'error': 'Visit not found'}), 404

        visit = visits[0]
        if patient_id:
            visit['patientName'] = visit.get('patientName') or 'You'
        return jsonify({'success': True, 'visit': visit}), 200
    except Exception as exc:
        logger.error('Error fetching telemedicine visit: %s', exc)
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to load telemedicine visit'}), 500


@telemedicine_bp.route('/book', methods=['POST'])
@require_jwt
def book_telemedicine_appointment():
    """Book a telemedicine appointment and create a linked visit record."""
    try:
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({'success': False, 'error': 'No patient record for this user'}), 400

        data = request.get_json(silent=True) or {}
        required = ['doctor_id', 'facility_id', 'appointment_date', 'appointment_time']
        for field in required:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400

        doctor_id = int(data['doctor_id'])
        facility_id = int(data['facility_id'])
        if not doctor_supports_telemedicine(doctor_id):
            return jsonify({
                'success': False,
                'error': 'This doctor is not available for telemedicine',
            }), 400

        family_member_id = data.get('family_member_id')
        reason = data.get('reason') or 'Telemedicine consultation'

        result = db.session.execute(
            db.text(
                """
                INSERT INTO appointments (
                    patient_id, family_member_id, doctor_id, facility_id,
                    appointment_date, appointment_time, appointment_type, reason, status
                )
                VALUES (
                    :patient_id, :family_member_id, :doctor_id, :facility_id,
                    :appointment_date, :appointment_time, 'video', :reason, 'scheduled'
                )
                """
            ),
            {
                'patient_id': patient_id,
                'family_member_id': family_member_id,
                'doctor_id': doctor_id,
                'facility_id': facility_id,
                'appointment_date': data['appointment_date'],
                'appointment_time': data['appointment_time'],
                'reason': reason,
            },
        )
        db.session.commit()
        appointment_id = result.lastrowid

        fee_row = db.session.execute(
            db.text('SELECT consultation_fee FROM doctors WHERE doctor_id = :id'),
            {'id': doctor_id},
        ).fetchone()
        fee = float(fee_row[0]) if fee_row and fee_row[0] is not None else None

        visit_id = create_visit_for_appointment(
            appointment_id,
            patient_id,
            doctor_id,
            data['appointment_date'],
            data['appointment_time'],
            fee,
        )

        appt_row = db.session.execute(
            db.text(
                """
                SELECT a.*, d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
                       f.name AS facility_name, s.name AS specialty_name
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                LEFT JOIN facilities f ON a.facility_id = f.facility_id
                LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
                WHERE a.appointment_id = :appointment_id
                """
            ),
            {'appointment_id': appointment_id},
        ).fetchone()

        appointment = dict(appt_row._mapping) if appt_row else {}
        if appointment.get('appointment_date') and hasattr(appointment['appointment_date'], 'isoformat'):
            appointment['appointment_date'] = appointment['appointment_date'].isoformat()
        if appointment.get('appointment_time'):
            appointment['appointment_time'] = str(appointment['appointment_time'])

        visit = None
        if visit_id:
            visit = {
                'id': visit_id,
                'appointmentId': appointment_id,
                'doctorId': doctor_id,
                'doctorName': f"Dr. {appointment.get('doctor_first_name', '')} {appointment.get('doctor_last_name', '')}".strip(),
                'specialty': appointment.get('specialty_name') or 'General Medicine',
                'scheduledAt': f"{data['appointment_date']}T{data['appointment_time']}",
                'status': 'scheduled',
                'visitMode': 'video',
                'durationMinutes': 30,
                'fee': fee or 0,
                'canJoin': True,
                'patientName': 'You',
            }

        return jsonify({
            'success': True,
            'appointment': appointment,
            'visit': visit,
        }), 201
    except Exception as exc:
        logger.error('Error booking telemedicine: %s', exc)
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to book telemedicine appointment: {exc}'}), 500


def _prune_rooms() -> None:
    now = time.time()
    stale = [vid for vid, room in _rooms.items() if now - room.get('updated_at', 0) > _ROOM_TTL_SEC]
    for vid in stale:
        _rooms.pop(vid, None)


def _get_room(visit_id: str) -> dict[str, Any]:
    _prune_rooms()
    with _lock:
        room = _rooms.get(visit_id)
        if not room:
            room = {
                'signals': [],
                'messages': [],
                'presence': {},
                'updated_at': time.time(),
            }
            _rooms[visit_id] = room
        return room


@telemedicine_bp.route('/signaling/health', methods=['GET'])
def signaling_health():
    return jsonify({'success': True, 'service': 'telemedicine-signaling'}), 200


@telemedicine_bp.route('/signaling/<visit_id>/presence', methods=['GET'])
def get_presence(visit_id: str):
    room = _get_room(visit_id)
    with _lock:
        presence = dict(room.get('presence', {}))
    return jsonify({'success': True, 'presence': presence}), 200


@telemedicine_bp.route('/signaling/<visit_id>', methods=['POST'])
def post_signal(visit_id: str):
    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()
    signal_type = (data.get('type') or '').strip().lower()
    payload = data.get('payload')

    if role not in ('patient', 'doctor'):
        return jsonify({'success': False, 'error': 'role must be patient or doctor'}), 400
    if signal_type not in ('join', 'offer', 'answer', 'ice-candidate', 'leave'):
        return jsonify({'success': False, 'error': 'invalid signal type'}), 400

    room = _get_room(visit_id)
    now = time.time()
    entry = {
        'id': f'{int(now * 1000)}-{role}-{signal_type}',
        'from': role,
        'type': signal_type,
        'payload': payload,
        'at': now,
    }

    with _lock:
        room['updated_at'] = now
        room['presence'][role] = now
        if signal_type == 'leave':
            room['presence'].pop(role, None)
        else:
            room['signals'].append(entry)
            # cap history per room
            if len(room['signals']) > 500:
                room['signals'] = room['signals'][-500:]

    logger.info('Telemedicine signal visit=%s role=%s type=%s', visit_id, role, signal_type)
    return jsonify({'success': True, 'signal': entry}), 200


@telemedicine_bp.route('/signaling/<visit_id>', methods=['GET'])
def get_signals(visit_id: str):
    role = (request.args.get('role') or '').strip().lower()
    since = request.args.get('since', '0')

    try:
        since_ts = float(since)
    except (TypeError, ValueError):
        since_ts = 0.0

    if role not in ('patient', 'doctor'):
        return jsonify({'success': False, 'error': 'role query param required'}), 400

    room = _get_room(visit_id)
    with _lock:
        presence = dict(room.get('presence', {}))
        signals = [
            s for s in room.get('signals', [])
            if s.get('at', 0) > since_ts and s.get('from') != role
        ]

    return jsonify({
        'success': True,
        'signals': signals,
        'presence': presence,
    }), 200


@telemedicine_bp.route('/chat/<visit_id>', methods=['GET'])
def get_chat_messages(visit_id: str):
    """Poll in-visit chat messages (shared between patient and doctor)."""
    since_raw = request.args.get('since', '0')
    try:
        since_ts = float(since_raw)
    except (TypeError, ValueError):
        since_ts = 0.0

    room = _get_room(visit_id)
    with _lock:
        messages = [
            m for m in room.get('messages', [])
            if float(m.get('at_ts', 0)) > since_ts
        ]

    return jsonify({'success': True, 'messages': messages}), 200


@telemedicine_bp.route('/chat/<visit_id>', methods=['POST'])
def post_chat_message(visit_id: str):
    """Send a chat message to the visit room."""
    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()
    text = (data.get('text') or '').strip()
    sender_name = (data.get('senderName') or '').strip()

    if role not in ('patient', 'doctor'):
        return jsonify({'success': False, 'error': 'role must be patient or doctor'}), 400
    if not text:
        return jsonify({'success': False, 'error': 'text is required'}), 400

    now = time.time()
    message = {
        'id': f'msg-{int(now * 1000)}-{role}',
        'sender': role,
        'senderName': sender_name or ('Patient' if role == 'patient' else 'Doctor'),
        'text': text[:2000],
        'at': datetime.utcnow().isoformat() + 'Z',
        'at_ts': now,
    }

    room = _get_room(visit_id)
    with _lock:
        room.setdefault('messages', []).append(message)
        room['updated_at'] = now
        if len(room['messages']) > 500:
            room['messages'] = room['messages'][-500:]

    logger.info('Telemedicine chat visit=%s role=%s', visit_id, role)
    return jsonify({'success': True, 'message': message}), 201


def _append_system_message(room: dict, text: str) -> None:
    now = time.time()
    message = {
        'id': f'msg-{int(now * 1000)}-system',
        'sender': 'system',
        'senderName': 'System',
        'text': text[:2000],
        'at': datetime.utcnow().isoformat() + 'Z',
        'at_ts': now,
    }
    room.setdefault('messages', []).append(message)
    room['updated_at'] = now
    if len(room['messages']) > 500:
        room['messages'] = room['messages'][-500:]


def _conversation_text(room: dict[str, Any]) -> str:
    lines: list[str] = []
    for entry in room.get('transcript') or []:
        if not isinstance(entry, dict):
            continue
        speaker = (entry.get('speakerName') or entry.get('role') or 'Speaker').strip()
        text = (entry.get('text') or '').strip()
        if text:
            lines.append(f'{speaker}: {text}')
    for msg in room.get('messages') or []:
        if not isinstance(msg, dict):
            continue
        if (msg.get('sender') or '') == 'system':
            continue
        speaker = (msg.get('senderName') or msg.get('sender') or 'Speaker').strip()
        text = (msg.get('text') or '').strip()
        if text:
            lines.append(f'{speaker}: {text}')
    return '\n'.join(lines)


@telemedicine_bp.route('/visits/<visit_id>/transcript', methods=['GET'])
def get_visit_transcript(visit_id: str):
    room = _get_room(visit_id)
    with _lock:
        entries = list(room.get('transcript') or [])
    return jsonify({'success': True, 'entries': entries}), 200


@telemedicine_bp.route('/visits/<visit_id>/transcript', methods=['POST'])
def append_visit_transcript(visit_id: str):
    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()
    text = (data.get('text') or '').strip()
    if role not in ('patient', 'doctor'):
        return jsonify({'success': False, 'error': 'role must be patient or doctor'}), 400
    if not text:
        return jsonify({'success': False, 'error': 'text required'}), 400

    now = time.time()
    entry = {
        'id': f'trx-{int(now * 1000)}-{role}',
        'role': role,
        'speakerName': (data.get('speakerName') or role.title()).strip()[:120],
        'text': text[:4000],
        'at': datetime.utcnow().isoformat() + 'Z',
        'at_ts': now,
        'isFinal': bool(data.get('isFinal', True)),
    }

    room = _get_room(visit_id)
    with _lock:
        room.setdefault('transcript', []).append(entry)
        room['updated_at'] = now
        if len(room['transcript']) > 2000:
            room['transcript'] = room['transcript'][-2000:]

    return jsonify({'success': True, 'entry': entry}), 201


@telemedicine_bp.route('/visits/<visit_id>/prescription/generate', methods=['POST'])
def generate_visit_prescription(visit_id: str):
    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()
    if role != 'doctor':
        return jsonify({'success': False, 'error': 'Only doctor can generate prescription'}), 403

    room = _get_room(visit_id)
    with _lock:
        conversation = _conversation_text(room)
        patient_name = (data.get('patientName') or '').strip()
        doctor_name = (data.get('doctorName') or 'Doctor').strip()

    if not conversation.strip():
        return jsonify({
            'success': False,
            'error': 'No conversation transcript available yet',
        }), 400

    draft = {
        'diagnosis': None,
        'medications': [],
        'notes': None,
        'aiSummary': '',
        'doctorName': doctor_name,
        'status': 'draft',
        'prescribedAt': datetime.utcnow().isoformat() + 'Z',
    }

    try:
        import json
        import openai
        from config import OPENAI_API_KEY

        openai.api_key = OPENAI_API_KEY
        prompt = f"""You are a clinical documentation assistant. Based on this telemedicine visit conversation, produce a structured prescription draft.

Patient: {patient_name or 'Unknown'}
Doctor: {doctor_name}

Conversation:
{conversation[:12000]}

Respond with ONLY valid JSON (no markdown) in this shape:
{{
  "diagnosis": "string or null",
  "aiSummary": "2-4 sentence clinical summary of the visit including chief complaint, findings discussed, and plan",
  "medications": [
    {{
      "name": "medicine name",
      "dosage": "dose",
      "frequency": "e.g. twice a day",
      "duration": "e.g. 7 days",
      "instructions": "patient instructions"
    }}
  ],
  "notes": "additional notes for patient/pharmacy or null"
}}

Only include medications explicitly discussed or clearly implied. Use empty medications array if none were discussed."""

        response = openai.ChatCompletion.create(
            model='gpt-4.1',
            messages=[
                {
                    'role': 'system',
                    'content': 'You extract structured prescription data from doctor-patient conversations. Output JSON only.',
                },
                {'role': 'user', 'content': prompt},
            ],
            max_tokens=1500,
            temperature=0.2,
        )
        raw = (response.choices[0].message.get('content') or '').strip()
        if raw.startswith('```'):
            raw = raw.split('```', 2)[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            draft['diagnosis'] = (parsed.get('diagnosis') or '').strip()[:500] or None
            draft['aiSummary'] = (parsed.get('aiSummary') or '').strip()[:2000]
            draft['notes'] = (parsed.get('notes') or '').strip()[:1000] or None
            meds = parsed.get('medications') or []
            if isinstance(meds, list):
                cleaned = []
                for med in meds:
                    if not isinstance(med, dict):
                        continue
                    name = (med.get('name') or '').strip()
                    if not name:
                        continue
                    cleaned.append({
                        'name': name[:200],
                        'dosage': (med.get('dosage') or '').strip()[:100],
                        'frequency': (med.get('frequency') or '').strip()[:100],
                        'duration': (med.get('duration') or '').strip()[:100],
                        'instructions': (med.get('instructions') or '').strip()[:500],
                    })
                draft['medications'] = cleaned
    except Exception as exc:
        logger.warning('AI prescription generation failed visit=%s: %s', visit_id, exc)
        draft['aiSummary'] = (
            'AI summary could not be generated automatically. '
            'Please review the visit transcript and complete the prescription manually.'
        )

    with _lock:
        room['prescription_draft'] = draft
        room['updated_at'] = time.time()

    return jsonify({'success': True, 'draft': draft}), 200


@telemedicine_bp.route('/visits/<visit_id>/prescription', methods=['GET'])
def get_visit_prescription(visit_id: str):
    room = _get_room(visit_id)
    with _lock:
        prescription = room.get('prescription')
    if not prescription:
        return jsonify({'success': True, 'prescription': None}), 200
    return jsonify({'success': True, 'prescription': prescription}), 200


@telemedicine_bp.route('/visits/<visit_id>/prescription', methods=['POST'])
def save_visit_prescription(visit_id: str):
    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()
    if role != 'doctor':
        return jsonify({'success': False, 'error': 'Only doctor can prescribe'}), 403

    medications = data.get('medications') or []
    if not isinstance(medications, list) or not medications:
        return jsonify({'success': False, 'error': 'medications required'}), 400

    cleaned_meds = []
    for med in medications:
        if not isinstance(med, dict):
            continue
        name = (med.get('name') or '').strip()
        if not name:
            continue
        cleaned_meds.append({
            'name': name[:200],
            'dosage': (med.get('dosage') or '').strip()[:100],
            'frequency': (med.get('frequency') or '').strip()[:100],
            'duration': (med.get('duration') or '').strip()[:100],
            'instructions': (med.get('instructions') or '').strip()[:500],
        })

    if not cleaned_meds:
        return jsonify({'success': False, 'error': 'At least one medication required'}), 400

    reviewed = bool(data.get('reviewed'))
    finalize = bool(data.get('finalize'))
    if finalize and not reviewed:
        return jsonify({'success': False, 'error': 'Doctor must confirm prescription review'}), 400

    prescription = {
        'diagnosis': (data.get('diagnosis') or '').strip()[:500] or None,
        'medications': cleaned_meds,
        'notes': (data.get('notes') or '').strip()[:1000] or None,
        'aiSummary': (data.get('aiSummary') or '').strip()[:2000] or None,
        'doctorName': (data.get('doctorName') or 'Doctor').strip()[:200],
        'doctorQualification': (data.get('doctorQualification') or '').strip()[:200] or None,
        'patientId': (data.get('patientId') or '').strip()[:80] or None,
        'patientName': (data.get('patientName') or '').strip()[:200] or None,
        'patientAge': (data.get('patientAge') or '').strip()[:20] or None,
        'patientGender': (data.get('patientGender') or '').strip()[:20] or None,
        'status': 'sent' if finalize else 'draft',
        'reviewed': reviewed,
        'prescribedAt': datetime.utcnow().isoformat() + 'Z',
        'pdfRecordId': data.get('pdfRecordId'),
    }

    room = _get_room(visit_id)
    with _lock:
        room['prescription'] = prescription
        room.pop('prescription_draft', None)
        room['updated_at'] = time.time()
        if finalize:
            _append_system_message(
                room,
                f'Prescription finalized and sent to patient ({len(cleaned_meds)} medication{"s" if len(cleaned_meds) != 1 else ""}).',
            )
        else:
            _append_system_message(
                room,
                f"Prescription draft saved ({len(cleaned_meds)} medication{'s' if len(cleaned_meds) != 1 else ''}).",
            )

    logger.info('Telemedicine prescription visit=%s meds=%s finalize=%s', visit_id, len(cleaned_meds), finalize)
    return jsonify({'success': True, 'prescription': prescription}), 201


@telemedicine_bp.route('/visits/<visit_id>/payment', methods=['GET'])
def get_visit_payment(visit_id: str):
    room = _get_room(visit_id)
    with _lock:
        payment = room.get('payment')
    if not payment:
        return jsonify({'success': True, 'payment': {'status': 'pending', 'amount': 0}}), 200
    return jsonify({'success': True, 'payment': payment}), 200


@telemedicine_bp.route('/visits/<visit_id>/payment', methods=['POST'])
def submit_visit_payment(visit_id: str):
    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()
    if role != 'patient':
        return jsonify({'success': False, 'error': 'Only patient can submit payment'}), 403

    try:
        amount = float(data.get('amount') or 0)
    except (TypeError, ValueError):
        amount = 0.0

    payment = {
        'status': 'paid',
        'amount': amount,
        'paidAt': datetime.utcnow().isoformat() + 'Z',
    }

    room = _get_room(visit_id)
    with _lock:
        room['payment'] = payment
        room['updated_at'] = time.time()
        _append_system_message(
            room,
            f'Patient has completed payment of ₹{int(amount) if amount == int(amount) else amount}.',
        )

    logger.info('Telemedicine payment visit=%s amount=%s', visit_id, amount)
    return jsonify({'success': True, 'payment': payment}), 201
