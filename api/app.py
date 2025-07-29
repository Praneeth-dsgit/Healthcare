from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import os
import time
import logging
import traceback
import requests
from pathlib import Path
from dotenv import load_dotenv
import json
import openai
import fitz  # PyMuPDF
from PIL import Image
import io
import base64
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import random
import smtplib
from email.mime.text import MIMEText
import pymysql

# Import Pydantic validation utilities
from validation_utils import validate_request, validate_response, handle_validation_errors, validate_patient_info, validate_file_upload_data, create_error_response, create_success_response
from models import ChatRequest, PatientInfo, UserSignup, UserLogin, OTPVerification, AppointmentReminder, NotificationRequest, HealthCheck, CapabilityType
from context_manager import context_manager

# Load environment variables
load_dotenv()

# Configure logging first, before any other operations
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configure CORS
CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173').split(',')
CORS(app, resources={
    r"/api/*": {
        "origins": CORS_ORIGINS,
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Security headers
@app.after_request
def add_security_headers(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

# OpenAI Configuration
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY not found in environment variables")
    exit(1)

openai.api_key = OPENAI_API_KEY

# Load your diseases JSON file
with open('med_cond_knw_base.json', encoding='utf-8') as f:
    diseases = json.load(f)

def detect_query_type(query):
    """
    Classifies the query into specific medical contexts using semantic analysis.
    Returns: 'diagnosis', 'treatment', 'lab', 'chronic', 'emergency', 'general'
    """
    try:
        # Use GPT for semantic classification
        classification_prompt = f"""Classify the following medical query into ONE of these categories based on its semantic meaning:

Categories:
- diagnosis: Questions about identifying diseases, conditions, symptoms, or differential diagnosis
- treatment: Questions about therapies, medications, procedures, or management approaches  
- lab: Questions about laboratory tests, results, values, or interpretations
- chronic: Questions about long-term conditions, ongoing management, or chronic diseases
- emergency: Questions about urgent situations, acute conditions, or emergency care
- general: General medical questions that don't fit other categories

Query: "{query}"

Respond with only the category name (one word)."""

        response = openai.ChatCompletion.create(
            model="gpt-4.1",
            messages=[{"role": "user", "content": classification_prompt}],
            max_tokens=20,
            temperature=0.3
        )
        
        result = response.choices[0].message['content'].strip().lower()
        
        # Validate the result
        valid_types = ['diagnosis', 'treatment', 'lab', 'chronic', 'emergency', 'general']
        if result in valid_types:
            return result
        else:
            return 'general'  # Default fallback
            
    except Exception as e:
        logger.warning(f"Error in semantic query classification: {e}")
        # Fallback to simple keyword matching if GPT fails
        q = query.lower()
        if any(word in q for word in ['diagnosis', 'symptom', 'pain', 'cause']):
            return 'diagnosis'
        elif any(word in q for word in ['treatment', 'therapy', 'manage', 'cure']):
            return 'treatment'
        elif any(word in q for word in ['lab', 'test', 'blood', 'result']):
            return 'lab'
        elif any(word in q for word in ['chronic', 'long-term']):
            return 'chronic'
        elif any(word in q for word in ['emergency', 'urgent', 'acute']):
            return 'emergency'
        else:
            return 'general'

def is_query_relevant_to_capability(query, capability):
    """Check if query is semantically relevant to the selected capability"""
    
    # Handle unknown capabilities
    if capability not in ['radiology', 'lab', 'general']:
        return True  # Default to allowing if capability not recognized
    
    try:
        # Define capability descriptions for semantic matching
        capability_descriptions = {
            'radiology': "medical imaging, X-rays, CT scans, MRI, ultrasound, radiological interpretation, imaging studies, scans, radiography, medical images",
            'lab': "laboratory tests, blood tests, lab results, laboratory values, diagnostic testing, lab interpretation, pathology, clinical chemistry, hematology",
            'general': "general medical questions, symptoms, treatments, medications, health advice, medical conditions, patient care, clinical medicine"
        }
        
        # Use GPT for semantic relevance assessment
        relevance_prompt = f"""Determine if the following medical query is semantically relevant to the specified medical capability.

Medical Capability: {capability}
Capability Description: {capability_descriptions[capability]}

Query: "{query}"

Consider the semantic meaning and context, not just keywords. A query is relevant if it relates to the core concepts and practices of the specified capability.

Examples of relevance:
- For radiology: "What does this shadow mean?" (about medical imaging)
- For lab: "My values seem high" (about test results)  
- For general: "I have a headache" (general medical concern)

Respond with only "relevant" or "not_relevant"."""

        response = openai.ChatCompletion.create(
            model="gpt-4.1",
            messages=[{"role": "user", "content": relevance_prompt}],
            max_tokens=10,
            temperature=0.1
        )
        
        result = response.choices[0].message['content'].strip().lower()
        return result == "relevant"
        
    except Exception as e:
        logger.warning(f"Error in semantic relevance assessment: {e}")
        
        # Fallback to simplified keyword matching if GPT fails
        query_lower = query.lower()
        fallback_keywords = {
            'radiology': ['x-ray', 'ct', 'mri', 'scan', 'imaging', 'image', 'shadow', 'opacity', 'enhancement', 'radiological'],
            'lab': ['lab', 'blood', 'test', 'result', 'value', 'levels', 'count', 'chemistry', 'panel', 'culture'],
            'general': ['symptom', 'pain', 'treatment', 'medication', 'health', 'condition', 'disease', 'therapy']
        }
        
        keywords = fallback_keywords.get(capability, [])
        return any(keyword in query_lower for keyword in keywords)

def generate_capability_prompt(query, capability, patient_info=None, file_context=None, file_findings=None, previous_ai_message=None, reset_message=None):
    """Generate prompts based on selected capability with strict enforcement"""
    
    if reset_message:
        polite_responses = {
            "thank you": "You're welcome! If you have more questions, feel free to ask.",
            "thanks": "You're welcome! Let me know if you need anything else.",
            "bye": "Goodbye! Take care.",
            "see you": "See you! Stay healthy.",
            "leave it": "Okay, let me know if you need anything else.",
            "ok": "Alright! Let me know if you need anything else.",
            "okay": "Alright! Let me know if you need anything else.",
            "cancel": "Okay, let me know if you need anything else.",
            "ignore": "Okay, let me know if you need anything else.",
            "new topic": "Sure! Please tell me your new question or topic.",
            "start over": "Sure! Please tell me your new question or topic.",
            "that's all": "Thank you for your message! Let me know if you need further assistance.",
            "thats good": "Thank you for your message! Let me know if you need further assistance.",
            "thats good enough": "Thank you for your message! Let me know if you need further assistance.",
        }
        return polite_responses.get(reset_message, "Thank you for your message! Let me know if you need further assistance.")

    # Check query relevance to capability
    if not is_query_relevant_to_capability(query, capability):
        capability_responses = {
            'radiology': "I'm specialized in radiology and medical imaging. Please ask questions related to X-rays, CT scans, MRI, ultrasound, or medical image interpretation. For general medical questions, please switch to General Medical Assistance mode.",
            'lab': "I'm specialized in laboratory medicine and test interpretation. Please ask questions about blood tests, lab results, laboratory values, or diagnostic testing. For general medical questions, please switch to General Medical Assistance mode.",
            'general': "I'm in General Medical Assistance mode. I can help with general medical questions, symptoms, treatments, and health advice. For specialized radiology or lab questions, please switch to the appropriate mode."
        }
        return capability_responses.get(capability, "Please ask questions related to your selected assistance mode.")

    # Build capability-optimized patient context
    def build_patient_context(patient_info, capability):
        if not patient_info:
            return "Not provided"
        
        # Extract available information
        age = patient_info.get('age', 0)
        weight = patient_info.get('weight', 0)
        height = patient_info.get('height', 0)
        gender = patient_info.get('gender', '')
        bp = patient_info.get('bloodPressure', '')
        allergies = patient_info.get('allergies', '')
        medications = patient_info.get('medications', '')
        history = patient_info.get('medicalHistory', '')
        
        # Calculate BMI if possible
        bmi = None
        if weight > 0 and height > 0:
            bmi = weight / ((height / 100) ** 2)
        
        # Build capability-specific context
        if capability == 'radiology':
            context = f"PATIENT DEMOGRAPHICS FOR IMAGING INTERPRETATION:\n"
            if age > 0:
                context += f"- Age: {age} years (consider age-related imaging variations)\n"
            if gender:
                context += f"- Gender: {gender} (consider gender-specific anatomical differences)\n"
            if weight > 0:
                context += f"- Weight: {weight} kg (consider for contrast dosing and image quality)\n"
            if bmi:
                bmi_category = "underweight" if bmi < 18.5 else "normal" if bmi < 25 else "overweight" if bmi < 30 else "obese"
                context += f"- BMI: {bmi:.1f} ({bmi_category} - affects image quality and technique)\n"
            if history:
                context += f"- Relevant Medical History: {history} (consider for differential diagnosis)\n"
            if medications:
                context += f"- Current Medications: {medications} (consider drug-related imaging findings)\n"
            
            # Add age-specific imaging considerations
            if age > 0:
                if age < 18:
                    context += "- PEDIATRIC PATIENT: Use pediatric normal variants and radiation safety protocols\n"
                elif age > 65:
                    context += "- ELDERLY PATIENT: Consider age-related degenerative changes and osteoporosis\n"
                    
        elif capability == 'lab':
            context = f"PATIENT DEMOGRAPHICS FOR LABORATORY INTERPRETATION:\n"
            if age > 0:
                context += f"- Age: {age} years (use age-specific reference ranges)\n"
            if gender:
                context += f"- Gender: {gender} (apply gender-specific reference ranges)\n"
            if weight > 0:
                context += f"- Weight: {weight} kg (consider for creatinine clearance calculations)\n"
            if bmi:
                context += f"- BMI: {bmi:.1f} (relevant for metabolic parameters)\n"
            if medications:
                context += f"- Current Medications: {medications} (check for drug interference and therapeutic monitoring)\n"
            if history:
                context += f"- Medical History: {history} (consider disease-specific lab patterns)\n"
            if allergies:
                context += f"- Allergies: {allergies} (relevant for medication recommendations)\n"
            
            # Add age and gender-specific lab considerations
            if age > 0 and gender:
                if age < 18:
                    context += "- PEDIATRIC: Use pediatric reference ranges and consider growth-related changes\n"
                elif gender.lower() == 'female' and 15 <= age <= 50:
                    context += "- REPRODUCTIVE AGE FEMALE: Consider menstrual cycle effects and pregnancy possibility\n"
                elif age > 65:
                    context += "- ELDERLY: Consider age-related changes in kidney/liver function\n"
                    
        else:  # general
            context = f"COMPREHENSIVE PATIENT PROFILE:\n"
            if age > 0:
                context += f"- Age: {age} years\n"
            if gender:
                context += f"- Gender: {gender}\n"
            if weight > 0:
                context += f"- Weight: {weight} kg\n"
            if height > 0:
                context += f"- Height: {height} cm\n"
            if bmi:
                bmi_category = "underweight" if bmi < 18.5 else "normal weight" if bmi < 25 else "overweight" if bmi < 30 else "obese"
                context += f"- BMI: {bmi:.1f} ({bmi_category})\n"
            if bp:
                context += f"- Blood Pressure: {bp}\n"
            if allergies:
                context += f"- Known Allergies: {allergies}\n"
            if medications:
                context += f"- Current Medications: {medications}\n"
            if history:
                context += f"- Medical History: {history}\n"
                
            # Add risk factors and considerations
            if age > 0:
                if age < 18:
                    context += "- PEDIATRIC CONSIDERATIONS: Growth, development, and family history important\n"
                elif age > 65:
                    context += "- GERIATRIC CONSIDERATIONS: Polypharmacy, cognitive function, and frailty assessment\n"
            
            if bmi and bmi >= 30:
                context += "- OBESITY ALERT: Increased risk for diabetes, cardiovascular disease, sleep apnea\n"
                
        return context if context != f"{'PATIENT DEMOGRAPHICS FOR IMAGING INTERPRETATION:' if capability == 'radiology' else 'PATIENT DEMOGRAPHICS FOR LABORATORY INTERPRETATION:' if capability == 'lab' else 'COMPREHENSIVE PATIENT PROFILE:'}\n" else "Patient information not provided"
    
    patient_context = build_patient_context(patient_info, capability)

    # Add file_findings to the prompt
    if file_findings:
        file_section = f"\n\n[File Findings / Uploaded File Analysis]\n{file_findings}\n"
    else:
        file_section = ""

    # Prepend previous_ai_message to the prompt if present
    if previous_ai_message:
        previous_section = f"\n[Previous AI Findings or Context]\n{previous_ai_message}\n"
    else:
        previous_section = ""

    # Capability-specific prompts with strict enforcement
    if capability == 'general':
        # Detect query type for better response structure
        query_type = detect_query_type(query)
        
        prompt = f"""You are a STRICTLY GENERAL MEDICAL healthcare assistant designed to support medical professionals.  
Respond ONLY to general medical queries involving symptoms, clinical diagnoses, treatment recommendations, medications, and overall health guidance.  
**CRITICAL INSTRUCTIONS:**  
- REFUSE to answer any radiology or imaging-related questions (interpretations, findings, recommendations).  
  - If asked, respond with: "This question requires specialized expertise. Please switch to Radiology mode for accurate interpretation."  
- REFUSE to answer any laboratory or lab result interpretation questions.  
  - If asked, respond with: "This question requires specialized expertise. Please switch to Lab mode for accurate interpretation."  
- If a question is ambiguous or includes labs/imaging, clarify and redirect as appropriate before proceeding.  
- Remain within the scope of general medical clinical decision-making ONLY.

IF patient_info is provided, use it to personalize the response.
**PATIENT-SPECIFIC ANALYSIS:**
Comprehensively incorporate patient-specific factors:  
- Age, gender, BMI, and medical history to personalize recommendations  
- Adjust diseases considered and treatments recommended based on patient demographics (e.g., pediatric, elderly, gender-specific conditions)  
- Factor in risk of or actual drug-drug interactions and contraindications according to medication history and known allergies  
- Adjust diagnostic reasoning and risk stratification for pre-existing conditions and risk factors  
- Keep all recommendations tailored to the patient’s profile.

Patient Context:
{patient_context}

General Medical Query:
{query}

**RESPONSE FRAMEWORK:**  

**FORMATTING REQUIREMENTS:**
If needed, use the following formatting at the beginning of each section requirements to make the response more readable and organized:
• Use **emojis** to make the response more engaging and professional.
• Use **bullet points** to make the response more readable and organized
• Use **numbered lists** to make the response more readable and organized  
• Use **tables** to make the response more readable and organized
• Use **bold and italic text** to make the response more readable and organized
• Use **line breaks** to make the response more readable and organized.

f"Structure your response based on the query type: {query_type}"

**DIAGNOSIS** (for diagnosis-related queries):
- Possible Diagnoses: List 2-3 most likely conditions
- Differential Diagnoses: Include 3-5 alternative possibilities
- Supporting Symptoms/Signs: Key clinical indicators
- Red Flags: Warning signs requiring immediate attention
- Recommended Next Steps: Specific diagnostic workup
- Recommend which department/specialist to consult.

**TREATMENT** (for treatment-related queries):
- First-Line Treatment: Evidence-based primary approach
- Alternative Options: Second-line or adjunctive therapies
- Medications: Specific dosing, duration, monitoring
- Lifestyle Modifications: Diet, exercise, behavioral changes
- Monitoring & Follow-up: Assessment schedule and parameters
- Also recommend which department/specialist to consult.

**LAB** (for laboratory-related queries):
- Test Purpose: Clinical indication and utility
- Normal Ranges: Age/gender-specific reference values
- Interpretation: Clinical significance of results
- Follow-up Testing: Additional diagnostic workup if needed
- Patient Counseling: Education about results

**CHRONIC** (for chronic disease management):
- Condition Overview: Disease progression and prognosis
- Long-Term Management: Ongoing care strategies
- Lifestyle Modifications: Sustainable behavioral changes
- Medication Management: Long-term pharmacotherapy
- Follow-Up Schedule: Regular monitoring intervals
- Recommend which department/specialist to consult.

**EMERGENCY** (for urgent/acute situations):
- Immediate Assessment: ABCDE approach
- Critical Actions: Time-sensitive interventions
- Red Flag Symptoms: Signs requiring emergency care
- Stabilization Steps: First aid and supportive care
- Disposition: When to call EMS or seek immediate care
- Recommend which department/specialist to consult.

**GENERAL** (for general health questions):
- Key Concepts: Essential information summary
- Practical Guidance: Actionable recommendations
- Related Topics: Additional areas to consider
- Patient Education: Important points for counseling
- Recommend which department/specialist to consult.
   
**CLINICAL REASONING FRAMEWORK:**

1. **Patient-Specific Analysis:**
   - Age/Gender Considerations: How demographics affect diagnosis and treatment
   - Risk Factor Assessment: BMI, medical history, medications, allergies
   - Comorbidity Impact: How existing conditions modify approach
   - Medication Interactions: Drug-drug and drug-disease interactions

2. **Differential Diagnosis:**
   - Primary Considerations: Most likely diagnoses based on presentation
   - Alternative Diagnoses: Important differentials to rule out
   - Red Flags: Signs requiring immediate attention or referral
   - Risk Stratification: Low/medium/high risk assessment

3. **Evidence-Based Recommendations:**
   - First-Line Approach: Standard of care recommendations
   - Alternative Options: When first-line isn't appropriate
   - Monitoring Parameters: What to watch and when
   - Follow-up Plan: Timeline for reassessment

4. **Patient Education Points:**
   - Key Messages: Essential information for patient counseling
   - Warning Signs: When to seek immediate care
   - Lifestyle Modifications: Behavioral changes and self-care
        - Medication Instructions: Dosing, timing, side effects

**STRICT RULES & SAFETY PROTOCOLS:** 
- Limit response to a MAXIMUM of 200 words for comprehensive coverage
- Pause between each step of the response
- If a query REQUIRES radiology or laboratory interpretation, do NOT answer it. Instead, state:  
  "This question requires specialized expertise. Please switch to [Radiology/Lab] mode for accurate interpretation."  
- For emergency situations, ALWAYS emphasize when immediate medical attention is required
- Include appropriate disclaimers for off-label medication use or experimental treatments
- Audience: Healthcare professionals ONLY
- Always consider patient safety first - when in doubt, recommend consultation with specialist

**FINAL INSTRUCTIONS:**
- Use clear, professional medical language
- Prioritize patient safety and evidence-based practice
- Include appropriate disclaimers when necessary
- Keep responses focused, actionable, and clinically relevant
- Always consider the patient's specific context and risk factors
"""
        
    elif capability == 'radiology':
        prompt = f"""You are a STRICTLY SPECIALIZED RADIOLOGY assistant for healthcare professionals.

CRITICAL INSTRUCTIONS:
- ONLY respond to radiology and medical imaging questions
- REFUSE general medical questions - redirect to general mode
- REFUSE lab interpretation questions - redirect to lab mode
- Focus EXCLUSIVELY on imaging: X-ray, CT, MRI, ultrasound, mammography, nuclear medicine

{patient_context}

Radiology/Imaging Query:
{query}

**RESPONSE FRAMEWORK:**

**FORMATTING REQUIREMENTS:**
If needed, use the following formatting at the beginning of each section requirements to make the response more readable and organized:
• Use **emojis** to make the response more engaging and professional.
• Use **bullet points** to make the response more readable and organized
• Use **numbered lists** to make the response more readable and organized  
• Use **tables** to make the response more readable and organized
• Use **bold and italic text** to make the response more readable and organized
• Use **line breaks** to make the response more readable and organized.

MANDATORY PATIENT-CONTEXTUALIZED IMAGING INTERPRETATION:
- Integrate patient age, gender, and medical history into radiological analysis
- Consider age-specific normal variants and pathological changes
- Factor in gender-specific anatomical differences and disease patterns
- Use BMI information for image quality assessment and technique optimization
- Correlate imaging findings with known medical history and medications

MANDATORY Structured Reporting Format:
1. TECHNIQUE/QUALITY: Image acquisition details, quality assessment, patient factors affecting imaging
2. PATIENT CONTEXT: Age, gender, BMI considerations for interpretation
3. FINDINGS: Systematic description with age/gender-appropriate normal variants
4. CLINICAL CORRELATION: Integration with patient medical history and demographics
5. IMPRESSION: Age and gender-contextualized radiological interpretation
6. DIFFERENTIAL: Imaging-based differential adjusted for patient demographics
7. RECOMMENDATIONS: Patient-specific additional imaging or clinical correlation
8. CRITICAL FINDINGS: Urgent findings with age-appropriate severity assessment

Patient-Specific Considerations:
- PEDIATRIC (age <18): Use pediatric normal variants, consider radiation dose optimization
- ELDERLY (age >65): Expect age-related degenerative changes, increased fracture risk
- FEMALE REPRODUCTIVE AGE: Consider pregnancy, hormonal influences on imaging
- OBESITY (BMI >30): Adjust for image quality limitations, increased radiation requirements
- MEDICATION EFFECTS: Consider drug-related imaging changes from patient's current medications

Radiological Standards:
- Use precise radiological terminology contextualized for patient age/gender
- Reference anatomical landmarks with age-appropriate measurements
- Describe density, enhancement patterns with patient-specific considerations
- Follow ACR/ESR/IRIA reporting guidelines with demographic modifications
- Limit to 400 words

**STRICT RULES & SAFETY PROTOCOLS:** 
- Limit response to a MAXIMUM of 200 words for comprehensive coverage
- Pause between each step of the response
- Include appropriate disclaimers for off-label medication use or experimental treatments
- Audience: Healthcare professionals ONLY
- Always consider patient safety first - when in doubt, recommend consultation with specialist

STRICT RULE: If this query is NOT about medical imaging, respond with: "I specialize in radiology and medical imaging only. Please switch to General Medical or Lab mode for this question."

Professional Focus: Board-certified radiologist with patient-specific interpretation expertise."""

    elif capability == 'lab':
        prompt = f"""You are a STRICTLY SPECIALIZED LABORATORY MEDICINE expert for healthcare professionals.

CRITICAL INSTRUCTIONS:
- ONLY respond to laboratory medicine and diagnostic testing questions
- REFUSE general medical questions - redirect to general mode
- REFUSE imaging questions - redirect to radiology mode
- Focus EXCLUSIVELY on: blood tests, chemistry panels, hematology, microbiology, molecular diagnostics

{patient_context}

Laboratory Medicine Query:
{query}

**FORMATTING REQUIREMENTS:**
If needed, use the following formatting at the beginning of each section requirements to make the response more readable and organized:
• Use **emojis** to make the response more engaging and professional.
• Use **bullet points** to make the response more readable and organized
• Use **numbered lists** to make the response more readable and organized  
• Use **tables** to make the response more readable and organized
• Use **bold and italic text** to make the response more readable and organized
• Use **line breaks** to make the response more readable and organized.

**RESPONSE FRAMEWORK:**
MANDATORY PATIENT-CONTEXTUALIZED LABORATORY INTERPRETATION:
- Apply age and gender-specific reference ranges for all laboratory values
- Consider patient weight for creatinine clearance and drug dosing calculations
- Factor in current medications for therapeutic drug monitoring and interference
- Integrate medical history for disease-specific laboratory patterns
- Account for BMI in metabolic parameter interpretation (glucose, lipids, liver function)

MANDATORY Laboratory Analysis Format:
1. PATIENT-SPECIFIC REFERENCE RANGES: Age, gender, and population-adjusted normal values
2. DEMOGRAPHIC CONSIDERATIONS: How age, gender, BMI affect result interpretation
3. MEDICATION ANALYSIS: Current drugs affecting test results or requiring monitoring
4. RESULT INTERPRETATION: Clinical meaning adjusted for patient demographics
5. DIFFERENTIAL CAUSES: Etiologies prioritized by age, gender, and medical history
6. RISK STRATIFICATION: Patient-specific risk assessment based on demographics
7. FOLLOW-UP TESTING: Additional tests tailored to patient profile
8. CRITICAL VALUES: Age-adjusted critical thresholds and clinical urgency
9. CLINICAL CORRELATION: Integration with patient's complete clinical picture

Patient-Specific Laboratory Considerations:
- PEDIATRIC (age <18): Use pediatric reference ranges, consider growth and development
- FEMALE REPRODUCTIVE AGE (15-50): Consider menstrual cycle, pregnancy effects
- ELDERLY (age >65): Adjust for age-related organ function decline
- OBESITY (BMI >30): Consider metabolic syndrome markers, insulin resistance
- MEDICATION INTERACTIONS: Screen current medications for lab test interference
- KIDNEY FUNCTION: Adjust interpretation based on age, gender, weight for eGFR

Laboratory Standards:
- Reference CLSI guidelines with demographic-specific modifications
- Include pre-analytical considerations specific to patient characteristics
- Address analytical interferences from patient medications
- Specify age and gender-adjusted critical value thresholds
- Consider population and demographic-specific reference ranges
- Limit to 400 words

**STRICT RULES & SAFETY PROTOCOLS:** 
- Limit response to a MAXIMUM of 200 words for comprehensive coverage
- Pause between each step of the response
- Include appropriate disclaimers for off-label medication use or experimental treatments
- Audience: Healthcare professionals ONLY
- Always consider patient safety first - when in doubt, recommend consultation with specialist
STRICT RULE: If this query is NOT about laboratory testing or result interpretation, respond with: "I specialize in laboratory medicine only. Please switch to General Medical or Radiology mode for this question."

Expert Level: Clinical pathologist with patient-contextualized interpretation expertise."""

    else:
        # Default fallback
        prompt = f"""You are a healthcare assistant with limited scope.

Query: {query}

**FORMATTING REQUIREMENTS:**
If needed, use the following formatting at the beginning of each section requirements to make the response more readable and organized:
• Use **emojis** to make the response more engaging and professional.
• Use **bullet points** to make the response more readable and organized
• Use **numbered lists** to make the response more readable and organized  
• Use **tables** to make the response more readable and organized
• Use **bold and italic text** to make the response more readable and organized
• Use **line breaks** to make the response more readable and organized.

**RESPONSE FRAMEWORK:**
I can only provide general guidance. For specialized assistance, please select an appropriate capability mode:
- General Medical Assistance for symptoms, treatments, and general health
- Radiology Assistance for medical imaging interpretation  
- Lab Interpretation for laboratory result analysis

Please switch to the appropriate mode for detailed, expert-level assistance.

**STRICT RULES & SAFETY PROTOCOLS:** 
- Limit response to a MAXIMUM of 200 words for comprehensive coverage
- Pause between each step of the response
- Include appropriate disclaimers for off-label medication use or experimental treatments
- Audience: Healthcare professionals ONLY
- Always consider patient safety first - when in doubt, recommend consultation with specialist
"""

    return previous_section + prompt + file_section

@app.route('/api/chat/stream', methods=['POST'])
@validate_request(ChatRequest)
def chat_stream():
    try:
        logger.info("\n=== Starting new chat stream ===")
        
        # Get validated data from decorator
        chat_request = request.validated_data
        
        user_message = chat_request.message
        patient_info = chat_request.patient_info
        file_context = chat_request.file_context
        file_findings = chat_request.file_findings
        previous_ai_message = chat_request.previous_ai_message
        reset_message = chat_request.reset_message
        capability = chat_request.capability
        session_id = chat_request.session_id or "default_session"
        
        logger.info(f"Processing message: '{user_message}' with capability: {capability}, session: {session_id}")

        # Update context manager with current state
        if patient_info:
            context_manager.update_patient_context(session_id, patient_info)
        context_manager.update_capability_context(session_id, capability)
        
        # Handle context reset
        if reset_message:
            context_manager.clear_context(session_id)
            logger.info(f"Context reset for session {session_id}")
            return jsonify({"message": "Context cleared. Starting fresh conversation."})

        def generate():
            try:
                # Generate context-aware prompt
                prompt, context_metadata = context_manager.generate_contextual_prompt(
                    session_id, user_message, capability
                )
                
                logger.info(f"Generated context-aware prompt for {capability} capability")
                logger.info(f"Context type: {context_metadata.get('context_type', 'unknown')}")
                
                # Use OpenAI streaming
                response = openai.ChatCompletion.create(
                    model="gpt-4",
                    messages=[
                        {"role": "system", "content": "You are a helpful medical assistant."},
                        {"role": "user", "content": prompt}
                    ],
                    stream=True,
                    max_tokens=512,
                    temperature=0.7
                )
                
                ai_response_parts = []
                
                for chunk in response:
                    if 'choices' in chunk and len(chunk['choices']) > 0:
                        delta = chunk['choices'][0].get('delta', {})
                        if 'content' in delta:
                            content = delta['content']
                            ai_response_parts.append(content)
                            # Process the chunk to ensure proper line breaks
                            content = content.replace('\n', '\\n')
                            yield f"data: {content}\n\n"
                
                # Store conversation turn in context manager
                ai_response = ''.join(ai_response_parts)
                context_manager.add_conversation_turn(
                    session_id, user_message, ai_response, capability, context_metadata
                )
                            
                logger.info("\n=== Stream completed ===")
                        
            except Exception as e:
                error_msg = f"Streaming error: {str(e)}\n{traceback.format_exc()}"
                logger.error(error_msg)
                yield f"data: [ERROR] {str(e)}\n\n"
        
        response = Response(generate(), mimetype='text/event-stream')
        response.headers['Cache-Control'] = 'no-cache'
        response.headers['X-Accel-Buffering'] = 'no'
        return response
        
    except Exception as e:
        error_msg = f"Stream endpoint error: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/health', methods=['GET'])
@validate_response(HealthCheck)
def health_check():
    try:
        # Test OpenAI connection
        openai.Model.list()
        status = "healthy"
    except:
        status = "degraded"
    
    logger.info(f"Health check - Status: {status}")
    return HealthCheck(
        status=status,
        version="2.0.0",
        uptime=time.time()  # You might want to track actual uptime
    )

@app.route('/api/context/analyze', methods=['POST'])
def analyze_context():
    """Analyze context relevance for a query"""
    try:
        data = request.get_json()
        session_id = data.get('session_id', 'default_session')
        query = data.get('query', '')
        
        if not query:
            return jsonify({"error": "Query is required"}), 400
        
        # Analyze context relevance
        analysis = context_manager.analyze_context_relevance(session_id, query)
        
        # Get context summary
        context_summary = context_manager.get_context_summary(session_id)
        
        return jsonify({
            "analysis": analysis,
            "context_summary": context_summary,
            "session_id": session_id
        })
        
    except Exception as e:
        logger.error(f"Context analysis error: {e}")
        return jsonify({"error": "Context analysis failed"}), 500

@app.route('/api/context/summary/<session_id>', methods=['GET'])
def get_context_summary(session_id):
    """Get context summary for a session"""
    try:
        summary = context_manager.get_context_summary(session_id)
        return jsonify(summary)
    except Exception as e:
        logger.error(f"Context summary error: {e}")
        return jsonify({"error": "Failed to get context summary"}), 500

@app.route('/api/context/clear/<session_id>', methods=['POST'])
def clear_context(session_id):
    """Clear context for a session"""
    try:
        context_manager.clear_context(session_id)
        return jsonify({"message": f"Context cleared for session {session_id}"})
    except Exception as e:
        logger.error(f"Context clear error: {e}")
        return jsonify({"error": "Failed to clear context"}), 500

@app.route('/api/context/tokens/<session_id>', methods=['GET'])
def get_token_usage(session_id):
    """Get token usage summary for a session"""
    try:
        token_summary = context_manager.get_token_usage_summary(session_id)
        return jsonify(token_summary)
    except Exception as e:
        logger.error(f"Token usage error: {e}")
        return jsonify({"error": "Failed to get token usage"}), 500

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Ensure upload directory is writable
if not os.access(UPLOAD_FOLDER, os.W_OK):
    logger.error(f"Upload directory {UPLOAD_FOLDER} is not writable")
    raise RuntimeError(f"Upload directory {UPLOAD_FOLDER} is not writable")

logger.info(f"Upload directory configured: {UPLOAD_FOLDER}")

MAX_CHARS = 12000  # ~4000 tokens, safe for prompt + response

# Helper: Call OpenAI Vision API for image interpretation
def interpret_image_with_openai(image_bytes, image_format="png", capability="general"):
    """Interpret images based on selected capability with strict enforcement"""
    
    # Set appropriate prompt based on capability
    if capability == 'radiology':
        prompt = (
            """You are a SPECIALIZED RADIOLOGY AI assistant. Analyze the provided medical image STRICTLY from a radiological perspective and generate a detailed structured report.  
Follow the mandatory reporting structure below. Adhere fully to radiological terminology, reference standard classifications, and focus exclusively on imaging findings, NOT clinical management. Refuse to provide general medical advice, stating: "Clinical correlation and management should be discussed with the ordering physician."  
Use precise, concise language and report findings and measurements in standard radiological units (e.g., Hounsfield units [HU], millimeters [mm]).

MANDATORY STRUCTURED RADIOLOGY REPORT (Sections and Content):

1. TECHNIQUE:  
   - Specify the imaging modality (CT, MRI, X-ray, US, etc.), projection/sequence, and contrast use where appropriate.

2. COMPARISON:  
   - State if any prior studies are available for comparison.

3. FINDINGS:  
   - Systematic, detailed radiological description:  
     • List all anatomical structures visible.  
     • Describe normal radiological anatomy.  
     • Note all abnormal findings with precise measurements and localization.  
     • Include density/signal characteristics as appropriate.  

4. IMPRESSION:  
   - Concise radiological interpretation summarizing main findings, using standard classification systems (e.g., BI-RADS, Fleischner criteria) if applicable.

5. RECOMMENDATIONS:  
   - Suggest any further imaging, follow-up studies, or clinical correlation with justification.  
   - DO NOT provide or speculate on general medical management (“Clinical correlation and management should be discussed with the ordering physician.”).

CRITICAL RULES:
- Use ONLY proper radiological terminology.  
- Reference standard radiological classifications where applicable.  
- Report all measurements in standard units (HU, mm, etc.).  
- Identify and highlight any urgent/radiologically critical findings.  
- Maintain radiology-only scope. Reject requests for general advice or non-radiological interpretation, stating: "Clinical correlation and management should be discussed with the ordering physician."

OUTPUT FORMAT:
- Produce your answer as a structured report with clearly labeled sections as numbered above.
- Response should be in well-organized English prose, with bulleted subitems when appropriate.
- Do NOT include extraneous commentary or any clinical management recommendation.

EXAMPLES:

Example 1 (for a CT chest with abnormal finding):

1. TECHNIQUE:  
Non-contrast chest CT, axial and coronal reconstructions.

2. COMPARISON:  
No prior studies available.

3. FINDINGS:  
- Visible anatomical structures: lungs, heart, mediastinum, bones.  
- Normal: Cardiac and mediastinal contours are within normal limits.  
- Abnormal: 2.1 cm spiculated nodule in the right upper lobe (posterior segment), attenuation 32 HU, no calcification. No evidence of lymphadenopathy or pleural effusion.

4. IMPRESSION:  
Solitary pulmonary nodule, right upper lobe, 2.1 cm, spiculated margins. Fleischner Society guidelines suggest additional imaging or tissue sampling due to size and appearance. No acute findings requiring immediate intervention.

5. RECOMMENDATIONS:  
Suggest PET-CT for further evaluation or tissue sampling as per current radiological guidelines.  
Clinical correlation and management should be discussed with the ordering physician.

Example 2 (for a mammogram):

1. TECHNIQUE:  
Digital mammography, craniocaudal and mediolateral oblique projections.

2. COMPARISON:  
Prior study from 2 years ago reviewed.

3. FINDINGS:  
- Well-visualized breast tissue and pectoralis muscles.  
- No suspicious calcifications.  
- 1.2 cm irregular density in upper outer quadrant, new compared to previous. No associated skin thickening.

4. IMPRESSION:  
New irregular mass, upper outer quadrant, likely suspicious for malignancy (BI-RADS 4).

5. RECOMMENDATIONS:  
Recommend targeted ultrasound and possible biopsy of the upper outer quadrant mass.  
Clinical correlation and management should be discussed with the ordering physician.

(For actual use, make reports longer and more detailed as appropriate for the image and findings.)

IMPORTANT INSTRUCTIONS AND OBJECTIVE REMINDER:  
Generate ONLY structured radiology reports as described, using strict radiological terminology, standard units, 
and classification systems where applicable. Do NOT provide general medical advice—always include the required refusal statement. Output should exactly follow the header and bullet/paragraph structure above.
        """)
    elif capability == 'lab':
        prompt = (
            "You are a LABORATORY MEDICINE AI assistant. Analyze this image from a laboratory medicine perspective.\n\n"
            "LABORATORY IMAGE ANALYSIS:\n"
            "1. IMAGE TYPE: Identify if this is a laboratory-related image (microscopy, lab equipment, etc.)\n"
            "2. LABORATORY CONTEXT: Describe any laboratory procedures or equipment visible\n"
            "3. CLINICAL RELEVANCE: Note any laboratory medicine implications\n"
            "4. RECOMMENDATIONS: Suggest appropriate laboratory testing if indicated\n\n"
            "If this is not a laboratory-related image, suggest switching to Radiology mode for medical imaging analysis."
        )
    else:  # general
        prompt = (
            "You are a GENERAL MEDICAL AI assistant. Analyze this medical image from a general healthcare perspective.\n\n"
            "GENERAL MEDICAL IMAGE ANALYSIS:\n"
            "1. IMAGE TYPE: Identify the type of medical image\n"
            "2. VISIBLE STRUCTURES: Describe anatomical structures visible\n"
            "3. GENERAL FINDINGS: Note any obvious medical findings\n"
            "4. CLINICAL CONTEXT: Provide general medical interpretation\n"
            "5. RECOMMENDATIONS: Suggest appropriate next steps\n\n"
            "For specialized radiological analysis, recommend switching to Radiology mode."
        )
    
    try:
        # Validate image_bytes is not None and is bytes
        if not image_bytes:
            raise ValueError("Image bytes are empty or None")
        
        if not isinstance(image_bytes, bytes):
            raise ValueError(f"Expected bytes, got {type(image_bytes)}")
        
        # Use the correct base64 prefix and decode as ascii
        image_base64 = image_bytes.decode("ascii")
        
        # Validate base64 string
        if not image_base64 or len(image_base64.strip()) == 0:
            raise ValueError("Base64 string is empty after decoding")
        
        # Validate image format
        valid_formats = ['png', 'jpeg', 'gif', 'bmp']
        if not image_format or image_format not in valid_formats:
            raise ValueError(f"Invalid image format: {image_format}. Must be one of: {valid_formats}")
        
        # Construct the base64 URL according to OpenAI's format
        image_url = f"data:image/{image_format};base64,{image_base64}"
        
        # Log for debugging (remove in production)
        logger.info(f"Processing image with format: {image_format}, base64 length: {len(image_base64)}")
        logger.info(f"Base64 starts with: {image_base64[:50]}...")
        logger.info(f"Base64 ends with: ...{image_base64[-20:]}")
        
        # Validate base64 string format (base64 can contain +, /, = characters)
        if not all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in image_base64):
            raise ValueError("Invalid base64 characters detected")
        
        # Ensure proper padding
        padding = len(image_base64) % 4
        if padding:
            image_base64 += '=' * (4 - padding)
        
        response = openai.ChatCompletion.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": image_url}}
                ]}
            ],
            max_tokens=512
        )
        return response.choices[0].message['content']
        
    except UnicodeDecodeError as e:
        logger.error(f"Base64 decode error: {e}")
        raise ValueError("Invalid base64 encoding in image data")
    except Exception as e:
        logger.error(f"Image processing error: {e}")
        raise

