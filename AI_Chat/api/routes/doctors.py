"""
Doctor and Facility Routes
Handles doctor search, facility search, and specialties.
Uses JWT for protected routes; identity from Authorization: Bearer <accessToken>.
"""
from flask import Blueprint, request, jsonify, g
import logging
import traceback
from datetime import datetime
from config import db
from utils.jwt_utils import require_jwt

logger = logging.getLogger(__name__)

# Create blueprint
doctors_bp = Blueprint('doctors', __name__, url_prefix='/api')

@doctors_bp.route('/doctors/search', methods=['GET'])
def search_doctors():
    """Search doctors by specialty, name, or facility"""
    try:
        specialty_id = request.args.get('specialty_id')
        facility_id = request.args.get('facility_id')
        search_term = request.args.get('search')
        
        # Build query
        conditions = ["d.is_active = TRUE"]
        params = {}
        
        if specialty_id:
            conditions.append("d.specialty_id = :specialty_id")
            params['specialty_id'] = specialty_id
        
        if search_term:
            conditions.append("(d.first_name LIKE :search OR d.last_name LIKE :search)")
            params['search'] = f'%{search_term}%'
        
        where_clause = " AND ".join(conditions)
        
        sql = f"""
            SELECT DISTINCT
                d.doctor_id,
                d.specialty_id,
                d.first_name,
                d.last_name,
                d.qualification,
                d.experience_years,
                d.consultation_fee,
                d.is_available,
                d.is_active,
                d.bio,
                s.name as specialty_name,
                f.facility_id,
                f.name as facility_name,
                f.address as facility_address,
                f.city as facility_city,
                f.type as facility_type,
                f.latitude as facility_lat,
                f.longitude as facility_lng
            FROM doctors d
            LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
            LEFT JOIN doctor_facilities df ON d.doctor_id = df.doctor_id AND df.is_primary = TRUE AND df.is_active = TRUE
            LEFT JOIN facilities f ON df.facility_id = f.facility_id AND f.is_active = TRUE
            WHERE {where_clause}
            ORDER BY d.first_name, d.last_name
        """
        
        result = db.session.execute(db.text(sql), params).fetchall()
        
        # Use a dictionary to deduplicate doctors by doctor_id
        doctors_dict = {}
        for row in result:
            doctor = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            doctor_id = doctor.get('doctor_id')
            
            # If we haven't seen this doctor_id before, add it
            # If we have, prefer the one with facility information (if current has facility and existing doesn't)
            if doctor_id not in doctors_dict:
                doctors_dict[doctor_id] = doctor
            else:
                # If current doctor has facility info and existing doesn't, replace it
                existing = doctors_dict[doctor_id]
                if doctor.get('facility_id') and not existing.get('facility_id'):
                    doctors_dict[doctor_id] = doctor
                # If both have facilities, prefer the one with is_primary (already filtered in query)
                elif doctor.get('facility_id') and existing.get('facility_id'):
                    # Keep the existing one (already has primary facility)
                    pass
        
        doctors = list(doctors_dict.values())
        
        # Format specialty as object if specialty_name exists
        for doctor in doctors:
            if 'specialty_name' in doctor and doctor['specialty_name']:
                doctor['specialty'] = {
                    'specialty_id': doctor.get('specialty_id'),
                    'name': doctor['specialty_name']
                }
        
        # Filter by facility if specified
        if facility_id:
            facility_doctors = db.session.execute(
                db.text("""
                    SELECT doctor_id FROM doctor_facilities 
                    WHERE facility_id = :facility_id AND is_active = TRUE
                """),
                {"facility_id": facility_id}
            ).fetchall()
            doctor_ids = {row[0] for row in facility_doctors}
            doctors = [d for d in doctors if d.get('doctor_id') in doctor_ids]
        
        return jsonify({
            'success': True,
            'doctors': doctors
        }), 200
        
    except Exception as e:
        logger.error(f"Error searching doctors: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to search doctors: {str(e)}'
        }), 500

