import React from 'react';
import type { AdminFacility, DoctorProfileData } from '../../services/adminService';

interface DoctorProfileFormFieldsProps {
  profile: DoctorProfileData;
  onChange: (profile: DoctorProfileData) => void;
  facilities: AdminFacility[];
}

const DoctorProfileFormFields: React.FC<DoctorProfileFormFieldsProps> = ({
  profile,
  onChange,
  facilities,
}) => {
  const set = (patch: Partial<DoctorProfileData>) => onChange({ ...profile, ...patch });

  return (
    <div className="profile-form-panel space-y-4 p-4">
      <p className="text-sm font-semibold text-slate-200">Doctor profile (patient portal card)</p>

      <div>
        <label className="form-label mb-1 block">Qualifications</label>
        <input
          type="text"
          value={profile.qualification || ''}
          onChange={(e) => set({ qualification: e.target.value })}
          placeholder="e.g. MBBS, MD (Oncology), DM (Medical Oncology)"
          className="form-field w-full px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label mb-1 block">Experience (years)</label>
          <input
            type="number"
            min={0}
            value={profile.experience_years ?? ''}
            onChange={(e) =>
              set({ experience_years: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })
            }
            className="form-field w-full px-3 py-2"
          />
        </div>
        <div>
          <label className="form-label mb-1 block">Consultation fee (₹)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={profile.consultation_fee ?? ''}
            onChange={(e) =>
              set({ consultation_fee: e.target.value === '' ? undefined : parseFloat(e.target.value) })
            }
            className="form-field w-full px-3 py-2"
          />
        </div>
      </div>

      <div>
        <label className="form-label mb-1 block">Primary hospital / facility</label>
        <select
          value={profile.facility_id ?? ''}
          onChange={(e) =>
            set({ facility_id: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })
          }
          className="form-field w-full px-3 py-2"
        >
          <option value="">Select facility (optional)</option>
          {facilities.map((f) => (
            <option key={f.facility_id} value={f.facility_id}>
              {f.name}
              {f.city ? ` — ${f.city}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label mb-1 block">Bio</label>
        <textarea
          rows={3}
          value={profile.bio || ''}
          onChange={(e) => set({ bio: e.target.value })}
          placeholder="Short description shown on the doctor card"
          className="form-field w-full px-3 py-2"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={profile.is_available !== false}
          onChange={(e) => set({ is_available: e.target.checked })}
          className="rounded border-slate-600 bg-slate-900 text-sky-400 focus:ring-sky-500"
        />
        Available for appointments
      </label>
    </div>
  );
};

export default DoctorProfileFormFields;