# Helper: Call OpenAI for PDF text interpretation
def interpret_text_with_openai(text, capability="general"):
    """Interpret text content based on selected capability with strict enforcement"""
    
    truncated = text[:MAX_CHARS]
    warning = "" if len(text) <= MAX_CHARS else "\n\n[Note: The document was too long and only the first part was analyzed.]"
    
    if capability == 'lab':
        prompt = (
            "You are a SPECIALIZED LABORATORY MEDICINE AI assistant. STRICTLY analyze this document as a laboratory report ONLY.\n\n"
            "MANDATORY LABORATORY ANALYSIS FORMAT:\n"
            "1. DOCUMENT TYPE: Confirm this is a laboratory report\n"
            "2. TEST OVERVIEW: List all tests performed\n"
            "3. REFERENCE RANGES: Note normal ranges provided\n"
            "4. ABNORMAL VALUES: Highlight all abnormal results with clinical significance\n"
            "5. CRITICAL VALUES: Identify life-threatening results requiring immediate action\n"
            "6. CLINICAL CORRELATION: Laboratory medicine perspective on findings\n"
            "7. RECOMMENDED FOLLOW-UP: Additional laboratory testing if indicated\n\n"
            "CRITICAL RULES:\n"
            "- Focus EXCLUSIVELY on laboratory values and their interpretation\n"
            "- Use precise laboratory medicine terminology\n"
            "- Reference CLSI guidelines and standard laboratory practices\n"
            "- Address pre-analytical and analytical considerations\n"
            "- Specify critical value thresholds\n"
            "- DO NOT provide clinical management recommendations\n\n"
            "REFUSE general medical advice - state 'Clinical management should be determined by the ordering physician based on complete clinical assessment.'\n\n"
            f"Laboratory Document:\n{truncated}{warning}"
        )
    elif capability == 'radiology':
        # Check if this might be a radiology report
        if any(keyword in text.lower() for keyword in ['ct', 'mri', 'x-ray', 'ultrasound', 'scan', 'imaging', 'radiological']):
            prompt = (
                "You are a SPECIALIZED RADIOLOGY AI assistant. STRICTLY analyze this radiology document from a radiological perspective ONLY.\n\n"
                "MANDATORY RADIOLOGY REPORT ANALYSIS:\n"
                "1. REPORT TYPE: Confirm imaging modality and study type\n"
                "2. TECHNIQUE: Imaging parameters and protocols\n"
                "3. FINDINGS SUMMARY: Extract key radiological findings\n"
                "4. MEASUREMENTS: Note specific measurements and dimensions\n"
                "5. IMPRESSION: Radiologist's interpretation\n"
                "6. RECOMMENDATIONS: Suggested follow-up imaging or correlation\n"
                "7. CRITICAL FINDINGS: Urgent radiological findings\n\n"
                "CRITICAL RULES:\n"
                "- Focus EXCLUSIVELY on radiological findings and interpretation\n"
                "- Use standard radiological terminology and classifications\n"
                "- Reference ACR/ESR guidelines where applicable\n"
                "- Identify anatomical structures and abnormalities\n"
                "- DO NOT provide clinical management recommendations\n\n"
                "REFUSE general medical advice - state 'Clinical correlation and management should be discussed with the ordering physician.'\n\n"
                f"Radiology Document:\n{truncated}{warning}"
            )
        else:
            return "ERROR: This document does not appear to be a radiology report. Please switch to General Medical Assistance mode for general documents, or Lab Interpretation mode for laboratory reports."
    elif capability == 'general':
        # Check if this might be a specialized report
        if any(keyword in text.lower() for keyword in ['hemoglobin', 'glucose', 'creatinine', 'liver enzyme', 'cbc', 'chemistry panel']):
            return "ERROR: This appears to be a laboratory report. Please switch to Lab Interpretation mode for proper analysis of laboratory results."
        elif any(keyword in text.lower() for keyword in ['ct', 'mri', 'x-ray', 'ultrasound', 'radiological', 'imaging']):
            return "ERROR: This appears to be a radiology report. Please switch to Radiology Assistance mode for proper interpretation of imaging studies."
        else:
            prompt = (
                "You are a GENERAL MEDICAL AI assistant. Analyze this medical document from a general healthcare perspective.\n\n"
                "GENERAL MEDICAL DOCUMENT ANALYSIS:\n"
                "1. DOCUMENT TYPE: Identify the type of medical document\n"
                "2. KEY INFORMATION: Extract relevant medical information\n"
                "3. CLINICAL SIGNIFICANCE: General medical interpretation\n"
                "4. PATIENT EDUCATION: Relevant points for patient understanding\n"
                "5. RECOMMENDATIONS: General health guidance if appropriate\n\n"
                "FOCUS AREAS:\n"
                "- General medical conditions and symptoms\n"
                "- Medication information and prescriptions\n"
                "- General health recommendations\n"
                "- Patient education materials\n\n"
                "REFUSE specialized interpretation - redirect to appropriate mode for laboratory or radiology reports.\n\n"
                f"Medical Document:\n{truncated}{warning}"
            )
    else:
        return "ERROR: Please select an appropriate assistance mode for document analysis."
    
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "system", "content": prompt}],
        max_tokens=512
    )
    return response.choices[0].message['content']

