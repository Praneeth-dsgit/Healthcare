import json
import time
import tiktoken
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import logging

logger = logging.getLogger(__name__)

# Initialize tokenizer for GPT-4
try:
    tokenizer = tiktoken.encoding_for_model("gpt-4")
except:
    # Fallback if tiktoken not available
    tokenizer = None

class ContextType(Enum):
    CONVERSATION = "conversation"
    PATIENT = "patient"
    FILE = "file"
    CAPABILITY = "capability"
    SESSION = "session"

@dataclass
class ConversationTurn:
    """Represents a single turn in the conversation"""
    timestamp: float
    user_message: str
    ai_response: str
    capability: str
    context_used: Dict[str, any]
    relevance_score: float = 0.0

@dataclass
class ContextState:
    """Represents the current context state"""
    session_id: str
    patient_info: Optional[Dict] = None
    current_capability: str = "general"
    conversation_history: List[ConversationTurn] = None
    file_context: Optional[Dict] = None
    last_file_findings: Optional[str] = None
    context_window_size: int = 10  # Number of turns to keep in context
    
    def __post_init__(self):
        if self.conversation_history is None:
            self.conversation_history = []

class ContextManager:
    """Advanced context management for chatbot conversations with token-aware optimization"""
    
    def __init__(self):
        self.contexts: Dict[str, ContextState] = {}
        self.relevance_threshold = 0.4  # Minimum relevance score to maintain context
        
        # Token management settings
        self.max_tokens = 6000  # Reserve ~2000 tokens for response
        self.max_conversation_tokens = 3000  # Max tokens for conversation history
        self.max_patient_tokens = 500  # Max tokens for patient context
        self.max_file_tokens = 1000  # Max tokens for file context
        self.system_prompt_tokens = 1000  # Estimated system prompt tokens
        
    def get_or_create_context(self, session_id: str) -> ContextState:
        """Get existing context or create new one for session"""
        if session_id not in self.contexts:
            self.contexts[session_id] = ContextState(session_id=session_id)
        return self.contexts[session_id]
    
    def update_patient_context(self, session_id: str, patient_info: Dict):
        """Update patient information in context"""
        context = self.get_or_create_context(session_id)
        context.patient_info = patient_info
        logger.info(f"Updated patient context for session {session_id}")
    
    def update_capability_context(self, session_id: str, capability: str):
        """Update capability in context"""
        context = self.get_or_create_context(session_id)
        context.current_capability = capability
        logger.info(f"Updated capability context for session {session_id}: {capability}")
    
    def add_conversation_turn(self, session_id: str, user_message: str, 
                            ai_response: str, capability: str, 
                            context_used: Dict[str, any]):
        """Add a conversation turn to the context"""
        context = self.get_or_create_context(session_id)
        
        # Calculate relevance score
        relevance_score = self._calculate_relevance_score(user_message, context)
        
        turn = ConversationTurn(
            timestamp=time.time(),
            user_message=user_message,
            ai_response=ai_response,
            capability=capability,
            context_used=context_used,
            relevance_score=relevance_score
        )
        
        context.conversation_history.append(turn)
        
        # Maintain context window size
        if len(context.conversation_history) > context.context_window_size:
            context.conversation_history = context.conversation_history[-context.context_window_size:]
        
        logger.info(f"Added conversation turn to session {session_id}, relevance: {relevance_score:.2f}")
    
    def update_file_context(self, session_id: str, file_info: Dict, findings: str):
        """Update file context and findings"""
        context = self.get_or_create_context(session_id)
        context.file_context = file_info
        context.last_file_findings = findings
        logger.info(f"Updated file context for session {session_id}")
    
    def analyze_context_relevance(self, session_id: str, current_query: str) -> Dict[str, any]:
        """Analyze how relevant current query is to existing context"""
        context = self.get_or_create_context(session_id)
        
        analysis = {
            'is_follow_up': False,
            'relevance_score': 0.0,
            'relevant_context': [],
            'context_type': 'new_topic',
            'suggested_context': {}
        }
        
        if not context.conversation_history:
            return analysis
        
        # Check for follow-up indicators in the current query
        follow_up_indicators = [
            'above', 'this', 'that', 'it', 'the condition', 'the problem', 'the issue',
            'what about', 'how about', 'and', 'also', 'too', 'treatment plan for',
            'give me', 'provide', 'suggest', 'recommend'
        ]
        
        has_follow_up_indicators = any(indicator in current_query.lower() for indicator in follow_up_indicators)
        
        if has_follow_up_indicators:
            # For follow-up queries, prioritize the MOST RECENT conversation turn
            most_recent_turn = context.conversation_history[-1]
            relevance = self._calculate_query_relevance(current_query, most_recent_turn.user_message, most_recent_turn.ai_response)
            
            analysis['relevance_score'] = relevance
            analysis['is_follow_up'] = True
            analysis['context_type'] = 'follow_up'
            analysis['relevant_context'] = [most_recent_turn]
            analysis['suggested_context'] = {
                'previous_ai_message': most_recent_turn.ai_response,
                'previous_user_message': most_recent_turn.user_message,
                'capability': most_recent_turn.capability
            }
            
            logger.info(f"Follow-up query detected, using most recent context: {most_recent_turn.user_message[:50]}...")
        else:
            # For non-follow-up queries, check relevance to recent conversation (last 3 turns)
            recent_turns = context.conversation_history[-3:]  # Last 3 turns
            max_relevance = 0.0
            most_relevant_context = None
            
            for turn in recent_turns:
                relevance = self._calculate_query_relevance(current_query, turn.user_message, turn.ai_response)
                if relevance > max_relevance:
                    max_relevance = relevance
                    most_relevant_context = turn
            
            analysis['relevance_score'] = max_relevance
            analysis['is_follow_up'] = max_relevance > self.relevance_threshold
            
            if analysis['is_follow_up']:
                analysis['context_type'] = 'follow_up'
                analysis['relevant_context'] = [most_relevant_context]
                analysis['suggested_context'] = {
                    'previous_ai_message': most_relevant_context.ai_response,
                    'previous_user_message': most_relevant_context.user_message,
                    'capability': most_relevant_context.capability
                }
        
        # Check if query references patient info
        if context.patient_info and self._references_patient_info(current_query, context.patient_info):
            analysis['context_type'] = 'patient_specific'
            analysis['suggested_context']['patient_info'] = context.patient_info
        
        # Check if query references file context
        if context.file_context and self._references_file_context(current_query, context.file_context):
            analysis['context_type'] = 'file_related'
            analysis['suggested_context']['file_context'] = context.file_context
            analysis['suggested_context']['file_findings'] = context.last_file_findings
        
        # Log detailed context analysis for debugging
        if analysis['is_follow_up'] and analysis['relevant_context']:
            relevant_turn = analysis['relevant_context'][0]
            logger.info(f"Context analysis for session {session_id}: {analysis['context_type']}, relevance: {analysis['relevance_score']:.2f}")
            logger.info(f"Selected context: User: '{relevant_turn.user_message[:100]}...' | AI: '{relevant_turn.ai_response[:100]}...'")
        else:
            logger.info(f"Context analysis for session {session_id}: {analysis['context_type']}, relevance: {analysis['relevance_score']:.2f} (no follow-up context)")
        
        return analysis
    
    def generate_contextual_prompt(self, session_id: str, current_query: str, 
                                 capability: str) -> Tuple[str, Dict[str, any]]:
        """Generate a token-optimized context-aware prompt for the AI"""
        context = self.get_or_create_context(session_id)
        analysis = self.analyze_context_relevance(session_id, current_query)
        
        # Build context-aware prompt with token optimization
        prompt_parts = []
        context_metadata = {}
        current_tokens = 0
        
        # Add capability-specific base prompt
        base_prompt = self._get_capability_base_prompt(capability)
        prompt_parts.append(base_prompt)
        current_tokens += self._count_tokens(base_prompt)
        
        # Add patient context if available and within token limits
        if context.patient_info and current_tokens < self.max_patient_tokens:
            patient_context = self._build_patient_context(context.patient_info, capability)
            patient_text = f"PATIENT CONTEXT:\n{patient_context}"
            patient_tokens = self._count_tokens(patient_text)
            
            if current_tokens + patient_tokens <= self.max_patient_tokens:
                prompt_parts.append(patient_text)
                current_tokens += patient_tokens
                context_metadata['patient_info'] = context.patient_info
                logger.info(f"Added patient context: {patient_tokens} tokens")
        
        # Add conversation history if relevant and within token limits
        if analysis['is_follow_up'] and analysis['relevant_context']:
            conversation_context = self._build_optimized_conversation_context(
                analysis['relevant_context'], current_query, current_tokens
            )
            if conversation_context:
                prompt_parts.append(conversation_context['text'])
                current_tokens += conversation_context['tokens']
                context_metadata['previous_context'] = analysis['suggested_context']
                logger.info(f"Added conversation context: {conversation_context['tokens']} tokens")
        
        # Add file context if relevant and within token limits
        if analysis['context_type'] == 'file_related' and context.file_context:
            file_context = self._build_optimized_file_context(
                context.file_context, context.last_file_findings, current_query, current_tokens
            )
            if file_context:
                prompt_parts.append(file_context['text'])
                current_tokens += file_context['tokens']
                context_metadata['file_context'] = context.file_context
                context_metadata['file_findings'] = context.last_file_findings
                logger.info(f"Added file context: {file_context['tokens']} tokens")
        
        # Add current query
        query_text = f"CURRENT QUERY: {current_query}"
        current_tokens += self._count_tokens(query_text)
        prompt_parts.append(query_text)
        
        # Combine all parts
        final_prompt = "\n\n".join(prompt_parts)
        
        logger.info(f"Generated prompt with {current_tokens} tokens for session {session_id}")
        
        return final_prompt, context_metadata
    
    def _calculate_relevance_score(self, user_message: str, context: ContextState) -> float:
        """Calculate relevance score for a user message"""
        if not context.conversation_history:
            return 0.0
        
        # Simple keyword-based relevance (can be enhanced with embeddings)
        recent_messages = [turn.user_message for turn in context.conversation_history[-3:]]
        all_recent_text = " ".join(recent_messages).lower()
        
        user_words = set(user_message.lower().split())
        recent_words = set(all_recent_text.split())
        
        if not user_words:
            return 0.0
        
        intersection = user_words.intersection(recent_words)
        relevance = len(intersection) / len(user_words)
        
        return min(relevance, 1.0)
    
    def _calculate_query_relevance(self, current_query: str, previous_user: str, previous_ai: str) -> float:
        """Calculate relevance between current query and previous conversation"""
        current_words = set(current_query.lower().split())
        previous_words = set((previous_user + " " + previous_ai).lower().split())
        
        if not current_words:
            return 0.0
        
        intersection = current_words.intersection(previous_words)
        relevance = len(intersection) / len(current_words)
        
        # Boost relevance for follow-up indicators
        follow_up_indicators = [
            'above', 'this', 'that', 'it', 'the condition', 'the problem', 'the issue',
            'what about', 'how about', 'and', 'also', 'too', 'treatment plan for',
            'give me', 'provide', 'suggest', 'recommend'
        ]
        
        # Check for follow-up indicators and boost relevance significantly
        follow_up_count = sum(1 for indicator in follow_up_indicators if indicator in current_query.lower())
        if follow_up_count > 0:
            relevance += (0.3 * follow_up_count)  # Boost by 0.3 for each indicator found
        
        return min(relevance, 1.0)
    
    def _references_patient_info(self, query: str, patient_info: Dict) -> bool:
        """Check if query references patient information"""
        query_lower = query.lower()
        patient_terms = ['patient', 'age', 'weight', 'height', 'gender', 'bmi', 'medication', 'allergy', 'history']
        return any(term in query_lower for term in patient_terms)
    
    def _references_file_context(self, query: str, file_context: Dict) -> bool:
        """Check if query references file context"""
        query_lower = query.lower()
        file_terms = ['image', 'scan', 'report', 'file', 'upload', 'picture', 'photo']
        return any(term in query_lower for term in file_terms)
    
    def _get_capability_base_prompt(self, capability: str) -> str:
        """Get base prompt for capability"""
        base_prompts = {
            'radiology': "You are a SPECIALIZED RADIOLOGY AI assistant. Focus on medical imaging interpretation.",
            'lab': "You are a SPECIALIZED LABORATORY MEDICINE AI assistant. Focus on lab test interpretation.",
            'general': "You are a GENERAL MEDICAL AI assistant. Provide general healthcare guidance."
        }
        return base_prompts.get(capability, base_prompts['general'])
    
    def _build_patient_context(self, patient_info: Dict, capability: str) -> str:
        """Build patient-specific context"""
        context_parts = []
        
        if patient_info.get('age'):
            context_parts.append(f"Age: {patient_info['age']} years")
        if patient_info.get('gender'):
            context_parts.append(f"Gender: {patient_info['gender']}")
        if patient_info.get('weight') and patient_info.get('height'):
            bmi = patient_info['weight'] / ((patient_info['height'] / 100) ** 2)
            context_parts.append(f"BMI: {bmi:.1f}")
        if patient_info.get('medications'):
            context_parts.append(f"Medications: {patient_info['medications']}")
        if patient_info.get('allergies'):
            context_parts.append(f"Allergies: {patient_info['allergies']}")
        
        return "\n".join(context_parts)
    
    def clear_context(self, session_id: str):
        """Clear context for a session"""
        if session_id in self.contexts:
            del self.contexts[session_id]
            logger.info(f"Cleared context for session {session_id}")
    
    def get_context_summary(self, session_id: str) -> Dict[str, any]:
        """Get a summary of the current context"""
        context = self.get_or_create_context(session_id)
        return {
            'session_id': session_id,
            'capability': context.current_capability,
            'conversation_turns': len(context.conversation_history),
            'has_patient_info': context.patient_info is not None,
            'has_file_context': context.file_context is not None,
            'last_activity': context.conversation_history[-1].timestamp if context.conversation_history else None
        }
    
    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken"""
        if not text:
            return 0
        
        if tokenizer:
            return len(tokenizer.encode(text))
        else:
            # Fallback: rough estimation (1 token ≈ 4 characters)
            return len(text) // 4
    
    def _build_optimized_conversation_context(self, relevant_context: List, 
                                            current_query: str, current_tokens: int) -> Optional[Dict]:
        """Build optimized conversation context within token limits"""
        if not relevant_context:
            return None
        
        relevant_turn = relevant_context[0]
        available_tokens = self.max_conversation_tokens - current_tokens
        
        if available_tokens <= 0:
            logger.warning("No tokens available for conversation context")
            return None
        
        # Build conversation context
        conversation_text = f"""
