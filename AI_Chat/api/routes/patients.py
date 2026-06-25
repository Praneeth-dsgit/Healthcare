"""
Patient Management Routes
Handles patient profiles, family members, and medical records.
Uses JWT for auth; identity from Authorization: Bearer <accessToken>.
"""
from flask import Blueprint, request, jsonify, g
import logging
import traceback
from config import db
from utils.jwt_utils import require_jwt
from services.condition_trend_service import extract_diagnosis_text, record_condition_event

logger = logging.getLogger(__name__)

# Create blueprint
patients_bp = Blueprint('patients', __name__, url_prefix='/api/patient')

CLINICAL_STAFF_ROLES = frozenset({
    'doctor',
    'radiology',
    'lab_technician',
    'lab',
    'admin',
    'non_medical_staff',
})


def _get_user_role(email: str | None) -> str | None:
    if not email:
        return None
    row = db.session.execute(
        db.text("SELECT role FROM users WHERE email = :email LIMIT 1"),
        {"email": email},
    ).fetchone()
    return row[0] if row else None


def _is_clinical_staff_user() -> bool:
    """True for doctors, radiology, lab staff, admin, etc."""
    role = _get_user_role(g.user_email)
    if role in CLINICAL_STAFF_ROLES:
        return True
    if g.user_email:
        doctor_row = db.session.execute(
            db.text(
                "SELECT doctor_id FROM doctors WHERE email = :email AND is_active = TRUE LIMIT 1"
            ),
            {"email": g.user_email},
        ).fetchone()
        if doctor_row:
            return True
    return False


def _can_access_patient_records(requested_patient_id: str) -> bool:
    """Patients may read their own records; clinical staff may read any patient."""
    if g.patient_id and g.patient_id == requested_patient_id:
        return True
    return _is_clinical_staff_user()


def _staff_can_delete_record_type(record_type: str) -> bool:
    """Role-aware delete: radiology staff → imaging reports; lab staff → lab reports."""
    role = _get_user_role(g.user_email)
    if role in ('admin', 'doctor'):
        return True
    if role == 'radiology' and record_type in ('radiology_report', 'other'):
        return True
    if role in ('lab_technician', 'lab') and record_type in ('lab_report', 'other'):
        return True
    return _is_clinical_staff_user()

@patients_bp.route('/list', methods=['GET'])
@require_jwt
def list_patients():
    """Get list of patients (for doctors to select from)
    If doctor_id is provided, only returns patients who have appointments with that doctor
    """
    try:
        # Get optional search parameter and doctor_id
        search = request.args.get('search', '')
        doctor_id = request.args.get('doctor_id')
        user_email = g.user_email
        
        # If doctor_id not provided but user_email is, try to get doctor_id from email
        if not doctor_id and user_email:
            doctor_result = db.session.execute(
                db.text("SELECT doctor_id FROM doctors WHERE email = :email AND is_active = TRUE"),
                {"email": user_email}
            ).fetchone()
            if doctor_result:
                doctor_id = str(doctor_result[0])
        
        # Build query - if doctor_id provided, join with appointments table
        if doctor_id:
            query = """
                SELECT DISTINCT
                    p.patient_id,
                    p.first_name,
                    p.last_name,
                    p.date_of_birth,
                    p.gender,
                    p.email,
                    p.phone
                FROM patients p
                INNER JOIN appointments a ON p.patient_id = a.patient_id
                WHERE p.is_active = TRUE
                AND a.doctor_id = :doctor_id
            """
            params = {'doctor_id': doctor_id}
        else:
            query = """
                SELECT 
                    patient_id,
                    first_name,
                    last_name,
                    date_of_birth,
                    gender,
                    email,
                    phone
                FROM patients
                WHERE is_active = TRUE
            """
            params = {}
        
        if search:
            if doctor_id:
                query += " AND (p.patient_id LIKE :search OR p.first_name LIKE :search OR p.last_name LIKE :search OR p.email LIKE :search)"
            else:
                query += " AND (patient_id LIKE :search OR first_name LIKE :search OR last_name LIKE :search OR email LIKE :search)"
            params['search'] = f'%{search}%'
        
        if doctor_id:
            query += " ORDER BY p.first_name, p.last_name LIMIT 100"
        else:
            query += " ORDER BY first_name, last_name LIMIT 100"
        
        result = db.session.execute(db.text(query), params).fetchall()
        
        patients = []
        for row in result:
            patient = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            # Calculate age from date_of_birth
            if patient.get('date_of_birth'):
                from datetime import datetime
                dob = patient['date_of_birth']
                if isinstance(dob, str):
                    dob = datetime.strptime(dob, '%Y-%m-%d').date()
                today = datetime.now().date()
                age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
                patient['age'] = age
            # Format date
            if patient.get('date_of_birth'):
                if hasattr(patient['date_of_birth'], 'isoformat'):
                    patient['date_of_birth'] = patient['date_of_birth'].isoformat()
                else:
                    patient['date_of_birth'] = str(patient['date_of_birth'])
            patients.append(patient)
        
        return jsonify({
            'success': True,
            'patients': patients
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing patients: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to list patients: {str(e)}'
        }), 500

