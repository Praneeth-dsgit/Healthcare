/**
 * Patient Profile — view and edit patient profile (patient portal)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Save,
  Edit,
  X,
  Mail,
  Phone,
  MapPin,
  Heart,
  Ruler,
  Shield,
  Fingerprint,
} from 'lucide-react';
import { patientService, Patient } from '../../services/patientService';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry',
];

const inputClass =
  'form-field w-full px-3 py-2.5 text-sm transition-all duration-200';

function calcAge(dob: string | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

interface ProfileFieldProps {
  label: string;
  editing: boolean;
  value: React.ReactNode;
  editControl: React.ReactNode;
  className?: string;
}

const ProfileField: React.FC<ProfileFieldProps> = ({
  label,
  editing,
  value,
  editControl,
  className = '',
}) => (
  <div className={className}>
    <label className="form-label mb-1.5 block">{label}</label>
    {editing ? editControl : (
      <p className="text-sm font-medium text-slate-100">{value || '—'}</p>
    )}
  </div>
);

interface ProfileSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  /** Inner field grid: 1 column (narrow cards) or 2 (wider cards) */
  fieldColumns?: 1 | 2;
  className?: string;
}

const ProfileSection: React.FC<ProfileSectionProps> = ({
  title,
  icon,
  children,
  fieldColumns = 2,
  className = '',
}) => (
  <section className={`premium-card flex h-full flex-col p-5 sm:p-6 ${className}`}>
    <div className="mb-4 flex items-center gap-2 border-b border-slate-700/60 pb-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
        {icon}
      </span>
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">{title}</h2>
    </div>
    <div
      className={`grid flex-1 grid-cols-1 gap-4 ${
        fieldColumns === 2 ? 'sm:grid-cols-2' : ''
      }`}
    >
      {children}
    </div>
  </section>
);