PREVIOUS CONVERSATION:
User: {relevant_turn.user_message}
Assistant: {relevant_turn.ai_response}
Capability: {relevant_turn.capability}

CURRENT QUERY (follow-up): {current_query}
"""
        
        conversation_tokens = self._count_tokens(conversation_text)
        
        # If too long, truncate the assistant response
        if conversation_tokens > available_tokens:
            # Truncate assistant response to fit
            max_assistant_tokens = available_tokens - self._count_tokens(f"""
PREVIOUS CONVERSATION:
User: {relevant_turn.user_message}
Assistant: 
Capability: {relevant_turn.capability}

CURRENT QUERY (follow-up): {current_query}
""")
            
            if max_assistant_tokens > 0:
                # Truncate assistant response
                assistant_tokens = self._count_tokens(relevant_turn.ai_response)
                if assistant_tokens > max_assistant_tokens:
                    # Simple truncation (could be improved with sentence boundaries)
                    truncated_response = relevant_turn.ai_response[:max_assistant_tokens * 4] + "..."
                    conversation_text = f"""
PREVIOUS CONVERSATION:
User: {relevant_turn.user_message}
Assistant: {truncated_response}
Capability: {relevant_turn.capability}

CURRENT QUERY (follow-up): {current_query}
"""
                    conversation_tokens = self._count_tokens(conversation_text)
                else:
                    return None
        
        return {
            'text': conversation_text,
            'tokens': conversation_tokens
        }
    
    def _build_optimized_file_context(self, file_context: Dict, file_findings: str,
                                    current_query: str, current_tokens: int) -> Optional[Dict]:
        """Build optimized file context within token limits"""
        available_tokens = self.max_file_tokens - current_tokens
        
        if available_tokens <= 0:
            logger.warning("No tokens available for file context")
            return None
        
        file_text = f"""
