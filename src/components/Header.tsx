import React, { useState, useRef, useEffect } from 'react';
import { Activity, Trash2, User, LogIn, UserPlus, LogOut, ChevronDown, HelpCircle, PlusCircle, Stethoscope, Award, Brain, TestTube, Users, MessageSquare, FileText, Image as ImageIcon } from 'lucide-react';
import AboutModal from './AboutModal';
import PrivacyModal from './PrivacyModal';
import HelpModal from './HelpModal';

interface HeaderProps {
  sessions: any[];
  currentSessionId: string | null;
  showDropdown: boolean;
  setShowDropdown: (show: boolean) => void;
  dropdownRef: React.RefObject<HTMLDivElement>;
  getSessionTopic: (session: any) => string;
  getSessionCapability?: (sessionId: string) => string;
  handleSessionSwitch: (sessionId: string) => void;
  handleDeleteSession: (sessionId: string) => void;
  handleNewSession: () => void;
  children?: React.ReactNode;
  capabilityInfo?: {
    name: string;
    color: string;
    bgColor: string;
  };
  onNavigateToLogin?: () => void;
  onNavigateToSignup?: () => void;
  onLogout?: () => void;
  isAuthenticated?: boolean;
  onSelectPrompt?: (prompt: string) => void;
  selectedCapability?: string | null;
}

