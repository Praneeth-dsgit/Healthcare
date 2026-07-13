"""
Referral routes for GP dashboard and patient consent.
"""
import logging
import traceback
from datetime import datetime

from flask import Blueprint, g, jsonify, request

from config import db
from utils.jwt_utils import require_jwt

logger = logging.getLogger(__name__)

referrals_bp = Blueprint('referrals', __name__, url_prefix='/api/referrals')


def _require_doctor_id():
    doctor_id = getattr(g, 'doctor_id', None)
    if not doctor_id:
        return None, (jsonify({'success': False, 'error': 'Doctor profile required'}), 403)
    return doctor_id, None


def _row_dict(row):
    if row is None:
        return None
    return dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))


def _doctor_display(first: str, last: str) -> str:
    name = f"{first or ''} {last or ''}".strip()
    return f"Dr. {name}" if name else 'Doctor'


def _fetch_attached_record_ids(referral_id: int) -> list[str]:
    rows = db.session.execute(
        db.text(
            "SELECT record_id FROM referral_medical_records WHERE referral_id = :referral_id"
        ),
        {'referral_id': referral_id},
    ).fetchall()
    return [str(r[0]) for r in rows]


def _serialize_referral(row: dict, current_doctor_id: int) -> dict:
    from_id = int(row['from_doctor_id'])
    to_id = int(row['to_doctor_id'])
    direction = 'outgoing' if from_id == current_doctor_id else 'incoming'
    from_name = _doctor_display(row.get('from_first'), row.get('from_last'))
    to_name = _doctor_display(row.get('to_first'), row.get('to_last'))

    created = row.get('created_at')
    if created and hasattr(created, 'isoformat'):
        created = created.isoformat()

    return {
        'id': str(row['referral_id']),
        'direction': direction,
        'fromDoctorId': from_id,
        'toDoctorId': to_id,
        'patientName': f"{row.get('patient_first', '')} {row.get('patient_last', '')}".strip(),
        'patientId': row['patient_id'],
        'fromDoctor': from_name,
        'toDoctor': to_name,
        'specialty': row.get('specialty') or '',
        'urgency': row.get('urgency') or 'routine',
        'status': row.get('status') or 'pending',
        'clinicalNotes': row.get('clinical_notes') or '',
        'attachedRecords': _fetch_attached_record_ids(int(row['referral_id'])),
        'createdAt': created or datetime.utcnow().isoformat(),
        'consentStatus': row.get('consent_status') or 'approved',
    }


REFERRAL_SELECT = """
    SELECT
        r.referral_id,
        r.from_doctor_id,
        r.to_doctor_id,
        r.patient_id,
        r.specialty,
        r.urgency,
        r.status,
        r.consent_status,
        r.clinical_notes,
        r.created_at,
        p.first_name AS patient_first,
        p.last_name AS patient_last,
        fd.first_name AS from_first,
        fd.last_name AS from_last,
        td.first_name AS to_first,
        td.last_name AS to_last
    FROM referrals r
    JOIN patients p ON p.patient_id = r.patient_id
    JOIN doctors fd ON fd.doctor_id = r.from_doctor_id
    JOIN doctors td ON td.doctor_id = r.to_doctor_id
"""


@referrals_bp.route('', methods=['GET', 'OPTIONS'])
@require_jwt
def list_referrals():
    """List incoming or outgoing referrals for the logged-in doctor."""
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        direction = request.args.get('direction')
        query = REFERRAL_SELECT + " WHERE "
        params = {'doctor_id': doctor_id}

        if direction == 'outgoing':
            query += "r.from_doctor_id = :doctor_id"
        elif direction == 'incoming':
            query += "r.to_doctor_id = :doctor_id"
        else:
            query += "(r.from_doctor_id = :doctor_id OR r.to_doctor_id = :doctor_id)"

        query += " ORDER BY r.created_at DESC LIMIT 100"

        rows = db.session.execute(db.text(query), params).fetchall()
        referrals = [_serialize_referral(_row_dict(row), doctor_id) for row in rows]

        if direction in ('incoming', 'outgoing'):
            referrals = [r for r in referrals if r['direction'] == direction]

        return jsonify({'success': True, 'referrals': referrals}), 200
    except Exception as e:
        logger.error('Error listing referrals: %s', e)
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to load referrals'}), 500


