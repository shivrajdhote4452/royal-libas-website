import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Package,
  Phone,
  Search,
  Truck,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  updateAdminOrderStatus,
  formatPrice,
  fetchFulfillmentConfig,
  refreshFulfillmentTracking,
  adminUpdateOrderNotes,
} from '../../lib/api';
import { OrderResponse, FulfillmentConfig } from '../../types/order';
import { FulfillmentModal } from '../../components/FulfillmentModal';

export const AdminOrders: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'ALL';

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('ALL');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Expandable row state
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Fulfillment configuration and modal state
  const [fulfillmentConfig, setFulfillmentConfig] = useState<FulfillmentConfig | null>(null);
  const [activeFulfillOrder, setActiveFulfillOrder] = useState<OrderResponse | null>(null);
  const [refreshingOrderId, setRefreshingOrderId] = useState<number | null>(null);

  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Cancellation Confirmation Modal
  const [cancelModalOrder, setCancelModalOrder] = useState<OrderResponse | null>(null);

  // Note editing state
  const [editingNotesOrderId, setEditingNotesOrderId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
      const params = new URLSearchParams();
      if (selectedStatus && selectedStatus !== 'ALL') params.append('status', selectedStatus);
      if (selectedPaymentStatus && selectedPaymentStatus !== 'ALL') params.append('payment_status', selectedPaymentStatus);
      if (selectedPaymentMethod && selectedPaymentMethod !== 'ALL') params.append('payment_method', selectedPaymentMethod);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (dateFilter) params.append('date', dateFilter);

      const query = params.toString() ? `?${params.toString()}` : '';
      const [res, cfg] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/orders${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => {
          if (!r.ok) throw new Error('Failed to load orders');
          return r.json();
        }),
        fetchFulfillmentConfig(token).catch(() => null),
      ]);

      setOrders(res);
      if (cfg) setFulfillmentConfig(cfg);
      if (res.length > 0 && expandedOrderId === null) {
        setExpandedOrderId(res[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [token, selectedStatus, selectedPaymentStatus, selectedPaymentMethod, dateFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrders();
  };

  const handleStatusFilterChange = (status: string) => {
    setSelectedStatus(status);
    setSearchParams(status === 'ALL' ? {} : { status });
  };

  const handleRefreshTracking = async (orderId: number) => {
    setRefreshingOrderId(orderId);
    setActionError(null);
    try {
      const refreshed = await refreshFulfillmentTracking(token, orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? refreshed : o)));
    } catch (err: any) {
      setActionError(err.message || 'Failed to refresh live tracking');
    } finally {
      setRefreshingOrderId(null);
    }
  };

  const handleStatusChange = async (
    orderId: number,
    newStatus: string,
    courier?: string,
    trackLink?: string
  ) => {
    setIsUpdating(true);
    setActionError(null);

    try {
      const updated = await updateAdminOrderStatus(token, orderId, {
        status: newStatus,
        courier_name: courier,
        tracking_url: trackLink,
      });

      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      setCancelModalOrder(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update order status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveNotes = async (orderId: number) => {
    setIsSavingNote(true);
    try {
      const updated = await adminUpdateOrderNotes(token, orderId, noteText);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      setEditingNotesOrderId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save notes');
    } finally {
      setIsSavingNote(false);
    }
  };

  const statusPills = [
    { id: 'ALL', label: 'All Orders' },
    { id: 'PLACED', label: 'Placed (New)' },
    { id: 'CONFIRMED', label: 'Confirmed' },
    { id: 'PACKED', label: 'Packed' },
    { id: 'SHIPPED', label: 'Shipped' },
    { id: 'DELIVERED', label: 'Delivered' },
    { id: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#B58A3C]/20 pb-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#5E1224]">Orders & Fulfillment</h1>
          <p className="text-xs text-gray-600 mt-1">
            Track and process boutique customer orders, Shiprocket logistics, and status mutations.
          </p>
        </div>
        <button
          onClick={loadOrders}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#B58A3C]/40 text-[#5E1224] hover:bg-[#FCF8F0] text-xs font-semibold rounded shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-600 hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================
          SEARCH AND ADVANCED FILTERS BAR
          ======================================================== */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Order ID (RL-2026-...), Customer Name, or Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[#5E1224] text-white hover:bg-[#4A0E1C] text-xs font-semibold rounded shrink-0"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setTimeout(loadOrders, 0);
              }}
              className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs rounded shrink-0"
            >
              Clear
            </button>
          )}
        </form>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 font-medium">Payment State:</span>
            <select
              value={selectedPaymentStatus}
              onChange={(e) => setSelectedPaymentStatus(e.target.value)}
              className="border border-gray-300 rounded px-2.5 py-1 text-xs bg-white focus:outline-none focus:border-[#5E1224]"
            >
              <option value="ALL">All States</option>
              <option value="PAID">Paid Only</option>
              <option value="PENDING">Pending Only</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 font-medium">Payment Method:</span>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="border border-gray-300 rounded px-2.5 py-1 text-xs bg-white focus:outline-none focus:border-[#5E1224]"
            >
              <option value="ALL">All Methods</option>
              <option value="PREPAID">Prepaid (Gateway)</option>
              <option value="COD">Cash on Delivery (COD)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 font-medium">Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#5E1224]"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="text-[10px] text-gray-500 hover:text-black underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {statusPills.map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => handleStatusFilterChange(pill.id)}
            className={`px-3 py-1.5 rounded-full font-semibold transition-all shrink-0 ${
              selectedStatus === pill.id
                ? 'bg-[#5E1224] text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-[#FCF8F0]'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Orders List / Cards */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500">Loading order queue...</p>
        </div>
      ) : error ? (
        <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center space-y-3">
          <p className="text-xs text-red-700">{error}</p>
          <button onClick={loadOrders} className="px-4 py-1.5 bg-[#5E1224] text-white rounded text-xs">
            Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center space-y-3">
          <Package className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="font-serif font-bold text-gray-800 text-base">No orders match these criteria</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Try resetting your filters or clearing search terms to inspect all orders.
          </p>
          <button
            onClick={() => {
              setSelectedStatus('ALL');
              setSelectedPaymentStatus('ALL');
              setSelectedPaymentMethod('ALL');
              setSearchQuery('');
              setDateFilter('');
            }}
            className="px-4 py-1.5 bg-[#5E1224] text-white text-xs font-semibold rounded"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const isExpanded = expandedOrderId === o.id;
            const isPrepaid = o.payment_method === 'PREPAID';
            const isPaid = o.payment_status === 'PAID';
            const cleanPhone = o.phone.replace(/\D/g, '').slice(-10);

            return (
              <div
                key={o.id}
                className="bg-white rounded-lg border border-gray-200 hover:border-[#B58A3C]/60 shadow-sm overflow-hidden transition-all"
              >
                {/* Order Summary Bar */}
                <div
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-white select-none"
                  onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono font-bold text-sm text-[#5E1224]">
                      {o.order_code}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(o.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isPaid
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : isPrepaid
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {o.payment_method} &bull; {o.payment_status}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        o.status === 'DELIVERED'
                          ? 'bg-emerald-100 text-emerald-900'
                          : o.status === 'SHIPPED'
                          ? 'bg-blue-100 text-blue-900'
                          : o.status === 'CANCELLED'
                          ? 'bg-red-100 text-red-900'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-right">
                      <div className="text-xs font-semibold text-gray-900">{o.customer_name}</div>
                      <div className="text-sm font-mono font-bold text-[#5E1224]">
                        {formatPrice(o.total)}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 sm:p-6 bg-[#FCF8F0]/30 space-y-5">
                    {/* Items Purchased with Size & Color */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                        Purchased Items ({o.items?.length || 0})
                      </h4>
                      <div className="space-y-2 bg-white rounded border border-gray-200 p-3">
                        {o.items?.map((it) => (
                          <div
                            key={it.id}
                            className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 last:border-0"
                          >
                            <div>
                              <span className="font-bold text-gray-900">{it.product_name_snapshot}</span>
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                Size: <strong className="text-gray-800">{it.size_snapshot}</strong>
                                {it.colour_snapshot && ` • Shade: ${it.colour_snapshot}`}
                                {` • Qty: ${it.quantity}`}
                              </div>
                            </div>
                            <span className="font-mono font-semibold text-gray-900">
                              {formatPrice(it.line_total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Customer & Address Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-white p-3.5 rounded border border-gray-200 space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                          Customer Contact
                        </span>
                        <p className="font-bold text-gray-900">{o.customer_name}</p>
                        <p className="font-mono text-gray-700">{o.phone}</p>
                        <div className="flex items-center gap-2 pt-1">
                          <a
                            href={`tel:${cleanPhone}`}
                            className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-black font-semibold bg-gray-100 px-2 py-1 rounded"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                          <a
                            href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(
                              `Hello ${o.customer_name}! Update regarding your Royal Libas order ${o.order_code}.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-800 hover:text-emerald-950 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      </div>

                      <div className="bg-white p-3.5 rounded border border-gray-200 space-y-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                          Delivery Address
                        </span>
                        {o.address ? (
                          <div className="text-gray-700 leading-snug">
                            <p className="font-semibold text-gray-900">{o.address.name}</p>
                            <p>{o.address.line1}</p>
                            {o.address.line2 && <p>{o.address.line2}</p>}
                            <p>
                              {o.address.city}, {o.address.state} -{' '}
                              <strong className="font-mono">{o.address.pincode}</strong>
                            </p>
                          </div>
                        ) : (
                          <p className="text-gray-400">Address snapshot not found.</p>
                        )}
                      </div>
                    </div>

                    {/* Logistics & Tracking info if present */}
                    {(o.courier_name || o.awb_code) && (
                      <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-indigo-950">
                            Fulfillment: {o.courier_name || 'Assigned Courier'}
                          </div>
                          {o.awb_code && (
                            <div className="text-[11px] font-mono text-indigo-900 mt-0.5">
                              AWB: <strong>{o.awb_code}</strong>
                              {o.pickup_status && ` • Status: ${o.pickup_status}`}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {o.tracking_url && (
                            <a
                              href={o.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-800 hover:underline font-semibold"
                            >
                              <span>Track Live</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={refreshingOrderId === o.id}
                            onClick={() => handleRefreshTracking(o.id)}
                            className="inline-flex items-center gap-1 text-[11px] bg-white border border-indigo-300 text-indigo-900 px-2.5 py-1 rounded shadow-sm hover:bg-indigo-50 font-medium"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${refreshingOrderId === o.id ? 'animate-spin' : ''}`}
                            />
                            <span>Refresh tracking</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Staff Notes section */}
                    <div className="bg-white p-3.5 rounded border border-gray-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Internal Staff Notes
                        </span>
                        {editingNotesOrderId !== o.id && (
                          <button
                            onClick={() => {
                              setEditingNotesOrderId(o.id);
                              setNoteText(o.admin_notes || '');
                            }}
                            className="text-[11px] text-[#5E1224] hover:underline font-medium"
                          >
                            {o.admin_notes ? 'Edit Notes' : '+ Add Note'}
                          </button>
                        )}
                      </div>
                      {editingNotesOrderId === o.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add internal notes (e.g., custom hem requested, buyer phoned to confirm)..."
                            className="w-full p-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224] h-20"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingNotesOrderId(null)}
                              className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isSavingNote}
                              onClick={() => handleSaveNotes(o.id)}
                              className="px-3 py-1 bg-[#5E1224] text-white text-xs font-semibold rounded hover:bg-[#4A0E1C]"
                            >
                              {isSavingNote ? 'Saving...' : 'Save Notes'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-700 whitespace-pre-line">
                          {o.admin_notes || <span className="text-gray-400 italic">No staff notes recorded.</span>}
                        </p>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200">
                      <div className="flex flex-wrap items-center gap-2">
                        {o.status === 'PLACED' && (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleStatusChange(o.id, 'PACKED')}
                            className="px-3.5 py-1.5 bg-[#5E1224] hover:bg-[#4A0E1C] text-white rounded text-xs font-semibold"
                          >
                            Mark Packed
                          </button>
                        )}

                        {(o.status === 'PLACED' || o.status === 'CONFIRMED' || o.status === 'PACKED') && (
                          <button
                            type="button"
                            onClick={() => setActiveFulfillOrder(o)}
                            className="px-3.5 py-1.5 bg-[#B58A3C] hover:bg-[#9E7632] text-white rounded text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Ship via Shiprocket</span>
                          </button>
                        )}

                        {o.status === 'SHIPPED' && (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleStatusChange(o.id, 'DELIVERED')}
                            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Delivered</span>
                          </button>
                        )}

                        {o.status !== 'CANCELLED' && o.status !== 'DELIVERED' && (
                          <button
                            type="button"
                            onClick={() => setCancelModalOrder(o)}
                            className="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded text-xs font-semibold"
                          >
                            Cancel Order...
                          </button>
                        )}
                      </div>

                      <Link
                        to={`/admin/orders/${o.id}`}
                        className="text-xs text-[#5E1224] font-semibold hover:underline flex items-center gap-1 ml-auto"
                      >
                        <span>Full Order Dossier</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-200">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-base font-serif font-bold text-gray-900">
                Cancel Order {cancelModalOrder.order_code}?
              </h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              This action will mark the order as <strong>CANCELLED</strong>. All reserved garments will be
              automatically and atomically restocked back to available inventory. If a Shiprocket consignment
              exists and has not been picked up, it will be cancelled via the Shiprocket API.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded text-xs font-medium"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleStatusChange(cancelModalOrder.id, 'CANCELLED')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
              >
                {isUpdating ? 'Cancelling...' : 'Confirm Cancellation & Restock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shiprocket Fulfillment Modal */}
      {activeFulfillOrder && (
        <FulfillmentModal
          order={activeFulfillOrder}
          isOpen={true}
          onClose={() => setActiveFulfillOrder(null)}
          onSuccess={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setActiveFulfillOrder(null);
          }}
          token={token}
          providerLabel={fulfillmentConfig?.button_label}
        />
      )}
    </div>
  );
};
