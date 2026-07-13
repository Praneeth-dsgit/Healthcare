"""
Appointment Routes
Handles appointment management (CRUD operations).
Uses JWT for auth; identity from Authorization: Bearer <accessToken>.
"""
from flask import Blueprint, request, jsonify, g
import logging
import traceback
from config import db
from utils.jwt_utils import require_jwt

logger = logging.getLogger(__name__)

# Create blueprint
appointments_bp = Blueprint('appointments', __name__, url_prefix='/api')

@appointments_bp.route('/appointments', methods=['GET'])
@require_jwt
def get_appointments():
    """Get appointments for a patient or doctor"""
    try:
        patient_id = g.patient_id
        doctor_id = request.args.get('doctor_id')
        user_email = g.user_email
        
        if not patient_id and not doctor_id:
            # Resolve doctor_id from authenticated user
            doctor_result = db.session.execute(
                db.text("""
                    SELECT doctor_id FROM doctors
                    WHERE email = :email AND is_active = TRUE
                """),
                {"email": user_email}
            ).fetchone()
            if doctor_result:
                doctor_id = doctor_result[0]
                logger.info(f"User {user_email} identified as doctor with doctor_id: {doctor_id}")
            elif not patient_id:
                return jsonify({
                    'success': False,
                    'error': 'User not found as doctor or patient'
                }), 404
        
        # Build query based on whether filtering by doctor_id or patient_id
        if doctor_id:
            # Get appointments for the doctor
            where_clause = "a.doctor_id = :doctor_id"
            params = {"doctor_id": doctor_id}
        elif patient_id:
            # Get appointments for the patient
            where_clause = "a.patient_id = :patient_id"
            params = {"patient_id": patient_id}
        else:
            return jsonify({
                'success': False,
                'error': 'Either patient_id or doctor_id must be provided'
            }), 400
        
        # Get appointments
        result = db.session.execute(
            db.text(f"""
                SELECT 
                    a.appointment_id,
                    a.patient_id,
                    a.family_member_id,
                    a.doctor_id,
                    a.facility_id,
                    a.appointment_date,
                    a.appointment_time,
                    a.appointment_type,
                    a.reason,
                    a.status,
                    a.notes,
                    a.created_at,
                    d.first_name as doctor_first_name,
                    d.last_name as doctor_last_name,
                    f.name as facility_name,
                    fm.first_name as family_member_first_name,
                    fm.last_name as family_member_last_name,
                    p.first_name as patient_first_name,
                    p.last_name as patient_last_name,
                    p.email as patient_email
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                LEFT JOIN facilities f ON a.facility_id = f.facility_id
                LEFT JOIN family_members fm ON a.family_member_id = fm.family_member_id
                LEFT JOIN patients p ON a.patient_id = p.patient_id
                WHERE {where_clause}
                ORDER BY a.appointment_date DESC, a.appointment_time DESC
            """),
            params
        ).fetchall()
        
        appointments = []
        for row in result:
            appointment = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            # Convert date and time to strings
            if appointment.get('appointment_date'):
                appointment['appointment_date'] = appointment['appointment_date'].isoformat() if hasattr(appointment['appointment_date'], 'isoformat') else str(appointment['appointment_date'])
            if appointment.get('appointment_time'):
                if hasattr(appointment['appointment_time'], 'isoformat'):
                    appointment['appointment_time'] = appointment['appointment_time'].isoformat()
                elif isinstance(appointment['appointment_time'], str):
                    appointment['appointment_time'] = appointment['appointment_time']
                else:
                    appointment['appointment_time'] = str(appointment['appointment_time'])
            if appointment.get('created_at'):
                appointment['created_at'] = appointment['created_at'].isoformat() if hasattr(appointment['created_at'], 'isoformat') else str(appointment['created_at'])
            appointments.append(appointment)
        
        return jsonify({
            'success': True,
            'appointments': appointments
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching appointments: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': 'Failed to fetch appointments'
        }), 500