const Header: React.FC<HeaderProps> = ({
  sessions,
  currentSessionId,
  showDropdown,
  setShowDropdown,
  dropdownRef,
  getSessionTopic,
  getSessionCapability,
  handleSessionSwitch,
  handleDeleteSession,
  handleNewSession,
  children,
  capabilityInfo,
  onNavigateToLogin,
  onNavigateToSignup,
  onLogout,
  isAuthenticated,
  onSelectPrompt,
  selectedCapability
}) => {
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showFaqDropdown, setShowFaqDropdown] = useState(false);
  const [showMoreOptionsDropdown, setShowMoreOptionsDropdown] = useState(false);
  const [dynamicFaqs, setDynamicFaqs] = useState<string[]>([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const faqDropdownRef = useRef<HTMLDivElement>(null);
  const moreOptionsDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch dynamic FAQs when capability changes or FAQ dropdown is opened
  const fetchDynamicFaqs = async (capability: string, sessionId: string) => {
    if (!capability || !sessionId) return;
    
    setIsLoadingFaqs(true);
    try {
      const response = await fetch('http://localhost:5000/api/faqs/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          capability,
          session_id: sessionId
        })
      });
      
      const data = await response.json();
      if (data.success && data.faqs) {
        setDynamicFaqs(data.faqs);
      }
    } catch (error) {
      console.error('Error fetching dynamic FAQs:', error);
      // Fallback to default FAQs
      setDynamicFaqs(getDefaultFaqs(capability));
    } finally {
      setIsLoadingFaqs(false);
    }
  };

  // Get default FAQs as fallback
  const getDefaultFaqs = (capability: string): string[] => {
    const defaultFaqs = {
      'radiology': [
        "How to interpret a chest X-ray?",
        "What are the signs of pneumonia on imaging?",
        "How to identify fractures on X-ray?",
        "What does a normal CT scan of the brain look like?",
        "How to read an MRI of the spine?",
        "What are the radiological signs of stroke?",
        "How to interpret abdominal ultrasound?",
        "What imaging is best for joint problems?",
        "How to identify kidney stones on CT?",
        "What are the signs of appendicitis on imaging?"
      ],
      'lab': [
        "How to interpret CBC results?",
        "What do elevated liver enzymes mean?",
        "How to read lipid panel results?",
        "What are normal kidney function values?",
        "How to interpret thyroid function tests?",
        "What does high CRP indicate?",
        "How to read blood glucose levels?",
        "What are normal electrolyte ranges?",
        "How to interpret cardiac enzyme results?",
        "What does elevated troponin mean?"
      ],
      'general': [
        "What are the symptoms of diabetes?",
        "How can I lower my blood pressure?",
        "What causes frequent headaches?",
        "What should I do if I have a fever?",
        "What are the side effects of paracetamol?",
        "How do I know if I have COVID-19?",
        "What is a normal heart rate?",
        "How much sleep do adults need?",
        "What are the signs of a heart attack?",
        "How can I treat a cold at home?"
      ]
    };
    return defaultFaqs[capability as keyof typeof defaultFaqs] || defaultFaqs.general;
  };

  // Fetch FAQs when FAQ dropdown is opened
  const handleFaqDropdownToggle = () => {
    const newShowState = !showFaqDropdown;
    setShowFaqDropdown(newShowState);
    
    if (newShowState && selectedCapability && currentSessionId) {
      fetchDynamicFaqs(selectedCapability, currentSessionId);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!showProfileDropdown && !showFaqDropdown && !showMoreOptionsDropdown) return;
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (faqDropdownRef.current && !faqDropdownRef.current.contains(event.target as Node)) {
        setShowFaqDropdown(false);
      }
      if (moreOptionsDropdownRef.current && !moreOptionsDropdownRef.current.contains(event.target as Node)) {
        setShowMoreOptionsDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileDropdown, showFaqDropdown, showMoreOptionsDropdown]);

  // Get capability-specific prompts (now using dynamic FAQs)
  const getCapabilityPrompts = (capability: string | null) => {
    if (dynamicFaqs.length > 0) {
      return dynamicFaqs;
    }
    // Fallback to default FAQs
    return getDefaultFaqs(capability || 'general');
  };

  const getCapabilityLabel = (capability: string | null) => {
    switch (capability) {
      case 'radiology': return 'Radiology';
      case 'lab': return 'Lab Interpretation';
      case 'general': 
      default: return 'Medical';
    }
  };

  return (
    <>
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="container mx-auto px-6 py-4 max-w-7xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex items-center space-x-4 min-w-[200px]">
                <div className="relative">
                  <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center shadow-lg">
                    <Stethoscope className="h-6 w-6 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                    MedChat Pro
                  </h1>
                  <p className="text-xs text-gray-500 font-medium">Healthcare AI Assistant</p>
                </div>
                {capabilityInfo && (
                  <div className="flex items-center space-x-2">
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${capabilityInfo.bgColor} ${capabilityInfo.color}`}>
                      {capabilityInfo.name}
                    </div>
                    {selectedCapability && selectedCapability !== 'engagement' && onSelectPrompt && (
                      <div className="relative" ref={faqDropdownRef}>
                        <button
                          onClick={handleFaqDropdownToggle}
                          className="flex items-center px-2 py-2 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                          title={getCapabilityLabel(selectedCapability)}
                        >
                          {/*<HelpCircle size={14} className="mr-1" />*/}
                          FAQs
                          <ChevronDown size={14} className="ml-1" />
                        </button>
                        
                        {showFaqDropdown && (
                          <div className="absolute left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                            <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                              <div>
                                <h3 className="text-sm font-medium text-gray-800">{getCapabilityLabel(selectedCapability)}</h3>
                                <p className="text-xs text-gray-500 mt-1">Click any question to add it to your chat</p>
                              </div>
                              <button
                                onClick={() => selectedCapability && currentSessionId && fetchDynamicFaqs(selectedCapability, currentSessionId)}
                                disabled={isLoadingFaqs}
                                className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Refresh FAQs"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </button>
                            </div>
                            <div className="p-2 space-y-1">
                              {isLoadingFaqs ? (
                                <div className="text-center py-4 text-gray-500">Loading FAQs...</div>
                              ) : (
                                getCapabilityPrompts(selectedCapability).map((prompt, index) => (
                                  <button
                                    key={index}
                                    onClick={() => {
                                      setShowFaqDropdown(false);
                                      onSelectPrompt(prompt);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded flex items-start transition-colors"
                                  >
                                    <PlusCircle size={14} className="mr-2 mt-0.5 flex-shrink-0 text-gray-400" />
                                    <span>{prompt}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Session Dropdown and New Session Button aligned with chat window */}
              <div className="flex-grow flex items-center" style={{ marginLeft: 0 }}>
                <div className="relative" ref={dropdownRef}>
                  <div className="inline-block relative">
                    <button
                      className="px-3 py-1 rounded text-sm font-medium border bg-gray-100 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center"
                      type="button"
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      Chats
                      <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {showDropdown && (
                      <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow-lg z-10">
                        {sessions.map((session) => (
                          <div key={session.id} className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-primary-50 ${currentSessionId === session.id ? 'bg-primary-100' : ''}`}
                            onClick={() => handleSessionSwitch(session.id)}
                          >
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="truncate text-sm font-medium">{getSessionTopic(session)}</span>
                              {getSessionCapability && (
                                <span className="text-xs text-gray-500">{getSessionCapability(session.id)}</span>
                              )}
                            </div>
                            {sessions.length > 1 && (
                              <button
                                className="ml-2 p-1 text-gray-400 hover:text-red-600 flex-shrink-0"
                                onClick={e => { e.stopPropagation(); handleDeleteSession(session.id); }}
                                title="Delete session"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="ml-2 px-3 py-1 rounded text-sm font-medium bg-green-500 text-white hover:bg-green-600"
                  onClick={handleNewSession}
                >
                  + New Chat
                </button>
                {children}
              </div>
            </div>
            <nav>
              <ul className="flex space-x-2 items-center">
                <li className="relative">
                  <div ref={moreOptionsDropdownRef}>
                    <button
                      onClick={() => setShowMoreOptionsDropdown(!showMoreOptionsDropdown)}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                      title="More options"
                    >
                      <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    
                    {showMoreOptionsDropdown && (
                      <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                        <button
                          onClick={() => {
                            setShowMoreOptionsDropdown(false);
                            setShowAboutModal(true);
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="blue" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          About
                        </button>
                        <button
                          onClick={() => {
                            setShowMoreOptionsDropdown(false);
                            setShowPrivacyModal(true);
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="red" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Privacy
                        </button>
                        <button
                          onClick={() => {
                            setShowMoreOptionsDropdown(false);
                            setShowHelpModal(true);
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="green" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Help
                        </button>
                      </div>
                    )}
                  </div>
                </li>
                <li className="relative">
                  <div ref={profileDropdownRef}>
                    <button
                      onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                      title={isAuthenticated ? "Profile" : "Login / Sign Up"}
                    >
                      <User size={18} className="text-gray-600" />
                    </button>
                    
                    {showProfileDropdown && (
                      <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                        {isAuthenticated ? (
                          <>
                            <div className="px-4 py-2 border-b border-gray-100">
                              <p className="text-sm font-medium text-gray-700">Logged In</p>
                              <p className="text-xs text-gray-500">Healthcare Professional</p>
                            </div>
                            <button
                              onClick={() => {
                                setShowProfileDropdown(false);
                                onLogout && onLogout();
                              }}
                              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <LogOut size={16} className="mr-2" />
                              Logout
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="px-4 py-2 border-b border-gray-100">
                              <p className="text-sm font-medium text-gray-700">Access Your Account</p>
                              <p className="text-xs text-gray-500">Sign in or create an account</p>
                            </div>
                            <button
                              onClick={() => {
                                setShowProfileDropdown(false);
                                onNavigateToLogin && onNavigateToLogin();
                              }}
                              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <LogIn size={16} className="mr-2" />
                              Login
                            </button>
                            <button
                              onClick={() => {
                                setShowProfileDropdown(false);
                                onNavigateToSignup && onNavigateToSignup();
                              }}
                              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <UserPlus size={16} className="mr-2" />
                              Sign Up
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </header>

      {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
    </>
  );
};

export default Header;