import React, { useState, useEffect, useRef } from 'react';
import { Calendar, FileText, Clock, ArrowUp, Bot, UserCircle, BrainCircuit, ChevronLeft, ChevronRight, X, Edit, RefreshCw } from 'lucide-react';
import EditAppointmentModal from './general/EditAppointmentModal';
import SegmentTabs from './ui/SegmentTabs';
import { appointmentService, Appointment } from '../services/appointmentService';
import { getAppointmentStatusColor, getAppointmentStatusContainer } from '../utils/appointmentStatusColors';
import { getApiBaseUrl } from '../utils/apiBase';

/** Patient-engagement API base (uses Vite proxy on LAN when getApiBaseUrl() is empty). */
const PE_API = `${getApiBaseUrl()}/api/patient-engagement`;

interface DatabaseResult {
  [key: string]: any;
}

interface QueryResult {
  success: boolean;
  results: DatabaseResult[];
  natural_results?: string[];
  error?: string;
  message?: string;
  count?: number;
}

interface DailyAppointment {
  id: string;
  appointmentId: number;
  patientId: string;
  patientName: string;
  patientPhone: string;
  familyMemberId?: number | null;
  familyMemberFirstName?: string;
  familyMemberLastName?: string;
  familyMemberRelationship?: string;
  familyMemberPhone?: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientEmail?: string;
  appointmentDate: string;
  appointmentDateRaw?: string;
  appointmentTime: string;
  appointmentTimeRaw?: string;
  doctorId?: number;
  doctorName: string;
  facilityId?: number;
  facilityName?: string;
  appointmentType?: string;
  reason?: string;
  notes?: string;
  department: string;
  status: string;
}

interface QueryMessage { 
  id: string;
  query: string;
  results: DatabaseResult[];
  natural_results?: string[];
  timestamp: Date;
  error?: string;
  showBookingForm?: boolean;
}

interface AppointmentFormData {
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  age?: string;
  gender: string;
  weight?: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  appointmentTime: string;
  visitType: 'in_person' | 'video';
  reason?: string;
}

interface Doctor {
  id: number;
  name: string;
  department_id: number;
  department_name: string;
}

interface Department {
  id: number;
  name: string;
}

interface PatientEngagementProps {
  sessionId?: string | null;
  forcedTab?: 'appointments' | 'book' | 'query';
  hideTabs?: boolean;
}

