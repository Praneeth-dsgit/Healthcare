"""
Analytics Routes
Handles speech-to-text and usage statistics.
Uses JWT for protected routes; identity from Authorization: Bearer <accessToken>.
"""
from flask import Blueprint, request, jsonify, g
import logging
from utils.jwt_utils import require_jwt
import traceback
import os
import time
import openai
from datetime import datetime
from config import UPLOAD_FOLDER
from context_manager import context_manager
from config import db
from services.condition_trend_service import get_condition_trends

logger = logging.getLogger(__name__)

# Create blueprint
analytics_bp = Blueprint('analytics', __name__, url_prefix='/api')

@analytics_bp.route('/speech-to-text', methods=['POST'])
def speech_to_text():
    """
    Process speech-to-text conversion using OpenAI Whisper API
    """
    try:
        # Check if audio file is provided
        if 'audio' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No audio file provided'
            }), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No audio file selected'
            }), 400
        
        # Validate file type
        if not audio_file.content_type.startswith('audio/'):
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Please provide an audio file.'
            }), 400
        
        # Save audio file temporarily
        temp_audio_path = os.path.join(UPLOAD_FOLDER, f"temp_audio_{int(time.time())}.wav")
        audio_file.save(temp_audio_path)
        
        try:
            # Use OpenAI Whisper API for transcription
            with open(temp_audio_path, 'rb') as audio:
                transcript = openai.Audio.transcribe(
                    model="whisper-1",
                    file=audio,
                    response_format="text"
                )
            
            # Clean up temporary file
            os.remove(temp_audio_path)
            
            return jsonify({
                'success': True,
                'transcript': transcript.strip(),
                'confidence': 0.95  # Whisper doesn't provide confidence scores
            })
            
        except Exception as e:
            # Clean up temporary file on error
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)
            raise e
        
    except Exception as e:
        logger.error(f"Speech-to-text error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to process speech-to-text conversion'
        }), 500