@patients_bp.route('/profile', methods=['GET'])
@require_jwt
def get_patient_profile():
    """Get patient profile by user email or patient_id"""
    try:
        patient_id = request.args.get('patient_id') or g.patient_id
        user_email = g.user_email
        
        logger.info(f"Fetching patient profile - patient_id: {patient_id}, user_email: {user_email}")
        
        patient = None
        
        if patient_id:
            # Get patient by patient_id
            logger.info(f"Looking up patient by patient_id: {patient_id}")
            result = db.session.execute(
                db.text("SELECT * FROM patients WHERE patient_id = :patient_id"),
                {"patient_id": patient_id}
            ).fetchone()
            if result:
                # Convert row to dict
                patient = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
                logger.info(f"Found patient by patient_id: {patient.get('patient_id')}")
            else:
                logger.warning(f"No patient found with patient_id: {patient_id}")
        elif user_email:
            # Get patient by user email
            logger.info(f"Looking up patient by user_email: {user_email}")
            result = db.session.execute(
                db.text("""
                    SELECT p.* FROM patients p
                    JOIN users u ON p.user_id = u.id
                    WHERE u.email = :email
                """),
                {"email": user_email}
            ).fetchone()
            if result:
                patient = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
                logger.info(f"Found patient by email: {patient.get('patient_id')}")
            else:
                logger.warning(f"No patient found with email: {user_email}")
        else:
            logger.warning("No patient_id or user_email provided in request")
        
        if not patient:
            logger.error(f"Patient not found - patient_id: {patient_id}, user_email: {user_email}")
            return jsonify({
                'success': False,
                'error': 'Patient not found. Please provide X-Patient-ID header or user_email parameter.'
            }), 404
        
        # Convert date objects to strings
        if patient.get('date_of_birth'):
            patient['date_of_birth'] = patient['date_of_birth'].isoformat() if hasattr(patient['date_of_birth'], 'isoformat') else str(patient['date_of_birth'])
        if patient.get('created_at'):
            patient['created_at'] = patient['created_at'].isoformat() if hasattr(patient['created_at'], 'isoformat') else str(patient['created_at'])
        if patient.get('updated_at'):
            patient['updated_at'] = patient['updated_at'].isoformat() if hasattr(patient['updated_at'], 'isoformat') else str(patient['updated_at'])
        
        return jsonify({
            'success': True,
            'patient': patient
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching patient profile: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch patient profile: {str(e)}'
        }), 500