@appointments_bp.route('/appointments/<int:appointment_id>', methods=['GET'])
@require_jwt
def get_appointment(appointment_id):
    """Get a single appointment by ID"""
    try:
        patient_id = g.patient_id
        user_email = g.user_email
        doctor_id = None
        doctor_result = db.session.execute(
            db.text("SELECT doctor_id FROM doctors WHERE email = :email AND is_active = TRUE"),
            {"email": user_email}
        ).fetchone()
        if doctor_result:
            doctor_id = doctor_result[0]
        
        # Get the appointment
        result = db.session.execute(
            db.text("""
                SELECT 
                    a.appointment_id,
                    a.patient_id,
                    a.family_member_id,
                    a.doctor_id,
                    a.facility_id,
                    a.appointment_date,
                    a.appointment_time,
                    a.appointment_type,
                    a.reason,
                    a.status,
                    a.notes,
                    a.created_at,
                    d.first_name as doctor_first_name,
                    d.last_name as doctor_last_name,
                    f.name as facility_name,
                    fm.first_name as family_member_first_name,
                    fm.last_name as family_member_last_name,
                    p.first_name as patient_first_name,
                    p.last_name as patient_last_name,
                    p.email as patient_email
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                LEFT JOIN facilities f ON a.facility_id = f.facility_id
                LEFT JOIN family_members fm ON a.family_member_id = fm.family_member_id
                LEFT JOIN patients p ON a.patient_id = p.patient_id
                WHERE a.appointment_id = :appointment_id
            """),
            {"appointment_id": appointment_id}
        ).fetchone()
        
        if not result:
            return jsonify({
                'success': False,
                'error': 'Appointment not found'
            }), 404
        
        appointment = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
        
        # Verify authorization - user must be the patient or the doctor
        ok = (patient_id and appointment.get('patient_id') == patient_id) or (doctor_id is not None and appointment.get('doctor_id') == doctor_id)
        if not ok:
            return jsonify({
                'success': False,
                'error': 'Unauthorized'
            }), 403
        
        # Convert date and time to strings
        if appointment.get('appointment_date'):
            appointment['appointment_date'] = appointment['appointment_date'].isoformat() if hasattr(appointment['appointment_date'], 'isoformat') else str(appointment['appointment_date'])
        if appointment.get('appointment_time'):
            if hasattr(appointment['appointment_time'], 'isoformat'):
                appointment['appointment_time'] = appointment['appointment_time'].isoformat()
            elif isinstance(appointment['appointment_time'], str):
                appointment['appointment_time'] = appointment['appointment_time']
            else:
                appointment['appointment_time'] = str(appointment['appointment_time'])
        if appointment.get('created_at'):
            appointment['created_at'] = appointment['created_at'].isoformat() if hasattr(appointment['created_at'], 'isoformat') else str(appointment['created_at'])
        
        return jsonify({
            'success': True,
            'appointment': appointment
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching appointment: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': 'Failed to fetch appointment'
        }), 500