const PatientProfile: React.FC = () => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Patient>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const result = await patientService.getProfile();
      if (result.success && result.patient) {
        setPatient(result.patient);
        setFormData(result.patient);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await patientService.updateProfile(formData);
      if (result.success && result.patient) {
        setPatient(result.patient);
        setEditing(false);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<Patient>) => setFormData((prev) => ({ ...prev, ...patch }));

  const displayPatient = editing ? formData : patient;
  const age = useMemo(() => calcAge(patient?.date_of_birth), [patient?.date_of_birth]);

  const initials = useMemo(() => {
    const f = (patient?.first_name || '').charAt(0);
    const l = (patient?.last_name || '').charAt(0);
    return (f + l).toUpperCase() || '?';
  }, [patient?.first_name, patient?.last_name]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl items-center justify-center p-12">
        <div className="premium-card w-full max-w-sm p-6 text-center">
          <div className="healthcare-loading mx-auto mb-3" />
          <p className="font-semibold text-slate-200">Loading profile</p>
          <p className="mt-1 text-sm text-slate-500">Fetching your details…</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="font-semibold text-amber-200">Patient profile not found.</p>
          <p className="mt-1 text-sm text-amber-200/80">Try logging out and back in.</p>
        </div>
      </div>
    );
  }

  const fullName = [displayPatient?.first_name, displayPatient?.last_name].filter(Boolean).join(' ') || 'Patient';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8 animate-fade-in-up">
      {/* Hero — full width */}
      <div className="premium-card w-full overflow-hidden">
        <div className="relative px-5 py-4 sm:px-8 sm:py-5 lg:px-10">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-teal-500/12 via-transparent to-violet-500/8" />
          <div className="relative flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-xl font-extrabold text-slate-950 shadow-lg ring-2 ring-teal-400/30 sm:h-16 sm:w-16 sm:text-2xl">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-300">My Profile</p>
                <h1 className="section-heading break-words text-2xl font-extrabold leading-tight sm:text-3xl">
                  {fullName}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-600/80 bg-slate-900/50 px-2.5 py-0.5 font-mono text-xs text-slate-400">
                    <Fingerprint className="h-3 w-3 text-teal-400" />
                    {patient.patient_id}
                  </span>
                  {age !== null && (
                    <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                      {age} years
                    </span>
                  )}
                  {patient.blood_type && (
                    <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
                      {patient.blood_type}
                    </span>
                  )}
                  {patient.bmi != null && (
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                      BMI {patient.bmi.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="portal-accent-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold"
                >
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="portal-accent-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setFormData(patient);
                    }}
                    className="ghost-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Personal + Health */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <ProfileSection title="Personal information" icon={<User className="h-4 w-4" />} fieldColumns={2}>
        <ProfileField
          label="First name"
          editing={editing}
          value={patient.first_name}
          editControl={
            <input
              type="text"
              className={inputClass}
              value={formData.first_name || ''}
              onChange={(e) => update({ first_name: e.target.value })}
            />
          }
        />
        <ProfileField
          label="Last name"
          editing={editing}
          value={patient.last_name}
          editControl={
            <input
              type="text"
              className={inputClass}
              value={formData.last_name || ''}
              onChange={(e) => update({ last_name: e.target.value })}
            />
          }
        />
        <ProfileField
          label="Date of birth"
          editing={editing}
          value={
            patient.date_of_birth
              ? new Date(patient.date_of_birth).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : 'Not set'
          }
          editControl={
            <input
              type="date"
              className={inputClass}
              value={formData.date_of_birth || ''}
              onChange={(e) => update({ date_of_birth: e.target.value })}
            />
          }
        />
        <ProfileField
          label="Gender"
          editing={editing}
          value={<span className="capitalize">{patient.gender}</span>}
          editControl={
            <select
              className={inputClass}
              value={formData.gender || 'other'}
              onChange={(e) => update({ gender: e.target.value as Patient['gender'] })}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          }
        />
      </ProfileSection>

      <ProfileSection title="Health & vitals" icon={<Heart className="h-4 w-4" />} fieldColumns={2}>
        <ProfileField
          label="Blood type"
          editing={editing}
          value={patient.blood_type || 'Not set'}
          editControl={
            <select
              className={inputClass}
              value={formData.blood_type || ''}
              onChange={(e) => update({ blood_type: e.target.value })}
            >
              <option value="">Select blood type</option>
              <optgroup label="Common">
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bt) => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </optgroup>
              <optgroup label="Rare">
                {[
                  'Bombay (hh)', 'Rh-null', 'Duffy-null', 'Kell-null', 'Kidd-null',
                  'MNS-null', 'Lutheran-null', 'Diego-null', 'Colton-null', 'Vel-negative',
                  'Lan-negative', 'Jr(a)-negative', 'Ok(a)-negative', 'Yt(a)-negative', 'Other Rare',
                ].map((bt) => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </optgroup>
            </select>
          }
        />
        <ProfileField
          label="Height"
          editing={editing}
          value={patient.height_cm ? `${patient.height_cm} cm` : 'Not set'}
          editControl={
            <input
              type="number"
              className={inputClass}
              value={formData.height_cm ?? ''}
              onChange={(e) =>
                update({ height_cm: e.target.value ? parseFloat(e.target.value) : undefined })
              }
            />
          }
        />
        <ProfileField
          label="Weight"
          editing={editing}
          value={patient.weight_kg ? `${patient.weight_kg} kg` : 'Not set'}
          editControl={
            <input
              type="number"
              className={inputClass}
              value={formData.weight_kg ?? ''}
              onChange={(e) =>
                update({ weight_kg: e.target.value ? parseFloat(e.target.value) : undefined })
              }
            />
          }
        />
        {patient.bmi != null && (
          <div>
            <label className="form-label mb-1.5 block">BMI</label>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-sky-300">
              <Ruler className="h-4 w-4" />
              {patient.bmi.toFixed(1)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Calculated from height and weight</p>
          </div>
        )}
      </ProfileSection>
      </div>

      {/* Row 3: Contact + Emergency + Address */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
        <ProfileSection title="Contact" icon={<Mail className="h-4 w-4" />} fieldColumns={1}>
          <ProfileField
            label="Email"
            editing={editing}
            value={patient.email || 'Not set'}
            editControl={
              <input
                type="email"
                className={inputClass}
                value={formData.email || ''}
                onChange={(e) => update({ email: e.target.value })}
              />
            }
          />
          <ProfileField
            label="Phone"
            editing={editing}
            value={patient.phone || 'Not set'}
            editControl={
              <input
                type="tel"
                className={inputClass}
                value={formData.phone || ''}
                onChange={(e) => update({ phone: e.target.value })}
              />
            }
          />
        </ProfileSection>

        <ProfileSection title="Emergency contact" icon={<Shield className="h-4 w-4" />} fieldColumns={1}>
          <ProfileField
            label="Contact name"
            editing={editing}
            value={patient.emergency_contact_name || 'Not set'}
            editControl={
              <input
                type="text"
                className={inputClass}
                value={formData.emergency_contact_name || ''}
                onChange={(e) => update({ emergency_contact_name: e.target.value })}
              />
            }
          />
          <ProfileField
            label="Contact phone"
            editing={editing}
            value={patient.emergency_contact_phone || 'Not set'}
            editControl={
              <input
                type="tel"
                className={inputClass}
                value={formData.emergency_contact_phone || ''}
                onChange={(e) => update({ emergency_contact_phone: e.target.value })}
              />
            }
          />
          <ProfileField
            label="Relationship"
            editing={editing}
            value={patient.emergency_contact_relation || 'Not set'}
            editControl={
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Spouse, Parent"
                value={formData.emergency_contact_relation || ''}
                onChange={(e) => update({ emergency_contact_relation: e.target.value })}
              />
            }
          />
          <p className="text-xs leading-relaxed text-slate-500">
            <Phone className="mb-0.5 mr-1 inline h-3.5 w-3.5" />
            For urgent care only.
          </p>
        </ProfileSection>

        <ProfileSection title="Address" icon={<MapPin className="h-4 w-4" />} fieldColumns={1}>
          <ProfileField
            label="Street address"
            editing={editing}
            value={patient.address || 'Not set'}
            editControl={
              <input
                type="text"
                className={inputClass}
                value={formData.address || ''}
                onChange={(e) => update({ address: e.target.value })}
              />
            }
          />
          <ProfileField
            label="City"
            editing={editing}
            value={patient.city || 'Not set'}
            editControl={
              <input
                type="text"
                className={inputClass}
                value={formData.city || ''}
                onChange={(e) => update({ city: e.target.value })}
              />
            }
          />
          <ProfileField
            label="State"
            editing={editing}
            value={patient.state || 'Not set'}
            editControl={
              <select
                className={inputClass}
                value={formData.state || ''}
                onChange={(e) => update({ state: e.target.value })}
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            }
          />
        </ProfileSection>
      </div>
    </div>
  );
};

export default PatientProfile;
