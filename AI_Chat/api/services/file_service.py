"""
File Service Module
Contains file processing and interpretation functions.
"""
import logging
import base64
import openai
from config import MAX_CHARS

logger = logging.getLogger(__name__)

def interpret_image_with_openai(image_bytes, image_format="png", capability="general"):
    """Interpret images based on selected capability with strict enforcement"""
    
    # Set appropriate prompt based on capability
    if capability == 'radiology':
        prompt = (
            """You are a SPECIALIZED RADIOLOGY AI assistant for healthcare professionals. Analyze the provided medical image and output a structured report. You MUST provide an analysis even if image quality is limited or modality is unclear.

CRITICAL FORMATTING RULES (MUST FOLLOW EXACTLY):

1. Output must be valid Markdown only.
2. Do NOT use numbered lists.
3. Do NOT use bullet points.
4. Do NOT use dashes (-), asterisks (*), or list markers.
5. Do NOT use HTML tags.
6. Do NOT wrap the response in code blocks.
7. Do NOT indent content.
8. Do NOT add emojis.
9. Use only headers and plain paragraphs.
10. Leave exactly one blank line between sections.

STRUCTURE RULES:

- Use "##" for major sections: TECHNIQUE, COMPARISON, FINDINGS, IMPRESSION, RECOMMENDATIONS.
- Use "###" for subsections under FINDINGS only (e.g. Lungs and Pleura, Heart and Mediastinum, Bones and Soft Tissues; adapt subsection names to the study type).
- Content under each header must be plain sentences. Do not convert sections into lists.

FORMAT TEMPLATE (ALWAYS FOLLOW):

## TECHNIQUE
Write technique description in plain sentences (modality, sequence, contrast if applicable).

## COMPARISON
Write comparison in plain sentences (prior studies or state none available).

## FINDINGS

### [Relevant anatomical region or system, e.g. Lungs and Pleura]
Write findings in plain sentences.

### [Next region, e.g. Heart and Mediastinum]
Write findings in plain sentences.

### [Next region, e.g. Bones and Soft Tissues]
Write findings in plain sentences.

## IMPRESSION
Write impression in plain sentences.

## RECOMMENDATIONS
Write recommendations in plain sentences. Include clinical correlation with the ordering physician.

Failure to follow these formatting rules is not allowed. Use proper radiological terminology and standard units (HU for CT, mm for dimensions). Always provide your best assessment based on available information.
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
        
        # Log for debugging
        logger.info(f"Processing image with format: {image_format}, base64 length: {len(image_base64)}")
        
        # Validate base64 string format
        if not all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in image_base64):
            raise ValueError("Invalid base64 characters detected")
        
        # Ensure proper padding
        padding = len(image_base64) % 4
        if padding:
            image_base64 += '=' * (4 - padding)
        
        # Create structured system message for image interpretation
        if capability == 'radiology':
            system_message = prompt
        else:
            system_message = f"""You are a SPECIALIZED {capability.upper()} AI assistant. 

CRITICAL FORMATTING REQUIREMENTS - YOU MUST FOLLOW THIS EXACT STRUCTURE:

🔹 [Main Topic/Analysis]
💊 [Subsection with relevant emoji]:
- [Detailed bullet points with specific information]
- [Measurements, values, findings where applicable]

💊 [Another subsection]:
- [More detailed information]
- [Clinical considerations]

🔪 [Procedural/Surgical options if applicable]:
- [Specific procedures with indications]

📌 Clinical Notes:
- [Patient-specific considerations]
- [Risk factors, monitoring needs]
- [Referral recommendations]

ALWAYS use these exact emojis and structure. NEVER deviate from this format.

{prompt}"""

        try:
            response = openai.ChatCompletion.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]}
                ],
                max_tokens=3000,
                temperature=0.2
            )
            result_content = response.choices[0].message['content']
            
            logger.info(f"OpenAI response received. Length: {len(result_content)} characters")
            
            # Check if the model refused to analyze the image
            refusal_keywords = [
                "i'm sorry", "i can't", "i cannot", "unable to",
                "cannot provide", "refuse", "not able to analyze",
                "can't provide a detailed analysis"
            ]
            
            result_lower = result_content.lower()
            if any(keyword in result_lower for keyword in refusal_keywords):
                logger.warning(f"Model refused to analyze image. Full response: {result_content}")
                return f"""I encountered an issue analyzing this medical image. This may occur if:

1. The image quality is too low or the image is unclear
2. The image format is not properly recognized
3. The image does not appear to be a medical imaging study

Please try:
- Uploading a clearer, higher resolution image
- Ensuring the image is a medical scan (X-ray, CT, MRI, ultrasound, etc.)
- Checking that the file is not corrupted

If the problem persists, please contact support. Technical details: The AI model was unable to process this specific image."""
            
            # Validate that we got a meaningful response
            if len(result_content.strip()) < 50:
                logger.warning(f"Response seems too short: {result_content}")
                return f"""The analysis returned a very brief response. This may indicate the image was unclear or unrecognized.

Received response: {result_content}

Please try uploading a clearer medical image or ensure the file is a valid medical imaging study."""
            
            return result_content
        except openai.error.RateLimitError as e:
            logger.error(f"OpenAI Rate Limit Error: {e}")
            raise Exception("OpenAI API quota exceeded. Please check your billing and try again later.")
        except openai.error.InvalidRequestError as e:
            logger.error(f"OpenAI Invalid Request Error: {e}")
            raise Exception("Invalid request to OpenAI API. Please check your image format.")
        except openai.error.APIError as e:
            logger.error(f"OpenAI API Error: {e}")
            raise Exception("OpenAI API error. Please try again later.")
        
    except UnicodeDecodeError as e:
        logger.error(f"Base64 decode error: {e}")
        raise ValueError("Invalid base64 encoding in image data")
    except Exception as e:
        logger.error(f"Image processing error: {e}")
        raise

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
    
    # Create structured system message for text interpretation
    system_message = f"""You are a SPECIALIZED {capability.upper()} AI assistant. 

CRITICAL FORMATTING REQUIREMENTS - YOU MUST FOLLOW THIS EXACT STRUCTURE:

🔹 [Main Topic/Analysis]
💊 [Subsection with relevant emoji]:
- [Detailed bullet points with specific information]
- [Measurements, values, findings where applicable]

💊 [Another subsection]:
- [More detailed information]
- [Clinical considerations]

🔪 [Procedural/Surgical options if applicable]:
- [Specific procedures with indications]

📌 Clinical Notes:
- [Patient-specific considerations]
- [Risk factors, monitoring needs]
- [Referral recommendations]

ALWAYS use these exact emojis and structure. NEVER deviate from this format.

{prompt}"""

    response = openai.ChatCompletion.create(
        model="gpt-4.1",
        messages=[{"role": "system", "content": system_message}],
        max_tokens=512,
        temperature=0.7
    )
    return response.choices[0].message['content']

