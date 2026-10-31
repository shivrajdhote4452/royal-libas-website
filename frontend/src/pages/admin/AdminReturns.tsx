import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  RotateCcw,
  Search,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle,
  Truck,
  IndianRupee,
  X,
  Phone,
} from 'lucide-react';
import {
  adminListReturns,
  adminCreateReturn,
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

  // Create Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createOrderId, setCreateOrderId] = useState('');
  const [createRequestType, setCreateRequestType] = useState('RETURN');
  const [createReason, setCreateReason] = useState('Fit / Size Issue');
  const [createComment, setCreateComment] = useState('');
  const [createExchangeSize, setCreateExchangeSize] = useState('');
  const [createResolution, setCreateResolution] = useState('REFUND_STORE_CREDIT');
  const [submittingCreate, setSubmittingCreate] = useState(false);

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

  const handleCreateReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const oid = parseInt(createOrderId, 10);
    if (isNaN(oid) || oid <= 0) {
      setError('Please enter a valid numeric Order ID.');
      return;
    }
    setSubmittingCreate(true);
    setError(null);
    try {
      const res = await adminCreateReturn(token, {
        order_id: oid,
        request_type: createRequestType,
        reason: createReason,
        customer_comment: createComment || undefined,
        exchange_size: createRequestType === 'EXCHANGE' ? createExchangeSize : undefined,
        requested_resolution: createResolution || undefined,
      });
      setActionSuccess(`Return request #${res.return_code} opened successfully.`);
      setIsCreateModalOpen(false);
      setCreateOrderId('');
      setCreateComment('');
      setCreateExchangeSize('');
      await fetchReturns();
    } catch (err: any) {
      setError(err.message || 'Failed to create return request');
    } finally {
      setSubmittingCreate(false);
    }
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
            <RotateCcw className="w-6 h-6 text-[#5E1224]" />
            Customer Exchanges
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Review customer size and style exchange requests, schedule reverse pickups, inspect items, and coordinate replacements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Exchange Request
          </button>
          <button
            onClick={fetchReturns}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E5D9C5] text-xs font-semibold text-gray-700 rounded-lg shadow-sm hover:bg-[#FCF8F0] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
            >
              <option value="ALL">All Statuses</option>
              <option value="REQUESTED">Requested (Pending Review)</option>
              <option value="APPROVED">Approved</option>
              <option value="PICKUP_SCHEDULED">Pickup Scheduled</option>
              <option value="RECEIVED_INSPECTION">Received for Inspection</option>
              <option value="RESOLVED">Resolved (Completed)</option>
              <option value="REJECTED">Rejected</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
            >
              <option value="ALL">All Types</option>
              <option value="RETURN">Store Credit Exchange</option>
              <option value="EXCHANGE">Size / Item Exchange</option>
            </select>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search exchange code, order, customer..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
          </form>
        </div>
      </div>

      {/* Returns Ledger Table */}
      <div className="bg-white rounded-xl border border-[#E5D9C5]/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
            Loading exchange requests...
          </div>
        ) : returns.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <RotateCcw className="w-8 h-8 text-gray-300" />
            No customer exchange requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-gray-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Exchange ID</th>
                  <th className="py-3 px-4">Order & Customer</th>
                  <th className="py-3 px-4">Type & Exchange Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Pickup Logistics</th>
                  <th className="py-3 px-4">Resolution / Replacement</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {returns.map((r) => (
                  <tr key={r.id} className="hover:bg-amber-50/20 transition-colors">
                    {/* Return Code */}
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-[#5E1224]">{r.return_code}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(r.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Order & Customer */}
                    <td className="py-3 px-4">
                      <Link
                        to={`/admin/orders/${r.order_id}`}
                        className="font-mono text-gray-900 font-semibold hover:underline"
                      >
                        #{r.order_code}
                      </Link>
                      <div className="text-gray-700 font-medium text-xs mt-0.5">{r.customer_name}</div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {r.customer_phone}
                      </div>
                    </td>

                    {/* Type & Reason */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.request_type === 'EXCHANGE'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {r.request_type}
                        </span>
                        {r.exchange_size && (
                          <span className="text-[10px] bg-gray-100 px-1 py-0.5 rounded text-gray-700">
                            Size: {r.exchange_size}
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-gray-800 mt-1">{r.reason}</div>
                      {r.customer_comment && (
                        <div className="text-[11px] text-gray-500 italic mt-0.5 max-w-xs truncate">
                          &quot;{r.customer_comment}&quot;
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status === 'RESOLVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'APPROVED' || r.status === 'RECEIVED_INSPECTION'
                            ? 'bg-sky-100 text-sky-800'
                            : r.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>

                    {/* Pickup Logistics */}
                    <td className="py-3 px-4">
                      {r.pickup_awb ? (
                        <div>
                          <div className="font-medium text-gray-900">{r.pickup_courier || 'Reverse Carrier'}</div>
                          <div className="font-mono text-[10px] text-gray-600">AWB: {r.pickup_awb}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic text-[11px]">No pickup scheduled</span>
                      )}
                    </td>

                    {/* Refund Info */}
                    <td className="py-3 px-4">
                      {r.refund_amount ? (
                        <div>
                          <div className="font-semibold text-gray-900 flex items-center">
                            <IndianRupee className="w-3 h-3" />
                            {r.refund_amount.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            Status: <span className="font-semibold">{r.refund_status || 'PENDING'}</span>
                          </div>
                          {r.refund_reference && (
                            <div className="text-[10px] text-gray-400 font-mono truncate max-w-[120px]">
                              Ref: {r.refund_reference}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openUpdateModal(r)}
                        className="px-2.5 py-1 bg-white border border-[#E5D9C5] text-[#5E1224] rounded text-xs font-semibold hover:bg-[#FCF8F0] transition-colors"
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

      {/* Create Return Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-[#E5D9C5] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#5E1224]" />
                Initiate Size / Style Exchange Request
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReturnSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Order ID (Database ID) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g., 104"
                  value={createOrderId}
                  onChange={(e) => setCreateOrderId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Request Type</label>
                <select
                  value={createRequestType}
                  onChange={(e) => setCreateRequestType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                >
                  <option value="RETURN">Store Credit Exchange</option>
                  <option value="EXCHANGE">Size Exchange</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Requested Resolution</label>
                <select
                  value={createResolution}
                  onChange={(e) => setCreateResolution(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                >
                  <option value="REFUND_STORE_CREDIT">Store Credit Voucher</option>
                  <option value="REFUND_ORIGINAL_SOURCE">Original Payment Source Refund</option>
                  <option value="EXCHANGE_SAME_PRODUCT">Size Exchange</option>
                </select>
              </div>

              {createRequestType === 'EXCHANGE' && (
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Requested Exchange Size</label>
                  <input
                    type="text"
                    placeholder="e.g., XL, M"
                    value={createExchangeSize}
                    onChange={(e) => setCreateExchangeSize(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Reason for Exchange</label>
                <select
                  value={createReason}
                  onChange={(e) => setCreateReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                >
                  <option value="Fit / Size Issue">Fit / Size Issue</option>
                  <option value="Fabric Quality Not as Expected">Fabric Quality Not as Expected</option>
                  <option value="Defective / Damaged Garment">Defective / Damaged Garment</option>
                  <option value="Wrong Item Received">Wrong Item Received</option>
                  <option value="Changed Mind">Changed Mind</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Requested Resolution</label>
                <select
                  value={createResolution}
                  onChange={(e) => setCreateResolution(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                >
                  <option value="REFUND_STORE_CREDIT">Store Credit Voucher</option>
                  <option value="REFUND_ORIGINAL_SOURCE">Original Payment Source Refund</option>
                  <option value="EXCHANGE_SAME_PRODUCT">Size Exchange</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Customer Comments / Notes</label>
                <textarea
                  rows={2}
                  value={createComment}
                  onChange={(e) => setCreateComment(e.target.value)}
                  placeholder="Additional context from customer phone call or email..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="px-4 py-1.5 bg-[#5E1224] text-white font-semibold rounded-lg hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  {submittingCreate ? 'Saving...' : 'Create Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Status / Refund Recording Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 border border-[#E5D9C5] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#5E1224]" />
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

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Requested Resolution</label>
                <select
                  value={createResolution}
                  onChange={(e) => setCreateResolution(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                >
                  <option value="REFUND_STORE_CREDIT">Store Credit Voucher</option>
                  <option value="REFUND_ORIGINAL_SOURCE">Original Payment Source Refund</option>
                  <option value="EXCHANGE_SAME_PRODUCT">Size Exchange</option>
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

              {/* Refund Details */}
              <div className="grid grid-cols-3 gap-2 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Refund Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={updateRefundAmount}
                    onChange={(e) => setUpdateRefundAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Refund Status</label>
                  <select
                    value={updateRefundStatus}
                    onChange={(e) => setUpdateRefundStatus(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  >
                    <option value="">None</option>
                    <option value="INITIATED">INITIATED</option>
                    <option value="PROCESSED">PROCESSED</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Gateway / Bank Ref</label>
                  <input
                    type="text"
                    placeholder="UTR / CF Refund ID"
                    value={updateRefundRef}
                    onChange={(e) => setUpdateRefundRef(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
              </div>

              {/* Staff Notes */}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Staff Notes / Inspection Summary</label>
                <textarea
                  rows={2}
                  value={updateStaffNotes}
                  onChange={(e) => setUpdateStaffNotes(e.target.value)}
                  placeholder="Notes on garment condition, tags intact, reason for approval or rejection..."
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
                  {submittingUpdate ? 'Saving...' : 'Update Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
