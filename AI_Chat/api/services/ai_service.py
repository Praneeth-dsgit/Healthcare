"""
AI Service Module
Contains AI-related utility functions for query processing and prompt generation.
"""
import logging
import openai
from config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

def detect_query_type(query):
    """
    Classifies the query into specific medical contexts using semantic analysis.
    Returns: 'diagnosis', 'treatment', 'medication', 'lab', 'chronic', 'emergency', 'general'
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
            max_tokens=50,
            temperature=0.5
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
            'radiology': "medical imaging, X-rays, CT scans, MRI, ultrasound, radiological interpretation, imaging studies, scans, radiology, medical images",
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
            max_tokens=50,
            temperature=0.5
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
            
            # Add patient identification if available
            patient_name = patient_info.get('patientName', '')
            patient_id = patient_info.get('patientId', '')
            if patient_name:
                context += f"- Patient Name: {patient_name}\n"
            if patient_id:
                context += f"- Patient ID: {patient_id}\n"
            
            if age > 0:
                context += f"- Age: {age} years (consider age-related imaging variations)\n"
            if gender:
                context += f"- Gender: {gender} (consider gender-specific anatomical differences)\n"
            if weight > 0:
                context += f"- Weight: {weight} kg (consider for contrast dosing and image quality)\n"
            
            # Use BMI from patient_info if available
            patient_bmi = patient_info.get('bmi')
            if patient_bmi:
                bmi = patient_bmi
            
            if bmi or patient_bmi:
                bmi_value = patient_bmi if patient_bmi else bmi
                bmi_category = "underweight" if bmi_value < 18.5 else "normal" if bmi_value < 25 else "overweight" if bmi_value < 30 else "obese"
                context += f"- BMI: {bmi_value:.1f} ({bmi_category} - affects image quality and technique)\n"
            
            if history:
                context += f"- Relevant Medical History: {history} (consider for differential diagnosis)\n"
            if medications:
                context += f"- Current Medications: {medications} (consider drug-related imaging findings)\n"
            
            # Add recent appointments if available
            recent_appointments = patient_info.get('recentAppointments', [])
            if recent_appointments:
                context += f"\nRECENT IMAGING-RELATED APPOINTMENTS:\n"
                for appt in recent_appointments[:3]:
                    appt_date = appt.get('appointment_date', '')
                    doctor_name = appt.get('doctor_name', 'Unknown')
                    dept_name = appt.get('department_name', '')
                    reason = appt.get('reason', '')
                    if dept_name and ('radiology' in dept_name.lower() or 'imaging' in dept_name.lower()):
                        context += f"- {appt_date}: {doctor_name} - {reason}\n"
            
            # Add age-specific imaging considerations
            if age > 0:
                if age < 18:
                    context += "\n- PEDIATRIC PATIENT: Use pediatric normal variants and radiation safety protocols\n"
                elif age > 65:
                    context += "- ELDERLY PATIENT: Consider age-related degenerative changes and osteoporosis\n"

            medical_records = patient_info.get('medicalRecords') or []
            if medical_records:
                context += "\nMEDICAL RECORDS ON FILE (from database — prioritize radiology/imaging-related entries):\n"
                for rec in medical_records[:20]:
                    rtype = rec.get('record_type', 'record')
                    title = rec.get('title', 'Untitled')
                    vdate = rec.get('visit_date', '')
                    desc = (rec.get('description') or '').strip()
                    fm = ''
                    if rec.get('family_member_first_name'):
                        fm = f" (family: {rec['family_member_first_name']} {rec.get('family_member_last_name', '')})".strip()
                    context += f"- [{rtype}] {title} — {vdate}{fm}\n"
                    if desc:
                        context += f"  Summary: {desc[:800]}\n"
                    
        elif capability == 'lab':
            context = f"PATIENT DEMOGRAPHICS FOR LABORATORY INTERPRETATION:\n"
            
            # Add patient identification if available
            patient_name = patient_info.get('patientName', '')
            patient_id = patient_info.get('patientId', '')
            if patient_name:
                context += f"- Patient Name: {patient_name}\n"
            if patient_id:
                context += f"- Patient ID: {patient_id}\n"
            
            if age > 0:
                context += f"- Age: {age} years (use age-specific reference ranges)\n"
            if gender:
                context += f"- Gender: {gender} (apply gender-specific reference ranges)\n"
            if weight > 0:
                context += f"- Weight: {weight} kg (consider for creatinine clearance calculations)\n"
            
            # Use BMI from patient_info if available
            patient_bmi = patient_info.get('bmi')
            if patient_bmi:
                bmi = patient_bmi
            
            if bmi or patient_bmi:
                bmi_value = patient_bmi if patient_bmi else bmi
                context += f"- BMI: {bmi_value:.1f} (relevant for metabolic parameters)\n"
            
            blood_type = patient_info.get('bloodType', '')
            if blood_type:
                context += f"- Blood Type: {blood_type}\n"
            
            if medications:
                context += f"- Current Medications: {medications} (check for drug interference and therapeutic monitoring)\n"
            if history:
                context += f"- Medical History: {history} (consider disease-specific lab patterns)\n"
            if allergies:
                context += f"- Allergies: {allergies} (relevant for medication recommendations)\n"
            
            # Add recent appointments if available
            recent_appointments = patient_info.get('recentAppointments', [])
            if recent_appointments:
                context += f"\nRECENT LAB-RELATED APPOINTMENTS:\n"
                for appt in recent_appointments[:3]:
                    appt_date = appt.get('appointment_date', '')
                    doctor_name = appt.get('doctor_name', 'Unknown')
                    dept_name = appt.get('department_name', '')
                    reason = appt.get('reason', '')
                    if dept_name and ('lab' in dept_name.lower() or 'pathology' in dept_name.lower()):
                        context += f"- {appt_date}: {doctor_name} - {reason}\n"
            
            medical_records = patient_info.get('medicalRecords') or []
            if medical_records:
                context += "\nMEDICAL RECORDS ON FILE (from database — prioritize laboratory-related entries):\n"
                for rec in medical_records[:20]:
                    rtype = rec.get('record_type', 'record')
                    title = rec.get('title', 'Untitled')
                    vdate = rec.get('visit_date', '')
                    desc = (rec.get('description') or '').strip()
                    fm = ''
                    if rec.get('family_member_first_name'):
                        fm = f" (family: {rec['family_member_first_name']} {rec.get('family_member_last_name', '')})".strip()
                    context += f"- [{rtype}] {title} — {vdate}{fm}\n"
                    if desc:
                        context += f"  Summary: {desc[:800]}\n"

            # Add age and gender-specific lab considerations
            if age > 0 and gender:
                if age < 18:
                    context += "\n- PEDIATRIC: Use pediatric reference ranges and consider growth-related changes\n"
                elif gender.lower() == 'female' and 15 <= age <= 50:
                    context += "- REPRODUCTIVE AGE FEMALE: Consider menstrual cycle effects and pregnancy possibility\n"
                elif age > 65:
                    context += "- ELDERLY: Consider age-related changes in kidney/liver function\n"
                    
        else:  # general
            context = f"COMPREHENSIVE PATIENT PROFILE:\n"
            
            # Add patient identification if available
            patient_name = patient_info.get('patientName', '')
            patient_id = patient_info.get('patientId', '')
            if patient_name:
                context += f"- Patient Name: {patient_name}\n"
            if patient_id:
                context += f"- Patient ID: {patient_id}\n"
            
            if age > 0:
                context += f"- Age: {age} years\n"
            if gender:
                context += f"- Gender: {gender}\n"
            if weight > 0:
                context += f"- Weight: {weight} kg\n"
            if height > 0:
                context += f"- Height: {height} cm\n"
            
            # Use BMI from patient_info if available, otherwise calculate
            patient_bmi = patient_info.get('bmi')
            if patient_bmi:
                bmi = patient_bmi
            elif bmi:
                pass  # Already calculated
            
            if bmi or patient_bmi:
                bmi_value = patient_bmi if patient_bmi else bmi
                bmi_category = "underweight" if bmi_value < 18.5 else "normal weight" if bmi_value < 25 else "overweight" if bmi_value < 30 else "obese"
                context += f"- BMI: {bmi_value:.1f} ({bmi_category})\n"
            
            dob = patient_info.get('dob', '')
            if dob:
                context += f"- Date of Birth: {dob}\n"
            
            blood_type = patient_info.get('bloodType', '')
            if blood_type:
                context += f"- Blood Type: {blood_type}\n"
            
            phone = patient_info.get('phone', '')
            if phone:
                context += f"- Phone: {phone}\n"
            
            if bp:
                context += f"- Blood Pressure: {bp}\n"
            if allergies:
                context += f"- Known Allergies: {allergies}\n"
            if medications:
                context += f"- Current Medications: {medications}\n"
            if history:
                context += f"- Medical History: {history}\n"
            
            # Add recent appointments if available
            recent_appointments = patient_info.get('recentAppointments', [])
            if recent_appointments:
                context += f"\nRECENT APPOINTMENTS:\n"
                for appt in recent_appointments[:3]:  # Show last 3
                    appt_date = appt.get('appointment_date', '')
                    doctor_name = appt.get('doctor_name', 'Unknown')
                    dept_name = appt.get('department_name', '')
                    reason = appt.get('reason', '')
                    status = appt.get('status', '')
                    context += f"- {appt_date}: {doctor_name}"
                    if dept_name:
                        context += f" ({dept_name})"
                    if reason:
                        context += f" - {reason}"
                    if status:
                        context += f" [{status}]"
                    context += "\n"
                
            # Add risk factors and considerations
            if age > 0:
                if age < 18:
                    context += "\n- PEDIATRIC CONSIDERATIONS: Growth, development, and family history important\n"
                elif age > 65:
                    context += "\n- GERIATRIC CONSIDERATIONS: Polypharmacy, cognitive function, and frailty assessment\n"
            
            if (bmi or patient_bmi) and (bmi_value if patient_bmi else bmi) >= 30:
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
        prompt = f"""
