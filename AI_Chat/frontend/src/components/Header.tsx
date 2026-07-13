import React, { useState, useRef, useEffect } from 'react';
import { Activity, Trash2, User, LogIn, UserPlus, LogOut, ChevronDown, HelpCircle, PlusCircle, Award, Brain, TestTube, Users, MessageSquare, FileText, Image as ImageIcon, BarChart3, LayoutDashboard, Calendar, Scan, CreditCard, FileText as FileTextIcon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import AboutModal from './AboutModal';
import PrivacyModal from './PrivacyModal';
import HelpModal from './HelpModal';
import UsageStatisticsModal from './UsageStatisticsModal';
import { doctorService } from '../services/doctorService';
import { getApiBaseUrl } from '../utils/apiBase';
import SydneyLocationSelector from './ui/SydneyLocationSelector';

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
    /** When set, title is shown in dashboard style (bold title + subtitle + left divider) like General Practitioner Dashboard */
    subtitle?: string;
  };
  onNavigateToLogin?: () => void;
  onNavigateToSignup?: () => void;
  onLogout?: () => void;
  isAuthenticated?: boolean;
  onSelectPrompt?: (prompt: string) => void;
  selectedCapability?: string | null;
  /** When true, hide Chats dropdown and + New Chat in header (e.g. when shown in a left sidebar) */
  hideSessionControls?: boolean;
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
  selectedCapability,
  hideSessionControls = false
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showFaqDropdown, setShowFaqDropdown] = useState(false);
  const [showMoreOptionsDropdown, setShowMoreOptionsDropdown] = useState(false);
  const [dynamicFaqs, setDynamicFaqs] = useState<string[]>([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(false);
  const [showUsageStats, setShowUsageStats] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userSubtitle, setUserSubtitle] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const faqDropdownRef = useRef<HTMLDivElement>(null);
  const moreOptionsDropdownRef = useRef<HTMLDivElement>(null);

  // Load current doctor / user info when on radiology/lab (hideSessionControls) so we can show name + role like general page
  useEffect(() => {
    if (!hideSessionControls || !isAuthenticated) {
      setUserDisplayName(null);
      setUserSubtitle(null);
      return;
    }
    setLoadingUser(true);
    doctorService.getCurrentDoctor().then((result) => {
      if (result.success && result.doctor) {
        const name = `${result.doctor.first_name} ${result.doctor.last_name}`.trim() || 'User';
        setUserDisplayName(name);
        setUserSubtitle(result.doctor.specialty_name || 'Healthcare Professional');
      } else {
        const email = sessionStorage.getItem('userEmail') || '';
        setUserDisplayName(email || 'Logged In');
        setUserSubtitle('Healthcare Professional');
      }
    }).catch(() => {
      const email = sessionStorage.getItem('userEmail') || '';
      setUserDisplayName(email || 'Logged In');
      setUserSubtitle('Healthcare Professional');
    }).finally(() => {
      setLoadingUser(false);
    });
  }, [hideSessionControls, isAuthenticated]);

  // Fetch dynamic FAQs when capability changes or FAQ dropdown is opened
  const fetchDynamicFaqs = async (capability: string, sessionId: string) => {
    if (!capability || !sessionId) return;
    
    setIsLoadingFaqs(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/faqs/generate`, {
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
      <header className="app-topbar sticky top-0 z-40">
        <div className="w-full px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex min-w-[220px] items-center gap-3">
                <div className="brand-mark flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-black text-white">
                  AH
                </div>
                <div className="min-w-0">
                  <h1 className="brand-title truncate text-xl font-extrabold">
                    Acufore Health
                  </h1>
                  <p className="text-xs font-semibold text-slate-500">Healthcare Management</p>
                </div>
                {capabilityInfo && (
                  <div className="flex min-w-0 items-center gap-2">
                    {capabilityInfo.subtitle ? (
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="hidden h-11 w-px flex-shrink-0 bg-slate-200 lg:block" />
                        <div className="min-w-0">
                          <h1 className="truncate text-xl font-extrabold text-slate-100">{capabilityInfo.name}</h1>
                          <p className="mt-0.5 truncate text-sm font-medium text-slate-400">{capabilityInfo.subtitle}</p>
                        </div>
                      </div>
                    ) : (
                      <div className={`status-pill ${capabilityInfo.bgColor} ${capabilityInfo.color}`}>
                        {capabilityInfo.name}
                      </div>
                    )}
                    {!hideSessionControls && selectedCapability && selectedCapability !== 'engagement' && onSelectPrompt && (
                      <div className="relative" ref={faqDropdownRef}>
                        <button
                          onClick={handleFaqDropdownToggle}
                          className="ghost-button flex items-center px-3 py-2 text-sm font-semibold"
                          title={getCapabilityLabel(selectedCapability)}
                        >
                          {/*<HelpCircle size={14} className="mr-1" />*/}
                          FAQs
                          <ChevronDown size={18} className="ml-1" />
                        </button>
                        
                        {showFaqDropdown && (
                          <div className="faq-dropdown-panel absolute left-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl">
                            <div className="flex items-center justify-between border-b border-slate-600 p-3">
                              <div>
                                <h3 className="text-sm font-bold text-slate-100">{getCapabilityLabel(selectedCapability)}</h3>
                                <p className="mt-1 text-xs text-slate-400">Click any question to add it to your chat</p>
                              </div>
                              <button
                                onClick={() => selectedCapability && currentSessionId && fetchDynamicFaqs(selectedCapability, currentSessionId)}
                                disabled={isLoadingFaqs}
                                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Refresh FAQs"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </button>
                            </div>
                            <div className="space-y-1 p-2">
                              {isLoadingFaqs ? (
                                <div className="py-4 text-center text-slate-500">Loading FAQs...</div>
                              ) : (
                                getCapabilityPrompts(selectedCapability).map((prompt, index) => (
                                  <button
                                    key={index}
                                    onClick={() => {
                                      setShowFaqDropdown(false);
                                      onSelectPrompt(prompt);
                                    }}
                                    className="flex w-full items-start rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-sky-500/10 hover:text-slate-100"
                                  >
                                    <PlusCircle size={14} className="mr-2 mt-0.5 flex-shrink-0 text-sky-400" />
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
              {/* Patient Portal Link (hidden on radiology/lab when session controls are in sidebar) */}
              {!hideSessionControls && (
              <div className="flex items-center gap-2 lg:mx-2">
                <button
                  onClick={() => navigate('/portal/dashboard')}
                  className="healthcare-button flex items-center gap-2 px-4 py-2 text-sm"
                  title="Go to Patient Portal"
                >
                  <LayoutDashboard size={16} />
                  Patient Portal
                </button>
              </div>
              )}
              {/* Session Dropdown and New Session Button (hidden when session controls are in sidebar) */}
              {!hideSessionControls && (
              <div className="flex flex-grow items-center">
                <div className="relative" ref={dropdownRef}>
                  <div className="inline-block relative">
                    <button
                      className="ghost-button flex items-center px-3 py-2 text-sm font-semibold"
                      type="button"
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      Chats
                      <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {showDropdown && (
                      <div className="dropdown-menu premium-card absolute left-0 z-50 mt-2 max-h-[20rem] w-72 overflow-y-auto rounded-xl py-1">
                        {sessions.map((session) => (
                          <div key={session.id} className={`flex cursor-pointer items-center justify-between px-3 py-2.5 hover:bg-slate-800/80 ${currentSessionId === session.id ? 'bg-sky-500/15' : ''}`}
                            onClick={() => handleSessionSwitch(session.id)}
                          >
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="truncate text-sm font-semibold text-slate-100">{getSessionTopic(session)}</span>
                              {getSessionCapability && (
                                <span className="text-xs text-slate-400">{getSessionCapability(session.id)}</span>
                              )}
                            </div>
                            {sessions.length > 1 && (
                              <button
                                className="ml-2 shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-500/15 hover:text-red-300"
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
                  className="ml-3 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
                  onClick={handleNewSession}
                >
                  + New Chat
                </button>
                {children}
              </div>
              )}
            </div>
            <nav>
              <ul className="flex items-center gap-2">
                <li>
                  <SydneyLocationSelector compact showLabel={false} />
                </li>
                <li className="relative">
                  <div ref={moreOptionsDropdownRef}>
                    <button
                      onClick={() => setShowMoreOptionsDropdown(!showMoreOptionsDropdown)}
                      className="ghost-button flex h-10 w-10 items-center justify-center rounded-xl"
                      title="More options"
                    >
                      <svg className="h-4 w-4 text-slate-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    
                    {showMoreOptionsDropdown && (
                      <div className="dropdown-menu premium-card absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreOptionsDropdown(false);
                            setShowAboutModal(true);
                          }}
                          className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
                        >
                          <svg className="mr-2 h-4 w-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          About
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreOptionsDropdown(false);
                            setShowPrivacyModal(true);
                          }}
                          className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
                        >
                          <svg className="mr-2 h-4 w-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Privacy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreOptionsDropdown(false);
                            setShowHelpModal(true);
                          }}
                          className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
                        >
                          <svg className="mr-2 h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      className={`flex items-center gap-2 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--portal-accent)] focus:ring-offset-2 focus:ring-offset-slate-900 ${
                        userDisplayName
                          ? 'space-x-3 border border-slate-600/80 bg-slate-800/60 px-3 py-2 hover:bg-slate-700/70'
                          : 'ghost-button h-10 w-10 justify-center'
                      }`}
                      title={isAuthenticated ? "Profile" : "Login / Sign Up"}
                    >
                      <div className={`flex shrink-0 items-center justify-center rounded-full ${userDisplayName ? 'h-10 w-10 border border-sky-500/30 bg-sky-500/15' : 'h-8 w-8 bg-slate-800'}`}>
                        <User size={userDisplayName ? 24 : 18} className={userDisplayName ? 'text-sky-300' : 'text-slate-400'} />
                      </div>
                      {userDisplayName && (
                        <div className="hidden text-left sm:block">
                          <p className="text-sm font-bold text-slate-100">
                            {loadingUser ? 'Loading...' : userDisplayName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {loadingUser ? '' : (userSubtitle || 'Healthcare Professional')}
                          </p>
                        </div>
                      )}
                      {userDisplayName && <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`} />}
                    </button>
                    
                    {showProfileDropdown && (
                      <div className="dropdown-menu premium-card absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl py-1">
                        {isAuthenticated ? (
                          <>
                            <div className="border-b border-slate-700/50 px-4 py-3">
                              <p className="text-sm font-bold text-slate-100">
                                {userDisplayName || 'Logged In'}
                              </p>
                              <p className="text-xs text-slate-400">
                                {userSubtitle || 'Healthcare Professional'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowProfileDropdown(false);
                                setShowUsageStats(true);
                              }}
                              className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
                            >
                              <BarChart3 size={16} className="mr-2 text-sky-400" />
                              Usage Statistics
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowProfileDropdown(false);
                                onLogout && onLogout();
                              }}
                              className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-red-500/15 hover:text-red-300"
                            >
                              <LogOut size={16} className="mr-2" />
                              Logout
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="border-b border-slate-700/50 px-4 py-3">
                              <p className="text-sm font-bold text-slate-100">Access Your Account</p>
                              <p className="text-xs text-slate-400">Sign in or create an account</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowProfileDropdown(false);
                                onNavigateToLogin && onNavigateToLogin();
                              }}
                              className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
                            >
                              <LogIn size={16} className="mr-2 text-sky-400" />
                              Login
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowProfileDropdown(false);
                                onNavigateToSignup && onNavigateToSignup();
                              }}
                              className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
                            >
                              <UserPlus size={16} className="mr-2 text-sky-400" />
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
      {showUsageStats && (
        <UsageStatisticsModal
          isOpen={showUsageStats}
          onClose={() => setShowUsageStats(false)}
          userEmail={sessionStorage.getItem('userEmail') || ''}
        />
      )}
    </>
  );
};

export default Header;
