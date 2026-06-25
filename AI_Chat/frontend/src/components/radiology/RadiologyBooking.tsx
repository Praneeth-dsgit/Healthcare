/**
 * Radiology Booking Component
 * Book radiology scans (MRI, CT, X-ray, etc.)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scan, Calendar, Clock, MapPin, User, Check, X, ArrowLeft } from 'lucide-react';
import { radiologyService, RadiologyBookingData } from '../../services/radiologyService';
import { facilityService, Facility } from '../../services/facilityService';
import { patientService, FamilyMember } from '../../services/patientService';
import { PortalPageShell, PortalPageHero } from '../patient/portalPageLayout';

const SCAN_TYPES = [
  { value: 'mri', label: 'MRI' },
  { value: 'ct', label: 'CT Scan' },
  { value: 'xray', label: 'X-Ray' },
  { value: 'ultrasound', label: 'Ultrasound' },
  { value: 'mammography', label: 'Mammography' },
  { value: 'pet_scan', label: 'PET Scan' },
  { value: 'other', label: 'Other' },
];

const RadiologyBooking: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [formData, setFormData] = useState<RadiologyBookingData>({
    facility_id: 0,
    scan_type: 'mri',
    body_part: '',
    appointment_date: '',
    appointment_time: '',
    reason: '',
  });
  const [bookingFor, setBookingFor] = useState<'self' | number>('self');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [facilitiesResult, familyResult] = await Promise.all([
        facilityService.searchFacilities({ type: 'diagnostic_center' }),
        patientService.getFamilyMembers(),
      ]);

      if (facilitiesResult.success) setFacilities(facilitiesResult.facilities || []);
      if (familyResult.success) setFamilyMembers(familyResult.family_members || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFacilitySelect = (facility: Facility) => {
    setSelectedFacility(facility);
    setFormData({ ...formData, facility_id: facility.facility_id });
    setStep(2);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const bookingData: RadiologyBookingData = {
        ...formData,
        family_member_id: bookingFor !== 'self' ? bookingFor : undefined,
      };
      
      console.log('Submitting radiology booking:', bookingData);
      console.log('Patient ID from session:', sessionStorage.getItem('patient_id'));
      
      const result = await radiologyService.bookRadiology(bookingData);
      console.log('Booking result:', result);
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/portal/radiology');
        }, 2000);
      } else {
        setError(result.error || 'Failed to book radiology scan. Please try again.');
      }
    } catch (error) {
      console.error('Error booking radiology:', error);
      setError(error instanceof Error ? error.message : 'Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="content-panel max-w-md p-8 text-center">
          <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan Booked!</h2>
          <p className="text-gray-600">Your radiology scan has been successfully booked.</p>
        </div>
      </div>
    );
  }

  return (
    <PortalPageShell className="max-w-4xl">
        <PortalPageHero
          eyebrow={
            <button
              type="button"
              onClick={() => navigate('/portal/radiology')}
              className="ghost-button -ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide text-teal-300 transition-colors hover:text-teal-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to radiology
            </button>
          }
          title="Book Radiology Scan"
          subtitle={`Step ${step} of 2`}
          icon={<Scan />}
        />

        {step === 1 && (
          <div className="content-panel space-y-5 p-5 sm:p-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Scan Type</label>
              <select
                value={formData.scan_type}
                onChange={(e) => setFormData({ ...formData, scan_type: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
              >
                {SCAN_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Body Part (Optional)</label>
              <input
                type="text"
                value={formData.body_part}
                onChange={(e) => setFormData({ ...formData, body_part: e.target.value })}
                placeholder="e.g., Head, Chest, Abdomen"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Diagnostic Facility</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {facilities.map((facility) => (
                  <div
                    key={facility.facility_id}
                    onClick={() => handleFacilitySelect(facility)}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-600 hover:shadow-md hover:scale-[1.02] cursor-pointer transition-all duration-200"
                  >
                    <h3 className="font-semibold text-gray-900 mb-2">{facility.name}</h3>
                    <p className="text-sm text-gray-600 flex items-center mb-1">
                      <MapPin className="h-4 w-4 mr-1" />
                      {facility.address}, {facility.city}
                    </p>
                    {facility.phone && (
                      <p className="text-sm text-gray-600">{facility.phone}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Date, Time & Details */}
        {step === 2 && selectedFacility && (
          <div className="content-panel p-6 transition-all duration-300">
            <div className="mb-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-700"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-xl font-semibold text-gray-900">Select Date & Time</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={formData.appointment_date}
                  onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                <input
                  type="time"
                  value={formData.appointment_time}
                  onChange={(e) => {
                    const selectedTime = e.target.value;
                    // Validate time for today's date
                    if (formData.appointment_date === new Date().toISOString().split('T')[0]) {
                      const now = new Date();
                      const [hours, minutes] = selectedTime.split(':').map(Number);
                      const selectedDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
                      const oneHourFromNow = now.getTime() + (60 * 60 * 1000); // 1 hour buffer
                      
                      // Don't allow past times or times within 1 hour
                      if (selectedDateTime.getTime() <= oneHourFromNow) {
                        setError('Please select a time at least 1 hour from now');
                        return;
                      }
                      setError(null);
                    }
                    setFormData({ ...formData, appointment_time: selectedTime });
                  }}
                  min={formData.appointment_date === new Date().toISOString().split('T')[0] 
                    ? (() => {
                        const now = new Date();
                        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
                        return `${String(oneHourLater.getHours()).padStart(2, '0')}:${String(oneHourLater.getMinutes()).padStart(2, '0')}`;
                      })()
                    : undefined}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                  required
                />
                {formData.appointment_date === new Date().toISOString().split('T')[0] && (
                  <p className="text-xs text-gray-500 mt-1">Please select a time at least 1 hour from now</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Booking For</label>
                <select
                  value={bookingFor === 'self' ? 'self' : bookingFor}
                  onChange={(e) => setBookingFor(e.target.value === 'self' ? 'self' : parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                >
                  <option value="self">Myself</option>
                  {familyMembers.map((member) => (
                    <option key={member.family_member_id} value={member.family_member_id}>
                      {member.first_name} {member.last_name} ({member.relationship})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason (Optional)</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                  rows={3}
                  placeholder="Reason for the scan..."
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={loading || !formData.appointment_date || !formData.appointment_time || !formData.facility_id}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 hover:shadow-lg hover:scale-105 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-200"
              >
                {loading ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        )}
    </PortalPageShell>
  );
};

export default RadiologyBooking;

