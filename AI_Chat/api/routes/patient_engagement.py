"""
Patient Engagement Routes
Handles AI-powered patient engagement features, appointment booking, and patient portal queries.
Uses JWT for protected routes; identity from Authorization: Bearer <accessToken>.
"""
from flask import Blueprint, request, jsonify, g
import logging
from utils.jwt_utils import require_jwt
import traceback
import json
import re
import openai
from datetime import datetime, timedelta, date, time as time_type
from config import db
from db_read_agent import DatabaseAgent

logger = logging.getLogger(__name__)

# Create blueprint
patient_engagement_bp = Blueprint('patient_engagement', __name__, url_prefix='/api/patient-engagement')

@patient_engagement_bp.route('/test', methods=['POST'])
def patient_engagement_test():
    """Test endpoint to verify if requests are reaching the backend"""
    try:
        logger.info("=== PATIENT ENGAGEMENT TEST ENDPOINT CALLED ===")
        logger.info(f"Request method: {request.method}")
        logger.info(f"Request headers: {dict(request.headers)}")
        
        data = request.get_json()
        logger.info(f"Received data: {data}")
        
        return jsonify({
            'success': True,
            'message': 'Test endpoint reached successfully',
            'received_data': data
        }), 200
        
    except Exception as e:
        logger.error(f"Test endpoint error: {e}")
        return jsonify({'error': 'Test endpoint error'}), 500