@patients_bp.route('/profile', methods=['PUT'])
@require_jwt
def update_patient_profile():
    """Update patient profile"""
    try:
        patient_id = g.patient_id
        data = request.get_json()
        
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Update patient record
        update_fields = []
        update_values = {'patient_id': patient_id}
        
        allowed_fields = ['first_name', 'last_name', 'date_of_birth', 'gender', 'phone', 'email',
                         'address', 'city', 'state', 'zip_code', 'country', 'blood_type',
                         'height_cm', 'weight_kg', 'bmi', 'emergency_contact_name',
                         'emergency_contact_phone', 'emergency_contact_relation']
        
        for field in allowed_fields:
            if field in data:
                update_fields.append(f"{field} = :{field}")
                update_values[field] = data[field]
        
        if not update_fields:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400
        
        update_values['patient_id'] = patient_id
        sql = f"""
            UPDATE patients 
            SET {', '.join(update_fields)}, updated_at = NOW()
            WHERE patient_id = :patient_id
        """
        
        db.session.execute(db.text(sql), update_values)
        db.session.commit()
        
        # Fetch updated patient
        result = db.session.execute(
            db.text("SELECT * FROM patients WHERE patient_id = :patient_id"),
            {"patient_id": patient_id}
        ).fetchone()
        
        if result:
            patient = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
            # Convert dates
            if patient.get('date_of_birth'):
                patient['date_of_birth'] = patient['date_of_birth'].isoformat() if hasattr(patient['date_of_birth'], 'isoformat') else str(patient['date_of_birth'])
            if patient.get('created_at'):
                patient['created_at'] = patient['created_at'].isoformat() if hasattr(patient['created_at'], 'isoformat') else str(patient['created_at'])
            if patient.get('updated_at'):
                patient['updated_at'] = patient['updated_at'].isoformat() if hasattr(patient['updated_at'], 'isoformat') else str(patient['updated_at'])
            
            return jsonify({
                'success': True,
                'patient': patient
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Patient not found after update'
            }), 404
            
    except Exception as e:
        logger.error(f"Error updating patient profile: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to update patient profile: {str(e)}'
        }), 500

@patients_bp.route('/family-members', methods=['GET'])
@require_jwt
def get_family_members():
    """Get family members for a patient"""
    try:
        patient_id = g.patient_id
        # Fallback: resolve patient_id from user_email (same as profile endpoint)
        if not patient_id and g.user_email:
            result = db.session.execute(
                db.text("""
                    SELECT p.patient_id FROM patients p
                    JOIN users u ON p.user_id = u.id
                    WHERE u.email = :email AND p.is_active = TRUE
                """),
                {"email": g.user_email}
            ).fetchone()
            if result:
                patient_id = result[0]
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Get family members
        result = db.session.execute(
            db.text("""
                SELECT * FROM family_members 
                WHERE primary_patient_id = :patient_id AND is_active = 1
                ORDER BY created_at DESC
            """),
            {"patient_id": patient_id}
        ).fetchall()
        
        family_members = []
        for row in result:
            member = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            # Convert dates
            if member.get('date_of_birth'):
                member['date_of_birth'] = member['date_of_birth'].isoformat() if hasattr(member['date_of_birth'], 'isoformat') else str(member['date_of_birth'])
            family_members.append(member)
        
        return jsonify({
            'success': True,
            'family_members': family_members
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching family members: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch family members: {str(e)}'
        }), 500

@patients_bp.route('/family-members', methods=['POST'])
@require_jwt
def add_family_member():
    """Add a family member for a patient"""
    try:
        patient_id = request.headers.get('X-Patient-ID') or g.patient_id
        user_email = request.headers.get('X-User-Email') or g.user_email
        data = request.get_json() or {}
        
        # Resolve patient_id from JWT (g.patient_id) or user_email when headers not provided
        if not patient_id and user_email:
            result = db.session.execute(
                db.text("""
                    SELECT p.patient_id FROM patients p
                    JOIN users u ON p.user_id = u.id
                    WHERE u.email = :email AND p.is_active = TRUE
                """),
                {"email": user_email}
            ).fetchone()
            if result:
                patient_id = result[0]
            else:
                return jsonify({
                    'success': False,
                    'error': 'Patient not found'
                }), 404
        
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Validate required fields
        required_fields = ['first_name', 'last_name', 'date_of_birth', 'gender', 'relationship']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Insert family member
        db.session.execute(
            db.text("""
                INSERT INTO family_members (
                    primary_patient_id, first_name, last_name, date_of_birth, 
                    gender, relationship, phone, email, blood_type, 
                    height_cm, weight_kg, medical_history, allergies, is_active
                )
                VALUES (
                    :primary_patient_id, :first_name, :last_name, :date_of_birth,
                    :gender, :relationship, :phone, :email, :blood_type,
                    :height_cm, :weight_kg, :medical_history, :allergies, :is_active
                )
            """),
            {
                'primary_patient_id': patient_id,
                'first_name': data['first_name'],
                'last_name': data['last_name'],
                'date_of_birth': data['date_of_birth'],
                'gender': data['gender'],
                'relationship': data['relationship'],
                'phone': data.get('phone'),
                'email': data.get('email'),
                'blood_type': data.get('blood_type'),
                'height_cm': data.get('height_cm'),
                'weight_kg': data.get('weight_kg'),
                'medical_history': data.get('medical_history'),
                'allergies': data.get('allergies'),
                'is_active': data.get('is_active', True)
            }
        )
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Family member added successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error adding family member: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to add family member: {str(e)}'
        }), 500

