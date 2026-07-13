/**
 * Patient Portal Layout Component
 * Separate layout for patient portal features (dashboard, appointments, etc.)
 * This is distinct from the Patient Engagement chat interface
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Scan, FileText, CreditCard,
  User, Users, LogOut, X, Stethoscope, Building2, Minus, Maximize2, Bell, ChevronDown, Menu, Video, Pill, Sparkles
} from 'lucide-react';
import AiAssistantIcon from '../assets/ai_assistant_icon.png';  
import PatientDashboard from './patient/PatientDashboard';
import PatientProfile from './patient/PatientProfile';
import FamilyMembers from './patient/FamilyMembers';
import Doctors from './patient/Doctors';
import Facilities from './patient/Facilities';
import Pharmacies from './patient/Pharmacies';
import AppointmentList from './appointments/AppointmentList';
import AppointmentBooking from './appointments/AppointmentBooking';
import RadiologyBooking from './radiology/RadiologyBooking';
import RadiologyList from './radiology/RadiologyList';
import MedicalRecords from './records/MedicalRecords';
import BillingDashboard from './billing/BillingDashboard';
import PatientPortalChat from './patient/PatientPortalChat';
import Notifications from './patient/Notifications';
import TelemedicineLobby from './telemedicine/TelemedicineLobby';
import TelemedicineRoom from './telemedicine/TelemedicineRoom';
import EngagementHub from './patient/EngagementHub';
import SDOHScreening from './patient/SDOHScreening';
import DecisionAidFlow from './patient/DecisionAidFlow';
import { resolveTelemedicineVisitId } from '../services/telemedicinePeerService';
import { patientService } from '../services/patientService';
import { notificationService, Notification } from '../services/notificationService';
import { isAuthenticated } from '../services/authService';
import SydneyLocationSelector from './ui/SydneyLocationSelector';

const PatientPortalLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Persist chat visibility state across navigation
  const [showChat, setShowChat] = useState(() => {
    const saved = sessionStorage.getItem('patient_portal_chat_visible');
    return saved === 'true';
  });
  const [isMinimized, setIsMinimized] = useState(() => {
    const saved = sessionStorage.getItem('patient_portal_chat_minimized');
    return saved === 'true';
  });
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [patientFirstName, setPatientFirstName] = useState('');
  const [patientLastName, setPatientLastName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientId, setPatientId] = useState('');
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  // Notification state
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);
  const [notificationAuthFailed, setNotificationAuthFailed] = useState(false);
  const lastNotificationIdRef = useRef<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const chatRef = React.useRef<{ clearMessages: () => void } | null>(null);

  // Persist chat state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('patient_portal_chat_visible', String(showChat));
  }, [showChat]);

  useEffect(() => {
    sessionStorage.setItem('patient_portal_chat_minimized', String(isMinimized));
  }, [isMinimized]);

  useEffect(() => {
    loadPatientName();
    if (isAuthenticated()) {
      loadNotifications();
    } else {
      setNotificationAuthFailed(true);
    }
    
    // Start polling for new notifications every 10 seconds
    if (!notificationAuthFailed && isAuthenticated()) {
      pollingIntervalRef.current = window.setInterval(() => {
        checkForNewNotifications();
      }, 10000);
    }
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [notificationAuthFailed]);

  const loadPatientName = async () => {
    setLoadingPatient(true);
    try {
      const result = await patientService.getProfile();
      if (result.success && result.patient) {
        setPatientFirstName(result.patient.first_name || '');
        setPatientLastName(result.patient.last_name || '');
        setPatientEmail(result.patient.email || '');
        setPatientId(result.patient.patient_id || '');
      }
    } catch (error) {
      console.error('Error loading patient name:', error);
    } finally {
      setLoadingPatient(false);
    }
  };

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);

  const loadNotifications = async () => {
    try {
      const result = await notificationService.getNotifications(false);
      if (result.unauthorized) {
        setNotificationAuthFailed(true);
        setUnreadCount(0);
        return;
      }
      if (result.success && result.notifications) {
        const unread = result.notifications.filter(n => !n.is_read);
        setUnreadCount(unread.length);
        
        // Set the last notification ID to track new ones
        if (result.notifications.length > 0) {
          lastNotificationIdRef.current = result.notifications[0].notification_id;
        }
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const checkForNewNotifications = async () => {
    try {
      const result = await notificationService.getNotifications(true); // Only unread
      if (result.unauthorized) {
        setNotificationAuthFailed(true);
        setUnreadCount(0);
        return;
      }
      if (result.success && result.notifications) {
        // Check if there are new notifications
        const newNotifications = result.notifications.filter(
          n => !lastNotificationIdRef.current || n.notification_id > lastNotificationIdRef.current
        );
        
        if (newNotifications.length > 0) {
          // Update unread count
          setUnreadCount(prev => prev + newNotifications.length);
          
          // Show popup for the most recent notification
          setCurrentNotification(newNotifications[0]);
          setShowNotificationPopup(true);
          
          // Update last notification ID
          lastNotificationIdRef.current = newNotifications[0].notification_id;
        }
      }
    } catch (error) {
      console.error('Error checking for new notifications:', error);
    }
  };

  const handleNotificationClose = async () => {
    if (currentNotification) {
      // Mark as read
      await notificationService.markAsRead(currentNotification.notification_id);
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    
    setShowNotificationPopup(false);
    setCurrentNotification(null);
  };

  const handleViewNotifications = () => {
    handleNotificationClose();
    navigate('/portal/notifications');
  };

  const handleLogout = () => {
    import('../services/authService').then((m) => m.clearAuth());
    navigate('/login');
  };

  const menuItems = [
    { path: '/portal/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/portal/profile', icon: User, label: 'Profile' },
    { path: '/portal/family', icon: Users, label: 'Your Family' },
    { path: '/portal/engagement', icon: Sparkles, label: 'Engagement Hub' },
    { path: '/portal/doctors', icon: Stethoscope, label: 'Doctors' },
    { path: '/portal/pharmacies', icon: Pill, label: 'Pharmacies' },
    { path: '/portal/facilities', icon: Building2, label: 'Facilities' },
    { path: '/portal/appointments', icon: Calendar, label: 'Appointments' },
    { path: '/portal/telemedicine', icon: Video, label: 'Telemedicine' },
    { path: '/portal/radiology', icon: Scan, label: 'Radiology' },
    { path: '/portal/records', icon: FileText, label: 'Medical Records' },
    { path: '/portal/billing', icon: CreditCard, label: 'Billing' },
  ];

  // Get welcome message - always shown in header
  const getWelcomeMessage = () => {
    return patientFirstName || patientLastName
      ? `Welcome, ${patientFirstName || ''} ${patientLastName || ''}!`.trim()
      : 'Welcome to Your Patient Portal!';
  };

  if (location.pathname.startsWith('/portal/telemedicine/visit/')) {
    const portalVisitId = resolveTelemedicineVisitId(location.pathname);
    return (
      <div className="h-screen" data-portal="patient">
        <TelemedicineRoom role="patient" visitId={portalVisitId} />
      </div>
    );
  }

  return (
    <div className="app-shell flex h-screen flex-col text-slate-100" data-portal="patient">
      {/* Top Header Bar */}
      <div className="app-topbar z-30">
        <div className="flex flex-col lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="mr-1 rounded-xl p-2 text-slate-400 hover:bg-slate-800 md:hidden"
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white">AH</div>
              <div>
              <h1 className="brand-title text-xl font-extrabold">Acufore Health</h1>
              <p className="text-xs font-semibold text-slate-400">Healthcare Management</p>
              </div>
          </div>
          <div className="hidden h-12 w-px bg-slate-600/50 lg:block"></div>
          <div className="mx-auto flex-1 px-4 pb-4 sm:px-6 lg:px-8 lg:py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-300">Patient Portal</p>
                <h1 className="truncate text-xl font-extrabold text-slate-100 sm:text-2xl">{getWelcomeMessage()}</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Patient ID: <span className="rounded-md bg-slate-800/80 px-2 py-0.5 font-mono text-xs font-semibold text-slate-200">{patientId || 'Loading...'}</span>
                </p>
              </div>
              {/* Top Right: Location, Notifications and Profile */}
              <div className="flex items-center gap-3">
                <SydneyLocationSelector compact showLabel={false} />
                {/* Notification Bell Button */}
                <button
                  onClick={() => navigate('/portal/notifications')}
                  className="ghost-button relative flex h-11 w-11 items-center justify-center rounded-xl"
                  title={`${unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications'}`}
                >
                  <Bell size={20} className="text-slate-300" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Profile/Account Info Container */}
                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="ghost-button flex items-center gap-3 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:ring-offset-2 focus:ring-offset-slate-900"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/30 to-sky-500/30 border border-teal-500/30">
                        <User className="w-6 h-6 text-teal-300" />
                      </div>
                      {loadingPatient ? (
                        <div className="text-left hidden sm:block">
                          <div className="skeleton-line mb-1 h-4 w-24 rounded"></div>
                          <div className="skeleton-line h-3 w-32 rounded"></div>
                        </div>
                      ) : (
                        <div className="text-left hidden sm:block">
                          <p className="text-sm font-bold text-slate-100">
                            {patientFirstName && patientLastName
                              ? `${patientFirstName} ${patientLastName}`
                              : patientFirstName || 'Patient'}
                          </p>
                          <p className="text-xs text-slate-400">
                            {patientEmail || 'No email'}
                          </p>
            </div>
          )}
                    </div>
                    <ChevronDown 
                      className={`w-4 h-4 text-slate-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Profile Dropdown Menu */}
                  {showProfileMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowProfileMenu(false)}
                      />
                      <div className="premium-card absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl">
                        <div className="py-1">
                          <div className="border-b border-slate-700/50 px-4 py-3 sm:hidden">
                            <p className="text-sm font-bold text-slate-100">
                              {patientFirstName && patientLastName
                                ? `${patientFirstName} ${patientLastName}`
                                : patientFirstName || 'Patient'}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {patientEmail || 'No email'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              navigate('/portal/profile');
                              setShowProfileMenu(false);
                            }}
                            className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
                          >
                            <User className="w-4 h-4 mr-2" />
                            View Profile
                          </button>
          <button
                            onClick={() => {
                              handleLogout();
                              setShowProfileMenu(false);
                            }}
                            className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-red-500/15 hover:text-red-300"
          >
                            <LogOut className="w-4 h-4 mr-2" />
                            Logout
          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
        )}

        {/* Sidebar - desktop */}
        <div className={`${sidebarOpen ? 'w-60' : 'w-20'} sidebar-surface hidden flex-col transition-all duration-300 md:flex`}>
        <nav className="flex-1 space-y-1.5 p-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path === '/portal/appointments' && location.pathname.startsWith('/portal/appointments')) ||
              (item.path === '/portal/radiology' && location.pathname.startsWith('/portal/radiology')) ||
              (item.path === '/portal/doctors' && location.pathname.startsWith('/portal/doctors')) ||
              (item.path === '/portal/pharmacies' && location.pathname.startsWith('/portal/pharmacies')) ||
              (item.path === '/portal/facilities' && location.pathname.startsWith('/portal/facilities')) ||
              (item.path === '/portal/telemedicine' && location.pathname.startsWith('/portal/telemedicine')) ||
              (item.path === '/portal/engagement' && location.pathname.startsWith('/portal/engagement')) ||
              (item.path === '/portal/notifications' && location.pathname === '/portal/notifications');

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`sidebar-link relative flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold ${
                  isActive 
                    ? 'sidebar-link-active' 
                    : ''
                }`}
              >
                <Icon size={20} />
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

        {/* Sidebar - mobile drawer */}
        <div
          className={`sidebar-surface fixed inset-y-0 left-0 z-50 flex w-72 flex-col transition-transform duration-300 md:hidden ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-teal-300">Patient Portal</p>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
          </div>
          <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                (item.path === '/portal/appointments' && location.pathname.startsWith('/portal/appointments')) ||
                (item.path === '/portal/radiology' && location.pathname.startsWith('/portal/radiology')) ||
                (item.path === '/portal/doctors' && location.pathname.startsWith('/portal/doctors')) ||
                (item.path === '/portal/pharmacies' && location.pathname.startsWith('/portal/pharmacies')) ||
                (item.path === '/portal/facilities' && location.pathname.startsWith('/portal/facilities')) ||
                (item.path === '/portal/telemedicine' && location.pathname.startsWith('/portal/telemedicine'));

              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMobileNavOpen(false);
                  }}
                  className={`sidebar-link relative flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold ${
                    isActive ? 'sidebar-link-active' : ''
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Main Content Area */}
        <div className="patient-portal-page relative flex-1 overflow-auto animate-fade-in-up" data-portal="patient">
          {location.pathname === '/portal/dashboard' || location.pathname === '/portal' ? (
            <PatientDashboard />
          ) : location.pathname === '/portal/profile' ? (
            <PatientProfile />
          ) : location.pathname === '/portal/family' ? (
            <FamilyMembers />
          ) : location.pathname === '/portal/engagement/sdoh' ? (
            <SDOHScreening />
          ) : location.pathname === '/portal/engagement/decisions' ? (
            <DecisionAidFlow />
          ) : location.pathname === '/portal/engagement' ? (
            <EngagementHub />
          ) : location.pathname === '/portal/doctors' ? (
            <Doctors />
          ) : location.pathname === '/portal/pharmacies' ? (
            <Pharmacies />
          ) : location.pathname === '/portal/facilities' ? (
            <Facilities />
          ) : location.pathname === '/portal/appointments/book' ? (
            <AppointmentBooking />
          ) : location.pathname === '/portal/appointments' ? (
            <AppointmentList />
          ) : location.pathname === '/portal/telemedicine' ? (
            <TelemedicineLobby />
          ) : location.pathname === '/portal/radiology/book' ? (
            <RadiologyBooking />
          ) : location.pathname === '/portal/radiology' ? (
            <RadiologyList />
          ) : location.pathname === '/portal/records' ? (
            <MedicalRecords />
          ) : location.pathname === '/portal/billing' ? (
            <BillingDashboard />
          ) : location.pathname === '/portal/notifications' ? (
            <Notifications />
          ) : (
            <PatientDashboard />
          )}
        </div>

        {/* Floating assistant — outside scroll area so position:fixed stays on viewport */}
        {!showChat && (
          <button
            type="button"
            onClick={() => {
              setShowChat(true);
              setIsMinimized(false);
            }}
            className="fixed bottom-6 right-6 z-[60] flex flex-col items-center transition-transform duration-300 hover:scale-110"
            aria-label="Open AI Health Assistant"
          >
            <img
              src={AiAssistantIcon}
              alt=""
              className="h-16 w-16 rounded-full border-2 border-white drop-shadow-xl transition-transform duration-200 hover:scale-105"
            />
            <span className="mt-2 block text-sm font-extrabold text-slate-100 drop-shadow-md transition-colors duration-200 hover:text-teal-300">
              Assistant
            </span>
          </button>
        )}

        {/* Chat Window - Always mounted to preserve state across navigation */}
        <>
          {showChat && !isMinimized && (
            <div
              className="fixed inset-0 z-[55] bg-black/30"
              onClick={() => setIsMinimized(true)}
              aria-hidden
            />
          )}

          <div
            className={`fixed bottom-0 right-0 z-[60] flex flex-col overflow-hidden rounded-t-2xl border border-slate-200 shadow-2xl transition-all duration-300
              ${!showChat ? 'hidden' : ''}
              ${isMinimized
                ? 'h-[56px] w-[300px] cursor-pointer bg-slate-800/95'
                : 'h-[min(600px,85vh)] w-[min(400px,calc(100vw-1.5rem))] bg-slate-900/95 border border-slate-700/50'}
            `}
            onClick={() => isMinimized && setIsMinimized(false)}
          >
            {/* Header */}
            <div className={`flex items-center justify-between border-b border-slate-700/50 bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 ${
              isMinimized ? 'px-4 py-2' : 'p-4'
            }`}>
              <h2 className="text-sm font-semibold">
                <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/15 px-3 py-1 text-teal-100 transition-all duration-200 hover:bg-teal-500/25 hover:shadow-md hover:scale-105">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-sky-500">
                    <Stethoscope size={14} className="text-slate-950" />
                  </div>
                  {patientFirstName
                    ? `${patientFirstName}'s Assistant`
                    : 'AI Health Assistant'}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMinimized) {
                      setIsMinimized(false);
                    } else {
                      setIsMinimized(true);
                    }
                  }}
                  title={isMinimized ? "Maximize" : "Minimize"}
                  className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-teal-200"
                >
                  {isMinimized ? <Maximize2 size={18} /> : <Minus size={18} />}
                </button>

                {showChat && !isMinimized && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCloseConfirm(true);
                    }}
                    title="Close"
                    className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-red-500/20 hover:text-red-300"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* Chat Body - always render but conditionally visible */}
            <div
              className={`flex-1 overflow-hidden relative transition-opacity duration-200
                ${isMinimized ? 'opacity-0 pointer-events-none h-0' : 'opacity-100'}
              `}
            >
              <PatientPortalChat ref={chatRef} />

              {showCloseConfirm && (
                <div className="absolute inset-0 bg-white bg-opacity-95 flex items-center justify-center z-50">
                  <div className="premium-card p-6">
                    <p className="text-sm mb-4 text-center">
                      Closing will clear chat history. Continue?
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => setShowCloseConfirm(false)}
                        className="ghost-button px-4 py-2 text-sm font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          chatRef.current?.clearMessages();
                          setShowChat(false);
                          setShowCloseConfirm(false);
                        }}
                        className="healthcare-button px-4 py-2 text-sm"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>

        {showNotificationPopup && currentNotification && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="premium-card w-full max-w-md p-6 animate-fade-in-up">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/15 ring-1 ring-sky-500/30">
                    <Bell className="h-5 w-5 text-sky-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">{currentNotification.title}</h3>
                    <p className="text-xs text-slate-400">
                      {new Date(currentNotification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleNotificationClose}
                  className="text-slate-400 transition-colors hover:text-slate-200"
                >
                  <X size={20} />
                </button>
              </div>
              
              <p className="mb-6 text-sm leading-relaxed text-slate-300">{currentNotification.message}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={handleViewNotifications}
                  className="healthcare-button flex-1 px-4 py-2 text-sm"
                >
                  View Notifications
                </button>
                <button
                  onClick={handleNotificationClose}
                  className="ghost-button flex-1 px-4 py-2 text-sm font-semibold"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default PatientPortalLayout;
