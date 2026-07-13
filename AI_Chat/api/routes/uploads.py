"""
File Upload Routes
Handles file uploads and processing (images, PDFs).
"""
from flask import Blueprint, request, jsonify
import logging
import os
import base64
import fitz  # PyMuPDF
from config import UPLOAD_FOLDER
from validation_utils import handle_validation_errors, validate_file_upload_data
from services.file_service import interpret_image_with_openai, interpret_text_with_openai

logger = logging.getLogger(__name__)

# Create blueprint
uploads_bp = Blueprint('uploads', __name__, url_prefix='/api')

@uploads_bp.route('/upload', methods=['POST'])
@handle_validation_errors
def upload_file():
    if 'file' not in request.files:
        raise ValueError("No file provided")
    
    file = request.files['file']
    capability = request.form.get('capability', 'general')
    
    if file.filename == '':
        raise ValueError("No selected file")
    
    # Validate file upload using Pydantic utilities
    validated_upload = validate_file_upload_data(file, capability)
    
    filename = file.filename
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    
    # Add debugging for file upload
    logger.info(f"Uploading file: {filename}")
    logger.info(f"File path: {file_path}")
    
    # Check if file has content (without consuming the stream)
    if hasattr(file, 'content_length'):
        logger.info(f"File content length: {file.content_length}")
    elif hasattr(file, 'content_type'):
        logger.info(f"File content type: {file.content_type}")
    
    # Save the file
    file.save(file_path)
    
    # Verify file was saved
    if not os.path.exists(file_path):
        return jsonify({'result': 'Error: Failed to save uploaded file'})
    
    logger.info(f"File saved successfully. File size: {os.path.getsize(file_path)} bytes")
    
    try:
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
            # Validate file exists and is readable
            if not os.path.exists(file_path):
                return jsonify({'result': 'Error: Uploaded file not found'})
            
            # Check file size (limit to 10MB)
            file_size = os.path.getsize(file_path)
            if file_size > 10 * 1024 * 1024:  # 10MB
                return jsonify({'result': 'Error: File too large (max 10MB)'})
            
            # Read image and encode as base64
            try:
                with open(file_path, 'rb') as img_f:
                    img_data = img_f.read()
                    logger.info(f"Read {len(img_data)} bytes from file")
                    
                    if not img_data:
                        logger.error(f"File is empty: {file_path}")
                        return jsonify({'result': 'Error: Empty image file'})
                    
                    if len(img_data) < 100:  # Suspiciously small for an image
                        logger.warning(f"File seems too small: {len(img_data)} bytes")
                    
                    img_bytes = base64.b64encode(img_data)
                    logger.info(f"Base64 encoded to {len(img_bytes)} bytes")
                    
            except IOError as e:
                logger.error(f"Error reading file {file_path}: {e}")
                return jsonify({'result': f'Error reading file: {str(e)}'})
            except Exception as e:
                logger.error(f"Unexpected error reading file: {e}")
                return jsonify({'result': f'Error processing file: {str(e)}'})
            
            # Detect image format from filename and validate
            ext = filename.split('.')[-1].lower()
            if ext == 'jpg':
                ext = 'jpeg'
            
            # Map file extensions to MIME types
            format_mapping = {
                'png': 'png',
                'jpeg': 'jpeg', 
                'jpg': 'jpeg',
                'gif': 'gif',
                'bmp': 'bmp'
            }
            
            if ext not in format_mapping:
                return jsonify({'result': f'Error: Unsupported image format: {ext}'})
            
            image_format = format_mapping[ext]
            
            logger.info(f"Processing image: {filename}, size: {file_size}, format: {ext}, capability: {capability}")
            logger.info(f"Base64 image data length: {len(img_bytes)} bytes")
            
            # Add debugging
            try:
                logger.info(f"Calling vision API ({capability})...")
                result = interpret_image_with_openai(img_bytes, image_format=ext, capability=capability)
                logger.info(f"Successfully received analysis result. Result length: {len(result) if result else 0} characters")
            except Exception as img_error:
                logger.error(f"Image processing error: {img_error}")
                # Check for specific OpenAI API errors
                if "quota" in str(img_error).lower() or "rate limit" in str(img_error).lower():
                    return jsonify({'result': 'OpenAI API quota exceeded. Please check your billing and try again later.'})
                elif "invalid" in str(img_error).lower() and "base64" in str(img_error).lower():
                    return jsonify({'result': 'Invalid image format. Please try uploading a different image.'})
                else:
                    return jsonify({'result': f'Error during image interpretation: {str(img_error)}'})
        elif filename.lower().endswith('.pdf'):
            # Extract text from PDF
            doc = fitz.open(file_path)
            text = "\n".join(page.get_text() for page in doc)
            result = interpret_text_with_openai(text, capability=capability)
        else:
            result = 'Unsupported file type.'
        return jsonify({'result': result})
    except Exception as e:
        return jsonify({'result': f'Error during interpretation: {str(e)}'})

