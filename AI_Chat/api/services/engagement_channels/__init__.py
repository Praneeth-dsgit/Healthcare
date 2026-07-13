"""Engagement channel adapters: in-app, email, SMS, WhatsApp."""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def send_in_app(patient_id: str, title: str, message: str, notification_type: str = 'engagement') -> Dict[str, Any]:
    """Create an in-app notification row for the patient."""
    try:
        from config import db

        db.session.execute(
            db.text(
                """
                INSERT INTO notifications (patient_id, notification_type, title, message, is_read, created_at)
                VALUES (:patient_id, :notification_type, :title, :message, 0, NOW())
                """
            ),
            {
                'patient_id': patient_id,
                'notification_type': notification_type,
                'title': title[:255],
                'message': message,
            },
        )
        db.session.commit()
        return {'success': True, 'channel': 'in_app'}
    except Exception as exc:
        logger.error('In-app notification failed for %s: %s', patient_id, exc)
        try:
            from config import db
            db.session.rollback()
        except Exception:
            pass
        return {'success': False, 'channel': 'in_app', 'error': str(exc)}


def send_email(to_email: str, subject: str, body: str) -> Dict[str, Any]:
    """Send engagement email via SMTP."""
    try:
        from services.email_service import send_engagement_email

        ok, err = send_engagement_email(to_email, subject, body)
        if ok:
            return {'success': True, 'channel': 'email'}
        return {'success': False, 'channel': 'email', 'error': err or 'Email send failed'}
    except Exception as exc:
        logger.error('Email engagement failed: %s', exc)
        return {'success': False, 'channel': 'email', 'error': str(exc)}


def send_sms(phone: str, message: str) -> Dict[str, Any]:
    """Send SMS via Twilio when configured; otherwise log-only stub."""
    enabled = os.getenv('ENGAGEMENT_SMS_ENABLED', 'false').lower() in ('1', 'true', 'yes')
    account_sid = os.getenv('TWILIO_ACCOUNT_SID')
    auth_token = os.getenv('TWILIO_AUTH_TOKEN')
    from_number = os.getenv('TWILIO_FROM_NUMBER')

    if not enabled or not all([account_sid, auth_token, from_number]):
        logger.info('SMS (not sent — Twilio not configured): %s — %s', phone, message[:120])
        return {
            'success': True,
            'channel': 'sms',
            'simulated': True,
            'detail': 'SMS logged only (Twilio not configured)',
        }

    try:
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        result = client.messages.create(body=message, from_=from_number, to=phone)
        return {'success': True, 'channel': 'sms', 'message_sid': result.sid}
    except ImportError:
        logger.warning('twilio package not installed; SMS simulated')
        return {
            'success': True,
            'channel': 'sms',
            'simulated': True,
            'detail': 'twilio package not installed',
        }
    except Exception as exc:
        logger.error('SMS send failed: %s', exc)
        return {'success': False, 'channel': 'sms', 'error': str(exc)}


def send_whatsapp(patient_identifier: str, message: str, phone: Optional[str] = None) -> Dict[str, Any]:
    """Send WhatsApp via existing notifier."""
    try:
        from whatsapp_integration import whatsapp_notifier

        if phone:
            result = whatsapp_notifier.send_message(phone, message)
        else:
            result = whatsapp_notifier.send_custom_notification(patient_identifier, message)
        return {
            'success': bool(result.get('success')),
            'channel': 'whatsapp',
            'error': result.get('error'),
            'message_id': result.get('message_id'),
        }
    except Exception as exc:
        logger.error('WhatsApp engagement failed: %s', exc)
        return {'success': False, 'channel': 'whatsapp', 'error': str(exc)}
