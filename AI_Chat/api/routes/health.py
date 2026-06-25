"""
Health Routes
Handles health checks and static file serving.
"""
from flask import Blueprint, send_from_directory, jsonify
import logging
import os
import json
import re
import openai
from services.medicine_lookup_service import search_medicine_catalog
from config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

# Create blueprint
health_bp = Blueprint('health', __name__, url_prefix='/api')

@health_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'API is running'
    }), 200

@health_bp.route('/medicine_kbase.json', methods=['GET'])
def get_medicine_knowledge_base():
    """Serve the medicine and condition knowledge base JSON file"""
    try:
        # Get the directory where the API files are located
        api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        file_path = os.path.join(api_dir, 'medicine_kbase.json')
        
        if os.path.exists(file_path):
            return send_from_directory(api_dir, 'medicine_kbase.json', mimetype='application/json')
        else:
            return jsonify({
                'success': False,
                'error': 'Medicine knowledge base file not found'
            }), 404
    except Exception as e:
        logger.error(f"Error serving medicine knowledge base: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@health_bp.route('/medicine_catalog.json', methods=['GET'])
def get_medicine_catalog():
    """Serve the medicine catalog JSON file"""
    try:
        api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        file_path = os.path.join(api_dir, 'medicine_catalog.json')

        if os.path.exists(file_path):
            return send_from_directory(api_dir, 'medicine_catalog.json', mimetype='application/json')
        return jsonify({
            'success': False,
            'error': 'Medicine catalog file not found'
        }), 404
    except Exception as e:
        logger.error(f"Error serving medicine catalog: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@health_bp.route('/medicine_lookup.json', methods=['GET'])
def get_medicine_lookup():
    """Serve merged medicine lookup list (condition KB + catalog)."""
    try:
        api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        kbase_path = os.path.join(api_dir, 'medicine_kbase.json')
        catalog_path = os.path.join(api_dir, 'medicine_catalog.json')

        kbase = []
        catalog = []
        if os.path.exists(kbase_path):
            with open(kbase_path, encoding='utf-8') as f:
                kbase = json.load(f) or []
        if os.path.exists(catalog_path):
            with open(catalog_path, encoding='utf-8') as f:
                catalog = json.load(f) or []

        merged = []
        for row in kbase:
            if isinstance(row, dict):
                merged.append({
                    'entryType': 'condition',
                    'Disease': row.get('Disease', ''),
                    'Description': row.get('Description', ''),
                    'Symptoms': row.get('Symptoms') or [],
                    'Causes': row.get('Causes') or [],
                    'Common Treatments': row.get('Common Treatments') or [],
                    'Medicine': '',
                    'Molecule': '',
                    'Strength': '',
                    'Form': '',
                    'Company': '',
                    'Indications': '',
                })

        for row in catalog:
            if isinstance(row, dict):
                merged.append({
                    'entryType': 'catalog',
                    'Disease': row.get('Medicine', '') or row.get('Molecule', ''),
                    'Description': row.get('Indications', '') or row.get('Molecule', ''),
                    'Symptoms': [],
                    'Causes': [],
                    'Common Treatments': [],
                    'Medicine': row.get('Medicine', ''),
                    'Molecule': row.get('Molecule', ''),
                    'Strength': row.get('Strength', ''),
                    'Form': row.get('Form', ''),
                    'Company': row.get('Company', ''),
                    'Indications': row.get('Indications', ''),
                })

        return jsonify(merged), 200
    except Exception as e:
        logger.error(f"Error serving merged medicine lookup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@health_bp.route('/medicine_lookup/suggest', methods=['POST'])
def suggest_medicines_for_diagnosis():
    """
    AI-assisted medicine suggestions for a diagnosis.
    Uses catalog search candidates + LLM ranking/reasoning.
    """
    try:
        from flask import request
        payload = request.get_json(silent=True) or {}
        diagnosis = (payload.get('diagnosis') or '').strip()
        if len(diagnosis) < 3:
            return jsonify({'success': True, 'suggestions': []}), 200

        candidates = search_medicine_catalog(diagnosis, limit=12)
        if not candidates:
            return jsonify({'success': True, 'suggestions': []}), 200

        candidate_rows = []
        for idx, (score, row) in enumerate(candidates, 1):
            candidate_rows.append({
                'index': idx,
                'score': round(float(score), 3),
                'Medicine': row.get('Medicine', ''),
                'Molecule': row.get('Molecule', ''),
                'Strength': row.get('Strength', ''),
                'Form': row.get('Form', ''),
                'Company': row.get('Company', ''),
                'Indications': row.get('Indications', ''),
            })

        suggestions = []
        if OPENAI_API_KEY:
            prompt = f"""
Diagnosis: {diagnosis}

Candidate medicines from institutional catalog:
{json.dumps(candidate_rows, ensure_ascii=False)}

Task:
- Select up to 5 most relevant candidates for this diagnosis.
- Prefer entries whose Indications are aligned with diagnosis intent.
- Be conservative and include uncertainty in reason when needed.
- Return JSON ONLY in this format:
{{
  "suggestions": [
    {{"index": 1, "reason": "short clinical rationale"}}
  ]
}}
"""
            response = openai.ChatCompletion.create(
                model='gpt-4.1',
                messages=[
                    {
                        'role': 'system',
                        'content': 'You are a clinical support assistant. Only rank given candidates. Return strict JSON.',
                    },
                    {'role': 'user', 'content': prompt},
                ],
                max_tokens=400,
                temperature=0.2,
            )
            raw = (response.choices[0].message.get('content') or '').strip()
            # tolerate fenced JSON from model
            json_match = re.search(r'\{[\s\S]*\}', raw)
            parsed = json.loads(json_match.group(0) if json_match else raw)
            suggestions = parsed.get('suggestions') or []

        if not suggestions:
            # fallback: top scored suggestions from catalog search
            suggestions = [
                {'index': row['index'], 'reason': 'Matched by molecule/indication similarity.'}
                for row in candidate_rows[:5]
            ]

        by_index = {row['index']: row for row in candidate_rows}
        merged = []
        for s in suggestions:
            idx = int(s.get('index') or 0)
            if idx not in by_index:
                continue
            row = by_index[idx]
            merged.append({
                'entryType': 'catalog',
                'Disease': row.get('Medicine') or row.get('Molecule') or 'Suggested medicine',
                'Description': row.get('Indications') or row.get('Molecule') or '',
                'Symptoms': [],
                'Causes': [],
                'Common Treatments': [],
                'Medicine': row.get('Medicine', ''),
                'Molecule': row.get('Molecule', ''),
                'Strength': row.get('Strength', ''),
                'Form': row.get('Form', ''),
                'Company': row.get('Company', ''),
                'Indications': row.get('Indications', ''),
                'aiReason': (s.get('reason') or '').strip(),
            })

        return jsonify({'success': True, 'suggestions': merged}), 200
    except Exception as e:
        logger.error(f'Error generating medicine suggestions: {e}')
        return jsonify({'success': False, 'error': str(e), 'suggestions': []}), 500