@patient_engagement_bp.route('/query', methods=['POST'])
def patient_engagement_query():
    """Handle patient engagement database queries"""
    try:
        logger.info("=== PATIENT ENGAGEMENT QUERY ENDPOINT CALLED ===")
        data = request.get_json()
        query = data.get('query', '').strip()
        conversation_context = data.get('conversation_context', '').strip()
        
        logger.info(f"Extracted query: '{query}'")
        
        if not query:
            logger.warning("No query provided")
            return jsonify({'error': 'Query is required'}), 400
        
        # Create agent instance
        agent = DatabaseAgent()
        logger.info("DatabaseAgent created successfully")
        
        # Process the query using the frontend-specific method with context
        result = agent.process_question_for_frontend(query, conversation_context)
        
        logger.info(f"DatabaseAgent result: {result}")
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify({'error': result['error']}), 400
        
    except Exception as e:
        logger.error(f"Patient engagement query error: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Internal server error'}), 500

@patient_engagement_bp.route('/daily-appointments', methods=['GET'])
def get_daily_appointments():
    """Get today's appointments"""
    try:
        agent = DatabaseAgent()
        result = agent.get_cached_daily_appointments()
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify({'error': result['error']}), 400
        
    except Exception as e:
        logger.error(f"Daily appointments error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@patient_engagement_bp.route('/appointments-by-date', methods=['GET'])
def get_appointments_by_date():
    """Get appointments for today and tomorrow (or custom date range via query params)"""
    try:
        from datetime import date, timedelta
        today = date.today()
        start_date = request.args.get('start_date', today.strftime('%Y-%m-%d'))
        end_date = request.args.get('end_date', (today + timedelta(days=1)).strftime('%Y-%m-%d'))
        try:
            start_d = date.fromisoformat(start_date)
            end_d = date.fromisoformat(end_date)
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        agent = DatabaseAgent()
        result = agent.get_appointments_by_date_range(start_d, end_d)
        if result['success']:
            return jsonify(result), 200
        return jsonify({'error': result.get('error', 'Unknown error')}), 400
    except Exception as e:
        logger.error(f"Appointments by date error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@patient_engagement_bp.route('/doctors', methods=['GET'])
def get_doctors():
    """Get list of all doctors with their departments"""
    try:
        agent = DatabaseAgent()
        
        sql_query = """
        SELECT 
            d.doctor_id as id,
            CONCAT(d.first_name, ' ', d.last_name) as name,
            d.specialty_id as department_id,
            s.name as department_name
        FROM doctors d
        LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
        WHERE d.is_active = TRUE
        ORDER BY d.first_name
        """
        
        results, error = agent.execute_query(sql_query)
        
        if error:
            return jsonify({'success': False, 'error': error}), 500
        
        return jsonify({
            'success': True,
            'doctors': results or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching doctors: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@patient_engagement_bp.route('/departments', methods=['GET'])
def get_departments():
    """Get list of all departments/specialties"""
    try:
        agent = DatabaseAgent()
        
        # Use specialties table (schema has specialties, not departments)
        sql_query = """
        SELECT 
            specialty_id as id,
            name
        FROM specialties
        ORDER BY name
        """
        
        results, error = agent.execute_query(sql_query)
        
        if error:
            return jsonify({'success': False, 'error': error}), 500
        
        return jsonify({
            'success': True,
            'departments': results or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching departments: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@patient_engagement_bp.route('/check-appointment-conflict', methods=['POST'])
def check_appointment_conflict():
    """Check if an appointment time slot is already booked"""
    try:
        data = request.get_json()
        doctor_id = data.get('doctorId')
        appointment_date = data.get('appointmentDate')
        appointment_time = data.get('appointmentTime')
        
        if not doctor_id or not appointment_date or not appointment_time:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        agent = DatabaseAgent()
        
        # Combine date and time
        appointment_datetime = f"{appointment_date} {appointment_time}:00"
        
        # Check for overlapping appointments
        sql_query = f"""
        SELECT appointment_id, appointment_date, status
        FROM appointments
        WHERE doctor_id = {doctor_id}
        AND appointment_date = '{appointment_datetime}'
        AND status != 'Cancelled'
        LIMIT 1
        """
        
        results, error = agent.execute_query(sql_query)
        
        if error:
            return jsonify({'success': False, 'error': error}), 500
        
        has_conflict = len(results) > 0 if results else False
        
        return jsonify({
            'success': True,
            'hasConflict': has_conflict,
            'conflictingAppointment': results[0] if has_conflict else None
        }), 200
        
    except Exception as e:
        logger.error(f"Error checking appointment conflict: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@patient_engagement_bp.route('/available-slots', methods=['POST'])
def get_available_slots():
    """Get available appointment slots for a doctor for the next 2 weeks"""
    try:
        data = request.get_json()
        doctor_id = data.get('doctorId')
        
        if not doctor_id:
            return jsonify({'success': False, 'error': 'Doctor ID is required'}), 400

        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = today + timedelta(days=14)
        available_slots = _compute_available_slots_for_doctor(int(doctor_id))

        return jsonify({
            'success': True,
            'availableSlots': available_slots,
            'startDate': today.strftime('%Y-%m-%d'),
            'endDate': end_date.strftime('%Y-%m-%d')
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching available slots: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@patient_engagement_bp.route('/extract-and-book', methods=['POST'])
def extract_and_book_appointment():
    """Extract appointment details from natural language and book directly"""
    try:
        logger.info("=== NATURAL LANGUAGE APPOINTMENT BOOKING ===")
        data = request.get_json()
        query = data.get('query', '').strip()
        
        if not query:
            return jsonify({'success': False, 'error': 'Query is required'}), 400
        
        agent = DatabaseAgent()
        
        # Use AI to extract appointment details from natural language
        schema = agent.get_database_schema()
        formatted_schema = agent.format_schema_for_gpt(schema)
        
        # Get today's date for reference
        today = datetime.now().strftime('%Y-%m-%d')
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        prompt = f"""Extract appointment booking details from this natural language request:

"{query}"

Database Schema:
{formatted_schema}

Current Date: {today}
Tomorrow's Date: {tomorrow}

Extract the following information:
1. Patient Name (required)
2. Patient Phone (if not provided, use a placeholder like "0000000000")
3. Patient Age (if mentioned)
4. Patient Gender (if mentioned: male/female/other)
5. Patient Weight (if mentioned, in kg)
6. Doctor Name or Department (if "any doctor" or department specified)
7. Appointment Date (today, tomorrow, or specific date)
8. Appointment Time (in 24-hour format, e.g., "17:00" for 5 PM)

IMPORTANT RULES:
- If date is "today", use: {today}
- If date is "tomorrow", use: {tomorrow}
- Convert time to 24-hour format (5 PM = 17:00, 5pm = 17:00)
- If doctor is not specified but department is, find any available doctor in that department
- If "any doctor" is mentioned, find any available doctor in the specified department
- If patient phone is not provided, use "0000000000" as placeholder

Return ONLY a JSON object with this structure:
{{
    "patientName": "extracted name or null",
    "patientPhone": "extracted phone or '0000000000'",
    "age": "extracted age or null",
    "gender": "male/female/other or null",
    "weight": "extracted weight or null",
    "doctorName": "extracted doctor name or null",
    "department": "extracted department name or null",
    "appointmentDate": "YYYY-MM-DD format",
    "appointmentTime": "HH:MM format (24-hour)",
    "hasAllRequiredInfo": true/false
}}

Return ONLY the JSON, no other text."""
        
        try:
            response = openai.ChatCompletion.create(
                model="gpt-4.1",
                messages=[
                    {"role": "system", "content": "You are a healthcare assistant that extracts appointment details from natural language."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.1
            )
            
            extracted_data_str = response.choices[0].message['content'].strip()
            # Remove markdown code blocks if present
            extracted_data_str = re.sub(r'^```json\s*', '', extracted_data_str)
            extracted_data_str = re.sub(r'```$', '', extracted_data_str)
            extracted_data_str = extracted_data_str.strip()
            
            extracted_data = json.loads(extracted_data_str)
            logger.info(f"Extracted appointment data: {extracted_data}")
            
            if not extracted_data.get('hasAllRequiredInfo'):
                return jsonify({
                    'success': False,
                    'error': 'Missing required information. Please provide patient name, date, and time.',
                    'extracted': extracted_data
                }), 400
            
            # Find doctor if department is specified but doctor is not
            if not extracted_data.get('doctorName') and extracted_data.get('department'):
                dept_name = extracted_data['department'].lower()
                if 'pediatric' in dept_name:
                    dept_name = 'pediatrics'
                elif 'cardio' in dept_name:
                    dept_name = 'cardiology'
                elif 'ortho' in dept_name:
                    dept_name = 'orthopedics'
                
                dept_query = f"SELECT d.doctor_id, d.first_name FROM doctors d JOIN departments dept ON d.department_id = dept.department_id WHERE LOWER(dept.name) LIKE '%{dept_name}%' LIMIT 1"
                doctor_result, doctor_error = agent.execute_query(dept_query)
                if doctor_result and len(doctor_result) > 0:
                    extracted_data['doctorId'] = doctor_result[0].get('doctor_id')
                    extracted_data['doctorName'] = doctor_result[0].get('first_name')
                else:
                    return jsonify({
                        'success': False,
                        'error': f'No doctor found in {extracted_data["department"]} department'
                    }), 400
            elif extracted_data.get('doctorName'):
                # Find doctor by name
                doctor_query = f"SELECT doctor_id, department_id FROM doctors WHERE first_name LIKE '%{extracted_data['doctorName']}%' LIMIT 1"
                doctor_result, doctor_error = agent.execute_query(doctor_query)
                if doctor_result and len(doctor_result) > 0:
                    extracted_data['doctorId'] = doctor_result[0].get('doctor_id')
                else:
                    return jsonify({
                        'success': False,
                        'error': f'Doctor {extracted_data["doctorName"]} not found'
                    }), 400
            
            if not extracted_data.get('doctorId'):
                return jsonify({
                    'success': False,
                    'error': 'Could not determine doctor. Please specify doctor name or department.'
                }), 400
            
            # Prepare data for booking
            booking_data = {
                'patientName': extracted_data.get('patientName'),
                'patientPhone': extracted_data.get('patientPhone', '0000000000'),
                'patientEmail': extracted_data.get('patientEmail'),
                'age': extracted_data.get('age'),
                'gender': extracted_data.get('gender'),
                'weight': extracted_data.get('weight'),
                'doctorId': extracted_data.get('doctorId'),
                'appointmentDate': extracted_data.get('appointmentDate'),
                'appointmentTime': extracted_data.get('appointmentTime'),
                'reason': extracted_data.get('reason')
            }
            
            # Call the booking endpoint
            return book_appointment_internal(booking_data, agent)
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse extracted data: {e}")
            return jsonify({
                'success': False,
                'error': 'Failed to extract appointment details. Please use the booking form.',
                'raw_response': extracted_data_str[:200] if 'extracted_data_str' in locals() else ''
            }), 400
        except Exception as e:
            logger.error(f"Error extracting appointment details: {e}")
            return jsonify({
                'success': False,
                'error': f'Error processing request: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Natural language booking error: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': f'Internal server error: {str(e)}'}), 500

def book_appointment_internal(data, agent):
    """Internal function to book appointment (used by both direct booking and natural language booking)"""
    try:
        logger.info("=== APPOINTMENT BOOKING ===")
        logger.info(f"Booking data: {data}")
        
        # Validate required fields
        required_fields = ['patientName', 'patientPhone', 'doctorId', 'appointmentDate', 'appointmentTime']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
        
        # Get doctor name from doctor_id for response (schema uses specialty_id, not department_id)
        doctor_id = data.get('doctorId')
        doctor_query = f"SELECT first_name, last_name, specialty_id FROM doctors WHERE doctor_id = {doctor_id}"
        doctor_result, doctor_error = agent.execute_query(doctor_query)
        
        if doctor_error or not doctor_result:
            return jsonify({'success': False, 'error': 'Doctor not found'}), 400
        
        doctor_row = doctor_result[0]
        doctor_name = f"{doctor_row.get('first_name', '')} {doctor_row.get('last_name', '')}".strip()
        specialty_id = doctor_row.get('specialty_id')
        
        # Get specialty/department name from specialties table
        department_name = ''
        if specialty_id:
            dept_query = f"SELECT name FROM specialties WHERE specialty_id = {specialty_id}"
            dept_result, dept_error = agent.execute_query(dept_query)
            department_name = dept_result[0].get('name') if dept_result and not dept_error else ''
        
        # Resolve facility_id (required for appointments) - use doctor's facility or first available
        facility_id = data.get('facility_id')
        if not facility_id:
            facility_query = f"""
            SELECT df.facility_id FROM doctor_facilities df
            WHERE df.doctor_id = {doctor_id} AND df.is_active = TRUE
            ORDER BY df.is_primary DESC
            LIMIT 1
            """
            facility_result, facility_error = agent.execute_query(facility_query)
            if facility_result and not facility_error:
                facility_id = facility_result[0].get('facility_id')
        if not facility_id:
            default_facility_query = "SELECT facility_id FROM facilities WHERE is_active = TRUE LIMIT 1"
            default_result, _ = agent.execute_query(default_facility_query)
            if default_result:
                facility_id = default_result[0].get('facility_id')
        if not facility_id:
            return jsonify({'success': False, 'error': 'No facility available. Please add a facility first.'}), 400
        data['facility_id'] = facility_id

        # Ensure new patients get PAT-YYMMDD-XXXX format (same as signup)
        from utils.patient_id_generator import generate_patient_id
        patient_phone = (data.get('patientPhone') or '').strip().replace(' ', '').replace('-', '')
        patient_is_new = True
        if patient_phone:
            safe_phone = patient_phone.replace("'", "''")
            patient_exists_query = f"SELECT patient_id FROM patients WHERE REPLACE(REPLACE(COALESCE(phone,''), ' ', ''), '-', '') = '{safe_phone}' LIMIT 1"
            patient_exists_result, _ = agent.execute_query(patient_exists_query)
            patient_is_new = not patient_exists_result or len(patient_exists_result) == 0
        if patient_is_new:
            data['generated_patient_id'] = generate_patient_id(prefix="PAT", format_type="short")

        # Check for conflicts
        conflict_sql = f"""
        SELECT appointment_id, appointment_date, status
        FROM appointments
        WHERE doctor_id = {data.get('doctorId')}
        AND appointment_date = '{data.get('appointmentDate')} {data.get('appointmentTime')}:00'
        AND status != 'Cancelled'
        LIMIT 1
        """
        
        conflict_results, conflict_error = agent.execute_query(conflict_sql)
        
        if conflict_error:
            logger.warning(f"Error checking conflicts: {conflict_error}")
        elif conflict_results and len(conflict_results) > 0:
            return jsonify({
                'success': False,
                'error': 'This time slot is already booked. Please choose a different time.',
                'conflict': True
            }), 409
        
        # Generate INSERT SQL using AI
        logger.info("Generating INSERT SQL for appointment...")
        sql_query = agent.generate_insert_sql_for_appointment(data)
        
        if not sql_query:
            return jsonify({'success': False, 'error': 'Failed to generate SQL query'}), 500
        
        logger.info(f"Generated SQL: {sql_query}")
        
        # Execute the INSERT query
        logger.info("Executing INSERT query...")
        result, error = agent.execute_query(sql_query, allow_insert=True)
        
        if error:
            logger.error(f"Database error: {error}")
            return jsonify({'success': False, 'error': f'Database error: {error}'}), 500
        
        # Get the inserted appointment details
        appointment_id = result.get('last_inserted_id') or result.get('inserted_id')
        
        if not appointment_id:
            return jsonify({'success': False, 'error': 'Failed to get appointment ID'}), 500
        
        logger.info(f"Appointment booked successfully with ID: {appointment_id}")
        
        return jsonify({
            'success': True,
            'message': f'Appointment booked successfully! Appointment ID: {appointment_id}',
            'appointment': {
                'id': appointment_id,
                'patientName': data.get('patientName'),
                'doctorName': doctor_name,
                'department': department_name,
                'appointmentDate': data.get('appointmentDate'),
                'appointmentTime': data.get('appointmentTime')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Appointment booking error: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': f'Internal server error: {str(e)}'}), 500

@patient_engagement_bp.route('/book-appointment', methods=['POST'])
def book_appointment():
    """Book an appointment using AI-generated SQL"""
    try:
        logger.info("=== APPOINTMENT BOOKING ENDPOINT CALLED ===")
        data = request.get_json()
        logger.info(f"Received appointment data: {data}")
        
        agent = DatabaseAgent()
        
        # Call the internal booking function
        result = book_appointment_internal(data, agent)
        
        return result
        
    except Exception as e:
        logger.error(f"Appointment booking error: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': f'Internal server error: {str(e)}'}), 500


# ---------------------------------------------------------------------------
# Front Desk (reception) endpoints - administrative registration only
# ---------------------------------------------------------------------------

@patient_engagement_bp.route('/front-desk/register-patient', methods=['POST'])
def front_desk_register_patient():
    """Register a new patient from front desk (walk-in). No user account. UHID auto-generated."""
    try:
        data = request.get_json() or {}
        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()
        phone = (data.get('phone') or '').strip()
        date_of_birth = data.get('date_of_birth')
        gender = (data.get('gender') or '').strip().lower()
        address = (data.get('address') or '').strip() or None

        if not first_name:
            return jsonify({'success': False, 'error': 'First name is required'}), 400
        if not last_name:
            last_name = first_name
        if not phone:
            return jsonify({'success': False, 'error': 'Phone is required'}), 400
        if not date_of_birth:
            return jsonify({'success': False, 'error': 'Date of birth is required'}), 400
        if gender not in ('male', 'female', 'other'):
            return jsonify({'success': False, 'error': 'Valid gender (male/female/other) is required'}), 400

        from sqlalchemy import text
        from utils.patient_id_generator import generate_patient_id

        patient_id = generate_patient_id(prefix="PAT", format_type="short")
        max_retries = 3
        for attempt in range(max_retries):
            try:
                db.session.execute(
                    text("""
                        INSERT INTO patients (
                            patient_id, user_id, first_name, last_name, date_of_birth, gender,
                            phone, email, address, is_active
                        ) VALUES (
                            :patient_id, NULL, :first_name, :last_name, :date_of_birth, :gender,
                            :phone, NULL, :address, TRUE
                        )
                    """),
                    {
                        'patient_id': patient_id,
                        'first_name': first_name,
                        'last_name': last_name,
                        'date_of_birth': date_of_birth,
                        'gender': gender,
                        'phone': phone,
                        'address': address,
                    }
                )
                db.session.commit()
                logger.info(f"Front desk registered patient: {patient_id} ({first_name} {last_name})")
                return jsonify({
                    'success': True,
                    'uhid': patient_id,
                    'patient_id': patient_id,
                    'message': f'Patient registered with UHID {patient_id}',
                }), 200
            except Exception as insert_error:
                err_str = str(insert_error).lower()
                if 'duplicate' in err_str or '1062' in err_str:
                    if attempt < max_retries - 1:
                        patient_id = generate_patient_id(prefix="PAT", format_type="short")
                        continue
                db.session.rollback()
                raise
        return jsonify({'success': False, 'error': 'Failed to generate unique patient ID'}), 500
    except Exception as e:
        logger.error(f"Front desk register patient error: {e}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# Patient Portal Routes (separate blueprint but related functionality)
patient_portal_bp = Blueprint('patient_portal', __name__, url_prefix='/api/patient-portal')


def _sql_row_to_dict(row):
    if row is None:
        return None
    if hasattr(row, '_mapping'):
        return dict(row._mapping)
    return dict(zip(row.keys(), row))


def _format_db_date(value) -> str | None:
    """Normalize DATE/datetime values from PyMySQL rows to YYYY-MM-DD."""
    if value is None:
        return None
    if isinstance(value, str):
        return value[:10]
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d')
    if isinstance(value, date):
        return value.strftime('%Y-%m-%d')
    if hasattr(value, 'strftime'):
        return value.strftime('%Y-%m-%d')
    return str(value)[:10]


def _format_db_time(value, default: str = '09:00') -> str:
    """Normalize TIME values (PyMySQL returns timedelta) to HH:MM."""
    if value is None:
        return default
    if isinstance(value, str):
        s = value.strip()
        if len(s) >= 5:
            return s[:5]
        return default
    if isinstance(value, timedelta):
        total = int(value.total_seconds()) % 86400
        hours = total // 3600
        minutes = (total % 3600) // 60
        return f'{hours:02d}:{minutes:02d}'
    if isinstance(value, datetime):
        return value.strftime('%H:%M')
    if isinstance(value, time_type):
        return value.strftime('%H:%M')
    if hasattr(value, 'strftime'):
        return value.strftime('%H:%M')
    return default


def _truncate_text(text, max_len=400):
    if not text:
        return ''
    text = str(text).strip()
    if len(text) <= max_len:
        return text
    return text[:max_len] + '…'


def _is_slots_availability_query(query: str) -> bool:
    q = query.lower()
    return (
        'available slot' in q
        or 'availability' in q
        or ('slot' in q and any(k in q for k in ('appointment', 'doctor', 'tomorrow', 'today', 'cardio', 'specialty', 'department')))
    )


def _parse_slots_query_hints(query: str):
    """Parse facility/specialty (e.g. sol:cardiology) and relative date from natural language."""
    q = query.lower()
    facility_hint = None
    specialty_hint = None

    colon_match = re.search(r'([a-z0-9][\w\s\-]*?)\s*:\s*([a-z][a-z\s]*)', q)
    if colon_match:
        facility_hint = colon_match.group(1).strip()
        specialty_hint = colon_match.group(2).strip()

    specialty_aliases = {
        'cardio': 'cardiology',
        'cardiology': 'cardiology',
        'pediatric': 'pediatrics',
        'pediatrics': 'pediatrics',
        'ortho': 'orthopedics',
        'orthopedics': 'orthopedics',
        'neuro': 'neurology',
        'neurology': 'neurology',
        'derm': 'dermatology',
        'dermatology': 'dermatology',
        'radiology': 'radiology',
    }
    if not specialty_hint:
        for key, canonical in specialty_aliases.items():
            if re.search(rf'\b{re.escape(key)}\b', q):
                specialty_hint = canonical
                break

    if not facility_hint:
        at_match = re.search(r'\bat\s+([a-z0-9][\w\-]*)', q)
        if at_match:
            facility_hint = at_match.group(1).strip()
        else:
            for token in re.findall(r'\b([a-z]{2,})\b', q):
                if token in specialty_aliases or token in (
                    'available', 'slots', 'slot', 'what', 'are', 'the', 'for', 'tomorrow', 'today', 'appointment',
                ):
                    continue
                if len(token) <= 6:
                    facility_hint = token
                    break

    target_date = datetime.now().date()
    if 'tomorrow' in q:
        target_date = target_date + timedelta(days=1)
    elif 'today' in q:
        target_date = target_date
    else:
        day_match = re.search(r'\b(\d{4}-\d{2}-\d{2})\b', q)
        if day_match:
            try:
                target_date = datetime.strptime(day_match.group(1), '%Y-%m-%d').date()
            except ValueError:
                pass

    return facility_hint, specialty_hint, target_date


def _normalize_specialty_name(name: str) -> str:
    if not name:
        return name
    n = name.lower().strip()
    if 'cardio' in n:
        return 'cardiology'
    if 'pediatric' in n:
        return 'pediatrics'
    if 'ortho' in n:
        return 'orthopedics'
    if 'neuro' in n:
        return 'neurology'
    if 'derm' in n:
        return 'dermatology'
    return n


def _resolve_doctors_for_slots(facility_hint=None, specialty_hint=None):
    """Find doctors by facility name and/or specialty without JSON_CONTAINS."""
    conditions = ['d.is_active = TRUE', 'd.is_available = TRUE', 'df.is_active = TRUE', 'f.is_active = TRUE']
    params = {}

    if specialty_hint:
        specialty_hint = _normalize_specialty_name(specialty_hint)
        conditions.append('LOWER(s.name) LIKE :specialty')
        params['specialty'] = f'%{specialty_hint}%'

    if facility_hint:
        conditions.append('LOWER(f.name) LIKE :facility')
        params['facility'] = f'%{facility_hint.lower()}%'

    where_clause = ' AND '.join(conditions)
    sql = f"""
        SELECT d.doctor_id, d.first_name, d.last_name,
               s.name AS specialty_name, f.facility_id, f.name AS facility_name
        FROM doctors d
        INNER JOIN specialties s ON d.specialty_id = s.specialty_id
        INNER JOIN doctor_facilities df ON d.doctor_id = df.doctor_id
        INNER JOIN facilities f ON df.facility_id = f.facility_id
        WHERE {where_clause}
        ORDER BY f.name, d.last_name, d.first_name
        LIMIT 10
    """
    rows = db.session.execute(db.text(sql), params).fetchall()
    return [_sql_row_to_dict(r) for r in rows]


def _compute_available_slots_for_doctor(doctor_id: int, days: int = 14):
    """Return availableSlots map for the next `days` (same logic as /available-slots)."""
    agent = DatabaseAgent()
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = today + timedelta(days=days)

    sql_query = f"""
        SELECT appointment_date, appointment_time, status
        FROM appointments
        WHERE doctor_id = {int(doctor_id)}
        AND appointment_date >= '{today.strftime('%Y-%m-%d')}'
        AND appointment_date < '{end_date.strftime('%Y-%m-%d')}'
        AND LOWER(status) NOT IN ('cancelled', 'canceled', 'completed')
        ORDER BY appointment_date
    """
    results, error = agent.execute_query(sql_query)
    if error:
        raise RuntimeError(error)

    booked_slots = set()
    if results:
        for row in results:
            appointment_date = row.get('appointment_date')
            appointment_time = row.get('appointment_time')
            date_str = _format_db_date(appointment_date)
            if not date_str:
                continue
            time_str = _format_db_time(appointment_time)
            booked_slots.add(f'{date_str}_{time_str}')

    available_slots = {}
    current_date = today
    while current_date < end_date:
        date_str = current_date.strftime('%Y-%m-%d')
        available_slots[date_str] = []
        for hour in range(9, 17):
            for minute in (0, 30):
                time_str = f'{hour:02d}:{minute:02d}'
                slot_key = f'{date_str}_{time_str}'
                if slot_key not in booked_slots:
                    display_time = datetime.strptime(time_str, '%H:%M').strftime('%I:%M %p')
                    available_slots[date_str].append({'time': time_str, 'displayTime': display_time})
        current_date += timedelta(days=1)

    return available_slots


def _handle_slots_availability_query(query: str):
    """Answer available-slot questions without LLM-generated JSON_CONTAINS SQL."""
    facility_hint, specialty_hint, target_date = _parse_slots_query_hints(query)
    doctors = _resolve_doctors_for_slots(facility_hint, specialty_hint)

    if not doctors:
        hints = []
        if facility_hint:
            hints.append(f'facility matching "{facility_hint}"')
        if specialty_hint:
            hints.append(f'specialty matching "{specialty_hint}"')
        hint_text = ' and '.join(hints) if hints else 'your criteria'
        return {
            'success': True,
            'results': [],
            'natural_results': [
                f'No available doctors found for {hint_text}. '
                'Try another facility or specialty name, or book from the Appointments page.'
            ],
            'count': 0,
        }

    date_str = target_date.strftime('%Y-%m-%d')
    natural_lines = []
    result_rows = []

    for doc in doctors[:5]:
        doctor_id = doc['doctor_id']
        doctor_label = f"Dr. {doc['first_name']} {doc['last_name']}"
        facility_label = doc.get('facility_name') or 'the facility'
        specialty_label = doc.get('specialty_name') or specialty_hint or 'general'

        try:
            all_slots = _compute_available_slots_for_doctor(doctor_id)
        except RuntimeError as exc:
            logger.error(f'Slots computation failed for doctor {doctor_id}: {exc}')
            natural_lines.append(f'{doctor_label}: unable to load slots ({exc}).')
            continue

        day_slots = all_slots.get(date_str, [])
        if day_slots:
            times = ', '.join(s['displayTime'] for s in day_slots[:12])
            extra = f' (+{len(day_slots) - 12} more)' if len(day_slots) > 12 else ''
            natural_lines.append(
                f'{doctor_label} ({specialty_label} at {facility_label}) on {target_date.strftime("%a, %b %d, %Y")}: {times}{extra}.'
            )
        else:
            natural_lines.append(
                f'{doctor_label} ({specialty_label} at {facility_label}) has no open slots on {target_date.strftime("%a, %b %d, %Y")}.'
            )

        for slot in day_slots:
            result_rows.append({
                'doctor': doctor_label,
                'specialty': specialty_label,
                'facility': facility_label,
                'date': date_str,
                'time': slot['time'],
                'display_time': slot['displayTime'],
            })

    if not natural_lines:
        natural_lines.append('No slot information could be retrieved. Please try again or use the booking form.')

    return {
        'success': True,
        'results': result_rows,
        'natural_results': natural_lines,
        'count': len(result_rows),
    }


def _build_dashboard_health_context(patient_id: str) -> str:
    """Assemble patient data for AI Care Overview summary."""
    parts = []

    patient_row = db.session.execute(
        db.text(
            """
            SELECT patient_id, first_name, last_name, date_of_birth, gender,
                   blood_type, height_cm, weight_kg, bmi
            FROM patients WHERE patient_id = :patient_id
            """
        ),
        {'patient_id': patient_id},
    ).fetchone()
    patient = _sql_row_to_dict(patient_row)
    if not patient:
        return ''

    age = None
    dob = patient.get('date_of_birth')
    if dob:
        try:
            if hasattr(dob, 'year'):
                birth = dob
            else:
                birth = datetime.strptime(str(dob)[:10], '%Y-%m-%d')
            today = datetime.now()
            age = today.year - birth.year - (
                (today.month, today.day) < (birth.month, birth.day)
            )
        except (ValueError, TypeError):
            age = None

    parts.append('PATIENT PROFILE:')
    parts.append(
        f"- Name: {patient.get('first_name', '')} {patient.get('last_name', '')}".strip()
    )
    if age is not None:
        parts.append(f"- Age: {age} years")
    if patient.get('gender'):
        parts.append(f"- Gender: {patient.get('gender')}")
    if patient.get('blood_type'):
        parts.append(f"- Blood type: {patient.get('blood_type')}")
    if patient.get('bmi'):
        parts.append(f"- BMI: {round(float(patient['bmi']), 1)}")
    if patient.get('height_cm') and patient.get('weight_kg'):
        parts.append(f"- Height/weight: {patient['height_cm']} cm, {patient['weight_kg']} kg")

    appt_rows = db.session.execute(
        db.text(
            """
            SELECT a.appointment_date, a.appointment_time, a.status, a.reason,
                   d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
                   f.name AS facility_name
            FROM appointments a
            LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
            LEFT JOIN facilities f ON a.facility_id = f.facility_id
            WHERE a.patient_id = :patient_id
              AND a.family_member_id IS NULL
              AND a.status IN ('scheduled', 'confirmed')
              AND CONCAT(a.appointment_date, ' ', a.appointment_time) >= NOW()
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
            LIMIT 5
            """
        ),
        {'patient_id': patient_id},
    ).fetchall()
    if appt_rows:
        parts.append('\nUPCOMING APPOINTMENTS:')
        for i, row in enumerate(appt_rows, 1):
            a = _sql_row_to_dict(row)
            doctor = ''
            if a.get('doctor_first_name') or a.get('doctor_last_name'):
                doctor = f"Dr. {a.get('doctor_first_name', '')} {a.get('doctor_last_name', '')}".strip()
            line = f"{i}. {a.get('appointment_date')} {a.get('appointment_time')}"
            if doctor:
                line += f" with {doctor}"
            if a.get('facility_name'):
                line += f" at {a.get('facility_name')}"
            if a.get('reason'):
                line += f" — {a.get('reason')}"
            parts.append(line)

    rad_rows = db.session.execute(
        db.text(
            """
            SELECT appointment_date, appointment_time, scan_type, body_part, status, reason
            FROM radiology_bookings
            WHERE patient_id = :patient_id
              AND family_member_id IS NULL
              AND status = 'scheduled'
              AND appointment_date >= CURDATE()
            ORDER BY appointment_date ASC, appointment_time ASC
            LIMIT 5
            """
        ),
        {'patient_id': patient_id},
    ).fetchall()
    if rad_rows:
        parts.append('\nUPCOMING RADIOLOGY:')
        for i, row in enumerate(rad_rows, 1):
            b = _sql_row_to_dict(row)
            scan = (b.get('scan_type') or 'scan').upper()
            if b.get('body_part'):
                scan += f" ({b.get('body_part')})"
            parts.append(
                f"{i}. {scan} on {b.get('appointment_date')} at {b.get('appointment_time')}"
            )

    record_rows = db.session.execute(
        db.text(
            """
            SELECT record_type, title, description, visit_date, file_path
            FROM medical_records
            WHERE patient_id = :patient_id AND family_member_id IS NULL
            ORDER BY visit_date DESC, created_at DESC
            LIMIT 8
            """
        ),
        {'patient_id': patient_id},
    ).fetchall()
    if record_rows:
        from services.medical_record_content_service import enrich_record_dict

        parts.append('\nRECENT MEDICAL RECORDS:')
        file_extractions = 0
        for i, row in enumerate(record_rows, 1):
            r = _sql_row_to_dict(row)
            if file_extractions < 4 and not (r.get('description') or '').strip() and r.get('file_path'):
                r = enrich_record_dict(r, max_chars=1200, allow_image_vision=True)
                if r.get('content_from_file'):
                    file_extractions += 1
            desc = _truncate_text(r.get('description'), 400)
            line = f"{i}. [{r.get('record_type')}] {r.get('title')} ({r.get('visit_date')})"
            if desc:
                line += f": {desc}"
            parts.append(line)

    family_rows = db.session.execute(
        db.text(
            """
            SELECT first_name, last_name, relationship, allergies, medical_history
            FROM family_members
            WHERE primary_patient_id = :patient_id AND is_active = 1
            """
        ),
        {'patient_id': patient_id},
    ).fetchall()
    if family_rows:
        parts.append(f'\nFAMILY MEMBERS ({len(family_rows)} linked):')
        for row in family_rows[:5]:
            m = _sql_row_to_dict(row)
            line = f"- {m.get('first_name')} {m.get('last_name')} ({m.get('relationship')})"
            if m.get('allergies'):
                line += f"; allergies: {_truncate_text(m['allergies'], 80)}"
            parts.append(line)

    try:
        bill_row = db.session.execute(
            db.text(
                """
                SELECT COUNT(*) AS pending_count
                FROM billing
                WHERE patient_id = :patient_id
                  AND status IN ('pending', 'partially_paid')
                """
            ),
            {'patient_id': patient_id},
        ).fetchone()
    except Exception:
        bill_row = None
    if bill_row:
        pending = _sql_row_to_dict(bill_row).get('pending_count') or 0
        if pending:
            parts.append(f'\nBILLING: {pending} bill(s) pending or partially paid.')

    return '\n'.join(parts)


@patient_portal_bp.route('/health-summary', methods=['GET', 'OPTIONS'])
@require_jwt
def patient_portal_health_summary():
    """Generate a brief AI Care Overview summary for the patient dashboard."""
    try:
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({'success': False, 'error': 'No patient record for this user'}), 400

        health_context = _build_dashboard_health_context(patient_id)
        if not health_context.strip():
            return jsonify({
                'success': True,
                'summary': (
                    '• Welcome to your care portal.\n'
                    '• Complete your profile and book appointments to get a personalized AI health overview.\n'
                    '• This is an AI summary, not medical advice.'
                ),
                'generated_at': datetime.utcnow().isoformat() + 'Z',
            }), 200

        prompt = f"""Using ONLY the patient data below, write a brief Care Overview for their dashboard.

Requirements:
- 3 to 5 bullet points starting with •
- Under 130 words total
- Mention upcoming appointments or scans if any
- Mention notable allergies, conditions, or recent lab/record highlights if present
- If data is sparse, note what is on file and suggest one helpful next step (e.g. book a check-up)
- Warm, clear, patient-friendly tone
- Plain text only — no markdown, no bold, no headers
- Do NOT diagnose or prescribe
- End with exactly this line on its own: This is an AI summary, not medical advice.

PATIENT DATA:
{health_context}
"""

        response = openai.ChatCompletion.create(
            model='gpt-4',
            messages=[
                {
                    'role': 'system',
                    'content': (
                        'You create concise, compassionate patient dashboard health overviews. '
                        'Use only provided data. Never invent test results or appointments.'
                    ),
                },
                {'role': 'user', 'content': prompt},
            ],
            max_tokens=280,
            temperature=0.5,
        )

        summary = (response.choices[0].message.content or '').strip()
        if not summary:
            summary = (
                '• Your care information is on file.\n'
                '• Check appointments and medical records for the latest updates.\n'
                '• This is an AI summary, not medical advice.'
            )

        return jsonify({
            'success': True,
            'summary': summary,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
        }), 200

    except Exception as e:
        logger.error(f'Error generating health summary: {e}')
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': 'Failed to generate health summary',
        }), 500


@patient_portal_bp.route('/query', methods=['POST', 'OPTIONS'])
@require_jwt
def patient_portal_query():
    """Handle patient portal database queries - scoped to the logged-in patient"""
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        conversation_context = data.get('conversation_context', '').strip()
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Query is required'
            }), 400
        
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400

        if _is_slots_availability_query(query):
            slot_result = _handle_slots_availability_query(query)
            return jsonify(slot_result), 200
        
        agent = DatabaseAgent()
        
        # Add patient context to the query to scope results
        lower_query = query.lower()
        is_patient_specific = any(keyword in lower_query for keyword in [
            'my', 'my appointments', 'my bookings', 'my records', 'my profile',
            'appointments', 'appointment', 'bookings', 'booking', 'records', 'bills', 'billing',
            'upcoming', 'past', 'scheduled', 'radiology', 'scans', 'reports'
        ])
        
        if is_patient_specific:
            patient_scoped_query = f"{query} (filter by patient_id = {patient_id})"
        else:
            patient_scoped_query = query
        
        # Process the query using the frontend-specific method with context
        result = agent.process_question_for_frontend(patient_scoped_query, conversation_context)
        
        # Filter results to only include data for this patient if it's patient-specific
        if result.get('success') and result.get('results') and is_patient_specific:
            filtered_results = []
            for row in result['results']:
                if isinstance(row, dict):
                    row_patient_id = None
                    for key, value in row.items():
                        if 'patient_id' in key.lower():
                            row_patient_id = str(value)
                            break
                    
                    if row_patient_id and str(row_patient_id) == str(patient_id):
                        filtered_results.append(row)
                    elif not row_patient_id:
                        filtered_results.append(row)
                else:
                    filtered_results.append(row)
            
            result['results'] = filtered_results
            result['count'] = len(filtered_results)
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error in patient portal query: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to process query: {str(e)}'
        }), 500

@patient_portal_bp.route('/extract-and-book', methods=['POST', 'OPTIONS'])
@require_jwt
def patient_portal_extract_and_book():
    """Extract appointment details from natural language and book for logged-in patient"""
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        
        if not query:
            return jsonify({'success': False, 'error': 'Query is required'}), 400
        
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400
        
        # Get patient info
        patient_result = db.session.execute(
            db.text("SELECT first_name, last_name, phone, date_of_birth, gender FROM patients WHERE patient_id = :patient_id"),
            {'patient_id': patient_id}
        ).fetchone()
        
        if not patient_result:
            return jsonify({'success': False, 'error': 'Patient not found'}), 404
        
        patient_info = dict(patient_result._mapping) if hasattr(patient_result, '_mapping') else dict(zip(patient_result.keys(), patient_result))
        
        agent = DatabaseAgent()
        
        # Use AI to extract appointment details
        schema = agent.get_database_schema()
        formatted_schema = agent.format_schema_for_gpt(schema)
        
        today = datetime.now().strftime('%Y-%m-%d')
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        prompt = f"""Extract appointment booking details from this natural language request:

"{query}"

Database Schema:
{formatted_schema}

Current Date: {today}
Tomorrow's Date: {tomorrow}
Patient Name: {patient_info.get('first_name', '')} {patient_info.get('last_name', '')}
Patient ID: {patient_id}

Extract the following information:
1. Doctor Name or Specialty/Department (if "any doctor" or department specified like pediatrics, cardiology, etc.)
2. Appointment Date (today, tomorrow, or specific date in YYYY-MM-DD format)
3. Appointment Time (in 24-hour format, e.g., "17:00" for 5 PM, or suggest a reasonable time if not specified)
4. Reason (if mentioned)

IMPORTANT RULES:
- If date is "today", use: {today}
- If date is "tomorrow", use: {tomorrow}
- If no date specified, use tomorrow ({tomorrow})
- Convert time to 24-hour format (5 PM = 17:00, 5pm = 17:00)
- If no time specified or "any available time" is mentioned, use "10:00" (10 AM) as default
- If doctor is not specified but specialty/department is, find any available doctor in that specialty
- Specialty names: pediatrics, cardiology, orthopedics, neurology, dermatology, etc.

Return ONLY a JSON object with this structure:
{{
    "doctorName": "extracted doctor name or null",
    "specialty": "extracted specialty/department name or null",
    "appointmentDate": "YYYY-MM-DD format",
    "appointmentTime": "HH:MM format (24-hour)",
    "reason": "extracted reason or null",
    "hasEnoughInfo": true/false
}}

Return ONLY the JSON, no other text."""
        
        try:
            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts appointment booking details from natural language. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=300
            )
            
            ai_response = response.choices[0].message.content.strip()
            # Extract JSON from response
            json_start = ai_response.find('{')
            json_end = ai_response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                extracted_data = json.loads(ai_response[json_start:json_end])
            else:
                extracted_data = json.loads(ai_response)
            
            logger.info(f"Extracted booking data: {extracted_data}")
            
            # Find doctor based on extracted data
            doctor_id = None
            facility_id = None
            
            if extracted_data.get('doctorName'):
                doctor_query = db.text("""
                    SELECT d.doctor_id, df.facility_id 
                    FROM doctors d
                    LEFT JOIN doctor_facilities df ON d.doctor_id = df.doctor_id AND df.is_primary = TRUE AND df.is_active = TRUE
                    WHERE CONCAT(d.first_name, ' ', d.last_name) LIKE :name 
                    AND d.is_active = TRUE
                    LIMIT 1
                """)
                doctor_result = db.session.execute(
                    doctor_query,
                    {'name': f"%{extracted_data['doctorName']}%"}
                ).fetchone()
                if doctor_result:
                    doctor_id = doctor_result[0]
                    facility_id = doctor_result[1]
            elif extracted_data.get('specialty'):
                specialty_name = extracted_data['specialty'].lower()
                if 'pediatric' in specialty_name:
                    specialty_name = 'pediatrics'
                elif 'cardio' in specialty_name:
                    specialty_name = 'cardiology'
                elif 'ortho' in specialty_name:
                    specialty_name = 'orthopedics'
                elif 'neuro' in specialty_name:
                    specialty_name = 'neurology'
                elif 'derm' in specialty_name:
                    specialty_name = 'dermatology'
                
                specialty_query = db.text("""
                    SELECT d.doctor_id, df.facility_id 
                    FROM doctors d
                    JOIN specialties s ON d.specialty_id = s.specialty_id
                    LEFT JOIN doctor_facilities df ON d.doctor_id = df.doctor_id AND df.is_primary = TRUE AND df.is_active = TRUE
                    WHERE LOWER(s.name) LIKE :specialty 
                    AND d.is_active = TRUE
                    LIMIT 1
                """)
                specialty_result = db.session.execute(
                    specialty_query,
                    {'specialty': f"%{specialty_name}%"}
                ).fetchone()
                if specialty_result:
                    doctor_id = specialty_result[0]
                    facility_id = specialty_result[1]
            
            if not doctor_id:
                return jsonify({
                    'success': False,
                    'extracted_data': extracted_data
                }), 200
            
            # Get appointment date and time
            appointment_date = extracted_data.get('appointmentDate', tomorrow)
            appointment_time = extracted_data.get('appointmentTime', '10:00')
            reason = extracted_data.get('reason', '')
            
            # Ensure time is in HH:MM format
            if len(appointment_time) == 5:
                appointment_time = f"{appointment_time}:00"
            
            # If facility_id is None, get it from doctor_facilities
            if not facility_id:
                facility_result = db.session.execute(
                    db.text("""
                        SELECT facility_id FROM doctor_facilities 
                        WHERE doctor_id = :doctor_id AND is_primary = TRUE AND is_active = TRUE
                        LIMIT 1
                    """),
                    {'doctor_id': doctor_id}
                ).fetchone()
                if facility_result:
                    facility_id = facility_result[0]
            
            # Book the appointment
            booking_result = db.session.execute(
                db.text("""
                    INSERT INTO appointments (
                        patient_id, doctor_id, facility_id,
                        appointment_date, appointment_time, appointment_type, reason, status
                    )
                    VALUES (
                        :patient_id, :doctor_id, :facility_id,
                        :appointment_date, :appointment_time, 'consultation', :reason, 'scheduled'
                    )
                """),
                {
                    'patient_id': patient_id,
                    'doctor_id': doctor_id,
                    'facility_id': facility_id,
                    'appointment_date': appointment_date,
                    'appointment_time': appointment_time,
                    'reason': reason
                }
            )
            db.session.commit()
            
            # Get doctor name for response
            doctor_name_result = db.session.execute(
                db.text("SELECT first_name, last_name FROM doctors WHERE doctor_id = :doctor_id"),
                {'doctor_id': doctor_id}
            ).fetchone()
            doctor_name = f"Dr. {doctor_name_result[0]} {doctor_name_result[1]}" if doctor_name_result else "the doctor"
            
            return jsonify({
                'success': True,
                'message': f'Appointment booked successfully with {doctor_name} on {appointment_date} at {appointment_time}',
                'appointment': {
                    'appointment_id': booking_result.lastrowid,
                    'doctor_id': doctor_id,
                    'facility_id': facility_id,
                    'appointment_date': appointment_date,
                    'appointment_time': appointment_time,
                    'reason': reason
                }
            }), 200
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
            return jsonify({
                'success': False,
                'error': 'Could not extract booking details. Please provide more specific information.',
                'extracted_text': ai_response
            }), 400
        except Exception as e:
            logger.error(f"Error in extraction: {e}")
            return jsonify({
                'success': False,
                'error': f'Error processing request: {str(e)}'
            }), 500
        
    except Exception as e:
        logger.error(f"Patient portal extract and book error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to process request: {str(e)}'
        }), 500

@patient_portal_bp.route('/chat', methods=['POST', 'OPTIONS'])
@require_jwt
def patient_portal_chat():
    """AI chat endpoint specifically for patient portal - provides home remedies and answers patient data queries"""
    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        detailed_context = data.get('detailed_context', '')
        # Support legacy format for backward compatibility
        patient_context = data.get('patient_context', '')
        family_context = data.get('family_context', '')
        conversation_history = data.get('conversation_history', [])
        
        if not message:
            return jsonify({
                'success': False,
                'error': 'Message is required'
            }), 400
        
        patient_id = g.patient_id
        if not patient_id:
            return jsonify({
                'success': False,
                'error': 'No patient record for this user'
            }), 400

        from services.medical_record_content_service import augment_patient_portal_context
        detailed_context = augment_patient_portal_context(patient_id, detailed_context or '')
        
        # Create system prompt for patient portal chat
        system_prompt = """You are a friendly, conversational, and helpful AI health assistant for patients. You have COMPLETE ACCESS to detailed health information for the primary patient and all their family members, including:

- Profile information (name, age, gender, blood type, height, weight, BMI)
- Medical history
- Allergies
- Current medications
- Appointments (past and upcoming)
- Radiology bookings
- Medical records including:
  * LAB RESULTS AND DIAGNOSTICS: Complete lab test results, blood work, diagnostic test results, pathology reports, and all laboratory findings
  * RADIOLOGY REPORTS: Imaging study results, scan findings, diagnostic imaging interpretations
  * CLINICAL OBSERVATIONS: Visit summaries, discharge summaries, clinical notes, doctor's observations, diagnostic assessments, and treatment notes
  * PRESCRIPTIONS: Medication prescriptions and treatment plans

Your role is to:

1. Home Remedies: Provide safe, general home remedies for common ailments (cough, cold, headache, minor aches, dizziness, etc.). 
   - ALWAYS consider the SPECIFIC PERSON'S profile information (age, gender, medical history, allergies, medications) when suggesting remedies
   - If the query mentions a family member by name or relationship, use THAT PERSON'S information, not the primary patient's
   - If the query is about "me", "myself", or "my", use the PRIMARY PATIENT's information
   - Avoid suggesting remedies that might interact with known allergies or medications
   - Always include disclaimers that these are general suggestions and not medical advice
   - If the person has serious symptoms or conditions, strongly encourage immediate medical attention

2. Health Condition Queries: When asked about health conditions, present condition, or status of family members:
   - YOU HAVE ACCESS to all family member data provided in the context above, including LAB RESULTS, DIAGNOSTICS, and CLINICAL OBSERVATIONS
   - Summarize each family member's health information including: medical history, allergies, recent appointments, recent medical records, LAB RESULTS, DIAGNOSTIC TEST RESULTS, and CLINICAL OBSERVATIONS
   - For queries like "present condition of my family members" or "health status of family", provide a comprehensive summary for EACH family member using the data provided
   - Include their medical history, known conditions, allergies, medications, recent appointments, recent medical records, LAB TEST RESULTS, DIAGNOSTIC FINDINGS, and CLINICAL OBSERVATIONS from visit summaries
   - When discussing lab results, reference specific test values and findings from the lab reports provided
   - When discussing diagnostics, reference specific findings from radiology reports and diagnostic test results provided
   - When discussing clinical observations, reference specific notes and assessments from visit summaries and discharge summaries provided
   - If a family member has no medical history or records, state that clearly
   - DO NOT say you don't have access - you DO have access to all the information provided in the context, including lab results, diagnostics, and clinical observations

3. Patient Data Queries: Answer questions about:
   - Patient profile information (for primary patient or specific family members)
   - Upcoming and past appointments (identify which person the query is about)
   - Radiology bookings (identify which person the query is about)
   - Medical records including LAB RESULTS, DIAGNOSTICS, and CLINICAL OBSERVATIONS (identify which person the query is about)
   - Lab test results and diagnostic findings (use the lab results and diagnostics data provided in the context)
   - Clinical observations and visit summaries (use the clinical notes and observations provided in the context)
   - Billing information
   - Family members' health information including their lab results, diagnostics, and clinical observations

4. Identifying the Person: When answering queries:
   - If the query mentions a family member's name (e.g., "John's health", "my son's appointment"), use that family member's data
   - If the query mentions a relationship (e.g., "my wife's records", "my child's allergies"), identify the family member by relationship
   - If the query says "me", "myself", "my health", "my records", use the PRIMARY PATIENT's data
   - If the query asks about "family members" or "all family members", provide information for ALL family members listed in the context
   - ONLY ask which person when the query clearly needs that person's private records (e.g. "my lab results", "my vitamin level") and the person is ambiguous
   - Do NOT ask if a general health question is "incomplete" — answer it directly (see section 6)

6. General Health Education (vitamins, deficiencies, symptoms, conditions, diet, wellness):
   - For topics like vitamin deficiency, anemia, diabetes, headache remedies, nutrition, supplements, etc., give a helpful answer immediately
   - Interpret minor typos charitably (e.g. "vitami" means vitamin, "deficency" means deficiency)
   - Include: brief overview, common signs/symptoms, common causes, dietary sources or general management tips, when to see a doctor, and a short disclaimer
   - You may briefly mention that lab tests can confirm deficiencies if relevant, but do not refuse to answer or only ask clarifying questions
   - If the patient has relevant lab data in context (e.g. Vitamin D, B12), mention their results when available; otherwise still provide general education

5. Appointment Booking: When a patient asks about booking an appointment or says "yes" to booking, respond with: "I can help you book an appointment! Please fill out the form below, or provide more details like which doctor or specialty you'd like to see, preferred date and time, and reason for the appointment."

Note: For general wellness questions (section 6), answer fully first; only ask follow-up questions at the end if helpful, not instead of answering.

CRITICAL: You have been provided with detailed health information in the context above, including:
- LAB RESULTS AND DIAGNOSTICS: Complete lab test results, blood work, diagnostic test results, pathology reports
- RADIOLOGY REPORTS: Imaging study results, scan findings, diagnostic imaging interpretations
- CLINICAL OBSERVATIONS: Visit summaries, discharge summaries, clinical notes, doctor's observations, diagnostic assessments

ALWAYS use this information to answer questions. When asked about lab results, diagnostics, or clinical observations:
- Reference the specific lab results, diagnostic findings, and clinical observations provided in the context
- Quote or summarize the actual test values, findings, and observations from the medical records
- Never say you don't have access to lab results, diagnostics, or clinical observations - you DO have access to all this data provided in the context
- If specific information is not in the context, only then politely explain that specific data point is not available
- When the context includes a "MEDICAL RECORD FINDINGS" section with Results or Findings text, you MUST summarize those values/findings for the patient — never say findings are "not provided" if that section contains extracted report text

IMPORTANT GUIDELINES:
- Be conversational, natural, and engaging - like talking to a helpful friend
- Remember and reference previous parts of the conversation when relevant
- Ask follow-up questions only after giving a helpful answer, not instead of answering general health questions
- Use a warm, empathetic, and patient-focused tone
- For medical advice beyond home remedies, encourage consulting a healthcare professional
- When answering about patient data, be clear and concise
- ALWAYS use the specific person's data when answering - don't mix up patient and family member information
- When asked about family members' conditions, provide a comprehensive summary using ALL available data from the context
- Never provide diagnosis or treatment recommendations for serious conditions
- Always include appropriate disclaimers for health-related advice
- Use natural language and avoid being overly formal or robotic
- Show interest in helping and offer additional assistance when relevant
- DO NOT use markdown formatting (no **bold**, *italic*, # headers, etc.) - use plain text only
- Use simple bullet points with • symbol instead of markdown lists

Format your responses in a clear, easy-to-read manner with simple bullet points when appropriate. Keep responses conversational and natural. Use plain text only - no markdown formatting."""

        # Build context for the AI
        context = f"{system_prompt}\n\n"
        
        # Use detailed_context if provided (new format), otherwise fall back to legacy format
        if detailed_context:
            context += f"{detailed_context}\n\n"
        else:
            # Legacy format support
            if patient_context:
                context += f"{patient_context}\n"
            if family_context:
                context += f"{family_context}\n"
        
        # Add instruction to identify and use the correct person's data
        message_lower = message.lower()
        context += "\n\n=== CRITICAL INSTRUCTIONS FOR THIS QUERY ===\n"
        
        # Check if query is about family members' conditions
        if any(keyword in message_lower for keyword in ['family member', 'family members', 'present condition', 'health condition', 'health status', 'condition of', 'status of']):
            context += "THIS QUERY IS ABOUT FAMILY MEMBERS' HEALTH CONDITIONS:\n"
            context += "- You MUST use the FAMILY MEMBERS INFORMATION provided above\n"
            context += "- Provide a comprehensive summary for EACH family member listed\n"
            context += "- Include: medical history, allergies, medications, recent appointments, recent medical records\n"
            context += "- If a family member has no data in a category, state 'No [category] available' for that person\n"
            context += "- DO NOT say you don't have access - you DO have all the family member data provided above\n"
            context += "- Format the response clearly, listing each family member separately\n"
        else:
            context += "- Carefully identify which person (primary patient or specific family member) the query is about\n"
            context += "- Use ONLY that person's profile information, medical history, allergies, medications, appointments, records when answering\n"
            context += "- If the query mentions a name or relationship, match it to the family member information provided above\n"
            context += "- If the query is about 'me' or 'myself', use the PRIMARY PATIENT information\n"
        
        health_education_keywords = [
            'vitamin', 'vitamins', 'deficiency', 'deficient', 'nutrition', 'nutrient', 'supplement',
            'anemia', 'iron', 'calcium', 'magnesium', 'folate', 'b12', 'd3', 'protein', 'diet',
            'symptom', 'symptoms', 'cause', 'causes', 'prevent', 'prevention', 'treatment',
            'disease', 'condition', 'disorder', 'infection', 'fever', 'cough', 'cold', 'flu',
            'headache', 'migraine', 'pain', 'ache', 'nausea', 'fatigue', 'tired', 'weakness',
            'remedy', 'remedies', 'home remedy', 'wellness', 'immune', 'cholesterol', 'blood pressure',
            'diabetes', 'thyroid', 'allergy', 'asthma', 'dehydration', 'hydration',
        ]
        is_health_education = any(kw in message_lower for kw in health_education_keywords)

        if is_health_education:
            context += "THIS IS A GENERAL HEALTH / WELLNESS EDUCATION QUERY:\n"
            context += "- Answer directly with clear, practical information — do NOT say the question is incomplete\n"
            context += "- Fix obvious typos in your understanding (e.g. vitami → vitamin) and answer the intended topic\n"
            context += "- Structure: what it is, common signs, causes/risk factors, foods or lifestyle tips, when to seek care, brief disclaimer\n"
            context += "- If patient lab records in context mention this topic, reference them; if not, still give a full general answer\n"
            context += "- Keep the response concise but complete (at least 4-6 sentences or bullet points)\n"
        elif any(keyword in message_lower for keyword in ['dizziness', 'headache', 'pain', 'feeling', 'symptom', 'remedy', 'treatment', 'ache', 'ill', 'sick', 'unwell', 'health', 'condition']):
            context += "- When providing health advice or remedies, ALWAYS consider the SPECIFIC PERSON'S profile information (age, medical history, allergies, medications) and tailor suggestions accordingly\n"
            context += "- Avoid suggesting anything that might interact with that person's known allergies or medications\n"
        
        context += "\nREMEMBER: All the data you need is provided in the context above. Use it to answer the query comprehensively. Never respond with only a clarifying question when you can provide useful general health information.\n"

        # Build messages array with conversation history
        messages_array = [{"role": "system", "content": context}]
        
        # Add conversation history (last 10 messages for context)
        if conversation_history:
            for hist_msg in conversation_history:
                # Only include user and assistant messages, skip system messages
                if hist_msg.get('role') in ['user', 'assistant']:
                    messages_array.append({
                        "role": hist_msg.get('role'),
                        "content": hist_msg.get('content', '')
                    })
        
        # Add current message
        messages_array.append({"role": "user", "content": message})

        # Use OpenAI to generate response
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=messages_array,
            max_tokens=500,
            temperature=0.8  # Slightly higher temperature for more conversational responses
        )

        ai_response = (response.choices[0].message.content or '').strip()

        if not ai_response:
            ai_response = (
                "I couldn't generate a full answer right now. Please try again in a moment, "
                "or rephrase your question (for example: \"Tell me about vitamin D deficiency\")."
            )

        return jsonify({
            'success': True,
            'response': ai_response
        }), 200

    except Exception as e:
        logger.error(f"Error in patient portal chat: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to process chat message: {str(e)}'
        }), 500