@analytics_bp.route('/usage/statistics', methods=['GET'])
@require_jwt
def get_usage_statistics():
    """
    Get comprehensive usage statistics including requests, tokens, costs, and capability breakdown
    """
    try:
        user_email = g.user_email
        
        # Get all sessions for the user using the new user-session mapping
        user_sessions = context_manager.get_user_sessions(user_email)
        
        # Debug logging
        logger.info(f"User email: {user_email}")
        logger.info(f"Total contexts in manager: {len(context_manager.contexts)}")
        logger.info(f"User sessions found: {len(user_sessions)}")
        
        # If no user sessions found, try to associate existing sessions with the user
        if not user_sessions and context_manager.contexts:
            logger.info("No user sessions found, attempting to associate existing sessions")
            for session_id, context in context_manager.contexts.items():
                if not context.user_email:
                    context.user_email = user_email
                    user_sessions.append(session_id)
                    logger.info(f"Associated session {session_id} with user {user_email}")
        
        logger.info(f"Final user sessions count: {len(user_sessions)}")
        
        # If no sessions found, return empty statistics
        if not user_sessions:
            logger.info("No user sessions found, returning empty statistics")
            return jsonify({
                'success': True,
                'user_email': user_email,
                'overall_stats': {
                    'total_requests': 0,
                    'total_input_tokens': 0,
                    'total_output_tokens': 0,
                    'total_cost': 0.0,
                    'avg_tokens_per_request': 0.0,
                    'avg_cost_per_request': 0.0,
                    'total_sessions': 0
                },
                'capability_breakdown': {
                    'general': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
                    'radiology': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
                    'lab': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
                    'engagement': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0}
                },
                'model_breakdown': {
                    'gpt-4.1': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
                    'gpt-4o': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0}
                },
                'current_month': {
                    'requests': 0,
                    'input_tokens': 0,
                    'output_tokens': 0,
                    'cost': 0.0
                },
                'last_updated': datetime.now().isoformat(),
                'debug_info': {
                    'reason': 'No user sessions found',
                    'context_manager_debug': context_manager.debug_contexts()
                }
            })
        
        # Calculate comprehensive statistics
        total_requests = 0
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost = 0.0
        capability_stats = {
            'general': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
            'radiology': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
            'lab': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
            'engagement': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0}
        }
        
        model_stats = {
            'gpt-4.1': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
            'gpt-4o': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0},
            'gpt-4': {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost': 0.0}
        }
        
        # Process each session
        for session_id in user_sessions:
            context = context_manager.get_or_create_context(session_id)
            
            if context.conversation_history:
                for turn in context.conversation_history:
                    total_requests += 1
                    
                    # Estimate tokens (rough calculation)
                    input_tokens = context_manager._count_tokens(turn.user_message)
                    output_tokens = context_manager._count_tokens(turn.ai_response)
                    
                    total_input_tokens += input_tokens
                    total_output_tokens += output_tokens
                    
                    # Estimate cost (using GPT-4.1 pricing as default)
                    # GPT-4.1: $0.01 per 1K input tokens, $0.03 per 1K output tokens
                    input_cost = (input_tokens / 1000) * 0.01
                    output_cost = (output_tokens / 1000) * 0.03
                    turn_cost = input_cost + output_cost
                    total_cost += turn_cost
                    
                    # Capability breakdown
                    capability = turn.capability or 'general'
                    if capability in capability_stats:
                        capability_stats[capability]['requests'] += 1
                        capability_stats[capability]['input_tokens'] += input_tokens
                        capability_stats[capability]['output_tokens'] += output_tokens
                        capability_stats[capability]['cost'] += turn_cost
                    
                    # Model breakdown (assuming GPT-4.1 for now)
                    model = 'gpt-4.1'  # You might want to store this in conversation turns
                    if model in model_stats:
                        model_stats[model]['requests'] += 1
                        model_stats[model]['input_tokens'] += input_tokens
                        model_stats[model]['output_tokens'] += output_tokens
                        model_stats[model]['cost'] += turn_cost
        
        # Calculate averages
        avg_tokens_per_request = total_input_tokens / total_requests if total_requests > 0 else 0
        avg_cost_per_request = total_cost / total_requests if total_requests > 0 else 0
        
        # Get current month stats
        current_month = datetime.now().strftime('%Y-%m')
        current_month_stats = {
            'requests': total_requests,  # Simplified - you might want to filter by date
            'input_tokens': total_input_tokens,
            'output_tokens': total_output_tokens,
            'cost': total_cost
        }
        
        return jsonify({
            'success': True,
            'user_email': user_email,
            'overall_stats': {
                'total_requests': total_requests,
                'total_input_tokens': total_input_tokens,
                'total_output_tokens': total_output_tokens,
                'total_cost': round(total_cost, 4),
                'avg_tokens_per_request': round(avg_tokens_per_request, 2),
                'avg_cost_per_request': round(avg_cost_per_request, 4),
                'total_sessions': len(user_sessions)
            },
            'capability_breakdown': capability_stats,
            'model_breakdown': model_stats,
            'current_month': current_month_stats,
            'last_updated': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error fetching usage statistics: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to fetch usage statistics: {str(e)}'
        }), 500


@analytics_bp.route('/analytics/condition-trends', methods=['GET'])
@require_jwt
def condition_trends():
    """Return condition trend and surge analytics for reports dashboard."""
    try:
        days = int(request.args.get('days', 30))
        days = max(7, min(days, 365))

        doctor_id = None
        if g.user_email:
            row = db.session.execute(
                db.text("SELECT doctor_id FROM doctors WHERE email = :email AND is_active = TRUE LIMIT 1"),
                {"email": g.user_email},
            ).fetchone()
            if row:
                doctor_id = int(row[0])

        payload = get_condition_trends(days=days, doctor_id=doctor_id, top_n=8)
        return jsonify({"success": True, **payload}), 200
    except Exception as e:
        logger.error(f"Error fetching condition trends: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": f"Failed to fetch condition trends: {str(e)}",
            "trends": [],
            "surges": [],
        }), 500