FILE CONTEXT:
File: {file_context.get('fileName', 'Unknown')}
Type: {file_context.get('fileType', 'Unknown')}
Previous Analysis: {file_findings}

CURRENT QUERY (file-related): {current_query}
"""
        
        file_tokens = self._count_tokens(file_text)
        
        # If too long, truncate the file findings
        if file_tokens > available_tokens:
            max_findings_tokens = available_tokens - self._count_tokens(f"""
FILE CONTEXT:
File: {file_context.get('fileName', 'Unknown')}
Type: {file_context.get('fileType', 'Unknown')}
Previous Analysis: 

CURRENT QUERY (file-related): {current_query}
""")
            
            if max_findings_tokens > 0:
                findings_tokens = self._count_tokens(file_findings)
                if findings_tokens > max_findings_tokens:
                    # Truncate findings
                    truncated_findings = file_findings[:max_findings_tokens * 4] + "..."
                    file_text = f"""
FILE CONTEXT:
File: {file_context.get('fileName', 'Unknown')}
Type: {file_context.get('fileType', 'Unknown')}
Previous Analysis: {truncated_findings}

CURRENT QUERY (file-related): {current_query}
"""
                    file_tokens = self._count_tokens(file_text)
                else:
                    return None
        
        return {
            'text': file_text,
            'tokens': file_tokens
        }
    
    def get_token_usage_summary(self, session_id: str) -> Dict[str, any]:
        """Get token usage summary for a session"""
        context = self.get_or_create_context(session_id)
        
        # Calculate token usage for different components
        patient_tokens = 0
        if context.patient_info:
            patient_context = self._build_patient_context(context.patient_info, context.current_capability)
            patient_tokens = self._count_tokens(f"PATIENT CONTEXT:\n{patient_context}")
        
        conversation_tokens = 0
        if context.conversation_history:
            for turn in context.conversation_history[-3:]:  # Last 3 turns
                conversation_tokens += self._count_tokens(turn.user_message + turn.ai_response)
        
        file_tokens = 0
        if context.file_context and context.last_file_findings:
            file_tokens = self._count_tokens(context.last_file_findings)
        
        total_tokens = patient_tokens + conversation_tokens + file_tokens
        
        return {
            'session_id': session_id,
            'patient_tokens': patient_tokens,
            'conversation_tokens': conversation_tokens,
            'file_tokens': file_tokens,
            'total_tokens': total_tokens,
            'max_tokens': self.max_tokens,
            'available_tokens': self.max_tokens - total_tokens,
            'usage_percentage': (total_tokens / self.max_tokens) * 100 if self.max_tokens > 0 else 0
        }

# Global context manager instance
context_manager = ContextManager() 