const PatientEngagement: React.FC<PatientEngagementProps> = ({ sessionId, forcedTab, hideTabs = false }) => {
  const [query, setQuery] = useState('');
  const [queryMessages, setQueryMessages] = useState<QueryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dailyAppointments, setDailyAppointments] = useState<DailyAppointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [appointmentFormData, setAppointmentFormData] = useState<AppointmentFormData>({
    patientName: '',
    patientPhone: '',
    patientEmail: '',
    age: '',
    gender: '',
    weight: '',
    doctorId: '',
    departmentId: '',
    appointmentDate: '',
    appointmentTime: '',
    visitType: 'in_person',
    reason: ''
  });
  const [isSubmittingAppointment, setIsSubmittingAppointment] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [conflictError, setConflictError] = useState<string>('');
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Record<string, Array<{time: string, displayTime: string}>>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateRangeOffset, setDateRangeOffset] = useState<number>(0);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'appointments' | 'book' | 'query'>(forcedTab ?? 'appointments');
  const [appointmentsSortBy, setAppointmentsSortBy] = useState<'alphabetical' | 'time'>('time');
  const [editingAppointment, setEditingAppointment] = useState<DailyAppointment | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load query messages from session storage on mount or session change
  useEffect(() => {
    if (sessionId) {
      try {
        const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
        const sessionsKey = `${userEmail}_medchat-sessions`;
        const savedSessions = localStorage.getItem(sessionsKey);
        if (savedSessions) {
          const sessions = JSON.parse(savedSessions);
          const currentSession = sessions.find((s: any) => s.id === sessionId);
          if (currentSession && currentSession.engagementMessages) {
            // Convert stored messages back to QueryMessage format
            const loadedMessages = currentSession.engagementMessages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }));
            setQueryMessages(loadedMessages);
          } else {
            // No saved messages for this session, start fresh
            setQueryMessages([]);
          }
        }
      } catch (error) {
        console.error('Error loading engagement messages from session:', error);
      }
    }
  }, [sessionId]);

  // Save query messages to session storage whenever they change
  useEffect(() => {
    if (sessionId) {
      try {
        const userEmail = sessionStorage.getItem('userEmail') || 'anonymous';
        const sessionsKey = `${userEmail}_medchat-sessions`;
        const savedSessions = localStorage.getItem(sessionsKey);
        if (savedSessions) {
          const sessions = JSON.parse(savedSessions);
          const updatedSessions = sessions.map((s: any) => {
            if (s.id === sessionId) {
              return {
                ...s,
                engagementMessages: queryMessages
              };
            }
            return s;
          });
          localStorage.setItem(sessionsKey, JSON.stringify(updatedSessions));
        } else if (queryMessages.length > 0) {
          // If no sessions exist yet but we have messages, create a session
          const newSession = {
            id: sessionId,
            name: `Session ${Date.now()}`,
            messages: [],
            engagementMessages: queryMessages
          };
          localStorage.setItem(sessionsKey, JSON.stringify([newSession]));
        }
      } catch (error) {
        console.error('Error saving engagement messages to session:', error);
      }
    }
  }, [queryMessages, sessionId]);

  // Fetch daily appointments on component mount
  useEffect(() => {
    fetchDailyAppointments();
  }, []);

  // Fetch doctors and departments on mount so dropdowns work in left sidebar and in chat forms
  useEffect(() => {
    fetchDoctorsAndDepartments();
  }, []);

  // Fetch doctors and departments (used on mount and when booking form is shown in chat)
  const fetchDoctorsAndDepartments = async () => {
    try {
      setLoadingDoctors(true);
      setLoadingDepartments(true);

      const doctorsResponse = await fetch(`${PE_API}/doctors`);
      const doctorsData = await doctorsResponse.json();

      if (doctorsData.success && Array.isArray(doctorsData.doctors)) {
        setDoctors(doctorsData.doctors.map((d: any) => ({
          id: Number(d.id ?? d.doctor_id),
          name: String(d.name ?? d.first_name ?? ''),
          department_id: Number(d.department_id ?? d.departmentId ?? 0),
          department_name: String(d.department_name ?? '')
        })));
      }

      const deptResponse = await fetch(`${PE_API}/departments`);
      const deptData = await deptResponse.json();

      if (deptData.success && Array.isArray(deptData.departments)) {
        setDepartments(deptData.departments.map((d: any) => ({
          id: Number(d.id ?? d.department_id),
          name: String(d.name ?? '')
        })));
      }
    } catch (err) {
      console.error('Error fetching doctors/departments:', err);
    } finally {
      setLoadingDoctors(false);
      setLoadingDepartments(false);
    }
  };

  // Fetch available slots for a specific doctor
  const fetchAvailableSlotsForDoctor = async (doctorId: string) => {
    if (!doctorId) {
      return;
    }

    try {
      setLoadingSlots(true);
      const response = await fetch(`${PE_API}/available-slots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          doctorId: doctorId
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAvailableSlots(data.availableSlots || {});
        // Set first available date as selected
        const dates = Object.keys(data.availableSlots || {}).filter(date => 
          (data.availableSlots[date] || []).length > 0
        );
        if (dates.length > 0) {
          setSelectedDate(dates[0]);
          setDateRangeOffset(0); // Reset date range offset
          // Automatically open the slot picker modal
          setShowSlotPicker(true);
        } else {
          // No slots available, show message but don't open modal
          setShowSlotPicker(false);
        }
      } else {
        console.error('Failed to fetch available slots:', data.error);
        setShowSlotPicker(false);
      }
    } catch (err) {
      console.error('Error fetching available slots:', err);
      setShowSlotPicker(false);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Fetch available slots for selected doctor (manual trigger via button)
  const fetchAvailableSlots = async () => {
    if (!appointmentFormData.doctorId) {
      alert('Please select a doctor first');
      return;
    }
    await fetchAvailableSlotsForDoctor(appointmentFormData.doctorId);
  };

  // Check if a time slot should be disabled (past or current/next slot) - same logic as patient portal
  const isSlotDisabled = (slotTime: string, selectedDate: string): boolean => {
    if (!slotTime || !selectedDate) return false;
    try {
      const now = new Date();
      const currentTime = now.getTime();
      const todayStr = now.toISOString().split('T')[0];
      if (selectedDate !== todayStr) return false; // Not today, all slots available
      const timeParts = slotTime.split(':');
      const slotHours = parseInt(timeParts[0], 10);
      const slotMinutes = parseInt(timeParts[1] || '0', 10);
      const slotDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slotHours, slotMinutes, 0, 0);
      const slotTimeMs = slotDateTime.getTime();
      const slotEndTime = new Date(slotDateTime);
      slotEndTime.setMinutes(slotEndTime.getMinutes() + 30);
      const slotEndTimeMs = slotEndTime.getTime();
      if (slotEndTimeMs <= currentTime) return true; // Past slot
      if (currentTime >= slotTimeMs && currentTime < slotEndTimeMs) return true; // Current slot
      const oneHourFromNow = currentTime + (60 * 60 * 1000);
      if (slotTimeMs <= oneHourFromNow) return true; // Too soon (1 hour buffer)
      return false;
    } catch (error) {
      return false;
    }
  };

  // Handle slot selection
  const handleSlotSelect = (date: string, time: string) => {
    if (isSlotDisabled(time, date)) return;
    setAppointmentFormData(prev => ({
      ...prev,
      appointmentDate: date,
      appointmentTime: time
    }));
    setShowSlotPicker(false);
    setConflictError('');
  };

  // Scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [queryMessages, isLoading]);

  const fetchDailyAppointments = async () => {
    try {
      setLoadingAppointments(true);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const response = await fetch(`${PE_API}/appointments-by-date?start_date=${weekAgo}&end_date=${tomorrow}`);
      const data = await response.json();
      
      if (data.success) {
        const transformedAppointments = (data.appointments || []).map((appointment: any) => {
          const dateStr = appointment.appointment_date ? new Date(appointment.appointment_date).toISOString().split('T')[0] : '';
          let timeStr = appointment.appointment_time ?? '';
          if (typeof timeStr === 'string' && timeStr.includes(':')) {
            const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (match) timeStr = `${match[1].padStart(2, '0')}:${match[2]}:${(match[3] || '00')}`;
          } else {
            timeStr = appointment.appointment_date ? new Date(appointment.appointment_date).toTimeString().slice(0, 8) : '00:00:00';
          }
          const timeDisplay = timeStr ? (() => {
            const parts = timeStr.split(':').map(Number);
            const h = parts[0] ?? 0, m = parts[1] ?? 0;
            const period = h >= 12 ? 'PM' : 'AM';
            const hour = h % 12 || 12;
            return `${hour}:${String(m).padStart(2, '0')} ${period}`;
          })() : '';
          return {
            id: appointment.appointment_id?.toString() || '',
            appointmentId: appointment.appointment_id ?? 0,
            patientId: appointment.patient_id || '',
            patientName: appointment.patient_name || '',
            patientPhone: appointment.patient_phone || '',
            familyMemberId: appointment.family_member_id,
            familyMemberFirstName: appointment.family_member_first_name,
            familyMemberLastName: appointment.family_member_last_name,
            familyMemberRelationship: appointment.family_member_relationship,
            familyMemberPhone: appointment.family_member_phone,
            patientFirstName: appointment.patient_first_name,
            patientLastName: appointment.patient_last_name,
            patientEmail: appointment.patient_email,
            appointmentDate: appointment.appointment_date ? new Date(appointment.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
            appointmentDateRaw: dateStr,
            appointmentTime: timeDisplay,
            appointmentTimeRaw: timeStr,
            doctorId: appointment.doctor_id,
            doctorName: appointment.doctor_name || '',
            facilityId: appointment.facility_id,
            facilityName: appointment.facility_name,
            appointmentType: appointment.appointment_type || 'consultation',
            reason: appointment.reason,
            notes: appointment.notes,
            department: appointment.specialty_name || appointment.department_name || '',
            status: appointment.status || ''
          };
        });
        setDailyAppointments(transformedAppointments);
      } else {
        console.error('Failed to fetch appointments:', data.error);
      }
    } catch (err) {
      console.error('Error fetching appointments:', err);
    } finally {
      setLoadingAppointments(false);
    }
  };

  const dailyToAppointment = (apt: DailyAppointment): Appointment => ({
    appointment_id: apt.appointmentId,
    patient_id: apt.patientId,
    family_member_id: apt.familyMemberId ?? undefined,
    doctor_id: apt.doctorId ?? 0,
    facility_id: apt.facilityId ?? 0,
    appointment_date: apt.appointmentDateRaw ? `${apt.appointmentDateRaw}T00:00:00` : '',
    appointment_time: apt.appointmentTimeRaw || '00:00:00',
    appointment_type: (apt.appointmentType as any) || 'consultation',
    reason: apt.reason,
    notes: apt.notes,
    status: (apt.status as any) || 'scheduled',
    created_at: '',
    doctor_first_name: apt.doctorName?.split(' ')[0],
    doctor_last_name: apt.doctorName?.split(' ').slice(1).join(' '),
    facility_name: apt.facilityName,
    family_member_first_name: apt.familyMemberFirstName,
    family_member_last_name: apt.familyMemberLastName,
    patient_first_name: apt.patientFirstName,
    patient_last_name: apt.patientLastName,
    patient_email: apt.patientEmail,
  });

  const handleEditAppointment = (apt: DailyAppointment) => {
    setEditingAppointment(apt);
  };

  const handleSaveAppointment = async (updatedData: Partial<Appointment>) => {
    if (!editingAppointment) return;
    try {
      const result = await appointmentService.updateAppointment(editingAppointment.appointmentId, updatedData);
      if (result.success) {
        await fetchDailyAppointments();
        setEditingAppointment(null);
      } else {
        alert(result.error || 'Failed to update appointment');
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('Failed to update appointment');
    }
  };

  const handleStatusChange = async (appointmentId: number, newStatus: string) => {
    setUpdatingStatus(appointmentId);
    try {
      const result = await appointmentService.updateAppointmentStatus(appointmentId, newStatus);
      if (result.success) {
        await fetchDailyAppointments();
      } else {
        alert(result.error || 'Failed to update appointment status');
      }
    } catch (error) {
      console.error('Error updating appointment status:', error);
      alert('Failed to update appointment status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const currentQuery = query.trim().toLowerCase();
    
    // Check if user wants to book an appointment (more specific keywords)
    // Only show form for explicit booking requests, not queries about appointments
    const bookingKeywords = ['book appointment', 'schedule appointment', 'create appointment', 
                            'new appointment', 'make appointment', 'set appointment', 'consultation'];
    const isBookingRequest = bookingKeywords.some(keyword => currentQuery.includes(keyword)) ||
                           (currentQuery.includes('book') && currentQuery.includes('appointment')) ||
                           (currentQuery.includes('schedule') && currentQuery.includes('appointment'));
    
    // Don't show form for queries about appointments (list, show, get, find, etc.)
    const queryKeywords = ['list', 'show', 'get', 'find', 'search', 'display', 'view', 'see', 
                          'what', 'which', 'when', 'where', 'how many', 'count'];
    const isQueryRequest = queryKeywords.some(keyword => currentQuery.startsWith(keyword) || 
                                                  currentQuery.includes(` ${keyword} `));
    
    // Only show booking form for explicit booking requests, not queries
    if (isBookingRequest && !isQueryRequest) {
      // Check if the query contains enough information to book directly
      // Look for patient name, date/time indicators, and doctor/department
      const hasPatientName = /(?:for|patient|name)\s+([a-zA-Z]+)/i.test(query.trim());
      const hasTime = /(?:at|time)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|today|tomorrow)/i.test(query.trim());
      const hasDate = /(?:today|tomorrow|\d{1,2}[\/\-]\d{1,2})/i.test(query.trim());
      const hasDoctorOrDept = /(?:doctor|department|pediatrics|cardiology|orthopedics|any doctor)/i.test(query.trim());
      
      // If we have enough info, try to book directly
      if (hasPatientName && (hasTime || hasDate) && hasDoctorOrDept) {
        // Try natural language booking
        setIsLoading(true);
        const userMessage: QueryMessage = {
          id: Date.now().toString(),
          query: query.trim(),
          results: [],
          natural_results: [],
          timestamp: new Date()
        };
        setQueryMessages(prev => [...prev, userMessage]);
        setQuery('');
        
        try {
          const response = await fetch(`${PE_API}/extract-and-book`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: query.trim() }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            // Update message with success
            setQueryMessages(prev => prev.map(msg => 
              msg.id === userMessage.id 
                ? { 
                    ...msg, 
                    natural_results: [`✅ ${data.message}`],
                    results: data.appointment ? [data.appointment] : []
                  }
                : msg
            ));
            // Refresh daily appointments
            fetchDailyAppointments();
          } else {
            // If extraction fails, show the form instead
            setQueryMessages(prev => prev.map(msg => 
              msg.id === userMessage.id 
                ? { ...msg, showBookingForm: true }
                : msg
            ));
            fetchDoctorsAndDepartments();
          }
        } catch (err) {
          console.error('Error booking appointment:', err);
          // On error, show the form
          setQueryMessages(prev => prev.map(msg => 
            msg.id === userMessage.id 
              ? { ...msg, showBookingForm: true }
              : msg
          ));
          fetchDoctorsAndDepartments();
        } finally {
          setIsLoading(false);
        }
        return;
      } else {
        // Not enough info, show form
        const userMessage: QueryMessage = {
          id: Date.now().toString(),
          query: query.trim(),
          results: [],
          natural_results: [],
          timestamp: new Date(),
          showBookingForm: true
        };
        setQueryMessages(prev => [...prev, userMessage]);
        setQuery('');
        // Fetch doctors and departments when form is shown
        fetchDoctorsAndDepartments();
        return;
      }
    }

    const currentQueryOriginal = query.trim();
    setQuery('');
    setIsLoading(true);

    // Add user query message
    const userMessage: QueryMessage = {
      id: Date.now().toString(),
      query: currentQueryOriginal,
      results: [],
      natural_results: [],
      timestamp: new Date()
    };
    setQueryMessages(prev => [...prev, userMessage]);

    try {
      // Build conversation context from recent messages
      const recentMessages = queryMessages.slice(-3); // Last 3 messages for context
      const conversationContext = recentMessages
        .map(msg => `${msg.query}: ${msg.natural_results?.join(' ') || ''}`)
        .join('\n');

      const response = await fetch(`${PE_API}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: currentQuery,
          conversation_context: conversationContext
        }),
      });

      const data: QueryResult = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to query database');
      }

      // Handle the new response format
      if (data.success) {
        // Update the last message with results and natural results
        setQueryMessages(prev => prev.map(msg => 
          msg.id === userMessage.id 
            ? { 
                ...msg, 
                results: data.results || [],
                natural_results: data.natural_results || []
              }
            : msg
        ));
      } else {
        throw new Error(data.error || 'Query failed');
      }
    } catch (err) {
      // Update the last message with error
      setQueryMessages(prev => prev.map(msg => 
        msg.id === userMessage.id 
          ? { ...msg, error: err instanceof Error ? err.message : 'An error occurred' }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppointmentFormChange = async (field: keyof AppointmentFormData, value: string) => {
    setAppointmentFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear conflict error when user changes time/date/doctor
    if (field === 'appointmentDate' || field === 'appointmentTime' || field === 'doctorId') {
      setConflictError('');
    }
    
    // If doctor is selected, auto-fill department and fetch available slots
    if (field === 'doctorId') {
      if (value) {
        const selectedDoctor = doctors.find(d => d.id.toString() === value);
        if (selectedDoctor) {
          setAppointmentFormData(prev => ({
            ...prev,
            doctorId: value,
            departmentId: selectedDoctor.department_id.toString(),
            // Clear date/time when doctor changes
            appointmentDate: '',
            appointmentTime: ''
          }));
          // Automatically fetch and show available slots for the selected doctor
          await fetchAvailableSlotsForDoctor(value);
        }
      } else {
        // If doctor is cleared, clear date/time and close slot picker
        setAppointmentFormData(prev => ({
          ...prev,
          appointmentDate: '',
          appointmentTime: ''
        }));
        setShowSlotPicker(false);
      }
    }
    
    // Check for conflicts in real-time when date, time, or doctor changes
    if (field === 'appointmentDate' || field === 'appointmentTime') {
      // Wait a bit to avoid too many API calls, then check with updated data
      setTimeout(async () => {
        const updatedData = {
          ...appointmentFormData,
          [field]: value
        };
        if (updatedData.doctorId && updatedData.appointmentDate && updatedData.appointmentTime) {
          await checkAppointmentConflict(updatedData);
        }
      }, 800);
    }
  };

  const checkAppointmentConflict = async (formData?: AppointmentFormData): Promise<boolean> => {
    const dataToCheck = formData || appointmentFormData;
    
    if (!dataToCheck.doctorId || !dataToCheck.appointmentDate || !dataToCheck.appointmentTime) {
      return false;
    }

    try {
      const response = await fetch(`${PE_API}/check-appointment-conflict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          doctorId: dataToCheck.doctorId,
          appointmentDate: dataToCheck.appointmentDate,
          appointmentTime: dataToCheck.appointmentTime
        }),
      });

      const data = await response.json();
      
      if (data.success && data.hasConflict) {
        setConflictError('This time slot is already booked. Please choose a different time.');
        return true;
      }
      
      setConflictError('');
      return false;
    } catch (err) {
      console.error('Error checking conflict:', err);
      return false;
    }
  };

  const handleAppointmentSubmit = async () => {
    // Validate required fields
    if (!appointmentFormData.patientName || !appointmentFormData.patientPhone || 
        !appointmentFormData.doctorId || !appointmentFormData.departmentId || 
        !appointmentFormData.appointmentDate || !appointmentFormData.appointmentTime) {
      alert('Please fill in all required fields');
      return;
    }

    // Check for conflicts before submitting
    const hasConflict = await checkAppointmentConflict();
    if (hasConflict) {
      return; // Error message already set by checkAppointmentConflict
    }

    setIsSubmittingAppointment(true);

    try {
      const response = await fetch(`${PE_API}/book-appointment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(appointmentFormData),
      });

      const data = await response.json();

      if (data.success) {
        // Show success status
        setBookingSuccess(true);
        
        // Update the message to hide form and show success
        setQueryMessages(prev => prev.map(msg => 
          msg.showBookingForm 
            ? { 
                ...msg, 
                showBookingForm: false,
                natural_results: [data.message || 'Appointment booked successfully!'],
                results: data.appointment ? [data.appointment] : []
              }
            : msg
        ));
        
        // Reset form after showing success
        setTimeout(() => {
          setAppointmentFormData({
            patientName: '',
            patientPhone: '',
            patientEmail: '',
            age: '',
            gender: '',
            weight: '',
            doctorId: '',
            departmentId: '',
            appointmentDate: '',
            appointmentTime: '',
            reason: ''
          });
          setConflictError('');
          setBookingSuccess(false);
        }, 3000); // Reset after 3 seconds

        // Refresh daily appointments
        fetchDailyAppointments();
      } else {
        alert(data.error || 'Failed to book appointment');
      }
    } catch (err) {
      console.error('Error booking appointment:', err);
      alert('Error booking appointment. Please try again.');
    } finally {
      setIsSubmittingAppointment(false);
    }
  };

  const tabs = [
    { id: 'appointments' as const, label: 'Appointments', icon: Clock },
    { id: 'book' as const, label: 'Book Appointment', icon: Calendar },
    { id: 'query' as const, label: 'Query Results', icon: FileText },
  ];

  const displayTab = forcedTab ?? activeTab;
  const isFrontdesk = hideTabs;

  useEffect(() => {
    if (forcedTab) setActiveTab(forcedTab);
  }, [forcedTab]);

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const todayAppointmentCount = dailyAppointments.filter(
    (a) =>
      (a.appointmentDateRaw || '').startsWith(todayStr) &&
      a.status !== 'completed' &&
      a.status !== 'cancelled'
  ).length;
  const tomorrowAppointmentCount = dailyAppointments.filter((a) =>
    (a.appointmentDateRaw || '').startsWith(tomorrowStr)
  ).length;
  const todayUpcomingAppointments = dailyAppointments
    .filter(
      (a) =>
        (a.appointmentDateRaw || '').startsWith(todayStr) &&
        a.status !== 'completed' &&
        a.status !== 'cancelled'
    )
    .sort((a, b) => (a.appointmentTimeRaw || '').localeCompare(b.appointmentTimeRaw || ''))
    .slice(0, 6);

  const renderBookAppointmentFields = (variant: 'default' | 'frontdesk') => {
    const labelCls =
      variant === 'frontdesk'
        ? 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400'
        : 'mb-1 block text-xs font-medium text-gray-700';
    const fieldCls =
      variant === 'frontdesk'
        ? 'form-field w-full text-sm'
        : 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
    const slotBtnCls =
      variant === 'frontdesk'
        ? 'form-field flex w-full items-center justify-between text-sm hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-50'
        : 'flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100';
    const submitCls =
      variant === 'frontdesk'
        ? `portal-accent-button mt-3 flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold ${
            bookingSuccess
              ? 'bg-emerald-600 hover:bg-emerald-600'
              : isSubmittingAppointment || conflictError
                ? 'cursor-not-allowed opacity-50'
                : ''
          }`
        : `mt-2 flex w-full items-center justify-center rounded-md px-3 py-2 text-xs font-medium transition-colors ${
            bookingSuccess
              ? 'cursor-default bg-green-600 text-white'
              : isSubmittingAppointment || conflictError
                ? 'cursor-not-allowed bg-gray-400 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
          }`;
    const gridGap = variant === 'frontdesk' ? 'gap-4' : 'gap-2';
    const stackGap = variant === 'frontdesk' ? 'space-y-4' : 'space-y-2';

    return (
      <div className={stackGap}>
        <div className={variant === 'frontdesk' ? 'grid gap-4 sm:grid-cols-2' : ''}>
          <div>
            <label className={labelCls}>
              Patient Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={appointmentFormData.patientName}
              onChange={(e) => handleAppointmentFormChange('patientName', e.target.value)}
              className={fieldCls}
              placeholder="Enter patient name"
            />
          </div>
          <div>
            <label className={labelCls}>
              Phone Number <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              value={appointmentFormData.patientPhone}
              onChange={(e) => handleAppointmentFormChange('patientPhone', e.target.value)}
              className={fieldCls}
              placeholder="Enter phone number"
            />
          </div>
        </div>
        <div className={variant === 'frontdesk' ? 'grid gap-4 sm:grid-cols-2' : ''}>
          <div className={variant === 'frontdesk' ? '' : ''}>
            <label className={labelCls}>Email (Optional)</label>
            <input
              type="email"
              value={appointmentFormData.patientEmail}
              onChange={(e) => handleAppointmentFormChange('patientEmail', e.target.value)}
              className={fieldCls}
              placeholder="Enter email"
            />
          </div>
          {variant === 'frontdesk' && (
            <div className={`grid grid-cols-2 ${gridGap}`}>
              <div>
                <label className={labelCls}>Age</label>
                <input
                  type="number"
                  value={appointmentFormData.age}
                  onChange={(e) => handleAppointmentFormChange('age', e.target.value)}
                  className={fieldCls}
                  placeholder="Age"
                  min="0"
                  max="150"
                />
              </div>
              <div>
                <label className={labelCls}>Gender</label>
                <select
                  value={appointmentFormData.gender}
                  onChange={(e) => handleAppointmentFormChange('gender', e.target.value)}
                  className={fieldCls}
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          )}
        </div>
        {variant === 'default' && (
          <div className={`grid grid-cols-2 ${gridGap}`}>
            <div>
              <label className={labelCls}>Age</label>
              <input
                type="number"
                value={appointmentFormData.age}
                onChange={(e) => handleAppointmentFormChange('age', e.target.value)}
                className={fieldCls}
                placeholder="Age"
                min="0"
                max="150"
              />
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <select
                value={appointmentFormData.gender}
                onChange={(e) => handleAppointmentFormChange('gender', e.target.value)}
                className={fieldCls}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        )}
        <div className={`grid grid-cols-2 ${gridGap}`}>
          <div>
            <label className={labelCls}>Weight (kg)</label>
            <input
              type="number"
              value={appointmentFormData.weight}
              onChange={(e) => handleAppointmentFormChange('weight', e.target.value)}
              className={fieldCls}
              placeholder="Weight"
              min="0"
              max="500"
              step="0.1"
            />
          </div>
          <div>
            <label className={labelCls}>
              Date & Time <span className="text-red-400">*</span>
            </label>
            <button type="button" onClick={fetchAvailableSlots} disabled={!appointmentFormData.doctorId || loadingSlots} className={slotBtnCls}>
              <span className="truncate text-slate-200">
                {appointmentFormData.appointmentDate && appointmentFormData.appointmentTime
                  ? `${new Date(appointmentFormData.appointmentDate).toLocaleDateString()} at ${new Date(`2000-01-01T${appointmentFormData.appointmentTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : appointmentFormData.doctorId
                    ? 'Click to view slots'
                    : 'Select doctor first'}
              </span>
              <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
            {loadingSlots && <p className="mt-1 text-xs text-slate-500">Loading slots…</p>}
            {appointmentFormData.appointmentDate && appointmentFormData.appointmentTime && (
              <button
                type="button"
                onClick={() => {
                  setAppointmentFormData((prev) => ({
                    ...prev,
                    appointmentDate: '',
                    appointmentTime: '',
                  }));
                  setConflictError('');
                }}
                className="mt-1 text-xs text-red-400 hover:text-red-300"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>
        <div className={`grid grid-cols-2 ${gridGap}`}>
          <div>
            <label className={labelCls}>Visit type</label>
            <select
              value={appointmentFormData.visitType}
              onChange={(e) =>
                handleAppointmentFormChange('visitType', e.target.value as 'in_person' | 'video')
              }
              className={fieldCls}
            >
              <option value="in_person">In-person</option>
              <option value="video">Telemedicine</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Doctor <span className="text-red-400">*</span>
            </label>
            <select
              value={appointmentFormData.doctorId}
              onChange={(e) => handleAppointmentFormChange('doctorId', e.target.value)}
              className={fieldCls}
              disabled={loadingDoctors}
            >
              <option value="">Select a doctor</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={String(doctor.id)}>
                  {doctor.name} - {doctor.department_name}
                </option>
              ))}
            </select>
            {loadingDoctors && <p className="mt-1 text-xs text-slate-500">Loading doctors…</p>}
          </div>
          <div>
            <label className={labelCls}>
              Department <span className="text-red-400">*</span>
            </label>
            <select
              value={appointmentFormData.departmentId}
              onChange={(e) => handleAppointmentFormChange('departmentId', e.target.value)}
              className={fieldCls}
              disabled={loadingDepartments}
            >
              <option value="">Select a department</option>
              {departments.map((dept) => (
                <option key={dept.id} value={String(dept.id)}>
                  {dept.name}
                </option>
              ))}
            </select>
            {loadingDepartments && <p className="mt-1 text-xs text-slate-500">Loading departments…</p>}
          </div>
        </div>
        {conflictError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
            <p className="text-sm text-red-300">{conflictError}</p>
          </div>
        )}
        <div>
          <label className={labelCls}>Reason (Optional)</label>
          <textarea
            value={appointmentFormData.reason}
            onChange={(e) => handleAppointmentFormChange('reason', e.target.value)}
            className={`${fieldCls} resize-none`}
            placeholder="Enter appointment reason"
            rows={variant === 'frontdesk' ? 3 : 2}
          />
        </div>
        <button
          onClick={handleAppointmentSubmit}
          disabled={isSubmittingAppointment || !!conflictError || bookingSuccess}
          className={submitCls}
        >
          {bookingSuccess ? (
            <>
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Booked successfully
            </>
          ) : isSubmittingAppointment ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent" />
              Booking…
            </>
          ) : (
            <>
              <Calendar className="mr-2 h-4 w-4" />
              Book Appointment
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 w-full flex-col overflow-hidden">
      {!hideTabs && (
        <div className="shrink-0 border-b border-slate-200/80 bg-white/90 px-4 py-3">
          <SegmentTabs
            tabs={tabs}
            activeTab={displayTab}
            onChange={(id) => setActiveTab(id as 'appointments' | 'book' | 'query')}
          />
        </div>
      )}

      <div
        className={`flex min-h-0 min-w-0 w-full flex-1 overflow-hidden ${
          isFrontdesk ? '' : 'gap-6 p-4'
        }`}
      >
        {/* Tab Content */}
        {displayTab === 'appointments' && (
          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${
              isFrontdesk ? 'gap-4 overflow-hidden p-4 sm:p-6' : ''
            }`}
          >
            {isFrontdesk ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
                      <Clock className="h-5 w-5 text-amber-400" />
                      Appointments
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-400">Today, tomorrow, and completed visits</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!loadingAppointments && dailyAppointments.length > 0 && (
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
                        Sort by
                        <select
                          value={appointmentsSortBy}
                          onChange={(e) =>
                            setAppointmentsSortBy(e.target.value as 'alphabetical' | 'time')
                          }
                          className="form-field min-w-[8rem] py-1.5 text-sm"
                        >
                          <option value="time">Time</option>
                          <option value="alphabetical">Department</option>
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => fetchDailyAppointments()}
                      disabled={loadingAppointments}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingAppointments ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="premium-card flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
                  {loadingAppointments ? (
                    <div className="flex flex-1 items-center justify-center">
                      <div className="text-center">
                        <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-amber-400 border-b-transparent" />
                        <p className="text-sm text-slate-400">Loading schedule…</p>
                      </div>
                    </div>
                  ) : (
                    <AppointmentsByDayColumns
                      variant="frontdesk"
                      appointments={dailyAppointments}
                      sortBy={appointmentsSortBy}
                      onEdit={handleEditAppointment}
                      onStatusChange={handleStatusChange}
                      updatingStatus={updatingStatus}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center text-sm font-semibold text-gray-900">
                      <Clock className="mr-2 h-4 w-4 text-blue-600" />
                      Appointments
                    </h2>
                    {!loadingAppointments && dailyAppointments.length > 0 && (
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                        Sort by
                        <select
                          value={appointmentsSortBy}
                          onChange={(e) =>
                            setAppointmentsSortBy(e.target.value as 'alphabetical' | 'time')
                          }
                          className="rounded-md border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="time">Time</option>
                          <option value="alphabetical">Department</option>
                        </select>
                      </label>
                    )}
                  </div>
                  {loadingAppointments ? (
                    <div className="flex h-40 items-center justify-center">
                      <div className="text-center">
                        <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
                        <p className="text-sm text-gray-600">Loading appointments...</p>
                      </div>
                    </div>
                  ) : (
                    <AppointmentsByDayColumns
                      appointments={dailyAppointments}
                      sortBy={appointmentsSortBy}
                      onEdit={handleEditAppointment}
                      onStatusChange={handleStatusChange}
                      updatingStatus={updatingStatus}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {displayTab === 'book' && (
          isFrontdesk ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6">
              <div className="shrink-0">
                <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
                  <Calendar className="h-5 w-5 text-amber-400" />
                  Book Appointment
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Register walk-ins and schedule visits for patients
                </p>
              </div>
              <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-12">
                <section className="premium-card flex min-h-0 flex-col overflow-hidden lg:col-span-7 xl:col-span-8">
                  <div className="shrink-0 border-b border-amber-500/20 px-5 py-4">
                    <h3 className="text-sm font-semibold text-slate-100">Patient & visit details</h3>
                  </div>
                  <div className="hide-scrollbar flex-1 overflow-y-auto px-5 py-4">
                    {renderBookAppointmentFields('frontdesk')}
                  </div>
                </section>
                <aside className="flex min-h-0 flex-col gap-4 lg:col-span-5 xl:col-span-4">
                  <div className="premium-card shrink-0 p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
                      <Clock className="h-4 w-4 text-amber-400" />
                      Schedule overview
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-center">
                        <p className="text-2xl font-bold text-amber-300">{todayAppointmentCount}</p>
                        <p className="text-xs text-slate-400">Today</p>
                      </div>
                      <div className="rounded-xl border border-slate-600/50 bg-slate-800/40 px-3 py-3 text-center">
                        <p className="text-2xl font-bold text-slate-100">{tomorrowAppointmentCount}</p>
                        <p className="text-xs text-slate-400">Tomorrow</p>
                      </div>
                    </div>
                  </div>
                  <div className="premium-card flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="shrink-0 border-b border-amber-500/20 px-5 py-3">
                      <h3 className="text-sm font-semibold text-slate-100">Upcoming today</h3>
                    </div>
                    <div className="hide-scrollbar flex-1 overflow-y-auto px-5 py-3">
                      {todayUpcomingAppointments.length === 0 ? (
                        <p className="py-6 text-center text-sm text-slate-500">No active appointments today</p>
                      ) : (
                        <ul className="space-y-2">
                          {todayUpcomingAppointments.map((apt) => (
                            <li
                              key={apt.id}
                              className="rounded-lg border border-slate-600/40 bg-slate-900/30 px-3 py-2.5"
                            >
                              <p className="truncate text-sm font-medium text-slate-100">{apt.patientName}</p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {apt.appointmentTime} · {apt.doctorName}
                              </p>
                              <p className="text-xs text-amber-400/90">{apt.department}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  {doctors.length > 0 && (
                    <div className="premium-card max-h-48 shrink-0 overflow-hidden">
                      <div className="border-b border-amber-500/20 px-5 py-3">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                          <UserCircle className="h-4 w-4 text-amber-400" />
                          {doctors.length} doctors on duty
                        </h3>
                      </div>
                      <ul className="hide-scrollbar max-h-32 overflow-y-auto px-5 py-2 text-xs text-slate-400">
                        {doctors.slice(0, 8).map((d) => (
                          <li key={d.id} className="border-b border-slate-700/40 py-1.5 last:border-0">
                            <span className="text-slate-200">{d.name}</span>
                            <span className="text-slate-500"> — {d.department_name}</span>
                          </li>
                        ))}
                        {doctors.length > 8 && (
                          <li className="py-1.5 text-slate-500">+{doctors.length - 8} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </aside>
              </div>
            </div>
          ) : (
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex-shrink-0 px-4 pb-2 pt-4">
                  <h2 className="flex items-center text-sm font-semibold text-gray-900">
                    <Calendar className="mr-2 h-4 w-4 text-blue-600" />
                    Book Appointment
                  </h2>
                </div>
                <div className="hide-scrollbar flex-1 overflow-y-auto px-3 pb-3 pt-2">
                  {renderBookAppointmentFields('default')}
                </div>
              </div>
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex-shrink-0 px-4 pb-2 pt-4">
                  <h2 className="flex items-center text-sm font-semibold text-gray-900">
                    <Clock className="mr-2 h-4 w-4 text-amber-600" />
                    Today&apos;s Summary
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
                  <div className="space-y-2 text-xs text-gray-600">
                    <p>
                      Today:{' '}
                      <span className="font-medium text-gray-900">{todayAppointmentCount}</span> appointments
                    </p>
                    <p>
                      Tomorrow:{' '}
                      <span className="font-medium text-gray-900">{tomorrowAppointmentCount}</span> appointments
                    </p>
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-[11px] text-gray-500">
                        Switch to Appointments tab to view and manage the full schedule.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex-shrink-0 px-4 pb-2 pt-4">
                  <h2 className="flex items-center text-sm font-semibold text-gray-900">
                    <UserCircle className="mr-2 h-4 w-4 text-green-600" />
                    Quick Tips
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
                  <ul className="list-inside list-disc space-y-2 text-xs text-gray-600">
                    <li>Select doctor to see available slots</li>
                    <li>Use Query tab for natural language booking</li>
                    <li>Check for conflicts before confirming</li>
                    <li>Patient ID is auto-generated (PAT-YYMMDD-XXXX)</li>
                  </ul>
                  {doctors.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="mb-1 text-xs font-medium text-gray-700">{doctors.length} doctors available</p>
                      <p className="text-[11px] text-gray-500">Select from dropdown in the form</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {displayTab === 'query' && (
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Results Container */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="h-5 w-5 mr-2 text-orange-600" />
              Query Results
            </h2>
            
            {queryMessages.length === 0 && !isLoading && (
              <div className="flex items-center justify-center h-64 w-full">
                <div className="text-center w-full max-w-2xl px-4">
                  <BrainCircuit className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Welcome to Frontdesk
                  </h3>
                  <p className="text-gray-600 mb-6">
                    I can help you query patient data, manage appointments, and interact with your hospital database. 
                    Ask me anything about patients, appointments, or book a new appointment.
                  </p>
                  <div className="mt-6">
                    <p className="text-sm text-gray-500 mb-3">Try asking:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        onClick={() => setQuery("Show today's appointments")}
                        className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        Show today's appointments
                      </button>
                      <button
                        onClick={() => setQuery("List all patients")}
                        className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        List all patients
                      </button>
                      <button
                        onClick={() => setQuery("Show appointments for tomorrow")}
                        className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        Tomorrow's appointments
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {queryMessages.length > 0 && (
              <div className="space-y-4 w-full min-w-0 overflow-x-hidden" style={{ maxWidth: '100%' }}>
                {queryMessages.map((message) => (
                  <div key={message.id} className="space-y-3 w-full min-w-0 overflow-x-hidden" style={{ maxWidth: '100%' }}>
                    {/* User Query */}
                    <div className="flex items-start space-x-3 justify-end">
                      <div className="flex-shrink-0 bg-orange-100 rounded-full p-2">
                        <UserCircle size={24} className="text-orange-600" />
                      </div>
                      <div className="bg-orange-50 rounded-lg rounded-tr-none p-3 max-w-[85%]">
                        <p className="text-gray-900 text-sm">{message.query}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    {/* Bot Response */}
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 bg-blue-100 rounded-full p-2">
                        <Bot size={24} className="text-blue-600" />
                      </div>
                      <div className="bg-blue-50 rounded-lg rounded-tl-none p-3 max-w-[85%] min-w-0 overflow-x-hidden" style={{ maxWidth: '85%' }}>
                        {message.showBookingForm ? (
                          <div className="w-full max-w-md">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                              <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                              Book Appointment
                            </h3>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Patient Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={appointmentFormData.patientName}
                                  onChange={(e) => handleAppointmentFormChange('patientName', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter patient name"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Phone Number <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="tel"
                                  value={appointmentFormData.patientPhone}
                                  onChange={(e) => handleAppointmentFormChange('patientPhone', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter phone number"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Email (Optional)
                                </label>
                                <input
                                  type="email"
                                  value={appointmentFormData.patientEmail}
                                  onChange={(e) => handleAppointmentFormChange('patientEmail', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter email address"
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Age (Optional)
                                  </label>
                                  <input
                                    type="number"
                                    value={appointmentFormData.age}
                                    onChange={(e) => handleAppointmentFormChange('age', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Age"
                                    min="0"
                                    max="150"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Gender (Optional)
                                  </label>
                                  <select
                                    value={appointmentFormData.gender}
                                    onChange={(e) => handleAppointmentFormChange('gender', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">Select</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Weight (kg)
                                  </label>
                                  <input
                                    type="number"
                                    value={appointmentFormData.weight}
                                    onChange={(e) => handleAppointmentFormChange('weight', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Weight"
                                    min="0"
                                    max="500"
                                    step="0.1"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Doctor <span className="text-red-500">*</span>
                                </label>
                                <select
                                  value={appointmentFormData.doctorId}
                                  onChange={(e) => handleAppointmentFormChange('doctorId', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={loadingDoctors}
                                >
                                  <option value="">Select a doctor</option>
                                  {doctors.map((doctor) => (
                                    <option key={doctor.id} value={String(doctor.id)}>
                                      {doctor.name} - {doctor.department_name}
                                    </option>
                                  ))}
                                </select>
                                {loadingDoctors && (
                                  <p className="text-xs text-gray-500 mt-1">Loading doctors...</p>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Department <span className="text-red-500">*</span>
                                </label>
                                <select
                                  value={appointmentFormData.departmentId}
                                  onChange={(e) => handleAppointmentFormChange('departmentId', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={loadingDepartments}
                                >
                                  <option value="">Select a department</option>
                                  {departments.map((dept) => (
                                    <option key={dept.id} value={String(dept.id)}>
                                      {dept.name}
                                    </option>
                                  ))}
                                </select>
                                {loadingDepartments && (
                                  <p className="text-xs text-gray-500 mt-1">Loading departments...</p>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Date <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="date"
                                    value={appointmentFormData.appointmentDate}
                                    onChange={(e) => handleAppointmentFormChange('appointmentDate', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    min={new Date().toISOString().split('T')[0]}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Time <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="time"
                                    value={appointmentFormData.appointmentTime}
                                    onChange={(e) => handleAppointmentFormChange('appointmentTime', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              </div>
                              {conflictError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                  <p className="text-sm text-red-700">{conflictError}</p>
                                </div>
                              )}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Reason (Optional)
                                </label>
                                <textarea
                                  value={appointmentFormData.reason}
                                  onChange={(e) => handleAppointmentFormChange('reason', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter appointment reason"
                                  rows={2}
                                />
                              </div>
                              <button
                                onClick={handleAppointmentSubmit}
                                disabled={isSubmittingAppointment || !!conflictError || bookingSuccess}
                                className={`w-full py-2 px-4 rounded-lg transition-colors flex items-center justify-center ${
                                  bookingSuccess 
                                    ? 'bg-green-600 text-white cursor-default' 
                                    : isSubmittingAppointment || conflictError
                                    ? 'bg-gray-400 text-white cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {bookingSuccess ? (
                                  <>
                                    <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Done!
                                  </>
                                ) : isSubmittingAppointment ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Booking...
                                  </>
                                ) : (
                                  <>
                                    <Calendar className="h-4 w-4 mr-2" />
                                    Book Appointment
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : message.error ? (
                          <div className="text-red-700 text-sm">
                            <p className="font-medium">Query Error:</p>
                            <p>{message.error}</p>
                          </div>
                        ) : message.results.length > 0 ? (
                          <div className="space-y-3 w-full min-w-0" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                            {/* Table display for structured data */}
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm w-full min-w-0" style={{ maxWidth: '100%' }}>
                              <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-semibold text-gray-800">
                                    📊 Results ({message.results.length} {message.results.length === 1 ? 'record' : 'records'})
                                  </p>
                                  <div className="flex items-center gap-2">
                                    {message.results.length > 10 && (
                                      <span className="text-xs text-gray-500">Scroll to see all</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="overflow-x-auto max-h-96 overflow-y-auto" style={{ width: '100%', maxWidth: '100%' }}>
                                <table className="divide-y divide-gray-200" style={{ width: 'max-content', minWidth: '100%', tableLayout: 'auto' }}>
                                  <thead className="bg-gray-100 sticky top-0 z-10">
                                    <tr>
                                      {Object.keys(message.results[0] || {}).map((key) => (
                                        <th
                                          key={key}
                                          className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
                                        >
                                          <div className="flex items-center space-x-1">
                                            <span>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                                          </div>
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {message.results.map((result: DatabaseResult, rowIndex: number) => (
                                      <tr 
                                        key={rowIndex} 
                                        className={`hover:bg-blue-50 transition-colors ${
                                          rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                        }`}
                                      >
                                        {Object.keys(message.results[0] || {}).map((key) => {
                                          const cellValue = result[key];
                                          let displayValue: React.ReactNode;
                                          
                                          if (cellValue === null || cellValue === undefined) {
                                            displayValue = <span className="text-gray-400 italic">—</span>;
                                          } else if (typeof cellValue === 'boolean') {
                                            displayValue = (
                                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                cellValue ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                              }`}>
                                                {cellValue ? 'Yes' : 'No'}
                                              </span>
                                            );
                                          } else if (typeof cellValue === 'object') {
                                            displayValue = (
                                              <span className="text-xs text-gray-500">
                                                {JSON.stringify(cellValue).substring(0, 50)}
                                                {JSON.stringify(cellValue).length > 50 ? '...' : ''}
                                              </span>
                                            );
                                          } else {
                                            const strValue = String(cellValue);
                                            // Format dates if they look like dates
                                            if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) {
                                              try {
                                                const date = new Date(strValue);
                                                displayValue = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                              } catch {
                                                displayValue = strValue;
                                              }
                                            } else {
                                              displayValue = strValue;
                                            }
                                          }
                                          
                                          return (
                                            <td
                                              key={key}
                                              className="px-4 py-3 text-sm text-gray-900 border-r border-gray-100 last:border-r-0"
                                            >
                                              <div className="max-w-xs truncate" title={String(cellValue)}>
                                                {displayValue}
                                              </div>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        ) : message.results.length === 0 && !isLoading ? (
                          <p className="text-sm text-gray-700">No results found for this query.</p>
                        ) : null}
                        <p className="text-xs text-gray-500 mt-2">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isLoading && (
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 bg-blue-100 rounded-full p-2">
                  <Bot size={24} className="text-blue-600" />
                </div>
                <div className="bg-blue-50 rounded-lg rounded-tl-none p-3 max-w-[85%]">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <p className="text-sm text-gray-700">Querying database...</p>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Query Input Container */}
          <div className="sticky bottom-0 bg-white p-1 border-t border-gray-200 flex-shrink-0">
            <form onSubmit={handleQuerySubmit} className="relative flex items-center">
              <textarea
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about patient data (e.g., Show me all patients with diabetes)"
                className="w-full p-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none hide-scrollbar"
                rows={1}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleQuerySubmit(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!query.trim() || isLoading}
                className="portal-accent-button absolute right-3 bottom-3 rounded-full p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp size={20} />
              </button>
            </form>
          </div>
        </div>
        )}
      </div>

      {/* Slot Picker Modal */}
      {showSlotPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className={`flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl shadow-xl ${
              isFrontdesk ? 'premium-card border border-amber-500/30' : 'bg-white'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`flex items-center justify-between p-4 ${
                isFrontdesk ? 'border-b border-amber-500/20' : 'border-b border-gray-200'
              }`}
            >
              <h2
                className={`flex items-center text-lg font-semibold ${
                  isFrontdesk ? 'text-slate-100' : 'text-gray-900'
                }`}
              >
                <Calendar className={`mr-2 h-5 w-5 ${isFrontdesk ? 'text-amber-400' : 'text-blue-600'}`} />
                Select Available Time Slot
              </h2>
              <button
                onClick={() => {
                  setShowSlotPicker(false);
                  setDateRangeOffset(0);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingSlots ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-gray-600">Loading available slots...</p>
                  </div>
                </div>
              ) : Object.keys(availableSlots).length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">No available slots found for the next 2 weeks</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Date Navigation - same as patient portal */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => {
                        const dates = Object.keys(availableSlots).filter(date => 
                          (availableSlots[date] || []).length > 0
                        ).sort();
                        if (dateRangeOffset > 0) {
                          setDateRangeOffset(prev => prev - 1);
                          const newStartIndex = (dateRangeOffset - 1) * 7;
                          if (dates[newStartIndex]) {
                            setSelectedDate(dates[newStartIndex]);
                          }
                        }
                      }}
                      disabled={dateRangeOffset === 0}
                      className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      {selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Select a date'}
                    </span>
                    <button
                      onClick={() => {
                        const dates = Object.keys(availableSlots).filter(date => 
                          (availableSlots[date] || []).length > 0
                        ).sort();
                        const maxOffset = Math.floor((dates.length - 1) / 7);
                        if (dateRangeOffset < maxOffset) {
                          setDateRangeOffset(prev => prev + 1);
                          const newStartIndex = (dateRangeOffset + 1) * 7;
                          if (dates[newStartIndex]) {
                            setSelectedDate(dates[newStartIndex]);
                          }
                        }
                      }}
                      disabled={dateRangeOffset >= Math.floor((Object.keys(availableSlots).filter(date => 
                        (availableSlots[date] || []).length > 0
                      ).length - 1) / 7)}
                      className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Available Dates - 7-column grid like patient portal */}
                  <div className="grid grid-cols-7 gap-2 mb-4">
                    {Object.keys(availableSlots)
                      .filter(date => (availableSlots[date] || []).length > 0)
                      .sort()
                      .slice(dateRangeOffset * 7, (dateRangeOffset + 1) * 7)
                      .map(date => {
                        const dateObj = new Date(date);
                        const isSelected = selectedDate === date;
                        const isToday = date === new Date().toISOString().split('T')[0];
                        return (
                          <button
                            key={date}
                            onClick={() => setSelectedDate(date)}
                            className={`p-3 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                                : 'border-gray-200 hover:border-blue-300 bg-white'
                            } ${isToday ? 'ring-2 ring-green-400' : ''}`}
                          >
                            <div className="text-xs text-gray-500 mb-1">
                              {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                            </div>
                            <div className="text-lg font-medium">
                              {dateObj.getDate()}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {availableSlots[date]?.length || 0} slots
                            </div>
                          </button>
                        );
                      })}
                  </div>

                  {/* Time Slots Grid */}
                  {selectedDate && availableSlots[selectedDate] && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">
                        Available slots for {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </h3>
                      <div className="grid grid-cols-4 gap-2">
                        {availableSlots[selectedDate].map((slot) => {
                          const isDisabled = isSlotDisabled(slot.time, selectedDate);
                          const isSelected = appointmentFormData.appointmentDate === selectedDate && appointmentFormData.appointmentTime === slot.time;
                          return (
                            <button
                              key={slot.time}
                              onClick={() => handleSlotSelect(selectedDate, slot.time)}
                              disabled={isDisabled}
                              className={`px-3 py-2 rounded-md border-2 transition-all duration-200 ${
                                isDisabled
                                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                                  : isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold hover:scale-105'
                                  : 'border-gray-200 hover:border-blue-300 bg-white hover:scale-105'
                              }`}
                            >
                              {slot.displayTime}
                            </button>
                          );
                        })}
                      </div>
                      {availableSlots[selectedDate].length === 0 && (
                        <p className="text-gray-500 text-sm text-center py-4">No available slots for this date</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowSlotPicker(false);
                  setDateRangeOffset(0);
                }}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Appointment Modal */}
      {editingAppointment && (
        <EditAppointmentModal
          appointment={dailyToAppointment(editingAppointment)}
          onClose={() => setEditingAppointment(null)}
          onSave={handleSaveAppointment}
        />
      )}
    </div>
  );
};

// Appointments by day (Today | Tomorrow | Completed) grouped by Department → Doctor → Appointments
interface AppointmentsByDayColumnsProps {
  appointments: DailyAppointment[];
  sortBy: 'alphabetical' | 'time';
  variant?: 'default' | 'frontdesk';
  onEdit?: (apt: DailyAppointment) => void;
  onStatusChange?: (appointmentId: number, newStatus: string) => void;
  updatingStatus?: number | null;
}
const AppointmentsByDayColumns: React.FC<AppointmentsByDayColumnsProps> = ({
  appointments,
  sortBy,
  variant = 'default',
  onEdit,
  onStatusChange,
  updatingStatus,
}) => {
  const isFrontdeskCol = variant === 'frontdesk';
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const isCompletedOrCancelled = (a: DailyAppointment) => a.status === 'completed' || a.status === 'cancelled';
  const todayAppointments = appointments.filter(a => (a.appointmentDateRaw || '').startsWith(todayStr) && !isCompletedOrCancelled(a));
  const tomorrowAppointments = appointments.filter(a => (a.appointmentDateRaw || '').startsWith(tomorrowStr) && !isCompletedOrCancelled(a));
  const completedAppointments = appointments.filter(a => (a.appointmentDateRaw || '') < todayStr || isCompletedOrCancelled(a));

  const parseTime = (apt: DailyAppointment) => apt.appointmentTimeRaw || '00:00:00';

  // Group by Department → Doctor → Appointments
  const groupByDeptThenDoctor = (list: DailyAppointment[]) => {
    const deptMap: Record<string, Record<string, DailyAppointment[]>> = {};
    list.forEach(a => {
      const dept = a.department || 'General';
      const doctor = a.doctorName || 'Unknown';
      if (!deptMap[dept]) deptMap[dept] = {};
      if (!deptMap[dept][doctor]) deptMap[dept][doctor] = [];
      deptMap[dept][doctor].push(a);
    });
    return deptMap;
  };

  const showActions = (colTitle: string) => colTitle === 'Today' || colTitle === 'Tomorrow';

  const DayColumn: React.FC<{ title: string; list: DailyAppointment[]; sortBy: 'alphabetical' | 'time' }> = ({ title, list, sortBy: sortMode }) => {
    // Past appointments in Completed column: show "completed" unless cancelled
    const displayStatus = (apt: DailyAppointment) =>
      title === 'Completed' && apt.status !== 'cancelled' ? 'completed' : apt.status;
    const byDeptDoctor = groupByDeptThenDoctor(list);

    const getMinTime = (apts: DailyAppointment[]) =>
      apts.length ? apts.reduce((min, a) => (parseTime(a) < parseTime(min) ? a : min), apts[0]) : null;

    let departments: string[];
    if (sortMode === 'alphabetical') {
      departments = Object.keys(byDeptDoctor).sort();
    } else {
      departments = Object.keys(byDeptDoctor).sort((da, db) => {
        const minA = getMinTime(Object.values(byDeptDoctor[da]).flat());
        const minB = getMinTime(Object.values(byDeptDoctor[db]).flat());
        const tA = minA ? parseTime(minA) : '99:99:99';
        const tB = minB ? parseTime(minB) : '99:99:99';
        return tA.localeCompare(tB);
      });
    }

    const sortDoctors = (doctors: [string, DailyAppointment[]][]) => {
      if (sortMode === 'alphabetical') {
        return doctors.sort(([a], [b]) => a.localeCompare(b));
      }
      return doctors.sort(([, aptsA], [, aptsB]) => {
        const minA = getMinTime(aptsA);
        const minB = getMinTime(aptsB);
        const tA = minA ? parseTime(minA) : '99:99:99';
        const tB = minB ? parseTime(minB) : '99:99:99';
        return tA.localeCompare(tB);
      });
    };

    const sortAppointments = (apts: DailyAppointment[]) => {
      if (sortMode === 'alphabetical') {
        return [...apts].sort((a, b) => a.patientName.localeCompare(b.patientName));
      }
      return [...apts].sort((a, b) => parseTime(a).localeCompare(parseTime(b)));
    };

    return (
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl ${
          isFrontdeskCol
            ? 'border border-amber-500/25 bg-slate-900/35'
            : 'flex-1 rounded-lg border border-gray-200'
        }`}
      >
        <div
          className={`shrink-0 px-4 py-3 ${
            isFrontdeskCol
              ? 'border-b border-amber-500/20 bg-amber-500/10'
              : 'border-b border-gray-200 bg-gray-50 px-3 py-2'
          }`}
        >
          <h3 className={`text-sm font-semibold ${isFrontdeskCol ? 'text-amber-200' : 'text-gray-900'}`}>
            {title}
          </h3>
        </div>
        <div
          className={`flex-1 space-y-4 overflow-y-auto p-3 sm:p-4 ${
            isFrontdeskCol ? 'min-h-[10rem]' : 'max-h-[500px]'
          }`}
        >
          {departments.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No appointments</p>
          ) : (
            departments.map(dept => (
              <div key={dept} className="space-y-2">
                <p className="text-sm font-semibold text-gray-900">{dept}</p>
                {sortDoctors(Object.entries(byDeptDoctor[dept])).map(([doctor, apts]) => (
                  <div key={doctor} className="ml-3 space-y-2">
                    <p className="text-sm font-medium text-blue-600">{doctor}</p>
                    <ul className="ml-3 space-y-2">
                      {sortAppointments(apts).map(apt => {
                        const isForFamilyMember = !!(apt.familyMemberId || apt.familyMemberFirstName || apt.familyMemberLastName);
                        const familyMemberName = [apt.familyMemberFirstName, apt.familyMemberLastName].filter(Boolean).join(' ').trim();
                        return (
                        <li key={apt.id} className={`text-sm rounded-lg px-4 py-3 border min-h-[88px] ${getAppointmentStatusContainer(displayStatus(apt))}`}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {apt.patientId && <span className="block text-xs text-gray-600 font-medium mb-0.5">ID: {apt.patientId}</span>}
                              <span className="font-semibold text-gray-900">{apt.patientName}</span>
                              {isForFamilyMember && (
                                <span className="block text-xs text-blue-600 mt-0.5">
                                  For: {familyMemberName}{apt.familyMemberRelationship ? ` (${apt.familyMemberRelationship})` : ''}
                                  {apt.familyMemberPhone && ` · ${apt.familyMemberPhone}`}
                                </span>
                              )}
                              <span className="block text-gray-600 text-xs mt-0.5">· {apt.appointmentDate} · {apt.appointmentTime}</span>
                              {(apt.familyMemberPhone || apt.patientPhone) && (
                                <span className="block text-gray-600 text-xs mt-0.5">
                                  {isForFamilyMember && apt.familyMemberPhone ? `Contact: ${apt.familyMemberPhone}` : `Phone: ${apt.patientPhone}`}
                                  {isForFamilyMember && !apt.familyMemberPhone && apt.patientPhone && ` (Primary)`}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getAppointmentStatusColor(displayStatus(apt))}`}>
                                {displayStatus(apt)}
                              </span>
                              {showActions(title) && onEdit && onStatusChange && (
                                <>
                                  <button
                                    onClick={() => onEdit(apt)}
                                    className="p-1.5 rounded hover:bg-blue-100 text-blue-600"
                                    title="Edit"
                                  >
                                    <Edit size={14} />
                                  </button>
                                  <div className="relative">
                                    <select
                                      value={apt.status === 'confirmed' ? 'scheduled' : apt.status === 'no_show' ? 'cancelled' : apt.status}
                                      onChange={(e) => onStatusChange(apt.appointmentId, e.target.value)}
                                      disabled={updatingStatus === apt.appointmentId}
                                      className="text-xs px-2 py-1 rounded border border-gray-300 bg-white cursor-pointer appearance-none pr-6"
                                    >
                                      <option value="scheduled">Scheduled</option>
                                      <option value="pending">Pending</option>
                                      <option value="completed">Completed</option>
                                      <option value="cancelled">Cancelled</option>
                                    </select>
                                    {updatingStatus === apt.appointmentId && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded">
                                        <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      );})}
                    </ul>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  if (appointments.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center">
          <Calendar className="h-10 w-10 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 text-sm">No appointments</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isFrontdeskCol
          ? 'flex min-h-0 flex-1 flex-col gap-4 lg:flex-row'
          : 'grid min-h-[200px] grid-cols-3 gap-4'
      }
    >
      <DayColumn title="Today" list={todayAppointments} sortBy={sortBy} />
      <DayColumn title="Tomorrow" list={tomorrowAppointments} sortBy={sortBy} />
      <DayColumn title="Completed" list={completedAppointments} sortBy={sortBy} />
    </div>
  );
};

export default PatientEngagement; 