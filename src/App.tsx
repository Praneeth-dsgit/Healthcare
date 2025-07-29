import { type FC, useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, Bot, FileDown, UserCircle, Trash2, AlertCircle, Upload, FileText, Image as ImageIcon, Loader2, X, Settings, Heart, Activity, Square, Stethoscope} from 'lucide-react';
import ChatMessage from './components/ChatMessage';
import LoadingDots from './components/LoadingDots';
import DisclaimerModal from './components/DisclaimerModal';
import CapabilitySelector, { type Capability } from './components/CapabilitySelector';
import PatientInfoForm from './components/PatientInfoForm';
import PatientEngagement from './components/PatientEngagement';
import { Message, PatientInfo } from './types';
import {
  getInitialMessages,
  saveMessages,
  clearMessages,
  saveSessions,
  getSessions,
  setCurrentSessionId,
  getCurrentSessionId,
  removeSession,
  clearUserData
} from './utils/storage';
import { exportChatHistory } from './utils/export';
import Header from './components/Header';
import AuthHeader from './components/AuthHeader';
import { v4 as uuidv4 } from 'uuid';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Signup from './components/Signup';
import OtpVerification from './components/OtpVerification';
import Login from './components/Login';

function shouldResetContext(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  const resetPhrases = [
    "okay", "ok", "leave it", "thanks", "thank you", "new topic", "start over", "ignore", "cancel"
  ];
  return (
    trimmed.length < 5 ||
    resetPhrases.includes(trimmed)
  );
}

const AuthLayout: FC<{ children: React.ReactNode; navigate: any }> = ({ children, navigate }) => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <AuthHeader onNavigateToHome={() => navigate('/')} />
    <div className="flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg border border-gray-100 animate-fade-in">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800">Welcome to MedChat</h1>
          <p className="text-gray-500 text-sm">Your secure healthcare assistant</p>
        </div>
        {children}
      </div>
    </div>
  </div>
);