@patients_bp.route('/family-members/<int:member_id>', methods=['PUT'])
@require_jwt
def update_family_member(member_id):
    """Update a family member"""
    try:
        data = request.get_json()
        
        # Build update query
        update_fields = []
        update_values = {'member_id': member_id}
        
        allowed_fields = ['first_name', 'last_name', 'date_of_birth', 'gender', 'relationship',
                         'phone', 'email', 'blood_type', 'height_cm', 'weight_kg',
                         'medical_history', 'allergies', 'is_active']
        
        for field in allowed_fields:
            if field in data:
                update_fields.append(f"{field} = :{field}")
                update_values[field] = data[field]
        
        if not update_fields:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400
        
        sql = f"""
            UPDATE family_members 
            SET {', '.join(update_fields)}, updated_at = NOW()
            WHERE family_member_id = :member_id
        """
        
        db.session.execute(db.text(sql), update_values)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Family member updated successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error updating family member: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to update family member: {str(e)}'
        }), 500

@patients_bp.route('/family-members/<int:member_id>', methods=['DELETE'])
@require_jwt
def delete_family_member(member_id):
    """Delete (soft delete) a family member"""
    try:
        db.session.execute(
            db.text("UPDATE family_members SET is_active = 0 WHERE family_member_id = :member_id"),
            {"member_id": member_id}
        )
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Family member deleted successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting family member: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to delete family member: {str(e)}'
        }), 500

@patients_bp.route('/patients-with-records', methods=['GET'])
@require_jwt
def list_patients_with_medical_records():
    """Patients who have at least one medical record (for lab/radiology staff sidebar)."""
    try:
        if not _is_clinical_staff_user():
            return jsonify({
                'success': False,
                'error': 'Not authorized to view patient record directory',
            }), 403

        capability = request.args.get('capability')
        search = (request.args.get('search') or '').strip()

        type_filter = None
        if capability == 'lab':
            type_filter = ['lab_report', 'visit_summary', 'discharge_summary', 'prescription', 'other']
        elif capability == 'radiology':
            type_filter = ['radiology_report', 'visit_summary', 'discharge_summary', 'other']

        query = """
            SELECT
                p.patient_id,
                p.first_name,
                p.last_name,
                p.date_of_birth,
                p.gender,
                COUNT(mr.record_id) AS record_count,
                MAX(mr.visit_date) AS latest_record_date
            FROM medical_records mr
            INNER JOIN patients p ON mr.patient_id = p.patient_id
            WHERE p.is_active = TRUE
        """
        params: dict = {}

        if type_filter:
            placeholders = ", ".join(f":t{i}" for i in range(len(type_filter)))
            query += f" AND mr.record_type IN ({placeholders})"
            for i, t in enumerate(type_filter):
                params[f"t{i}"] = t

        if search:
            query += (
                " AND (p.patient_id LIKE :search OR p.first_name LIKE :search"
                " OR p.last_name LIKE :search OR p.email LIKE :search)"
            )
            params['search'] = f'%{search}%'

        query += """
            GROUP BY p.patient_id, p.first_name, p.last_name, p.date_of_birth, p.gender
            ORDER BY latest_record_date DESC, p.last_name, p.first_name
            LIMIT 200
        """

        result = db.session.execute(db.text(query), params).fetchall()
        patients = []
        for row in result:
            item = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            if item.get('latest_record_date') and hasattr(item['latest_record_date'], 'isoformat'):
                item['latest_record_date'] = item['latest_record_date'].isoformat()
            if item.get('date_of_birth') and hasattr(item['date_of_birth'], 'isoformat'):
                item['date_of_birth'] = item['date_of_birth'].isoformat()
            patients.append(item)

        return jsonify({
            'success': True,
            'patients': patients,
            'count': len(patients),
        }), 200

    except Exception as e:
        logger.error(f"Error listing patients with records: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to list patients: {str(e)}',
        }), 500


