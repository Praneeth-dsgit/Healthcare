import { type FC, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowUp, Bot, FileDown, UserCircle, Users, Trash2, AlertCircle, Upload, FileText, Image as ImageIcon, Loader2, X, Settings, Heart, Activity, Square, Stethoscope, PlusCircle, LayoutDashboard, Calendar, Scan } from 'lucide-react';
import ChatMessage from './components/ChatMessage';
import LoadingDots from './components/LoadingDots';
import DisclaimerModal from './components/DisclaimerModal';
import { type Capability } from './services/roleService';
import { clearAuth } from './services/authService';
import PatientInfoForm from './components/PatientInfoForm';
import PatientEngagement from './components/PatientEngagement';
import VoiceInput from './components/VoiceInput';
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
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Signup from './components/Signup';
import OtpVerification from './components/OtpVerification';
import Login from './components/Login';
import PatientPortalLayout from './components/PatientPortalLayout';
import GeneralPractitionerDashboard from './components/general/GeneralPractitionerDashboard';
import FloatingChatBot from './components/general/FloatingChatBot';
import AdminDashboard from './components/admin/AdminDashboard';
import FaqDropdown from './components/FaqDropdown';
import { roleService, type UserRole, type Capability as RoleCapability } from './services/roleService';

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

/** Normalize upload/radiology result: collapse excessive newlines and trim for consistent, compact display. */
function normalizeInterpretationResult(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')   // 3+ newlines -> max 2
    .replace(/\n[ \t]+\n/g, '\n\n')  // blank lines that had only spaces/tabs -> single blank
    .split('\n')
    .map(line => line.trimEnd())
    .filter((line, i, arr) => {
      const prev = arr[i - 1];
      return !(line === '' && prev === '');  // drop consecutive empty lines
    })
    .join('\n')
    .trim();
}

const TOP_FEATURES = [
  { icon: Bot, text: 'AI medical assistants for doctors in general, radiology & lab departments' },
  { icon: UserCircle, text: 'Personalised AI assistants for users to chat, manage, and track health' },
  { icon: Scan, text: 'User/Patient engagement with medical records, family members & notifications' },
  { icon: Calendar, text: 'Appointment booking, Prescriptions, Medicine lookup, Reports & Analytics' },
  { icon: Upload, text: 'Document & image upload with AI analysis and interpretation for diagnosis assistance' },
  { icon: Users, text: 'Assistance to medical representatives to manage their tasks and interactions with doctors' }
];

