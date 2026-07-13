"""
Notification Routes
Handles WhatsApp and email notifications, and in-app notifications.
Uses JWT for protected routes; identity from Authorization: Bearer <accessToken>.
"""
from flask import Blueprint, request, jsonify, g
from config import db
import os
import logging
import traceback
from utils.jwt_utils import require_jwt

logger = logging.getLogger(__name__)

# Create blueprint
notifications_bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')

@notifications_bp.route('/send', methods=['POST'])
def send_notification():
    """Send a custom notification to a patient (orchestrated multi-channel when patient_id provided)."""
    try:
        data = request.get_json() or {}
        patient_identifier = data.get('patient_identifier') or data.get('patient_id')
        message = data.get('message')
        channels = data.get('channels')

        if not patient_identifier or not message:
            return jsonify({'error': 'Patient identifier and message are required'}), 400

        # Prefer engagement orchestrator when channels requested or patient_id looks like PAT*
        if channels or str(patient_identifier).startswith('PAT') or data.get('use_orchestrator'):
            try:
                from services import engagement_orchestrator as orchestrator
                result = orchestrator.create_event(
                    str(patient_identifier),
                    data.get('event_type') or 'manual',
                    channels=channels,
                    message=message,
                    send_now=True,
                    payload={'custom_message': message},
                )
                if result.get('success'):
                    return jsonify({'message': 'Notification sent successfully', 'result': result}), 200
                return jsonify({'error': result.get('error', 'Send failed'), 'result': result}), 400
            except Exception as orch_exc:
                logger.warning('Orchestrator send failed, falling back to WhatsApp: %s', orch_exc)

        from whatsapp_integration import whatsapp_notifier
        result = whatsapp_notifier.send_custom_notification(patient_identifier, message)

        if result['success']:
            return jsonify({'message': 'Notification sent successfully', 'result': result}), 200
        else:
            return jsonify({'error': result['error']}), 400

    except Exception as e:
        logger.error(f"Send notification error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@notifications_bp.route('/appointment-reminder', methods=['POST'])
def send_appointment_reminder():
    """Send appointment reminder to a patient via engagement orchestrator (+ WhatsApp fallback)."""
    try:
        data = request.get_json() or {}
        appointment_id = data.get('appointment_id')

        if not appointment_id:
            return jsonify({'error': 'Appointment ID is required'}), 400

        row = db.session.execute(
            db.text(
                """
                SELECT a.appointment_id, a.patient_id, a.appointment_date, a.appointment_time,
                       CONCAT(d.first_name, ' ', d.last_name) AS doctor_name
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                WHERE a.appointment_id = :aid
                """
            ),
            {'aid': appointment_id},
        ).fetchone()
        if row:
            from services import engagement_orchestrator as orchestrator
            appt = dict(row._mapping) if hasattr(row, '_mapping') else {
                'appointment_id': row[0],
                'patient_id': row[1],
                'appointment_date': row[2],
                'appointment_time': row[3],
                'doctor_name': row[4] if len(row) > 4 else None,
            }
            result = orchestrator.create_event(
                appt['patient_id'],
                'appointment_reminder',
                send_now=True,
                related_appointment_id=appointment_id,
                payload={
                    'appointment_date': str(appt.get('appointment_date') or ''),
                    'appointment_time': str(appt.get('appointment_time') or '')[:8],
                    'doctor_name': appt.get('doctor_name'),
                },
            )
            if result.get('success'):
                return jsonify({'message': 'Appointment reminder sent successfully', 'result': result}), 200

        from whatsapp_integration import whatsapp_notifier
        result = whatsapp_notifier.send_appointment_reminder(appointment_id)

        if result['success']:
            return jsonify({'message': 'Appointment reminder sent successfully', 'result': result}), 200
        else:
            return jsonify({'error': result['error']}), 400

    except Exception as e:
        logger.error(f"Appointment reminder error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@notifications_bp.route('/medication-reminder', methods=['POST'])
def send_medication_reminder():
    """Send medication reminder via orchestrator with WhatsApp fallback."""
    try:
        data = request.get_json() or {}
        patient_id = data.get('patient_id')
        medication_name = data.get('medication_name')
        dosage = data.get('dosage')
        time = data.get('time')

        if not all([patient_id, medication_name, dosage, time]):
            return jsonify({'error': 'Patient ID, medication name, dosage, and time are required'}), 400

        try:
            from services import engagement_orchestrator as orchestrator
            result = orchestrator.create_event(
                str(patient_id),
                'medication_reminder',
                send_now=True,
                payload={
                    'medication_name': medication_name,
                    'dosage': dosage,
                    'time': time,
                },
            )
            if result.get('success'):
                return jsonify({'message': 'Medication reminder sent successfully', 'result': result}), 200
        except Exception as orch_exc:
            logger.warning('Orchestrator medication reminder failed: %s', orch_exc)

        from whatsapp_integration import whatsapp_notifier
        result = whatsapp_notifier.send_medication_reminder(patient_id, medication_name, dosage, time)

        if result['success']:
            return jsonify({'message': 'Medication reminder sent successfully', 'result': result}), 200
        else:
            return jsonify({'error': result['error']}), 400

    except Exception as e:
        logger.error(f"Medication reminder error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@notifications_bp.route('/bulk-appointments', methods=['POST'])
def send_bulk_appointment_reminders():
    """Send reminders for all upcoming appointments"""
    try:
        from whatsapp_integration import whatsapp_notifier
        result = whatsapp_notifier.send_bulk_appointment_reminders()
        
        if result['success']:
            return jsonify({
                'message': 'Bulk appointment reminders sent successfully',
                'result': result
            }), 200
        else:
            return jsonify({'error': result['error']}), 400
        
    except Exception as e:
        logger.error(f"Bulk appointment reminders error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error'}), 500

@notifications_bp.route('/patient', methods=['GET', 'OPTIONS'])
@require_jwt
def get_patient_notifications():
    """Get in-app notifications for a patient"""
    try:
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Get query parameters
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'
        
        # Build query - include appointment_id if column exists
        query = """
            SELECT 
                notification_id,
                patient_id,
                notification_type,
                title,
                message,
                is_read,
                created_at,
                appointment_id
            FROM notifications
            WHERE patient_id = :patient_id
        """
        
        if unread_only:
            query += " AND is_read = FALSE"
        
        query += " ORDER BY created_at DESC LIMIT 50"
        
        result = db.session.execute(
            db.text(query),
            {"patient_id": patient_id}
        ).fetchall()
        
        notifications = []
        for row in result:
            notification = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            # Convert datetime to ISO format
            if notification.get('created_at'):
                notification['created_at'] = notification['created_at'].isoformat() if hasattr(notification['created_at'], 'isoformat') else str(notification['created_at'])
            notifications.append(notification)
        
        return jsonify({
            'success': True,
            'notifications': notifications
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching patient notifications: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch notifications: {str(e)}'
        }), 500

@notifications_bp.route('/patient/<int:notification_id>/read', methods=['PUT', 'OPTIONS'])
@require_jwt
def mark_notification_read(notification_id):
    """Mark a notification as read"""
    try:
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Verify notification belongs to patient
        check_result = db.session.execute(
            db.text("SELECT patient_id FROM notifications WHERE notification_id = :notification_id"),
            {"notification_id": notification_id}
        ).fetchone()
        
        if not check_result:
            return jsonify({
                'success': False,
                'error': 'Notification not found'
            }), 404
        
        if check_result[0] != patient_id:
            return jsonify({
                'success': False,
                'error': 'Unauthorized'
            }), 403
        
        # Mark as read
        db.session.execute(
            db.text("""
                UPDATE notifications 
                SET is_read = TRUE 
                WHERE notification_id = :notification_id
            """),
            {"notification_id": notification_id}
        )
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Notification marked as read'
        }), 200
        
    except Exception as e:
        logger.error(f"Error marking notification as read: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to mark notification as read: {str(e)}'
        }), 500

@notifications_bp.route('/patient/read-all', methods=['PUT', 'OPTIONS'])
@require_jwt
def mark_all_notifications_read():
    """Mark all notifications as read for a patient"""
    try:
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Mark all as read
        result = db.session.execute(
            db.text("""
                UPDATE notifications 
                SET is_read = TRUE 
                WHERE patient_id = :patient_id AND is_read = FALSE
            """),
            {"patient_id": patient_id}
        )
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'All notifications marked as read',
            'updated_count': result.rowcount
        }), 200
        
    except Exception as e:
        logger.error(f"Error marking all notifications as read: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to mark notifications as read: {str(e)}'
        }), 500

@notifications_bp.route('/patient/clear-all', methods=['DELETE', 'OPTIONS'])
@require_jwt
def clear_all_notifications():
    """Delete all notifications for a patient"""
    try:
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Delete all notifications for the patient
        result = db.session.execute(
            db.text("""
                DELETE FROM notifications 
                WHERE patient_id = :patient_id
            """),
            {"patient_id": patient_id}
        )
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'All notifications cleared',
            'deleted_count': result.rowcount
        }), 200
        
    except Exception as e:
        logger.error(f"Error clearing notifications: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to clear notifications: {str(e)}'
        }), 500

