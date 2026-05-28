/**
 * Chat Interface Component
 * Simplified chat interface for the floating bot
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Menu, X, Stethoscope, FileText, Users, HelpCircle } from 'lucide-react';
import { Message } from '../../types';
import { getApiBaseUrl } from '../../utils/apiBase';

const ChatInterface: React.FC = () => {
  // Load messages from localStorage on mount
  const loadMessagesFromStorage = (): Message[] => {
    try {
      const stored = localStorage.getItem('general_practitioner_chat_messages');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp || new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Error loading messages from storage:', error);
    }
    return [];
  };

  // Save messages to localStorage
  const saveMessagesToStorage = (msgs: Message[]) => {
    try {
      localStorage.setItem('general_practitioner_chat_messages', JSON.stringify(msgs));
    } catch (error) {
      console.error('Error saving messages to storage:', error);
    }
  };

  const [messages, setMessages] = useState<Message[]>(loadMessagesFromStorage);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasMessages = messages.length > 0;

  // Save messages whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessagesToStorage(messages);
    }
  }, [messages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Close quick options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showQuickOptions) {
        const target = event.target as HTMLElement;
        if (!target.closest('.quick-options-container')) {
          setShowQuickOptions(false);
        }
      }
    };

    if (showQuickOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showQuickOptions]);

  const handleQuickAction = async (query: string) => {
    if (isLoading) return;
    const syntheticEvent = {
      preventDefault: () => {},
    } as React.FormEvent;
    await handleSubmitWithQuery(query, syntheticEvent);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    await handleSubmitWithQuery(input.trim(), e);
  };

  const handleSubmitWithQuery = async (queryToSubmit: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!queryToSubmit.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: queryToSubmit.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const API_BASE = getApiBaseUrl();
      const { authenticatedFetch, getAuthHeaders } = await import('../../services/authService');
      const response = await authenticatedFetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: queryToSubmit.trim(),
          capability: 'general',
          patientInfo: null,
          fileContext: null,
          fileFindings: null,
          previousAiMessage: null,
          resetMessage: null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from server');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      let assistantContent = '';
      let hasStartedReceiving = false;

      // Create assistant message placeholder
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Read stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            let content = line.slice(6);
            if (content === '[DONE]') continue;
            
            // Check for error
            if (content.startsWith('[ERROR]')) {
              throw new Error(content.slice(8));
            }

            // Skip empty content but don't trim (to preserve whitespace)
            if (!content) continue;

            // Process content (backend sends content directly, not JSON)
            // Replace escaped newlines with actual newlines
            let processedContent = content.replace(/\\n/g, '\n');
            // Replace escaped tabs with actual tabs
            processedContent = processedContent.replace(/\\t/g, '\t');
            // Replace double backslashes with single backslash
            processedContent = processedContent.replace(/\\\\/g, '\\');
            
            assistantContent += processedContent;
            hasStartedReceiving = true;
            
            // Update the message in real-time
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: assistantContent }
                  : msg
              )
            );
          }
        }
      }

      // Final update - if no content was received, show error
      if (!hasStartedReceiving || !assistantContent.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: 'I apologize, but I encountered an error processing your request.' }
              : msg
          )
        );
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
        {!hasMessages ? (
          /* Welcome Message - Centered */
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-6">
              <p className="text-gray-600 text-sm leading-relaxed">
                Hi there! 👋 I'm your General Health Assistant. I can help you with medical information, patient care guidance, treatment protocols, diagnostic insights, and general healthcare questions. How can I assist you today?
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-3 transition-all duration-200 ${
              message.role === 'user' 
                ? 'bg-blue-600 text-white hover:shadow-lg hover:scale-[1.02]' 
                : 'bg-gray-100 text-gray-900 hover:shadow-md hover:scale-[1.01]'
            }`}>
              <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">{message.content}</div>
            </div>
          </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Options Toggle Button and Menu - Fixed at bottom of messages area */}
      <div className="quick-options-container absolute bottom-20 right-4 z-20">
        {/* Expandable Quick Options Menu */}
        <div
          className={`absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden transition-all duration-300 ease-in-out z-10 ${
            showQuickOptions
              ? 'opacity-100 translate-y-0 max-h-96'
              : 'opacity-0 translate-y-2 max-h-0 pointer-events-none'
          }`}
          style={{ width: '200px' }}
        >
          <div className="p-2 space-y-1">
            <button
              type="button"
              onClick={() => {
                handleQuickAction("What are the latest treatment protocols for common conditions?");
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className="w-full flex items-center justify-end gap-2 px-3 py-2 pr-4 text-xs bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 hover:shadow-md hover:scale-105 transition-all duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-right"
            >
              <span>Treatment Protocols</span>
              <Stethoscope size={14} className="text-blue-500 flex-shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => {
                handleQuickAction("Help me understand diagnostic criteria for common conditions");
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className="w-full flex items-center justify-end gap-2 px-3 py-2 pr-4 text-xs bg-white border border-gray-300 rounded-lg hover:bg-green-50 hover:border-green-400 hover:shadow-md hover:scale-105 transition-all duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-right"
            >
              <span>Diagnostic Help</span>
              <FileText size={14} className="text-green-500 flex-shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => {
                handleQuickAction("What are the best practices for patient care management?");
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className="w-full flex items-center justify-end gap-2 px-3 py-2 pr-4 text-xs bg-white border border-gray-300 rounded-lg hover:bg-purple-50 hover:border-purple-400 hover:shadow-md hover:scale-105 transition-all duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-right"
            >
              <span>Care Management</span>
              <Users size={14} className="text-purple-500 flex-shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => {
                handleQuickAction("I need help with a medical question");
                setShowQuickOptions(false);
              }}
              disabled={isLoading}
              className="w-full flex items-center justify-end gap-2 px-3 py-2 pr-4 text-xs bg-white border border-gray-300 rounded-lg hover:bg-orange-50 hover:border-orange-400 hover:shadow-md hover:scale-105 transition-all duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-right"
            >
              <span>General Help</span>
              <HelpCircle size={14} className="text-orange-500 flex-shrink-0" />
            </button>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={() => setShowQuickOptions(!showQuickOptions)}
          disabled={isLoading}
          className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-2xl hover:shadow-2xl hover:scale-110 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 z-10"
          title="Quick actions"
          style={{
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)'
          }}
        >
          {showQuickOptions ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize textarea
              if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-all duration-200 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            style={{ minHeight: '36px', maxHeight: '120px', overflowY: 'auto' }}
            rows={1}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:scale-110 text-white px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none flex items-center justify-center transition-all duration-200 ml-1"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;