@app.route('/api/upload', methods=['POST'])
@handle_validation_errors
def upload_file():
    if 'file' not in request.files:
        raise ValueError("No file provided")
    
    file = request.files['file']
    capability = request.form.get('capability', 'general')
    
    if file.filename == '':
        raise ValueError("No selected file")
    
    # Validate file upload using Pydantic utilities
    validated_upload = validate_file_upload_data(file, capability)
    
    filename = file.filename
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    
    # Add debugging for file upload
    logger.info(f"Uploading file: {filename}")
    logger.info(f"File path: {file_path}")
    
    # Check if file has content (without consuming the stream)
    if hasattr(file, 'content_length'):
        logger.info(f"File content length: {file.content_length}")
    elif hasattr(file, 'content_type'):
        logger.info(f"File content type: {file.content_type}")
    
    # Save the file
    file.save(file_path)
    
    # Verify file was saved
    if not os.path.exists(file_path):
        return jsonify({'result': 'Error: Failed to save uploaded file'})
    
    logger.info(f"File saved successfully. File size: {os.path.getsize(file_path)} bytes")
    
    try:
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
            # Validate file exists and is readable
            if not os.path.exists(file_path):
                return jsonify({'result': 'Error: Uploaded file not found'})
            
            # Check file size (limit to 10MB)
            file_size = os.path.getsize(file_path)
            if file_size > 10 * 1024 * 1024:  # 10MB
                return jsonify({'result': 'Error: File too large (max 10MB)'})
            
            # Read image and encode as base64
            try:
                with open(file_path, 'rb') as img_f:
                    img_data = img_f.read()
                    logger.info(f"Read {len(img_data)} bytes from file")
                    
                    if not img_data:
                        logger.error(f"File is empty: {file_path}")
                        return jsonify({'result': 'Error: Empty image file'})
                    
                    if len(img_data) < 100:  # Suspiciously small for an image
                        logger.warning(f"File seems too small: {len(img_data)} bytes")
                    
                    img_bytes = base64.b64encode(img_data)
                    logger.info(f"Base64 encoded to {len(img_bytes)} bytes")
                    
            except IOError as e:
                logger.error(f"Error reading file {file_path}: {e}")
                return jsonify({'result': f'Error reading file: {str(e)}'})
            except Exception as e:
                logger.error(f"Unexpected error reading file: {e}")
                return jsonify({'result': f'Error processing file: {str(e)}'})
            
            # Detect image format from filename and validate
            ext = filename.split('.')[-1].lower()
            if ext == 'jpg':
                ext = 'jpeg'
            
            # Map file extensions to MIME types
            format_mapping = {
                'png': 'png',
                'jpeg': 'jpeg', 
                'jpg': 'jpeg',
                'gif': 'gif',
                'bmp': 'bmp'
            }
            
            if ext not in format_mapping:
                return jsonify({'result': f'Error: Unsupported image format: {ext}'})
            
            image_format = format_mapping[ext]
            
            logger.info(f"Processing image: {filename}, size: {file_size}, format: {ext}, capability: {capability}")
            
            # Add debugging
            try:
                result = interpret_image_with_openai(img_bytes, image_format=ext, capability=capability)
            except Exception as img_error:
                logger.error(f"Image processing error: {img_error}")
                return jsonify({'result': f'Error during image interpretation: {str(img_error)}'})
        elif filename.lower().endswith('.pdf'):
            # Extract text from PDF
            doc = fitz.open(file_path)
            text = "\n".join(page.get_text() for page in doc)
            result = interpret_text_with_openai(text, capability=capability)
        else:
            result = 'Unsupported file type.'
        return jsonify({'result': result})
    except Exception as e:
        return jsonify({'result': f'Error during interpretation: {str(e)}'})

