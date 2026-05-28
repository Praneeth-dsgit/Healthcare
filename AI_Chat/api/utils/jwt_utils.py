"""
JWT utilities for stateless authentication.
Access and refresh tokens; no session cookies.
"""
import logging
from datetime import datetime, timedelta
from functools import wraps

import jwt
from flask import request, jsonify, g

from config import (
    JWT_SECRET_KEY,
    JWT_ALGORITHM,
    JWT_ACCESS_EXPIRY_MINUTES,
    JWT_REFRESH_EXPIRY_DAYS,
    db,
)

logger = logging.getLogger(__name__)

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def create_access_token(user_id: int, email: str) -> str:
    """Create a short-lived JWT access token."""
    payload = {
        "sub": user_id,
        "email": email,
        "type": TOKEN_TYPE_ACCESS,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=JWT_ACCESS_EXPIRY_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: int, email: str) -> str:
    """Create a long-lived JWT refresh token."""
    payload = {
        "sub": user_id,
        "email": email,
        "type": TOKEN_TYPE_REFRESH,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=JWT_REFRESH_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_token(token: str, expected_type: str = TOKEN_TYPE_ACCESS) -> dict:
    """
    Verify JWT and return payload. Raises jwt.InvalidTokenError if invalid.
    """
    payload = jwt.decode(
        token,
        JWT_SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
    )
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Invalid token type")
    return payload


def get_patient_id_for_user(user_id: int, email: str | None = None) -> str | None:
    """Resolve patient_id for a user (patients only). Returns None for doctors/admins."""
    try:
        result = db.session.execute(
            db.text("SELECT patient_id FROM patients WHERE user_id = :user_id AND is_active = TRUE LIMIT 1"),
            {"user_id": user_id},
        ).fetchone()
        if result:
            return result[0]
        # Fallback: resolve by email (handles cases where user_id link is missing)
        if email:
            result = db.session.execute(
                db.text("""
                    SELECT p.patient_id FROM patients p
                    JOIN users u ON p.user_id = u.id
                    WHERE u.email = :email AND p.is_active = TRUE LIMIT 1
                """),
                {"email": email},
            ).fetchone()
            return result[0] if result else None
        return None
    except Exception as e:
        logger.warning("Failed to resolve patient_id for user %s: %s", user_id, e)
        return None


def require_jwt(f):
    """
    Decorator for protected routes. Extracts Bearer token from Authorization header,
    verifies JWT (access token), and sets g.user_id, g.user_email, g.patient_id.
    Returns 401 if missing or invalid token.
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == "OPTIONS":
            return f(*args, **kwargs)
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization header with Bearer token is required"}), 401
        token = auth_header[7:].strip()
        if not token:
            return jsonify({"error": "Authorization header with Bearer token is required"}), 401
        try:
            payload = verify_token(token, expected_type=TOKEN_TYPE_ACCESS)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Access token has expired"}), 401
        except jwt.InvalidTokenError as e:
            logger.warning("Invalid JWT: %s", e)
            return jsonify({"error": "Invalid or expired token"}), 401
        g.user_id = payload["sub"]
        g.user_email = payload["email"]
        g.patient_id = get_patient_id_for_user(g.user_id, g.user_email)
        return f(*args, **kwargs)

    return decorated
