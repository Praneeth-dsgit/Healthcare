/**
 * Family Members — manage family linked to primary patient
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Mail,
  Phone,
  Heart,
  User,
  X,
  Save,
} from 'lucide-react';
import { patientService, FamilyMember } from '../../services/patientService';

const inputClass =
  'form-field w-full px-2.5 py-2 text-sm transition-all duration-200';

const labelClass = 'form-label mb-1 block text-xs';

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getInitials(first: string, last: string): string {
  return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';
}

const relationshipColors: Record<string, string> = {
  spouse: 'bg-violet-500/15 text-violet-300',
  child: 'bg-sky-500/15 text-sky-300',
  parent: 'bg-amber-500/15 text-amber-300',
  sibling: 'bg-emerald-500/15 text-emerald-300',
  other: 'bg-slate-500/20 text-slate-300',
};

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p>
    <p className="mt-0.5 text-sm font-medium text-slate-100">{value || '—'}</p>
  </div>
);

interface MemberCardProps {
  member: FamilyMember;
  onEdit: () => void;
  onDelete: () => void;
  onBook: () => void;
}

const MemberCard: React.FC<MemberCardProps> = ({ member, onEdit, onDelete, onBook }) => {
  const age = calcAge(member.date_of_birth);
  const initials = getInitials(member.first_name, member.last_name);
  const relClass = relationshipColors[member.relationship] || relationshipColors.other;

  return (
    <article className="premium-card flex h-full flex-col overflow-hidden">
      {/* Card hero */}
      <div className="border-b border-slate-700/60 bg-gradient-to-r from-teal-500/8 to-transparent px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-lg font-extrabold text-slate-950 ring-2 ring-teal-400/25">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-slate-100">
                {member.first_name} {member.last_name}
              </h3>
              <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${relClass}`}>
                {member.relationship}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg p-2 text-teal-300 transition-colors hover:bg-slate-800/80"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg p-2 text-rose-400 transition-colors hover:bg-rose-500/10"
              title="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Row: Personal | Health */}
      <div className="grid flex-1 grid-cols-1 gap-0 sm:grid-cols-2">
        <div className="space-y-3 border-slate-700/40 p-5 sm:border-r">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <User className="h-3.5 w-3.5 text-teal-400" />
            Personal
          </div>
          <DetailRow
            label="Date of birth"
            value={
              <>
                {new Date(member.date_of_birth).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
                {age !== null && <span className="text-slate-400"> ({age} yrs)</span>}
              </>
            }
          />
          <DetailRow label="Gender" value={<span className="capitalize">{member.gender}</span>} />
        </div>

        <div className="space-y-3 p-5">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Heart className="h-3.5 w-3.5 text-rose-400" />
            Health
          </div>
          <DetailRow label="Blood type" value={member.blood_type || 'Not set'} />
          {(member.height_cm || member.weight_kg) && (
            <DetailRow
              label="Height / weight"
              value={`${member.height_cm ? `${member.height_cm} cm` : '—'} / ${member.weight_kg ? `${member.weight_kg} kg` : '—'}`}
            />
          )}
          {member.allergies && (
            <DetailRow
              label="Allergies"
              value={
                member.allergies.length > 60
                  ? `${member.allergies.slice(0, 60)}…`
                  : member.allergies
              }
            />
          )}
          {member.medical_history && (
            <DetailRow
              label="Medical history"
              value={
                member.medical_history.length > 60
                  ? `${member.medical_history.slice(0, 60)}…`
                  : member.medical_history
              }
            />
          )}
        </div>
      </div>

      {/* Row: Contact + action */}
      <div className="mt-auto border-t border-slate-700/60 bg-slate-900/30 px-5 py-4 sm:px-6">
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          {member.phone && (
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <Phone className="h-3.5 w-3.5 text-slate-500" />
              {member.phone}
            </span>
          )}
          {member.email && (
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-slate-300">
              <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="truncate">{member.email}</span>
            </span>
          )}
          {!member.phone && !member.email && (
            <span className="text-xs text-slate-500">No contact details</span>
          )}
        </div>
        <button
          type="button"
          onClick={onBook}
          className="portal-accent-button flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
        >
          <Calendar className="h-4 w-4" />
          Book Appointment
        </button>
      </div>
    </article>
  );
};

const FamilyMembers: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);

  useEffect(() => {
    loadFamilyMembers();
    if ((location.state as { showAddForm?: boolean })?.showAddForm) {
      setShowAddForm(true);
    }
  }, [location.state]);

  const loadFamilyMembers = async () => {
    setLoading(true);
    try {
      const result = await patientService.getFamilyMembers();
      if (result.success && result.family_members) {
        setFamilyMembers(result.family_members);
      }
    } catch (error) {
      console.error('Error loading family members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (
    memberData: Omit<FamilyMember, 'family_member_id' | 'primary_patient_id' | 'is_active'>
  ) => {
    try {
      const result = await patientService.addFamilyMember(memberData);
      if (result.success) {
        await loadFamilyMembers();
        setShowAddForm(false);
      }
    } catch (error) {
      console.error('Error adding family member:', error);
    }
  };

  const handleUpdateMember = async (memberId: number, memberData: Partial<FamilyMember>) => {
    try {
      const result = await patientService.updateFamilyMember(memberId, memberData);
      if (result.success) {
        await loadFamilyMembers();
        setEditingMember(null);
      }
    } catch (error) {
      console.error('Error updating family member:', error);
    }
  };

  const handleDeleteMember = async (memberId: number) => {
    if (!window.confirm('Are you sure you want to remove this family member?')) {
      return;
    }
    try {
      const result = await patientService.deleteFamilyMember(memberId);
      if (result.success) {
        await loadFamilyMembers();
      }
    } catch (error) {
      console.error('Error deleting family member:', error);
    }
  };

  const relationshipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    familyMembers.forEach((m) => {
      counts[m.relationship] = (counts[m.relationship] || 0) + 1;
    });
    return counts;
  }, [familyMembers]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl items-center justify-center p-12">
        <div className="premium-card w-full max-w-sm p-6 text-center">
          <div className="healthcare-loading mx-auto mb-3" />
          <p className="font-semibold text-slate-200">Loading family</p>
          <p className="mt-1 text-sm text-slate-500">Fetching members…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8 animate-fade-in-up">
      {/* Hero — full width */}
      <div className="premium-card w-full overflow-hidden">
        <div className="relative px-5 py-4 sm:px-8 sm:py-5 lg:px-10">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-teal-500/12 via-transparent to-violet-500/8" />
          <div className="relative flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg ring-2 ring-teal-400/30 sm:h-16 sm:w-16">
                <Users className="h-7 w-7 text-slate-950 sm:h-8 sm:w-8" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-300">Care circle</p>
                <h1 className="section-heading text-2xl font-extrabold leading-tight sm:text-3xl">
                  Your Family
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-teal-500/15 px-3 py-1 text-sm font-bold text-teal-200">
                    {familyMembers.length} member{familyMembers.length !== 1 ? 's' : ''}
                  </span>
                  {Object.entries(relationshipCounts).map(([rel, count]) => (
                    <span
                      key={rel}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${relationshipColors[rel] || relationshipColors.other}`}
                    >
                      {count} {rel}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="portal-accent-button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold"
            >
              <Plus className="h-4 w-4" />
              Add Family Member
            </button>
          </div>
        </div>
      </div>

      {/* Members grid */}
      {familyMembers.length === 0 ? (
        <div className="premium-card p-12 text-center sm:p-16">
          <Users className="mx-auto mb-4 h-16 w-16 text-slate-600" />
          <p className="text-lg font-semibold text-slate-200">No family members yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Add spouse, children, or parents to book appointments and manage their health information in one place.
          </p>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="portal-accent-button mt-6 inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold"
          >
            <Plus className="h-4 w-4" />
            Add Your First Family Member
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {familyMembers.map((member) => (
            <MemberCard
              key={member.family_member_id}
              member={member}
              onEdit={() => setEditingMember(member)}
              onDelete={() => handleDeleteMember(member.family_member_id)}
              onBook={() =>
                navigate('/portal/appointments', {
                  state: { familyMemberId: member.family_member_id },
                })
              }
            />
          ))}
        </div>
      )}

      {showAddForm && (
        <FamilyMemberForm
          member={null}
          onSave={handleAddMember}
          onClose={() => setShowAddForm(false)}
        />
      )}
      {editingMember && (
        <FamilyMemberForm
          member={editingMember}
          onSave={(data) => handleUpdateMember(editingMember.family_member_id, data)}
          onClose={() => setEditingMember(null)}
        />
      )}
    </div>
  );
};