@appointments_bp.route('/appointments', methods=['POST'])
@require_jwt
def create_appointment():
    """Create a new appointment"""
    try:
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['doctor_id', 'facility_id', 'appointment_date', 'appointment_time']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Use patient_id from header if not provided in body
        appointment_patient_id = data.get('patient_id') or patient_id
        family_member_id = data.get('family_member_id')
        doctor_id = data.get('doctor_id')
        facility_id = data.get('facility_id')
        appointment_date = data.get('appointment_date')
        appointment_time = data.get('appointment_time')
        appointment_type = data.get('appointment_type', 'consultation')
        reason = data.get('reason')

        if appointment_type == 'video':
            from routes.telemedicine import doctor_supports_telemedicine, create_visit_for_appointment
            if not doctor_supports_telemedicine(int(doctor_id)):
                return jsonify({
                    'success': False,
                    'error': 'This doctor is not available for telemedicine',
                }), 400
        
        # Insert appointment
        result = db.session.execute(
            db.text("""
                INSERT INTO appointments (
                    patient_id, family_member_id, doctor_id, facility_id,
                    appointment_date, appointment_time, appointment_type, reason, status
                )
                VALUES (
                    :patient_id, :family_member_id, :doctor_id, :facility_id,
                    :appointment_date, :appointment_time, :appointment_type, :reason, 'scheduled'
                )
            """),
            {
                'patient_id': appointment_patient_id,
                'family_member_id': family_member_id,
                'doctor_id': doctor_id,
                'facility_id': facility_id,
                'appointment_date': appointment_date,
                'appointment_time': appointment_time,
                'appointment_type': appointment_type,
                'reason': reason
            }
        )
        db.session.commit()
        
        # Get the created appointment
        appointment_id = result.lastrowid
        appointment_result = db.session.execute(
            db.text("""
                SELECT 
                    a.*,
                    d.first_name as doctor_first_name,
                    d.last_name as doctor_last_name,
                    f.name as facility_name
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                LEFT JOIN facilities f ON a.facility_id = f.facility_id
                WHERE a.appointment_id = :appointment_id
            """),
            {"appointment_id": appointment_id}
        ).fetchone()
        
        if appointment_result:
            appointment = dict(appointment_result._mapping) if hasattr(appointment_result, '_mapping') else dict(zip(appointment_result.keys(), appointment_result))
            # Convert dates
            if appointment.get('appointment_date'):
                appointment['appointment_date'] = appointment['appointment_date'].isoformat() if hasattr(appointment['appointment_date'], 'isoformat') else str(appointment['appointment_date'])
            if appointment.get('appointment_time'):
                appointment['appointment_time'] = str(appointment['appointment_time'])
            if appointment.get('created_at'):
                appointment['created_at'] = appointment['created_at'].isoformat() if hasattr(appointment['created_at'], 'isoformat') else str(appointment['created_at'])

            visit_id = None
            if appointment_type == 'video':
                from routes.telemedicine import create_visit_for_appointment
                fee_row = db.session.execute(
                    db.text('SELECT consultation_fee FROM doctors WHERE doctor_id = :id'),
                    {'id': doctor_id},
                ).fetchone()
                fee = float(fee_row[0]) if fee_row and fee_row[0] is not None else None
                visit_id = create_visit_for_appointment(
                    appointment_id,
                    appointment_patient_id,
                    doctor_id,
                    appointment_date,
                    appointment_time,
                    fee,
                )
                db.session.commit()
                appointment['telemedicine_visit_id'] = visit_id

            try:
                from services import engagement_orchestrator as eng
                doctor_name = ' '.join(
                    p for p in [
                        appointment.get('doctor_first_name'),
                        appointment.get('doctor_last_name'),
                    ] if p
                ).strip() or None
                eng.create_event(
                    appointment_patient_id,
                    'appointment_confirmation',
                    send_now=True,
                    related_appointment_id=appointment_id,
                    payload={
                        'appointment_date': appointment.get('appointment_date'),
                        'appointment_time': str(appointment.get('appointment_time') or '')[:8],
                        'doctor_name': doctor_name,
                    },
                )
            except Exception as eng_exc:
                logger.warning('Appointment confirmation engagement skipped: %s', eng_exc)
            
            return jsonify({
                'success': True,
                'appointment': appointment,
                'visit_id': visit_id,
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve created appointment'
            }), 500
        
    except Exception as e:
        logger.error(f"Error creating appointment: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to create appointment: {str(e)}'
        }), 500

@appointments_bp.route('/appointments/<int:appointment_id>/cancel', methods=['POST', 'OPTIONS'])
@require_jwt
def cancel_appointment(appointment_id):
    """Cancel an appointment"""
    try:
        if request.method == 'OPTIONS':
            return jsonify({'success': True}), 200
        
        # Update appointment status to cancelled
        db.session.execute(
            db.text("""
                UPDATE appointments 
                SET status = 'cancelled', updated_at = NOW()
                WHERE appointment_id = :appointment_id
            """),
            {"appointment_id": appointment_id}
        )
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Appointment cancelled successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error cancelling appointment: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to cancel appointment: {str(e)}'
        }), 500

