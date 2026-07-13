"""
Authentication Routes
Handles user signup, login, OTP verification, and SMTP testing.
"""
from flask import Blueprint, request, jsonify, g
import jwt
import logging
import traceback
from datetime import datetime
from config import db
# Note: User model import removed to avoid SQLAlchemy mapper initialization issues
# Using raw SQL queries instead
from validation_utils import validate_request
from models import UserSignup, UserLogin, OTPVerification
from services.email_service import send_otp_email
from utils.jwt_utils import require_jwt

logger = logging.getLogger(__name__)

# Create blueprint
auth_bp = Blueprint('auth', __name__, url_prefix='/api')

@auth_bp.route('/signup', methods=['POST'])
@validate_request(UserSignup)
def signup():
    # Get validated data from decorator
    signup_data = request.validated_data
    email = signup_data.email
    password = signup_data.password
    
    # Check if user exists using raw SQL to avoid ORM mapper issues
    existing_user_result = db.session.execute(
        db.text("SELECT id, is_verified FROM users WHERE email = :email"),
        {"email": email}
    ).fetchone()
    
    if existing_user_result:
        return jsonify({
            'error': 'Email already registered.',
            'email_exists': True,
            'is_verified': existing_user_result[1]
        }), 409

    # User + patient in one DB transaction (commit only after both succeed).
    # Previously: user was committed first; patient failure left orphan users and rollback() could not undo them.
    from werkzeug.security import generate_password_hash
    from sqlalchemy import text
    from utils.patient_id_generator import generate_patient_id

    password_hash = generate_password_hash(password)
    patient_id = None
    try:
        db.session.execute(
            db.text("""
                INSERT INTO users (email, password_hash, is_verified, otp, otp_expiry, created_at, updated_at)
                VALUES (:email, :password_hash, :is_verified, :otp, :otp_expiry, NOW(), NOW())
            """),
            {
                'email': email,
                'password_hash': password_hash,
                'is_verified': True,
                'otp': None,
                'otp_expiry': None
            }
        )
        db.session.flush()
        user_id = db.session.execute(db.text("SELECT LAST_INSERT_ID()")).scalar()
        if not user_id:
            raise RuntimeError("Could not read new user id after insert")

        # UUID avoids duplicate-key retries inside one transaction (InnoDB aborts txn on dup insert)
        patient_id = generate_patient_id(prefix="PAT", format_type="uuid")

        db.session.execute(
            text("""
                INSERT INTO patients (patient_id, user_id, first_name, last_name, date_of_birth, gender, email, is_active)
                VALUES (:patient_id, :user_id, :first_name, :last_name, :date_of_birth, :gender, :email, :is_active)
            """),
            {
                'patient_id': patient_id,
                'user_id': user_id,
                'first_name': 'New',
                'last_name': 'Patient',
                'date_of_birth': datetime.now().date(),
                'gender': 'other',
                'email': email,
                'is_active': True
            }
        )
        db.session.commit()
        logger.info(f"✅ Signup complete for {email}, patient_id={patient_id}, user_id={user_id}")
    except Exception as e:
        logger.error(f"❌ Signup failed for {email}: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'error': 'Failed to create account. Please try again or contact support.',
            'details': str(e)
        }), 500

    return jsonify({
        'message': 'Signup successful. Your patient profile has been created.',
        'patient_id': patient_id
    }), 200

@auth_bp.route('/verify-otp', methods=['POST'])
@validate_request(OTPVerification)
def verify_otp():
    """Legacy endpoint - OTP verification is no longer required, auto-verifies user"""
    # Get validated data from decorator
    otp_data = request.validated_data
    email = otp_data.email
    
    logger.info(f"Legacy OTP verification called for {email} - auto-verifying")
    
    # Check if user exists using raw SQL
    user_result = db.session.execute(
        db.text("SELECT id, is_verified FROM users WHERE email = :email"),
        {"email": email}
    ).fetchone()
    
    if not user_result:
        logger.warning(f"User not found for email {email}")
        return jsonify({'error': 'User not found.'}), 404
    
    user_id = user_result[0]
    is_verified = user_result[1]
    
    # Auto-verify user (OTP no longer required)
    if not is_verified:
        db.session.execute(
            db.text("UPDATE users SET is_verified = TRUE, otp = NULL, otp_expiry = NULL WHERE id = :user_id"),
            {"user_id": user_id}
        )
        db.session.commit()
        logger.info(f"User {email} auto-verified")
    
    # Return existing patient info if available
    try:
        result = db.session.execute(
            db.text("SELECT patient_id, email FROM patients WHERE user_id = :user_id"),
            {"user_id": user_id}
        ).fetchone()
        
        if result:
            return jsonify({
                'message': 'Account verified.',
                'patient_id': result[0],
                'email': result[1]
            }), 200
    except Exception as e:
        logger.error(f"Error fetching patient: {e}")
        
    return jsonify({'message': 'Account verified.'}), 200