You are operating in **{capability} mode**.  
You are assisting a healthcare professional.  

🚫 DO NOT:
- Interpret imaging (unless Radiology mode).
- Interpret lab values (unless Lab mode).
- Answer casual, speculative, or non-medical questions. Redirect instead.

👤 Patient Context (if provided):
{patient_context}

📌 Query Type: {query_type}  
📌 Query: {query}

---

🎯 RESPONSE LOGIC (BASED ON QUERY TYPE):

**DIAGNOSIS QUERIES**:
- Condition name
- Key symptoms + red flags
- Differential diagnosis
- Diagnostic workup
- Clinical notes (patient-specific risks, when to refer)

**TREATMENT QUERIES**:
- First-line lifestyle/conservative options
- Pharmacotherapy (**names, dosages, frequencies, durations, monitoring**)
- Surgical/procedural options
- Clinical notes (contraindications, follow-up needs)

**MEDICATION QUERIES**:
- Drug class & indication
- Dosing & administration
- Side effects & monitoring
- Contraindications & interactions
- Clinical notes (personalized)

**CHRONIC CONDITION QUERIES**:
- Long-term lifestyle changes
- Medication strategies with monitoring
- Specialist referral/coordination
- Clinical notes (progression prevention)

**EMERGENCY QUERIES**:
- Immediate actions (ABCDE, first aid)
- Stabilization steps
- Definitive care
- Clinical notes (red flags, prevention)