@doctors_bp.route('/facilities/search', methods=['GET'])
def search_facilities():
    """Search healthcare facilities"""
    try:
        facility_type = request.args.get('type')
        city = request.args.get('city')
        search_term = request.args.get('search')
        
        conditions = ["is_active = TRUE"]
        params = {}
        
        if facility_type:
            conditions.append("type = :facility_type")
            params['facility_type'] = facility_type
        
        if city:
            conditions.append("city = :city")
            params['city'] = city
        
        if search_term:
            conditions.append("name LIKE :search")
            params['search'] = f'%{search_term}%'
        
        where_clause = " AND ".join(conditions)
        
        sql = f"""
            SELECT * FROM facilities
            WHERE {where_clause}
            ORDER BY name
        """
        
        result = db.session.execute(db.text(sql), params).fetchall()
        
        facilities = []
        for row in result:
            facility = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            facilities.append(facility)
        
        return jsonify({
            'success': True,
            'facilities': facilities
        }), 200
        
    except Exception as e:
        logger.error(f"Error searching facilities: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to search facilities: {str(e)}'
        }), 500

@doctors_bp.route('/specialties', methods=['GET'])
def get_specialties():
    """Get all medical specialties"""
    try:
        result = db.session.execute(
            db.text("SELECT * FROM specialties WHERE is_active = TRUE ORDER BY name")
        ).fetchall()
        
        specialties = []
        for row in result:
            specialty = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            specialties.append(specialty)
        
        return jsonify({
            'success': True,
            'specialties': specialties
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching specialties: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch specialties: {str(e)}'
        }), 500

@doctors_bp.route('/doctors/prescriptions', methods=['GET'])
@require_jwt
def get_doctor_prescriptions():
    """Get all prescriptions created by a doctor"""
    try:
        doctor_id = request.args.get('doctor_id')
        user_email = g.user_email
        
        # If doctor_id not provided, get it from authenticated user
        if not doctor_id and user_email:
            doctor_result = db.session.execute(
                db.text("SELECT doctor_id FROM doctors WHERE email = :email AND is_active = TRUE"),
                {"email": user_email}
            ).fetchone()
            if doctor_result:
                doctor_id = doctor_result[0]
            else:
                return jsonify({
                    'success': False,
                    'error': 'Doctor not found for the provided email'
                }), 404
        
        if not doctor_id:
            return jsonify({
                'success': False,
                'error': 'doctor_id parameter required or user must be a doctor'
            }), 400
        
        # Get prescriptions created by this doctor
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
                p.first_name as patient_first_name,
                p.last_name as patient_last_name,
                p.email as patient_email,
                fm.first_name as family_member_first_name,
                fm.last_name as family_member_last_name
            FROM medical_records mr
            LEFT JOIN patients p ON mr.patient_id = p.patient_id
            LEFT JOIN family_members fm ON mr.family_member_id = fm.family_member_id
            WHERE mr.doctor_id = :doctor_id
            AND mr.record_type = 'prescription'
            ORDER BY mr.visit_date DESC, mr.created_at DESC
        """
        
        result = db.session.execute(db.text(query), {"doctor_id": doctor_id}).fetchall()
        
        prescriptions = []
        for row in result:
            prescription = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
            # Convert dates to strings
            if prescription.get('visit_date'):
                prescription['visit_date'] = prescription['visit_date'].isoformat() if hasattr(prescription['visit_date'], 'isoformat') else str(prescription['visit_date'])
            if prescription.get('created_at'):
                prescription['created_at'] = prescription['created_at'].isoformat() if hasattr(prescription['created_at'], 'isoformat') else str(prescription['created_at'])
            prescriptions.append(prescription)
        
        return jsonify({
            'success': True,
            'prescriptions': prescriptions,
            'count': len(prescriptions)
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching doctor prescriptions: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch prescriptions: {str(e)}'
        }), 500

@doctors_bp.route('/doctors/patients/<patient_id>/family-members', methods=['GET'])
@require_jwt
def get_patient_family_members(patient_id):
    """Get family members for a patient (for doctors who have appointments with the patient)"""
    try:
        user_email = g.user_email
        
        # Verify doctor has appointments with this patient
        doctor_result = db.session.execute(
            db.text("""
                SELECT d.doctor_id FROM doctors d
                WHERE d.email = :email AND d.is_active = TRUE
            """),
            {"email": user_email}
        ).fetchone()
        
        if not doctor_result:
            return jsonify({
                'success': False,
                'error': 'Doctor not found'
            }), 404
        
        doctor_id = doctor_result[0]
        
        # Check if doctor has appointments with this patient
        appointment_check = db.session.execute(
            db.text("""
                SELECT COUNT(*) FROM appointments
                WHERE patient_id = :patient_id AND doctor_id = :doctor_id
            """),
            {"patient_id": patient_id, "doctor_id": doctor_id}
        ).fetchone()
        
        if not appointment_check or appointment_check[0] == 0:
            return jsonify({
                'success': False,
                'error': 'No appointments found with this patient'
            }), 403
        
        # Get family members for the patient
        result = db.session.execute(
            db.text("""
                SELECT 
                    family_member_id,
                    primary_patient_id,
                    first_name,
                    last_name,
                    date_of_birth,
                    gender,
                    relationship,
                    phone,
                    email,
                    blood_type,
                    height_cm,
                    weight_kg,
                    medical_history,
                    allergies,
                    is_active,
                    created_at
                FROM family_members 
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
            if member.get('created_at'):
                member['created_at'] = member['created_at'].isoformat() if hasattr(member['created_at'], 'isoformat') else str(member['created_at'])
            family_members.append(member)
        
        return jsonify({
            'success': True,
            'family_members': family_members
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching patient family members: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch family members: {str(e)}'
        }), 500