# Database setup
# Install PyMySQL as MySQLdb replacement
pymysql.install_as_MySQLdb()

# MySQL configuration
MYSQL_HOST = os.getenv('MYSQL_HOST', 'localhost')
MYSQL_PORT = os.getenv('MYSQL_PORT', '3306')
MYSQL_USER = os.getenv('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', '')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE', 'medchat_db')

app.config['SQLALCHEMY_DATABASE_URI'] = f'mysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    otp = db.Column(db.String(6), nullable=True)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    updated_at = db.Column(db.DateTime, default=db.func.current_timestamp(), onupdate=db.func.current_timestamp())
    otp_expiry = db.Column(db.Integer, nullable=True)  # Unix timestamp

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# Create the database tables if they don't exist
with app.app_context():
    db.create_all()

@app.route('/api/signup', methods=['POST'])
@validate_request(UserSignup)
def signup():
    # Get validated data from decorator
    signup_data = request.validated_data
    email = signup_data.email
    password = signup_data.password
    
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({
            'error': 'Email already registered.',
            'email_exists': True,
            'is_verified': existing_user.is_verified
        }), 409

    otp = str(random.randint(100000, 999999))
    otp_expiry = int(time.time()) + 300  # OTP valid for 5 minutes
    user = User(email=email, is_verified=False, otp=otp, otp_expiry=otp_expiry)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    # Send OTP via email (simple SMTP example, configure as needed)
    try:
        smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', 587))
        smtp_user = os.getenv('SMTP_USER')
        smtp_pass = os.getenv('SMTP_PASS')
        from_email = smtp_user
        to_email = email
        subject = 'Your OTP Code'
        body = f'Your OTP code is: {otp}'
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = from_email
        msg['To'] = to_email
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(from_email, [to_email], msg.as_string())
    except Exception as e:
        return jsonify({'error': f'Failed to send OTP: {str(e)}'}), 500

    return jsonify({'message': 'Signup successful. Please check your email for the OTP.'}), 200

