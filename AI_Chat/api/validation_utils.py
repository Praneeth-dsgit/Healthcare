from functools import wraps
import json
import logging
from flask import request, jsonify
from pydantic import ValidationError
from typing import Type, Dict, Any, Optional, List

from models import BaseModel

logger = logging.getLogger(__name__)


def pydantic_errors_for_json(errors: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Pydantic v2 error dicts may include non-JSON values (e.g. ctx.error: ValueError). Round-trip via default=str."""
    return json.loads(json.dumps(errors, default=str))

def validate_request(model_class: Type[BaseModel]):
    """
    Decorator to validate request data using Pydantic models
    
    Usage:
    @app.route('/api/chat', methods=['POST'])
    @validate_request(ChatRequest)
    def chat_endpoint():
        # request.data will be validated and available as validated_data
        pass
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                # Get JSON data from request
                if request.is_json:
                    data = request.get_json()
                else:
                    # Handle form data or other content types
                    data = dict(request.form)
                    # Add files if present
                    if request.files:
                        data['files'] = request.files
                
                # Validate data using Pydantic model
                validated_data = model_class(**data)
                
                # Add validated data to request object for easy access
                request.validated_data = validated_data
                
                return f(*args, **kwargs)
                
            except ValidationError as e:
                safe_details = pydantic_errors_for_json(e.errors())
                logger.warning(f"Validation error: {safe_details}")
                return jsonify({
                    'success': False,
                    'error': 'Validation error',
                    'details': safe_details
                }), 400
                
            except Exception as e:
                logger.error(f"Unexpected error during validation: {str(e)}")
                return jsonify({
                    'success': False,
                    'error': 'Internal server error during validation'
                }), 500
                
        return decorated_function
    return decorator

def validate_response(model_class: Type[BaseModel]):
    """
    Decorator to validate response data using Pydantic models
    
    Usage:
    @app.route('/api/health', methods=['GET'])
    @validate_response(HealthCheck)
    def health_check():
        return HealthCheck(status="healthy")
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                result = f(*args, **kwargs)
                
                # If result is already a Pydantic model, validate it
                if isinstance(result, BaseModel):
                    validated_response = result
                else:
                    # If result is a dict, validate it
                    validated_response = model_class(**result)
                
                # Convert to dict for JSON response
                return jsonify(validated_response.dict())
                
            except ValidationError as e:
                safe_details = pydantic_errors_for_json(e.errors())
                logger.error(f"Response validation error: {safe_details}")
                return jsonify({
                    'success': False,
                    'error': 'Response validation error',
                    'details': safe_details
                }), 500
                
            except Exception as e:
                logger.error(f"Unexpected error during response validation: {str(e)}")
                return jsonify({
                    'success': False,
                    'error': 'Internal server error during response validation'
                }), 500
                
        return decorated_function
    return decorator

def handle_validation_errors(f):
    """
    Generic error handler for validation errors
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValidationError as e:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'details': pydantic_errors_for_json(e.errors())
            }), 400
        except ValueError as e:
            return jsonify({
                'success': False,
                'error': 'Invalid data',
                'message': str(e)
            }), 400
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            return jsonify({
                'success': False,
                'error': 'Internal server error'
            }), 500
    return decorated_function

def validate_patient_info(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate patient information with custom healthcare rules
    """
    from models import PatientInfo, HealthcareValidator
    
    try:
        # Validate using Pydantic model
        patient_info = PatientInfo(**data)
        
        # Additional healthcare-specific validations
        HealthcareValidator.validate_age_for_capability(
            patient_info.age, 
            getattr(request, 'capability', 'general')
        )
        
        # Calculate and validate BMI
        bmi = HealthcareValidator.validate_bmi(patient_info.weight, patient_info.height)
        
        # Add calculated BMI to the validated data
        validated_data = patient_info.dict()
        validated_data['bmi'] = round(bmi, 2)
        
        return validated_data
        
    except ValidationError as e:
        raise ValueError(f"Patient data validation failed: {e.errors()}")
    except Exception as e:
        raise ValueError(f"Patient data validation error: {str(e)}")

def validate_file_upload_data(file, capability: str) -> Dict[str, Any]:
    """
    Validate file upload data based on capability
    """
    from models import CapabilityType
    
    if not file:
        raise ValueError("No file provided")
    
    # Read file content once and store it
    file_content = file.read()
    file_size = len(file_content)
    
    # Validate file size (10MB limit)
    if file_size > 10 * 1024 * 1024:  # 10MB
        raise ValueError("File size exceeds 10MB limit")
    
    # Reset file pointer to beginning
    file.seek(0)
    
    # Validate file type based on capability
    allowed_types = {
        CapabilityType.GENERAL: ['application/pdf'],
        CapabilityType.LAB: ['application/pdf'],
        CapabilityType.RADIOLOGY: ['image/jpeg', 'image/png', 'image/jpg']
    }
    
    if capability in allowed_types and file.content_type not in allowed_types[capability]:
        raise ValueError(f"File type {file.content_type} not allowed for {capability} capability")
    
    return {
        'file': file,
        'file_name': file.filename,
        'file_type': file.content_type,
        'file_size': file_size
    }

# Example usage in Flask routes
def example_usage():
    """
    Example of how to use these validation utilities in Flask routes
    """
    
    # Example 1: Validate request data
    """
    @app.route('/api/chat/stream', methods=['POST'])
    @validate_request(ChatRequest)
    def chat_stream():
        # Access validated data
        chat_request = request.validated_data
        
        # Use validated data
        message = chat_request.message
        patient_info = chat_request.patient_info
        capability = chat_request.capability
        
        # Process the request...
        return Response(generate_stream(), mimetype='text/plain')
    """
    
    # Example 2: Validate response data
    """
    @app.route('/api/health', methods=['GET'])
    @validate_response(HealthCheck)
    def health_check():
        return HealthCheck(
            status="healthy",
            version="1.0.0",
            uptime=12345.67
        )
    """
    
    # Example 3: Manual validation with error handling
    """
    @app.route('/api/patient-info', methods=['POST'])
    @handle_validation_errors
    def update_patient_info():
        data = request.get_json()
        
        # Validate patient data
        validated_patient = validate_patient_info(data)
        
        # Process validated data...
        return jsonify({
            'success': True,
            'data': validated_patient
        })
    """
    
    # Example 4: File upload validation
    """
    @app.route('/api/upload', methods=['POST'])
    @handle_validation_errors
    def upload_file():
        if 'file' not in request.files:
            raise ValueError("No file provided")
        
        file = request.files['file']
        capability = request.form.get('capability', 'general')
        
        # Validate file upload
        validated_upload = validate_file_upload_data(file, capability)
        
        # Process file upload...
        return jsonify({
            'success': True,
            'file_name': validated_upload['file_name']
        })
    """

# Error response templates
def create_error_response(error_type: str, message: str, details: Optional[Dict] = None) -> Dict[str, Any]:
    """Create standardized error responses"""
    response = {
        'success': False,
        'error': error_type,
        'message': message
    }
    if details:
        response['details'] = details
    return response

def create_success_response(data: Optional[Dict] = None, message: str = "Success") -> Dict[str, Any]:
    """Create standardized success responses"""
    response = {
        'success': True,
        'message': message
    }
    if data:
        response['data'] = data
    return response 