@appointments_bp.route('/appointments/<int:appointment_id>', methods=['PUT'])
@require_jwt
def update_appointment(appointment_id):
    """Update an appointment (edit appointment details)"""
    try:
        data = request.get_json()
        
        # Build update query dynamically
        update_fields = []
        update_values = {'appointment_id': appointment_id}
        
        if 'appointment_date' in data:
            update_fields.append("appointment_date = :appointment_date")
            update_values['appointment_date'] = data['appointment_date']
        
        if 'appointment_time' in data:
            update_fields.append("appointment_time = :appointment_time")
            update_values['appointment_time'] = data['appointment_time']
        
        if 'appointment_type' in data:
            update_fields.append("appointment_type = :appointment_type")
            update_values['appointment_type'] = data['appointment_type']
        
        if 'reason' in data:
            update_fields.append("reason = :reason")
            update_values['reason'] = data['reason']
        
        if 'notes' in data:
            update_fields.append("notes = :notes")
            update_values['notes'] = data['notes']
        
        if not update_fields:
            return jsonify({
                'success': False,
                'error': 'No fields to update'
            }), 400
        
        # Update appointment
        sql = f"""
            UPDATE appointments 
            SET {', '.join(update_fields)}, updated_at = NOW()
            WHERE appointment_id = :appointment_id
        """
        
        db.session.execute(db.text(sql), update_values)
        db.session.commit()
        
        # Get patient_id for notification
        appointment_result = db.session.execute(
            db.text("SELECT patient_id FROM appointments WHERE appointment_id = :appointment_id"),
            {"appointment_id": appointment_id}
        ).fetchone()
        
        if appointment_result:
            patient_id = appointment_result[0]
            # Create in-app notification for patient
            try:
                # Check if notifications table has appointment_id column, if not, add it
                try:
                    # Check if column exists
                    check_result = db.session.execute(db.text("""
                        SELECT COUNT(*) as col_count
                        FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                        AND TABLE_NAME = 'notifications'
                        AND COLUMN_NAME = 'appointment_id'
                    """)).fetchone()
                    
                    if check_result and check_result[0] == 0:
                        # Column doesn't exist, add it
                        db.session.execute(db.text("""
                            ALTER TABLE notifications 
                            ADD COLUMN appointment_id INT
                        """))
                        db.session.commit()
                except Exception as e:
                    db.session.rollback()
                    # Column might already exist or table structure is different
                    logger.warning(f"Could not add appointment_id column: {e}")
                
                notification_message = "Your appointment has been updated. Please check the details."
                # Try with appointment_id first, fallback to without if column doesn't exist
                try:
                    db.session.execute(
                        db.text("""
                            INSERT INTO notifications (patient_id, notification_type, title, message, appointment_id, is_read, created_at)
                            VALUES (:patient_id, 'appointment_update', 'Appointment Updated', :message, :appointment_id, FALSE, NOW())
                        """),
                        {
                            'patient_id': patient_id,
                            'message': notification_message,
                            'appointment_id': appointment_id
                        }
                    )
                except Exception:
                    # If appointment_id column doesn't exist, insert without it
                    db.session.execute(
                        db.text("""
                            INSERT INTO notifications (patient_id, notification_type, title, message, is_read, created_at)
                            VALUES (:patient_id, 'appointment_update', 'Appointment Updated', :message, FALSE, NOW())
                        """),
                        {
                            'patient_id': patient_id,
                            'message': notification_message
                        }
                    )
                db.session.commit()
            except Exception as notif_error:
                # If notifications table doesn't exist, log but don't fail
                logger.warning(f"Could not create notification: {notif_error}")
                db.session.rollback()
        
        # Get updated appointment
        result = db.session.execute(
            db.text("""
                SELECT 
                    a.*,
                    d.first_name as doctor_first_name,
                    d.last_name as doctor_last_name,
                    f.name as facility_name,
                    p.first_name as patient_first_name,
                    p.last_name as patient_last_name,
                    p.email as patient_email
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                LEFT JOIN facilities f ON a.facility_id = f.facility_id
                LEFT JOIN patients p ON a.patient_id = p.patient_id
                WHERE a.appointment_id = :appointment_id
            """),
            {"appointment_id": appointment_id}
        ).fetchone()
        
        if result:
            updated_appointment = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
            # Convert dates
            if updated_appointment.get('appointment_date'):
                updated_appointment['appointment_date'] = updated_appointment['appointment_date'].isoformat() if hasattr(updated_appointment['appointment_date'], 'isoformat') else str(updated_appointment['appointment_date'])
            if updated_appointment.get('appointment_time'):
                updated_appointment['appointment_time'] = str(updated_appointment['appointment_time'])
            if updated_appointment.get('created_at'):
                updated_appointment['created_at'] = updated_appointment['created_at'].isoformat() if hasattr(updated_appointment['created_at'], 'isoformat') else str(updated_appointment['created_at'])
            
            return jsonify({
                'success': True,
                'appointment': updated_appointment,
                'message': 'Appointment updated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Appointment not found'
            }), 404
        
    except Exception as e:
        logger.error(f"Error updating appointment: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to update appointment: {str(e)}'
        }), 500

