import React, { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  RefreshCw,
  UserCheck,
  UserX,
  Edit2,
  X,
} from 'lucide-react';
import { adminListStaff, adminCreateStaff, adminUpdateStaff } from '../../lib/api';

interface StaffUser {
  id: number;
  email: string;
  name?: string;
  role: 'OWNER' | 'STORE_MANAGER' | 'FULFILLMENT_STAFF';
  is_active: boolean;
  created_at: string;
}

export const AdminStaff: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create Staff Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState<'OWNER' | 'STORE_MANAGER' | 'FULFILLMENT_STAFF'>('STORE_MANAGER');
  const [createPassword, setCreatePassword] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Edit Staff Modal
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [editRole, setEditRole] = useState<'OWNER' | 'STORE_MANAGER' | 'FULFILLMENT_STAFF'>('STORE_MANAGER');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editName, setEditName] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail.trim() || !createPassword.trim()) {
      setNotification({ type: 'error', message: 'Email and password are required.' });
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
      setCreateEmail('');
      setCreateName('');
      setCreatePassword('');
      await fetchStaff();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to create staff account' });
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    setSubmittingEdit(true);
    try {
      await adminUpdateStaff(token, editingStaff.id, {
        role: editRole,
        is_active: editIsActive,
        name: editName.trim() || undefined,
      });
      setNotification({ type: 'success', message: `Staff account updated.` });
      setEditingStaff(null);
      await fetchStaff();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to update staff account' });
    } finally {
      setSubmittingEdit(false);
    }
  };

  const openEditModal = (u: StaffUser) => {
    setEditingStaff(u);
    setEditRole(u.role);
    setEditIsActive(u.is_active);
    setEditName(u.name || '');
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
            onClick={() => setIsCreateOpen(true)}
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
            No staff accounts found.
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
                {staff.map((u) => (
                  <tr key={u.id} className="hover:bg-amber-50/20">
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {u.name || 'Staff Member'}
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-700">{u.email}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'OWNER'
                            ? 'bg-amber-100 text-[#5E1224] border border-amber-300'
                            : u.role === 'STORE_MANAGER'
                            ? 'bg-purple-100 text-purple-900 border border-purple-200'
                            : 'bg-sky-100 text-sky-900 border border-sky-200'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          u.is_active ? 'text-emerald-700' : 'text-gray-400'
                        }`}
                      >
                        {u.is_active ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" /> Active
                          </>
                        ) : (
                          <>
                            <UserX className="w-3.5 h-3.5" /> Deactivated
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-[11px]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openEditModal(u)}
                        className="px-2.5 py-1 bg-white border border-[#E5D9C5] text-gray-700 rounded text-xs font-semibold hover:bg-[#FCF8F0] transition-colors inline-flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
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
              <button onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

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
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
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
              <button onClick={() => setEditingStaff(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

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
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224] font-medium"
                >
                  <option value="STORE_MANAGER">STORE_MANAGER</option>
                  <option value="FULFILLMENT_STAFF">FULFILLMENT_STAFF</option>
                  <option value="OWNER">OWNER</option>
                </select>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-[#5E1224] focus:ring-[#5E1224]"
                  />
                  <span className="font-semibold text-gray-800">Account Active & Authorized to Sign In</span>
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
