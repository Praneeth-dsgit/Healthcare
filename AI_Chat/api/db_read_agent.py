import pymysql
import os
import re
import json
import traceback
from typing import List, Dict, Optional
from dotenv import load_dotenv
import openai
import logging
from datetime import datetime, timedelta, date

# Load environment variables
load_dotenv()

# Configure logging to write to app.log file (only if not already configured)
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('app.log'),
            logging.StreamHandler()  # Also log to console
        ]
    )
logger = logging.getLogger(__name__)

# OpenAI Configuration
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY not found in environment variables")
    exit(1)

openai.api_key = OPENAI_API_KEY

# MySQL configuration
MYSQL_HOST = os.getenv('MYSQL_HOST', 'localhost')
MYSQL_PORT = int(os.getenv('MYSQL_PORT', '3306'))
MYSQL_USER = os.getenv('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', '')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE', 'medchat_db')

DB_CONFIG = {
    "host": MYSQL_HOST,
    "database": MYSQL_DATABASE,
    "user": MYSQL_USER,
    "password": MYSQL_PASSWORD,
    "port": MYSQL_PORT,
    "charset": "utf8mb4"
}

class DatabaseAgent:
    def __init__(self):
        self.schema_cache = None
        logger.info("DatabaseAgent instance created successfully")
    
    def get_database_schema(self):
        """Dynamically retrieve the actual database schema"""
        if self.schema_cache:
            logger.info("Using cached schema")
            return self.schema_cache
            
        try:
            logger.info("=== DATABASE CONNECTION START ===")
            logger.info(f"Connecting to database with config: {DB_CONFIG}")
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor()
            
            # Get all tables
            logger.info("Executing SHOW TABLES...")
            cursor.execute("SHOW TABLES")
            tables = [row[0] for row in cursor.fetchall()]
            
            logger.info(f"Found tables: {tables}")
            
            schema_info = {}
            for table in tables:
                # Get column information for each table
                logger.info(f"Getting schema for table: {table}")
                cursor.execute(f"DESCRIBE {table}")
                columns = cursor.fetchall()
                schema_info[table] = {
                    'columns': [
                        {
                            'name': col[0],
                            'type': col[1],
                            'null': col[2],
                            'key': col[3],
                            'default': col[4],
                            'extra': col[5]
                        } for col in columns
                    ]
                }
                logger.info(f"Table {table} columns: {[col[0] for col in columns]}")
            
            cursor.close()
            conn.close()
            
            self.schema_cache = schema_info
            logger.info("=== DATABASE CONNECTION SUCCESS ===")
            return schema_info
            
        except Exception as e:
            logger.error(f"Error retrieving schema: {e}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            logger.info("=== DATABASE CONNECTION FAILED ===")
            return {}
    
    def format_schema_for_gpt(self, schema):
        """Format schema information for GPT prompt"""
        formatted = "DATABASE SCHEMA:\n\n"
        
        for table_name, table_info in schema.items():
            formatted += f"Table: {table_name}\n"
            for col in table_info['columns']:
                key_info = f" ({col['key']})" if col['key'] else ""
                null_info = "NOT NULL" if col['null'] == 'NO' else "NULL"
                formatted += f"  - {col['name']} ({col['type']}) {null_info}{key_info}\n"
            formatted += "\n"
        
        return formatted
    
    def validate_sql(self, sql_query, allow_insert=False):
        """Basic SQL validation and safety checks"""
        # Convert to lowercase for checking
        sql_lower = sql_query.lower().strip()
        
        # Allow SELECT or INSERT (if explicitly allowed)
        if not sql_lower.startswith('select') and not (allow_insert and sql_lower.startswith('insert')):
            return False, "Only SELECT queries are allowed (or INSERT if explicitly permitted)"
        
        # Block dangerous keywords (except INSERT if allowed)
        # Use word boundaries to avoid matching keywords inside column names (e.g., "updated_at")
        dangerous_keywords = [
            r'\bdrop\b', r'\bdelete\b', r'\bupdate\b', r'\bcreate\b', r'\balter\b', 
            r'\btruncate\b', r'\bexec\b', r'\bexecute\b', r'xp_', r'sp_'
        ]
        
        if not allow_insert:
            dangerous_keywords.append(r'\binsert\b')
        
        for keyword_pattern in dangerous_keywords:
            if re.search(keyword_pattern, sql_lower):
                # Extract the actual keyword for the error message
                keyword = keyword_pattern.replace(r'\b', '').replace('\\', '')
                return False, f"Dangerous keyword '{keyword}' not allowed"
        
        # Basic SQL injection patterns
        injection_patterns = [
            r';\s*(drop|delete|update)', 
            r'union\s+select',
            r'--\s*\w+',
            r'/\*.*\*/'
        ]
        
        for pattern in injection_patterns:
            if re.search(pattern, sql_lower):
                return False, "Potential SQL injection detected"
        
        return True, "Valid"

    def _validate_json_contains_args(self, sql_query: str):
        """Reject JSON_CONTAINS when the search value is not valid JSON."""
        pattern = re.compile(r'JSON_CONTAINS\s*\(\s*[^,]+\s*,\s*([^)]+)\)', re.IGNORECASE)
        for match in pattern.finditer(sql_query):
            raw_arg = match.group(1).strip()
            if raw_arg.upper() in ('NULL',):
                continue
            literal = raw_arg
            if (literal.startswith("'") and literal.endswith("'")) or (
                literal.startswith('"') and literal.endswith('"')
            ):
                literal = literal[1:-1]
            try:
                json.loads(literal)
            except json.JSONDecodeError:
                return (
                    'Invalid JSON in JSON_CONTAINS — use JOIN specialties/facilities with LIKE '
                    'instead of searching JSON columns with plain text.'
                )
        return None
    
    def generate_sql(self, question):
        """Generate SQL using GPT with simple prompt"""
        logger.info("=== SQL GENERATION START ===")
        logger.info(f"Getting database schema...")
        schema = self.get_database_schema()
        logger.info(f"Schema keys: {list(schema.keys()) if schema else 'No schema'}")
        
        formatted_schema = self.format_schema_for_gpt(schema)
        logger.info(f"Formatted schema length: {len(formatted_schema)}")
        
        # Use simple prompt without normalization
        prompt = f"""You are a database assistant that generates ONLY SELECT queries for data retrieval.

CRITICAL: You must ONLY generate SELECT statements. NEVER generate INSERT, UPDATE, DELETE, DROP, CREATE, or ALTER statements.

{formatted_schema}

MANDATORY SQL GENERATION RULES:
1. ALWAYS start with SELECT - this is the ONLY allowed statement type
2. NEVER use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE
3. Use proper JOIN clauses when querying related tables
4. Use appropriate WHERE clauses for filtering
5. ALWAYS end with "LIMIT 100" (with a number) to prevent large result sets - NEVER write just "LIMIT" without a number
6. Use DATE() function for date comparisons
7. Use LIKE for partial string matches
8. Use UPPER() or LOWER() for case-insensitive searches
9. Complete your SQL statement - do not leave LIMIT incomplete
10. IMPORTANT: If using column aliases with AS, avoid MySQL reserved keywords like 'condition', 'order', 'group', etc. If you must use them, wrap them in backticks: AS `condition`

SCHEMA RELATIONSHIPS:
- patients table: Contains patient demographics (patient_id, first_name, last_name, dob, gender, phone, email, address, etc.)
- admissions table: Contains patient admission records with diagnosis information (admission_id, patient_id, diagnosis, admit_date, discharge_date, room_id, etc.)
- appointments table: Contains appointment records (appointment_id, patient_id, doctor_id, appointment_date, reason, status)
- doctors table: Contains doctor information (doctor_id, first_name, department_id, etc.)
- departments table: Contains department information (department_id, name, etc.)

IMPORTANT MEDICAL TERMINOLOGY MAPPING:
- "conditions" or "patient conditions" = diagnosis field in admissions table
- "medical condition" = diagnosis field in admissions table
- "disease" or "illness" = diagnosis field in admissions table
- When user asks about patient conditions/diagnosis, you MUST JOIN with the admissions table to get the diagnosis field
- Patient conditions are stored in admissions.diagnosis, NOT in the patients table

QUERY GENERATION GUIDELINES:
- If the query asks about "conditions", "diagnosis", "medical conditions", or "diseases", you MUST:
  1. JOIN patients table with admissions table ON patients.patient_id = admissions.patient_id
  2. SELECT the diagnosis field from admissions table
  3. Include patient identifying information (first_name, last_name, patient_id) for context
- Always use proper JOINs when data spans multiple tables
- Check the actual schema above to see which tables and columns are available

AVAILABLE APPOINTMENT SLOTS (CRITICAL):
- Do NOT use JSON_CONTAINS on doctor_facilities.available_days or available_time_slots for specialty/facility names
- NEVER pass plain text like cardiology or sol:cardiology as the second argument to JSON_CONTAINS — it must be valid JSON
- To find doctors by specialty: JOIN doctors d WITH specialties s ON d.specialty_id = s.specialty_id AND use LOWER(s.name) LIKE '%cardiology%'
- To find doctors at a facility: JOIN doctor_facilities df and facilities f, use LOWER(f.name) LIKE '%facilityname%'
- Booked times come from appointments (appointment_date DATE, appointment_time TIME) — compare dates with appointment_date, not JSON columns
- For open slots: list doctors and their facility; booked slots are rows in appointments where status is not cancelled

JSON COLUMNS:
- operating_hours, available_days, available_time_slots are JSON — only use JSON_CONTAINS with valid JSON literals like '"Monday"' or '"09:00"'
- Prefer LIKE on specialties.name and facilities.name instead of JSON functions for department/facility search

Generate ONLY a SELECT query for: "{question}"

SQL Query (SELECT ONLY):"""
        
        logger.info(f"Original question: '{question}'")
        logger.info(f"Prompt length: {len(prompt)}")
        
        # Try up to 3 times to generate valid SQL
        for attempt in range(3):
            try:
                logger.info(f"Attempt {attempt + 1}: Calling OpenAI API...")
                response = openai.ChatCompletion.create(
                    model="gpt-4.1",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=200,
                    temperature=0.1
                )
                
                sql_query = response.choices[0].message['content'].strip()
                logger.info(f"Raw OpenAI response: '{sql_query}'")
                
                # Remove markdown formatting if present
                sql_query = re.sub(r'^```sql\s*', '', sql_query)
                sql_query = re.sub(r'```$', '', sql_query)
                sql_query = sql_query.strip()
                
                # Fix incomplete LIMIT statements (LIMIT without number)
                # Remove incomplete LIMIT at the end
                sql_query = re.sub(r'\s+LIMIT\s*$', '', sql_query, flags=re.IGNORECASE)
                # Fix LIMIT with no number (LIMIT followed by nothing or whitespace)
                sql_query = re.sub(r'\s+LIMIT\s+(?=\s|$)', '', sql_query, flags=re.IGNORECASE)
                
                # Fix reserved keywords in column aliases (AS keyword)
                # MySQL reserved keywords that commonly appear in aliases
                mysql_reserved_keywords = [
                    'condition', 'order', 'group', 'select', 'from', 'where', 'join',
                    'inner', 'left', 'right', 'outer', 'on', 'as', 'and', 'or', 'not',
                    'in', 'like', 'between', 'is', 'null', 'limit', 'offset', 'having',
                    'union', 'distinct', 'all', 'any', 'some', 'exists', 'case', 'when',
                    'then', 'else', 'end', 'if', 'elseif', 'while', 'repeat', 'until',
                    'loop', 'leave', 'iterate', 'declare', 'cursor', 'handler',
                    'signal', 'resignal', 'diagnostics', 'get', 'set', 'show', 'describe',
                    'explain', 'use', 'database', 'table', 'index', 'view', 'procedure',
                    'function', 'trigger', 'event', 'tablespace', 'server', 'logfile'
                ]
                
                # Escape reserved keywords in AS aliases
                # Pattern: AS keyword (where keyword is a reserved word, not already escaped)
                for keyword in mysql_reserved_keywords:
                    # Match "AS keyword" where keyword is not already wrapped in backticks
                    # Check that it's not already escaped by looking for backticks around it
                    pattern = rf'\bAS\s+(?<!`){re.escape(keyword)}(?!`)\b'
                    replacement = rf'AS `{keyword}`'
                    sql_query = re.sub(pattern, replacement, sql_query, flags=re.IGNORECASE)
                
                logger.info(f"Generated SQL (attempt {attempt + 1}): '{sql_query}'")
                
                # Validate the generated SQL
                logger.info(f"Validating SQL...")
                is_valid, validation_message = self.validate_sql(sql_query)
                logger.info(f"Validation result: {is_valid}, message: {validation_message}")
                
                if is_valid:
                    logger.info("=== SQL GENERATION SUCCESS ===")
                    return sql_query
                else:
                    logger.warning(f"Invalid SQL generated (attempt {attempt + 1}): {validation_message}")
                    if attempt < 2:  # Not the last attempt
                        # Add correction instruction to the prompt
                        prompt += f"\n\nCORRECTION NEEDED: The previous SQL was invalid: {validation_message}. Please generate a valid SELECT query only."
                        logger.info("Added correction instruction to prompt")
                        continue
                    else:
                        logger.error(f"Failed to generate valid SQL after 3 attempts. Last error: {validation_message}")
                        logger.info("=== SQL GENERATION FAILED ===")
                        return None
                
            except Exception as e:
                logger.error(f"Error generating SQL (attempt {attempt + 1}): {e}")
                logger.error(f"Full traceback: {traceback.format_exc()}")
                if attempt == 2:  # Last attempt
                    logger.info("=== SQL GENERATION FAILED ===")
                    return None
                continue
        
        logger.info("=== SQL GENERATION FAILED ===")
        return None
    
    def generate_insert_sql_for_appointment(self, appointment_data):
        """Generate INSERT SQL for appointment booking using AI"""
        logger.info("=== APPOINTMENT INSERT SQL GENERATION START ===")
        
        schema = self.get_database_schema()
        formatted_schema = self.format_schema_for_gpt(schema)
        
        # Create prompt for INSERT query generation
        prompt = f"""You are a database assistant that generates INSERT queries for appointment booking.

{formatted_schema}

APPOINTMENT DATA TO INSERT:
- Patient Name: {appointment_data.get('patientName', '')}
- Patient Phone: {appointment_data.get('patientPhone', '')}
- Patient Email: {appointment_data.get('patientEmail', '')}
- Patient Age: {appointment_data.get('age', '')}
- Patient Gender: {appointment_data.get('gender', '')}
- Patient Weight (kg): {appointment_data.get('weight', '')}
- Doctor ID: {appointment_data.get('doctorId', '')}
- Facility ID: {appointment_data.get('facility_id', '')}
- Generated Patient ID (USE THIS when creating new patient): {appointment_data.get('generated_patient_id', '')}
- Appointment Date: {appointment_data.get('appointmentDate', '')}
- Appointment Time: {appointment_data.get('appointmentTime', '')}
- Reason: {appointment_data.get('reason', '')}

IMPORTANT RULES:
1. You need to find or create the patient first (check if patient exists by phone or name)
2. Use the provided doctor_id directly (no need to look it up)
3. Use the provided facility_id directly - it is REQUIRED for the appointments table
4. Use appointment_date (DATE) and appointment_time (TIME) as separate columns - put the date in appointment_date and time in appointment_time
5. The appointments table structure includes: patient_id, family_member_id (nullable), doctor_id, facility_id (REQUIRED), appointment_date (DATE), appointment_time (TIME)
6. If patient doesn't exist, you MUST INSERT into patients table first. When creating a NEW patient, you MUST use the "Generated Patient ID" exactly as provided (format PAT-YYMMDD-XXXX, e.g. PAT-251224-8AHT). NEVER use phone, email, or name as patient_id.
7. If patient exists (or Generated Patient ID is empty), find them by phone/name and use their existing patient_id
8. Use the doctor_id and facility_id provided directly (they are already validated)
9. When inserting patient data, include age, gender, and weight_kg fields if they are provided and exist in the patients table schema
10. Check the actual patients table schema to see which fields are available (age, gender, weight_kg, etc.)
11. If age is provided but the table has date_of_birth instead, calculate date_of_birth from age (current date - age years)
12. Generate a proper INSERT statement for the appointments table

Generate the SQL INSERT statement(s) needed. If patient doesn't exist, generate two INSERT statements:
1. First INSERT into patients table
2. Then INSERT into appointments table

Format: Return ONLY the SQL statement(s), one per line, no markdown, no explanations.

SQL INSERT Statement(s):"""
        
        try:
            logger.info("Calling OpenAI API to generate INSERT SQL...")
            response = openai.ChatCompletion.create(
                model="gpt-4.1",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500,
                temperature=0.1
            )
            
            sql_query = response.choices[0].message['content'].strip()
            logger.info(f"Raw OpenAI response: '{sql_query}'")
            
            # Remove markdown formatting if present
            sql_query = re.sub(r'^```sql\s*', '', sql_query, flags=re.MULTILINE)
            sql_query = re.sub(r'```$', '', sql_query, flags=re.MULTILINE)
            sql_query = sql_query.strip()
            
            logger.info(f"Generated INSERT SQL: '{sql_query}'")
            logger.info("=== APPOINTMENT INSERT SQL GENERATION SUCCESS ===")
            return sql_query
            
        except Exception as e:
            logger.error(f"Error generating INSERT SQL: {e}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            logger.info("=== APPOINTMENT INSERT SQL GENERATION FAILED ===")
            return None
    
    def execute_query(self, sql_query, allow_insert=False):
        """Execute SQL query safely"""
        conn = None
        try:
            # Handle multiple INSERT statements (for patient + appointment)
            if allow_insert and ';' in sql_query and 'insert' in sql_query.lower():
                # Split and validate each statement
                statements = [s.strip() for s in sql_query.split(';') if s.strip()]
                inserted_ids = []
                
                conn = pymysql.connect(**DB_CONFIG)
                cursor = conn.cursor(pymysql.cursors.DictCursor)
                
                for stmt in statements:
                    # Validate each statement
                    is_valid, message = self.validate_sql(stmt, allow_insert=True)
                    if not is_valid:
                        if conn:
                            conn.rollback()
                            cursor.close()
                            conn.close()
                        return None, f"SQL Validation Error: {message}"
                    
                    if stmt.lower().strip().startswith('insert'):
                        cursor.execute(stmt)
                        if cursor.lastrowid:
                            inserted_ids.append(cursor.lastrowid)
                
                conn.commit()
                cursor.close()
                conn.close()
                return {'inserted_ids': inserted_ids, 'last_inserted_id': inserted_ids[-1] if inserted_ids else None}, None
            
            # Validate SQL first for single statements
            is_valid, message = self.validate_sql(sql_query, allow_insert=allow_insert)
            if not is_valid:
                return None, f"SQL Validation Error: {message}"

            json_err = self._validate_json_contains_args(sql_query)
            if json_err:
                return None, json_err
            
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            # For SELECT queries, add LIMIT if not present for safety
            if sql_query.lower().strip().startswith('select'):
                # Check if LIMIT exists and has a number
                limit_match = re.search(r'\bLIMIT\s+(\d+)', sql_query, re.IGNORECASE)
                if not limit_match:
                    # Remove any incomplete LIMIT statement first
                    sql_query = re.sub(r'\s+LIMIT\s*$', '', sql_query, flags=re.IGNORECASE)
                    sql_query = re.sub(r'\s+LIMIT\s+(?=\s|$)', '', sql_query, flags=re.IGNORECASE)
                    # Add proper LIMIT
                    sql_query += " LIMIT 100"
            
            cursor.execute(sql_query)
            
            # For INSERT queries, commit and return the inserted ID
            if sql_query.lower().strip().startswith('insert'):
                conn.commit()
                inserted_id = cursor.lastrowid
                cursor.close()
                conn.close()
                return {'inserted_id': inserted_id}, None
            else:
                # For SELECT queries, fetch results
                results = cursor.fetchall()
                cursor.close()
                conn.close()
                return results, None
            
        except Exception as e:
            logger.error(f"Database query error: {e}")
            if conn:
                conn.rollback()
                try:
                    cursor.close()
                    conn.close()
                except:
                    pass
            return None, str(e)
    
    def process_question(self, question):
        """Main method to process natural language questions"""
        print(f"\n🔍 Processing question: '{question}'")
        
        # Generate SQL query
        print("\n🧠 Generating SQL query...")
        sql_query = self.generate_sql(question)
        
        if not sql_query:
            return "❌ Failed to generate SQL query"
        
        print(f"📝 Generated SQL: {sql_query}")
        
        # Execute query
        print("\n🗄️ Executing database query...")
        results, error = self.execute_query(sql_query)
        
        if error:
            return f"❌ Database Error: {error}"
        
        if not results:
            return "✅ Query executed successfully but returned no results"
        
        # Format results
        print(f"\n✅ Found {len(results)} result(s):")
        for i, row in enumerate(results, 1):
            print(f"\n--- Result {i} ---")
            for key, value in row.items():
                print(f"{key}: {value}")
        
        return results

    def process_question_for_frontend(self, question, conversation_context=None):
        """Process question and return results in format expected by frontend"""
        try:
            logger.info("=== DATABASE AGENT PROCESSING START ===")
            logger.info(f"Processing frontend question: '{question}'")
            if conversation_context:
                logger.info(f"Conversation context: '{conversation_context[:200]}...'")
            
            # Check if this is a notification command
            logger.info("Checking if this is a notification command...")
            if self.is_notification_command(question):
                logger.info("This is a notification command, handling...")
                return self.handle_notification_command(question, conversation_context)
            
            logger.info("This is a database query, generating SQL...")
            # Generate SQL query
            sql_query = self.generate_sql(question)
            
            if not sql_query:
                logger.error("Failed to generate SQL query")
                return {
                    'success': False,
                    'error': 'Failed to generate SQL query',
                    'results': []
                }
            
            logger.info(f"Generated SQL: {sql_query}")
            
            # Execute query
            logger.info("Executing SQL query...")
            results, error = self.execute_query(sql_query)
            
            if error:
                logger.error(f"Database error: {error}")
                return {
                    'success': False,
                    'error': f"Database Error: {error}",
                    'results': []
                }
            
            logger.info(f"Query returned {len(results) if results else 0} results")
            if results:
                logger.info(f"Sample result: {results[0]}")
            
            if not results:
                logger.info("Query returned no results")
                return {
                    'success': True,
                    'message': 'Query executed successfully but returned no results',
                    'results': []
                }
            
            # Convert results to list of dictionaries for JSON serialization
            logger.info("Formatting results for frontend...")
            formatted_results = []
            for row in results:
                formatted_row = {}
                for key, value in row.items():
                    # Handle datetime objects and other non-serializable types
                    if value is None:
                        formatted_row[key] = None
                    elif isinstance(value, timedelta):
                        # Convert timedelta to string representation (e.g., "5 days, 3:00:00")
                        formatted_row[key] = str(value)
                    elif hasattr(value, 'isoformat'):
                        formatted_row[key] = value.isoformat()
                    elif isinstance(value, (date, datetime)):
                        formatted_row[key] = value.isoformat()
                    else:
                        formatted_row[key] = value
                formatted_results.append(formatted_row)
            
            logger.info(f"Returning {len(formatted_results)} results to frontend")
            
            # Format results using LLM for natural language
            logger.info("Formatting results with LLM...")
            try:
                formatted_natural_results = self.format_results_with_llm(formatted_results, question)
            except Exception as e:
                logger.error(f"LLM formatting failed: {e}")
                # Use simple fallback formatting
                formatted_natural_results = []
                for i, result in enumerate(formatted_results, 1):
                    if isinstance(result, dict):
                        parts = []
                        for key, value in result.items():
                            if value is not None:
                                formatted_key = key.replace('_', ' ').title()
                                parts.append(f"{formatted_key}: {value}")
                        formatted_natural_results.append(f"{i}. {', '.join(parts)}")
                    else:
                        formatted_natural_results.append(f"{i}. {str(result)}")
            
            # Validate that we have complete results
            if not formatted_natural_results or len(formatted_natural_results) == 0:
                logger.warning("No natural results generated, using fallback")
                formatted_natural_results = [f"Found {len(formatted_results)} result(s) for your query."]
            
            # Ensure all results are complete (not truncated)
            validated_results = []
            for i, result in enumerate(formatted_natural_results):
                if result and len(result.strip()) > 0:
                    # Check for common truncation indicators
                    if not (result.endswith('...') or result.endswith('..') or len(result) < 10):
                        validated_results.append(result)
                    else:
                        logger.warning(f"Result {i} appears truncated: {result}")
                        # Use fallback for this result
                        if i < len(formatted_results):
                            fallback = f"Result {i+1}: {', '.join([f'{k}: {v}' for k, v in formatted_results[i].items() if v])}"
                            validated_results.append(fallback)
            
            if not validated_results:
                validated_results = [f"Found {len(formatted_results)} result(s) for your query."]
            
            logger.info(f"Returning {len(validated_results)} validated natural results")
            logger.info("=== DATABASE AGENT PROCESSING COMPLETE ===")
            return {
                'success': True,
                'results': formatted_results,  # Keep raw results for debugging
                'natural_results': validated_results,  # Add validated natural language results
                'count': len(formatted_results)
            }
            
        except Exception as e:
            logger.error(f"Error processing frontend question: {e}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return {
                'success': False,
                'error': f"Internal server error: {str(e)}",
                'results': []
            }

    def format_results_with_llm(self, results, original_question):
        """Format database results into natural language using LLM"""
        try:
            if not results:
                return ["No results found for this query."]
            
            # Prepare the prompt for the LLM
            prompt = f"""
You are a helpful assistant that converts database query results into natural, human-readable language.

Original user question: "{original_question}"

Database results (JSON format):
{json.dumps(results, indent=2, default=str)}

Please convert each result into a natural, conversational sentence that answers the user's question. 
Follow these guidelines:
1. Make it sound like a natural conversation response
2. If needed use number list to format the results
3. Use proper grammar and complete sentences
4. If there are multiple results, format each one as a separate sentence
5. Include relevant context from the original question
6. Make it easy to read and understand
7. Don't use technical database terms or field names
8. If the data contains names, use proper formatting (e.g., "Dr. John Smith" for doctors)

Return only the formatted sentences, one per line, without any additional formatting or numbering.
"""

            # Call OpenAI API with higher token limit to prevent truncation
            response = openai.ChatCompletion.create(
                model="gpt-4.1",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that converts database results into natural language."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=2048,  # Increased from 512 to prevent truncation
                temperature=0.1,
                timeout=30  # Add timeout to prevent hanging
            )
            
            # Parse the response
            formatted_text = response.choices[0].message['content'].strip()
            
            # Check if response was truncated
            if formatted_text.endswith('...') or len(formatted_text) < 50:
                logger.warning("LLM response appears to be truncated, using fallback formatting")
                raise Exception("Response truncated")
            
            # Split into individual sentences/results
            natural_results = [line.strip() for line in formatted_text.split('\n') if line.strip()]
            
            # Ensure we have at least one result for each database result
            if len(natural_results) < len(results):
                logger.warning(f"LLM returned {len(natural_results)} results for {len(results)} database results, using fallback")
                raise Exception("Incomplete response")
            
            logger.info(f"LLM formatted {len(results)} results into {len(natural_results)} natural language responses")
            
            return natural_results
            
        except Exception as e:
            logger.error(f"Error formatting results with LLM: {e}")
            # Fallback to simple formatting if LLM fails
            fallback_results = []
            for i, result in enumerate(results, 1):
                if isinstance(result, dict):
                    # Simple fallback formatting with numbering
                    parts = []
                    for key, value in result.items():
                        if value is not None:
                            formatted_key = key.replace('_', ' ').title()
                            parts.append(f"{formatted_key}: {value}")
                    fallback_results.append(f"{i}. {', '.join(parts)}")
                else:
                    fallback_results.append(f"{i}. {str(result)}")
            
            # Ensure we always return complete results
            if not fallback_results:
                fallback_results = ["Results available but formatting failed."]
            
            logger.info(f"Using fallback formatting for {len(results)} results")
            return fallback_results

    def is_notification_command(self, question: str) -> bool:
        """Check if the question is a notification command"""
        notification_keywords = [
            'send reminder', 'send notification', 'notify', 'remind',
            'send message', 'whatsapp', 'message', 'alert'
        ]
        
        question_lower = question.lower()
        return any(keyword in question_lower for keyword in notification_keywords)
    
    def handle_notification_command(self, question: str, conversation_context: str = None) -> Dict:
        """Handle notification commands and return appropriate response"""
        try:
            from whatsapp_integration import whatsapp_notifier
            
            question_lower = question.lower()
            
            # Extract patient identifier (ID or name)
            patient_identifier = self.extract_patient_identifier(question)
            if not patient_identifier:
                return {
                    'success': False,
                    'error': 'Could not identify patient. Please specify patient ID or name.',
                    'results': []
                }
            
            # Check if it's a specific notification type
            if 'appointment' in question_lower:
                return self.handle_appointment_reminder(patient_identifier, conversation_context)
            elif 'medication' in question_lower or 'medicine' in question_lower:
                return self.handle_medication_reminder(patient_identifier, question)
            else:
                # Generic notification via multi-channel engagement orchestrator
                message = self.extract_custom_message(question) or "This is a reminder from your healthcare provider."
                patient_info = self.get_patient_by_identifier(patient_identifier)
                patient_id = (patient_info or {}).get('id') or (patient_info or {}).get('patient_id') or patient_identifier
                try:
                    from services import engagement_orchestrator as orchestrator
                    result = orchestrator.create_event(
                        str(patient_id),
                        'manual',
                        send_now=True,
                        message=message,
                        payload={'custom_message': message},
                    )
                    ok = bool(result.get('success'))
                except Exception:
                    result = whatsapp_notifier.send_custom_notification(patient_identifier, message)
                    ok = bool(result.get('success'))

                if ok:
                    return {
                        'success': True,
                        'results': [{
                            'action': 'notification_sent',
                            'patient': patient_identifier,
                            'message': message,
                            'status': 'success',
                            'channels': result.get('channels'),
                        }],
                        'natural_results': [f"Multi-channel notification sent successfully to {patient_identifier}."]
                    }
                else:
                    return {
                        'success': False,
                        'error': f"Failed to send notification: {result['error']}",
                        'results': []
                    }
                    
        except Exception as e:
            logger.error(f"Error handling notification command: {e}")
            return {
                'success': False,
                'error': f"Error processing notification command: {str(e)}",
                'results': []
            }
    
    def extract_patient_identifier(self, question: str) -> str:
        """Extract patient ID or name from the question"""
        import re
        
        # Look for patient ID (numbers)
        id_match = re.search(r'patient\s+(?:id\s+)?(\d+)', question, re.IGNORECASE)
        if id_match:
            return id_match.group(1)
        
        # Look for "these patients" or "all patients" - indicates bulk operation
        if re.search(r'\b(?:these|all|multiple)\s+patients?\b', question, re.IGNORECASE):
            return "BULK_PATIENTS"
        
        # Look for patient name (words after "patient" or "to")
        name_patterns = [
            r'patient\s+([a-zA-Z\s]+?)(?:\s+appointment|\s+medication|\s+reminder|$)',
            r'to\s+([a-zA-Z\s]+?)(?:\s+appointment|\s+medication|\s+reminder|$)',
            r'remind\s+([a-zA-Z\s]+?)(?:\s+about|\s+to|$)',
            r'notify\s+([a-zA-Z\s]+?)(?:\s+about|\s+to|$)'
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, question, re.IGNORECASE)
            if match:
                name = match.group(1).strip()
                if name and len(name) > 1:  # Ensure it's not just a single letter
                    return name
        
        return None
    
    def extract_multiple_patient_names(self, conversation_context: str) -> List[str]:
        """Extract multiple patient names from conversation context"""
        import re
        
        # Look for patterns like "patient with [condition]" or "for a patient with [condition]"
        patient_patterns = [
            r'for\s+a\s+patient\s+with\s+([^,\.]+)',
            r'patient\s+with\s+([^,\.]+)',
            r'for\s+([a-zA-Z\s]+?)\s+with\s+([^,\.]+)'
        ]
        
        patient_names = []
        
        for pattern in patient_patterns:
            matches = re.findall(pattern, conversation_context, re.IGNORECASE)
            for match in matches:
                if isinstance(match, tuple):
                    # Handle tuple matches
                    for group in match:
                        if group.strip() and len(group.strip()) > 2:
                            patient_names.append(group.strip())
                else:
                    # Handle single string matches
                    if match.strip() and len(match.strip()) > 2:
                        patient_names.append(match.strip())
        
        return list(set(patient_names))  # Remove duplicates
    
    def extract_custom_message(self, question: str) -> str:
        """Extract custom message from the question"""
        import re
        
        # Look for message in quotes
        quote_match = re.search(r'"([^"]+)"', question)
        if quote_match:
            return quote_match.group(1)
        
        # Look for message after "message" or "saying"
        message_patterns = [
            r'message\s+(.+?)(?:\s+to|\s+patient|$)',
            r'saying\s+(.+?)(?:\s+to|\s+patient|$)',
            r'about\s+(.+?)(?:\s+to|\s+patient|$)'
        ]
        
        for pattern in message_patterns:
            match = re.search(pattern, question, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def handle_appointment_reminder(self, patient_identifier: str, conversation_context: str = None) -> Dict:
        """Handle appointment reminder for a patient or bulk patients with context awareness"""
        try:
            from whatsapp_integration import whatsapp_notifier
            
            # Handle bulk patient reminders with context
            if patient_identifier == "BULK_PATIENTS":
                return self.handle_bulk_appointment_reminders_with_context(conversation_context)
            
            # Get patient's upcoming appointments
            appointments = self.get_patient_appointments(patient_identifier)
            
            if not appointments:
                return {
                    'success': False,
                    'error': f'No upcoming appointments found for {patient_identifier}',
                    'results': []
                }
            
            # Send reminder for the next appointment
            next_appointment = appointments[0]
            result = whatsapp_notifier.send_appointment_reminder(next_appointment['id'])
            
            if result['success']:
                return {
                    'success': True,
                    'results': [{
                        'action': 'appointment_reminder_sent',
                        'patient': patient_identifier,
                        'appointment_id': next_appointment['id'],
                        'appointment_time': next_appointment['appointment_time'],
                        'status': 'success'
                    }],
                    'natural_results': [f"Appointment reminder sent to {patient_identifier} for their appointment on {next_appointment['appointment_time']}."]
                }
            else:
                return {
                    'success': False,
                    'error': f"Failed to send appointment reminder: {result['error']}",
                    'results': []
                }
                
        except Exception as e:
            logger.error(f"Error handling appointment reminder: {e}")
            return {
                'success': False,
                'error': f"Error processing appointment reminder: {str(e)}",
                'results': []
            }
    
    def handle_bulk_appointment_reminders(self) -> Dict:
        """Handle bulk appointment reminders for all upcoming appointments"""
        try:
            from whatsapp_integration import whatsapp_notifier
            
            # Get all upcoming appointments
            appointments = self.get_all_upcoming_appointments()
            
            if not appointments:
                return {
                    'success': False,
                    'error': 'No upcoming appointments found',
                    'results': []
                }
            
            results = {
                'success': True,
                'results': [],
                'natural_results': []
            }
            
            successful_sends = 0
            failed_sends = 0
            
            for appointment in appointments:
                try:
                    result = whatsapp_notifier.send_appointment_reminder(appointment['id'])
                    if result['success']:
                        successful_sends += 1
                        results['results'].append({
                            'action': 'appointment_reminder_sent',
                            'patient': appointment['patient_name'],
                            'appointment_id': appointment['id'],
                            'appointment_time': appointment['appointment_time'],
                            'status': 'success'
                        })
                        results['natural_results'].append(
                            f"✅ Reminder sent to {appointment['patient_name']} for appointment on {appointment['appointment_time']}"
                        )
                    else:
                        failed_sends += 1
                        results['natural_results'].append(
                            f"❌ Failed to send reminder to {appointment['patient_name']}: {result.get('error', 'Unknown error')}"
                        )
                except Exception as e:
                    failed_sends += 1
                    results['natural_results'].append(
                        f"❌ Error sending reminder to {appointment['patient_name']}: {str(e)}"
                    )
            
            # Add summary
            summary = f"📋 Bulk appointment reminders completed: {successful_sends} successful, {failed_sends} failed"
            results['natural_results'].insert(0, summary)
            
            return results
            
        except Exception as e:
            logger.error(f"Error handling bulk appointment reminders: {e}")
            return {
                'success': False,
                'error': f"Error processing bulk appointment reminders: {str(e)}",
                'results': []
            }
    
    def handle_bulk_appointment_reminders_with_context(self, conversation_context: str = None) -> Dict:
        """Handle bulk appointment reminders with conversation context awareness"""
        try:
            from whatsapp_integration import whatsapp_notifier
            
            # Extract context information using LLM
            context_info = self.extract_context_with_llm(conversation_context) if conversation_context else {}
            
            logger.info(f"Extracted context: {context_info}")
            
            # Get appointments based on context
            if context_info.get('doctor_name'):
                # Filter by specific doctor
                appointments = self.get_appointments_by_doctor(context_info['doctor_name'])
                context_desc = f"Dr. {context_info['doctor_name']}'s appointments"
            elif context_info.get('date_range'):
                # Filter by date range
                appointments = self.get_appointments_by_date_range(context_info['date_range'])
                context_desc = f"appointments in {context_info['date_range']}"
            else:
                # Fallback to all appointments
                appointments = self.get_all_upcoming_appointments()
                context_desc = "all upcoming appointments"
            
            if not appointments:
                return {
                    'success': False,
                    'error': f'No appointments found for {context_desc}',
                    'results': []
                }
            
            results = {
                'success': True,
                'results': [],
                'natural_results': []
            }
            
            successful_sends = 0
            failed_sends = 0
            
            for appointment in appointments:
                try:
                    result = whatsapp_notifier.send_appointment_reminder(appointment['id'])
                    if result['success']:
                        successful_sends += 1
                        results['results'].append({
                            'action': 'appointment_reminder_sent',
                            'patient': appointment['patient_name'],
                            'appointment_id': appointment['id'],
                            'appointment_time': appointment['appointment_time'],
                            'doctor': appointment['doctor_name'],
                            'status': 'success'
                        })
                        results['natural_results'].append(
                            f"✅ Reminder sent to {appointment['patient_name']} for appointment with Dr. {appointment['doctor_name']} on {appointment['appointment_time']}"
                        )
                    else:
                        failed_sends += 1
                        results['natural_results'].append(
                            f"❌ Failed to send reminder to {appointment['patient_name']}: {result.get('error', 'Unknown error')}"
                        )
                except Exception as e:
                    failed_sends += 1
                    results['natural_results'].append(
                        f"❌ Error sending reminder to {appointment['patient_name']}: {str(e)}"
                    )
            
            # Add context-aware summary
            summary = f"📋 Bulk appointment reminders for {context_desc}: {successful_sends} successful, {failed_sends} failed"
            results['natural_results'].insert(0, summary)
            
            return results
            
        except Exception as e:
            logger.error(f"Error handling context-aware bulk appointment reminders: {e}")
            return {
                'success': False,
                'error': f"Error processing context-aware bulk appointment reminders: {str(e)}",
                'results': []
            }
    
    def get_all_upcoming_appointments(self) -> List[Dict]:
        """Get all upcoming appointments for bulk reminders"""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            query = """
            SELECT 
                a.appointment_id,
                a.appointment_date,
                a.status,
                p.first_name as patient_name,
                p.phone as patient_phone,
                d.first_name as doctor_name,
                d.department_id,
                dept.name as department_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            JOIN doctors d ON a.doctor_id = d.doctor_id
            JOIN departments dept ON d.department_id = dept.department_id
            WHERE a.appointment_date > NOW()
            AND a.status = 'Scheduled'
            ORDER BY a.appointment_date
            LIMIT 20
            """
            
            cursor.execute(query)
            results = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting all upcoming appointments: {e}")
            return []
    
    def handle_medication_reminder(self, patient_identifier: str, question: str) -> Dict:
        """Handle medication reminder for a patient with database data"""
        try:
            from whatsapp_integration import whatsapp_notifier

            # Get patient info
            patient_info = self.get_patient_by_identifier(patient_identifier)
            if not patient_info:
                return {
                    'success': False,
                    'error': f'Patient {patient_identifier} not found',
                    'results': []
                }

            patient_id = patient_info.get('id') or patient_info.get('patient_id')
            medication_info = self.extract_medication_info(question)

            try:
                from services import engagement_orchestrator as orchestrator
                if medication_info and medication_info.get('name') != 'medication':
                    result = orchestrator.create_event(
                        str(patient_id),
                        'medication_reminder',
                        send_now=True,
                        payload={
                            'medication_name': medication_info['name'],
                            'dosage': medication_info.get('dosage'),
                            'time': medication_info.get('time'),
                        },
                    )
                    medication_desc = f"{medication_info['name']} ({medication_info.get('dosage')}) at {medication_info.get('time')}"
                else:
                    result = orchestrator.create_event(
                        str(patient_id),
                        'medication_reminder',
                        send_now=True,
                        payload={'medication_name': 'your current medications'},
                    )
                    medication_desc = "all current medications"
                ok = bool(result.get('success'))
            except Exception:
                if medication_info and medication_info.get('name') != 'medication':
                    result = whatsapp_notifier.send_medication_reminder(
                        patient_info['id'],
                        medication_info['name'],
                        medication_info['dosage'],
                        medication_info['time']
                    )
                    medication_desc = f"{medication_info['name']} ({medication_info['dosage']}) at {medication_info['time']}"
                else:
                    result = whatsapp_notifier.send_medication_reminder(patient_info['id'])
                    medication_desc = "all current medications"
                ok = bool(result.get('success'))

            if ok:
                return {
                    'success': True,
                    'results': [{
                        'action': 'medication_reminder_sent',
                        'patient': patient_identifier,
                        'medication': medication_desc,
                        'status': 'success'
                    }],
                    'natural_results': [f"Medication reminder sent to {patient_identifier} for {medication_desc}."]
                }
            else:
                return {
                    'success': False,
                    'error': f"Failed to send medication reminder: {result['error']}",
                    'results': []
                }
                
        except Exception as e:
            logger.error(f"Error handling medication reminder: {e}")
            return {
                'success': False,
                'error': f"Error processing medication reminder: {str(e)}",
                'results': []
            }
    
    def extract_medication_info(self, question: str) -> Dict:
        """Extract medication information from the question"""
        import re
        
        # Simple extraction - can be enhanced with more sophisticated NLP
        medication_info = {
            'name': 'medication',
            'dosage': 'as prescribed',
            'time': 'now'
        }
        
        # Extract medication name
        med_patterns = [
            r'medication\s+([a-zA-Z\s]+?)(?:\s+dosage|\s+time|$)',
            r'medicine\s+([a-zA-Z\s]+?)(?:\s+dosage|\s+time|$)',
            r'for\s+([a-zA-Z\s]+?)(?:\s+dosage|\s+time|$)'
        ]
        
        for pattern in med_patterns:
            match = re.search(pattern, question, re.IGNORECASE)
            if match:
                medication_info['name'] = match.group(1).strip()
                break
        
        # Extract dosage
        dosage_match = re.search(r'(\d+\s*(?:mg|ml|tablet|pill|dose))', question, re.IGNORECASE)
        if dosage_match:
            medication_info['dosage'] = dosage_match.group(1)
        
        # Extract time
        time_match = re.search(r'at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)', question, re.IGNORECASE)
        if time_match:
            medication_info['time'] = time_match.group(1)
        
        return medication_info
    
    def get_patient_appointments(self, patient_identifier: str) -> List[Dict]:
        """Get upcoming appointments for a patient"""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            if patient_identifier.isdigit():
                query = """
                SELECT a.appointment_id, a.appointment_date, a.status
                FROM appointments a
                JOIN patients p ON a.patient_id = p.patient_id
                WHERE p.patient_id = %s AND a.appointment_date > NOW()
                ORDER BY a.appointment_date
                LIMIT 5
                """
                cursor.execute(query, (int(patient_identifier),))
            else:
                query = """
                SELECT a.appointment_id, a.appointment_date, a.status
                FROM appointments a
                JOIN patients p ON a.patient_id = p.patient_id
                WHERE p.first_name LIKE %s AND a.appointment_date > NOW()
                ORDER BY a.appointment_date
                LIMIT 5
                """
                cursor.execute(query, (f"%{patient_identifier}%",))
            
            results = cursor.fetchall()
            cursor.close()
            conn.close()
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting patient appointments: {e}")
            return []
    
    def extract_context_with_llm(self, conversation_context: str) -> Dict:
        """Use LLM to extract context information from conversation"""
        try:
            prompt = f"""
You are a healthcare assistant analyzing conversation context to understand which appointments to send reminders for.

Conversation Context:
{conversation_context}

Please extract the following information from the conversation:

1. Doctor Name: Extract the doctor's name if mentioned
2. Date Range: Extract any date ranges or specific dates mentioned
3. Patient Count: How many patients are mentioned
4. Appointment Types: Any specific appointment types mentioned

Return the information in JSON format like this:
{{
    "doctor_name": "Dr. Carol Lee",
    "date_range": "July 24-29, 2025",
    "patient_count": 4,
    "appointment_types": ["fever and cough", "child vaccination", "cold and flu", "sore throat"]
}}

If any information is not found, use null for that field.
"""

            response = openai.ChatCompletion.create(
                model="gpt-4.1",
                messages=[
                    {"role": "system", "content": "You are a healthcare assistant that extracts context from conversations."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,
                temperature=0.1
            )
            
            import json
            context_info = json.loads(response.choices[0].message['content'].strip())
            logger.info(f"LLM extracted context: {context_info}")
            
            return context_info
            
        except Exception as e:
            logger.error(f"Error extracting context with LLM: {e}")
            return {}
    
    def get_appointments_by_doctor(self, doctor_name: str) -> List[Dict]:
        """Get appointments for a specific doctor"""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            query = """
            SELECT 
                a.appointment_id,
                a.appointment_date,
                a.status,
                p.first_name as patient_name,
                p.phone as patient_phone,
                d.first_name as doctor_name,
                d.department_id,
                dept.name as department_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            JOIN doctors d ON a.doctor_id = d.doctor_id
            JOIN departments dept ON d.department_id = dept.department_id
            WHERE d.first_name LIKE %s
            AND a.appointment_date > NOW()
            AND a.status = 'Scheduled'
            ORDER BY a.appointment_date
            LIMIT 20
            """
            
            cursor.execute(query, (f"%{doctor_name}%",))
            results = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting appointments by doctor: {e}")
            return []
    
    def get_appointments_by_date_range(self, date_range: str) -> List[Dict]:
        """Get appointments within a specific date range"""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            # Parse date range (simple implementation - can be enhanced)
            if "July 24-29" in date_range:
                start_date = "2025-07-24"
                end_date = "2025-07-29"
            else:
                # Fallback to next 7 days
                start_date = datetime.now().strftime('%Y-%m-%d')
                end_date = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
            
            query = """
            SELECT 
                a.appointment_id,
                a.appointment_date,
                a.status,
                p.first_name as patient_name,
                p.phone as patient_phone,
                d.first_name as doctor_name,
                d.department_id,
                dept.name as department_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            JOIN doctors d ON a.doctor_id = d.doctor_id
            JOIN departments dept ON d.department_id = dept.department_id
            WHERE DATE(a.appointment_date) BETWEEN %s AND %s
            AND a.status = 'Scheduled'
            ORDER BY a.appointment_date
            LIMIT 20
            """
            
            cursor.execute(query, (start_date, end_date))
            results = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting appointments by date range: {e}")
            return []
    
    def get_patient_by_identifier(self, identifier: str) -> Optional[Dict]:
        """Get patient by ID or name - returns comprehensive patient data"""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            # First, get the actual schema to see what columns exist
            cursor.execute("DESCRIBE patients")
            columns_info = cursor.fetchall()
            # Handle both tuple and dict formats
            if columns_info and isinstance(columns_info[0], dict):
                # DictCursor returns dictionaries
                available_columns = [col.get('Field') or col.get('field') for col in columns_info]
            else:
                # Regular cursor returns tuples
                available_columns = [col[0] for col in columns_info]
            
            # Build SELECT list with only existing columns
            select_fields = []
            core_fields = ['patient_id', 'first_name', 'last_name', 'gender', 'phone', 'email', 'address']
            # Handle date of birth - could be 'dob' or 'date_of_birth'
            dob_field = None
            if 'dob' in available_columns:
                dob_field = 'dob'
            elif 'date_of_birth' in available_columns:
                dob_field = 'date_of_birth'
            if dob_field:
                select_fields.append(f"p.{dob_field} AS dob")
            
            optional_fields = ['emergency_contact_name', 'emergency_contact_phone', 'blood_type', 'height_cm', 'weight_kg', 'bmi', 'created_at', 'updated_at']
            
            # Add core fields (should always exist)
            for field in core_fields:
                if field in available_columns:
                    select_fields.append(f"p.{field}")
            
            # Add optional fields if they exist
            for field in optional_fields:
                if field in available_columns:
                    select_fields.append(f"p.{field}")
            
            if not select_fields:
                logger.error("No valid columns found in patients table")
                return None
            
            select_clause = ", ".join(select_fields)
            
            # Try to get comprehensive patient data
            # Check if identifier is a patient ID (starts with PAT- or is numeric)
            if identifier.upper().startswith('PAT-') or identifier.isdigit():
                # Try by patient_id (exact match)
                query = f"""
                    SELECT {select_clause}
                    FROM patients p
                    WHERE p.patient_id = %s
                    LIMIT 1
                """
                cursor.execute(query, (str(identifier),))
            else:
                # Search by name (first_name or last_name)
                query = f"""
                    SELECT {select_clause}
                    FROM patients p
                    WHERE UPPER(p.first_name) LIKE %s 
                       OR UPPER(p.last_name) LIKE %s
                       OR UPPER(CONCAT(p.first_name, ' ', p.last_name)) LIKE %s
                    LIMIT 1
                """
                search_term = f"%{identifier.upper()}%"
                cursor.execute(query, (search_term, search_term, search_term))
            
            result = cursor.fetchone()
            
            if result:
                # Calculate age from date of birth
                if result.get('dob'):
                    from datetime import date
                    dob = result['dob']
                    if isinstance(dob, date):
                        today = date.today()
                        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
                        result['age'] = age
                
                # Get recent appointments
                patient_id = result.get('patient_id')
                if patient_id:
                    try:
                        appt_query = """
                            SELECT 
                                a.appointment_id,
                                a.appointment_date,
                                a.reason,
                                a.status,
                                d.first_name as doctor_name,
                                dept.name as department_name
                            FROM appointments a
                            LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
                            LEFT JOIN departments dept ON d.department_id = dept.department_id
                            WHERE a.patient_id = %s
                            ORDER BY a.appointment_date DESC
                            LIMIT 5
                        """
                        cursor.execute(appt_query, (patient_id,))
                        result['recent_appointments'] = cursor.fetchall()
                    except Exception as appt_error:
                        logger.warning(f"Could not fetch appointments for patient {patient_id}: {appt_error}")
                        result['recent_appointments'] = []
            
            cursor.close()
            conn.close()
            
            logger.info(f"Successfully retrieved patient data for identifier: {identifier}")
            return result
            
        except pymysql.err.OperationalError as e:
            logger.error(f"Database operational error getting patient by identifier: {e}")
            logger.error(f"Error code: {e.args[0]}, Error message: {e.args[1]}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return None
        except Exception as e:
            logger.error(f"Error getting patient by identifier: {e}")
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return None

    def get_medical_records_for_patient(
        self,
        patient_id: str,
        record_types: Optional[List[str]] = None,
        limit: int = 25,
    ) -> List[Dict]:
        """Fetch medical records for a patient (for staff AI context)."""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)

            query = """
                SELECT
                    mr.record_id,
                    mr.patient_id,
                    mr.family_member_id,
                    mr.record_type,
                    mr.title,
                    mr.description,
                    mr.file_path,
                    mr.file_type,
                    mr.visit_date,
                    mr.created_at,
                    fm.first_name AS family_member_first_name,
                    fm.last_name AS family_member_last_name
                FROM medical_records mr
                LEFT JOIN family_members fm ON mr.family_member_id = fm.family_member_id
                WHERE mr.patient_id = %s
            """
            params: List = [patient_id]

            if record_types:
                placeholders = ", ".join(["%s"] * len(record_types))
                query += f" AND mr.record_type IN ({placeholders})"
                params.extend(record_types)

            query += " ORDER BY mr.visit_date DESC, mr.created_at DESC LIMIT %s"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()
            cursor.close()
            conn.close()

            for row in rows:
                for key in ("visit_date", "created_at"):
                    if row.get(key) and hasattr(row[key], "isoformat"):
                        row[key] = row[key].isoformat()
                if row.get("description") and len(row["description"]) > 1200:
                    row["description"] = row["description"][:1200] + "…"

            return rows
        except Exception as e:
            logger.error(f"Error fetching medical records for patient {patient_id}: {e}")
            return []
    
    def extract_patient_identifier_from_query(self, query: str) -> Optional[str]:
        """Extract patient name or ID from a natural language query using regex first, then AI"""
        try:
            # First, try regex patterns to catch common patient ID formats
            # Pattern for PAT-XXXXXX-XXXX format (e.g., PAT-251224-8AHT)
            pat_id_pattern = r'\bPAT-\d{6}-[A-Z0-9]{4}\b'
            pat_match = re.search(pat_id_pattern, query, re.IGNORECASE)
            if pat_match:
                identifier = pat_match.group(0).upper()
                logger.info(f"Extracted patient ID via regex: '{identifier}' from query: '{query}'")
                return identifier
            
            # Pattern for other PAT- prefixed IDs
            pat_generic_pattern = r'\bPAT-[A-Z0-9-]+\b'
            pat_generic_match = re.search(pat_generic_pattern, query, re.IGNORECASE)
            if pat_generic_match:
                identifier = pat_generic_match.group(0).upper()
                logger.info(f"Extracted patient ID via regex (generic): '{identifier}' from query: '{query}'")
                return identifier
            
            # Pattern for numeric patient IDs
            numeric_id_pattern = r'\bpatient\s+(?:id\s+)?(\d+)\b'
            numeric_match = re.search(numeric_id_pattern, query, re.IGNORECASE)
            if numeric_match:
                identifier = numeric_match.group(1)
                logger.info(f"Extracted numeric patient ID via regex: '{identifier}' from query: '{query}'")
                return identifier
            
            # If regex doesn't find anything, use AI extraction
            prompt = f"""Extract the patient identifier (name or ID) from the following medical query. 
If the query mentions a specific patient, return ONLY the patient name or ID. 
If no patient is mentioned, return "NONE".

Query: "{query}"

Return format:
- If patient name found: return just the name (e.g., "John Smith" or "Smith")
- If patient ID found: return just the ID (e.g., "12345", "PAT-251224-8AHT", or "P-12345")
- If no patient mentioned: return "NONE"

IMPORTANT: Look for patient IDs in formats like:
- PAT-XXXXXX-XXXX (e.g., PAT-251224-8AHT)
- PAT- followed by alphanumeric characters
- Numeric IDs after "patient" or "patient ID"

Patient Identifier:"""

            response = openai.ChatCompletion.create(
                model="gpt-4.1",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=50,
                temperature=0.1
            )
            
            identifier = response.choices[0].message['content'].strip()
            
            # Clean up the response
            identifier = identifier.replace('"', '').replace("'", '').strip()
            
            if identifier.upper() == "NONE" or not identifier:
                return None
            
            logger.info(f"Extracted patient identifier via AI: '{identifier}' from query: '{query}'")
            return identifier
            
        except Exception as e:
            logger.error(f"Error extracting patient identifier: {e}")
            return None

    def get_daily_appointments(self):
        """Get today's appointments from the database"""
        try:
            logger.info("Fetching daily appointments")
            
            # SQL query to get today's appointments (updated for new schema)
            sql_query = """
            SELECT 
                a.appointment_id,
                p.first_name as patient_name,
                p.phone as patient_phone,
                a.appointment_date,
                a.appointment_time,
                CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
                s.name as specialty_name,
                f.name as facility_name,
                a.status
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            JOIN doctors d ON a.doctor_id = d.doctor_id
            LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
            JOIN facilities f ON a.facility_id = f.facility_id
            WHERE DATE(a.appointment_date) = CURDATE()
            ORDER BY a.appointment_time ASC
            """
            
            # Execute query
            results, error = self.execute_query(sql_query)
            
            if error:
                logger.error(f"Error fetching daily appointments: {error}")
                return {
                    'success': False,
                    'error': f"Database Error: {error}",
                    'appointments': []
                }
            
            # Convert results to list of dictionaries for JSON serialization
            formatted_appointments = []
            for row in results:
                formatted_appointment = {}
                for key, value in row.items():
                    # Handle datetime objects and other non-serializable types
                    if value is None:
                        formatted_appointment[key] = None
                    elif isinstance(value, timedelta):
                        # Convert timedelta to string representation (e.g., "5 days, 3:00:00")
                        formatted_appointment[key] = str(value)
                    elif hasattr(value, 'isoformat'):
                        formatted_appointment[key] = value.isoformat()
                    elif isinstance(value, (date, datetime)):
                        formatted_appointment[key] = value.isoformat()
                    else:
                        formatted_appointment[key] = value
                formatted_appointments.append(formatted_appointment)
            
            logger.info(f"Found {len(formatted_appointments)} appointments for today")
            #logger.info(formatted_appointment)
            return {
                'success': True,
                'appointments': formatted_appointments,
                'count': len(formatted_appointments)
            }
            
        except Exception as e:
            logger.error(f"Error fetching daily appointments: {e}")
            return {
                'success': False,
                'error': f"Internal server error: {str(e)}",
                'appointments': []
            }

    def update_daily_appointments_cache(self):
        """Update the daily appointments cache (called by scheduled task)"""
        try:
            logger.info("Updating daily appointments cache")
            
            # Get today's appointments
            result = self.get_daily_appointments()
            
            if result['success']:
                # Store in cache or file for quick access
                import json
                from datetime import datetime
                
                cache_data = {
                    'last_updated': datetime.now().isoformat(),
                    'appointments': result['appointments'],
                    'count': result['count']
                }
                
                # Save to cache file
                cache_file = 'daily_appointments_cache.json'
                with open(cache_file, 'w') as f:
                    json.dump(cache_data, f, indent=2)
                
                logger.info(f"Daily appointments cache updated with {result['count']} appointments")
                return True
            else:
                logger.error(f"Failed to update daily appointments cache: {result['error']}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating daily appointments cache: {e}")
            return False

    def get_appointments_by_date_range(self, start_date: date, end_date: date):
        """Get appointments for a date range (inclusive)"""
        try:
            start_str = start_date.strftime('%Y-%m-%d')
            end_str = end_date.strftime('%Y-%m-%d')
            logger.info(f"Fetching appointments from {start_str} to {end_str}")

            sql_query = f"""
            SELECT 
                a.appointment_id,
                a.patient_id,
                a.family_member_id,
                a.doctor_id,
                a.facility_id,
                p.first_name as patient_first_name,
                p.last_name as patient_last_name,
                p.email as patient_email,
                CONCAT(p.first_name, ' ', p.last_name) as patient_name,
                p.phone as patient_phone,
                fm.first_name as family_member_first_name,
                fm.last_name as family_member_last_name,
                fm.relationship as family_member_relationship,
                fm.phone as family_member_phone,
                a.appointment_date,
                a.appointment_time,
                a.appointment_type,
                a.reason,
                a.notes,
                CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
                s.name as specialty_name,
                f.name as facility_name,
                a.status
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            LEFT JOIN family_members fm ON a.family_member_id = fm.family_member_id
            JOIN doctors d ON a.doctor_id = d.doctor_id
            LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
            JOIN facilities f ON a.facility_id = f.facility_id
            WHERE DATE(a.appointment_date) >= '{start_str}'
            AND DATE(a.appointment_date) <= '{end_str}'
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
            """

            results, error = self.execute_query(sql_query)
            if error:
                return {'success': False, 'error': error, 'appointments': []}

            formatted = []
            for row in results:
                formatted_appointment = {}
                for key, value in row.items():
                    if value is None:
                        formatted_appointment[key] = None
                    elif isinstance(value, timedelta):
                        formatted_appointment[key] = str(value)
                    elif hasattr(value, 'isoformat'):
                        formatted_appointment[key] = value.isoformat()
                    elif isinstance(value, (date, datetime)):
                        formatted_appointment[key] = value.isoformat()
                    else:
                        formatted_appointment[key] = value
                formatted.append(formatted_appointment)

            return {'success': True, 'appointments': formatted, 'count': len(formatted)}
        except Exception as e:
            logger.error(f"Error fetching appointments by date range: {e}")
            return {'success': False, 'error': str(e), 'appointments': []}

    def get_cached_daily_appointments(self):
        """Get daily appointments from cache"""
        try:
            import json
            from datetime import datetime
            
            cache_file = 'daily_appointments_cache.json'
            
            # Check if cache file exists and is from today
            try:
                with open(cache_file, 'r') as f:
                    cache_data = json.load(f)
                
                # Check if cache is from today
                last_updated = datetime.fromisoformat(cache_data['last_updated'])
                if last_updated.date() == datetime.now().date():
                    logger.info("Returning cached daily appointments")
                    return {
                        'success': True,
                        'appointments': cache_data['appointments'],
                        'count': cache_data['count'],
                        'cached': True
                    }
            except (FileNotFoundError, json.JSONDecodeError, KeyError):
                pass
            
            # If no valid cache, fetch fresh data
            logger.info("No valid cache found, fetching fresh daily appointments")
            return self.get_daily_appointments()
            
        except Exception as e:
            logger.error(f"Error getting cached daily appointments: {e}")
            return self.get_daily_appointments()

def run_daily_appointments_update():
    """Function to run daily appointments update (for scheduled tasks)"""
    try:
        print("🕛 Running daily appointments update...")
        agent = DatabaseAgent()
        
        # Test database connection
        schema = agent.get_database_schema()
        if not schema:
            print("❌ Failed to connect to database")
            return False
        
        # Update daily appointments cache
        success = agent.update_daily_appointments_cache()
        
        if success:
            print("✅ Daily appointments cache updated successfully")
        else:
            print("❌ Failed to update daily appointments cache")
        
        return success
        
    except Exception as e:
        print(f"❌ Error in daily appointments update: {e}")
        return False

def main():
    """Main function to run the database agent"""
    print("🗄️ Database Agent with Natural Language Processing")
    print("=" * 55)
    
    agent = DatabaseAgent()
    
    # Test database connection
    try:
        schema = agent.get_database_schema()
        if schema:
            print(f"✅ Connected to database '{MYSQL_DATABASE}'")
            print(f"📊 Found {len(schema)} table(s): {', '.join(schema.keys())}")
        else:
            print("❌ Failed to connect to database")
            return
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        return
    
    # Interactive mode
    while True:
        print("\n" + "-" * 55)
        print("Options:")
        print("1. Enter database question")
        print("2. View today's appointments")
        print("3. Update daily appointments cache")
        print("4. Quit")
        
        choice = input("\nSelect option (1-4): ").strip()
        
        if choice == '1':
            question = input("\n💬 Enter your database question: ").strip()
            if question:
                try:
                    agent.process_question(question)
                except Exception as e:
                    logger.error(f"Error processing question: {e}")
                    print(f"❌ Error: {e}")
        
        elif choice == '2':
            print("\n📅 Today's Appointments:")
            result = agent.get_cached_daily_appointments()
            if result['success']:
                if result['appointments']:
                    for i, appointment in enumerate(result['appointments'], 1):
                        print(f"\n--- Appointment {i} ---")
                        for key, value in appointment.items():
                            print(f"{key}: {value}")
                else:
                    print("No appointments for today")
            else:
                print(f"❌ Error: {result['error']}")
        
        elif choice == '3':
            print("\n🔄 Updating daily appointments cache...")
            success = agent.update_daily_appointments_cache()
            if success:
                print("✅ Cache updated successfully")
            else:
                print("❌ Failed to update cache")
        
        elif choice == '4' or choice.lower() in ['quit', 'exit', 'q']:
            print("👋 Goodbye!")
            break
        
        else:
            print("❌ Invalid option. Please select 1-4.")

if __name__ == "__main__":
    logger.info("Database Agent module loaded successfully")
    main()