const AuthLayout: FC<{ children: React.ReactNode; navigate: any; capabilityName?: string; showFeatures?: boolean }> = ({ children, navigate, capabilityName, showFeatures }) => {
  const getCapabilityInfo = (capability?: string) => {
    switch (capability) {
      case 'general':
        return {
          title: 'General Practitioner Dashboard',
          subtitle: 'Sign in to access your medical practice dashboard',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50'
        };
      case 'radiology':
        return {
          title: 'Radiology Assistant',
          subtitle: 'Sign in to access radiology imaging tools',
          color: 'text-purple-600',
          bgColor: 'bg-purple-50'
        };
      case 'lab':
        return {
          title: 'Lab Technician Portal',
          subtitle: 'Sign in to access lab report management',
          color: 'text-green-600',
          bgColor: 'bg-green-50'
        };
      case 'engagement':
        return {
          title: 'Frontdesk',
          subtitle: 'Sign in to manage patient communications',
          color: 'text-orange-600',
          bgColor: 'bg-orange-50'
        };
      case 'admin':
        return {
          title: 'Admin Dashboard',
          subtitle: 'Sign in to manage users and access controls',
          color: 'text-purple-600',
          bgColor: 'bg-purple-50'
        };
      case 'signup':
        return {
          title: 'Create Account',
          subtitle: 'Sign up for Acufore Health',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50'
        };
      default:
        return {
          title: 'Welcome',
          subtitle: 'Sign in to your account',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50'
        };
    }
  };

  const info = getCapabilityInfo(capabilityName);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Full-screen background healthcare illustration */}
      <div className="absolute inset-0 pointer-events-none z-0" aria-hidden>
        <img
          src="/healthcare-illustration.jpg"
          alt=""
          className="absolute inset-0 w-100% h-90% object-cover opacity-50"
        />
      </div>
      <AuthHeader />
      <div className="relative z-10 flex items-center justify-center py-12 px-4">
        {showFeatures ? (
          <div className="w-full max-w-5xl flex flex-col md:flex-row bg-white/10 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 animate-fade-in overflow-hidden min-h-[32rem]">
            {/* Left: Branding + features - 60% width; different bg for login vs signup */}
            <div className={`md:w-[60%] p-10 border-b md:border-b-0 md:border-r border-gray-100 min-h-[28rem] md:min-h-0 flex flex-col justify-center bg-gradient-to-br ${capabilityName === 'signup' ? 'from-indigo-200 to-red-300' : 'from-gray-200 to-indigo-300'}`}>
              <div className="mb-6 text-center">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Acufore Health</h1>
                <p className="text-gray-500 text-sm mt-1">Healthcare Management</p>
              </div>
              <ul className="space-y-4">
                {TOP_FEATURES.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-blue-600" />
                      </span>
                      <span className="text-sm text-gray-700 pt-0.5">{item.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            {/* Right: Login form - 40% width */}
            <div className="md:w-[40%] p-10 flex flex-col justify-center">
              <div className={`mb-6 ${!capabilityName || capabilityName === 'signup' ? 'text-center' : ''}`}>
                <h1 className={`font-bold ${info.color} ${!capabilityName || capabilityName === 'signup' ? 'text-4xl' : 'text-2xl'}`}>{info.title}</h1>
                {info.subtitle ? <p className="text-gray-500 text-sm mt-1">{info.subtitle}</p> : null}
              </div>
              {children}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg border border-gray-100 animate-fade-in">
            <div className={`mb-6 text-center`}>
              <h1 className={`font-bold ${info.color} ${!capabilityName || capabilityName === 'signup' ? 'text-4xl' : 'text-2xl'}`}>{info.title}</h1>
              {info.subtitle ? <p className="text-gray-500 text-sm mt-1">{info.subtitle}</p> : null}
            </div>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

// Defined outside App so they keep stable identity across re-renders (prevents input focus loss on radiology/lab)
const ProtectedRoute: FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true' && !!sessionStorage.getItem('accessToken');
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const RoleBasedRoute: FC<{
  children: React.ReactNode;
  capability?: RoleCapability | 'admin';
  fallbackPath?: string;
  isAuthenticated: boolean;
}> = ({ children, capability, fallbackPath = '/app', isAuthenticated }) => {
  const navigate = useNavigate();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      setChecking(true);
      try {
        if (capability === 'admin') {
          const isAdmin = await roleService.isAdmin();
          setHasAccess(isAdmin);
          if (!isAdmin) {
            setTimeout(() => navigate('/login/admin'), 1000);
          }
        } else if (capability) {
          const access = await roleService.hasAccess(capability);
          setHasAccess(access);
          if (!access) {
            setTimeout(() => navigate(fallbackPath), 1000);
          }
        } else {
          setHasAccess(true);
        }
      } catch (error) {
        console.error('Error checking access:', error);
        setHasAccess(false);
      } finally {
        setChecking(false);
      }
    };

    if (isAuthenticated) {
      checkAccess();
    } else {
      setHasAccess(false);
      setChecking(false);
    }
  }, [capability, isAuthenticated, fallbackPath, navigate]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
          <p className="text-gray-600">Checking access permissions...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md p-8 bg-white rounded-lg shadow-lg">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You don't have permission to access this area. Redirecting...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const App: FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true); // Initial state, will be managed by session loading logic
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
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [lastFileFindings, setLastFileFindings] = useState<string | null>(null);
  const [lastAiMessage, setLastAiMessage] = useState<string | null>(null);
  // Add state for editing
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  // Add state for abort controller
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  // Add state for user role
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loadingRole, setLoadingRole] = useState(false);

  const [signupEmail, setSignupEmail] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true' && !!sessionStorage.getItem('accessToken');
  
  // Get capability from URL path
  const getCapabilityFromPath = (): Capability | null => {
    const path = location.pathname;
    if (path.includes('/app/general')) return 'general';
    if (path.includes('/app/radiology')) return 'radiology';
    if (path.includes('/app/lab')) return 'lab';
    if (path.includes('/app/engagement')) return 'engagement';
    return null;
  };

  // Handle disclaimer close
  const handleDisclaimerClose = () => {
    setShowDisclaimer(false);
  };

  // Update capability when route changes - automatically set from route
  useEffect(() => {
    const routeCapability = getCapabilityFromPath();
    if (routeCapability) {
      // Always set capability from route
            if (selectedCapability !== routeCapability) {
              setSelectedCapability(routeCapability);
              setShowDisclaimer(false);
              
        // Save capability for current session if it exists
        if (currentSessionId) {
          const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
          const storageKey = `${userEmail}_sessionCapabilities`;
          const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
          sessionCapabilities[currentSessionId] = routeCapability;
          localStorage.setItem(storageKey, JSON.stringify(sessionCapabilities));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, currentSessionId]);

  // Fetch user role on mount and when authentication changes
  useEffect(() => {
    const fetchRole = async () => {
      if (isAuthenticated) {
        setLoadingRole(true);
        try {
          const role = await roleService.getUserRole();
          setUserRole(role);
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole(null);
        } finally {
          setLoadingRole(false);
        }
      } else {
        setUserRole(null);
        roleService.clearCache();
      }
    };

    fetchRole();
  }, [isAuthenticated]);

  // Load saved capability on mount and for current session
  useEffect(() => {
    if (currentSessionId && isAuthenticated) {
      const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
      const storageKey = `${userEmail}_sessionCapabilities`;
      const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const sessionCapability = sessionCapabilities[currentSessionId] as Capability;
      
      // Set capability from route if available, otherwise use saved capability
      const routeCapability = getCapabilityFromPath();
      if (routeCapability) {
        setSelectedCapability(routeCapability);
        setShowDisclaimer(false);
      } else if (sessionCapability && ['general', 'radiology', 'lab', 'engagement'].includes(sessionCapability)) {
        setSelectedCapability(sessionCapability);
        setShowDisclaimer(false);
      }
    }
  }, [currentSessionId, isAuthenticated]);

  // Get capability display info
  const getCapabilityInfo = (capability: Capability | null) => {
    switch (capability) {
      case 'general':
        return { name: 'General Medical Assistant', color: 'text-blue-600', bgColor: 'bg-blue-50', subtitle: 'Manage appointments, prescriptions, and patient care' };
      case 'radiology':
        return { name: 'Radiology Medical Assistant', color: 'text-purple-600', bgColor: 'bg-purple-50', subtitle: 'Interpret imaging and assist with radiology workflows' };
      case 'lab':
        return { name: 'Lab Medical Assistant', color: 'text-green-600', bgColor: 'bg-green-50', subtitle: 'Interpret lab results and assist with laboratory workflows' };
      case 'engagement':
        return { name: 'Frontdesk', color: 'text-orange-600', bgColor: 'bg-orange-50', subtitle: 'Query patient data, appointments, and hospital database' };
      default:
        return { name: 'AI Assistant', color: 'text-gray-600', bgColor: 'bg-gray-50' };
    }
  };

  // Get capability-specific placeholder text (memoized to prevent re-renders)
  const placeholderText = useMemo(() => {
    switch (selectedCapability) {
      case 'general':
        return "Ask about symptoms, treatments, medications, or general health concerns...";
      case 'radiology':
        return "Ask about X-rays, CT scans, MRI, ultrasound, or medical imaging interpretation...";
      case 'lab':
        return "Ask about blood tests, lab results, CBC, chemistry panels, or laboratory values...";
      default:
        return "Please select an assistant capability first...";
    }
  }, [selectedCapability]);

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

  // Load sessions for current route capability (radiology/lab/general/engagement each have their own list).
  // Only create a new session when none exist — do not append on every navigation or effect re-run.
  useEffect(() => {
    if (!isAuthenticated) return;
    const routeCapability = getCapabilityFromPath();
    if (!routeCapability) return;

    const loadedSessions = getSessions(routeCapability);
    const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
    const storageKey = `${userEmail}_sessionCapabilities`;
    const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');

    if (loadedSessions.length === 0) {
      const newId = uuidv4();
      const newSession = { id: newId, name: 'Session 1', messages: [] };
      const updatedSessions = [newSession];
      setSessions(updatedSessions);
      saveSessions(updatedSessions, routeCapability);
      setCurrentSessionId(newId, routeCapability);
      setCurrentSessionIdState(newId);
      setMessages([]);
      sessionCapabilities[newId] = routeCapability;
      localStorage.setItem(storageKey, JSON.stringify(sessionCapabilities));
      setShowDisclaimer(true);
      return;
    }

    setSessions(loadedSessions);

    const savedCurrentId = getCurrentSessionId(routeCapability);
    const pickedId =
      savedCurrentId && loadedSessions.some((s) => s.id === savedCurrentId)
        ? savedCurrentId
        : loadedSessions[0].id;

    const found = loadedSessions.find((s) => s.id === pickedId);
    setCurrentSessionId(pickedId, routeCapability);
    setCurrentSessionIdState(pickedId);
    setMessages(found?.messages || []);

    if (!sessionCapabilities[pickedId]) {
      sessionCapabilities[pickedId] = routeCapability;
      localStorage.setItem(storageKey, JSON.stringify(sessionCapabilities));
    }

    const hasAnyCapabilities = Object.keys(sessionCapabilities).length > 0;
    setShowDisclaimer(!hasAnyCapabilities);
  }, [isAuthenticated, location.pathname]);

  // Save messages to the current session (per-route capability so radiology/lab stay separate)
  useEffect(() => {
    if (!currentSessionId) return;
    const updatedSessions = sessions.map(s =>
      s.id === currentSessionId ? { ...s, messages } : s
    );
    setSessions(updatedSessions);
    saveSessions(updatedSessions, getCapabilityFromPath());
    saveMessages(messages); // legacy, can be removed later
  }, [messages]);

  // Handle session switch
  const handleSessionSwitch = (sessionId: string) => {
    setCurrentSessionIdState(sessionId);
    setCurrentSessionId(sessionId, getCapabilityFromPath());
    const found = sessions.find(s => s.id === sessionId);
    const sessionMessages = found ? found.messages : [];
    setMessages(sessionMessages);
    
    // Load capability for this session (user-specific)
    const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
    const storageKey = `${userEmail}_sessionCapabilities`;
    const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const sessionCapability = sessionCapabilities[sessionId] as Capability;
    
    if (sessionCapability) {
      setSelectedCapability(sessionCapability);
    } else {
      // If no capability set for this session, use route capability
      const routeCapability = getCapabilityFromPath();
      if (routeCapability) {
        setSelectedCapability(routeCapability);
      } else {
      setSelectedCapability(null);
      }
      setShowDisclaimer(false);
    }
    
    // Close the dropdown after switching
    setShowDropdown(false);
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
    const routeCapability = getCapabilityFromPath();
    saveSessions(updatedSessions, routeCapability);
    setCurrentSessionIdState(newId);
    setCurrentSessionId(newId, routeCapability);
    setMessages([]);
    
    // Check if there's a capability in the current route
    if (routeCapability) {
      // If on a capability route, use that capability
      setSelectedCapability(routeCapability);
      setShowDisclaimer(false);
      
      // Save capability for new session
      const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
      const storageKey = `${userEmail}_sessionCapabilities`;
      const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
      sessionCapabilities[newId] = routeCapability;
      localStorage.setItem(storageKey, JSON.stringify(sessionCapabilities));
    } else {
      // No route capability, set to null
      setShowDisclaimer(false);
      setSelectedCapability(null);
    }
  };

  // Handle session delete
  const handleDeleteSession = (sessionId: string) => {
    if (sessions.length === 1) return; // Prevent deleting the last session
    const routeCapability = getCapabilityFromPath();
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);
    saveSessions(updatedSessions, routeCapability);
    removeSession(sessionId, routeCapability);
    
    // Clean up capability data for deleted session (user-specific)
    const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
    const storageKey = `${userEmail}_sessionCapabilities`;
    const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
    delete sessionCapabilities[sessionId];
    localStorage.setItem(storageKey, JSON.stringify(sessionCapabilities));
    
    // If the deleted session was current, switch to another
    if (currentSessionId === sessionId) {
      const nextSession = updatedSessions[0];
      setCurrentSessionIdState(nextSession.id);
      setCurrentSessionId(nextSession.id, routeCapability);
      setMessages(nextSession.messages);
      
      // Load capability for the next session
      const nextSessionCapability = sessionCapabilities[nextSession.id] as Capability;
      if (nextSessionCapability) {
        setSelectedCapability(nextSessionCapability);
      } else {
        // Use route capability if available
        const routeCapability = getCapabilityFromPath();
        setSelectedCapability(routeCapability || null);
        setShowDisclaimer(false);
      }
    }
  };

  const handlePatientSubmit = async (info: PatientInfo) => {
    const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
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
          userEmail: userEmail, // Add user email for session tracking
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
    
    const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';

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
              userEmail: userEmail,
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
          userEmail: userEmail,
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

  const handleVoiceTextGenerated = (text: string) => {
    setInput(text);
    setIsVoiceRecording(false);
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
              const raw = data.result || 'No interpretation available.';
              const fullText = normalizeInterpretationResult(raw);
              const msgId = Date.now().toString() + '-ai';
              setMessages(prev => [...prev, {
                id: msgId,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
              }]);
              const chunkSize = 25;
              const intervalMs = 20;
              let index = 0;
              const streamInterval = setInterval(() => {
                index = Math.min(index + chunkSize, fullText.length);
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText.slice(0, index) } : m));
                if (index >= fullText.length) {
                  clearInterval(streamInterval);
                  setLastFileFindings(fullText);
                  setLastAiMessage(fullText);
                  setAnalyzing(false);
                  resolve();
                }
              }, intervalMs);
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
              setAnalyzing(false);
              resolve();
            }
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

  // Get raw session capability for filtering (undefined if not set)
  function getSessionCapabilityValue(sessionId: string): Capability | undefined {
    const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
    const storageKey = `${userEmail}_sessionCapabilities`;
    const sessionCapabilities = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const cap = sessionCapabilities[sessionId];
    return cap && ['general', 'radiology', 'lab', 'engagement'].includes(cap) ? cap as Capability : undefined;
  }

  // Get session capability label for display
  function getSessionCapability(sessionId: string): string {
    const capability = getSessionCapabilityValue(sessionId);
    switch (capability) {
      case 'general': return 'General';
      case 'radiology': return 'Radiology';
      case 'lab': return 'Lab';
      case 'engagement': return 'Frontdesk';
      default: return 'Chat';
    }
  }

  // On capability-specific pages (radiology, lab, engagement), only show sessions for that capability
  const sessionsForCurrentRoute = useMemo(() => {
    const routeCap = getCapabilityFromPath();
    if (!routeCap) return sessions;
    return sessions.filter(s => {
      const cap = getSessionCapabilityValue(s.id);
      return cap === routeCap || cap === undefined;
    });
  }, [sessions, location.pathname]);

  return (
    <Routes>
      {/* Default route - always redirect to login page first */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/signup" element={
        <AuthLayout navigate={navigate} capabilityName="signup" showFeatures>
          <Signup
            onSignupSuccess={() => navigate('/login')}
            onNavigateToLogin={() => navigate('/login')}
          />
        </AuthLayout>
      } />
      <Route path="/verify-otp" element={
        <AuthLayout navigate={navigate}>
          <OtpVerification 
            email={signupEmail || localStorage.getItem('pendingVerificationEmail') || ''} 
            onVerified={async () => { 
              setOtpVerified(true);
              localStorage.removeItem('pendingVerificationEmail');
              // Get default route based on role and navigate there
              const defaultRoute = await roleService.getDefaultRoute();
              navigate(defaultRoute);
            }} 
          />
        </AuthLayout>
      } />
      {/* Default login route - redirects based on user role */}
      <Route path="/login" element={
        <AuthLayout navigate={navigate} showFeatures>
          <Login 
            onLoginSuccess={async () => {
              // Get default route based on role and navigate there
              const defaultRoute = await roleService.getDefaultRoute();
              navigate(defaultRoute);
            }}
            onNavigateToSignup={() => navigate('/signup')}
          />
        </AuthLayout>
      } />
      {/* Capability-specific login routes */}
      <Route path="/login/general" element={
        <AuthLayout navigate={navigate} capabilityName="general" showFeatures>
          <Login 
            onLoginSuccess={() => navigate('/app/general')}
            onNavigateToSignup={() => navigate('/signup')}
            redirectPath="/app/general"
            capabilityName="General Practitioner Dashboard"
          />
        </AuthLayout>
      } />
      <Route path="/login/radiology" element={
        <AuthLayout navigate={navigate} capabilityName="radiology" showFeatures>
          <Login 
            onLoginSuccess={() => navigate('/app/radiology')}
            onNavigateToSignup={() => navigate('/signup')}
            redirectPath="/app/radiology"
            capabilityName="Radiology Assistant"
          />
        </AuthLayout>
      } />
      <Route path="/login/lab" element={
        <AuthLayout navigate={navigate} capabilityName="lab" showFeatures>
          <Login 
            onLoginSuccess={() => navigate('/app/lab')}
            onNavigateToSignup={() => navigate('/signup')}
            redirectPath="/app/lab"
            capabilityName="Lab Technician Portal"
          />
        </AuthLayout>
      } />
      <Route path="/login/engagement" element={
        <AuthLayout navigate={navigate} capabilityName="engagement" showFeatures>
          <Login 
            onLoginSuccess={() => navigate('/app/engagement')}
            onNavigateToSignup={() => navigate('/signup')}
            redirectPath="/app/engagement"
            capabilityName="Frontdesk"
          />
        </AuthLayout>
      } />
      {/* Admin Login */}
      <Route path="/login/admin" element={
        <AuthLayout navigate={navigate} capabilityName="admin" showFeatures>
          <Login 
            onLoginSuccess={() => navigate('/admin/dashboard')}
            onNavigateToSignup={() => navigate('/signup')}
            redirectPath="/admin/dashboard"
            capabilityName="Admin Dashboard"
          />
        </AuthLayout>
      } />
      {/* Admin Dashboard */}
      <Route path="/admin/dashboard" element={
        <ProtectedRoute>
          <RoleBasedRoute capability={'admin' as any} fallbackPath="/login/admin" isAuthenticated={isAuthenticated}>
            <AdminDashboard />
          </RoleBasedRoute>
        </ProtectedRoute>
      } />
      {/* Patient Portal Routes - Separate from Patient Engagement */}
      <Route path="/portal/*" element={
        <ProtectedRoute>
          <PatientPortalLayout />
        </ProtectedRoute>
      } />
      {/* Main app routes - all /app/* routes use wildcard to share same interface */}
      {/* Redirect /app to /app/general */}
      <Route path="/app" element={<Navigate to="/app/general" replace />} />
      {/* General Practitioner Dashboard - New route for /app/general */}
      <Route path="/app/general" element={
        <ProtectedRoute>
          <RoleBasedRoute capability="general" fallbackPath="/app/engagement" isAuthenticated={isAuthenticated}>
            <>
              <GeneralPractitionerDashboard />
              <FloatingChatBot />
            </>
          </RoleBasedRoute>
        </ProtectedRoute>
      } />
      {/* Radiology route */}
      <Route path="/app/radiology" element={
        <ProtectedRoute>
          <RoleBasedRoute capability="radiology" fallbackPath="/app/engagement" isAuthenticated={isAuthenticated}>
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
              roleService.clearCache();
              clearAuth();
              
              // Reset application state
              setSessions([]);
              setMessages([]);
              setCurrentSessionIdState(null);
              setSelectedCapability(null);
              setShowDisclaimer(true);
              setUserRole(null);
              
              navigate('/login');
            }}
            selectedCapability={selectedCapability}
            onSelectPrompt={handleQuickPrompt}
            hideSessionControls={true}
          />
          {showDisclaimer && (
            <DisclaimerModal onClose={handleDisclaimerClose} />
          )}
          <main className="flex-1 flex px-0 py-3 overflow-hidden w-full">
            <div className="flex gap-2 flex-1 min-h-0 min-w-0 w-full">
              {/* Left Sidebar - New Chat + Chat History (radiology: no Patient Info) */}
              <div className="w-64 flex-shrink-0 flex flex-col bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-3 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={handleNewSession}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-colors"
                  >
                    <PlusCircle size={18} />
                    New Chat
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col min-h-0">
                  <h2 className="text-sm font-medium text-gray-700 px-3 py-2 border-b border-gray-100">Chat History</h2>
                  <div className="flex-1 p-2">
                    {sessionsForCurrentRoute.map((session) => (
                      <div
                        key={session.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50 ${currentSessionId === session.id ? 'bg-blue-100' : ''}`}
                        onClick={() => handleSessionSwitch(session.id)}
                      >
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="truncate text-sm font-medium text-gray-900">{getSessionTopic(session)}</span>
                          {getSessionCapability && (
                            <span className="text-xs text-gray-500 truncate">{getSessionCapability(session.id)}</span>
                          )}
                        </div>
                        {sessionsForCurrentRoute.length > 1 && (
                          <button
                            type="button"
                            className="p-1 text-gray-400 hover:text-red-600 flex-shrink-0"
                            onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                            title="Delete session"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column - Chat */}
              <div className="flex flex-col overflow-hidden flex-1">
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
                          </div>
                          <div className="flex items-center space-x-2 text-amber-600 animate-pulse">
                            <AlertCircle size={16} />
                            <span className="text-sm">For healthcare professionals only.</span>
                          </div>
                        </div>
                      ) : (
                        messages.map((message) => (
                          <ChatMessage
                            key={message.id}
                            message={message}
                            onPreviewClick={handlePreviewClick}
                            onEdit={id => {
                              setEditingMessageId(id);
                              const msg = messages.find(m => m.id === id);
                              if (msg) setInput(msg.content);
                              if (inputRef.current) inputRef.current.focus();
                            }}
                            showUploadProgress={uploading && messages.length > 0 && messages[messages.length - 1].id === message.id && message.role === 'user' && !!(message as any).fileUrl}
                            uploadProgress={uploadProgress}
                            analyzing={analyzing && messages.length > 0 && messages[messages.length - 1].id === message.id && message.role === 'user'}
                          />
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
                    <div className="sticky bottom-0 bg-white p-0.5 border-t border-gray-200 "
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

                        {/* Voice Input Button */}
                        <div className="mr-2">
                          <VoiceInput
                            onTextGenerated={handleVoiceTextGenerated}
                            disabled={uploading || analyzing || !selectedCapability || isVoiceRecording}
                          />
                        </div>

                        <textarea
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder={placeholderText}
                          className={`w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none hide-scrollbar ${selectedCapability === 'radiology' || selectedCapability === 'lab' ? 'pr-24' : 'pr-12'}`}
                          rows={1}
                          disabled={uploading || analyzing || !selectedCapability}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmit(e);
                            }
                          }}
                        />
                        {(selectedCapability === 'radiology' || selectedCapability === 'lab') && (
                          <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
                            <FaqDropdown
                              capability={selectedCapability}
                              sessionId={currentSessionId}
                              onSelectPrompt={handleQuickPrompt}
                              disabled={uploading || analyzing || !selectedCapability}
                            />
                          </div>
                        )}
                        {(isLoading || analyzing) ? (
                          <button
                            type="button"
                            onClick={handleStopGeneration}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                            title="Stop generation"
                          >
                            <Square size={20} />
                          </button>
                        ) : (
                          <button
                            type="submit"
                            disabled={!input.trim() || uploading || analyzing}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full bg-primary-500 text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors hover:bg-primary-600"
                          >
                            <ArrowUp size={20} />
                          </button>
                        )}
                      </form>
                    </div>
                  )}
                </div>
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
            <p>© 2025 Healthcare Chatbot. {selectedCapability === 'engagement' ? 'Frontdesk' : 'Assistance For Professional Medical Advice.'}</p>
          </footer>
        </div>
          </RoleBasedRoute>
        </ProtectedRoute>
      } />
      {/* Lab route */}
      <Route path="/app/lab" element={
        <ProtectedRoute>
          <RoleBasedRoute capability="lab" fallbackPath="/app/engagement" isAuthenticated={isAuthenticated}>
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
              clearUserData();
              roleService.clearCache();
              clearAuth();
              setSessions([]);
              setMessages([]);
              setCurrentSessionIdState(null);
              setSelectedCapability(null);
              setShowDisclaimer(true);
              setUserRole(null);
              navigate('/login');
            }}
            selectedCapability={selectedCapability}
            onSelectPrompt={handleQuickPrompt}
            hideSessionControls={true}
          />
          {showDisclaimer && (
            <DisclaimerModal onClose={handleDisclaimerClose} />
          )}
          <main className="flex-1 flex px-0 py-3 overflow-hidden w-full">
            <div className="flex gap-2 flex-1 min-h-0 min-w-0 w-full">
              {/* Left Sidebar - New Chat + Chat History (lab: no Patient Info) */}
              <div className="w-64 flex-shrink-0 flex flex-col bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-3 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={handleNewSession}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-colors"
                  >
                    <PlusCircle size={18} />
                    New Chat
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col min-h-0">
                  <h2 className="text-sm font-medium text-gray-700 px-3 py-2 border-b border-gray-100">Chat History</h2>
                  <div className="flex-1 p-2">
                    {sessionsForCurrentRoute.map((session) => (
                      <div
                        key={session.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50 ${currentSessionId === session.id ? 'bg-blue-100' : ''}`}
                        onClick={() => handleSessionSwitch(session.id)}
                      >
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="truncate text-sm font-medium text-gray-900">{getSessionTopic(session)}</span>
                          {getSessionCapability && (
                            <span className="text-xs text-gray-500 truncate">{getSessionCapability(session.id)}</span>
                          )}
                        </div>
                        {sessionsForCurrentRoute.length > 1 && (
                          <button
                            type="button"
                            className="p-1 text-gray-400 hover:text-red-600 flex-shrink-0"
                            onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                            title="Delete session"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column - Chat */}
              <div className="flex flex-col overflow-hidden flex-1">
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
                          </div>
                          <div className="flex items-center space-x-2 text-amber-600 animate-pulse">
                            <AlertCircle size={16} />
                            <span className="text-sm">For healthcare professionals only.</span>
                          </div>
                        </div>
                      ) : (
                        messages.map((message) => (
                          <ChatMessage
                            key={message.id}
                            message={message}
                            onPreviewClick={handlePreviewClick}
                            onEdit={id => {
                              setEditingMessageId(id);
                              const msg = messages.find(m => m.id === id);
                              if (msg) setInput(msg.content);
                              if (inputRef.current) inputRef.current.focus();
                            }}
                            showUploadProgress={uploading && messages.length > 0 && messages[messages.length - 1].id === message.id && message.role === 'user' && !!(message as any).fileUrl}
                            uploadProgress={uploadProgress}
                            analyzing={analyzing && messages.length > 0 && messages[messages.length - 1].id === message.id && message.role === 'user'}
                          />
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

                  {(selectedCapability as Capability) !== 'engagement' && (
                    <div className="sticky bottom-0 bg-white p-0.5 border-t border-gray-200 "
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
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
                      {showFileTypeModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
                          <div className="bg-white rounded-lg shadow-lg p-6 w-80 flex flex-col items-center">
                            <h3 className="text-lg font-semibold mb-4">Select file type to upload</h3>
                            {!pendingFileType && <>
                              {selectedCapability === 'general' && (
                                <button
                                  className="w-full flex items-center gap-2 px-4 py-2 mb-3 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium"
                                  onClick={() => handleFileTypeSelect('pdf')}
                                >
                                  <FileText size={20} /> Prescription/Document (PDF)
                                </button>
                              )}
                              {selectedCapability === 'lab' && (
                                <button
                                  className="w-full flex items-center gap-2 px-4 py-2 mb-3 rounded bg-green-100 hover:bg-green-200 text-green-700 font-medium"
                                  onClick={() => handleFileTypeSelect('pdf')}
                                >
                                  <FileText size={20} /> Lab Report (PDF)
                                </button>
                              )}
                              {selectedCapability === 'radiology' && (
                                <button
                                  className="w-full flex items-center gap-2 px-4 py-2 mb-3 rounded bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium"
                                  onClick={() => handleFileTypeSelect('image')}
                                >
                                  <ImageIcon size={20} /> Medical Image (JPG/PNG/DICOM)
                                </button>
                              )}
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

                        <div className="mr-2">
                          <VoiceInput
                            onTextGenerated={handleVoiceTextGenerated}
                            disabled={uploading || analyzing || !selectedCapability || isVoiceRecording}
                          />
                        </div>

                        <textarea
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder={placeholderText}
                          className={`w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none hide-scrollbar ${selectedCapability === 'radiology' || selectedCapability === 'lab' ? 'pr-24' : 'pr-12'}`}
                          rows={1}
                          disabled={uploading || analyzing || !selectedCapability}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmit(e);
                            }
                          }}
                        />
                        {(selectedCapability === 'radiology' || selectedCapability === 'lab') && (
                          <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
                            <FaqDropdown
                              capability={selectedCapability}
                              sessionId={currentSessionId}
                              onSelectPrompt={handleQuickPrompt}
                              disabled={uploading || analyzing || !selectedCapability}
                            />
                          </div>
                        )}
                        {(isLoading || analyzing) ? (
                          <button
                            type="button"
                            onClick={handleStopGeneration}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                            title="Stop generation"
                          >
                            <Square size={20} />
                          </button>
                        ) : (
                          <button
                            type="submit"
                            disabled={!input.trim() || uploading || analyzing}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full bg-primary-500 text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors hover:bg-primary-600"
                          >
                            <ArrowUp size={20} />
                          </button>
                        )}
                      </form>
                    </div>
                  )}
                  </div>
              </div>
            </div>
          </main>

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
            <p>© 2025 Healthcare Chatbot. {selectedCapability === 'engagement' ? 'Frontdesk' : 'Assistance For Professional Medical Advice.'}</p>
          </footer>
        </div>
          </RoleBasedRoute>
        </ProtectedRoute>
      } />
      {/* Patient Engagement route */}
      <Route path="/app/engagement" element={
        <ProtectedRoute>
          <RoleBasedRoute capability="engagement" fallbackPath="/app/radiology" isAuthenticated={isAuthenticated}>
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
              clearUserData();
              roleService.clearCache();
              clearAuth();
              setSessions([]);
              setMessages([]);
              setCurrentSessionIdState(null);
              setSelectedCapability(null);
              setShowDisclaimer(true);
              setUserRole(null);
              navigate('/login');
            }}
            selectedCapability={selectedCapability}
            onSelectPrompt={handleQuickPrompt}
            hideSessionControls={true}
          />
          {showDisclaimer && (
            <DisclaimerModal onClose={handleDisclaimerClose} />
          )}
          <main className="flex-1 flex px-0 py-3 overflow-hidden w-full">
            <div className="flex flex-col overflow-hidden flex-1 min-w-0 w-full">
              {selectedCapability === 'engagement' ? (
                <PatientEngagement sessionId={currentSessionId} />
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
                            Ask me questions about health conditions, symptoms, treatments, or general health advice.
                          </p>
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
                </div>
              )}
            </div>
          </main>

          <footer className="py-1 px-4 text-center text-sm text-amber-600 border-t border-gray-200">
            <p>© 2025 Healthcare Chatbot. {selectedCapability === 'engagement' ? 'Frontdesk' : 'Assistance For Professional Medical Advice.'}</p>
          </footer>
        </div>
          </RoleBasedRoute>
        </ProtectedRoute>
      } />
    </Routes>
  );
};

export default App;