@patients_bp.route('/<patient_id>/medical-records', methods=['GET'])
@require_jwt
def get_medical_records_for_patient(patient_id):
    """Get medical records for a specific patient (clinical staff / radiology / lab)."""
    try:
        if not _can_access_patient_records(patient_id):
            return jsonify({
                'success': False,
                'error': 'Not authorized to view this patient\'s records',
            }), 403

        record_type = request.args.get('type')
        capability = request.args.get('capability')
        limit = min(int(request.args.get('limit', 50)), 100)

        type_filter = None
        if record_type:
            type_filter = [record_type]
        elif capability == 'lab':
            type_filter = ['lab_report', 'visit_summary', 'discharge_summary', 'other']
        elif capability == 'radiology':
            type_filter = ['radiology_report', 'visit_summary', 'discharge_summary', 'other']

        query = """
            SELECT
                mr.record_id,
                mr.patient_id,
                mr.family_member_id,
                mr.record_type,
                mr.title,
                mr.description,
                mr.file_path as file_url,
                mr.file_type,
                mr.visit_date,
                mr.doctor_id,
                mr.facility_id,
                mr.created_at,
                fm.first_name as family_member_first_name,
                fm.last_name as family_member_last_name
            FROM medical_records mr
            LEFT JOIN family_members fm ON mr.family_member_id = fm.family_member_id
            WHERE mr.patient_id = :patient_id
        """
        params = {"patient_id": patient_id}

        if type_filter:
            placeholders = ", ".join(f":t{i}" for i in range(len(type_filter)))
            query += f" AND mr.record_type IN ({placeholders})"
            for i, t in enumerate(type_filter):
                params[f"t{i}"] = t

        query += " ORDER BY mr.visit_date DESC, mr.created_at DESC LIMIT :lim"
        params["lim"] = limit

        result = db.session.execute(db.text(query), params).fetchall()

        records = []
        for row in result:
            record = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            for key in ('visit_date', 'created_at'):
                if record.get(key) and hasattr(record[key], 'isoformat'):
                    record[key] = record[key].isoformat()
            records.append(record)

        return jsonify({
            'success': True,
            'records': records,
            'count': len(records),
            'patient_id': patient_id,
        }), 200

    except Exception as e:
        logger.error(f"Error fetching staff medical records: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch medical records: {str(e)}',
        }), 500


