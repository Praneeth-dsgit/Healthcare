"""
Configuration module for the Healthcare AI application.
Centralizes all configuration settings, environment variables, and app initialization.
"""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, Response, make_response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import pymysql
import openai
import json

# Load environment variables
load_dotenv()
# Silence harmless Windows symlink cache warning from huggingface_hub
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

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

# Configure CORS (strip whitespace from env list)
CORS_ORIGINS = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173,http://192.168.5.111:5173').split(',') if o.strip()]
# Enable CORS for all routes with explicit header support
CORS_HEADERS = [
    "Content-Type", "Authorization", "X-Requested-With", "Accept",
    "X-Patient-ID", "X-User-Email"
]
CORS(app, 
     origins=CORS_ORIGINS,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
     allow_headers=CORS_HEADERS,
     supports_credentials=False)


@app.before_request
def handle_preflight():
    """Respond to CORS preflight OPTIONS with 200 and explicit CORS headers. Never fail."""
    if request.method != "OPTIONS":
        return None
    try:
        origin = (request.headers.get("Origin") or "").strip()
        allow_origin = origin if origin else "*"
        resp = make_response("", 200)
        resp.headers["Access-Control-Allow-Origin"] = allow_origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        resp.headers["Access-Control-Allow-Headers"] = ", ".join(CORS_HEADERS)
        resp.headers["Access-Control-Max-Age"] = "86400"
        return resp
    except Exception as e:
        logger.warning("Preflight handler error: %s", e)
        resp = make_response("", 200)
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return resp


# Security headers middleware
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

# Load diseases JSON file
DISEASES_FILE = 'medicine_kbase.json'
try:
    with open(DISEASES_FILE, encoding='utf-8') as f:
        diseases = json.load(f)
    logger.info(f"Loaded diseases knowledge base from {DISEASES_FILE}")
except FileNotFoundError:
    logger.warning(f"Diseases file {DISEASES_FILE} not found. Continuing without it.")
    diseases = {}

# Load medicine catalog JSON file (medicine/molecule rows)
MEDICINE_CATALOG_FILE = 'medicine_catalog.json'
try:
    with open(MEDICINE_CATALOG_FILE, encoding='utf-8') as f:
        medicine_catalog = json.load(f)
    logger.info(f"Loaded medicine catalog from {MEDICINE_CATALOG_FILE}")
except FileNotFoundError:
    logger.warning(f"Medicine catalog file {MEDICINE_CATALOG_FILE} not found. Continuing without it.")
    medicine_catalog = {}

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

# File Upload Configuration
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Ensure upload directory is writable
if not os.access(UPLOAD_FOLDER, os.W_OK):
    logger.error(f"Upload directory {UPLOAD_FOLDER} is not writable")
    raise RuntimeError(f"Upload directory {UPLOAD_FOLDER} is not writable")

logger.info(f"Upload directory configured: {UPLOAD_FOLDER}")

MAX_CHARS = 12000  # ~4000 tokens, safe for prompt + response

# SMTP Configuration
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
SMTP_USER = os.getenv('SMTP_USER')
SMTP_PASS = os.getenv('SMTP_PASS')

# Log SMTP configuration at startup (without showing password)
if SMTP_USER and SMTP_PASS:
    logger.info(f"SMTP Configuration loaded: Server={SMTP_SERVER}, Port={SMTP_PORT}, User={SMTP_USER}, Password={'***SET***' if SMTP_PASS else 'NOT SET'}")
else:
    logger.warning("SMTP credentials not configured. OTP emails will not work. Please set SMTP_USER and SMTP_PASS in .env file")

# MedGemma / radiology vision configuration
HF_API_TOKEN = os.getenv('HF_API_TOKEN') or os.getenv('HUGGINGFACE_API_TOKEN')
MEDGEMMA_MODEL_ID = os.getenv('MEDGEMMA_MODEL_ID', 'google/medgemma-1.5-4b-it')
MEDGEMMA_MAX_TOKENS = int(os.getenv('MEDGEMMA_MAX_TOKENS', '2000'))
MEDGEMMA_LOCAL_DIR = os.getenv(
    'MEDGEMMA_LOCAL_DIR',
    os.path.join(os.path.dirname(__file__), 'models', 'medgemma-1.5-4b-it'),
)
MEDGEMMA_LOCAL = os.getenv('MEDGEMMA_LOCAL', 'false').lower() in ('1', 'true', 'yes')
GOOGLE_CLOUD_PROJECT = os.getenv('GOOGLE_CLOUD_PROJECT') or os.getenv('GCP_PROJECT_ID')
GOOGLE_CLOUD_LOCATION = os.getenv('GOOGLE_CLOUD_LOCATION', 'us-central1')
MEDGEMMA_VERTEX = os.getenv('MEDGEMMA_VERTEX', 'false').lower() in ('1', 'true', 'yes')
# auto | local | vertex | hf
MEDGEMMA_PROVIDER = os.getenv('MEDGEMMA_PROVIDER', 'auto').lower()
_medgemma_available = MEDGEMMA_LOCAL or MEDGEMMA_VERTEX or HF_API_TOKEN or GOOGLE_CLOUD_PROJECT
_default_radiology_vision = 'medgemma' if _medgemma_available else 'openai'
RADIOLOGY_VISION_PROVIDER = os.getenv('RADIOLOGY_VISION_PROVIDER', _default_radiology_vision).lower()
if RADIOLOGY_VISION_PROVIDER == 'medgemma' and not _medgemma_available:
    logger.warning(
        "RADIOLOGY_VISION_PROVIDER=medgemma but no MedGemma backend is configured. "
        "Set MEDGEMMA_LOCAL=true, MEDGEMMA_VERTEX=true + GOOGLE_CLOUD_PROJECT, or HF_API_TOKEN. "
        "Radiology images will fall back to OpenAI GPT-4o."
    )

JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY')
if not JWT_SECRET_KEY:
    import secrets
    _jwt_dev_file = os.path.join(os.path.dirname(__file__), '.jwt_secret_dev')
    try:
        if os.path.isfile(_jwt_dev_file):
            with open(_jwt_dev_file, encoding='utf-8') as _f:
                JWT_SECRET_KEY = _f.read().strip()
        if not JWT_SECRET_KEY:
            JWT_SECRET_KEY = secrets.token_hex(32)
            with open(_jwt_dev_file, 'w', encoding='utf-8') as _f:
                _f.write(JWT_SECRET_KEY)
            logger.info("Created persistent dev JWT secret at %s", _jwt_dev_file)
    except OSError as exc:
        JWT_SECRET_KEY = secrets.token_hex(32)
        logger.warning(
            "JWT_SECRET_KEY not set and could not persist dev secret (%s); "
            "tokens will not survive API restarts.",
            exc,
        )
    if not os.getenv('JWT_SECRET_KEY'):
        logger.warning(
            "JWT_SECRET_KEY not set in .env; using dev file secret. "
            "Set JWT_SECRET_KEY in production."
        )
JWT_ACCESS_EXPIRY_MINUTES = int(os.getenv('JWT_ACCESS_EXPIRY_MINUTES', '15'))
JWT_REFRESH_EXPIRY_DAYS = int(os.getenv('JWT_REFRESH_EXPIRY_DAYS', '7'))
JWT_ALGORITHM = 'HS256'

# Initialize models from database_models
from database_models import create_models
models = create_models(db)
User = models['User']
Patient = models.get('Patient')
FamilyMember = models.get('FamilyMember')

# Create the database tables if they don't exist
with app.app_context():
    db.create_all()

