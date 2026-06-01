/**
 * Notifications Component
 * Displays all notifications for the patient
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Calendar, Clock, ExternalLink, Trash2, X, User, MapPin } from 'lucide-react';
import { notificationService, Notification } from '../../services/notificationService';
import { appointmentService, Appointment } from '../../services/appointmentService';
import { getAppointmentStatusColor, getAppointmentStatusContainer } from '../../utils/appointmentStatusColors';
import {
  PortalPageShell,
  PortalPageHero,
  PortalLoading,
} from './portalPageLayout';

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [loadingAppointment, setLoadingAppointment] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const result = await notificationService.getNotifications(false);
      if (result.success && result.notifications) {
        setNotifications(result.notifications);
        const unread = result.notifications.filter(n => !n.is_read);
        setUnreadCount(unread.length);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      const result = await notificationService.markAsRead(notificationId);
      if (result.success) {
        setNotifications(prev =>
          prev.map(n =>
            n.notification_id === notificationId
              ? { ...n, is_read: true }
              : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const result = await notificationService.markAllAsRead();
      if (result.success) {
        setNotifications(prev =>
          prev.map(n => ({ ...n, is_read: true }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all notifications? This action cannot be undone.')) {
      try {
        const result = await notificationService.clearAllNotifications();
        if (result.success) {
          setNotifications([]);
          setUnreadCount(0);
        } else {
          alert(result.error || 'Failed to clear notifications');
        }
      } catch (error) {
        console.error('Error clearing notifications:', error);
        alert('Failed to clear notifications');
      }
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'appointment_update':
      case 'appointment_status':
        return <Calendar className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  const isAppointmentNotification = (notification: Notification): boolean => {
    return notification.notification_type === 'appointment_update' || 
           notification.notification_type === 'appointment_status';
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (isAppointmentNotification(notification)) {
      // Mark as read when clicked
      if (!notification.is_read) {
        handleMarkAsRead(notification.notification_id);
      }
      
      // If appointment_id is available, fetch and show appointment details
      if (notification.appointment_id) {
        setLoadingAppointment(true);
        try {
          const result = await appointmentService.getAppointment(notification.appointment_id);
          if (result.success && result.appointment) {
            setSelectedAppointment(result.appointment);
          } else {
            // Fallback to navigating to appointments page if fetch fails
            navigate('/portal/appointments');
          }
        } catch (error) {
          console.error('Error fetching appointment:', error);
          // Fallback to navigating to appointments page
          navigate('/portal/appointments');
        } finally {
          setLoadingAppointment(false);
        }
      } else {
        // If no appointment_id, navigate to appointments page
        navigate('/portal/appointments');
      }
    }
  };

  const getDoctorName = (appointment: Appointment): string => {
    if (appointment.doctor_first_name && appointment.doctor_last_name) {
      return `${appointment.doctor_first_name} ${appointment.doctor_last_name}`;
    }
    return 'Doctor';
  };

  const getBookedFor = (appointment: Appointment): string => {
    if (appointment.family_member_first_name && appointment.family_member_last_name) {
      return `${appointment.family_member_first_name} ${appointment.family_member_last_name}`;
    }
    if (appointment.patient_first_name && appointment.patient_last_name) {
      return `${appointment.patient_first_name} ${appointment.patient_last_name}`;
    }
    return 'Self';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return <PortalLoading message="Loading notifications…" />;
  }

  return (
    <PortalPageShell>
      <PortalPageHero
        eyebrow="Updates"
        title="Notifications"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
            : 'You are all caught up.'
        }
        icon={<Bell />}
        badges={
          <span className="rounded-full bg-slate-800/80 px-3 py-1 text-sm font-semibold text-slate-300">
            {notifications.length} total
          </span>
        }
        actions={
          <>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="ghost-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-300 hover:bg-rose-500/20"
              >
                <Trash2 className="h-4 w-4" />
                Clear all
              </button>
            )}
          </>
        }
      />

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="premium-card py-12 text-center">
          <Bell className="mx-auto mb-4 h-16 w-16 text-slate-600" />
          <h3 className="mb-2 text-lg font-semibold text-slate-100">No notifications</h3>
          <p className="text-slate-400">You&apos;re all caught up! No new notifications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.notification_id}
              role={isAppointmentNotification(notification) ? 'button' : undefined}
              tabIndex={isAppointmentNotification(notification) ? 0 : undefined}
              onClick={() => handleNotificationClick(notification)}
              onKeyDown={(e) => {
                if (isAppointmentNotification(notification) && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleNotificationClick(notification);
                }
              }}
              className={`premium-card p-4 transition-all ${
                isAppointmentNotification(notification)
                  ? 'cursor-pointer hover:border-teal-500/35 hover:shadow-lg'
                  : ''
              } ${
                notification.is_read
                  ? 'opacity-80'
                  : 'ring-1 ring-sky-500/30'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    notification.is_read
                      ? 'bg-slate-800/80 text-slate-400'
                      : 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25'
                  }`}
                >
                  {getNotificationIcon(notification.notification_type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <h3
                          className={`font-semibold ${
                            notification.is_read ? 'text-slate-300' : 'text-slate-100'
                          }`}
                        >
                          {notification.title}
                        </h3>
                        {!notification.is_read && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400" aria-hidden />
                        )}
                      </div>
                      <p
                        className={`mb-2 text-sm leading-relaxed ${
                          notification.is_read ? 'text-slate-500' : 'text-slate-300'
                        }`}
                      >
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{formatDate(notification.created_at)}</span>
                        </div>
                        {isAppointmentNotification(notification) && (
                          <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-sky-300">
                            <span>View Details</span>
                            <ExternalLink className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {!notification.is_read && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notification.notification_id);
                          }}
                          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Appointment Details Modal */}
      {selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 ${getAppointmentStatusContainer(selectedAppointment.status)}`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between p-6 border-b sticky top-0 ${getAppointmentStatusContainer(selectedAppointment.status)}`}>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                Appointment Details
              </h2>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {loadingAppointment ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <>
                  {/* Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getAppointmentStatusColor(selectedAppointment.status)}`}>
                      {(selectedAppointment.status as string) === 'confirmed' ? 'Scheduled' : selectedAppointment.status}
                    </span>
                  </div>

                  {/* Date and Time */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold text-blue-900">Date & Time</span>
                    </div>
                    <p className="text-blue-800">
                      {new Date(selectedAppointment.appointment_date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                    <p className="text-blue-800 flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4" />
                      {new Date(`2000-01-01T${selectedAppointment.appointment_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Doctor Information */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-5 w-5 text-gray-600" />
                      <span className="font-semibold text-gray-900">Doctor</span>
                    </div>
                    <p className="text-gray-700">{getDoctorName(selectedAppointment)}</p>
                  </div>

                  {/* Patient/Family Member */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-5 w-5 text-gray-600" />
                      <span className="font-semibold text-gray-900">Appointment For</span>
                    </div>
                    <p className="text-gray-700">{getBookedFor(selectedAppointment)}</p>
                  </div>

                  {/* Facility */}
                  {selectedAppointment.facility_name && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-5 w-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">Facility</span>
                      </div>
                      <p className="text-gray-700">{selectedAppointment.facility_name}</p>
                    </div>
                  )}

                  {/* Reason */}
                  {selectedAppointment.reason && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-5 w-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">Reason</span>
                      </div>
                      <p className="text-gray-700">{selectedAppointment.reason}</p>
                    </div>
                  )}

                  {/* Appointment Type */}
                  {selectedAppointment.appointment_type && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <span className="text-sm text-gray-500 capitalize">
                        Type: {selectedAppointment.appointment_type.replace('_', ' ')}
                      </span>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedAppointment.notes && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-5 w-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">Notes</span>
                      </div>
                      <p className="text-gray-700">{selectedAppointment.notes}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => navigate('/portal/appointments')}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      View All Appointments
                    </button>
                    <button
                      onClick={() => setSelectedAppointment(null)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PortalPageShell>
  );
};

export default Notifications;