@referrals_bp.route('', methods=['POST'])
@require_jwt
def create_referral():
    """Create a new referral from the logged-in GP to a specialist."""
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        data = request.get_json() or {}
        patient_id = (data.get('patientId') or '').strip()
        to_doctor_id = data.get('toDoctorId')
        specialty = (data.get('specialty') or '').strip()
        urgency = data.get('urgency') or 'routine'
        clinical_notes = (data.get('clinicalNotes') or '').strip()
        attached_records = data.get('attachedRecords') or []
        request_consent = bool(data.get('requestConsent'))

        if not patient_id or not to_doctor_id or not clinical_notes:
            return jsonify({
                'success': False,
                'error': 'patientId, toDoctorId, and clinicalNotes are required',
            }), 400

        if urgency not in ('routine', 'urgent', 'emergency'):
            urgency = 'routine'

        to_doctor_id = int(to_doctor_id)
        if to_doctor_id == doctor_id:
            return jsonify({'success': False, 'error': 'Cannot refer to yourself'}), 400

        patient_row = db.session.execute(
            db.text(
                "SELECT patient_id FROM patients WHERE patient_id = :pid AND is_active = TRUE"
            ),
            {'pid': patient_id},
        ).fetchone()
        if not patient_row:
            return jsonify({'success': False, 'error': 'Patient not found'}), 404

        specialist_row = db.session.execute(
            db.text(
                "SELECT doctor_id FROM doctors WHERE doctor_id = :did AND is_active = TRUE"
            ),
            {'did': to_doctor_id},
        ).fetchone()
        if not specialist_row:
            return jsonify({'success': False, 'error': 'Specialist not found'}), 404

        status = 'pending_consent' if request_consent else 'pending'
        consent_status = 'pending' if request_consent else 'approved'

        result = db.session.execute(
            db.text(
                """
                INSERT INTO referrals (
                    from_doctor_id, to_doctor_id, patient_id, specialty,
                    urgency, status, consent_status, clinical_notes
                ) VALUES (
                    :from_doctor_id, :to_doctor_id, :patient_id, :specialty,
                    :urgency, :status, :consent_status, :clinical_notes
                )
                """
            ),
            {
                'from_doctor_id': doctor_id,
                'to_doctor_id': to_doctor_id,
                'patient_id': patient_id,
                'specialty': specialty or None,
                'urgency': urgency,
                'status': status,
                'consent_status': consent_status,
                'clinical_notes': clinical_notes,
            },
        )
        referral_id = result.lastrowid

        record_ids = []
        for raw_id in attached_records:
            try:
                record_ids.append(int(raw_id))
            except (TypeError, ValueError):
                continue

        if record_ids:
            for rid in record_ids:
                valid = db.session.execute(
                    db.text(
                        """
                        SELECT record_id FROM medical_records
                        WHERE patient_id = :patient_id AND record_id = :record_id
                        LIMIT 1
                        """
                    ),
                    {'patient_id': patient_id, 'record_id': rid},
                ).fetchone()
                if valid:
                    db.session.execute(
                        db.text(
                            """
                            INSERT IGNORE INTO referral_medical_records (referral_id, record_id)
                            VALUES (:referral_id, :record_id)
                            """
                        ),
                        {'referral_id': referral_id, 'record_id': rid},
                    )

        if request_consent:
            to_doc = db.session.execute(
                db.text(
                    "SELECT first_name, last_name FROM doctors WHERE doctor_id = :did"
                ),
                {'did': to_doctor_id},
            ).fetchone()
            to_name = _doctor_display(to_doc[0], to_doc[1]) if to_doc else 'specialist'
            db.session.execute(
                db.text(
                    """
                    INSERT INTO referral_consent_requests (
                        referral_id, patient_id, title, message, status
                    ) VALUES (
                        :referral_id, :patient_id, :title, :message, 'pending'
                    )
                    """
                ),
                {
                    'referral_id': referral_id,
                    'patient_id': patient_id,
                    'title': 'Referral consent requested',
                    'message': (
                        f"{to_name} requests access to your records for a "
                        f"{specialty or 'specialist'} referral."
                    ),
                },
            )

        db.session.commit()

        row = db.session.execute(
            db.text(REFERRAL_SELECT + " WHERE r.referral_id = :referral_id"),
            {'referral_id': referral_id},
        ).fetchone()
        referral = _serialize_referral(_row_dict(row), doctor_id)
        return jsonify({'success': True, 'referral': referral}), 201
    except Exception as e:
        db.session.rollback()
        logger.error('Error creating referral: %s', e)
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to create referral'}), 500


