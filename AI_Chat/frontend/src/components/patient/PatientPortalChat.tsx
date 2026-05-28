/**
 * Patient Portal Chat Component
 * AI chat specifically for patients with home remedies and patient data queries
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Heart, Users, Calendar, Stethoscope, Menu, X } from 'lucide-react';
import { appointmentService, AppointmentBookingData, Appointment } from '../../services/appointmentService';
import { patientService, Patient, FamilyMember } from '../../services/patientService';
import { doctorService, Doctor, Specialty } from '../../services/doctorService';
import { recordService, MedicalRecord } from '../../services/recordService';
import { radiologyService, RadiologyBooking } from '../../services/radiologyService';
import { getApiBaseUrl } from '../../utils/apiBase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  showBookingForm?: boolean;
  results?: any[];
  natural_results?: string[];
}

const PatientPortalChat = React.forwardRef<{ clearMessages: () => void }, {}>((_props, ref) => {
  const navigate = useNavigate();
  
  // Load messages from localStorage on mount
  const loadMessagesFromStorage = (): Message[] => {
    try {
      const stored = localStorage.getItem('patient_portal_chat_messages');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert timestamp strings back to Date objects
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
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
      localStorage.setItem('patient_portal_chat_messages', JSON.stringify(msgs));
    } catch (error) {
      console.error('Error saving messages to storage:', error);
    }
  };

  const [messages, setMessages] = useState<Message[]>(loadMessagesFromStorage);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bookingData, setBookingData] = useState<Partial<AppointmentBookingData>>({
    doctor_id: undefined,
    facility_id: undefined,
    appointment_date: '',
    appointment_time: '',
    reason: '',
    family_member_id: undefined,
  });
  const [patient, setPatient] = useState<Patient | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<number | undefined>(undefined);
  const [availableSlots, setAvailableSlots] = useState<Record<string, Array<{time: string, displayTime: string}>>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Convert 24-hour time to 12-hour format
  const formatTime12Hour = (time24: string): string => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Check if a time slot should be disabled (past or current/next slot)
  const isSlotDisabled = (slotTime: string, selectedDate: string): boolean => {
    if (!slotTime || !selectedDate) return false;
    
    try {
      const now = new Date();
      const currentTime = now.getTime();
      
      // Get today's date string in YYYY-MM-DD format
      const todayStr = now.toISOString().split('T')[0];
      
      // Compare selected date with today (both as strings to avoid timezone issues)
      if (selectedDate !== todayStr) {
        return false; // Not today, all slots available
      }
      
      // Parse slot time (format: "HH:MM" or "HH:MM:SS")
      const timeParts = slotTime.split(':');
      const slotHours = parseInt(timeParts[0], 10);
      const slotMinutes = parseInt(timeParts[1] || '0', 10);
      
      // Create slot datetime by combining today's date with slot time
      const slotDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slotHours, slotMinutes, 0, 0);
      const slotTimeMs = slotDateTime.getTime();
      
      // Calculate slot end time (30-minute slots)
      const slotEndTime = new Date(slotDateTime);
      slotEndTime.setMinutes(slotEndTime.getMinutes() + 30);
      const slotEndTimeMs = slotEndTime.getTime();
      
      // Rule 1: Disable if slot has already passed (slot end time <= current time)
      if (slotEndTimeMs <= currentTime) {
        return true; // Past slot
      }
      
      // Rule 2: Disable if current time is within this slot (current slot)
      if (currentTime >= slotTimeMs && currentTime < slotEndTimeMs) {
        return true; // Current slot
      }
      
      // Rule 3: Disable all slots that start within 1 hour from now
      // This covers: current slot (if we're in one) + next slot
      const oneHourFromNow = currentTime + (60 * 60 * 1000); // 1 hour in milliseconds
      if (slotTimeMs <= oneHourFromNow) {
        return true; // Too soon (within 1 hour buffer = current slot + next slot)
      }
      
      return false;
    } catch (error) {
      console.error('Error in isSlotDisabled:', error, { slotTime, selectedDate });
      return false; // On error, allow the slot
    }
  };

  // Fetch available slots for a doctor
  const fetchAvailableSlots = async (doctorId: number, date: string) => {
    if (!doctorId || !date) return;
    
    try {
      setLoadingSlots(true);
      const response = await fetch('http://localhost:5000/api/patient-engagement/available-slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          doctorId: doctorId
        }),
      });

      const data = await response.json();
      
      if (data.success && data.availableSlots) {
        setAvailableSlots(data.availableSlots);
      } else {
        setAvailableSlots({});
      }
    } catch (error) {
      console.error('Error fetching available slots:', error);
      setAvailableSlots({});
    } finally {
      setLoadingSlots(false);
    }
  };

  // Expose clearMessages function via ref
  React.useImperativeHandle(ref, () => ({
    clearMessages: () => {
      setMessages([]);
      localStorage.removeItem('patient_portal_chat_messages');
    }
  }));

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessagesToStorage(messages);
    }
  }, [messages]);

  useEffect(() => {
    loadPatientData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close quick options menu when clicking outside
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

  const loadPatientData = async () => {
    try {
      // Check if data is already loaded to avoid unnecessary refetching
      if (patient && familyMembers.length > 0) {
        return;
      }

      const [patientResult, familyResult] = await Promise.all([
        patientService.getProfile(),
        patientService.getFamilyMembers(),
      ]);
      if (patientResult.success && patientResult.patient) {
        setPatient(patientResult.patient);
      }
      if (familyResult.success && familyResult.family_members) {
        setFamilyMembers(familyResult.family_members);
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
    }
  };

  // Build comprehensive context for patient and family members
  const buildDetailedContext = async (): Promise<string> => {
    let context = '';
    
    try {
      // Load patient data
      const [patientResult, familyResult, appointmentsResult, radiologyResult, recordsResult] = await Promise.all([
        patientService.getProfile(),
        patientService.getFamilyMembers(),
        appointmentService.getAppointments(),
        radiologyService.getBookings(),
        recordService.getRecords(),
      ]);

      // Build patient context
      if (patientResult.success && patientResult.patient) {
        const p = patientResult.patient;
        let age = null;
        if (p.date_of_birth) {
          const birthDate = new Date(p.date_of_birth);
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
        }

        context += `PRIMARY PATIENT INFORMATION:\n`;
        context += `- Name: ${p.first_name} ${p.last_name}\n`;
        context += `- Patient ID: ${p.patient_id}\n`;
        context += `- Date of Birth: ${p.date_of_birth || 'Not set'} (Age: ${age !== null ? `${age} years` : 'Not available'})\n`;
        context += `- Gender: ${p.gender || 'Not set'}\n`;
        context += `- Blood Type: ${p.blood_type || 'Not set'}\n`;
        context += `- Phone: ${p.phone || 'Not set'}\n`;
        context += `- Email: ${p.email || 'Not set'}\n`;
        if (p.height_cm) context += `- Height: ${p.height_cm} cm\n`;
        if (p.weight_kg) context += `- Weight: ${p.weight_kg} kg\n`;
        if (p.bmi) context += `- BMI: ${p.bmi.toFixed(1)}\n`;
        if ((p as any).medical_history) context += `- Medical History: ${(p as any).medical_history}\n`;
        if ((p as any).allergies) context += `- Allergies: ${(p as any).allergies}\n`;
        if ((p as any).medications) context += `- Current Medications: ${(p as any).medications}\n`;
        if (p.address) context += `- Address: ${p.address}${p.city ? `, ${p.city}` : ''}${p.state ? `, ${p.state}` : ''}\n`;

        // Add patient appointments
        if (appointmentsResult.success && appointmentsResult.appointments) {
          const patientAppointments = appointmentsResult.appointments.filter(apt => !apt.family_member_id);
          if (patientAppointments.length > 0) {
            context += `\nPATIENT APPOINTMENTS (${patientAppointments.length} total):\n`;
            patientAppointments.slice(0, 10).forEach((apt, idx) => {
              const doctorName = apt.doctor_first_name && apt.doctor_last_name 
                ? `Dr. ${apt.doctor_first_name} ${apt.doctor_last_name}` 
                : 'Doctor';
              context += `${idx + 1}. ${new Date(apt.appointment_date).toLocaleDateString()} at ${apt.appointment_time} - ${doctorName}${apt.facility_name ? ` at ${apt.facility_name}` : ''} - Status: ${apt.status}${apt.reason ? ` - Reason: ${apt.reason}` : ''}\n`;
            });
          }
        }

        // Add patient radiology bookings
        if (radiologyResult.success && radiologyResult.bookings) {
          const patientRadiology = radiologyResult.bookings.filter(booking => !booking.family_member_id);
          if (patientRadiology.length > 0) {
            context += `\nPATIENT RADIOLOGY BOOKINGS (${patientRadiology.length} total):\n`;
            patientRadiology.slice(0, 10).forEach((booking, idx) => {
              const scanType = booking.scan_type.toUpperCase();
              context += `${idx + 1}. ${scanType}${booking.body_part ? ` (${booking.body_part})` : ''} - ${new Date(booking.appointment_date).toLocaleDateString()} at ${booking.appointment_time}${booking.facility_name ? ` at ${booking.facility_name}` : ''} - Status: ${booking.status}${booking.reason ? ` - Reason: ${booking.reason}` : ''}\n`;
            });
          }
        }

        // Add patient medical records with full details
        if (recordsResult.success && recordsResult.records) {
          const patientRecords = recordsResult.records.filter(record => !record.family_member_id);
          if (patientRecords.length > 0) {
            // Separate records by type for better organization
            const labReports = patientRecords.filter(r => r.record_type === 'lab_report');
            const radiologyReports = patientRecords.filter(r => r.record_type === 'radiology_report');
            const visitSummaries = patientRecords.filter(r => r.record_type === 'visit_summary' || r.record_type === 'discharge_summary');
            const prescriptions = patientRecords.filter(r => r.record_type === 'prescription');
            const otherRecords = patientRecords.filter(r => !['lab_report', 'radiology_report', 'visit_summary', 'discharge_summary', 'prescription'].includes(r.record_type));

            // Lab Reports with full descriptions (lab results)
            if (labReports.length > 0) {
              context += `\nPATIENT LAB RESULTS & DIAGNOSTICS (${labReports.length} total):\n`;
              labReports.slice(0, 15).forEach((record, idx) => {
                context += `${idx + 1}. ${record.title} - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                if (record.description) {
                  context += `   Results: ${record.description}\n`;
                }
              });
            }

            // Radiology Reports
            if (radiologyReports.length > 0) {
              context += `\nPATIENT RADIOLOGY REPORTS (${radiologyReports.length} total):\n`;
              radiologyReports.slice(0, 10).forEach((record, idx) => {
                context += `${idx + 1}. ${record.title} - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                if (record.description) {
                  context += `   Findings: ${record.description}\n`;
                }
              });
            }

            // Visit Summaries & Discharge Summaries (clinical observations)
            if (visitSummaries.length > 0) {
              context += `\nPATIENT CLINICAL OBSERVATIONS & VISIT SUMMARIES (${visitSummaries.length} total):\n`;
              visitSummaries.slice(0, 10).forEach((record, idx) => {
                context += `${idx + 1}. ${record.title} - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                if (record.description) {
                  context += `   Clinical Notes: ${record.description}\n`;
                }
              });
            }

            // Prescriptions
            if (prescriptions.length > 0) {
              context += `\nPATIENT PRESCRIPTIONS (${prescriptions.length} total):\n`;
              prescriptions.slice(0, 10).forEach((record, idx) => {
                context += `${idx + 1}. ${record.title} - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                if (record.description) {
                  context += `   Details: ${record.description}\n`;
                }
              });
            }

            // Other Records
            if (otherRecords.length > 0) {
              context += `\nPATIENT OTHER MEDICAL RECORDS (${otherRecords.length} total):\n`;
              otherRecords.slice(0, 5).forEach((record, idx) => {
                context += `${idx + 1}. ${record.title} (${record.record_type.replace('_', ' ')}) - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                if (record.description) {
                  context += `   Details: ${record.description}\n`;
                }
              });
            }
          }
        }
      }

      // Build family members context
      if (familyResult.success && familyResult.family_members && familyResult.family_members.length > 0) {
        context += `\n\nFAMILY MEMBERS INFORMATION:\n`;
        
        for (const member of familyResult.family_members) {
          let memberAge = null;
          if (member.date_of_birth) {
            const birthDate = new Date(member.date_of_birth);
            const today = new Date();
            memberAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              memberAge--;
            }
          }

          context += `\n${member.first_name} ${member.last_name} (${member.relationship}):\n`;
          context += `- Family Member ID: ${member.family_member_id}\n`;
          context += `- Date of Birth: ${member.date_of_birth} (Age: ${memberAge !== null ? `${memberAge} years` : 'Not available'})\n`;
          context += `- Gender: ${member.gender}\n`;
          if (member.blood_type) context += `- Blood Type: ${member.blood_type}\n`;
          if (member.phone) context += `- Phone: ${member.phone}\n`;
          if (member.email) context += `- Email: ${member.email}\n`;
          if (member.height_cm) context += `- Height: ${member.height_cm} cm\n`;
          if (member.weight_kg) context += `- Weight: ${member.weight_kg} kg\n`;
          if (member.medical_history) context += `- Medical History: ${member.medical_history}\n`;
          if (member.allergies) context += `- Allergies: ${member.allergies}\n`;

          // Add family member appointments
          if (appointmentsResult.success && appointmentsResult.appointments) {
            const memberAppointments = appointmentsResult.appointments.filter(apt => apt.family_member_id === member.family_member_id);
            if (memberAppointments.length > 0) {
              context += `\n  ${member.first_name}'s Appointments (${memberAppointments.length} total):\n`;
              memberAppointments.slice(0, 5).forEach((apt, idx) => {
                const doctorName = apt.doctor_first_name && apt.doctor_last_name 
                  ? `Dr. ${apt.doctor_first_name} ${apt.doctor_last_name}` 
                  : 'Doctor';
                context += `  ${idx + 1}. ${new Date(apt.appointment_date).toLocaleDateString()} at ${apt.appointment_time} - ${doctorName} - Status: ${apt.status}\n`;
              });
            }
          }

          // Add family member radiology bookings
          if (radiologyResult.success && radiologyResult.bookings) {
            const memberRadiology = radiologyResult.bookings.filter(booking => booking.family_member_id === member.family_member_id);
            if (memberRadiology.length > 0) {
              context += `\n  ${member.first_name}'s Radiology Bookings (${memberRadiology.length} total):\n`;
              memberRadiology.slice(0, 5).forEach((booking, idx) => {
                const scanType = booking.scan_type.toUpperCase();
                context += `  ${idx + 1}. ${scanType} - ${new Date(booking.appointment_date).toLocaleDateString()} at ${booking.appointment_time} - Status: ${booking.status}\n`;
              });
            }
          }

          // Add family member medical records with full details
          if (recordsResult.success && recordsResult.records) {
            const memberRecords = recordsResult.records.filter(record => record.family_member_id === member.family_member_id);
            if (memberRecords.length > 0) {
              const memberLabReports = memberRecords.filter(r => r.record_type === 'lab_report');
              const memberRadiologyReports = memberRecords.filter(r => r.record_type === 'radiology_report');
              const memberVisitSummaries = memberRecords.filter(r => r.record_type === 'visit_summary' || r.record_type === 'discharge_summary');
              const memberOtherRecords = memberRecords.filter(r => !['lab_report', 'radiology_report', 'visit_summary', 'discharge_summary'].includes(r.record_type));

              if (memberLabReports.length > 0) {
                context += `\n  ${member.first_name}'s Lab Results (${memberLabReports.length} total):\n`;
                memberLabReports.slice(0, 10).forEach((record, idx) => {
                  context += `  ${idx + 1}. ${record.title} - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                  if (record.description) {
                    context += `     Results: ${record.description}\n`;
                  }
                });
              }

              if (memberRadiologyReports.length > 0) {
                context += `\n  ${member.first_name}'s Radiology Reports (${memberRadiologyReports.length} total):\n`;
                memberRadiologyReports.slice(0, 5).forEach((record, idx) => {
                  context += `  ${idx + 1}. ${record.title} - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                  if (record.description) {
                    context += `     Findings: ${record.description}\n`;
                  }
                });
              }

              if (memberVisitSummaries.length > 0) {
                context += `\n  ${member.first_name}'s Clinical Observations (${memberVisitSummaries.length} total):\n`;
                memberVisitSummaries.slice(0, 5).forEach((record, idx) => {
                  context += `  ${idx + 1}. ${record.title} - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                  if (record.description) {
                    context += `     Clinical Notes: ${record.description}\n`;
                  }
                });
              }

              if (memberOtherRecords.length > 0) {
                context += `\n  ${member.first_name}'s Other Records (${memberOtherRecords.length} total):\n`;
                memberOtherRecords.slice(0, 3).forEach((record, idx) => {
                  context += `  ${idx + 1}. ${record.title} (${record.record_type.replace('_', ' ')}) - ${new Date(record.visit_date).toLocaleDateString()}\n`;
                  if (record.description) {
                    context += `     Details: ${record.description}\n`;
                  }
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error building detailed context:', error);
    }

    return context;
  };

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
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const lowerInput = queryToSubmit.toLowerCase();
      const currentQuery = queryToSubmit.trim();
      
      // Check if user wants to update/edit profile
      const profileKeywords = ['update profile', 'edit profile', 'change profile', 'modify profile',
                              'update my profile', 'edit my profile', 'change my profile', 'update information',
                              'edit information', 'change information', 'update details', 'edit details'];
      const isProfileUpdateRequest = profileKeywords.some(keyword => lowerInput.includes(keyword));
      
      // Check if previous message was a successful booking confirmation
      const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
      const wasSuccessfulBooking = lastAssistantMessage?.content?.toLowerCase().includes('booked successfully') ||
                                   lastAssistantMessage?.content?.toLowerCase().includes('appointment has been booked') ||
                                   lastAssistantMessage?.content?.includes('✅');
      
      // Check if user is just acknowledging (thank you, okay, etc.) after successful booking
      const acknowledgmentKeywords = ['thank', 'thanks', 'okay', 'ok', 'great', 'good', 'perfect', 'alright', 'sure'];
      const isAcknowledgment = wasSuccessfulBooking && acknowledgmentKeywords.some(keyword => lowerInput.includes(keyword)) && 
                               !lowerInput.includes('book') && !lowerInput.includes('appointment');
      
      // Check if user wants to book appointment (including natural language requests and affirmative responses)
      const bookingKeywords = ['book appointment', 'schedule appointment', 'book an appointment', 
                              'make appointment', 'create appointment', 'new appointment', 'book me',
                              'can you book', 'i want to book', 'i need an appointment'];
      // Check if previous message asked about booking (but not if it was a successful booking)
      const wasAskedAboutBooking = !wasSuccessfulBooking && lastAssistantMessage?.content?.toLowerCase().includes('book') && 
                                   lastAssistantMessage?.content?.toLowerCase().includes('appointment');
      
      const isBookingRequest = !isAcknowledgment && (
                              bookingKeywords.some(keyword => lowerInput.includes(keyword)) ||
                              (lowerInput.includes('book') && (lowerInput.includes('doctor') || lowerInput.includes('appointment'))) ||
                              (wasAskedAboutBooking && (lowerInput === 'yes' || lowerInput === 'yeah' || lowerInput === 'sure' || lowerInput === 'okay' || lowerInput === 'ok'))
                              );
      
      // Check if it's a database query (list, show, get, find, etc.) - but not if it's a booking or profile request
      const queryKeywords = ['list', 'show', 'get', 'find', 'search', 'display', 'view', 'see', 
                            'what', 'which', 'when', 'where', 'how many', 'count'];
      const isDatabaseQuery = !isBookingRequest && !isProfileUpdateRequest && queryKeywords.some(keyword => 
        lowerInput.startsWith(keyword) || lowerInput.includes(` ${keyword} `)
      ) || (!isBookingRequest && !isProfileUpdateRequest && (
        lowerInput.includes('my appointments') || lowerInput.includes('my bookings') ||
        (lowerInput.includes('upcoming') && lowerInput.includes('appointment')) ||
        (lowerInput.includes('past') && lowerInput.includes('appointment'))
      ));
      
      // Handle acknowledgments after successful booking
      if (isAcknowledgment) {
        const acknowledgmentMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'You\'re welcome! If you need anything else, feel free to ask.',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, acknowledgmentMessage]);
        setIsLoading(false);
        return;
      }
      
      // Handle profile update requests
      if (isProfileUpdateRequest) {
        const profileMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'I\'ll take you to your profile page where you can update your information. You\'ll be redirected in a moment...',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, profileMessage]);
        setIsLoading(false);
        // Navigate after a short delay to allow message to display
        setTimeout(() => {
          navigate('/portal/profile');
        }, 1000);
        return;
      }
      
      // Handle booking requests (including natural language)
      if (isBookingRequest) {
        // Try to extract and book directly
        try {
          const { authenticatedFetch, getAuthHeaders } = await import('../../services/authService');
          const API_BASE = getApiBaseUrl();
          const response = await authenticatedFetch(`${API_BASE}/api/patient-portal/extract-and-book`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              query: currentQuery,
            }),
          });

          const data = await response.json();

          if (data.success) {
            const successMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: `✅ ${data.message}`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, successMessage]);
          } else {
            // If extraction fails or needs more info, show booking form
            const assistantMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: data.error || 'I can help you book an appointment! Please fill out the form below:',
              timestamp: new Date(),
              showBookingForm: true,
            };
            setMessages(prev => [...prev, assistantMessage]);
          }
        } catch (error) {
          // On error, show booking form
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: 'I can help you book an appointment! Please fill out the form below:',
            timestamp: new Date(),
            showBookingForm: true,
          };
          setMessages(prev => [...prev, assistantMessage]);
        }
        setIsLoading(false);
        return;
      }

      // Handle database queries
      if (isDatabaseQuery) {
        // Build conversation context from recent messages
        const recentMessages = messages.slice(-3).filter(m => m.role === 'user');
        const conversationContext = recentMessages
          .map(msg => `${msg.content}: ${msg.natural_results?.join(' ') || ''}`)
          .join('\n');

        const { authenticatedFetch, getAuthHeaders } = await import('../../services/authService');
        const API_BASE = getApiBaseUrl();
        const response = await authenticatedFetch(`${API_BASE}/api/patient-portal/query`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            query: currentQuery,
            conversation_context: conversationContext,
          }),
        });

        const data = await response.json();

        if (data.success) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.natural_results?.join('\n') || 'Here are the results:',
            timestamp: new Date(),
            results: data.results || [],
            natural_results: data.natural_results || [],
          };
          setMessages(prev => [...prev, assistantMessage]);
        } else {
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.error || 'I couldn\'t find that information. Please try rephrasing your question.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMessage]);
        }
        setIsLoading(false);
        return;
      }

      // Handle general queries (home remedies, general health questions)
      // Build comprehensive context with all patient and family member data
      const detailedContext = await buildDetailedContext();

      // Build conversation history (last 10 messages for context)
      const conversationHistory = messages
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      const { authenticatedFetch, getAuthHeaders } = await import('../../services/authService');
      const API_BASE = getApiBaseUrl();
      const response = await authenticatedFetch(`${API_BASE}/api/patient-portal/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: queryToSubmit.trim(),
          detailed_context: detailedContext,
          conversation_history: conversationHistory,
        }),
      });

      const data = await response.json();

      // Remove markdown formatting from response
      let cleanedResponse = data.response || 'I apologize, but I encountered an error. Please try again.';
      // Remove markdown bold (**text** or __text__)
      cleanedResponse = cleanedResponse.replace(/\*\*(.*?)\*\*/g, '$1');
      cleanedResponse = cleanedResponse.replace(/__(.*?)__/g, '$1');
      // Remove markdown italic (*text* or _text_)
      cleanedResponse = cleanedResponse.replace(/\*(.*?)\*/g, '$1');
      cleanedResponse = cleanedResponse.replace(/_(.*?)_/g, '$1');
      // Remove markdown headers (# Header)
      cleanedResponse = cleanedResponse.replace(/^#{1,6}\s+(.*)$/gm, '$1');
      // Remove markdown list markers but keep the content
      cleanedResponse = cleanedResponse.replace(/^[\*\-\+]\s+/gm, '• ');
      cleanedResponse = cleanedResponse.replace(/^\d+\.\s+/gm, '');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cleanedResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again or try rephrasing your question.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!bookingData.doctor_id || !bookingData.appointment_date || !bookingData.appointment_time) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Please fill in all required fields: doctor, date, and time.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      return;
    }

    setIsLoading(true);
    try {
      const result = await appointmentService.bookAppointment(bookingData as AppointmentBookingData);
      if (result.success) {
        const successMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Great! Your appointment has been booked successfully for ${new Date(bookingData.appointment_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${formatTime12Hour(bookingData.appointment_time)}.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, successMsg]);
        setBookingData({
          doctor_id: undefined,
          facility_id: undefined,
          appointment_date: '',
          appointment_time: '',
          reason: '',
          family_member_id: undefined,
        });
      } else {
        const errorMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: result.error || 'Failed to book appointment. Please try again.',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (error) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'An error occurred while booking your appointment. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
        {!hasMessages ? (
          /* Welcome Message - Centered */
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-6">
              <p className="text-gray-600 text-sm">
                Hi there! 👋 I'm your AI health assistant. I can help with home remedies, appointments, and your health information.
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
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
              
              {/* Display database query results */}
              {message.results && message.results.length > 0 && (
                <div className="mt-3 bg-white rounded-lg border border-gray-200 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(message.results[0]).map((key) => (
                          <th key={key} className="px-2 py-2 text-left font-medium text-gray-700 border-b">
                            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {message.results.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          {Object.values(row).map((value: any, cellIdx) => (
                            <td key={cellIdx} className="px-2 py-2 text-gray-900">
                              {value !== null && value !== undefined ? String(value) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {message.showBookingForm && (
                <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200">
                  <h3 className="font-semibold mb-3 text-gray-900 text-sm">Book Appointment</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Department/Specialty</label>
                      <select
                        value={selectedSpecialtyId || ''}
                        onChange={async (e) => {
                          const specialtyId = e.target.value ? parseInt(e.target.value) : undefined;
                          setSelectedSpecialtyId(specialtyId);
                          // Clear doctor selection when specialty changes
                          setBookingData({ ...bookingData, doctor_id: undefined, appointment_date: '', appointment_time: '' });
                          setAvailableSlots({});
                          // Load doctors for selected specialty
                          if (specialtyId) {
                            setLoadingDoctors(true);
                            try {
                              const result = await doctorService.searchDoctors({ specialty_id: specialtyId });
                              if (result.success) {
                                setDoctors(result.doctors || []);
                              }
                            } catch (error) {
                              console.error('Error loading doctors:', error);
                            } finally {
                              setLoadingDoctors(false);
                            }
                          } else {
                            // Load all doctors if no specialty selected
                            setLoadingDoctors(true);
                            try {
                              const result = await doctorService.searchDoctors({});
                              if (result.success) {
                                setDoctors(result.doctors || []);
                              }
                            } catch (error) {
                              console.error('Error loading doctors:', error);
                            } finally {
                              setLoadingDoctors(false);
                            }
                          }
                        }}
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onFocus={async () => {
                          if (specialties.length === 0) {
                            try {
                              const result = await doctorService.getSpecialties();
                              if (result.success) {
                                setSpecialties(result.specialties || []);
                              }
                            } catch (error) {
                              console.error('Error loading specialties:', error);
                            }
                          }
                        }}
                      >
                        <option value="">All Departments</option>
                        {specialties.map((specialty) => (
                          <option key={specialty.specialty_id} value={specialty.specialty_id}>
                            {specialty.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Doctor <span className="text-red-500">*</span></label>
                      <select
                        value={bookingData.doctor_id || ''}
                        onChange={async (e) => {
                          const doctorId = parseInt(e.target.value);
                          setBookingData({ ...bookingData, doctor_id: doctorId || undefined, appointment_date: '', appointment_time: '' });
                          // Auto-select facility if doctor has one
                          const selectedDoctor = doctors.find(d => d.doctor_id === doctorId);
                          if (selectedDoctor?.facility_id) {
                            setBookingData(prev => ({ ...prev, facility_id: selectedDoctor.facility_id }));
                          }
                          // Clear available slots when doctor changes
                          setAvailableSlots({});
                        }}
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onFocus={async () => {
                          if (doctors.length === 0 && !selectedSpecialtyId) {
                            setLoadingDoctors(true);
                            try {
                              const result = await doctorService.searchDoctors({});
                              if (result.success) {
                                setDoctors(result.doctors || []);
                              }
                            } catch (error) {
                              console.error('Error loading doctors:', error);
                            } finally {
                              setLoadingDoctors(false);
                            }
                          }
                        }}
                        disabled={!selectedSpecialtyId && doctors.length === 0}
                      >
                        <option value="">Select a doctor</option>
                        {doctors.map((doctor) => (
                          <option key={doctor.doctor_id} value={doctor.doctor_id}>
                            Dr. {doctor.first_name} {doctor.last_name}{doctor.specialty?.name ? ` - ${doctor.specialty.name}` : ''}
                          </option>
                        ))}
                      </select>
                      {loadingDoctors && (
                        <p className="text-xs text-gray-500 mt-0.5">Loading doctors...</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Date <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={bookingData.appointment_date}
                        onChange={async (e) => {
                          const newDate = e.target.value;
                          setBookingData({ ...bookingData, appointment_date: newDate, appointment_time: '' });
                          // Fetch available slots when date is selected
                          if (bookingData.doctor_id && newDate) {
                            await fetchAvailableSlots(bookingData.doctor_id, newDate);
                          }
                        }}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    {bookingData.doctor_id && bookingData.appointment_date ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Time <span className="text-red-500">*</span></label>
                        {loadingSlots ? (
                          <p className="text-xs text-gray-500 py-2">Loading available slots...</p>
                        ) : availableSlots[bookingData.appointment_date] && availableSlots[bookingData.appointment_date].length > 0 ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                              {availableSlots[bookingData.appointment_date].map((slot) => {
                                const isDisabled = isSlotDisabled(slot.time, bookingData.appointment_date || '');
                                return (
                                <button
                                  key={slot.time}
                                  type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!isDisabled) {
                                        setBookingData({ ...bookingData, appointment_time: slot.time });
                                      }
                                    }}
                                    disabled={isDisabled}
                                    style={isDisabled ? { pointerEvents: 'none' } : {}}
                                    className={`px-2 py-1.5 text-xs rounded-lg border transition-all duration-200 ${
                                      isDisabled
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                                        : bookingData.appointment_time === slot.time
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500 hover:bg-blue-50 hover:shadow-md hover:scale-105'
                                  }`}
                                >
                                  {slot.displayTime}
                                </button>
                                );
                              })}
                            </div>
                            {!bookingData.appointment_time && (
                              <p className="text-xs text-gray-500">Please select a time slot</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-red-500 py-2">No available slots for this date. Please select another date.</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Time <span className="text-red-500">*</span></label>
                        <p className="text-xs text-gray-500 py-2">Please select a doctor and date first</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                      <textarea
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        rows={2}
                        value={bookingData.reason}
                        onChange={(e) => setBookingData({ ...bookingData, reason: e.target.value })}
                        placeholder="Reason for appointment (optional)"
                      />
                    </div>
                    {familyMembers.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Book for</label>
                        <select
                          value={bookingData.family_member_id || 'self'}
                          onChange={(e) => setBookingData({ 
                            ...bookingData, 
                            family_member_id: e.target.value === 'self' ? undefined : parseInt(e.target.value) 
                          })}
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="self">Myself</option>
                          {familyMembers.map((member) => (
                            <option key={member.family_member_id} value={member.family_member_id}>
                              {member.first_name} {member.last_name} ({member.relationship})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleBookAppointment}
                        disabled={isLoading || !bookingData.doctor_id || !bookingData.appointment_date || !bookingData.appointment_time}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:scale-105 text-white px-3 py-1.5 text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-200"
                      >
                        {isLoading ? 'Booking...' : 'Book Appointment'}
                      </button>
                      <button
                        onClick={() => {
                          setBookingData({
                            doctor_id: undefined,
                            facility_id: undefined,
                            appointment_date: '',
                            appointment_time: '',
                            reason: '',
                            family_member_id: undefined,
                          });
                          setSelectedSpecialtyId(undefined);
                          setDoctors([]);
                          setAvailableSlots({});
                        }}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md hover:scale-105 transition-all duration-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
                    handleQuickAction("Give me my health summary");
                    setShowQuickOptions(false);
                  }}
                  disabled={isLoading}
                  className="w-full flex items-center justify-end gap-2 px-3 py-2 pr-4 text-xs bg-white border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-400 hover:shadow-md hover:scale-105 transition-all duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-right"
                >
                  <span>My Health</span>
                  <Heart size={14} className="text-red-500 flex-shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleQuickAction("Give me present condition of my family members");
                    setShowQuickOptions(false);
                  }}
                  disabled={isLoading}
                  className="w-full flex items-center justify-end gap-2 px-3 py-2 pr-4 text-xs bg-white border border-gray-300 rounded-lg hover:bg-purple-50 hover:border-purple-400 hover:shadow-md hover:scale-105 transition-all duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-right"
                >
                  <span>Family Health</span>
                  <Users size={14} className="text-purple-500 flex-shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleQuickAction("Show me my upcoming appointments");
                    setShowQuickOptions(false);
                  }}
                  disabled={isLoading}
                  className="w-full flex items-center justify-end gap-2 px-3 py-2 pr-4 text-xs bg-white border border-gray-300 rounded-lg hover:bg-green-50 hover:border-green-400 hover:shadow-md hover:scale-105 transition-all duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-right"
                >
                  <span>Appointments</span>
                  <Calendar size={14} className="text-green-500 flex-shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleQuickAction("I want to book an appointment");
                    setShowQuickOptions(false);
                  }}
                  disabled={isLoading}
                  className="w-full flex items-center justify-end gap-2 px-3 py-2 pr-4 text-xs bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 hover:shadow-md hover:scale-105 transition-all duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-right"
                >
                  <span>Book Appointment</span>
                  <Stethoscope size={14} className="text-blue-500 flex-shrink-0" />
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
});

PatientPortalChat.displayName = 'PatientPortalChat';

// Export the component - state is preserved via localStorage
export default PatientPortalChat;