@patients_bp.route('/medical-records', methods=['GET'])
@require_jwt
def get_medical_records():
    """Get medical records for a patient, optionally filtered by family member"""
    try:
        patient_id = g.patient_id
        if not patient_id and g.user_email:
            result = db.session.execute(
                db.text("""
                    SELECT p.patient_id FROM patients p
                    JOIN users u ON p.user_id = u.id
                    WHERE u.email = :email AND p.is_active = TRUE
                """),
                {"email": g.user_email}
            ).fetchone()
            if result:
                patient_id = result[0]
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Get optional filters
        record_type = request.args.get('type')
        family_member_id = request.args.get('family_member_id')
        
        # Build query
        query = """
            SELECT 
                mr.record_id,
                mr.patient_id,
                mr.family_member_id,
                mr.record_type,
                mr.title,
                mr.description,
                mr.file_path as file_url,
                mr.file_type,
                mr.visit_date,
                mr.doctor_id,
                mr.facility_id,
                mr.created_at,
                fm.first_name as family_member_first_name,
                fm.last_name as family_member_last_name
            FROM medical_records mr
            LEFT JOIN family_members fm ON mr.family_member_id = fm.family_member_id
            WHERE mr.patient_id = :patient_id
        """
        
        params = {"patient_id": patient_id}
        
        # Add family member filter if specified
        if family_member_id:
            if family_member_id == 'self' or family_member_id == '0':
                # Show only records for the patient (no family member)
                query += " AND mr.family_member_id IS NULL"
            else:
                # Show records for specific family member
                query += " AND mr.family_member_id = :family_member_id"
                params['family_member_id'] = int(family_member_id)
        # If no family_member_id filter, show all records (patient + family members)
        
        # Add record type filter if specified
        if record_type:
            query += " AND mr.record_type = :record_type"
            params['record_type'] = record_type
        
        query += " ORDER BY mr.visit_date DESC, mr.created_at DESC"
        
        result = db.session.execute(db.text(query), params).fetchall()
        
        records = []
        for row in result:
            record = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            # Convert dates to strings
            if record.get('visit_date'):
                record['visit_date'] = record['visit_date'].isoformat() if hasattr(record['visit_date'], 'isoformat') else str(record['visit_date'])
            if record.get('created_at'):
                record['created_at'] = record['created_at'].isoformat() if hasattr(record['created_at'], 'isoformat') else str(record['created_at'])
            records.append(record)
        
        return jsonify({
            'success': True,
            'records': records
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching medical records: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch medical records: {str(e)}'
        }), 500

@patients_bp.route('/medical-records', methods=['POST'])
@require_jwt
def upload_medical_record():
    """Upload a medical record (prescription, lab report, etc.) for a patient"""
    try:
        from datetime import datetime
        import os
        from werkzeug.utils import secure_filename
        
        patient_id = request.form.get('patient_id') or request.headers.get('X-Patient-ID') or g.patient_id
        user_email = g.user_email
        
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'patient_id is required (or must be the authenticated patient)'
            }), 400

        if g.patient_id and g.patient_id != patient_id:
            return jsonify({
                'success': False,
                'error': 'Not authorized to upload records for another patient',
            }), 403

        if not g.patient_id and not _is_clinical_staff_user():
            return jsonify({
                'success': False,
                'error': 'Not authorized to upload medical records',
            }), 403

        patient_exists = db.session.execute(
            db.text("SELECT patient_id FROM patients WHERE patient_id = :pid AND is_active = TRUE"),
            {"pid": patient_id},
        ).fetchone()
        if not patient_exists:
            return jsonify({
                'success': False,
                'error': f'Patient not found: {patient_id}',
            }), 404
        
        # Check if file is provided
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided'
            }), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        # Get record metadata
        record_type = request.form.get('record_type', 'prescription')
        allowed_types = {
            'prescription', 'lab_report', 'radiology_report',
            'visit_summary', 'discharge_summary', 'other',
        }
        if record_type not in allowed_types:
            return jsonify({
                'success': False,
                'error': f'Invalid record_type. Allowed: {", ".join(sorted(allowed_types))}',
            }), 400
        title = request.form.get('title', file.filename)
        description = request.form.get('description', '')
        visit_date = request.form.get('visit_date', datetime.now().date().isoformat())
        doctor_id = request.form.get('doctor_id')
        facility_id = request.form.get('facility_id')
        family_member_id = request.form.get('family_member_id')
        
        # If doctor_id not provided, try to get from authenticated user
        if not doctor_id and user_email:
            doctor_result = db.session.execute(
                db.text("SELECT doctor_id FROM doctors WHERE email = :email AND is_active = TRUE"),
                {"email": user_email}
            ).fetchone()
            if doctor_result:
                doctor_id = str(doctor_result[0])
        
        # Save file
        from config import UPLOAD_FOLDER
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{timestamp}_{filename}"
        file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
        
        # Create upload folder if it doesn't exist
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        file.save(file_path)
        file_size = os.path.getsize(file_path)
        
        # Determine file type
        file_type = file.content_type or 'application/octet-stream'
        if filename.lower().endswith('.pdf'):
            file_type = 'application/pdf'
        elif filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
            file_type = file.content_type or 'image/jpeg'
        
        # Insert record into database
        result = db.session.execute(
            db.text("""
                INSERT INTO medical_records 
                (patient_id, family_member_id, record_type, title, description, file_path, file_type, file_size, visit_date, doctor_id, facility_id, created_at, updated_at)
                VALUES (:patient_id, :family_member_id, :record_type, :title, :description, :file_path, :file_type, :file_size, :visit_date, :doctor_id, :facility_id, NOW(), NOW())
            """),
            {
                'patient_id': patient_id,
                'family_member_id': int(family_member_id) if family_member_id else None,
                'record_type': record_type,
                'title': title,
                'description': description,
                'file_path': file_path,
                'file_type': file_type,
                'file_size': file_size,
                'visit_date': visit_date,
                'doctor_id': int(doctor_id) if doctor_id else None,
                'facility_id': int(facility_id) if facility_id else None
            }
        )
        db.session.commit()
        
        record_id = result.lastrowid

        # Track diagnosis trend events from prescription descriptions (best-effort, non-blocking).
        if record_type == 'prescription':
            try:
                diagnosis_text = extract_diagnosis_text(description)
                if diagnosis_text:
                    record_condition_event(
                        patient_id=patient_id,
                        doctor_id=int(doctor_id) if doctor_id else None,
                        source_type='prescription',
                        source_id=record_id,
                        diagnosis_text=diagnosis_text,
                        event_date=visit_date,
                    )
            except Exception as trend_exc:
                logger.warning(f"Condition trend event recording skipped: {trend_exc}")
        
        return jsonify({
            'success': True,
            'record_id': record_id,
            'message': 'Medical record uploaded successfully'
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading medical record: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to upload medical record: {str(e)}'
        }), 500