@doctors_bp.route('/doctors/generate-report', methods=['POST', 'OPTIONS'])
def generate_ai_report():
    """Generate an AI-powered analytics report for the doctor"""
    import os
    
    # Handle CORS preflight request
    if request.method == 'OPTIONS':
        response = jsonify({'success': True})
        origin = request.headers.get('Origin')
        allowed_origins = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173,http://192.168.5.111:5173').split(',')
        if origin in allowed_origins:
            response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, X-User-Email, Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response, 200
    
    try:
        import openai
        from config import OPENAI_API_KEY
        
        # Set API key if not already set
        if OPENAI_API_KEY:
            openai.api_key = OPENAI_API_KEY
        
        if not OPENAI_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenAI API key not configured'
            }), 500
        
        data = request.get_json() or {}
        analytics_data = data.get('analyticsData', data)
        
        # Prepare data summary for AI
        stats = analytics_data.get('statistics', {})
        appointments_overview = analytics_data.get('appointments', {}).get('overview', [])
        appointments_by_status = analytics_data.get('appointments', {}).get('byStatus', [])
        prescriptions_trend = analytics_data.get('prescriptions', {}).get('trend', [])
        date_range = analytics_data.get('dateRange', 'month')
        
        # Calculate insights
        total_appointments = stats.get('totalAppointments', 0)
        completion_rate = (stats.get('completedAppointments', 0) / total_appointments * 100) if total_appointments > 0 else 0
        
        avg_appointments_per_day = (sum(item.get('count', 0) for item in appointments_overview) / len(appointments_overview)) if appointments_overview else 0
        avg_prescriptions_per_day = (sum(item.get('count', 0) for item in prescriptions_trend) / len(prescriptions_trend)) if prescriptions_trend else 0
        
        # Build prompt for AI
        prompt = f"""You are a healthcare analytics expert. Generate a comprehensive, professional analytics report based on the following practice data.

PRACTICE ANALYTICS DATA:
Date Range: {date_range.upper()}

KEY STATISTICS:
- Total Appointments: {stats.get('totalAppointments', 0)}
- Upcoming Appointments: {stats.get('upcomingAppointments', 0)}
- Completed Appointments: {stats.get('completedAppointments', 0)}
- Total Prescriptions: {stats.get('totalPrescriptions', 0)}
- Completion Rate: {completion_rate:.1f}%
- Average Appointments per Day: {avg_appointments_per_day:.1f}
- Average Prescriptions per Day: {avg_prescriptions_per_day:.1f}

APPOINTMENT STATUS BREAKDOWN:
{chr(10).join([f"- {item.get('name', 'Unknown')}: {item.get('value', 0)}" for item in appointments_by_status])}

APPOINTMENT TRENDS:
{chr(10).join([f"- {item.get('date', 'N/A')}: {item.get('count', 0)} appointments" for item in appointments_overview[:10]])}

PRESCRIPTION TRENDS:
{chr(10).join([f"- {item.get('date', 'N/A')}: {item.get('count', 0)} prescriptions" for item in prescriptions_trend[:10]])}

Generate a comprehensive, professional healthcare analytics report that includes:
1. Executive Summary with key findings
2. Performance Metrics Analysis
3. Trends and Patterns
4. Recommendations for Practice Improvement
5. Actionable Insights

Format the report professionally with clear sections, use bullet points where appropriate, and provide specific, data-driven recommendations. Keep it concise but comprehensive (approximately 500-800 words)."""

        # Call OpenAI to generate report
        response = openai.ChatCompletion.create(
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": "You are a healthcare analytics expert specializing in practice management and clinical operations. Generate professional, data-driven reports with actionable insights."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=2000,
            temperature=0.7
        )
        
        ai_report = response.choices[0].message['content'].strip()
        
        # Generate PDF report
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
        from io import BytesIO
        import re
        
        # Create a BytesIO buffer to hold the PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter,
                                rightMargin=72, leftMargin=72,
                                topMargin=72, bottomMargin=72)
        
        # Container for the 'Flowable' objects
        elements = []
        
        # Define styles
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=30,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=12,
            spaceBefore=12,
            fontName='Helvetica-Bold'
        )
        
        subheading_style = ParagraphStyle(
            'CustomSubHeading',
            parent=styles['Heading3'],
            fontSize=14,
            textColor=colors.HexColor('#3b82f6'),
            spaceAfter=8,
            spaceBefore=8,
            fontName='Helvetica-Bold'
        )
        
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=11,
            textColor=colors.HexColor('#1f2937'),
            spaceAfter=6,
            alignment=TA_JUSTIFY,
            leading=14
        )
        
        meta_style = ParagraphStyle(
            'CustomMeta',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#6b7280'),
            spaceAfter=20,
            alignment=TA_CENTER
        )
        
        # Title
        elements.append(Spacer(1, 0.3*inch))
        elements.append(Paragraph("Healthcare Analytics Report", title_style))
        elements.append(Paragraph("AI-Generated Analysis", meta_style))
        elements.append(Spacer(1, 0.2*inch))
        
        # Metadata table
        metadata_data = [
            ['Generated:', datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
            ['Date Range:', date_range.upper()],
            ['Report Type:', 'Comprehensive Practice Analytics']
        ]
        metadata_table = Table(metadata_data, colWidths=[2*inch, 4*inch])
        metadata_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e5e7eb')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(metadata_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Key Statistics Section
        elements.append(Paragraph("Key Statistics", heading_style))
        stats_data = [
            ['Metric', 'Value'],
            ['Total Appointments', str(stats.get('totalAppointments', 0))],
            ['Upcoming Appointments', str(stats.get('upcomingAppointments', 0))],
            ['Completed Appointments', str(stats.get('completedAppointments', 0))],
            ['Total Prescriptions', str(stats.get('totalPrescriptions', 0))],
            ['Completion Rate', f"{completion_rate:.1f}%"],
            ['Avg Appointments/Day', f"{avg_appointments_per_day:.1f}"],
            ['Avg Prescriptions/Day', f"{avg_prescriptions_per_day:.1f}"]
        ]
        stats_table = Table(stats_data, colWidths=[3.5*inch, 2.5*inch])
        stats_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
        ]))
        elements.append(stats_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Parse and format AI report content
        elements.append(Paragraph("Analytics Report", heading_style))
        elements.append(Spacer(1, 0.1*inch))
        
        # Split AI report into sections and format
        lines = ai_report.split('\n')
        current_section = []
        
        for line in lines:
            line = line.strip()
            if not line:
                if current_section:
                    # Add accumulated content
                    text = ' '.join(current_section)
                    if text:
                        elements.append(Paragraph(text, normal_style))
                    current_section = []
                continue
            
            # Check if it's a heading (starts with number, bold text, or all caps)
            if (line.startswith(('1.', '2.', '3.', '4.', '5.', '##', '**')) or 
                (len(line) < 100 and line.isupper()) or
                (line.startswith('#') and len(line) < 80)):
                if current_section:
                    text = ' '.join(current_section)
                    if text:
                        elements.append(Paragraph(text, normal_style))
                    current_section = []
                # Format as heading
                clean_line = re.sub(r'^[#\d\.\s\*\*]+', '', line).strip()
                if clean_line:
                    elements.append(Paragraph(clean_line, subheading_style))
            else:
                # Regular content
                # Clean up markdown formatting
                clean_line = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', line)
                clean_line = re.sub(r'^[-•]\s*', '• ', clean_line)
                current_section.append(clean_line)
        
        # Add remaining content
        if current_section:
            text = ' '.join(current_section)
            if text:
                elements.append(Paragraph(text, normal_style))
        
        elements.append(Spacer(1, 0.3*inch))
        elements.append(PageBreak())
        
        # Appointment Status Breakdown
        if appointments_by_status:
            elements.append(Paragraph("Appointment Status Breakdown", heading_style))
            status_data = [['Status', 'Count']]
            for item in appointments_by_status:
                status_data.append([item.get('name', 'Unknown'), str(item.get('value', 0))])
            
            status_table = Table(status_data, colWidths=[4*inch, 2*inch])
            status_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 11),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
            ]))
            elements.append(status_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Footer
        elements.append(Spacer(1, 0.5*inch))
        elements.append(Paragraph("Report Generated by AI Analytics System", meta_style))
        elements.append(Paragraph("This report contains confidential practice analytics data.", meta_style))
        
        # Build PDF
        doc.build(elements)
        
        # Get PDF data
        pdf_data = buffer.getvalue()
        buffer.close()
        
        # Return PDF as base64 encoded string
        import base64
        pdf_base64 = base64.b64encode(pdf_data).decode('utf-8')
        
        return jsonify({
            'success': True,
            'report': pdf_base64,
            'format': 'pdf'
        }), 200
        
    except Exception as e:
        logger.error(f"Error generating AI report: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to generate AI report: {str(e)}'
        }), 500

