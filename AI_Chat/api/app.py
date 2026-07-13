"""
Main Flask Application
This is the entry point for the Flask application.
All routes are now modularized into blueprints in the routes/ directory.
All configuration is centralized in config.py.
"""
import os
import logging

# Import the Flask app instance from config (which has all configuration)
from config import app, logger, OPENAI_API_KEY

# Import and register blueprints (modularized routes)
try:
    from routes.auth import auth_bp
    from routes.health import health_bp
    from routes.chat import chat_bp
    from routes.uploads import uploads_bp
    from routes.patients import patients_bp
    from routes.appointments import appointments_bp
    from routes.doctors import doctors_bp
    from routes.radiology import radiology_bp
    from routes.notifications import notifications_bp
    from routes.faqs import faqs_bp
    from routes.analytics import analytics_bp
    from routes.patient_engagement import patient_engagement_bp, patient_portal_bp
    from routes.admin import admin_bp
    from routes.telemedicine import telemedicine_bp
    
    from routes.referrals import referrals_bp
    from routes.doctor_network import doctor_network_bp
    from routes.engagement import engagement_bp
    from routes.billing import billing_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(patients_bp)
    app.register_blueprint(appointments_bp)
    app.register_blueprint(doctors_bp)
    app.register_blueprint(radiology_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(faqs_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(patient_engagement_bp)
    app.register_blueprint(patient_portal_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(telemedicine_bp)
    app.register_blueprint(referrals_bp)
    app.register_blueprint(doctor_network_bp)
    app.register_blueprint(engagement_bp)
    app.register_blueprint(billing_bp)

    try:
        from services.engagement_scheduler import start_engagement_scheduler
        start_engagement_scheduler(app)
    except Exception as sched_exc:
        logger.warning('Engagement scheduler not started: %s', sched_exc)

    # CORS preflight: OPTIONS for any path returns 200 with CORS headers (ensures preflight always succeeds)
    from flask import make_response, request
    from config import CORS_HEADERS
    @app.route("/", methods=["OPTIONS"])
    @app.route("/<path:path>", methods=["OPTIONS"])
    def cors_preflight(path=None):
        origin = (request.headers.get("Origin") or "").strip()
        allow_origin = origin if origin else "*"
        resp = make_response("", 200)
        resp.headers["Access-Control-Allow-Origin"] = allow_origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        resp.headers["Access-Control-Allow-Headers"] = ", ".join(CORS_HEADERS)
        resp.headers["Access-Control-Max-Age"] = "86400"
        return resp

    @app.route("/")
    def index():
        from flask import jsonify
        return jsonify({
            "message": "Healthcare AI API",
            "docs": "Use /api/health for health check, /api/login for auth.",
        }), 200
    
    logger.info("✅ Registered blueprints: auth, health, chat, uploads, patients, appointments, doctors, radiology, notifications, faqs, analytics, patient_engagement, patient_portal, admin, engagement, billing")
except ImportError as e:
    logger.error(f"❌ Could not import blueprints: {e}")
    logger.error("Please ensure all route modules exist in the routes/ directory")
    raise
except Exception as e:
    logger.error(f"❌ Error registering blueprints: {e}")
    raise

if __name__ == '__main__':
    print(f"🚀 Starting Flask API server...")
    print(f"📡 API will be available at http://localhost:{os.getenv('PORT', '5000')}")
    
    # Check if OpenAI API key is configured
    if not OPENAI_API_KEY:
        logger.warning("⚠️  OPENAI_API_KEY not configured. Some features may not work.")
    
    # Start the Flask server
    app.run(
        debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true',
        host='0.0.0.0',
        port=int(os.getenv('PORT', '5000'))
    )