@app.route('/api/verify-otp', methods=['POST'])
@validate_request(OTPVerification)
def verify_otp():
    # Get validated data from decorator
    otp_data = request.validated_data
    email = otp_data.email
    otp = otp_data.otp
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'User not found.'}), 404
    if user.is_verified:
        return jsonify({'message': 'User already verified.'}), 200
    if user.otp != otp:
        return jsonify({'error': 'Invalid OTP.'}), 400
    if int(time.time()) > user.otp_expiry:
        return jsonify({'error': 'OTP expired.'}), 400
    user.is_verified = True
    user.otp = None
    user.otp_expiry = None
    db.session.commit()
    return jsonify({'message': 'OTP verified. Account activated.'}), 200

@app.route('/api/login', methods=['POST'])
@validate_request(UserLogin)
def login():
    # Get validated data from decorator
    login_data = request.validated_data
    email = login_data.email
    password = login_data.password
    
    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({
            'error': 'No account found with this email.',
            'user_not_found': True,
            'email': email
        }), 404
    
    if not user.check_password(password):
        return jsonify({'error': 'Invalid password.'}), 401
    
    if not user.is_verified:
        return jsonify({
            'error': 'Account not verified. Please verify OTP.',
            'needs_verification': True,
            'email': email
        }), 403
    
    # For now, just return a success message. Token/session can be added later.
    return jsonify({'message': 'Login successful.'}), 200

