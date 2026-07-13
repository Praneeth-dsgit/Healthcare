"""
Doctor professional network — profile, connections, messages, feed, groups.
Uses doctors, specialties, facilities, and referrals data.
"""
import logging
import traceback
from datetime import datetime

from flask import Blueprint, g, jsonify, request

from config import db
from utils.jwt_utils import require_jwt

logger = logging.getLogger(__name__)

doctor_network_bp = Blueprint('doctor_network', __name__, url_prefix='/api/doctor-network')


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


def _primary_facility(doctor_id: int) -> str:
    row = db.session.execute(
        db.text(
            """
            SELECT COALESCE(f.name, 'Independent practice') AS facility
            FROM doctors d
            LEFT JOIN doctor_facilities df ON df.doctor_id = d.doctor_id AND df.is_active = TRUE
            LEFT JOIN facilities f ON f.facility_id = df.facility_id
            WHERE d.doctor_id = :doctor_id
            ORDER BY df.is_primary DESC, f.name ASC
            LIMIT 1
            """
        ),
        {'doctor_id': doctor_id},
    ).fetchone()
    return row[0] if row else 'Independent practice'



def _mutual_connections(doctor_id: int, other_doctor_id: int) -> int:
    row = db.session.execute(
        db.text(
            """
            SELECT COUNT(*) AS cnt FROM (
                SELECT CASE
                    WHEN requester_doctor_id = :doctor_id THEN target_doctor_id
                    ELSE requester_doctor_id
                END AS peer_id
                FROM doctor_connections
                WHERE status = 'accepted'
                  AND (:doctor_id IN (requester_doctor_id, target_doctor_id))
            ) mine
            INNER JOIN (
                SELECT CASE
                    WHEN requester_doctor_id = :other_id THEN target_doctor_id
                    ELSE requester_doctor_id
                END AS peer_id
                FROM doctor_connections
                WHERE status = 'accepted'
                  AND (:other_id IN (requester_doctor_id, target_doctor_id))
            ) theirs ON mine.peer_id = theirs.peer_id
            WHERE mine.peer_id NOT IN (:doctor_id, :other_id)
            """
        ),
        {'doctor_id': doctor_id, 'other_id': other_doctor_id},
    ).fetchone()
    return int(row[0]) if row else 0


def _connection_status(doctor_id: int, other_doctor_id: int) -> str:
    row = db.session.execute(
        db.text(
            """
            SELECT status, requester_doctor_id
            FROM doctor_connections
            WHERE (requester_doctor_id = :doctor_id AND target_doctor_id = :other_id)
               OR (requester_doctor_id = :other_id AND target_doctor_id = :doctor_id)
            ORDER BY connection_id DESC
            LIMIT 1
            """
        ),
        {'doctor_id': doctor_id, 'other_id': other_doctor_id},
    ).fetchone()
    if not row:
        return 'suggested'
    status, requester = row[0], int(row[1])
    if status == 'accepted':
        return 'connected'
    if status == 'pending' and requester == doctor_id:
        return 'pending'
    if status == 'pending':
        return 'suggested'
    return 'suggested'


def _build_endorsements(doctor_id: int, specialty: str) -> list[dict]:
    refs = 0
    appts = 0
    tele = False
    try:
        ref_row = db.session.execute(
            db.text(
                """
                SELECT COUNT(*) FROM referrals
                WHERE from_doctor_id = :doctor_id OR to_doctor_id = :doctor_id
                """
            ),
            {'doctor_id': doctor_id},
        ).fetchone()
        refs = int(ref_row[0]) if ref_row else 0
    except Exception:
        db.session.rollback()

    try:
        appt_row = db.session.execute(
            db.text("SELECT COUNT(*) FROM appointments WHERE doctor_id = :doctor_id"),
            {'doctor_id': doctor_id},
        ).fetchone()
        appts = int(appt_row[0]) if appt_row else 0
    except Exception:
        db.session.rollback()

    tele_row = db.session.execute(
        db.text(
            "SELECT offers_telemedicine FROM doctors WHERE doctor_id = :doctor_id"
        ),
        {'doctor_id': doctor_id},
    ).fetchone()
    tele = bool(tele_row and tele_row[0])

    endorsements = []
    if specialty:
        endorsements.append({'skill': specialty, 'count': max(refs, 1)})
    if appts > 0:
        endorsements.append({'skill': 'Patient Care', 'count': appts})
    if tele:
        endorsements.append({'skill': 'Telemedicine', 'count': max(refs, 1)})
    if refs > 0:
        endorsements.append({'skill': 'Referrals', 'count': refs})
    if not endorsements:
        endorsements.append({'skill': specialty or 'Clinical Practice', 'count': 1})
    return endorsements[:4]