@auth_bp.route('/login', methods=['POST'])
@validate_request(UserLogin)
def login():
    # Get validated data from decorator
    login_data = request.validated_data
    email = login_data.email
    password = login_data.password
    
    # Check if user exists and verify password using raw SQL
    user_result = db.session.execute(
        db.text("SELECT id, password_hash, is_verified FROM users WHERE email = :email"),
        {"email": email}
    ).fetchone()
    
    if not user_result:
        return jsonify({
            'error': 'No account found with this email.',
            'user_not_found': True,
            'email': email
        }), 404
    
    user_id = user_result[0]
    password_hash = user_result[1]
    is_verified = user_result[2]
    
    # Verify password
    from werkzeug.security import check_password_hash
    if not check_password_hash(password_hash, password):
        return jsonify({'error': 'Invalid password.'}), 401
    
    # Check if user is verified - only verified users can login
    if not is_verified:
        logger.warning(f"Login attempt by unverified user: {email}")
        return jsonify({
            'error': 'Your account is not verified. Please contact an administrator to verify your account.',
            'unverified': True,
            'email': email
        }), 403
    
    # Get patient_id for the user, but ONLY if they are actually a patient
    # Check user's role first to avoid creating patient records for doctors/admins
    patient_id = None
    try:
        # Check if user has an explicit role (admin, doctor, etc.)
        user_role_result = db.session.execute(
            db.text("SELECT role FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        ).fetchone()
        
        user_role = user_role_result[0] if user_role_result else None
        user_role_lower = str(user_role).lower().strip() if user_role else ''
        
        # Check if user is a doctor
        doctor_result = db.session.execute(
            db.text("SELECT doctor_id FROM doctors WHERE email = :email AND is_active = TRUE"),
            {"email": email}
        ).fetchone()
        
        is_doctor = doctor_result is not None
        is_admin = user_role_lower == 'admin'
        is_employee = user_role_lower in ['lab_technician', 'non_medical_staff', 'radiology']
        
        # Only create/fetch patient_id if user is NOT a doctor, admin, or employee
        if not is_doctor and not is_admin and not is_employee:
            result = db.session.execute(
                db.text("SELECT patient_id FROM patients WHERE user_id = :user_id"),
                {"user_id": user_id}
            ).fetchone()
            if result:
                patient_id = result[0]
                logger.info(f"Found patient_id {patient_id} for user {email}")
            else:
                # Only create patient record if user doesn't have explicit role and is not a doctor
                # This handles legacy users who signed up as patients but don't have patient records
                logger.info(f"No patient record found for user {email}, creating one (user appears to be a patient)...")
                from utils.patient_id_generator import generate_patient_id
                patient_id = generate_patient_id(prefix="PAT", format_type="short")
                
                db.session.execute(
                    db.text("""
                        INSERT INTO patients (patient_id, user_id, first_name, last_name, date_of_birth, gender, email, is_active)
                        VALUES (:patient_id, :user_id, :first_name, :last_name, :date_of_birth, :gender, :email, :is_active)
                    """),
                    {
                        'patient_id': patient_id,
                        'user_id': user_id,
                        'first_name': "",
                        'last_name': "",
                        'date_of_birth': datetime.now().date(),
                        'gender': 'other',
                        'email': email,
                        'is_active': True
                    }
                )
                db.session.commit()
                logger.info(f"Created patient record for {email} with patient_id: {patient_id}")
        else:
            logger.info(f"User {email} is a doctor/admin/employee - skipping patient record creation")
    except Exception as e:
        logger.error(f"Error fetching/creating patient_id: {e}")
        logger.error(traceback.format_exc())
    
    # Login successful: issue JWT access and refresh tokens (no session cookies)
    from utils.jwt_utils import create_access_token, create_refresh_token
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id, email)
    logger.info(f"User {email} logged in successfully")
    return jsonify({
        'message': 'Login successful.',
        'accessToken': access_token,
        'refreshToken': refresh_token,
        'patient_id': patient_id,  # Will be None for doctors/admins/employees
        'email': email,
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    """Exchange a valid refresh token for a new access token."""
    try:
        data = request.get_json() or {}
        refresh_token_value = data.get('refreshToken') or request.headers.get('Authorization', '').replace('Bearer ', '').strip()
        if not refresh_token_value:
            return jsonify({'error': 'refreshToken is required'}), 400
        from utils.jwt_utils import verify_token, create_access_token, TOKEN_TYPE_REFRESH
        payload = verify_token(refresh_token_value, expected_type=TOKEN_TYPE_REFRESH)
        user_id = payload['sub']
        email = payload['email']
        new_access = create_access_token(user_id, email)
        return jsonify({'accessToken': new_access}), 200
    except jwt.ExpiredSignatureError:
        return jsonify({'error': 'Refresh token has expired'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'error': 'Invalid refresh token'}), 401
    except Exception as e:
        import traceback
        logger.warning("Refresh failed: %s\n%s", e, traceback.format_exc())
        return jsonify({'error': 'Invalid or expired refresh token'}), 401


@auth_bp.route('/user-role', methods=['GET'])
@require_jwt
def get_user_role():
    """Get the role of the currently logged-in user (patient or doctor). Requires Authorization: Bearer <accessToken>."""
    try:
        user_email = g.user_email
        
        # Check if user exists - Use raw SQL to avoid ORM mapper initialization issues
        # Also fetch role in the same query to avoid multiple queries
        user_result = db.session.execute(
            db.text("SELECT id, email, is_verified, role FROM users WHERE email = :email"),
            {"email": user_email}
        ).fetchone()
        
        if not user_result:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
        
        user_id = user_result[0]
        is_verified = user_result[2] if len(user_result) > 2 else False
        user_role_from_query = user_result[3] if len(user_result) > 3 else None
        
        # Check if user is verified - only verified users can access role information
        if not is_verified:
            logger.warning(f"Role access attempt by unverified user: {user_email}")
            return jsonify({
                'success': False,
                'error': 'Your account is not verified. Please contact an administrator to verify your account.',
                'unverified': True
            }), 403
        
        logger.info(f"User {user_email} (ID: {user_id}) - Role from initial query: {user_role_from_query}")
        
        # IMPORTANT: Check role column FIRST (before doctor/patient checks)
        # This ensures admin and other explicit roles take precedence
        # Use role from initial query if available, otherwise query again
        try:
            user_role_raw = user_role_from_query
            
            # If role wasn't in initial query, fetch it separately
            if user_role_raw is None:
                user_role_result = db.session.execute(
                    db.text("SELECT role FROM users WHERE id = :user_id"),
                    {"user_id": user_id}
                ).fetchone()
                user_role_raw = user_role_result[0] if user_role_result else None
            
            logger.info(f"Role check for user {user_email} (ID: {user_id}): raw role = {repr(user_role_raw)} (type: {type(user_role_raw)})")
            
            if user_role_raw is not None and str(user_role_raw).strip():
                user_role = str(user_role_raw).lower().strip()
                logger.info(f"User role normalized: '{user_role}' (length: {len(user_role)})")
                
                # Direct comparison with 'admin'
                if user_role == 'admin':
                    logger.info(f"✅ User {user_email} identified as ADMIN - returning admin role")
                    return jsonify({
                        'success': True,
                        'role': 'admin',
                        'email': user_email
                    }), 200
                # Also check if it contains 'admin' (defensive)
                elif 'admin' in user_role:
                    logger.info(f"✅ User {user_email} role contains 'admin' - returning admin role")
                    return jsonify({
                        'success': True,
                        'role': 'admin',
                        'email': user_email
                    }), 200
                elif user_role == 'radiology':
                    logger.info(f"✅ User {user_email} identified as RADIOLOGY")
                    # Get doctor info for radiology users
                    doctor_result = db.session.execute(
                        db.text("""
                            SELECT 
                                d.doctor_id,
                                d.specialty_id,
                                s.name as specialty_name
                            FROM doctors d
                            LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
                            WHERE d.email = :email AND d.is_active = TRUE
                            LIMIT 1
                        """),
                        {"email": user_email}
                    ).fetchone()
                    
                    if doctor_result:
                        doctor_id, specialty_id, specialty_name = doctor_result
                        return jsonify({
                            'success': True,
                            'role': 'radiology',
                            'doctor_id': doctor_id,
                            'specialty_id': specialty_id,
                            'specialty_name': specialty_name,
                            'is_radiology_doctor': True,
                            'email': user_email
                        }), 200
                    else:
                        return jsonify({
                            'success': True,
                            'role': 'radiology',
                            'is_radiology_doctor': True,
                            'email': user_email
                        }), 200
                elif user_role in ['lab_technician', 'lab technician', 'technician']:
                    logger.info(f"✅ User {user_email} identified as LAB_TECHNICIAN")
                    return jsonify({
                        'success': True,
                        'role': 'lab_technician',
                        'email': user_email
                    }), 200
                elif user_role in ['non_medical_staff', 'non-medical staff', 'staff', 'receptionist']:
                    logger.info(f"✅ User {user_email} identified as NON_MEDICAL_STAFF")
                    return jsonify({
                        'success': True,
                        'role': 'non_medical_staff',
                        'email': user_email
                    }), 200
                else:
                    logger.warning(f"⚠️ User {user_email} has role '{user_role}' which doesn't match any explicit role, continuing to doctor/patient checks")
            else:
                logger.info(f"User {user_email} has no role in users table, continuing to doctor/patient checks")
        except Exception as role_check_error:
            # If role column doesn't exist, continue to doctor/patient checks
            logger.warning(f"⚠️ Role column check failed for user {user_email}: {role_check_error}")
            logger.error(traceback.format_exc())
        
        # Check if user is a doctor (with specialty information)
        doctor_result = db.session.execute(
            db.text("""
                SELECT 
                    d.doctor_id,
                    d.specialty_id,
                    s.name as specialty_name,
                    u.role as user_role
                FROM doctors d
                LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
                LEFT JOIN users u ON d.email = u.email
                WHERE d.email = :email AND d.is_active = TRUE
                LIMIT 1
            """),
            {"email": user_email}
        ).fetchone()
        
        if doctor_result:
            # User is a doctor - check specialty and role
            doctor_id, specialty_id, specialty_name, user_role = doctor_result
            specialty_name_lower = (specialty_name or '').lower()
            
            # Check if doctor is in radiology (either by role or specialty)
            is_radiology_doctor = (user_role == 'radiology') or ('radiology' in specialty_name_lower if specialty_name else False)
            
            # Return role as 'radiology' if user_role is radiology, otherwise 'doctor'
            role = 'radiology' if user_role == 'radiology' else 'doctor'
            
            return jsonify({
                'success': True,
                'role': role,
                'doctor_id': doctor_id,
                'specialty_id': specialty_id,
                'specialty_name': specialty_name,
                'is_radiology_doctor': is_radiology_doctor,
                'email': user_email
            }), 200
        
        # Check if user is a patient
        # BUT: Skip patient check if user has an explicit role (admin, lab_technician, etc.)
        # This prevents admin users from being detected as patients
        if not user_role_from_query or str(user_role_from_query).lower().strip() in ['', 'null', 'none']:
            patient_result = db.session.execute(
                db.text("""
                    SELECT patient_id 
                    FROM patients 
                    WHERE user_id = :user_id AND is_active = TRUE
                    LIMIT 1
                """),
                {"user_id": user_id}
            ).fetchone()
            
            if patient_result:
                logger.info(f"User {user_email} identified as PATIENT (no explicit role found)")
                return jsonify({
                    'success': True,
                    'role': 'patient',
                    'email': user_email,
                    'patient_id': patient_result[0]
                }), 200
        else:
            logger.info(f"Skipping patient check for user {user_email} - has explicit role: {user_role_from_query}")
        
        # User exists but has no specific role assigned - default to non-medical staff
        # (This allows access to Patient Engagement for users who aren't doctors or patients)
        return jsonify({
            'success': True,
            'role': 'non_medical_staff',  # Default to non-medical staff for Patient Engagement access
            'email': user_email
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching user role: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch user role: {str(e)}'
        }), 500

@auth_bp.route('/test-smtp', methods=['GET'])
def test_smtp():
    """Test endpoint to verify SMTP configuration"""
    try:
        from config import SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS
        import smtplib
        
        smtp_server = SMTP_SERVER.strip() if SMTP_SERVER else None
        smtp_port = SMTP_PORT
        smtp_user = SMTP_USER
        smtp_pass = SMTP_PASS
        
        # Strip whitespace from credentials
        if smtp_user:
            smtp_user = smtp_user.strip()
        if smtp_pass:
            # Remove ALL spaces from password (Gmail App Passwords are 16 chars with no spaces)
            smtp_pass = smtp_pass.replace(' ', '').strip()
        
        if not smtp_user or not smtp_pass:
            return jsonify({
                'status': 'error',
                'message': 'SMTP credentials not configured',
                'details': 'Please set SMTP_USER and SMTP_PASS in .env file'
            }), 400
        
        # Test connection and authentication
        try:
            logger.info(f"Testing SMTP connection to {smtp_server}:{smtp_port}")
            with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
                logger.info("SMTP connection successful")
                server.starttls()
                logger.info("TLS started")
                server.login(smtp_user, smtp_pass)
                logger.info("SMTP authentication successful")
                
                return jsonify({
                    'status': 'success',
                    'message': 'SMTP configuration is valid',
                    'details': {
                        'server': smtp_server,
                        'port': smtp_port,
                        'user': smtp_user
                    }
                }), 200
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return jsonify({
                'status': 'error',
                'message': 'SMTP authentication failed',
                'details': str(e)
            }), 401
        except Exception as e:
            logger.error(f"SMTP connection error: {e}")
            return jsonify({
                'status': 'error',
                'message': 'SMTP connection failed',
                'details': str(e)
            }), 500
        
    except Exception as e:
        logger.error(f"Error testing SMTP: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': 'Failed to test SMTP configuration',
            'details': str(e)
        }), 500