interface FamilyMemberFormProps {
  member?: FamilyMember | null;
  onSave: (
    data: Omit<FamilyMember, 'family_member_id' | 'primary_patient_id' | 'is_active'>
  ) => void;
  onClose: () => void;
}

const FamilyMemberForm: React.FC<FamilyMemberFormProps> = ({ member, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    first_name: member?.first_name || '',
    last_name: member?.last_name || '',
    date_of_birth: member?.date_of_birth || '',
    gender: member?.gender || 'other',
    relationship: member?.relationship || 'other',
    phone: member?.phone || '',
    email: member?.email || '',
    blood_type: member?.blood_type || '',
    height_cm: member?.height_cm as number | undefined,
    weight_kg: member?.weight_kg as number | undefined,
    medical_history: member?.medical_history || '',
    allergies: member?.allergies || '',
  });

  const update = (patch: Partial<typeof formData>) =>
    setFormData((prev) => ({ ...prev, ...patch }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const age = formData.date_of_birth ? calcAge(formData.date_of_birth) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="modal-surface flex w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-700/60 px-4 py-3">
          <h2 className="text-base font-bold text-slate-100">
            {member ? 'Edit family member' : 'Add family member'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[min(520px,calc(100vh-4rem))] flex-col">
          <div className="space-y-3 overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Relationship</label>
                <select
                  className={inputClass}
                  value={formData.relationship}
                  onChange={(e) => update({ relationship: e.target.value as FamilyMember['relationship'] })}
                  required
                >
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="parent">Parent</option>
                  <option value="sibling">Sibling</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>First name</label>
                <input
                  type="text"
                  className={inputClass}
                  value={formData.first_name}
                  onChange={(e) => update({ first_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Last name</label>
                <input
                  type="text"
                  className={inputClass}
                  value={formData.last_name}
                  onChange={(e) => update({ last_name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className={labelClass}>Date of birth</label>
                <input
                  type="date"
                  className={inputClass}
                  value={formData.date_of_birth}
                  onChange={(e) => update({ date_of_birth: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Age</label>
                <input
                  type="text"
                  className={`${inputClass} opacity-70`}
                  value={age !== null ? `${age} yrs` : ''}
                  disabled
                  readOnly
                />
              </div>
              <div>
                <label className={labelClass}>Gender</label>
                <select
                  className={inputClass}
                  value={formData.gender}
                  onChange={(e) => update({ gender: e.target.value as FamilyMember['gender'] })}
                  required
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Blood type</label>
                <select
                  className={inputClass}
                  value={formData.blood_type}
                  onChange={(e) => update({ blood_type: e.target.value })}
                >
                  <option value="">—</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className={labelClass}>Height (cm)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={formData.height_cm ?? ''}
                  onChange={(e) =>
                    update({ height_cm: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Weight (kg)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={formData.weight_kg ?? ''}
                  onChange={(e) =>
                    update({ weight_kg: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  type="tel"
                  className={inputClass}
                  value={formData.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  className={inputClass}
                  value={formData.email}
                  onChange={(e) => update({ email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Medical history (optional)</label>
                <textarea
                  className={inputClass}
                  rows={1}
                  value={formData.medical_history}
                  onChange={(e) => update({ medical_history: e.target.value })}
                  placeholder="Past conditions, surgeries"
                />
              </div>
              <div>
                <label className={labelClass}>Allergies (optional)</label>
                <textarea
                  className={inputClass}
                  rows={1}
                  value={formData.allergies}
                  onChange={(e) => update({ allergies: e.target.value })}
                  placeholder="Medications, food, etc."
                />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 gap-2 border-t border-slate-700/60 px-4 py-3">
            <button
              type="submit"
              className="portal-accent-button flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold"
            >
              <Save className="h-3.5 w-3.5" />
              {member ? 'Update' : 'Add member'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ghost-button flex-1 rounded-lg py-2 text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FamilyMembers;
