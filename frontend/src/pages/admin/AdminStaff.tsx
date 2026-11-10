import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Plus,
  RefreshCw,
  UserCheck,
  UserX,
  Users,
  Edit2,
  X,
  Eye,
  EyeOff,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { adminListStaff, adminCreateStaff, adminUpdateStaff } from '../../lib/api';

type StatusFilter = 'ACTIVE' | 'DEACTIVATED' | 'ALL';

interface StaffUser {
  id: number;
  email: string;
  name?: string;
  role: 'OWNER' | 'STORE_MANAGER' | 'FULFILLMENT_STAFF' | 'MANAGER' | string;
  is_active: boolean;
  created_at: string;
}

export const AdminStaff: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string; role: string } | null>(null);

  // Filter & Search state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Staff Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState<'OWNER' | 'STORE_MANAGER' | 'FULFILLMENT_STAFF'>('STORE_MANAGER');
  const [createPassword, setCreatePassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset password visibility and errors whenever create modal closes
  useEffect(() => {
    if (!isCreateOpen) {
      setShowCreatePassword(false);
      setCreateError(null);
    }
  }, [isCreateOpen]);

  // Edit Staff Modal
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [editRole, setEditRole] = useState<string>('STORE_MANAGER');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editName, setEditName] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const data = await adminListStaff(token);
      setStaff(data);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load staff list' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [token]);

  useEffect(() => {
    if (token) {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
      fetch(`${API_BASE_URL}/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setCurrentUser(data);
        })
        .catch(() => {});
    }
  }, [token]);

  // Counts for tabs
  const counts = useMemo(
    () => ({
      ACTIVE: staff.filter((u) => u.is_active).length,
      DEACTIVATED: staff.filter((u) => !u.is_active).length,
      ALL: staff.length,
    }),
    [staff]
  );

  // Filtered & searched staff members
  const filteredStaff = useMemo(() => {
    return staff.filter((u) => {
      // Status filter
      if (statusFilter === 'ACTIVE' && !u.is_active) return false;
      if (statusFilter === 'DEACTIVATED' && u.is_active) return false;

      // Search query (name, email, role)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        const matchRole = u.role.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchRole) return false;
      }

      return true;
    });
  }, [staff, statusFilter, searchQuery]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!createEmail.trim() || !createPassword.trim()) {
      setCreateError('Email and password are required.');
      return;
    }

    setSubmittingCreate(true);
    try {
      await adminCreateStaff(token, {
        email: createEmail.trim(),
        name: createName.trim() || undefined,
        role: createRole,
        password: createPassword.trim(),
      });
      setNotification({ type: 'success', message: `Staff member ${createEmail} created.` });
      setIsCreateOpen(false);
      setShowCreatePassword(false);
      setCreateEmail('');
      setCreateName('');
      setCreatePassword('');
      setCreateError(null);
      await fetchStaff();
    } catch (err: any) {
      const msg = err.message || 'Failed to create staff account';
      setCreateError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    setSubmittingEdit(true);
    setEditError(null);
    try {
      await adminUpdateStaff(token, editingStaff.id, {
        role: editRole,
        is_active: editIsActive,
        name: editName.trim() || undefined,
      });
      setNotification({
        type: 'success',
        message: editIsActive
          ? `Staff account ${editingStaff.email} updated.`
          : `Staff account ${editingStaff.email} deactivated. Sessions revoked.`,
      });
      setEditingStaff(null);
      setEditError(null);
      await fetchStaff();
    } catch (err: any) {
      const msg = err.message || 'Failed to update staff account';
      setEditError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setSubmittingEdit(false);
    }
  };

  const openEditModal = (u: StaffUser) => {
    setEditingStaff(u);
    setEditRole(u.role);
    setEditIsActive(u.is_active);
    setEditName(u.name || '');
    setEditError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <Shield className="w-6 h-6 text-[#5E1224]" />
            Staff Roles & Access Control
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Manage authenticated team members and enforce role-based permissions (RBAC).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowCreatePassword(false);
              setIsCreateOpen(true);
            }}
            className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C] transition-colors shadow-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Staff Member
          </button>
          <button
            onClick={fetchStaff}
            disabled={loading}
            className="p-2 bg-white border border-[#E5D9C5] rounded-lg text-gray-600 hover:bg-[#FCF8F0] transition-colors disabled:opacity-50"
            title="Refresh staff"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Role Definitions Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5]/80 text-xs">
          <div className="font-bold text-[#5E1224] flex items-center gap-1.5 mb-1">
            <Shield className="w-4 h-4 text-[#B58A3C]" />
            Owner
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Unrestricted administrative control. Can manage staff, update store settings, access financial ledgers, and delete records.
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5]/80 text-xs">
          <div className="font-bold text-gray-900 flex items-center gap-1.5 mb-1">
            <Shield className="w-4 h-4 text-purple-700" />
            Store Manager
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Product catalog curation, inventory adjustments, returns review, customer concierge, and order operations.
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5]/80 text-xs">
          <div className="font-bold text-gray-900 flex items-center gap-1.5 mb-1">
            <Shield className="w-4 h-4 text-sky-700" />
            Fulfillment Staff
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Order packing, parcel dimension logging, Shiprocket dispatch, courier labels, and manifest generation.
          </p>
        </div>
      </div>

      {/* Status Filter Tabs & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Status Pills: Active / Deactivated / All */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['ACTIVE', 'DEACTIVATED', 'ALL'] as StatusFilter[]).map((tab) => {
            const isSelected = statusFilter === tab;
            const count = counts[tab];
            const label = tab === 'ACTIVE' ? 'Active' : tab === 'DEACTIVATED' ? 'Deactivated' : 'All';

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all inline-flex items-center gap-1.5 whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#5E1224] text-white border-[#5E1224] shadow-xs'
                    : 'bg-white hover:bg-[#FAF6F0] text-gray-700 border-[#E8DFD0]'
                }`}
              >
                {tab === 'ACTIVE' && <UserCheck className="w-3.5 h-3.5" />}
                {tab === 'DEACTIVATED' && <UserX className="w-3.5 h-3.5" />}
                {tab === 'ALL' && <Users className="w-3.5 h-3.5" />}
                <span>{label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 bg-white border border-[#E8DFD0] rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224] text-gray-800 placeholder-gray-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-xl border border-[#E5D9C5]/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
            Loading staff directory...
          </div>
        ) : staff.length === 0 ? (
          <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <Shield className="w-8 h-8 text-gray-300" />
            <p className="font-semibold text-gray-700 text-sm">No staff accounts found.</p>
            <p className="text-gray-500 text-[11px]">Add a team member to grant access to the admin portal.</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <Shield className="w-8 h-8 text-gray-300" />
            <p className="font-semibold text-gray-700 text-sm">
              {searchQuery
                ? `No staff match "${searchQuery}"`
                : statusFilter === 'DEACTIVATED'
                ? 'No deactivated staff accounts'
                : 'No active staff accounts'}
            </p>
            <p className="text-gray-500 text-[11px] max-w-sm">
              {searchQuery
                ? 'Try adjusting your search keywords or clear the search field.'
                : statusFilter === 'DEACTIVATED'
                ? 'All registered staff accounts are currently active with valid sign-in permissions.'
                : 'All staff accounts are currently deactivated. Reactivate an account to restore access.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 px-3 py-1 bg-white border border-[#E8DFD0] text-gray-700 rounded-lg text-xs hover:bg-gray-50"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-gray-600 font-semibold text-[10px] uppercase">
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStaff.map((u) => {
                  const isDeactivated = !u.is_active;
                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-amber-50/20 transition-colors ${
                        isDeactivated ? 'bg-gray-50/60 opacity-80' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {u.name || 'Staff Member'}
                        {u.id === currentUser?.id && (
                          <span className="ml-2 text-[10px] font-normal text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-700">{u.email}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'OWNER'
                              ? 'bg-amber-100 text-[#5E1224] border border-amber-300'
                              : u.role === 'STORE_MANAGER' || u.role === 'MANAGER'
                              ? 'bg-purple-100 text-purple-900 border border-purple-200'
                              : 'bg-sky-100 text-sky-900 border border-sky-200'
                          }`}
                        >
                          {u.role === 'MANAGER' ? 'MANAGER (Legacy)' : u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <UserCheck className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400">
                            <UserX className="w-3.5 h-3.5" /> Deactivated
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-[11px]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openEditModal(u)}
                          className="px-2.5 py-1 bg-white border border-[#E5D9C5] text-gray-700 rounded text-xs font-semibold hover:bg-[#FCF8F0] transition-colors inline-flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          {u.is_active ? 'Edit' : 'Manage / Reactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Staff Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-[#E5D9C5] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#5E1224]" />
                Add New Staff Member
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setShowCreatePassword(false);
                  setCreateError(null);
                }}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span className="flex-1 font-medium">{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g., Tanya Sharma"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="staff@royallibas.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Staff Role <span className="text-rose-500">*</span>
                </label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224] font-medium"
                >
                  <option value="STORE_MANAGER">STORE_MANAGER (Products, Stock & Orders)</option>
                  <option value="FULFILLMENT_STAFF">FULFILLMENT_STAFF (Packing & Dispatch)</option>
                  <option value="OWNER">OWNER (Full Administrative Access)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Secure Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#5E1224] rounded transition-colors"
                    aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
                    title={showCreatePassword ? 'Hide password' : 'Show password'}
                  >
                    {showCreatePassword ? (
                      <EyeOff className="w-4 h-4 text-gray-600" />
                    ) : (
                      <Eye className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setShowCreatePassword(false);
                  }}
                  className="px-3 py-1.5 font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="px-4 py-1.5 bg-[#5E1224] text-white font-semibold rounded-lg hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  {submittingCreate ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-[#E5D9C5] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#5E1224]" />
                Edit Staff: {editingStaff.email}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingStaff(null);
                  setEditError(null);
                }}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span className="flex-1 font-medium">{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Assigned Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224] font-medium"
                >
                  {(editRole === 'MANAGER' || editingStaff.role === 'MANAGER') && (
                    <option value="MANAGER">MANAGER (Legacy)</option>
                  )}
                  <option value="STORE_MANAGER">STORE_MANAGER</option>
                  <option value="FULFILLMENT_STAFF">FULFILLMENT_STAFF</option>
                  <option value="OWNER">OWNER</option>
                </select>
              </div>

              <div className="pt-2 pb-1 border-t border-gray-100 mt-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    disabled={editingStaff.id === currentUser?.id}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[#5E1224] focus:ring-[#5E1224] disabled:opacity-50"
                  />
                  <div>
                    <span className="font-semibold text-gray-800 block text-xs">
                      Account Active & Authorized to Sign In
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                      {editingStaff.id === currentUser?.id
                        ? 'You cannot deactivate your own active account.'
                        : editIsActive
                        ? 'Active staff can sign in and perform actions based on their assigned role.'
                        : 'Deactivating immediately blocks sign in and instantly revokes all active sessions. Historical actions, stock adjustments, and audit trails remain preserved.'}
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-3 py-1.5 font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-1.5 bg-[#5E1224] text-white font-semibold rounded-lg hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  {submittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

