from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import os
import time
import logging
import traceback
import requests
from pathlib import Path
from dotenv import load_dotenv
from langchain_community.llms import Ollama
from langchain.prompts import PromptTemplate
from langchain.chains import ConversationChain
from langchain.memory import ConversationBufferMemory
from sentence_transformers import SentenceTransformer, util
import json
import openai
import fitz  # PyMuPDF
from PIL import Image
import io

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

# Load model configuration from environment
MODEL_CONFIG = {
    'model_name': 'llama2:latest', #'gemma3:latest',  # Using gemma3:latest directly instead of using env var
    'temperature': float(os.getenv('TEMPERATURE', '0.5')),
    'top_p': float(os.getenv('TOP_P', '0.8')),
    'top_k': int(os.getenv('TOP_K', '10')),
}

OLLAMA_API_BASE = os.getenv('OLLAMA_API_BASE', 'http://localhost:11434')

# Initialize Ollama instance
llm = None

def initialize_llm():
    """
    Initialize the Ollama LLM instance.
    """
    global llm
    try:
        logger.info("Initializing Ollama LLM...")
        logger.info(f"Using model: {MODEL_CONFIG['model_name']}")
        logger.info(f"Base URL: {OLLAMA_API_BASE}")
        
        # First check if Ollama is running
        try:
            response = requests.get(f"{OLLAMA_API_BASE}/api/tags")
            if response.status_code != 200:
                logger.error("Ollama service is not running")
                return False
            
            # Check if our model is available
            models = response.json().get('models', [])
            logger.info(f"Available models: {models}")
            model_exists = any(MODEL_CONFIG['model_name'] in model.get('name', '') for model in models)
            
            if not model_exists:
                logger.warning(f"Model {MODEL_CONFIG['model_name']} not found, attempting to pull...")
                pull_response = requests.post(
                    f"{OLLAMA_API_BASE}/api/pull",
                    json={"name": MODEL_CONFIG['model_name']}
                )
                if pull_response.status_code != 200:
                    logger.error(f"Failed to pull model {MODEL_CONFIG['model_name']}")
                    return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to connect to Ollama service: {str(e)}")
            return False
        
        # Initialize the Ollama instance
        llm = Ollama(
            base_url=OLLAMA_API_BASE,
            model=MODEL_CONFIG['model_name'],
            temperature=MODEL_CONFIG['temperature'],
            top_p=MODEL_CONFIG['top_p'],
            top_k=MODEL_CONFIG['top_k']
        )
        
        # Test the connection with a simple query
        try:
            logger.info("Testing LLM connection...")
            response = llm.invoke("test")
            logger.info("LLM initialization successful")
            return True
        except Exception as e:
            logger.error(f"Failed to test LLM connection: {str(e)}")
            llm = None
            return False
            
    except Exception as e:
        logger.error(f"Failed to initialize Ollama LLM: {str(e)}\nTraceback: {traceback.format_exc()}")
        llm = None
        return False

def check_ollama_health():
    """
    Check if Ollama service is running and initialize LLM if needed.
    """
    global llm
    try:
        if llm is None:
            if not initialize_llm():
                return False
        
        # Test the LLM with a simple query
        try:
            response = llm.invoke("test")
            return True
        except Exception as e:
            logger.error(f"Failed to test LLM: {str(e)}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to check Ollama health: {str(e)}")
        return False
    
# Load your diseases JSON file
with open('dmkb.json') as f:
    diseases = json.load(f)

# Prepare text chunks from JSON
def disease_to_text(d):
    return (
        f"Disease: {d['Disease']}. "
        f"Description: {d['Description']}. "
        f"Symptoms: {', '.join(d['Symptoms'])}. "
        f"Causes: {', '.join(d['Causes'])}. "
        f"Common Treatments: {', '.join(d['Common Treatments'])}."
    )

texts = [disease_to_text(d) for d in diseases]

# Load embedding model
model = SentenceTransformer('all-MiniLM-L6-v2')

# Compute embeddings for all diseases
disease_embeddings = model.encode(texts, convert_to_tensor=True)

def find_most_similar_disease(query):
    query_embedding = model.encode(query, convert_to_tensor=True)
    # Compute cosine similarity between query and all diseases
    cos_scores = util.pytorch_cos_sim(query_embedding, disease_embeddings)[0]
    top_result = cos_scores.argmax()
    matched_disease = diseases[top_result]
    return matched_disease


