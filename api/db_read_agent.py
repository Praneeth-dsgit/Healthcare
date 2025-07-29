import pymysql
import os
import re
import json
import traceback
from typing import List, Dict, Optional
from dotenv import load_dotenv
import openai
import logging
from datetime import datetime, timedelta

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
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE', 'hospital_db')

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
    
    def validate_sql(self, sql_query):
        """Basic SQL validation and safety checks"""
        # Convert to lowercase for checking
        sql_lower = sql_query.lower().strip()
        
        # Only allow SELECT statements
        if not sql_lower.startswith('select'):
            return False, "Only SELECT queries are allowed"
        
        # Block dangerous keywords
        dangerous_keywords = [
            'drop', 'delete', 'insert', 'update', 'create', 'alter', 
            'truncate', 'exec', 'execute', 'xp_', 'sp_'
        ]
        
        for keyword in dangerous_keywords:
            if keyword in sql_lower:
                return False, f"Dangerous keyword '{keyword}' not allowed"
        
        # Basic SQL injection patterns
        injection_patterns = [
            r';\s*(drop|delete|insert|update)', 
            r'union\s+select',
            r'--\s*\w+',
            r'/\*.*\*/'
        ]
        
        for pattern in injection_patterns:
            if re.search(pattern, sql_lower):
                return False, "Potential SQL injection detected"
        
        return True, "Valid"
    
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
5. Add LIMIT 100 to prevent large result sets
6. Use DATE() function for date comparisons
7. Use LIKE for partial string matches
8. Use UPPER() or LOWER() for case-insensitive searches

SCHEMA RELATIONSHIPS:
- doctors table has: id, name, department, specialization
- patients table has: id, name, condition, age, gender
- appointments table has: id, patient_id, doctor_id, appointment_time, status
- departments table has: id, name, description

Generate ONLY a SELECT query for: "{question}"

SQL Query (SELECT ONLY):"""
        
        logger.info(f"Original question: '{question}'")
        logger.info(f"Prompt length: {len(prompt)}")
        
        # Try up to 3 times to generate valid SQL
        for attempt in range(3):
            try:
                logger.info(f"Attempt {attempt + 1}: Calling OpenAI API...")
                response = openai.ChatCompletion.create(
                    model="gpt-4",
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
    
    def execute_query(self, sql_query):
        """Execute SQL query safely"""
        # Validate SQL first
        is_valid, message = self.validate_sql(sql_query)
        if not is_valid:
            return None, f"SQL Validation Error: {message}"
        
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            # Add LIMIT if not present for safety
            if 'limit' not in sql_query.lower():
                sql_query += " LIMIT 100"
            
            cursor.execute(sql_query)
            results = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return results, None
            
        except Exception as e:
            logger.error(f"Database query error: {e}")
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
                    if hasattr(value, 'isoformat'):
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
                model="gpt-4",
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
                # Generic notification
                message = self.extract_custom_message(question) or "This is a reminder from your healthcare provider."
                result = whatsapp_notifier.send_custom_notification(patient_identifier, message)
                
                if result['success']:
                    return {
                        'success': True,
                        'results': [{
                            'action': 'notification_sent',
                            'patient': patient_identifier,
                            'message': message,
                            'status': 'success'
                        }],
                        'natural_results': [f"Notification sent successfully to {patient_identifier}."]
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
                a.id,
                a.appointment_time,
                a.status,
                p.name as patient_name,
                p.phone as patient_phone,
                d.name as doctor_name,
                d.department
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.appointment_time > NOW()
            AND a.status = 'confirmed'
            ORDER BY a.appointment_time
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
            
            # Check if specific medication was mentioned in the question
            medication_info = self.extract_medication_info(question)
            
            if medication_info and medication_info.get('name') != 'medication':
                # Use specific medication details from the question
                result = whatsapp_notifier.send_medication_reminder(
                    patient_info['id'],
                    medication_info['name'],
                    medication_info['dosage'],
                    medication_info['time']
                )
                medication_desc = f"{medication_info['name']} ({medication_info['dosage']}) at {medication_info['time']}"
            else:
                # Send reminder for all current medications from database
                result = whatsapp_notifier.send_medication_reminder(patient_info['id'])
                medication_desc = "all current medications"
            
            if result['success']:
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
                SELECT a.id, a.appointment_time, a.status
                FROM appointments a
                JOIN patients p ON a.patient_id = p.id
                WHERE p.id = %s AND a.appointment_time > NOW()
                ORDER BY a.appointment_time
                LIMIT 5
                """
                cursor.execute(query, (int(patient_identifier),))
            else:
                query = """
                SELECT a.id, a.appointment_time, a.status
                FROM appointments a
                JOIN patients p ON a.patient_id = p.id
                WHERE p.name LIKE %s AND a.appointment_time > NOW()
                ORDER BY a.appointment_time
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
                model="gpt-4",
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
                a.id,
                a.appointment_time,
                a.status,
                p.name as patient_name,
                p.phone as patient_phone,
                d.name as doctor_name,
                d.department
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE d.name LIKE %s
            AND a.appointment_time > NOW()
            AND a.status = 'confirmed'
            ORDER BY a.appointment_time
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
                a.id,
                a.appointment_time,
                a.status,
                p.name as patient_name,
                p.phone as patient_phone,
                d.name as doctor_name,
                d.department
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE DATE(a.appointment_time) BETWEEN %s AND %s
            AND a.status = 'confirmed'
            ORDER BY a.appointment_time
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
        """Get patient by ID or name"""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            if identifier.isdigit():
                query = "SELECT id, name, phone, email FROM patients WHERE id = %s"
                cursor.execute(query, (int(identifier),))
            else:
                query = "SELECT id, name, phone, email FROM patients WHERE name LIKE %s"
                cursor.execute(query, (f"%{identifier}%",))
            
            result = cursor.fetchone()
            cursor.close()
            conn.close()
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting patient by identifier: {e}")
            return None

    def get_daily_appointments(self):
        """Get today's appointments from the database"""
        try:
            logger.info("Fetching daily appointments")
            
            # SQL query to get today's appointments
            sql_query = """
            SELECT 
                a.id,
                p.name as patient_name,
                a.appointment_time,
                d.name as doctor_name,
                d.department,
                a.status
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE DATE(a.appointment_time) = CURDATE()
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
                    if hasattr(value, 'isoformat'):
                        formatted_appointment[key] = value.isoformat()
                    else:
                        formatted_appointment[key] = value
                formatted_appointments.append(formatted_appointment)
            
            logger.info(f"Found {len(formatted_appointments)} appointments for today")
            
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