@doctor_network_bp.route('/profile', methods=['GET', 'OPTIONS'])
@require_jwt
def get_profile():
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        row = db.session.execute(
            db.text(
                """
                SELECT
                    d.doctor_id,
                    d.first_name,
                    d.last_name,
                    d.qualification,
                    d.experience_years,
                    d.bio,
                    s.name AS specialty
                FROM doctors d
                LEFT JOIN specialties s ON s.specialty_id = d.specialty_id
                WHERE d.doctor_id = :doctor_id AND d.is_active = TRUE
                """
            ),
            {'doctor_id': doctor_id},
        ).fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Doctor not found'}), 404

        r = _row_dict(row)
        specialty = r.get('specialty') or 'General Medicine'
        hospital = _primary_facility(doctor_id)

        visibility = 'connections'
        verified = True
        stored_headline = ''
        try:
            np_row = db.session.execute(
                db.text(
                    """
                    SELECT headline, visibility, verified
                    FROM doctor_network_profiles
                    WHERE doctor_id = :doctor_id
                    """
                ),
                {'doctor_id': doctor_id},
            ).fetchone()
            if np_row:
                np = _row_dict(np_row)
                stored_headline = (np.get('headline') or '').strip()
                visibility = np.get('visibility') or 'connections'
                verified = bool(np.get('verified'))
        except Exception:
            db.session.rollback()

        headline = f"{specialty} | {hospital}"
        if stored_headline and len(stored_headline) <= 120:
            headline = stored_headline

        profile = {
            'doctorId': int(r['doctor_id']),
            'name': _doctor_display(r.get('first_name'), r.get('last_name')),
            'headline': headline,
            'specialty': specialty,
            'credentials': r.get('qualification') or 'MD',
            'hospital': hospital,
            'experienceYears': int(r.get('experience_years') or 0),
            'verified': verified,
            'endorsements': _build_endorsements(doctor_id, specialty),
            'visibility': visibility,
        }
        return jsonify({'success': True, 'profile': profile}), 200
    except Exception as e:
        logger.error('Error loading network profile: %s', e)
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to load profile'}), 500


@doctor_network_bp.route('/profile/visibility', methods=['PATCH'])
@require_jwt
def update_visibility():
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        data = request.get_json() or {}
        visibility = data.get('visibility')
        if visibility not in ('public', 'connections'):
            return jsonify({'success': False, 'error': 'Invalid visibility'}), 400

        db.session.execute(
            db.text(
                """
                INSERT INTO doctor_network_profiles (doctor_id, visibility)
                VALUES (:doctor_id, :visibility)
                ON DUPLICATE KEY UPDATE visibility = :visibility
                """
            ),
            {'doctor_id': doctor_id, 'visibility': visibility},
        )
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        logger.error('Error updating visibility: %s', e)
        return jsonify({'success': False, 'error': 'Failed to update visibility'}), 500


