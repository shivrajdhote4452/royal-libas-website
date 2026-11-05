import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  Clock,
  CheckCircle,
  Truck,
  X,
  Phone,
  Shield,
} from 'lucide-react';
import {
  adminListReturns,
  adminUpdateReturnStatus,
} from '../../lib/api';

interface ReturnRequest {
  id: number;
  return_code: string;
  order_id: number;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  item_name?: string;
  item_size?: string;
  item_colour?: string;
  request_type: string;
  reason: string;
  customer_comment?: string;
  requested_resolution?: string;
  exchange_size?: string;
  status: string;
  pickup_awb?: string;
  pickup_courier?: string;
  refund_amount?: number;
  refund_status?: string;
  refund_reference?: string;
  staff_notes?: string;
  created_at: string;
  updated_at: string;
}

export const AdminReturns: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Update Status Modal
  const [selectedReturn, setSelectedReturn] = useState<ReturnRequest | null>(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updatePickupCourier, setUpdatePickupCourier] = useState('');
  const [updatePickupAwb, setUpdatePickupAwb] = useState('');
  const [updateRefundAmount, setUpdateRefundAmount] = useState<number | ''>('');
  const [updateRefundStatus, setUpdateRefundStatus] = useState('');
  const [updateRefundRef, setUpdateRefundRef] = useState('');
  const [updateStaffNotes, setUpdateStaffNotes] = useState('');
  const [submittingUpdate, setSubmittingUpdate] = useState(false);

  const fetchReturns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListReturns(token, statusFilter, typeFilter, searchTerm);
      setReturns(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch returns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, [statusFilter, typeFilter, token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReturns();
  };

  const openUpdateModal = (ret: ReturnRequest) => {
    setSelectedReturn(ret);
    setUpdateStatus(ret.status);
    setUpdatePickupCourier(ret.pickup_courier || '');
    setUpdatePickupAwb(ret.pickup_awb || '');
    setUpdateRefundAmount(ret.refund_amount !== undefined && ret.refund_amount !== null ? ret.refund_amount : '');
    setUpdateRefundStatus(ret.refund_status || '');
    setUpdateRefundRef(ret.refund_reference || '');
    setUpdateStaffNotes(ret.staff_notes || '');
  };

  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturn) return;

    setSubmittingUpdate(true);
    setError(null);
    try {
      await adminUpdateReturnStatus(token, selectedReturn.id, {
        status: updateStatus,
        pickup_courier: updatePickupCourier || undefined,
        pickup_awb: updatePickupAwb || undefined,
        refund_amount: updateRefundAmount !== '' ? Number(updateRefundAmount) : undefined,
        refund_status: updateRefundStatus || undefined,
        refund_reference: updateRefundRef || undefined,
        staff_notes: updateStaffNotes || undefined,
      });
      setActionSuccess(`Request #${selectedReturn.return_code} updated successfully.`);
      setSelectedReturn(null);
      await fetchReturns();
    } catch (err: any) {
      setError(err.message || 'Failed to update request');
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const requestedCount = returns.filter((r) => r.status === 'REQUESTED').length;
  const inProgressCount = returns.filter((r) =>
    ['APPROVED', 'PICKUP_SCHEDULED', 'RECEIVED_INSPECTION'].includes(r.status)
  ).length;
  const resolvedCount = returns.filter((r) => r.status === 'RESOLVED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-[#5E1224]" />
            Customer Exchanges &amp; Returns
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Historical records and inspection logs. Royal Libas operates under a strict <strong>No Returns and No Exchanges</strong> policy. Creation of new requests is disabled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReturns}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E5D9C5] text-xs font-semibold text-gray-700 rounded-lg shadow-sm hover:bg-[#FCF8F0] transition-colors disabled:opacity-50"
            title="Refresh records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Atelier Policy Notice Banner */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-3 shadow-sm">
        <Shield className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold text-amber-950">Atelier Policy Notice: No Returns and No Exchanges</p>
          <p className="text-amber-800 leading-relaxed">
            Royal Libas strictly enforces a final sale policy across all handcrafted garments. New return or exchange requests cannot be initiated by customers or staff. Existing historical requests remain accessible below for order audit, inspection records, and accounting.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-600 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{requestedCount}</div>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Awaiting Review</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-sky-50 rounded-lg text-sky-600 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{inProgressCount}</div>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">In Inspection / Reverse Transit</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600 shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{resolvedCount}</div>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Resolved / Completed</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 mr-1">Status:</span>
            {['ALL', 'REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'RECEIVED_INSPECTION', 'RESOLVED', 'REJECTED'].map(
              (st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    statusFilter === st
                      ? 'bg-[#5E1224] text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st.replace(/_/g, ' ')}
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 mr-1">Type:</span>
            {['ALL', 'EXCHANGE', 'RETURN'].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  typeFilter === t
                    ? 'bg-[#5E1224] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Return Code (RET-...), Order Code, Customer Name, or Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224] bg-[#FCF8F0]/30"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors"
          >
            Search
          </button>
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                fetchReturns();
              }}
              className="px-3 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Main Returns List Table */}
      <div className="bg-white rounded-xl border border-[#E5D9C5]/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 text-xs font-medium flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#5E1224]" />
            Loading return and exchange records...
          </div>
        ) : returns.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-xs font-medium space-y-2">
            <RefreshCw className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-gray-700 font-semibold">No exchange or return records found.</p>
            <p className="text-gray-400">
              Royal Libas enforces a strict No Returns/No Exchanges policy. Historical records appear here when present.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Request Code</th>
                  <th className="py-3 px-4">Order Ref</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Type &amp; Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reverse Logistics</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {returns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                      {ret.return_code}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <Link
                        to={`/admin/orders/${ret.order_id}`}
                        className="text-[#5E1224] hover:underline font-bold"
                      >
                        {ret.order_code}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-gray-900">{ret.customer_name}</div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {ret.customer_phone}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ret.request_type === 'EXCHANGE'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {ret.request_type}
                        </span>
                        <span className="font-medium text-gray-800">{ret.reason}</span>
                      </div>
                      {ret.exchange_size && (
                        <div className="text-[11px] text-gray-500">
                          Target Size: <strong className="text-gray-800">{ret.exchange_size}</strong>
                        </div>
                      )}
                      {ret.customer_comment && (
                        <p className="text-[11px] text-gray-500 italic max-w-xs truncate">
                          &ldquo;{ret.customer_comment}&rdquo;
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          ret.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ret.status === 'RESOLVED'
                            ? 'bg-blue-100 text-blue-800'
                            : ret.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : ret.status === 'REQUESTED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {ret.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 space-y-0.5">
                      {ret.pickup_awb ? (
                        <div>
                          <div className="font-mono text-[11px] font-bold text-gray-900">{ret.pickup_awb}</div>
                          <div className="text-[10px] text-gray-500">{ret.pickup_courier || 'Courier'}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-[11px]">No reverse AWB</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                      {new Date(ret.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openUpdateModal(ret)}
                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded text-[11px] transition-colors"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Update Status / Refund Recording Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 border border-[#E5D9C5] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#5E1224]" />
                Manage #{selectedReturn.return_code}
              </h3>
              <button onClick={() => setSelectedReturn(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateStatusSubmit} className="mt-4 space-y-3 text-xs">
              {/* Status Selector */}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Lifecycle Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224] font-medium"
                >
                  <option value="REQUESTED">REQUESTED (Pending Review)</option>
                  <option value="APPROVED">APPROVED (Authorized for Exchange)</option>
                  <option value="PICKUP_SCHEDULED">PICKUP_SCHEDULED (Courier Awaiting)</option>
                  <option value="RECEIVED_INSPECTION">RECEIVED_INSPECTION (At Warehouse)</option>
                  <option value="RESOLVED">RESOLVED (Replacement Dispatched / Completed)</option>
                  <option value="REJECTED">REJECTED (Declined)</option>
                </select>
              </div>

              {/* Reverse Logistics */}
              <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Pickup Courier</label>
                  <input
                    type="text"
                    placeholder="e.g., Delhivery Reverse"
                    value={updatePickupCourier}
                    onChange={(e) => setUpdatePickupCourier(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Pickup AWB</label>
                  <input
                    type="text"
                    placeholder="e.g., 994821038"
                    value={updatePickupAwb}
                    onChange={(e) => setUpdatePickupAwb(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
              </div>

              {/* Refund / Credit Details */}
              <div className="grid grid-cols-3 gap-2 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Refund Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={updateRefundAmount}
                    onChange={(e) => setUpdateRefundAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Refund Status</label>
                  <select
                    value={updateRefundStatus}
                    onChange={(e) => setUpdateRefundStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  >
                    <option value="">None</option>
                    <option value="PENDING">PENDING</option>
                    <option value="ISSUED">ISSUED</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Reference / Txn ID</label>
                  <input
                    type="text"
                    placeholder="e.g., CF-REF-992"
                    value={updateRefundRef}
                    onChange={(e) => setUpdateRefundRef(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
              </div>

              {/* Staff Notes */}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Internal Staff Notes</label>
                <textarea
                  rows={2}
                  value={updateStaffNotes}
                  onChange={(e) => setUpdateStaffNotes(e.target.value)}
                  placeholder="Record defect check result, customer communication, or store manager approval..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="px-3 py-1.5 font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUpdate}
                  className="px-4 py-1.5 bg-[#5E1224] text-white font-semibold rounded-lg hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  {submittingUpdate ? 'Saving...' : 'Update Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
