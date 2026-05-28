/**
 * Patient Portal Layout Component
 * Separate layout for patient portal features (dashboard, appointments, etc.)
 * This is distinct from the Patient Engagement chat interface
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Scan, FileText, CreditCard,
  User, Users, LogOut, X, Stethoscope, Building2, Minus, Maximize2, Bell, ChevronDown
}from 'lucide-react';
import AiAssistantIcon from '../assets/ai_assistant_icon.png';  
import PatientDashboard from './patient/PatientDashboard';
import PatientProfile from './patient/PatientProfile';
import FamilyMembers from './patient/FamilyMembers';
import Doctors from './patient/Doctors';
import Facilities from './patient/Facilities';
import AppointmentList from './appointments/AppointmentList';
import AppointmentBooking from './appointments/AppointmentBooking';
import RadiologyBooking from './radiology/RadiologyBooking';
import RadiologyList from './radiology/RadiologyList';
import MedicalRecords from './records/MedicalRecords';
import BillingDashboard from './billing/BillingDashboard';
import PatientPortalChat from './patient/PatientPortalChat';
import Notifications from './patient/Notifications';
import { patientService } from '../services/patientService';
import { notificationService, Notification } from '../services/notificationService';


const PatientPortalLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen] = useState(true);
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
    loadNotifications();
    
    // Start polling for new notifications every 10 seconds
    pollingIntervalRef.current = window.setInterval(() => {
      checkForNewNotifications();
    }, 10000);
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

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
    { path: '/portal/doctors', icon: Stethoscope, label: 'Doctors' },
    { path: '/portal/facilities', icon: Building2, label: 'Facilities' },
    { path: '/portal/appointments', icon: Calendar, label: 'Appointments' },
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

  return (
    <div className="app-shell flex h-screen flex-col text-slate-900">
      {/* Top Header Bar */}
      <div className="app-topbar z-30">
        <div className="flex flex-col lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white">AH</div>
              <div>
              <h1 className="brand-title text-xl font-extrabold">Acufore Health</h1>
              <p className="text-xs font-semibold text-slate-500">Healthcare Management</p>
              </div>
          </div>
          <div className="hidden h-12 w-px bg-slate-200 lg:block"></div>
          <div className="mx-auto flex-1 px-4 pb-4 sm:px-6 lg:px-8 lg:py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Patient Portal</p>
                <h1 className="truncate text-xl font-extrabold text-slate-950 sm:text-2xl">{getWelcomeMessage()}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Patient ID: <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{patientId || 'Loading...'}</span>
                </p>
              </div>
              {/* Top Right: Notifications and Profile */}
              <div className="flex items-center gap-3">
                {/* Notification Bell Button */}
                <button
                  onClick={() => navigate('/portal/notifications')}
                  className="ghost-button relative flex h-11 w-11 items-center justify-center rounded-xl"
                  title={`${unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications'}`}
                >
                  <Bell size={20} className="text-slate-700" />
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
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/75 px-3 py-2 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-teal-100">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                      {loadingPatient ? (
                        <div className="text-left hidden sm:block">
                          <div className="skeleton-line mb-1 h-4 w-24 rounded"></div>
                          <div className="skeleton-line h-3 w-32 rounded"></div>
                        </div>
                      ) : (
                        <div className="text-left hidden sm:block">
                          <p className="text-sm font-bold text-slate-900">
                            {patientFirstName && patientLastName
                              ? `${patientFirstName} ${patientLastName}`
                              : patientFirstName || 'Patient'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {patientEmail || 'No email'}
                          </p>
            </div>
          )}
                    </div>
                    <ChevronDown 
                      className={`w-4 h-4 text-gray-500 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
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
                          <div className="border-b border-slate-100 px-4 py-3 sm:hidden">
                            <p className="text-sm font-bold text-slate-900">
                              {patientFirstName && patientLastName
                                ? `${patientFirstName} ${patientLastName}`
                                : patientFirstName || 'Patient'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {patientEmail || 'No email'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              navigate('/portal/profile');
                              setShowProfileMenu(false);
                            }}
                            className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-blue-50"
                          >
                            <User className="w-4 h-4 mr-2" />
                            View Profile
                          </button>
          <button
                            onClick={() => {
                              handleLogout();
                              setShowProfileMenu(false);
                            }}
                            className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700"
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
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-60' : 'w-20'} sidebar-surface hidden flex-col transition-all duration-300 md:flex`}>
        <nav className="flex-1 space-y-1.5 p-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path === '/portal/appointments' && location.pathname.startsWith('/portal/appointments')) ||
              (item.path === '/portal/radiology' && location.pathname.startsWith('/portal/radiology')) ||
              (item.path === '/portal/doctors' && location.pathname.startsWith('/portal/doctors')) ||
              (item.path === '/portal/facilities' && location.pathname.startsWith('/portal/facilities')) ||
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

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Main Content Area */}
        <div className="relative flex-1 overflow-auto">
          {location.pathname === '/portal/dashboard' || location.pathname === '/portal' ? (
            <PatientDashboard />
          ) : location.pathname === '/portal/profile' ? (
            <PatientProfile />
          ) : location.pathname === '/portal/family' ? (
            <FamilyMembers />
          ) : location.pathname === '/portal/doctors' ? (
            <Doctors />
          ) : location.pathname === '/portal/facilities' ? (
            <Facilities />
          ) : location.pathname === '/portal/appointments/book' ? (
            <AppointmentBooking />
          ) : location.pathname === '/portal/appointments' ? (
            <AppointmentList />
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

          {/* Floating AI Chat Button */}
        {!showChat && (
          <button
          onClick={() => {
            setShowChat(true);
            setIsMinimized(false);
          }}
          className="fixed bottom-1 right-8 z-50 items-center hover:scale-110 transition-all duration-300"
        >
          <img
            src={AiAssistantIcon}
            alt="AI Assistant"
            className="h-16 w-16 rounded-full border-2 border-white drop-shadow-xl transition-all duration-200 hover:scale-105"
          />
          <span className="mt-2 block text-sm font-extrabold text-slate-900 transition-colors duration-200 hover:text-blue-700">
            Assistant
          </span>
        </button>        
        )}

        {/* Chat Window - Always mounted to preserve state across navigation */}
        <>
          {/* Overlay - only show when chat is open and not minimized */}
          {showChat && !isMinimized && (
            <div
              className="fixed inset-0 bg-black bg-opacity-30 z-40"
              onClick={() => setIsMinimized(true)}
            />
          )}

          {/* Chat Widget - always mounted but conditionally visible */}
          <div
            className={`fixed bottom-0 right-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border border-slate-200 shadow-2xl transition-all duration-300
              ${!showChat ? 'hidden' : ''}
              ${isMinimized 
                ? 'h-[56px] w-[300px] cursor-pointer bg-blue-50' 
                : 'h-[600px] w-[400px] bg-white'}
            `}
            onClick={() => isMinimized && setIsMinimized(false)}
          >
            {/* Header */}
            <div className={`flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-50 to-teal-50 ${
              isMinimized ? 'px-4 py-2' : 'p-4'
            }`}>
              <h2 className="text-sm font-semibold">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 transition-all duration-200 hover:bg-blue-200 hover:text-blue-900 hover:shadow-md hover:scale-105">
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Stethoscope size={14} className="text-white" />
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
                  className="rounded-lg p-1 text-slate-600 transition-colors hover:bg-white hover:text-blue-700"
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
                    className="rounded-lg p-1 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
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

        {/* Notification Popup */}
        {showNotificationPopup && currentNotification && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="premium-card w-full max-w-md p-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{currentNotification.title}</h3>
                    <p className="text-xs text-slate-500">
                      {new Date(currentNotification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleNotificationClose}
                  className="text-slate-400 transition-colors hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
              
              <p className="mb-6 text-slate-700">{currentNotification.message}</p>
              
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
    </div>
  );
};

export default PatientPortalLayout;
