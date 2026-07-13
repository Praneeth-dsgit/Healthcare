"""
Email Service Module
Contains email sending utilities for OTP and notifications.
"""
import logging
import smtplib
import traceback
from email.mime.text import MIMEText
from config import SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS

logger = logging.getLogger(__name__)

def send_otp_email(email, otp, subject_prefix=''):
    """Helper function to send OTP via email"""
    try:
        smtp_server = SMTP_SERVER.strip() if SMTP_SERVER else None
        smtp_port = SMTP_PORT
        smtp_user = SMTP_USER
        smtp_pass = SMTP_PASS
        
        # Strip whitespace from credentials (common issue with .env files)
        if smtp_user:
            smtp_user = smtp_user.strip()
        if smtp_pass:
            # Remove ALL spaces from password (Gmail App Passwords are 16 chars with no spaces)
            smtp_pass = smtp_pass.replace(' ', '').strip()
            logger.info(f"SMTP password length after processing: {len(smtp_pass)}")
        
        if not smtp_user or not smtp_pass:
            logger.error("SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS in .env file")
            return False, 'Email service not configured. Please contact administrator.'
        
        from_email = smtp_user
        to_email = email
        subject = f'Your OTP Code - MedChat{subject_prefix}'
        body = f'Your OTP code for MedChat is: {otp}\n\nThis code will expire in 5 minutes.\n\nIf you did not request this code, please ignore this email.'
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = from_email
        msg['To'] = to_email
        
        logger.info(f"Attempting to connect to SMTP server: {smtp_server}:{smtp_port}")
        with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
            logger.info("SMTP connection established, starting TLS...")
            server.starttls()
            logger.info("TLS started, attempting login...")
            server.login(smtp_user, smtp_pass)
            logger.info("SMTP login successful, sending email...")
            server.sendmail(from_email, [to_email], msg.as_string())
            logger.info("Email sent successfully")
        logger.info(f"OTP email sent successfully to {email}")
        return True, None
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP Authentication failed: {e}")
        logger.error(f"SMTP_SERVER: {smtp_server}, SMTP_PORT: {smtp_port}")
        logger.error(f"SMTP_USER: {smtp_user if smtp_user else 'NOT SET'}")
        logger.error(f"SMTP_PASS: {'***SET***' if smtp_pass else 'NOT SET'} (length: {len(smtp_pass) if smtp_pass else 0})")
        logger.error("See EMAIL_SETUP_INSTRUCTIONS.md for detailed setup guide")
        
        # Provide more specific error message
        error_details = str(e)
        if '535' in error_details or 'Username and Password not accepted' in error_details:
            return False, 'SMTP authentication failed: Invalid username or password. For Gmail, ensure you are using an App Password (not your regular password). See EMAIL_SETUP_INSTRUCTIONS.md for setup instructions.'
        else:
            return False, f'SMTP authentication failed: {error_details}. Please check your SMTP credentials in .env file. See EMAIL_SETUP_INSTRUCTIONS.md for setup instructions.'
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
        logger.error(traceback.format_exc())
        return False, f'Failed to send OTP: {str(e)}. Please check your email configuration in .env file. See EMAIL_SETUP_INSTRUCTIONS.md for setup instructions.'


def send_engagement_email(email, subject, body):
    """Send a patient engagement email (reminders, follow-ups, campaigns)."""
    try:
        smtp_server = SMTP_SERVER.strip() if SMTP_SERVER else None
        smtp_port = SMTP_PORT
        smtp_user = SMTP_USER.strip() if SMTP_USER else None
        smtp_pass = SMTP_PASS.replace(' ', '').strip() if SMTP_PASS else None

        if not smtp_user or not smtp_pass:
            logger.error('SMTP credentials not configured for engagement email')
            return False, 'Email service not configured'

        msg = MIMEText(body or '')
        msg['Subject'] = subject or 'Acufore Health'
        msg['From'] = smtp_user
        msg['To'] = email

        with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [email], msg.as_string())
        logger.info('Engagement email sent to %s', email)
        return True, None
    except Exception as e:
        logger.error('Failed to send engagement email: %s', e)
        logger.error(traceback.format_exc())
        return False, str(e)