@doctor_network_bp.route('/connections', methods=['GET', 'OPTIONS'])
@require_jwt
def list_connections():
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
                    s.name AS specialty
                FROM doctors d
                LEFT JOIN specialties s ON s.specialty_id = d.specialty_id
                WHERE d.is_active = TRUE AND d.doctor_id != :doctor_id
                ORDER BY s.name, d.last_name, d.first_name
                LIMIT 50
                """
            ),
            {'doctor_id': doctor_id},
        ).fetchall()

        connections = []
        for row in rows:
            r = _row_dict(row)
            other_id = int(r['doctor_id'])
            status = _connection_status(doctor_id, other_id)
            connections.append({
                'id': str(other_id),
                'doctorId': other_id,
                'name': _doctor_display(r.get('first_name'), r.get('last_name')),
                'specialty': r.get('specialty') or 'General',
                'hospital': _primary_facility(other_id),
                'status': status,
                'mutualConnections': _mutual_connections(doctor_id, other_id),
            })

        # Connected doctors first, then suggested
        order = {'connected': 0, 'pending': 1, 'suggested': 2}
        connections.sort(key=lambda c: (order.get(c['status'], 3), c['name']))
        return jsonify({'success': True, 'connections': connections}), 200
    except Exception as e:
        logger.error('Error listing connections: %s', e)
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to load connections'}), 500


@doctor_network_bp.route('/connections', methods=['POST'])
@require_jwt
def create_connection():
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        data = request.get_json() or {}
        target_id = data.get('doctorId') or data.get('connectionId')
        if target_id is None:
            return jsonify({'success': False, 'error': 'doctorId required'}), 400

        target_id = int(target_id)
        if target_id == doctor_id:
            return jsonify({'success': False, 'error': 'Cannot connect to yourself'}), 400

        existing = _connection_status(doctor_id, target_id)
        if existing == 'connected':
            return jsonify({'success': True}), 200

        db.session.execute(
            db.text(
                """
                INSERT INTO doctor_connections (requester_doctor_id, target_doctor_id, status)
                VALUES (:requester, :target, 'pending')
                ON DUPLICATE KEY UPDATE status = IF(status = 'declined', 'pending', status)
                """
            ),
            {'requester': doctor_id, 'target': target_id},
        )
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        logger.error('Error creating connection: %s', e)
        return jsonify({'success': False, 'error': 'Failed to send connection request'}), 500


@doctor_network_bp.route('/messages', methods=['GET', 'OPTIONS'])
@require_jwt
def list_messages():
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        threads_rows = db.session.execute(
            db.text(
                """
                SELECT
                    t.thread_id,
                    t.doctor_low_id,
                    t.doctor_high_id,
                    t.updated_at
                FROM doctor_network_threads t
                WHERE t.doctor_low_id = :doctor_id OR t.doctor_high_id = :doctor_id
                ORDER BY t.updated_at DESC
                LIMIT 30
                """
            ),
            {'doctor_id': doctor_id},
        ).fetchall()

        threads = []
        for trow in threads_rows:
            t = _row_dict(trow)
            other_id = (
                int(t['doctor_high_id'])
                if int(t['doctor_low_id']) == doctor_id
                else int(t['doctor_low_id'])
            )
            doc = db.session.execute(
                db.text(
                    "SELECT first_name, last_name FROM doctors WHERE doctor_id = :did"
                ),
                {'did': other_id},
            ).fetchone()
            if not doc:
                continue

            msgs = db.session.execute(
                db.text(
                    """
                    SELECT message_id, sender_doctor_id, body, created_at
                    FROM doctor_network_messages
                    WHERE thread_id = :thread_id
                    ORDER BY created_at ASC
                    LIMIT 100
                    """
                ),
                {'thread_id': t['thread_id']},
            ).fetchall()

            message_list = []
            for m in msgs:
                mr = _row_dict(m)
                created = mr.get('created_at')
                if created and hasattr(created, 'isoformat'):
                    created = created.isoformat()
                message_list.append({
                    'id': str(mr['message_id']),
                    'sender': 'me' if int(mr['sender_doctor_id']) == doctor_id else 'them',
                    'text': mr.get('body') or '',
                    'at': created or datetime.utcnow().isoformat(),
                })

            last_msg = message_list[-1] if message_list else None
            threads.append({
                'id': str(t['thread_id']),
                'participantName': _doctor_display(doc[0], doc[1]),
                'participantId': other_id,
                'lastMessage': last_msg['text'] if last_msg else '',
                'lastAt': last_msg['at'] if last_msg else datetime.utcnow().isoformat(),
                'unread': 0,
                'messages': message_list,
            })

        return jsonify({'success': True, 'threads': threads}), 200
    except Exception as e:
        logger.error('Error listing messages: %s', e)
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to load messages'}), 500


@doctor_network_bp.route('/messages/<int:thread_id>', methods=['POST'])
@require_jwt
def send_message(thread_id: int):
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        data = request.get_json() or {}
        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'success': False, 'error': 'Message text required'}), 400

        thread = db.session.execute(
            db.text(
                """
                SELECT thread_id, doctor_low_id, doctor_high_id
                FROM doctor_network_threads
                WHERE thread_id = :thread_id
                  AND (:doctor_id IN (doctor_low_id, doctor_high_id))
                """
            ),
            {'thread_id': thread_id, 'doctor_id': doctor_id},
        ).fetchone()
        if not thread:
            return jsonify({'success': False, 'error': 'Thread not found'}), 404

        db.session.execute(
            db.text(
                """
                INSERT INTO doctor_network_messages (thread_id, sender_doctor_id, body)
                VALUES (:thread_id, :sender_id, :body)
                """
            ),
            {'thread_id': thread_id, 'sender_id': doctor_id, 'body': text},
        )
        db.session.execute(
            db.text(
                "UPDATE doctor_network_threads SET updated_at = NOW() WHERE thread_id = :thread_id"
            ),
            {'thread_id': thread_id},
        )
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        logger.error('Error sending message: %s', e)
        return jsonify({'success': False, 'error': 'Failed to send message'}), 500


@doctor_network_bp.route('/feed', methods=['GET', 'OPTIONS'])
@require_jwt
def get_feed():
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        rows = db.session.execute(
            db.text(
                """
                SELECT
                    p.post_id,
                    p.author_doctor_id,
                    p.author_name,
                    p.author_specialty,
                    p.content,
                    p.post_type,
                    p.created_at,
                    d.first_name,
                    d.last_name,
                    s.name AS doctor_specialty,
                    (
                        SELECT COUNT(*) FROM doctor_network_post_likes l
                        WHERE l.post_id = p.post_id
                    ) AS likes,
                    (
                        SELECT COUNT(*) FROM doctor_network_post_likes l
                        WHERE l.post_id = p.post_id AND l.doctor_id = :doctor_id
                    ) AS liked_by_me
                FROM doctor_network_posts p
                LEFT JOIN doctors d ON d.doctor_id = p.author_doctor_id
                LEFT JOIN specialties s ON s.specialty_id = d.specialty_id
                ORDER BY p.created_at DESC
                LIMIT 50
                """
            ),
            {'doctor_id': doctor_id},
        ).fetchall()

        posts = []
        for row in rows:
            r = _row_dict(row)
            created = r.get('created_at')
            if created and hasattr(created, 'isoformat'):
                created = created.isoformat()
            if r.get('author_doctor_id'):
                author = _doctor_display(r.get('first_name'), r.get('last_name'))
                specialty = r.get('doctor_specialty') or r.get('author_specialty') or 'Medicine'
            else:
                author = r.get('author_name') or 'Acufore Medical Network'
                specialty = r.get('author_specialty') or 'Admin'

            posts.append({
                'id': str(r['post_id']),
                'author': author,
                'authorSpecialty': specialty,
                'content': r.get('content') or '',
                'type': r.get('post_type') or 'publication',
                'likes': int(r.get('likes') or 0),
                'comments': 0,
                'at': created or datetime.utcnow().isoformat(),
                'likedByMe': bool(r.get('liked_by_me')),
            })

        return jsonify({'success': True, 'posts': posts}), 200
    except Exception as e:
        logger.error('Error loading feed: %s', e)
        return jsonify({'success': False, 'error': 'Failed to load feed'}), 500


@doctor_network_bp.route('/feed/<int:post_id>/like', methods=['POST'])
@require_jwt
def like_post(post_id: int):
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        exists = db.session.execute(
            db.text(
                "SELECT post_id FROM doctor_network_posts WHERE post_id = :post_id"
            ),
            {'post_id': post_id},
        ).fetchone()
        if not exists:
            return jsonify({'success': False, 'error': 'Post not found'}), 404

        db.session.execute(
            db.text(
                """
                INSERT IGNORE INTO doctor_network_post_likes (post_id, doctor_id)
                VALUES (:post_id, :doctor_id)
                """
            ),
            {'post_id': post_id, 'doctor_id': doctor_id},
        )
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        logger.error('Error liking post: %s', e)
        return jsonify({'success': False, 'error': 'Failed to like post'}), 500


@doctor_network_bp.route('/groups', methods=['GET', 'OPTIONS'])
@require_jwt
def list_groups():
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        rows = db.session.execute(
            db.text(
                """
                SELECT
                    g.group_id,
                    g.name,
                    g.description,
                    (
                        SELECT COUNT(*) FROM doctor_network_group_members m
                        WHERE m.group_id = g.group_id
                    ) AS members,
                    EXISTS (
                        SELECT 1 FROM doctor_network_group_members m
                        WHERE m.group_id = g.group_id AND m.doctor_id = :doctor_id
                    ) AS joined
                FROM doctor_network_groups g
                ORDER BY joined DESC, members DESC, g.name ASC
                LIMIT 30
                """
            ),
            {'doctor_id': doctor_id},
        ).fetchall()

        groups = []
        for row in rows:
            r = _row_dict(row)
            groups.append({
                'id': str(r['group_id']),
                'name': r.get('name') or 'Group',
                'members': int(r.get('members') or 0),
                'description': r.get('description') or '',
                'joined': bool(r.get('joined')),
            })

        return jsonify({'success': True, 'groups': groups}), 200
    except Exception as e:
        logger.error('Error listing groups: %s', e)
        return jsonify({'success': False, 'error': 'Failed to load groups'}), 500


@doctor_network_bp.route('/groups/<int:group_id>/join', methods=['POST'])
@require_jwt
def join_group(group_id: int):
    doctor_id, err = _require_doctor_id()
    if err:
        return err

    try:
        exists = db.session.execute(
            db.text("SELECT group_id FROM doctor_network_groups WHERE group_id = :gid"),
            {'gid': group_id},
        ).fetchone()
        if not exists:
            return jsonify({'success': False, 'error': 'Group not found'}), 404

        db.session.execute(
            db.text(
                """
                INSERT IGNORE INTO doctor_network_group_members (group_id, doctor_id)
                VALUES (:group_id, :doctor_id)
                """
            ),
            {'group_id': group_id, 'doctor_id': doctor_id},
        )
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        logger.error('Error joining group: %s', e)
        return jsonify({'success': False, 'error': 'Failed to join group'}), 500