@app.route('/api/patient-engagement/test', methods=['POST'])
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

@app.route('/api/patient-engagement/query', methods=['POST'])
def patient_engagement_query():
    """Handle patient engagement database queries"""
    try:
        logger.info("=== PATIENT ENGAGEMENT QUERY ENDPOINT CALLED ===")
        logger.info(f"Request method: {request.method}")
        logger.info(f"Request headers: {dict(request.headers)}")
        
        data = request.get_json()
        logger.info(f"Received data: {data}")
        
        query = data.get('query', '').strip()
        conversation_context = data.get('conversation_context', '').strip()
        
        logger.info(f"Extracted query: '{query}'")
        logger.info(f"Extracted conversation_context: '{conversation_context[:100]}...'")
        
        if not query:
            logger.warning("No query provided")
            return jsonify({'error': 'Query is required'}), 400
        
        # Import the DatabaseAgent functionality
        from db_read_agent import DatabaseAgent
        
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

@app.route('/api/patient-engagement/daily-appointments', methods=['GET'])
def get_daily_appointments():
    """Get today's appointments"""
    try:
        # Import the DatabaseAgent functionality
        from db_read_agent import DatabaseAgent
        
        # Create agent instance
        agent = DatabaseAgent()
        
        # Get cached daily appointments
        result = agent.get_cached_daily_appointments()
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify({'error': result['error']}), 400
        
    except Exception as e:
        logger.error(f"Daily appointments error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

# WhatsApp Notification Endpoints
@app.route('/api/notifications/send', methods=['POST'])
def send_notification():
    """Send a custom notification to a patient"""
    try:
        data = request.get_json()
        patient_identifier = data.get('patient_identifier')  # ID or name
        message = data.get('message')
        
        if not patient_identifier or not message:
            return jsonify({'error': 'Patient identifier and message are required'}), 400
        
        from whatsapp_integration import whatsapp_notifier
        result = whatsapp_notifier.send_custom_notification(patient_identifier, message)
        
        if result['success']:
            return jsonify({'message': 'Notification sent successfully', 'result': result}), 200
        else:
            return jsonify({'error': result['error']}), 400
        
    except Exception as e:
        logger.error(f"Send notification error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/notifications/appointment-reminder', methods=['POST'])
def send_appointment_reminder():
    """Send appointment reminder to a patient"""
    try:
        data = request.get_json()
        appointment_id = data.get('appointment_id')
        
        if not appointment_id:
            return jsonify({'error': 'Appointment ID is required'}), 400
        
        from whatsapp_integration import whatsapp_notifier
        result = whatsapp_notifier.send_appointment_reminder(appointment_id)
        
        if result['success']:
            return jsonify({'message': 'Appointment reminder sent successfully', 'result': result}), 200
        else:
            return jsonify({'error': result['error']}), 400
        
    except Exception as e:
        logger.error(f"Appointment reminder error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/notifications/medication-reminder', methods=['POST'])
def send_medication_reminder():
    """Send medication reminder to a patient"""
    try:
        data = request.get_json()
        patient_id = data.get('patient_id')
        medication_name = data.get('medication_name')
        dosage = data.get('dosage')
        time = data.get('time')
        
        if not all([patient_id, medication_name, dosage, time]):
            return jsonify({'error': 'Patient ID, medication name, dosage, and time are required'}), 400
        
        from whatsapp_integration import whatsapp_notifier
        result = whatsapp_notifier.send_medication_reminder(patient_id, medication_name, dosage, time)
        
        if result['success']:
            return jsonify({'message': 'Medication reminder sent successfully', 'result': result}), 200
        else:
            return jsonify({'error': result['error']}), 400
        
    except Exception as e:
        logger.error(f"Medication reminder error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/notifications/bulk-appointments', methods=['POST'])
def send_bulk_appointment_reminders():
    """Send reminders for all upcoming appointments"""
    try:
        data = request.get_json() or {}
        hours_ahead = data.get('hours_ahead', 24)
        
        from whatsapp_integration import whatsapp_notifier
        result = whatsapp_notifier.send_bulk_appointment_reminders(hours_ahead)
        
        if result.get('success') is False:
            return jsonify({'error': result['error']}), 400
        
        return jsonify({
            'message': 'Bulk appointment reminders sent',
            'result': result
        }), 200
        
    except Exception as e:
        logger.error(f"Bulk appointment reminders error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/faqs/generate', methods=['POST'])
def generate_dynamic_faqs():
    """
    Generate dynamic FAQs based on query history for a specific capability
    """
    try:
        data = request.get_json()
        capability = data.get('capability')
        session_id = data.get('session_id')
        
        if not capability or not session_id:
            return jsonify({
                'success': False,
                'error': 'Missing capability or session_id'
            }), 400
        
        # Get query history from context manager
        context_data = context_manager.get_context(session_id)
        if not context_data or not context_data.get('messages'):
            # Return default FAQs if no history
            default_faqs = get_default_faqs(capability)
            return jsonify({
                'success': True,
                'faqs': default_faqs
            })
        
        # Extract user queries from history
        user_queries = []
        for message in context_data['messages']:
            if message.get('role') == 'user' and message.get('content'):
                user_queries.append(message['content'])
        
        if not user_queries:
            # Return default FAQs if no user queries
            default_faqs = get_default_faqs(capability)
            return jsonify({
                'success': True,
                'faqs': default_faqs
            })
        
        # Generate dynamic FAQs using LLM
        dynamic_faqs = generate_faqs_from_history(user_queries, capability)
        
        return jsonify({
            'success': True,
            'faqs': dynamic_faqs
        })
        
    except Exception as e:
        logger.error(f"Error generating dynamic FAQs: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to generate FAQs'
        }), 500

def get_default_faqs(capability):
    """Return default FAQs for each capability"""
    default_faqs = {
        'radiology': [
            "How to interpret a chest X-ray?",
            "What are the signs of pneumonia on imaging?",
            "How to identify fractures on X-ray?",
            "What does a normal CT scan of the brain look like?",
            "How to read an MRI of the spine?",
            "What are the radiological signs of stroke?",
            "How to interpret abdominal ultrasound?",
            "What imaging is best for joint problems?",
            "How to identify kidney stones on CT?",
            "What are the signs of appendicitis on imaging?"
        ],
        'lab': [
            "How to interpret CBC results?",
            "What do elevated liver enzymes mean?",
            "How to read lipid panel results?",
            "What are normal kidney function values?",
            "How to interpret thyroid function tests?",
            "What does high CRP indicate?",
            "How to read blood glucose levels?",
            "What are normal electrolyte ranges?",
            "How to interpret cardiac enzyme results?",
            "What does elevated troponin mean?"
        ],
        'general': [
            "What are the symptoms of diabetes?",
            "How can I lower my blood pressure?",
            "What causes frequent headaches?",
            "What should I do if I have a fever?",
            "What are the side effects of paracetamol?",
            "How do I know if I have COVID-19?",
            "What is a normal heart rate?",
            "How much sleep do adults need?",
            "What are the signs of a heart attack?",
            "How can I treat a cold at home?"
        ]
    }
    return default_faqs.get(capability, default_faqs['general'])

def generate_faqs_from_history(user_queries, capability):
    """
    Generate dynamic FAQs based on user query history using LLM
    """
    try:
        # Create a summary of user queries
        query_summary = "\n".join([f"- {query}" for query in user_queries[-20:]])  # Last 20 queries
        
        # Create prompt for FAQ generation
        prompt = f"""Based on the following user query history for {capability} capability, generate 10 relevant and helpful FAQ questions that would be useful for similar future queries.

User Query History:
{query_summary}

Capability: {capability}

Generate 10 FAQ questions that:
1. Are relevant to the types of questions users are asking
2. Cover common patterns in the query history
3. Are specific to {capability} medical domain
4. Are phrased as natural questions
5. Would help users get quick answers to common concerns

Return only the questions, one per line, without numbering or additional text."""

        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.7
        )
        
        # Parse the response and extract questions
        faq_text = response.choices[0].message.content.strip()
        faqs = [line.strip() for line in faq_text.split('\n') if line.strip()]
        
        # Clean up the FAQs (remove numbering, etc.)
        cleaned_faqs = []
        for faq in faqs:
            # Remove common prefixes like "1.", "Q:", etc.
            faq = faq.lstrip('0123456789.- ').lstrip('Q:').lstrip('q:').strip()
            if faq and len(faq) > 10:  # Ensure it's a meaningful question
                cleaned_faqs.append(faq)
        
        # Return top 10 FAQs
        return cleaned_faqs[:10]
        
    except Exception as e:
        logger.error(f"Error generating FAQs from history: {str(e)}")
        # Return default FAQs as fallback
        return get_default_faqs(capability)

if __name__ == '__main__':
    print(f"API running at http://localhost:{os.getenv('PORT', '5000')}")
    
    # Check if OpenAI API key is configured
    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY environment variable is required")
        exit(1)
    
    # Start the Flask server
    app.run(
        debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true',
        host='0.0.0.0',
        port=int(os.getenv('PORT', '5000'))
    )