@doctors_bp.route('/doctors/me', methods=['GET'])
@require_jwt
def get_current_doctor():
    """Get doctor information for the currently logged-in user"""
    try:
        user_email = g.user_email
        
        # Try to find doctor by email (assuming doctors table has email or is linked to users)
        # First, try to find user_id from email
        user_result = db.session.execute(
            db.text("SELECT id FROM users WHERE email = :email"),
            {"email": user_email}
        ).fetchone()
        
        if not user_result:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
        
        # Try to find doctor by email (case-insensitive, joined via users)
        doctor_result = db.session.execute(
            db.text("""
                SELECT 
                    d.doctor_id,
                    d.first_name,
                    d.last_name,
                    d.qualification,
                    d.experience_years,
                    d.consultation_fee,
                    d.bio,
                    s.name as specialty_name,
                    s.specialty_id,
                    (
                        SELECT f.name FROM doctor_facilities df
                        JOIN facilities f ON f.facility_id = df.facility_id
                        WHERE df.doctor_id = d.doctor_id AND df.is_active = TRUE
                        ORDER BY df.is_primary DESC, f.name ASC
                        LIMIT 1
                    ) AS facility_name
                FROM doctors d
                LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
                INNER JOIN users u ON LOWER(TRIM(d.email)) = LOWER(TRIM(u.email))
                WHERE u.id = :user_id AND d.is_active = TRUE
                LIMIT 1
            """),
            {"user_id": user_result[0]}
        ).fetchone()

        if not doctor_result:
            doctor_result = db.session.execute(
                db.text("""
                    SELECT 
                        d.doctor_id,
                        d.first_name,
                        d.last_name,
                        d.qualification,
                        d.experience_years,
                        d.consultation_fee,
                        d.bio,
                        s.name as specialty_name,
                        s.specialty_id,
                        (
                            SELECT f.name FROM doctor_facilities df
                            JOIN facilities f ON f.facility_id = df.facility_id
                            WHERE df.doctor_id = d.doctor_id AND df.is_active = TRUE
                            ORDER BY df.is_primary DESC, f.name ASC
                            LIMIT 1
                        ) AS facility_name
                    FROM doctors d
                    LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
                    WHERE LOWER(TRIM(d.email)) = LOWER(TRIM(:email)) AND d.is_active = TRUE
                    LIMIT 1
                """),
                {"email": user_email}
            ).fetchone()
        
        if not doctor_result:
            # If no doctor found, return empty (doctor can manually enter info)
            return jsonify({
                'success': True,
                'doctor': None,
                'message': 'No doctor profile found for this user'
            }), 200
        
        doctor = dict(doctor_result._mapping) if hasattr(doctor_result, '_mapping') else dict(zip(doctor_result.keys(), doctor_result))
        
        # Try to get license number if available (might be in a separate table or field)
        # For now, we'll return what we have
        
        return jsonify({
            'success': True,
            'doctor': doctor
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching current doctor: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch doctor information: {str(e)}'
        }), 500