const App: FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true); // Initial state, will be managed by session loading logic
  const [showCapabilitySelector, setShowCapabilitySelector] = useState(false);
  const [selectedCapability, setSelectedCapability] = useState<Capability | null>(null);
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    age: 0,
    weight: 0,
    gender: 'other',
    height: 0,
    bloodPressure: '',
    allergies: '',
    medications: '',
    medicalHistory: ''
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showFileTypeModal, setShowFileTypeModal] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<'pdf' | 'image' | null>(null);
  const [pendingFileType, setPendingFileType] = useState<'pdf' | 'image' | null>(null);
  const [analyzeTimer, setAnalyzeTimer] = useState(0);
  const analyzeTimerRef = useRef<number | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragActive, setIsDragActive] = useState(false);
  const [lastUploadedFile, setLastUploadedFile] = useState<{
    fileName: string;
    fileType: string;
    fileUrl: string;
  } | null>(null);
  const [lastFileFindings, setLastFileFindings] = useState<string | null>(null);
  const [lastAiMessage, setLastAiMessage] = useState<string | null>(null);
  // Add state for editing
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  // Add state for abort controller
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const [signupEmail, setSignupEmail] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const navigate = useNavigate();
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';

  // ProtectedRoute component
  const ProtectedRoute: FC<{ children: React.ReactNode }> = ({ children }) => {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
  };

  // Handle disclaimer close
  const handleDisclaimerClose = () => {
    setShowDisclaimer(false);
    setShowCapabilitySelector(true);
  };

  // Handle capability selection
  const handleCapabilitySelect = (capability: Capability) => {
    setSelectedCapability(capability);
    setShowCapabilitySelector(false);
    
    // Save capability for current session (user-specific)
    if (currentSessionId) {
      const userEmail = localStorage.getItem('userEmail') || 'anonymous';
      const storageKey = `${userEmail}_sessionCapabilities`;
      const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
      sessionCapabilities[currentSessionId] = capability;
      localStorage.setItem(storageKey, JSON.stringify(sessionCapabilities));
    }
  };

  // Load saved capability on mount and for current session
  useEffect(() => {
    if (currentSessionId && isAuthenticated) {
      const userEmail = localStorage.getItem('userEmail') || 'anonymous';
      const storageKey = `${userEmail}_sessionCapabilities`;
      const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const sessionCapability = sessionCapabilities[currentSessionId] as Capability;
      
      if (sessionCapability && ['general', 'radiology', 'lab'].includes(sessionCapability)) {
        setSelectedCapability(sessionCapability);
        setShowDisclaimer(false);
        setShowCapabilitySelector(false);
      } else {
        // For new sessions or new users, wait for disclaimer to be closed first
        // Don't show capability selector yet if disclaimer is still showing
        setSelectedCapability(null);
        if (!showDisclaimer) {
          setShowCapabilitySelector(true);
        }
      }
    }
  }, [currentSessionId, isAuthenticated, showDisclaimer]);

  // Get capability display info
  const getCapabilityInfo = (capability: Capability | null) => {
    switch (capability) {
      case 'general':
        return { name: 'General Medical Assistant', color: 'text-blue-600', bgColor: 'bg-blue-50' };
      case 'radiology':
        return { name: 'Radiology Assistant', color: 'text-purple-600', bgColor: 'bg-purple-50' };
      case 'lab':
        return { name: 'Lab Interpretation Assistant', color: 'text-green-600', bgColor: 'bg-green-50' };
      case 'engagement':
        return { name: 'Patient Engagement Dashboard', color: 'text-orange-600', bgColor: 'bg-orange-50' };
      default:
        return { name: 'AI Assistant', color: 'text-gray-600', bgColor: 'bg-gray-50' };
    }
  };

  // Get capability-specific placeholder text
  const getPlaceholderText = (capability: Capability | null) => {
    switch (capability) {
      case 'general':
        return "Ask about symptoms, treatments, medications, or general health concerns...";
      case 'radiology':
        return "Ask about X-rays, CT scans, MRI, ultrasound, or medical imaging interpretation...";
      case 'lab':
        return "Ask about blood tests, lab results, CBC, chemistry panels, or laboratory values...";
      default:
        return "Please select an assistant capability first...";
    }
  };

  // Timer for analyzing
  useEffect(() => {
    if (analyzing) {
      setAnalyzeTimer(0);
      analyzeTimerRef.current = setInterval(() => {
        setAnalyzeTimer((t) => t + 1);
      }, 1000);
    } else if (analyzeTimerRef.current) {
      clearInterval(analyzeTimerRef.current);
    }
    return () => {
      if (analyzeTimerRef.current) clearInterval(analyzeTimerRef.current);
    };
  }, [analyzing]);

  // Handle file type selection
  const handleFileTypeSelect = (type: 'pdf' | 'image') => {
    setPendingFileType(type);
  };
  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Load sessions and current session on mount or when user changes
  useEffect(() => {
    // Only load sessions if user is authenticated
    if (!isAuthenticated) return;
    
    const loadedSessions = getSessions();
    const userEmail = localStorage.getItem('userEmail') || 'anonymous';
    const storageKey = `${userEmail}_sessionCapabilities`;
    const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    // Always create a new session on page refresh/reload
    const newId = uuidv4();
    const sessionNumber = loadedSessions.length + 1;
    const newSession = { id: newId, name: `Session ${sessionNumber}`, messages: [] };
    
    // Add the new session to existing sessions
    const updatedSessions = [...loadedSessions, newSession];
    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    setCurrentSessionId(newId);
    setCurrentSessionIdState(newId);
    setMessages([]);
    
    // Handle modal display logic
    if (!loadedSessions.length) {
      // For completely new users, show disclaimer first
      setShowDisclaimer(true);
      setShowCapabilitySelector(false);
    } else {
      // For returning users, check if they have any saved capabilities
      const hasAnyCapabilities = Object.keys(sessionCapabilities).length > 0;
      if (hasAnyCapabilities) {
        // Returning user with saved capabilities - skip disclaimer
        setShowDisclaimer(false);
        setShowCapabilitySelector(true); // Show capability selector for new session
      } else {
        // Returning user but no capabilities saved - show disclaimer
        setShowDisclaimer(true);
        setShowCapabilitySelector(false);
      }
    }
  }, [isAuthenticated]); // Re-run when authentication status changes

  // Save messages to the current session
  useEffect(() => {
    if (!currentSessionId) return;
    const updatedSessions = sessions.map(s =>
      s.id === currentSessionId ? { ...s, messages } : s
    );
    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    saveMessages(messages); // legacy, can be removed later
  }, [messages]);

  // Handle session switch
  const handleSessionSwitch = (sessionId: string) => {
    setCurrentSessionIdState(sessionId);
    setCurrentSessionId(sessionId);
    const found = sessions.find(s => s.id === sessionId);
    setMessages(found ? found.messages : []);
    
    // Load capability for this session (user-specific)
    const userEmail = localStorage.getItem('userEmail') || 'anonymous';
    const storageKey = `${userEmail}_sessionCapabilities`;
    const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const sessionCapability = sessionCapabilities[sessionId] as Capability;
    
    if (sessionCapability) {
      setSelectedCapability(sessionCapability);
      setShowCapabilitySelector(false);
    } else {
      // If no capability set for this session, show selector (no disclaimer for session switches)
      setSelectedCapability(null);
      setShowDisclaimer(false);
      setShowCapabilitySelector(true);
    }
  };

  // Create new session
  const handleNewSession = () => {
    const newId = uuidv4();
    const newSession = {
      id: newId,
      name: `Session ${sessions.length + 1}`,
      messages: []
    };
    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    setCurrentSessionIdState(newId);
    setCurrentSessionId(newId);
    setMessages([]);
    // Show capability selector for new session (no disclaimer needed for existing users)
    setShowDisclaimer(false);
    setShowCapabilitySelector(true);
    setSelectedCapability(null);
  };

  // Handle session delete
  const handleDeleteSession = (sessionId: string) => {
    if (sessions.length === 1) return; // Prevent deleting the last session
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    removeSession(sessionId);
    
    // Clean up capability data for deleted session (user-specific)
    const userEmail = localStorage.getItem('userEmail') || 'anonymous';
    const storageKey = `${userEmail}_sessionCapabilities`;
    const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
    delete sessionCapabilities[sessionId];
    localStorage.setItem(storageKey, JSON.stringify(sessionCapabilities));
    
    // If the deleted session was current, switch to another
    if (currentSessionId === sessionId) {
      const nextSession = updatedSessions[0];
      setCurrentSessionIdState(nextSession.id);
      setCurrentSessionId(nextSession.id);
      setMessages(nextSession.messages);
      
      // Load capability for the next session
      const nextSessionCapability = sessionCapabilities[nextSession.id] as Capability;
      if (nextSessionCapability) {
        setSelectedCapability(nextSessionCapability);
        setShowCapabilitySelector(false);
      } else {
        setSelectedCapability(null);
        setShowDisclaimer(false);
        setShowCapabilitySelector(true);
      }
    }
  };

  const handlePatientSubmit = async (info: PatientInfo) => {
    // Create a detailed message with patient information
    const patientDetails = [
      `Age: ${info.age} years`,
      `Gender: ${info.gender}`,
      `Weight: ${info.weight} kg`,
      `Height: ${info.height} cm`,
      info.bloodPressure ? `Blood Pressure: ${info.bloodPressure}` : null,
      info.allergies ? `Allergies: ${info.allergies}` : null,
      info.medications ? `Current Medications: ${info.medications}` : null,
      info.medicalHistory ? `Medical History: ${info.medicalHistory}` : null,
    ].filter(Boolean).join(', ');

    const messageContent = `Please provide a comprehensive treatment plan and health recommendations for this patient: ${patientDetails}. Include preventive care, lifestyle recommendations, and any necessary follow-up actions.`;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      patientInfo: info,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const resetContext = shouldResetContext(userMessage.content);
      const isFollowUp = !resetContext;
      const resetMessage = resetContext ? userMessage.content.trim().toLowerCase() : null;
      const response = await fetch('http://localhost:5000/api/chat/stream', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage.content,
          patientInfo: info,
          fileContext: resetContext ? null : lastUploadedFile,
          fileFindings: resetContext ? null : lastFileFindings,
          previousAiMessage: isFollowUp ? lastAiMessage : null,
          resetMessage,
          capability: selectedCapability || 'general',
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      let hasStartedReceiving = false;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const content = line.slice(6);
            const processedContent = content.replace(/\\n/g, '\n');
            assistantContent += processedContent;
            
            // Add the message to the chat only when we start receiving content
            if (!hasStartedReceiving) {
              hasStartedReceiving = true;
              const assistantMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: processedContent,
                timestamp: new Date().toISOString(),
              };
              setMessages(prev => [...prev, assistantMessage]);
            } else {
              // Update the last message with new content
              setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: assistantContent
                  };
                }
                return newMessages;
              });
            }
          }
        }
      }
      setLastAiMessage(assistantContent);
    } catch (error) {
      // Check if the error is due to user cancellation
      const isUserCancellation = error instanceof Error && error.name === 'AbortError';
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: isUserCancellation 
          ? "Treatment plan generation was stopped by user."
          : 'An error occurred while generating the treatment plan.',
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
      setLastAiMessage(null);
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  };

  useEffect(() => {
    clearMessages();
  }, []);

  // Debounced scroll function for smoother performance
  const debouncedScroll = useCallback(() => {
    let timeoutId: number;
    return () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ 
            behavior: 'smooth',
            block: 'end',
            inline: 'nearest'
          });
        }
      }, 50); // Small delay to batch rapid updates
    };
  }, []);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    const scrollToBottom = debouncedScroll();
    requestAnimationFrame(scrollToBottom);
  }, [messages, debouncedScroll]);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (editingMessageId) {
      // Find the index of the user message
      const userMsgIdx = messages.findIndex(msg => msg.id === editingMessageId);
      if (userMsgIdx !== -1) {
        // Remove the old assistant response if it immediately follows the user message
        let newMessages = [...messages];
        newMessages[userMsgIdx] = { ...newMessages[userMsgIdx], content: input.trim(), timestamp: new Date().toISOString() };
        if (
          newMessages[userMsgIdx + 1] &&
          newMessages[userMsgIdx + 1].role === 'assistant'
        ) {
          newMessages.splice(userMsgIdx + 1, 1);
        }
        setMessages(newMessages);
        setEditingMessageId(null);
        setInput('');
        // Re-send the edited message to the backend for a new AI response
        const editedUserMessage = newMessages[userMsgIdx];
        setIsLoading(true);
        try {
          const resetContext = shouldResetContext(editedUserMessage.content);
          const isFollowUp = !resetContext;
          const resetMessage = resetContext ? editedUserMessage.content.trim().toLowerCase() : null;
          const response = await fetch('http://localhost:5000/api/chat/stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: editedUserMessage.content,
              patientInfo: editedUserMessage.patientInfo,
              fileContext: resetContext ? null : lastUploadedFile,
              fileFindings: resetContext ? null : lastFileFindings,
              previousAiMessage: isFollowUp ? lastAiMessage : null,
              resetMessage,
              capability: selectedCapability || 'general',
            }),
          });
          if (!response.ok) throw new Error('Failed to get response from server');
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No reader available');
          let assistantContent = '';
          let hasStartedReceiving = false;
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const content = line.slice(6);
                if (content.startsWith('[ERROR]')) {
                  throw new Error(content.slice(8));
                }
                const processedContent = content.replace(/\\n/g, '\n');
                assistantContent += processedContent;
                
                // Add the message to the chat only when we start receiving content
                if (!hasStartedReceiving) {
                  hasStartedReceiving = true;
                  const assistantMessage: Message = {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: processedContent,
                    timestamp: new Date().toISOString(),
                  };
                  setMessages(prev => [...prev, assistantMessage]);
                } else {
                  // Update the last message with new content
                  setMessages(prev => {
                    const newMessages = [...prev];
                    if (newMessages.length > 0) {
                      newMessages[newMessages.length - 1] = {
                        ...newMessages[newMessages.length - 1],
                        content: assistantContent
                      };
                    }
                    return newMessages;
                  });
                }
              }
            }
          }
          setLastAiMessage(assistantContent);
        } catch (error) {
          // Check if the error is due to user cancellation
          const isUserCancellation = error instanceof Error && error.name === 'AbortError';
          
          const errorMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: isUserCancellation 
              ? "User Interrupt"
              : "I'm sorry, I encountered an error processing your request. Please try again later.",
            timestamp: new Date().toISOString(),
            isError: true,
          };
          setMessages(prev => [...prev, errorMessage]);
          setLastAiMessage(null);
        } finally {
          setIsLoading(false);
          setAbortController(null);
        }
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
      patientInfo: patientInfo
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const resetContext = shouldResetContext(userMessage.content);
      const isFollowUp = !resetContext;
      const resetMessage = resetContext ? userMessage.content.trim().toLowerCase() : null;
      const response = await fetch('http://localhost:5000/api/chat/stream', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          patientInfo: patientInfo,
          fileContext: resetContext ? null : lastUploadedFile,
          fileFindings: resetContext ? null : lastFileFindings,
          previousAiMessage: isFollowUp ? lastAiMessage : null,
          resetMessage,
          capability: selectedCapability || 'general',
        }),
      });

      if (!response.ok) throw new Error('Failed to get response from server');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      let hasStartedReceiving = false;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const content = line.slice(6);
            if (content.startsWith('[ERROR]')) {
              throw new Error(content.slice(8));
            }

            const processedContent = content.replace(/\\n/g, '\n');
            assistantContent += processedContent;
            
            // Add the message to the chat only when we start receiving content
            if (!hasStartedReceiving) {
              hasStartedReceiving = true;
              const assistantMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: processedContent,
                timestamp: new Date().toISOString(),
              };
              setMessages(prev => [...prev, assistantMessage]);
            } else {
              // Update the last message with new content
              setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: assistantContent
                  };
                }
                return newMessages;
              });
            }
          }
        }
      }
      setLastAiMessage(assistantContent);

    } catch (error) {
      console.error('Error:', error);
      
      // Check if the error is due to user cancellation
      const isUserCancellation = error instanceof Error && error.name === 'AbortError';
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: isUserCancellation 
          ? "User Interrupt"
          : "I'm sorry, I encountered an error processing your request. Please try again later.",
        timestamp: new Date().toISOString(),
        isError: true,
      };

      setMessages(prev => [...prev, errorMessage]);
      setLastAiMessage(null);
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    if (inputRef.current) inputRef.current.focus();
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      setMessages([]);
    }
  };

  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsLoading(false);
    }
    // Also stop analyzing state
    setAnalyzing(false);
  };

  // Helper to generate PDF thumbnail
  const generatePdfThumbnail = async (file: File): Promise<string | null> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  };

  // Handle file upload with progress (updated to close modal after file selection)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setShowFileTypeModal(false);
    setSelectedFileType(pendingFileType);
    setPendingFileType(null);
    for (const file of files) {
      setUploading(true);
      setUploadProgress(0);
      setAnalyzing(false);
      // Create preview URL or PDF thumbnail
      let fileUrl = '';
      let pdfThumbnail: string | undefined = undefined;
      if (file.type.startsWith('image/')) {
        fileUrl = URL.createObjectURL(file);
      } else if (file.type === 'application/pdf') {
        fileUrl = URL.createObjectURL(file);
        const thumb = await generatePdfThumbnail(file);
        pdfThumbnail = thumb || undefined;
      }
      // Show a message in chat for the uploaded file with preview
      const fileMessage: Message & { fileUrl?: string; fileType?: string; fileName?: string; pdfThumbnail?: string } = {
        id: Date.now().toString(),
        role: 'user',
        content: '',
        timestamp: new Date().toISOString(),
        patientInfo: patientInfo,
        fileUrl: fileUrl,
        fileType: file.type,
        fileName: file.name,
        pdfThumbnail: pdfThumbnail
      };
      setMessages(prev => [...prev, fileMessage]);
      setLastUploadedFile({
        fileName: file.name,
        fileType: file.type,
        fileUrl: fileUrl,
      });
      // Upload to backend with progress
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', currentSessionId || '');
      formData.append('capability', selectedCapability || 'general');
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', 'http://localhost:5000/api/upload');
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
          };
          xhr.onload = () => {
            setUploading(false);
            setUploadProgress(100);
            setAnalyzing(true);
            setTimeout(() => setUploadProgress(0), 500);
            try {
              const data = JSON.parse(xhr.responseText);
              setMessages(prev => [...prev, {
                id: Date.now().toString() + '-ai',
                role: 'assistant',
                content: data.result || 'No interpretation available.',
                timestamp: new Date().toISOString(),
              }]);
              setLastFileFindings(data.result || null); // <-- store findings
              setLastAiMessage(data.result || null);
            } catch (err) {
              setMessages(prev => [...prev, {
                id: Date.now().toString() + '-err',
                role: 'assistant',
                content: 'Error uploading or interpreting the file.',
                timestamp: new Date().toISOString(),
                isError: true,
              }]);
              setLastFileFindings(null);
              setLastAiMessage(null);
            }
            setAnalyzing(false);
            resolve();
          };
          xhr.onerror = () => {
            setUploading(false);
            setAnalyzing(false);
            setMessages(prev => [...prev, {
              id: Date.now().toString() + '-err',
              role: 'assistant',
              content: 'Error uploading or interpreting the file.',
              timestamp: new Date().toISOString(),
              isError: true,
            }]);
            reject();
          };
          xhr.send(formData);
        });
      } catch (error) {
        setUploading(false);
        setAnalyzing(false);
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '-err',
          role: 'assistant',
          content: 'Error uploading or interpreting the file.',
          timestamp: new Date().toISOString(),
          isError: true,
        }]);
        setLastAiMessage(null);
      }
    }
  };

  // Handler for preview click from ChatMessage
  const handlePreviewClick = (fileUrl: string, fileType: string, fileName: string) => {
    setPreviewFile({ url: fileUrl, type: fileType, name: fileName });
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }); };

  // Pan controls
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !panStart) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const handleMouseUp = () => setIsPanning(false);

  // Mouse wheel zoom for image preview
  const handleWheel = (e: React.WheelEvent) => {
    if (!previewFile || !previewFile.type.startsWith('image/')) return;
    e.preventDefault();
    setZoom((z) => {
      let next = z + (e.deltaY < 0 ? 0.1 : -0.1);
      return Math.max(0.5, Math.min(4, Math.round(next * 100) / 100));
    });
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedCapability) {
      setIsDragActive(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (!selectedCapability) {
      return; // Don't allow drop if no capability selected
    }
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      
      // Capability-specific file type validation
      if (selectedCapability === 'general' && file.type === 'application/pdf') {
        setPendingFileType('pdf');
      } else if (selectedCapability === 'lab' && file.type === 'application/pdf') {
        setPendingFileType('pdf');
      } else if (selectedCapability === 'radiology' && file.type.startsWith('image/')) {
        setPendingFileType('image');
      } else {
        // Show error for wrong file type for capability
        alert(`Please upload ${
          selectedCapability === 'general' ? 'PDF documents (prescriptions)' :
          selectedCapability === 'lab' ? 'PDF lab reports' :
          selectedCapability === 'radiology' ? 'medical images (JPG/PNG)' :
          'appropriate files'
        } for ${selectedCapability} mode.`);
        return;
      }
      
      setShowFileTypeModal(false); // Hide modal if open
      // Simulate file input selection
      setTimeout(() => {
        const dt = new DataTransfer();
        dt.items.add(file);
        const input = document.createElement('input');
        input.type = 'file';
        input.files = dt.files;
        handleFileUpload({ target: { files: dt.files } } as any);
      }, 100);
    }
  };

  // Replace session name with topic (first user message or fallback)
  function getSessionTopic(session: any): string {
    if (session.messages && session.messages.length > 0) {
      const firstUserMsg = session.messages.find((m: any) => m.role === 'user');
      if (firstUserMsg && firstUserMsg.content) {
        return firstUserMsg.content.length > 30
          ? firstUserMsg.content.slice(0, 30) + '...'
          : firstUserMsg.content;
      }
    }
    return 'New Chat';
  }

  // Get session capability
  function getSessionCapability(sessionId: string): string {
    const userEmail = localStorage.getItem('userEmail') || 'anonymous';
    const storageKey = `${userEmail}_sessionCapabilities`;
    const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const capability = sessionCapabilities[sessionId];
    switch (capability) {
      case 'general': return '🩺 General';
      case 'radiology': return '🧠 Radiology';
      case 'lab': return '📊 Lab';
      default: return '👥 Patient Engagement';  
    }
  }

  return (
    <Routes>
      <Route path="/signup" element={
        <AuthLayout navigate={navigate}>
          <Signup 
            onSignupSuccess={email => { setSignupEmail(email); navigate('/verify-otp'); }}
            onNavigateToLogin={() => navigate('/login')}
          />
        </AuthLayout>
      } />
      <Route path="/verify-otp" element={
        <AuthLayout navigate={navigate}>
          <OtpVerification email={signupEmail} onVerified={() => { setOtpVerified(true); navigate('/login'); }} />
        </AuthLayout>
      } />
      <Route path="/login" element={
        <AuthLayout navigate={navigate}>
          <Login 
            onLoginSuccess={() => navigate('/')}
            onNavigateToSignup={() => navigate('/signup')}
          />
        </AuthLayout>
      } />
      <Route path="/*" element={
        <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
          <Header
            sessions={sessions}
            currentSessionId={currentSessionId}
            showDropdown={showDropdown}
            setShowDropdown={setShowDropdown}
            dropdownRef={dropdownRef}
            getSessionTopic={getSessionTopic}
            getSessionCapability={getSessionCapability}
            handleSessionSwitch={handleSessionSwitch}
            handleDeleteSession={handleDeleteSession}
            handleNewSession={handleNewSession}
            capabilityInfo={getCapabilityInfo(selectedCapability)}
            isAuthenticated={isAuthenticated}
            onNavigateToLogin={() => navigate('/login')}
            onNavigateToSignup={() => navigate('/signup')}
            onLogout={() => {
              // Clear all user-specific data
              clearUserData();
              localStorage.removeItem('isAuthenticated');
              localStorage.removeItem('userEmail');
              
              // Reset application state
              setSessions([]);
              setMessages([]);
              setCurrentSessionIdState(null);
              setSelectedCapability(null);
              setShowCapabilitySelector(false);
              setShowDisclaimer(true);
              
              navigate('/login');
            }}
            selectedCapability={selectedCapability}
            onSelectPrompt={handleQuickPrompt}
          />
          {showDisclaimer && (
            <DisclaimerModal onClose={handleDisclaimerClose} />
          )}
          
          {showCapabilitySelector && (
            <CapabilitySelector onSelectCapability={handleCapabilitySelect} />
          )}
          <main className="flex-1 flex px-4 py-4 overflow-hidden max-w-7xl w-full mx-auto">
            <div className="flex gap-2 flex-1 min-h-0">
              {/* Left Column - Patient Info (Only for non-engagement capabilities) */}
              {selectedCapability !== 'engagement' && (
                <div className="w-65 flex-shrink-0 overflow-y-auto hide-scrollbar">
                  <div className="h-full flex flex-col">
                    <h2 className="text-lg font-medium text-blue-900 mb-2">Patient Information</h2>
                    <div className="flex-1">
                      <PatientInfoForm
                        patientInfo={patientInfo}
                        onPatientInfoChange={setPatientInfo}
                        onSubmitPatientInfo={handlePatientSubmit}
                        isLoading={isLoading}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Right Column - Chat or Patient Engagement */}
              <div className={`flex flex-col overflow-hidden ${selectedCapability === 'engagement' ? 'flex-1' : 'flex-1'}`}>
                {selectedCapability === 'engagement' ? (
                  <PatientEngagement />
                ) : (
                  <div className="bg-white rounded-lg shadow-md flex flex-col h-full relative performance-optimized">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar chat-container smooth-scroll">
                      {messages.length === 0 && !showFileTypeModal ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center shadow-lg animate-professional-pulse">
                            <Heart size={30} className="text-white animate-heartbeat" />
                          </div>
                          <div>
                            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-3 ${getCapabilityInfo(selectedCapability).bgColor} ${getCapabilityInfo(selectedCapability).color}`}>
                              {getCapabilityInfo(selectedCapability).name}
                            </div>
                            <p className="text-lg font-medium">Welcome to Your AI Medical Assistant</p>
                            <p className="max-w-md mx-auto mt-2">
                              {selectedCapability === 'radiology' 
                                ? 'Upload medical images or ask about radiological findings, imaging techniques, and interpretation.'
                                : selectedCapability === 'lab'
                                ? 'Upload lab reports or ask about laboratory results, test interpretations, and clinical correlation.'
                                : 'Ask me questions about health conditions, symptoms, treatments, or general health advice.'
                              }
                            </p>
                            <div className="mt-4 flex items-center justify-center">
                              <button
                                onClick={() => setShowCapabilitySelector(true)}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-gray-800 hover:bg-blue-400 rounded-lg transition-all duration-300 shadow-md shadow-blue-400 shine-effect relative overflow-hidden hover:shadow-lg hover:shadow-blue-500/50"
                              >
                                <Settings size={16}/>
                                Change Assistant Mode
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 text-amber-600 animate-pulse">
                            <AlertCircle size={16} />
                            <span className="text-sm">For healthcare professionals only.</span>
                          </div>
                        </div>
                      ) : (
                        messages.map((message) => (
                          <ChatMessage key={message.id} message={message} onPreviewClick={handlePreviewClick} onEdit={id => {
                            setEditingMessageId(id);
                            const msg = messages.find(m => m.id === id);
                            if (msg) setInput(msg.content);
                            if (inputRef.current) inputRef.current.focus();
                          }} />
                        ))
                      )}
                      {(isLoading || analyzing) && (
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full p-3 shadow-lg">
                            <Stethoscope size={24} className="text-white" />
                          </div>
                          <div className="p-4 bg-white rounded-lg rounded-tl-none max-w-[85%] border border-gray-100 shadow-md">
                            <LoadingDots />
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>


                  {/* Fixed Input - Only show for non-engagement capabilities */}
                  {(selectedCapability as Capability) !== 'engagement' && (
                    <div className="sticky bottom-0 bg-white p-1 border-t border-gray-200"
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      {/* Drag & Drop Overlay */}
                      {isDragActive && selectedCapability && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 bg-opacity-90 rounded-lg border-2 border-blue-500 border-dashed pointer-events-none shadow-lg">
                          <div className="text-blue-700 text-lg font-semibold flex flex-col items-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center shadow-lg mb-4 animate-professional-pulse">
                              <Upload size={32} className="text-white" />
                            </div>
                            <p className="text-center">
                              {selectedCapability === 'general' && "Drop your prescription/document (PDF) here"}
                              {selectedCapability === 'lab' && "Drop your lab report (PDF) here"}
                              {selectedCapability === 'radiology' && "Drop your medical image here"}
                            </p>
                          </div>
                        </div>
                      )}
                      {/* File Type Selection Modal */}
                      {showFileTypeModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
                          <div className="bg-white rounded-lg shadow-lg p-6 w-80 flex flex-col items-center">
                            <h3 className="text-lg font-semibold mb-4">Select file type to upload</h3>
                            {!pendingFileType && <>
                              {/* General Medical - Show prescription upload */}
                              {selectedCapability === 'general' && (
                                <button
                                  className="w-full flex items-center gap-2 px-4 py-2 mb-3 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium"
                                  onClick={() => handleFileTypeSelect('pdf')}
                                >
                                  <FileText size={20} /> Prescription/Document (PDF)
                                </button>
                              )}
                              
                              {/* Lab Mode - Show lab report upload */}
                              {selectedCapability === 'lab' && (
                                <button
                                  className="w-full flex items-center gap-2 px-4 py-2 mb-3 rounded bg-green-100 hover:bg-green-200 text-green-700 font-medium"
                                  onClick={() => handleFileTypeSelect('pdf')}
                                >
                                  <FileText size={20} /> Lab Report (PDF)
                                </button>
                              )}
                              
                              {/* Radiology Mode - Show image upload */}
                              {selectedCapability === 'radiology' && (
                                <button
                                  className="w-full flex items-center gap-2 px-4 py-2 mb-3 rounded bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium"
                                  onClick={() => handleFileTypeSelect('image')}
                                >
                                  <ImageIcon size={20} /> Medical Image (JPG/PNG/DICOM)
                                </button>
                              )}
                              
                              {/* If no capability selected or unrecognized capability */}
                              {!selectedCapability && (
                                <div className="text-center text-gray-500 mb-4">
                                  <p className="text-sm">Please select an assistant capability first</p>
                                </div>
                              )}
                              
                              <button
                                className="mt-4 text-sm text-gray-500 hover:underline"
                                onClick={() => setShowFileTypeModal(false)}
                              >Cancel</button>
                            </>}
                            {pendingFileType && (
                              <>
                                <input
                                  id="file-upload-input"
                                  type="file"
                                  accept={pendingFileType === 'pdf' ? '.pdf' : 'image/*'}
                                  className="block w-full text-sm text-gray-700 mb-4"
                                  onChange={handleFileUpload}
                                  disabled={isLoading || uploading || analyzing}
                                  autoFocus
                                  multiple
                                />
                                <button
                                  className="mt-2 text-sm text-gray-500 hover:underline"
                                  onClick={() => setPendingFileType(null)}
                                >Back</button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      <form onSubmit={handleSubmit} className="relative flex items-center">
                        {/* Upload Button */}
                        <label 
                          className="flex items-center cursor-pointer mr-2" 
                          title={
                            selectedCapability === 'general' ? "Upload Prescription/Document" :
                            selectedCapability === 'radiology' ? "Upload Medical Image" :
                            selectedCapability === 'lab' ? "Upload Lab Report" :
                            "Select capability first"
                          } 
                          onClick={e => { 
                            e.preventDefault(); 
                            if (selectedCapability) {
                              setShowFileTypeModal(true); 
                            }
                          }}
                        >
                          <span className={`p-2 rounded-full ${
                            uploading ? 'bg-gray-300' : 
                            !selectedCapability ? 'bg-gray-200 cursor-not-allowed' :
                            'bg-primary-100 hover:bg-primary-200'
                          } transition-colors`}>
                            <Upload size={20} className={`${!selectedCapability ? 'text-gray-400' : 'text-primary-600'}`} />
                          </span>
                        </label>
                        

                        {/* Upload Progress Bar */}
                        {uploading && (
                          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                            <div className="h-full bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        )}

                        <textarea
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder={getPlaceholderText(selectedCapability)}
                          className="w-full p-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none hide-scrollbar"
                          rows={1}
                          disabled={uploading || analyzing || !selectedCapability}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmit(e);
                            }
                          }}
                        />
                        {(isLoading || analyzing) ? (
                          <button
                            type="button"
                            onClick={handleStopGeneration}
                            className="absolute right-3 bottom-3 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                            title="Stop generation"
                          >
                            <Square size={20} />
                          </button>
                        ) : (
                          <button
                            type="submit"
                            disabled={!input.trim() || uploading || analyzing}
                            className="absolute right-3 bottom-3 p-1.5 rounded-full bg-primary-500 text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors hover:bg-primary-600"
                          >
                            <ArrowUp size={20} />
                          </button>
                        )}
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          </main>

          {/* File Preview Modal */}
          {previewFile && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
              <div className="relative bg-white rounded-lg shadow-lg p-4 max-w-2xl w-full flex flex-col items-center">
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-gray-200 hover:bg-gray-300"
                  onClick={() => setPreviewFile(null)}
                  title="Close"
                >
                  <X size={22} />
                </button>
                {previewFile.type.startsWith('image/') && (
                  <div className="flex items-center mb-2 gap-2">
                    <button onClick={handleZoomOut} className="p-1 rounded bg-gray-200 hover:bg-gray-300" title="Zoom out">-</button>
                    <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-1 rounded bg-gray-200 hover:bg-gray-300" title="Zoom in">+</button>
                    <button onClick={handleResetZoom} className="p-1 rounded bg-gray-200 hover:bg-gray-300" title="Reset zoom">Reset</button>
                  </div>
                )}
                {previewFile.type.startsWith('image/') ? (
                  <div
                    className="overflow-hidden flex items-center justify-center w-full h-[70vh] bg-gray-50 rounded"
                    style={{ cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                  >
                    <img
                      src={previewFile.url}
                      alt={previewFile.name}
                      style={{
                        transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
                        transition: isPanning ? 'none' : 'transform 0.2s',
                        maxHeight: '70vh',
                        maxWidth: '100%',
                        userSelect: 'none',
                        pointerEvents: 'all',
                      }}
                      draggable={false}
                    />
                  </div>
                ) : previewFile.type === 'application/pdf' ? (
                  <div className="flex flex-col items-center">
                    <FileText size={48} className="text-primary-400 mb-2" />
                    <span className="mb-2 font-medium text-gray-700">{previewFile.name}</span>
                    <a href={previewFile.url} download={previewFile.name} className="text-primary-600 underline">Download PDF</a>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <footer className="py-1 px-4 text-center text-sm text-amber-600 border-t border-gray-200">
            <p>© 2025 Healthcare Chatbot. {selectedCapability === 'engagement' ? 'Patient Engagement' : 'Assistance For Professional Medical Advice.'}</p>
          </footer>
        </div>
      } />
    </Routes>
  );
};

export default App;