def detect_query_type(query):
    """
    Classifies the query into specific medical contexts.
    Returns: 'diagnosis', 'treatment', 'lab', 'chronic', 'emergency', 'general'
    """
    q = query.lower()
    if any(word in q for word in ['differential', 'possible cause', 'what could be', 'diagnosis', 'rule out', 'symptom', 'pain']):
        return 'diagnosis'
    elif any(word in q for word in ['treatment', 'therapy', 'manage', 'cure', 'prescribe', 'fever', 'infection']):
        return 'treatment'
    elif any(word in q for word in ['lab', 'cbc', 'blood test', 'report', 'test value', 'interpret']):
        return 'lab'
    elif any(word in q for word in ['chronic', 'long-term', 'diabetes', 'hypertension', 'management']):
        return 'chronic'
    elif any(word in q for word in ['emergency', 'urgent', 'trauma', 'unconscious', 'collapse']):
        return 'emergency'
    else:
        return 'general'

def generate_prompt(query, patient_info=None, file_context=None, file_findings=None, previous_ai_message=None, reset_message=None, matched_disease = None):
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
            "thats good enough": "Thank you for your message! Let me know if you need further assistance.",
        }
        return polite_responses.get(reset_message, "Thank you for your message! Let me know if you need further assistance.")
    if file_context:
        print(f"[generate_prompt] file_context: {file_context}")
    if file_findings:
        print(f"[generate_prompt] file_findings: {file_findings}")
    if previous_ai_message:
        print(f"[generate_prompt] previous_ai_message: {previous_ai_message}")
    query_type = detect_query_type(query)

    # Build detailed patient context if possible
    patient_context = "Not specified"
    if patient_info and all(patient_info.get(key) for key in ['age', 'weight', 'gender']):
        patient_context = f"""- Age: {patient_info.get('age')} years
    - Weight: {patient_info.get('weight')} kg
    - Gender: {patient_info.get('gender')}"""

        if patient_info.get('height'):
            patient_context += f"\n- Height: {patient_info.get('height')} cm"
            if patient_info.get('height') > 0:
                bmi = patient_info.get('weight') / ((patient_info.get('height') / 100) ** 2)
                patient_context += f"\n- BMI: {bmi:.1f}"

        if patient_info.get('bloodPressure'):
            patient_context += f"\n- Blood Pressure: {patient_info.get('bloodPressure')}"
        if patient_info.get('allergies'):
            patient_context += f"\n- Allergies: {patient_info.get('allergies')}"
        if patient_info.get('medications'):
            patient_context += f"\n- Current Medications: {patient_info.get('medications')}"
        if patient_info.get('medicalHistory'):
            patient_context += f"\n- Medical History: {patient_info.get('medicalHistory')}"

    # Prompt templates
    diagnosis_prompt = """You are a clinical decision support assistant for healthcare professionals in India.
Provide a concise, evidence-based differential diagnosis and initial workup for the following case.
Respond in clear, structured bullet points. Reference Indian or international guidelines if possible.
Limit your response to 300 words.

Patient Information:
{patient_context}

Presenting Symptoms:
- {query} or {matched_disease}

Differential Diagnoses:
- List 2–4 likely conditions, considering comorbidities, age, and gender.

Urgent Red Flags:
- List symptoms or findings that require immediate referral or intervention.

Recommended Initial Investigations:
- List relevant imaging or lab tests for the differential diagnosis.

Clinical Notes:
- Caution points, next steps, and references (if any)."""

    treatment_prompt = """You are a clinical treatment advisor for healthcare professionals in India.
Provide a concise, evidence-based treatment plan for the following case.
Use bullet points and reference guidelines where possible. Limit to 300 words.

Patient Information:
{patient_context}

Condition Being Treated:
- {query} or {matched_disease}

First-Line Treatments:
- List recommended medications/interventions, including dosages if appropriate.

Alternatives & Backup Plans:
- List second-line therapies if initial ones fail.

Contraindications:
- Mention age/condition-specific risks and drug interactions.

Monitoring Plan:
- Describe follow-up, monitoring, and when to reassess.

Counseling Points:
- Medication adherence, side effects, and patient education.

References:
- Cite relevant Indian or international guidelines if possible."""

    lab_prompt = """You are a medical lab interpretation assistant for healthcare professionals in India.
Interpret the following test results or suggest appropriate lab workup.
Use bullet points and reference guidelines where possible. Limit to 300 words.

Patient Information:
{patient_context}

Query/Test:
- {query} or {matched_disease}

Possible Interpretations:
- Explain clinical meaning for high/low/normal values.

Differential Possibilities:
- Link abnormal values to possible disease states.

Next Steps:
- Recommend follow-up labs or imaging if needed.

Clinical Notes:
- Limitations, confounding factors, and references (if any)."""

    emergency_prompt = """You are an emergency triage support assistant for healthcare professionals in India.
Provide a concise, structured response for urgent care triage.
Use bullet points and reference guidelines where possible. Limit to 300 words.

Patient Information:
{patient_context}

Emergency Complaint:
- {query} or {matched_disease}

Immediate Actions:
- Initial stabilization and first aid steps.

Urgent Differentials:
- Top 2–3 life-threatening conditions to consider.

Required Investigations:
- Focused labs/imaging to confirm cause.

Referral Guidelines:
- When to call ER, ICU, or specialists.

References:
- Cite relevant guidelines if possible."""

    chronic_prompt = """You are a chronic care assistant for healthcare professionals in India.
Provide a structured, evidence-based plan for long-term management.
Use bullet points and reference guidelines where possible. Limit to 300 words.

Patient Information:
{patient_context}

Chronic Condition:
- {query} or {matched_disease}

Lifestyle Management:
- Diet, exercise, smoking, alcohol, etc.

Pharmacological Management:
- First-line and common maintenance medications.

Monitoring & Follow-Up:
- What to monitor (BP, sugar, etc.) and recommended frequency.

Patient Education:
- Self-care tips, adherence, and warning signs.

References:
- Cite relevant guidelines if possible."""

    general_prompt = """You are a knowledgeable healthcare assistant for professionals in India.
Provide a clear, evidence-based response to the following query.
Use bullet points where possible. Limit to 200 words.

Query:
{query} or {matched_disease}

References:
- Cite relevant guidelines if possible.

Note: This information is for healthcare professionals, not for personal use."""

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

    # Prompt routing based on query type
    if query_type == 'diagnosis':
        return previous_section + diagnosis_prompt.format(patient_context=patient_context, query=query, matched_disease=matched_disease) + file_section
    elif query_type == 'treatment':
        return previous_section + treatment_prompt.format(patient_context=patient_context, query=query, matched_disease=matched_disease) + file_section
    elif query_type == 'lab':
        return previous_section + lab_prompt.format(patient_context=patient_context, query=query, matched_disease=matched_disease) + file_section
    elif query_type == 'emergency':
        return previous_section + emergency_prompt.format(patient_context=patient_context, query=query, matched_disease=matched_disease) + file_section
    elif query_type == 'chronic':
        return previous_section + chronic_prompt.format(patient_context=patient_context, query=query, matched_disease=matched_disease) + file_section
    else:
        return previous_section + general_prompt.format(query=query, matched_disease=matched_disease) + file_section


