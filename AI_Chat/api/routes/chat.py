"""
Chat Routes
Handles AI chat streaming, context management, and patient portal chat.
Uses JWT for auth; identity from Authorization: Bearer <accessToken>.
"""
from flask import Blueprint, request, jsonify, Response, g
import logging
import traceback
import re
import openai
from config import db
from validation_utils import validate_request
from models import ChatRequest
from context_manager import context_manager
from services.ai_service import generate_capability_prompt, get_chat_stream_system_message
from utils.jwt_utils import require_jwt

logger = logging.getLogger(__name__)

# Create blueprint
chat_bp = Blueprint('chat', __name__, url_prefix='/api')

@chat_bp.route('/chat/stream', methods=['POST'])
@require_jwt
@validate_request(ChatRequest)
def chat_stream():
    try:
        logger.info("\n=== Starting new chat stream ===")
        
        # Get validated data from decorator; user identity from JWT only
        chat_request = request.validated_data
        user_email = g.user_email
        
        user_message = chat_request.message
        patient_info = chat_request.patient_info
        if patient_info is not None and hasattr(patient_info, 'model_dump'):
            patient_info = patient_info.model_dump()
        elif patient_info is not None and hasattr(patient_info, 'dict'):
            patient_info = patient_info.dict()
        file_context = chat_request.file_context
        file_findings = chat_request.file_findings
        previous_ai_message = chat_request.previous_ai_message
        reset_message = chat_request.reset_message
        capability = chat_request.capability
        session_id = chat_request.session_id or "default_session"
        
        logger.info(f"Processing message: '{user_message}' with capability: {capability}, session: {session_id}, user: {user_email}")

        capability_str = capability.value if hasattr(capability, 'value') else str(capability)
        from services.patient_context_service import (
            build_patient_info_from_db,
            enrich_file_findings_from_stored_records,
        )

        if chat_request.patient_id:
            logger.info(f"Loading patient context from database: {chat_request.patient_id}")
            loaded = build_patient_info_from_db(chat_request.patient_id, capability_str)
            if loaded:
                patient_info = loaded
            else:
                logger.warning(f"No patient found for patient_id: {chat_request.patient_id}")
        elif not patient_info:
            from db_read_agent import DatabaseAgent
            db_agent = DatabaseAgent()
            patient_identifier = db_agent.extract_patient_identifier_from_query(user_message)
            if patient_identifier:
                logger.info(f"Detected patient identifier in query: '{patient_identifier}'")
                loaded = build_patient_info_from_db(patient_identifier, capability_str)
                if loaded:
                    patient_info = loaded
                    logger.info(
                        "Loaded patient %s with %s medical record(s)",
                        patient_identifier,
                        len(loaded.get('medicalRecords', [])),
                    )
                else:
                    logger.warning(f"Could not find patient with identifier: '{patient_identifier}'")

        auto_file_findings = enrich_file_findings_from_stored_records(
            patient_info,
            capability_str,
            user_message,
            file_findings,
        )
        if auto_file_findings:
            file_findings = auto_file_findings
            logger.info(
                "Loaded stored medical record content for AI analysis (%s chars)",
                len(file_findings),
            )

        # Update context manager with current state and user association
        if patient_info:
            context_manager.update_patient_context(session_id, patient_info)
        context_manager.update_capability_context(session_id, capability)
        
        # Associate session with user if email is provided
        if user_email:
            context_manager.get_or_create_context(session_id, user_email)
        
        # Handle context reset
        if reset_message:
            context_manager.clear_context(session_id)
            logger.info(f"Context reset for session {session_id}")
            return jsonify({"message": "Context cleared. Starting fresh conversation."})

        def generate():
            try:
                # Generate capability-specific prompt with structured formatting
                prompt = generate_capability_prompt(
                    user_message, capability, patient_info, file_context, file_findings, previous_ai_message, reset_message
                )
                
                logger.info(f"Generated capability-specific prompt for {capability} capability")
                
                # Use OpenAI streaming with structured formatting enforcement
                response = openai.ChatCompletion.create(
                    model="gpt-4.1",
                    messages=[
                        {"role": "system", "content": get_chat_stream_system_message(capability)},
                        {"role": "user", "content": prompt}
                    ],
                    stream=True,
                    max_tokens=1024,
                    temperature=0.7
                )
                
                ai_response_parts = []
                
                for chunk in response:
                    if 'choices' in chunk and len(chunk['choices']) > 0:
                        delta = chunk['choices'][0].get('delta', {})
                        if 'content' in delta:
                            content = delta['content']
                            ai_response_parts.append(content)
                            
                            # Normalize excessive newlines in the chunk: replace 3+ consecutive newlines with max 2
                            content = re.sub(r'\n{3,}', '\n\n', content)
                            
                            # Process the chunk to ensure proper line breaks for JSON
                            content = content.replace('\n', '\\n')
                            yield f"data: {content}\n\n"
                
                # Store conversation turn in context manager
                ai_response = ''.join(ai_response_parts)
                # Normalize excessive newlines in the final accumulated response
                ai_response = re.sub(r'\n{3,}', '\n\n', ai_response)
                context_manager.add_conversation_turn(
                    session_id, user_message, ai_response, capability, {"context_type": "capability_specific"}
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

@chat_bp.route('/context/analyze', methods=['POST'])
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

@chat_bp.route('/context/summary/<session_id>', methods=['GET'])
def get_context_summary(session_id):
    """Get context summary for a session"""
    try:
        summary = context_manager.get_context_summary(session_id)
        return jsonify(summary)
    except Exception as e:
        logger.error(f"Context summary error: {e}")
        return jsonify({"error": "Failed to get context summary"}), 500

@chat_bp.route('/context/clear/<session_id>', methods=['POST'])
def clear_context(session_id):
    """Clear context for a session"""
    try:
        context_manager.clear_context(session_id)
        return jsonify({"message": f"Context cleared for session {session_id}"})
    except Exception as e:
        logger.error(f"Context clear error: {e}")
        return jsonify({"error": "Failed to clear context"}), 500

@chat_bp.route('/context/tokens/<session_id>', methods=['GET'])
def get_token_usage(session_id):
    """Get token usage summary for a session"""
    try:
        token_summary = context_manager.get_token_usage_summary(session_id)
        return jsonify(token_summary)
    except Exception as e:
        logger.error(f"Token usage error: {e}")
        return jsonify({"error": "Failed to get token usage"}), 500