def _list_staff_medical_records_impl():
    """Shared handler: flat record list for lab/radiology staff sidebar."""
    if not _is_clinical_staff_user():
        return jsonify({
            'success': False,
            'error': 'Not authorized to view medical records',
        }), 403

    capability = request.args.get('capability')
    search = (request.args.get('search') or '').strip()
    limit = min(int(request.args.get('limit', 100)), 200)

    type_filter = None
    if capability == 'lab':
        type_filter = ['lab_report']
    elif capability == 'radiology':
        type_filter = ['radiology_report']

    query = """
        SELECT
            mr.record_id,
            mr.patient_id,
            mr.record_type,
            mr.title,
            mr.description,
            mr.file_path as file_url,
            mr.file_type,
            mr.visit_date,
            mr.created_at,
            p.first_name,
            p.last_name,
            p.date_of_birth
        FROM medical_records mr
        INNER JOIN patients p ON mr.patient_id = p.patient_id
        WHERE p.is_active = TRUE
    """
    params: dict = {}

    if type_filter:
        placeholders = ", ".join(f":t{i}" for i in range(len(type_filter)))
        query += f" AND mr.record_type IN ({placeholders})"
        for i, t in enumerate(type_filter):
            params[f"t{i}"] = t

    if search:
        query += (
            " AND (p.patient_id LIKE :search OR p.first_name LIKE :search"
            " OR p.last_name LIKE :search OR mr.title LIKE :search)"
        )
        params['search'] = f'%{search}%'

    query += " ORDER BY mr.visit_date DESC, mr.created_at DESC LIMIT :lim"
    params['lim'] = limit

    result = db.session.execute(db.text(query), params).fetchall()
    records = []
    for row in result:
        item = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
        for key in ('visit_date', 'created_at', 'date_of_birth'):
            if item.get(key) and hasattr(item[key], 'isoformat'):
                item[key] = item[key].isoformat()
        records.append(item)

    return jsonify({
        'success': True,
        'records': records,
        'count': len(records),
    }), 200