@appointments_bp.route('/appointments/<int:appointment_id>/status', methods=['PUT'])
@require_jwt
def update_appointment_status(appointment_id):
    """Update appointment status (completed, pending, cancelled)"""
    try:
        data = request.get_json()
        new_status = data.get('status')
        
        if not new_status:
            return jsonify({
                'success': False,
                'error': 'status is required'
            }), 400
        
        # Validate status (scheduled, pending, completed, cancelled only)
        valid_statuses = ['scheduled', 'pending', 'completed', 'cancelled']
        if new_status not in valid_statuses:
            return jsonify({
                'success': False,
                'error': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'
            }), 400
        
        # Update appointment status
        db.session.execute(
            db.text("""
                UPDATE appointments 
                SET status = :status, updated_at = NOW()
                WHERE appointment_id = :appointment_id
            """),
            {
                'appointment_id': appointment_id,
                'status': new_status
            }
        )
        db.session.commit()
        
        # Get patient_id for notification
        appointment_result = db.session.execute(
            db.text("SELECT patient_id FROM appointments WHERE appointment_id = :appointment_id"),
            {"appointment_id": appointment_id}
        ).fetchone()
        
        if appointment_result:
            patient_id = appointment_result[0]
            # Create in-app notification for patient
            try:
                # Create notifications table if it doesn't exist
                try:
                    db.session.execute(db.text("""
                        CREATE TABLE IF NOT EXISTS notifications (
                            notification_id INT AUTO_INCREMENT PRIMARY KEY,
                            patient_id VARCHAR(50),
                            notification_type VARCHAR(50),
                            title VARCHAR(255),
                            message TEXT,
                            is_read BOOLEAN DEFAULT FALSE,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
                        )
                    """))
                    db.session.commit()
                except Exception:
                    pass  # Table might already exist
                
                status_messages = {
                    'completed': 'Your appointment has been marked as completed.',
                    'cancelled': 'Your appointment has been cancelled.',
                    'pending': 'Your appointment status has been updated to pending.',
                    'scheduled': 'Your appointment has been scheduled.'
                }
                notification_message = status_messages.get(new_status, 'Your appointment status has been updated.')
                
                # Check if notifications table has appointment_id column, if not, add it
                try:
                    # Check if column exists
                    check_result = db.session.execute(db.text("""
                        SELECT COUNT(*) as col_count
                        FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                        AND TABLE_NAME = 'notifications'
                        AND COLUMN_NAME = 'appointment_id'
                    """)).fetchone()
                    
                    if check_result and check_result[0] == 0:
                        # Column doesn't exist, add it
                        db.session.execute(db.text("""
                            ALTER TABLE notifications 
                            ADD COLUMN appointment_id INT
                        """))
                        db.session.commit()
                except Exception as e:
                    db.session.rollback()
                    # Column might already exist or table structure is different
                    logger.warning(f"Could not add appointment_id column: {e}")
                
                # Try with appointment_id first, fallback to without if column doesn't exist
                try:
                    db.session.execute(
                        db.text("""
                            INSERT INTO notifications (patient_id, notification_type, title, message, appointment_id, is_read, created_at)
                            VALUES (:patient_id, 'appointment_status', 'Appointment Status Updated', :message, :appointment_id, FALSE, NOW())
                        """),
                        {
                            'patient_id': patient_id,
                            'message': notification_message,
                            'appointment_id': appointment_id
                        }
                    )
                except Exception:
                    # If appointment_id column doesn't exist, insert without it
                    db.session.execute(
                        db.text("""
                            INSERT INTO notifications (patient_id, notification_type, title, message, is_read, created_at)
                            VALUES (:patient_id, 'appointment_status', 'Appointment Status Updated', :message, FALSE, NOW())
                        """),
                        {
                            'patient_id': patient_id,
                            'message': notification_message
                        }
                    )
                db.session.commit()
            except Exception as notif_error:
                # If notifications table doesn't exist, log but don't fail
                logger.warning(f"Could not create notification: {notif_error}")
                db.session.rollback()
        
        # Get updated appointment
        result = db.session.execute(
            db.text("""
                SELECT 
                    a.*,
                    d.first_name as doctor_first_name,
                    d.last_name as doctor_last_name,
                    f.name as facility_name,
                    p.first_name as patient_first_name,
                    p.last_name as patient_last_name,
                    p.email as patient_email
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                LEFT JOIN facilities f ON a.facility_id = f.facility_id
                LEFT JOIN patients p ON a.patient_id = p.patient_id
                WHERE a.appointment_id = :appointment_id
            """),
            {"appointment_id": appointment_id}
        ).fetchone()
        
        if result:
            updated_appointment = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
            # Convert dates
            if updated_appointment.get('appointment_date'):
                updated_appointment['appointment_date'] = updated_appointment['appointment_date'].isoformat() if hasattr(updated_appointment['appointment_date'], 'isoformat') else str(updated_appointment['appointment_date'])
            if updated_appointment.get('appointment_time'):
                updated_appointment['appointment_time'] = str(updated_appointment['appointment_time'])
            if updated_appointment.get('created_at'):
                updated_appointment['created_at'] = updated_appointment['created_at'].isoformat() if hasattr(updated_appointment['created_at'], 'isoformat') else str(updated_appointment['created_at'])
            
            return jsonify({
                'success': True,
                'appointment': updated_appointment,
                'message': f'Appointment status updated to {new_status}'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Appointment not found'
            }), 404
        
    except Exception as e:
        logger.error(f"Error updating appointment status: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to update appointment status: {str(e)}'
        }), 500