@referrals_bp.route('/<int:referral_id>/status', methods=['PATCH'])
@require_jwt
def update_referral_status(referral_id: int):
    """Accept, reject, or update referral status."""
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        data = request.get_json() or {}
        new_status = data.get('status')
        allowed = ('accepted', 'rejected', 'completed', 'more_info', 'pending')
        if new_status not in allowed:
            return jsonify({'success': False, 'error': 'Invalid status'}), 400

        row = db.session.execute(
            db.text(
                """
                SELECT referral_id, to_doctor_id, from_doctor_id, status, consent_status
                FROM referrals WHERE referral_id = :referral_id
                """
            ),
            {'referral_id': referral_id},
        ).fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Referral not found'}), 404

        ref = _row_dict(row)
        if int(ref['to_doctor_id']) != doctor_id and int(ref['from_doctor_id']) != doctor_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403

        if new_status in ('accepted', 'rejected') and int(ref['to_doctor_id']) != doctor_id:
            return jsonify({'success': False, 'error': 'Only receiving specialist can accept/reject'}), 403

        if ref['consent_status'] == 'pending' and new_status == 'accepted':
            return jsonify({'success': False, 'error': 'Patient consent is still pending'}), 400

        db.session.execute(
            db.text("UPDATE referrals SET status = :status WHERE referral_id = :referral_id"),
            {'status': new_status, 'referral_id': referral_id},
        )
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        logger.error('Error updating referral status: %s', e)
        return jsonify({'success': False, 'error': 'Failed to update referral'}), 500


@referrals_bp.route('/<int:referral_id>/simulate-consent', methods=['POST'])
@require_jwt
def simulate_patient_consent(referral_id: int):
    """Approve pending consent (for referrals sent by the logged-in doctor)."""
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        row = db.session.execute(
            db.text(
                """
                SELECT referral_id, from_doctor_id, consent_status, status
                FROM referrals WHERE referral_id = :referral_id
                """
            ),
            {'referral_id': referral_id},
        ).fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Referral not found'}), 404

        ref = _row_dict(row)
        if int(ref['from_doctor_id']) != doctor_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403

        db.session.execute(
            db.text(
                """
                UPDATE referrals
                SET consent_status = 'approved', status = 'pending'
                WHERE referral_id = :referral_id
                """
            ),
            {'referral_id': referral_id},
        )
        db.session.execute(
            db.text(
                """
                UPDATE referral_consent_requests
                SET status = 'approved', responded_at = NOW()
                WHERE referral_id = :referral_id AND status = 'pending'
                """
            ),
            {'referral_id': referral_id},
        )
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        logger.error('Error simulating consent: %s', e)
        return jsonify({'success': False, 'error': 'Failed to update consent'}), 500