@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        logger.info("Received chat request")
        data = request.json
        
        user_message = data.get('message', '')
        patient_info = data.get('patientInfo')
        
        logger.info(f"User message: {user_message}")
        logger.info(f"Patient info: {patient_info}")
        
        if not user_message:
            logger.warning("Empty message received")
            return jsonify({"error": "Message is required"}), 400
        
        if len(user_message) > 1000:
            logger.warning("Message too long")
            return jsonify({"error": "Message too long"}), 400
        
        # Get response from Ollama
        response = get_llm_response(user_message, patient_info)
        logger.info(f"Sending response: {response}")
        
        return jsonify({
            "response": response,
            "timestamp": time.time()
        })
        
    except Exception as e:
        logger.error(f"Chat endpoint error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/chat/stream', methods=['POST'])
def chat_stream():
    try:
        logger.info("\n=== Starting new chat stream ===")
        data = request.json
        
        user_message = data.get('message', '')
        patient_info = data.get('patientInfo')
        file_context = data.get('fileContext')
        file_findings = data.get('fileFindings')
        previous_ai_message = data.get('previousAiMessage')
        reset_message = data.get('resetMessage')  # <-- new
        
        logger.info(f"Processing message: '{user_message}' with patient info: {patient_info}, file context: {file_context}, file findings: {file_findings}, previous_ai_message: {previous_ai_message}, reset_message: {reset_message}")
        
        if not user_message:
            logger.warning("Empty message received")
            return jsonify({"error": "Message is required"}), 400
        
        if len(user_message) > 1000:
            logger.warning("Message too long")
            return jsonify({"error": "Message too long"}), 400

        if llm is None and not initialize_llm():
            logger.error("Failed to initialize LLM")
            return jsonify({"error": "Failed to initialize LLM service"}), 503

        def generate():
            try:
                prompt = generate_prompt(user_message, patient_info, file_context, file_findings, previous_ai_message, reset_message)
                logger.info(f"Generated prompt:\n{prompt}")
                response_text = ""
                
                for chunk in llm.stream(prompt):
                    # Process the chunk to ensure proper line breaks
                    chunk = chunk.replace('\n', '\\n')                    
                        # Send the processed chunk
                    yield f"data: {chunk}\n\n"
                logger.info(f"\nNew chunk received")
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
def health_check():
    ollama_healthy = check_ollama_health()
    status = "healthy" if ollama_healthy else "degraded"
    logger.info(f"Health check - Status: {status}")
    return jsonify({
        "status": status,
        "model": MODEL_CONFIG['model_name'],
        "version": "1.0.0"
    })

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

MAX_CHARS = 12000  # ~4000 tokens, safe for prompt + response

# Helper: Call OpenAI Vision API for image interpretation
def interpret_image_with_openai(image_bytes):
    prompt = (
        "You are a board-certified radiologist. Carefully review the following radiology image.\n"
        "- Describe the key findings and any abnormalities you observe.\n"
        "- Provide a differential diagnosis based on the image.\n"
        "- Suggest possible next steps or further imaging if appropriate.\n"
        "- If there are any urgent findings, clearly highlight them.\n"
        "- Use clear, concise, and professional language suitable for a healthcare provider."
    )
    response = openai.ChatCompletion.create(
        model="gpt-4.1",  # or "gpt-4o" if available
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": "data:image/png;base64," + image_bytes.decode()}}
            ]}
        ],
        max_tokens=512
    )
    return response.choices[0].message['content']