@appointments_bp.route('/appointments/<int:appointment_id>/reschedule', methods=['POST', 'OPTIONS'])
@require_jwt
def reschedule_appointment(appointment_id):
    """Reschedule an appointment"""
    try:
        if request.method == 'OPTIONS':
            return jsonify({'success': True}), 200
        
        data = request.get_json()
        
        if not data.get('appointment_date') or not data.get('appointment_time'):
            return jsonify({
                'success': False,
                'error': 'appointment_date and appointment_time are required'
            }), 400
        
        # Update appointment
        update_fields = []
        update_values = {'appointment_id': appointment_id}
        
        if 'appointment_date' in data:
            update_fields.append("appointment_date = :appointment_date")
            update_values['appointment_date'] = data['appointment_date']
        
        if 'appointment_time' in data:
            update_fields.append("appointment_time = :appointment_time")
            update_values['appointment_time'] = data['appointment_time']
        
        if 'reason' in data:
            update_fields.append("reason = :reason")
            update_values['reason'] = data['reason']
        
        if not update_fields:
            return jsonify({
                'success': False,
                'error': 'No fields to update'
            }), 400
        
        sql = f"""
            UPDATE appointments 
            SET {', '.join(update_fields)}, status = 'rescheduled', updated_at = NOW()
            WHERE appointment_id = :appointment_id
        """
        
        db.session.execute(db.text(sql), update_values)
        db.session.commit()
        
        # Get updated appointment
        result = db.session.execute(
            db.text("""
                SELECT 
                    a.*,
                    d.first_name as doctor_first_name,
                    d.last_name as doctor_last_name,
                    f.name as facility_name
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                LEFT JOIN facilities f ON a.facility_id = f.facility_id
                WHERE a.appointment_id = :appointment_id
            """),
            {"appointment_id": appointment_id}
        ).fetchone()
        
        if result:
            updated_appointment = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
            # Convert dates
            if updated_appointment.get('appointment_date'):
                updated_appointment['appointment_date'] = updated_appointment['appointment_date'].isoformat() if hasattr(updated_appointment['appointment_date'], 'isoformat') else str(updated_appointment['appointment_date'])
            if updated_appointment.get('appointment_time'):
                updated_appointment['appointment_time'] = str(updated_appointment['appointment_time'])
            
            return jsonify({
                'success': True,
                'appointment': updated_appointment,
                'message': 'Appointment rescheduled successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Appointment not found'
            }), 404
        
    except Exception as e:
        logger.error(f"Error rescheduling appointment: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to reschedule appointment: {str(e)}'
        }), 500