@referrals_bp.route('/specialists', methods=['GET', 'OPTIONS'])
@require_jwt
def list_specialists():
    """List active doctors (excluding self) for referral targets."""
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        rows = db.session.execute(
            db.text(
                """
                SELECT
                    d.doctor_id,
                    d.first_name,
                    d.last_name,
                    s.name AS specialty,
                    COALESCE(
                        (
                            SELECT f.name FROM doctor_facilities df
                            JOIN facilities f ON f.facility_id = df.facility_id
                            WHERE df.doctor_id = d.doctor_id AND df.is_active = TRUE
                            ORDER BY df.is_primary DESC, f.name ASC
                            LIMIT 1
                        ),
                        'Independent practice'
                    ) AS facility
                FROM doctors d
                LEFT JOIN specialties s ON s.specialty_id = d.specialty_id
                WHERE d.is_active = TRUE AND d.doctor_id != :doctor_id
                ORDER BY s.name, d.last_name, d.first_name
                LIMIT 100
                """
            ),
            {'doctor_id': doctor_id},
        ).fetchall()

        specialists = []
        for row in rows:
            r = _row_dict(row)
            specialists.append({
                'doctor_id': int(r['doctor_id']),
                'name': _doctor_display(r.get('first_name'), r.get('last_name')),
                'specialty': r.get('specialty') or 'General',
                'facility': r.get('facility') or 'Independent practice',
            })

        return jsonify({'success': True, 'specialists': specialists}), 200
    except Exception as e:
        logger.error('Error listing specialists: %s', e)
        return jsonify({'success': False, 'error': 'Failed to load specialists'}), 500


@referrals_bp.route('/consent-notifications', methods=['GET', 'OPTIONS'])
@require_jwt
def list_consent_notifications():
    """Pending referral consent requests for the logged-in patient."""
    patient_id = g.patient_id
    if not patient_id:
        return jsonify({'success': True, 'notifications': []}), 200

    try:
        rows = db.session.execute(
            db.text(
                """
                SELECT
                    consent_id,
                    referral_id,
                    patient_id,
                    title,
                    message,
                    status,
                    created_at
                FROM referral_consent_requests
                WHERE patient_id = :patient_id
                ORDER BY created_at DESC
                LIMIT 50
                """
            ),
            {'patient_id': patient_id},
        ).fetchall()

        notifications = []
        for row in rows:
            r = _row_dict(row)
            created = r.get('created_at')
            if created and hasattr(created, 'isoformat'):
                created = created.isoformat()
            notifications.append({
                'id': str(r['consent_id']),
                'referralId': str(r['referral_id']),
                'title': r.get('title') or 'Referral consent',
                'message': r.get('message') or '',
                'patientId': r['patient_id'],
                'status': r.get('status') or 'pending',
                'createdAt': created or datetime.utcnow().isoformat(),
            })

        return jsonify({'success': True, 'notifications': notifications}), 200
    except Exception as e:
        logger.error('Error listing consent notifications: %s', e)
        return jsonify({'success': False, 'error': 'Failed to load consent requests'}), 500


@referrals_bp.route('/consent-notifications/<int:consent_id>/respond', methods=['POST'])
@require_jwt
def respond_to_consent(consent_id: int):
    """Patient approves or declines a referral consent request."""
    patient_id = g.patient_id
    if not patient_id:
        return jsonify({'success': False, 'error': 'Patient profile required'}), 403

    try:
        data = request.get_json() or {}
        approved = bool(data.get('approved'))

        row = db.session.execute(
            db.text(
                """
                SELECT consent_id, referral_id, patient_id, status
                FROM referral_consent_requests
                WHERE consent_id = :consent_id
                """
            ),
            {'consent_id': consent_id},
        ).fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Consent request not found'}), 404

        consent = _row_dict(row)
        if consent['patient_id'] != patient_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403

        new_consent = 'approved' if approved else 'declined'
        new_referral_status = 'pending' if approved else 'rejected'
        new_referral_consent = 'approved' if approved else 'declined'

        db.session.execute(
            db.text(
                """
                UPDATE referral_consent_requests
                SET status = :status, responded_at = NOW()
                WHERE consent_id = :consent_id
                """
            ),
            {'status': new_consent, 'consent_id': consent_id},
        )
        db.session.execute(
            db.text(
                """
                UPDATE referrals
                SET consent_status = :consent_status, status = :status
                WHERE referral_id = :referral_id
                """
            ),
            {
                'consent_status': new_referral_consent,
                'status': new_referral_status,
                'referral_id': consent['referral_id'],
            },
        )
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        logger.error('Error responding to consent: %s', e)
        return jsonify({'success': False, 'error': 'Failed to respond'}), 500