# Helper: Call OpenAI for PDF text interpretation
def interpret_text_with_openai(text):
    truncated = text[:MAX_CHARS]
    warning = "" if len(text) <= MAX_CHARS else "\n\n[Note: The document was too long and only the first part was analyzed.]"
    prompt = (
        "You are a clinical laboratory medicine expert. Analyze the following lab report for a patient.\n"
        "- Summarize the key findings and highlight any abnormal values.\n"
        "- Explain the possible clinical significance of these findings.\n"
        "- Suggest potential next steps or follow-up investigations if needed.\n"
        "- If relevant, mention any urgent red flags or findings that require immediate attention.\n"
        "- Use clear, concise, and professional language suitable for a healthcare provider.\n\n"
        f"Lab Report:\n{truncated}{warning}"
    )
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "system", "content": prompt}],
        max_tokens=512
    )
    return response.choices[0].message['content']

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    filename = file.filename
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)
    try:
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
            # Read image and encode as base64
            with open(file_path, 'rb') as img_f:
                import base64
                img_bytes = base64.b64encode(img_f.read())
            result = interpret_image_with_openai(img_bytes)
        elif filename.lower().endswith('.pdf'):
            # Extract text from PDF
            doc = fitz.open(file_path)
            text = "\n".join(page.get_text() for page in doc)
            result = interpret_text_with_openai(text)
        else:
            result = 'Unsupported file type.'
        return jsonify({'result': result})
    except Exception as e:
        return jsonify({'result': f'Error during interpretation: {str(e)}'})

if __name__ == '__main__':
    print(f"API running at http://localhost:{os.getenv('PORT', '5000')}")
    
    # Check if Ollama is running before starting the server
    if not check_ollama_health():
        logger.error("Failed to connect to Ollama service. Please make sure Ollama is running.")
        exit(1)
    
    # Start the Flask server
    app.run(
        debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true',
        host='0.0.0.0',
        port=int(os.getenv('PORT', '5000'))
    )
