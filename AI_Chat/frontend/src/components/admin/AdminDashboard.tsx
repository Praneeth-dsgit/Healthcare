/**
 * Admin Dashboard Component
 * HR/Admin interface for user management, role assignment, and access control
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, UserPlus, Search, Edit, Trash2, Shield, 
  Stethoscope, FlaskConical, UserCog, User as UserIcon, LogOut, ChevronDown,
  ChevronLeft, ChevronRight, X, Check, AlertCircle, CheckCircle, XCircle
} from 'lucide-react';
import {
  adminService,
  User,
  Specialty,
  CreateUserData,
  UnassignedStaff,
  AssignRoleData,
  AdminFacility,
  DoctorProfileData,
  UpdateUserData,
} from '../../services/adminService';
import { roleService } from '../../services/roleService';
import DoctorProfileFormFields from './DoctorProfileFormFields';
import SegmentTabs from '../ui/SegmentTabs';

const ROLE_FILTER_TABS = [
  { id: '', label: 'All Users', icon: Users },
  { id: 'unassigned', label: 'Unassigned Staff', icon: UserPlus },
  { id: 'patient', label: 'Patients', icon: Users },
  { id: 'doctor', label: 'Doctors', icon: Stethoscope },
  { id: 'radiology', label: 'Radiology', icon: Stethoscope },
  { id: 'lab_technician', label: 'Lab Technicians', icon: FlaskConical },
  { id: 'non_medical_staff', label: 'Non-Medical Staff', icon: UserCog },
  { id: 'admin', label: 'Admins', icon: Shield },
];

const emptyDoctorProfile = (): DoctorProfileData => ({
  qualification: '',
  experience_years: undefined,
  consultation_fee: undefined,
  bio: '',
  facility_id: undefined,
  is_available: true,
});

const isDoctorRole = (role?: string) => role === 'doctor' || role === 'radiology';

/** Prefer explicit staff role over legacy rows where users.role defaults to patient. */
const getEffectiveUserRole = (user: User): string => {
  const r = (user.role || '').toLowerCase();
  const ur = (user.user_role || '').toLowerCase();
  if (r === 'radiology' || ur === 'radiology') return 'radiology';
  if (r === 'doctor' || ur === 'doctor') return 'doctor';
  if (['admin', 'lab_technician', 'non_medical_staff'].includes(r)) return r;
  if (['admin', 'lab_technician', 'non_medical_staff'].includes(ur)) return ur;
  return user.role || user.user_role || '';
};

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [facilities, setFacilities] = useState<AdminFacility[]>([]);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileData>(emptyDoctorProfile());
  const [showDoctorProfileModal, setShowDoctorProfileModal] = useState(false);
  const [profileEditDoctorId, setProfileEditDoctorId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const navigate = useNavigate();
  const adminEmail = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('userEmail') || 'Admin' : 'Admin';

  const handleLogout = () => {
    import('../../services/authService').then((m) => m.clearAuth());
    roleService.clearCache();
    navigate('/login');
  };

  // Unassigned staff state
  const [unassignedStaff, setUnassignedStaff] = useState<UnassignedStaff[]>([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<UnassignedStaff | null>(null);
  const [assignFormData, setAssignFormData] = useState<AssignRoleData>({
    email: '',
    password: '',
    role: 'doctor',
    doctor_id: undefined,
    specialty_id: undefined,
  });

  // Form state
  const [formData, setFormData] = useState<CreateUserData>({
    email: '',
    password: '',
    role: 'doctor',
    first_name: '',
    last_name: '',
    phone: '',
    specialty_id: undefined,
  });

  useEffect(() => {
    loadSpecialties();
    loadFacilities();
    adminService.repairMissingDoctorProfiles().then((result) => {
      if (result.success && result.repaired && result.repaired.length > 0) {
        loadUsers();
      }
    });
  }, []);

  useEffect(() => {
    loadUsers();
    if (roleFilter === 'unassigned') {
      loadUnassignedStaff();
    }
  }, [page, roleFilter, searchTerm]);

  useEffect(() => {
    if (!success && !error) return;
    const timer = window.setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [success, error]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const result = await adminService.listUsers({
        role: roleFilter || undefined,
        search: searchTerm || undefined,
        page,
        per_page: perPage,
      });
      
      if (result.success && result.users) {
        setUsers(result.users);
        if (result.pagination) {
          setTotalPages(result.pagination.pages || 1);
        }
      } else {
        setError(result.error || 'Failed to load users');
      }
    } catch (err) {
      setError('Error loading users');
    } finally {
      setLoading(false);
    }
  };

  const loadSpecialties = async () => {
    try {
      const result = await adminService.getSpecialties();
      if (result.success && result.specialties) {
        setSpecialties(result.specialties);
      }
    } catch (err) {
      console.error('Error loading specialties:', err);
    }
  };

  const loadFacilities = async () => {
    try {
      const result = await adminService.listFacilities();
      if (result.success && result.facilities) {
        setFacilities(result.facilities);
      }
    } catch (err) {
      console.error('Error loading facilities:', err);
    }
  };

  const applyDoctorProfileFromApi = (p: {
    qualification?: string;
    experience_years?: number;
    consultation_fee?: number;
    bio?: string;
    facility_id?: number;
    is_available?: boolean;
    first_name?: string;
    last_name?: string;
    phone?: string;
    specialty_id?: number;
  }) => {
    setDoctorProfile({
      qualification: p.qualification || '',
      experience_years: p.experience_years,
      consultation_fee: p.consultation_fee,
      bio: p.bio || '',
      facility_id: p.facility_id,
      is_available: p.is_available !== false,
    });
    setFormData((prev) => ({
      ...prev,
      first_name: p.first_name || prev.first_name || '',
      last_name: p.last_name || prev.last_name || '',
      phone: p.phone || prev.phone || '',
      specialty_id: p.specialty_id ?? prev.specialty_id,
    }));
  };

  const loadDoctorProfileForUser = async (user: User) => {
    if (user.doctor_id) {
      const result = await adminService.getDoctorProfile(user.doctor_id);
      if (result.success && result.profile) {
        applyDoctorProfileFromApi(result.profile);
        return;
      }
    }
    const byUser = await adminService.getUserDoctor(user.id);
    if (byUser.success && byUser.profile) {
      applyDoctorProfileFromApi(byUser.profile);
      return;
    }
    setDoctorProfile(emptyDoctorProfile());
  };

  const loadUnassignedStaff = async () => {
    setLoadingUnassigned(true);
    try {
      const result = await adminService.listUnassignedStaff();
      if (result.success && result.staff) {
        setUnassignedStaff(result.staff);
      } else {
        setError(result.error || 'Failed to load unassigned staff');
      }
    } catch (err) {
      setError('Error loading unassigned staff');
    } finally {
      setLoadingUnassigned(false);
    }
  };

  const handleAssignRoleClick = (staff: UnassignedStaff) => {
    setSelectedStaff(staff);
    // Pre-fill email if available
    const defaultRole = staff.specialty_name?.toLowerCase().includes('radiology') ? 'radiology' : 'doctor';
    setAssignFormData({
      email: staff.email || '',
      password: '',
      role: defaultRole as any,
      doctor_id: staff.doctor_id,
      specialty_id: staff.specialty_id,
    });
    setShowAssignModal(true);
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    setError(null);
    setSuccess(null);

    try {
      const result = await adminService.assignRoleToStaff(assignFormData);
      if (result.success) {
        setSuccess(result.message || 'Role assigned successfully');
        setShowAssignModal(false);
        setSelectedStaff(null);
        setAssignFormData({
          email: '',
          password: '',
          role: 'doctor',
          doctor_id: undefined,
          specialty_id: undefined,
        });
        loadUnassignedStaff();
        loadUsers(); // Refresh user list
      } else {
        setError(result.error || 'Failed to assign role');
      }
    } catch (err) {
      setError('Error assigning role');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const payload: CreateUserData = { ...formData };
      if (isDoctorRole(formData.role)) {
        Object.assign(payload, doctorProfile);
      }
      const result = await adminService.createUser(payload);
      if (result.success) {
        setSuccess(result.message || 'User created successfully');
        setShowCreateModal(false);
        resetForm();
        loadUsers();
      } else {
        setError(result.error || 'Failed to create user');
      }
    } catch (err) {
      setError('Error creating user');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setError(null);
    setSuccess(null);

    try {
      const updateData: UpdateUserData = {};
      if (formData.email) updateData.email = formData.email;
      if (formData.password) updateData.password = formData.password;
      if (formData.role) updateData.role = formData.role;
      if (formData.first_name) updateData.first_name = formData.first_name;
      if (formData.last_name) updateData.last_name = formData.last_name;
      if (formData.phone) updateData.phone = formData.phone;
      if (formData.specialty_id) updateData.specialty_id = formData.specialty_id;

      if (isDoctorRole(formData.role)) {
        Object.assign(updateData, doctorProfile);
      }

      const result = await adminService.updateUser(selectedUser.id, updateData);
      if (result.success) {
        setSuccess(result.message || 'User updated successfully');
        setShowEditModal(false);
        setSelectedUser(null);
        resetForm();
        loadUsers();
      } else {
        setError(result.error || 'Failed to update user');
      }
    } catch (err) {
      setError('Error updating user');
    }
  };

  const handleOpenDoctorProfile = async (doctorId: number) => {
    setProfileEditDoctorId(doctorId);
    const result = await adminService.getDoctorProfile(doctorId);
    if (result.success && result.profile) {
      applyDoctorProfileFromApi(result.profile);
    } else {
      setDoctorProfile(emptyDoctorProfile());
    }
    setShowDoctorProfileModal(true);
  };

  const handleSaveDoctorProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileEditDoctorId) return;

    setError(null);
    setSuccess(null);

    try {
      const result = await adminService.updateDoctorProfile(profileEditDoctorId, doctorProfile);
      if (result.success) {
        setSuccess(result.message || 'Doctor profile updated');
        setShowDoctorProfileModal(false);
        setProfileEditDoctorId(null);
        setDoctorProfile(emptyDoctorProfile());
        if (roleFilter === 'unassigned') {
          loadUnassignedStaff();
        }
        loadUsers();
      } else {
        setError(result.error || 'Failed to update doctor profile');
      }
    } catch {
      setError('Error updating doctor profile');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm('Are you sure you want to deactivate this user?')) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const result = await adminService.deleteUser(userId);
      if (result.success) {
        setSuccess(result.message || 'User deactivated successfully');
        loadUsers();
      } else {
        setError(result.error || 'Failed to delete user');
      }
    } catch (err) {
      setError('Error deleting user');
    }
  };

  const handleVerifyUser = async (userId: number, currentVerified: boolean) => {
    const action = currentVerified ? 'unverify' : 'verify';
    if (!window.confirm(`Are you sure you want to ${action} this user account?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const result = await adminService.verifyUser(userId, !currentVerified);
      if (result.success) {
        setSuccess(result.message || `User ${action}ed successfully`);
        loadUsers();
      } else {
        setError(result.error || `Failed to ${action} user`);
      }
    } catch (err) {
      setError(`Error ${action}ing user`);
    }
  };

  const handleEditClick = async (user: User) => {
    setSelectedUser(user);
    const effectiveRole = getEffectiveUserRole(user) as CreateUserData['role'];
    setFormData({
      email: user.email,
      password: '',
      role: effectiveRole || 'doctor',
      first_name: '',
      last_name: '',
      phone: '',
      specialty_id: user.specialty_id,
    });
    setDoctorProfile(emptyDoctorProfile());
    if (isDoctorRole(effectiveRole)) {
      await loadDoctorProfileForUser(user);
    }
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      role: 'doctor',
      first_name: '',
      last_name: '',
      phone: '',
      specialty_id: undefined,
    });
    setDoctorProfile(emptyDoctorProfile());
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'doctor':
        return <Stethoscope className="w-4 h-4" />;
      case 'radiology':
        return <Stethoscope className="w-4 h-4" />;
      case 'lab_technician':
        return <FlaskConical className="w-4 h-4" />;
      case 'admin':
        return <Shield className="w-4 h-4" />;
      case 'non_medical_staff':
        return <UserCog className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'doctor':
        return 'role-badge-doctor';
      case 'radiology':
        return 'role-badge-radiology';
      case 'lab_technician':
        return 'role-badge-lab';
      case 'admin':
        return 'role-badge-admin';
      case 'non_medical_staff':
        return 'role-badge-staff';
      default:
        return 'role-badge-default';
    }
  };

  return (
    <div className="min-h-screen app-page" data-portal="doctor">
      <div className="portal-header shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div>
                <h1 className="text-2xl font-bold brand-gradient-text">Acufore Health</h1>
                <p className="text-xs text-slate-400 font-medium">Healthcare Management</p>
              </div>
              <div className="h-12 w-px bg-slate-600/60"></div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Admin Dashboard</h1>
                <p className="text-sm text-slate-400 mt-1">User Management & Access Control</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  resetForm();
                  setShowCreateModal(true);
                }}
                className="portal-accent-button flex items-center gap-2 px-4 py-2 rounded-lg"
              >
                <UserPlus className="w-5 h-5" />
                Create User
              </button>
              {/* Profile Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center border border-sky-500/30">
                      <UserIcon className="w-6 h-6 text-sky-300" />
                    </div>
                    <div className="text-left hidden sm:block">
                      <p className="text-sm font-medium text-slate-100">{adminEmail}</p>
                      <p className="text-xs text-slate-400">Administrator</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
                </button>
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />
                    <div className="dropdown-menu absolute right-0 mt-2 w-48 z-20">
                      <div className="py-1">
                        <div className="px-4 py-3 border-b border-slate-700/50 sm:hidden">
                          <p className="text-sm font-medium text-slate-100">{adminEmail}</p>
                          <p className="text-xs text-slate-400 mt-1">Administrator</p>
                        </div>
                        <button
                          onClick={() => { setShowProfileMenu(false); handleLogout(); }}
                          className="w-full flex items-center px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/80 transition-colors"
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

      {/* Role filter capsules + search */}
      <div className="filter-bar border-b">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SegmentTabs
              tabs={ROLE_FILTER_TABS}
              activeTab={roleFilter}
              onChange={(id) => {
                setRoleFilter(id);
                setPage(1);
              }}
              className="min-w-0 max-w-full shrink"
            />
            {roleFilter !== 'unassigned' && (
              <div className="relative w-full shrink-0 lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by email or name..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="form-field w-full py-2 pl-9 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="w-full px-4 sm:px-6 lg:px-8 pb-4">
        {/* Unassigned Staff Table */}
        {roleFilter === 'unassigned' ? (
          <div className="content-panel overflow-hidden">
            {loadingUnassigned ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading unassigned staff...</p>
              </div>
            ) : unassignedStaff.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>No unassigned staff found</p>
                <p className="text-sm mt-2">All staff members have user accounts assigned</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="data-table-head">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff Member</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specialty</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joining Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="data-table-body divide-y divide-slate-700/50">
                    {unassignedStaff.map((staff) => (
                      <tr key={staff.doctor_id} className="data-table-row">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            Doctor ID: {staff.doctor_id}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {staff.first_name} {staff.last_name}
                          </div>
                          {staff.qualification && (
                            <div className="text-xs text-gray-500">{staff.qualification}</div>
                          )}
                          {staff.experience_years !== undefined && (
                            <div className="text-xs text-gray-500">{staff.experience_years} years experience</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">{staff.specialty_name || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{staff.email || 'N/A'}</div>
                          {staff.phone && (
                            <div className="text-xs text-gray-500">{staff.phone}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {staff.created_at ? (
                            <div>
                              <div>{new Date(staff.created_at).toLocaleDateString()}</div>
                              <div className="text-xs text-gray-400">{new Date(staff.created_at).toLocaleTimeString()}</div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                            <button
                              type="button"
                              onClick={() => handleOpenDoctorProfile(staff.doctor_id)}
                              className="text-slate-600 hover:text-slate-900 flex items-center gap-1"
                              title="Edit doctor profile"
                            >
                              <Edit className="w-4 h-4" />
                              Edit profile
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAssignRoleClick(staff)}
                              className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                              title="Assign Role"
                            >
                              <UserPlus className="w-4 h-4" />
                              Assign Role
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Users Table */
          <div className="content-panel overflow-hidden">
            {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No users found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="data-table-head">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joining Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="data-table-body divide-y divide-slate-700/50">
                    {users.map((user) => (
                      <tr key={user.id} className="data-table-row">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.patient_id && user.user_role === 'patient' && (
                            <div className="text-sm font-medium text-gray-900">Patient ID: {user.patient_id}</div>
                          )}
                          {user.employee_id && ['admin', 'lab_technician', 'non_medical_staff'].includes(user.user_role || '') && (
                            <div className="text-sm font-medium text-gray-900">Employee ID: {user.employee_id}</div>
                          )}
                          {user.doctor_id && (user.user_role === 'doctor' || user.user_role === 'radiology') && (
                            <div className="text-sm font-medium text-gray-900">Doctor ID: {user.doctor_id}</div>
                          )}
                          {user.employee_id && (user.user_role === 'doctor' || user.user_role === 'radiology') && (
                            <div className="text-xs text-gray-500">Employee ID: {user.employee_id}</div>
                          )}
                          {!user.patient_id && !user.employee_id && !user.doctor_id && (
                            <div className="text-sm text-gray-400">-</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{user.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.user_role ? (
                            <>
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.user_role)}`}>
                                {getRoleIcon(user.user_role)}
                                {user.user_role}
                              </span>
                              {user.specialty_name && (
                                <div className="text-xs text-gray-500 mt-1">{user.specialty_name}</div>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <AlertCircle className="w-4 h-4" />
                              No Role Assigned
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            user.is_verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {user.is_verified ? 'Verified' : 'Unverified'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.created_at ? (
                            <div>
                              <div>{new Date(user.created_at).toLocaleDateString()}</div>
                              <div className="text-xs text-gray-400">{new Date(user.created_at).toLocaleTimeString()}</div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleVerifyUser(user.id, user.is_verified)}
                              className={`${
                                user.is_verified 
                                  ? 'text-orange-600 hover:text-orange-900' 
                                  : 'text-green-600 hover:text-green-900'
                              }`}
                              title={user.is_verified ? 'Unverify Account' : 'Verify Account'}
                            >
                              {user.is_verified ? (
                                <XCircle className="w-4 h-4" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleEditClick(user)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-slate-900/40 px-6 py-3 flex items-center justify-between border-t border-slate-700/50">
                  <div className="text-sm text-gray-700">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="modal-surface max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-100">Create New User</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="text-slate-400 transition-colors hover:text-slate-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="form-label mb-1 block">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="form-field w-full px-3 py-2"
                  />
                </div>

                <div>
                  <label className="form-label mb-1 block">Password *</label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="form-field w-full px-3 py-2"
                  />
                </div>

                <div>
                  <label className="form-label mb-1 block">Role *</label>
                  <select
                    required
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value as any;
                      // For radiology, automatically find and set Radiology specialty
                      if (newRole === 'radiology') {
                        const radiologySpecialty = specialties.find(s => s.name.toLowerCase().includes('radiology'));
                        setFormData({ ...formData, role: newRole, specialty_id: radiologySpecialty?.specialty_id });
                      } else {
                        setFormData({ ...formData, role: newRole, specialty_id: undefined });
                      }
                    }}
                    className="form-field w-full px-3 py-2"
                  >
                    <option value="doctor">Doctor (General Practitioner)</option>
                    <option value="radiology">Radiology Doctor</option>
                    <option value="lab_technician">Lab Technician</option>
                    <option value="non_medical_staff">Patient Engagement Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {formData.role === 'doctor' && 'Access to General Practitioner Dashboard'}
                    {formData.role === 'radiology' && 'Access to Radiology Dashboard'}
                    {formData.role === 'lab_technician' && 'Access to Lab capabilities'}
                    {formData.role === 'non_medical_staff' && 'Access to Patient Engagement capabilities'}
                    {formData.role === 'admin' && 'Full system access'}
                  </p>
                </div>

                {formData.role === 'doctor' && (
                  <div>
                    <label className="form-label mb-1 block">Specialty *</label>
                    <select
                      required
                      value={formData.specialty_id || ''}
                      onChange={(e) => setFormData({ ...formData, specialty_id: parseInt(e.target.value) })}
                      className="form-field w-full px-3 py-2"
                    >
                      <option value="">Select Specialty</option>
                      {specialties
                        .filter(spec => !spec.name.toLowerCase().includes('radiology'))
                        .map((spec) => (
                          <option key={spec.specialty_id} value={spec.specialty_id}>
                            {spec.name}
                          </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Select a specialty for General Practitioner access (Radiology is a separate role)
                    </p>
                  </div>
                )}

                <div>
                  <label className="form-label mb-1 block">First Name</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="form-field w-full px-3 py-2"
                  />
                </div>

                <div>
                  <label className="form-label mb-1 block">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="form-field w-full px-3 py-2"
                  />
                </div>

                <div>
                  <label className="form-label mb-1 block">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="form-field w-full px-3 py-2"
                  />
                </div>

                {isDoctorRole(formData.role) && (
                  <DoctorProfileFormFields
                    profile={doctorProfile}
                    onChange={setDoctorProfile}
                    facilities={facilities}
                  />
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="portal-accent-button flex-1 py-2 px-4 rounded-lg"
                  >
                    Create User
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    className="btn-secondary flex-1 py-2 px-4 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="modal-surface max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-100">Edit User</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                    resetForm();
                  }}
                  className="text-slate-400 transition-colors hover:text-slate-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label className="form-label mb-1 block">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="form-field w-full px-3 py-2"
                  />
                </div>

                <div>
                  <label className="form-label mb-1 block">New Password (leave blank to keep current)</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="form-field w-full px-3 py-2"
                  />
                </div>

                <div>
                  <label className="form-label mb-1 block">Role *</label>
                  <select
                    required
                    value={formData.role}
                    onChange={async (e) => {
                      const newRole = e.target.value as CreateUserData['role'];
                      if (newRole === 'radiology') {
                        const radiologySpecialty = specialties.find((s) =>
                          s.name.toLowerCase().includes('radiology')
                        );
                        setFormData({
                          ...formData,
                          role: newRole,
                          specialty_id: radiologySpecialty?.specialty_id,
                        });
                      } else if (newRole === 'doctor') {
                        setFormData({ ...formData, role: newRole });
                      } else {
                        setFormData({ ...formData, role: newRole, specialty_id: undefined });
                        setDoctorProfile(emptyDoctorProfile());
                        return;
                      }
                      if (selectedUser && isDoctorRole(newRole)) {
                        await loadDoctorProfileForUser(selectedUser);
                      }
                    }}
                    className="form-field w-full px-3 py-2"
                  >
                    <option value="">-- Select Role --</option>
                    <option value="doctor">Doctor (General Practitioner)</option>
                    <option value="radiology">Radiology Doctor</option>
                    <option value="lab_technician">Lab Technician</option>
                    <option value="non_medical_staff">Patient Engagement Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {!formData.role && 'Assign a role to grant access to specific dashboards'}
                    {formData.role === 'doctor' && 'Access to General Practitioner Dashboard'}
                    {formData.role === 'radiology' && 'Access to Radiology Dashboard'}
                    {formData.role === 'lab_technician' && 'Access to Lab capabilities'}
                    {formData.role === 'non_medical_staff' && 'Access to Patient Engagement capabilities'}
                    {formData.role === 'admin' && 'Full system access'}
                  </p>
                </div>

                {formData.role === 'doctor' && (
                  <div>
                    <label className="form-label mb-1 block">Specialty *</label>
                    <select
                      required
                      value={formData.specialty_id || ''}
                      onChange={(e) => setFormData({ ...formData, specialty_id: parseInt(e.target.value) })}
                      className="form-field w-full px-3 py-2"
                    >
                      <option value="">Select Specialty</option>
                      {specialties
                        .filter(spec => !spec.name.toLowerCase().includes('radiology'))
                        .map((spec) => (
                          <option key={spec.specialty_id} value={spec.specialty_id}>
                            {spec.name}
                          </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Select a specialty for General Practitioner access (Radiology is a separate role)
                    </p>
                  </div>
                )}

                {isDoctorRole(formData.role) && (
                  <>
                    <div>
                      <label className="form-label mb-1 block">First Name</label>
                      <input
                        type="text"
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                        className="form-field w-full px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="form-label mb-1 block">Last Name</label>
                      <input
                        type="text"
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                        className="form-field w-full px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="form-label mb-1 block">Phone</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="form-field w-full px-3 py-2"
                      />
                    </div>
                    <DoctorProfileFormFields
                      profile={doctorProfile}
                      onChange={setDoctorProfile}
                      facilities={facilities}
                    />
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="portal-accent-button flex-1 py-2 px-4 rounded-lg"
                  >
                    Update User
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setSelectedUser(null);
                      resetForm();
                    }}
                    className="btn-secondary flex-1 py-2 px-4 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Standalone doctor profile modal (unassigned staff) */}
      {showDoctorProfileModal && profileEditDoctorId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="modal-surface max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Edit doctor profile</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowDoctorProfileModal(false);
                    setProfileEditDoctorId(null);
                    setDoctorProfile(emptyDoctorProfile());
                  }}
                  className="text-slate-400 transition-colors hover:text-slate-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveDoctorProfile} className="space-y-4">
                <DoctorProfileFormFields
                  profile={doctorProfile}
                  onChange={setDoctorProfile}
                  facilities={facilities}
                />
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="portal-accent-button flex-1 py-2 px-4 rounded-lg"
                  >
                    Save profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDoctorProfileModal(false);
                      setProfileEditDoctorId(null);
                      setDoctorProfile(emptyDoctorProfile());
                    }}
                    className="btn-secondary flex-1 py-2 px-4 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Assign Role Modal */}
      {showAssignModal && selectedStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="modal-surface max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Assign Role</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedStaff.first_name} {selectedStaff.last_name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedStaff(null);
                    setAssignFormData({
                      email: '',
                      password: '',
                      role: 'doctor',
                      doctor_id: undefined,
                      specialty_id: undefined,
                    });
                  }}
                  className="text-slate-400 transition-colors hover:text-slate-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAssignRole} className="space-y-4">
                <div>
                  <label className="form-label mb-1 block">Email *</label>
                  <input
                    type="email"
                    required
                    value={assignFormData.email}
                    onChange={(e) => setAssignFormData({ ...assignFormData, email: e.target.value })}
                    className="form-field w-full px-3 py-2"
                    placeholder="Enter email for login"
                  />
                  {selectedStaff.email && (
                    <p className="mt-1 text-xs text-gray-500">Staff email: {selectedStaff.email}</p>
                  )}
                </div>

                <div>
                  <label className="form-label mb-1 block">Password *</label>
                  <input
                    type="password"
                    required
                    value={assignFormData.password}
                    onChange={(e) => setAssignFormData({ ...assignFormData, password: e.target.value })}
                    className="form-field w-full px-3 py-2"
                    placeholder="Set password for login"
                  />
                </div>

                <div>
                  <label className="form-label mb-1 block">Role *</label>
                  <select
                    required
                    value={assignFormData.role}
                    onChange={(e) => {
                      const newRole = e.target.value as any;
                      // For radiology, automatically find and set Radiology specialty
                      if (newRole === 'radiology') {
                        const radiologySpecialty = specialties.find(s => s.name.toLowerCase().includes('radiology'));
                        setAssignFormData({ 
                          ...assignFormData, 
                          role: newRole, 
                          specialty_id: radiologySpecialty?.specialty_id || selectedStaff.specialty_id 
                        });
                      } else {
                        setAssignFormData({ ...assignFormData, role: newRole });
                      }
                    }}
                    className="form-field w-full px-3 py-2"
                  >
                    <option value="doctor">Doctor (General Practitioner)</option>
                    <option value="radiology">Radiology Doctor</option>
                    <option value="lab_technician">Lab Technician</option>
                    <option value="non_medical_staff">Patient Engagement Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {assignFormData.role === 'doctor' && 'Access to General Practitioner Dashboard'}
                    {assignFormData.role === 'radiology' && 'Access to Radiology Dashboard'}
                    {assignFormData.role === 'lab_technician' && 'Access to Lab capabilities'}
                    {assignFormData.role === 'non_medical_staff' && 'Access to Patient Engagement capabilities'}
                    {assignFormData.role === 'admin' && 'Full system access'}
                  </p>
                </div>

                {assignFormData.role === 'doctor' && (
                  <div>
                    <label className="form-label mb-1 block">Specialty *</label>
                    <select
                      required
                      value={assignFormData.specialty_id || selectedStaff.specialty_id || ''}
                      onChange={(e) => setAssignFormData({ ...assignFormData, specialty_id: parseInt(e.target.value) })}
                      className="form-field w-full px-3 py-2"
                    >
                      <option value="">Select Specialty</option>
                      {specialties
                        .filter(spec => !spec.name.toLowerCase().includes('radiology'))
                        .map((spec) => (
                          <option key={spec.specialty_id} value={spec.specialty_id}>
                            {spec.name}
                          </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Current specialty: {selectedStaff.specialty_name}
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="portal-accent-button flex-1 py-2 px-4 rounded-lg"
                  >
                    Assign Role
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAssignModal(false);
                      setSelectedStaff(null);
                      setAssignFormData({
                        email: '',
                        password: '',
                        role: 'doctor',
                        doctor_id: undefined,
                        specialty_id: undefined,
                      });
                    }}
                    className="btn-secondary flex-1 py-2 px-4 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bottom toast alerts */}
      {(error || success) && (
        <div
          className="fixed bottom-6 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4 animate-fade-in-up"
          role="status"
          aria-live="polite"
        >
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-3 text-red-100 shadow-lg backdrop-blur-md">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-300" />
              <p className="text-sm font-medium">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-auto rounded p-1 text-red-300 hover:bg-red-500/20"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-3 text-emerald-100 shadow-lg backdrop-blur-md">
              <Check className="h-5 w-5 shrink-0 text-emerald-300" />
              <p className="text-sm font-medium">{success}</p>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="ml-auto rounded p-1 text-emerald-300 hover:bg-emerald-500/20"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