**GENERAL QUERIES**:
- Key points / definitions
- Clinical relevance & practical applications
- Additional resources
- Clinical notes (patient education, follow-up)

---

🧠 REQUIREMENTS:
- Always tailor **Clinical Notes** to patient context.
- Always highlight **red flags** and when to escalate to specialist/EMS.
- Keep answer concise, structured, and actionable for a healthcare professional.
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

**STRUCTURED OUTPUT FORMAT** (MANDATORY — professional Markdown for clinical readability):

Respond using ONLY GitHub-flavored Markdown. Do NOT use emojis.

Required sections (use these exact ## headers in this order; omit a section only if not applicable):

## Executive Summary
One or two sentences: study type, principal impression, and urgency level.

## Study & Technique
- Modality, region, and protocol
- Image quality and limitations (patient factors, technique)

## Key Findings
- Systematic findings (normal anatomy first, then abnormalities)
- Precise measurements, density/signal characteristics, and anatomical location
- Use bullet lists; bold **critical abnormalities**

## Differential Diagnosis
- Ranked imaging-based differentials
- Reference standard classifications when applicable (e.g., BI-RADS, Fleischner, LI-RADS)

## Recommendations
- Additional imaging, follow-up interval, or correlation studies
- Suggested clinical correlation

## Clinical Notes
- Patient-specific context (age, gender, history, medications)
- Red flags and when to escalate urgently

## Disclaimer
One sentence: AI-assisted support only; verify against source images and institutional protocols.

Formatting rules:
- Use ## for main sections and ### for subsections if needed
- Use bullet lists (- ) for all detail lines
- Use **bold** only for critical terms, measurements, or diagnoses
- Maximum 280 words total
- Plain professional clinical language; no conversational filler

**MANDATORY PATIENT-CONTEXTUALIZED INTERPRETATION:**
- Integrate patient age, gender, and medical history into radiological analysis
- Consider age-specific normal variants and pathological changes
- Factor in gender-specific anatomical differences and disease patterns
- Use BMI information for image quality assessment and technique optimization
- Correlate imaging findings with known medical history and medications

**PATIENT-SPECIFIC CONSIDERATIONS:**
- PEDIATRIC (age <18): Use pediatric normal variants, consider radiation dose optimization
- ELDERLY (age >65): Expect age-related degenerative changes, increased fracture risk
- FEMALE REPRODUCTIVE AGE: Consider pregnancy, hormonal influences on imaging
- OBESITY (BMI >30): Adjust for image quality limitations, increased radiation requirements
- MEDICATION EFFECTS: Consider drug-related imaging changes from patient's current medications

**RADIOLOGICAL STANDARDS:**
- Use precise radiological terminology contextualized for patient age/gender
- Reference anatomical landmarks with age-appropriate measurements
- Describe density, enhancement patterns with patient-specific considerations
- Follow ACR/ESR/IRIA reporting guidelines with demographic modifications

**STRICT RULES & SAFETY PROTOCOLS:** 
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

**STRUCTURED OUTPUT FORMAT** (MANDATORY — professional Markdown for clinical readability):

Respond using ONLY GitHub-flavored Markdown. Do NOT use emojis.

Required sections (use these exact ## headers in this order; omit a section only if not applicable):

## Executive Summary
One or two sentences: tests reviewed, overall interpretation, and clinical urgency.

## Reference Context
- Age/gender-appropriate reference ranges used
- Pre-analytical or specimen considerations if relevant

## Result Interpretation
- Parameter-by-parameter interpretation with values where provided
- Flag **critical** or **abnormal** results clearly with bold
- Clinical significance in patient context

## Differential Considerations
- Likely etiologies ranked by probability
- Medication or disease-related confounders

## Recommendations
- Follow-up tests, repeat intervals, or confirmatory studies
- Suggested clinical correlation

## Clinical Notes
- Integration with history, BMI, renal/hepatic context, and current medications
- Red flags requiring urgent action

## Disclaimer
One sentence: AI-assisted support only; confirm with laboratory standards and treating clinician.

Formatting rules:
- Use ## for main sections and ### for subsections if needed
- Use bullet lists (- ) for all detail lines
- Use **bold** only for critical values, diagnoses, or actions
- Maximum 280 words total
- Plain professional clinical language; no conversational filler

**MANDATORY PATIENT-CONTEXTUALIZED LABORATORY INTERPRETATION:**
- Apply age and gender-specific reference ranges for all laboratory values
- Consider patient weight for creatinine clearance and drug dosing calculations
- Factor in current medications for therapeutic drug monitoring and interference
- Integrate medical history for disease-specific laboratory patterns
- Account for BMI in metabolic parameter interpretation (glucose, lipids, liver function)

**PATIENT-SPECIFIC LABORATORY CONSIDERATIONS:**
- PEDIATRIC (age <18): Use pediatric reference ranges, consider growth and development
- FEMALE REPRODUCTIVE AGE (15-50): Consider menstrual cycle, pregnancy effects
- ELDERLY (age >65): Adjust for age-related organ function decline
- OBESITY (BMI >30): Consider metabolic syndrome markers, insulin resistance
- MEDICATION INTERACTIONS: Screen current medications for lab test interference
- KIDNEY FUNCTION: Adjust interpretation based on age, gender, weight for eGFR

**LABORATORY STANDARDS:**
- Reference CLSI guidelines with demographic-specific modifications
- Include pre-analytical considerations specific to patient characteristics
- Address analytical interferences from patient medications
- Specify age and gender-adjusted critical value thresholds
- Consider population and demographic-specific reference ranges

**STRICT RULES & SAFETY PROTOCOLS:** 
- Include appropriate disclaimers for off-label medication use or experimental treatments
- Audience: Healthcare professionals ONLY
- Always consider patient safety first - when in doubt, recommend consultation with specialist

STRICT RULE: If this query is NOT about laboratory testing or result interpretation, respond with: "I specialize in laboratory medicine only. Please switch to General Medical or Radiology mode for this question."

Expert Level: Clinical pathologist with patient-contextualized interpretation expertise."""

    else:
        # Default fallback
        prompt = f"""You are a healthcare assistant with limited scope.

Query: {query}

**STRUCTURED OUTPUT FORMAT** (MANDATORY):

Use this exact formatting structure with emojis and clear sections:

- [General Healthcare Guidance]
- Available Capabilities:
- [List of specialized modes available]
- [What each mode can help with]

- Mode Selection:
- [How to choose the right mode]
- [Benefits of specialized assistance]

- Clinical Notes:
- [When to use each mode]
- [Safety considerations]

**RESPONSE FRAMEWORK:**
I can only provide general guidance. For specialized assistance, please select an appropriate capability mode:
- General Medical Assistance for symptoms, treatments, and general health
- Radiology Assistance for medical imaging interpretation  
- Lab Interpretation for laboratory result analysis

Please switch to the appropriate mode for detailed, expert-level assistance.

**STRICT RULES & SAFETY PROTOCOLS:** 
- Limit response to a MAXIMUM of 200 words for comprehensive coverage
- Include appropriate disclaimers for off-label medication use or experimental treatments
- Audience: Healthcare professionals ONLY
- Always consider patient safety first - when in doubt, recommend consultation with specialist
"""

    return previous_section + prompt + file_section