@patients_bp.route('/medical-records/staff-list', methods=['GET'])
@patients_bp.route('/staff-medical-records', methods=['GET'])
@require_jwt
def list_staff_medical_records():
    """Flat list of medical records for lab/radiology staff sidebar."""
    try:
        return _list_staff_medical_records_impl()
    except Exception as e:
        logger.error(f"Error listing staff medical records: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to list medical records: {str(e)}',
        }), 500


@patients_bp.route('/medical-records/<int:record_id>/download', methods=['GET'])
@require_jwt
def download_medical_record(record_id):
    """Download a medical record file"""
    try:
        import os
        from flask import send_file
        from config import UPLOAD_FOLDER
        
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Get the record and verify it belongs to the patient
        result = db.session.execute(
            db.text("""
                SELECT mr.file_path, mr.file_type, mr.title, mr.patient_id
                FROM medical_records mr
                WHERE mr.record_id = :record_id AND mr.patient_id = :patient_id
            """),
            {"record_id": record_id, "patient_id": patient_id}
        ).fetchone()
        
        if not result:
            return jsonify({
                'success': False,
                'error': 'Record not found or access denied'
            }), 404
        
        record = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
        file_path = record.get('file_path')
        
        if not file_path or not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'error': 'File not found on server'
            }), 404
        
        from werkzeug.utils import secure_filename

        ext = os.path.splitext(file_path)[1].lower()
        mime_by_ext = {
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp',
        }
        file_type = mime_by_ext.get(ext) or record.get('file_type') or 'application/octet-stream'

        stored_name = os.path.basename(file_path)
        title = (record.get('title') or stored_name).strip()
        safe_title = secure_filename(title) or 'medical-record'

        if ext and not safe_title.lower().endswith(ext):
            download_name = f"{safe_title}{ext}"
        elif safe_title.lower().endswith(tuple(mime_by_ext.keys())):
            download_name = safe_title
        elif ext:
            download_name = f"{safe_title}{ext}"
        else:
            download_name = safe_title

        return send_file(
            file_path,
            mimetype=file_type,
            as_attachment=True,
            download_name=download_name,
        )
        
    except Exception as e:
        logger.error(f"Error downloading medical record: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to download medical record: {str(e)}'
        }), 500


@patients_bp.route('/medical-records/<int:record_id>', methods=['DELETE'])
@require_jwt
def delete_medical_record(record_id):
    """Delete a medical record (staff or the owning patient). Removes DB row and file on disk."""
    try:
        import os

        result = db.session.execute(
            db.text("""
                SELECT mr.record_id, mr.patient_id, mr.record_type, mr.title, mr.file_path
                FROM medical_records mr
                WHERE mr.record_id = :record_id
            """),
            {"record_id": record_id},
        ).fetchone()

        if not result:
            return jsonify({'success': False, 'error': 'Record not found'}), 404

        record = dict(result._mapping) if hasattr(result, '_mapping') else dict(zip(result.keys(), result))
        patient_id = record.get('patient_id')
        record_type = record.get('record_type')

        if g.patient_id:
            if g.patient_id != patient_id:
                return jsonify({'success': False, 'error': 'Not authorized to delete this record'}), 403
        elif not _is_clinical_staff_user():
            return jsonify({'success': False, 'error': 'Not authorized to delete medical records'}), 403
        elif not _staff_can_delete_record_type(record_type):
            return jsonify({
                'success': False,
                'error': f'Not authorized to delete record type: {record_type}',
            }), 403

        if not _can_access_patient_records(patient_id):
            return jsonify({'success': False, 'error': 'Not authorized to delete this record'}), 403

        file_path = record.get('file_path')
        if file_path and os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except OSError as exc:
                logger.warning("Could not remove file %s: %s", file_path, exc)

        db.session.execute(
            db.text("DELETE FROM medical_records WHERE record_id = :record_id"),
            {"record_id": record_id},
        )
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Medical record deleted',
            'record_id': record_id,
            'patient_id': patient_id,
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting medical record: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to delete medical record: {str(e)}',
        }), 500

