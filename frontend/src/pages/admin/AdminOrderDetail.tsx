import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Package,
  Phone,
  MessageCircle,
  MapPin,
  Truck,
  CheckCircle2,
  ArrowLeft,
  ExternalLink,
  AlertCircle,
  Loader2,
  XCircle,
  RefreshCw,
  FileText,
  CreditCard,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  fetchAdminOrder,
  updateAdminOrderStatus,
  formatPrice,
  fetchFulfillmentConfig,
  refreshFulfillmentTracking,
  adminSyncPayment,
  adminCollectCOD,
  adminUpdateOrderNotes,
} from '../../lib/api';
import { OrderResponse, FulfillmentConfig } from '../../types/order';
import { FulfillmentModal } from '../../components/FulfillmentModal';

export const AdminOrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fulfillment configuration and modal state
  const [fulfillmentConfig, setFulfillmentConfig] = useState<FulfillmentConfig | null>(null);
  const [showFulfillmentModal, setShowFulfillmentModal] = useState(false);
  const [isRefreshingTracking, setIsRefreshingTracking] = useState(false);

  // Fulfillment update state (manual fallback)
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showShippingForm, setShowShippingForm] = useState(false);
  const [courierName, setCourierName] = useState('Delhivery');
  const [trackingUrl, setTrackingUrl] = useState('');

  // Payment sync / COD collection state
  const [isSyncingPayment, setIsSyncingPayment] = useState(false);
  const [isCollectingCOD, setIsCollectingCOD] = useState(false);
  const [codNotes, setCodNotes] = useState('');
  const [showCODModal, setShowCODModal] = useState(false);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Staff notes editor state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [staffNoteInput, setStaffNoteInput] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadOrder = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [data, cfg] = await Promise.all([
        fetchAdminOrder(token, parseInt(id, 10)),
        fetchFulfillmentConfig(token).catch(() => null),
      ]);
      setOrder(data);
      if (cfg) setFulfillmentConfig(cfg);
      if (data.courier_name) setCourierName(data.courier_name);
      if (data.tracking_url) setTrackingUrl(data.tracking_url);
      setStaffNoteInput(data.admin_notes || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [id, token]);

  const handleRefreshTracking = async () => {
    if (!order) return;
    setIsRefreshingTracking(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const refreshed = await refreshFulfillmentTracking(token, order.id);
      setOrder(refreshed);
      setActionSuccess('Live tracking refreshed from Shiprocket.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to refresh live tracking');
    } finally {
      setIsRefreshingTracking(false);
    }
  };

  const handleSyncPayment = async () => {
    if (!order) return;
    setIsSyncingPayment(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const syncResult = await adminSyncPayment(token, order.order_code);
      setActionSuccess(`Payment status: ${syncResult.payment_status} (${syncResult.message})`);
      loadOrder();
    } catch (err: any) {
      setActionError(err.message || 'Payment reconciliation failed');
    } finally {
      setIsSyncingPayment(false);
    }
  };

  const handleConfirmCODCollect = async () => {
    if (!order) return;
    setIsCollectingCOD(true);
    setActionError(null);
    try {
      const updated = await adminCollectCOD(token, order.id, codNotes);
      setOrder(updated);
      setShowCODModal(false);
      setActionSuccess('COD payment collection confirmed and marked PAID.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to record COD collection');
    } finally {
      setIsCollectingCOD(false);
    }
  };

  const handleSaveStaffNotes = async () => {
    if (!order) return;
    setIsSavingNotes(true);
    setActionError(null);
    try {
      const updated = await adminUpdateOrderNotes(token, order.id, staffNoteInput);
      setOrder(updated);
      setIsEditingNotes(false);
      setActionSuccess('Staff notes saved successfully.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to save staff notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleUpdateStatus = async (
    newStatus: string,
    courier?: string,
    tracking?: string
  ) => {
    if (!order) return;
    setIsUpdating(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const updated = await updateAdminOrderStatus(token, order.id, {
        status: newStatus,
        courier_name: courier,
        tracking_url: tracking,
      });
      setOrder(updated);
      setShowShippingForm(false);
      setShowCancelModal(false);
      setActionSuccess(`Order status updated to ${newStatus}.`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update order status');
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
        <p className="text-xs text-gray-500 font-serif">Loading order details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link
          to="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs text-[#5E1224] font-semibold hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Orders List</span>
        </Link>
        <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center space-y-3">
          <p className="text-xs sm:text-sm text-red-800 font-semibold">
            {error || 'Order not found.'}
          </p>
          <button
            onClick={loadOrder}
            className="px-4 py-2 bg-[#5E1224] text-white rounded text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const cleanPhone = order.phone.replace(/\D/g, '').slice(-10);
  const whatsappUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(
    `Hello ${order.customer_name}! Update regarding your Royal Libas order ${order.order_code}. We are preparing your pieces.`
  )}`;

  const currentStatus = order.status.toUpperCase();
  const steps = ['PLACED', 'PACKED', 'SHIPPED', 'DELIVERED'];
  const stepIndex = steps.indexOf(currentStatus);
  const isCancelled = currentStatus === 'CANCELLED';
  const isPaid = order.payment_status === 'PAID';
  const isPrepaid = order.payment_method === 'PREPAID';

  return (
    <div className="space-y-6 font-sans max-w-5xl">
      {/* Back button & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8DFD0]">
        <div>
          <Link
            to="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#5E1224] font-semibold mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Orders List</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Order {order.order_code}
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                isPaid
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : isPrepaid
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              {order.payment_method} &bull; {order.payment_status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Placed on{' '}
            {new Date(order.created_at).toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </div>

        {/* Action Buttons: Call & WhatsApp */}
        <div className="flex items-center gap-2">
          <a
            href={`tel:${cleanPhone}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold shadow-sm"
          >
            <Phone className="w-3.5 h-3.5 text-gray-600" />
            <span>Call Customer</span>
          </a>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-600 hover:text-red-900">
            &times;
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900">
            &times;
          </button>
        </div>
      )}

      {/* Fulfillment State Stepper */}
      <div className="bg-white p-5 sm:p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
        <h2 className="font-serif font-bold text-base text-gray-900 border-b border-gray-100 pb-2">
          Fulfillment State
        </h2>

        {isCancelled ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded flex items-center gap-2 text-red-800 text-xs font-semibold">
            <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>This order is CANCELLED. All reserved inventory was atomically restocked to available inventory.</span>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 text-center py-2">
            {steps.map((st, idx) => {
              const isDone = stepIndex >= idx;
              const isCurrent = stepIndex === idx;
              return (
                <div key={st} className="flex flex-col items-center relative">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 ${
                      isDone
                        ? 'bg-[#5E1224] text-white shadow'
                        : 'bg-gray-100 text-gray-400 border border-gray-200'
                    }`}
                  >
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      isCurrent
                        ? 'text-[#5E1224] font-bold'
                        : isDone
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {st === 'PLACED' ? 'Received' : st}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Status Actions */}
        {!isCancelled && (
          <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
            {currentStatus === 'PLACED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleUpdateStatus('PACKED')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#5E1224] hover:bg-[#4A0E1C] text-white text-xs font-semibold rounded shadow transition-colors"
              >
                <Package className="w-4 h-4" />
                <span>Mark Packed</span>
              </button>
            )}

            {(currentStatus === 'PLACED' || currentStatus === 'CONFIRMED' || currentStatus === 'PACKED') && (
              <>
                <button
                  type="button"
                  disabled={!fulfillmentConfig?.is_configured}
                  onClick={() => setShowFulfillmentModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-300 text-white text-xs font-semibold rounded shadow transition-colors"
                >
                  <Truck className="w-4 h-4 text-[#B58A3C]" />
                  <span>Ship via Shiprocket</span>
                </button>

                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => setShowShippingForm(!showShippingForm)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 text-xs font-semibold rounded shadow-sm"
                >
                  <Truck className="w-4 h-4 text-gray-500" />
                  <span>Manual Tracking Entry</span>
                </button>
              </>
            )}

            {currentStatus === 'SHIPPED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleUpdateStatus('DELIVERED')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded shadow transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Delivered</span>
              </button>
            )}

            <button
              type="button"
              disabled={isUpdating}
              onClick={() => setShowCancelModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold rounded ml-auto transition-colors"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel Order...</span>
            </button>
          </div>
        )}

        {/* Courier & Tracking Form */}
        {showShippingForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdateStatus('SHIPPED', courierName, trackingUrl);
            }}
            className="p-4 bg-[#FCF8F0] rounded border border-[#E8DFD0] space-y-3 mt-4"
          >
            <h3 className="font-semibold text-xs text-gray-900">
              Attach Courier Logistics & Tracking Link
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-600 mb-1 font-medium">Courier Partner</label>
                <select
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                >
                  <option value="Delhivery">Delhivery Express</option>
                  <option value="BlueDart">BlueDart</option>
                  <option value="DTDC">DTDC Air</option>
                  <option value="India Post">India Post Speed Post</option>
                  <option value="Other Courier">Other Courier</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 mb-1 font-medium">
                  Tracking URL / AWB Link <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://www.delhivery.com/track/package/..."
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowShippingForm(false)}
                className="px-3.5 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdating || !trackingUrl.trim()}
                className="px-4 py-1.5 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-white text-xs font-semibold rounded shadow"
              >
                {isUpdating ? 'Saving...' : 'Confirm Shipment'}
              </button>
            </div>
          </form>
        )}

        {/* Logistics & Fulfillment Details Display */}
        {(order.courier_name || order.awb_code) && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-indigo-950 block text-sm">
                  Dispatched via {order.courier_name || 'Courier Partner'}
                </span>
                {order.awb_code && (
                  <span className="text-[11px] font-mono text-gray-800 block mt-0.5">
                    AWB Code: <strong className="bg-white px-1.5 py-0.5 rounded border border-indigo-200">{order.awb_code}</strong>
                  </span>
                )}
                {order.pickup_status && (
                  <span className="text-[11px] text-indigo-800 block mt-0.5">
                    Pickup Status: <strong>{order.pickup_status}</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {order.tracking_url && (
                  <a
                    href={order.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-800 hover:underline inline-flex items-center gap-1 text-xs font-semibold"
                  >
                    <span>Track Consignment</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  disabled={isRefreshingTracking}
                  onClick={handleRefreshTracking}
                  className="inline-flex items-center gap-1 text-xs text-indigo-900 font-semibold bg-white px-3 py-1.5 rounded border border-indigo-300 shadow-sm hover:bg-indigo-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingTracking ? 'animate-spin' : ''}`} />
                  <span>Refresh tracking</span>
                </button>
              </div>
            </div>

            {(order.label_url || order.manifest_url) && (
              <div className="pt-2 border-t border-indigo-200/60 flex flex-wrap items-center gap-4">
                {order.label_url && (
                  <a
                    href={order.label_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#5E1224] hover:underline"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Download Shipping Label (PDF)</span>
                  </a>
                )}
                {order.manifest_url && (
                  <a
                    href={order.manifest_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#5E1224] hover:underline"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Download Manifest (PDF)</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2-Column Layout: Customer Details & Order Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Items */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm p-5 sm:p-6 space-y-4">
          <h2 className="font-serif font-bold text-base text-gray-900 border-b border-gray-100 pb-2">
            Items in Order ({order.items.length})
          </h2>

          <div className="space-y-3 divide-y divide-gray-100">
            {order.items.map((item) => (
              <div key={item.id} className="pt-3 first:pt-0 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-14 rounded bg-gray-100 overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center font-serif text-[10px] text-[#5E1224] bg-[#FCF8F0]">
                    RL
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{item.product_name_snapshot}</h3>
                    <p className="text-gray-600 text-[11px] mt-0.5">
                      Size: <strong className="text-gray-900">{item.size_snapshot}</strong>
                      {item.colour_snapshot && ` • Shade: ${item.colour_snapshot}`}
                      {' • '}Qty: <strong className="text-gray-900">{item.quantity}</strong>
                    </p>
                    <p className="text-gray-400 text-[10px]">
                      Unit Price: {formatPrice(item.unit_price_snapshot)}
                    </p>
                  </div>
                </div>

                <span className="font-bold text-gray-900 font-mono text-sm">
                  {formatPrice(item.line_total)}
                </span>
              </div>
            ))}
          </div>

          {/* Pricing Totals */}
          <div className="pt-4 border-t border-gray-100 space-y-2 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Items Subtotal</span>
              <span className="font-semibold text-gray-900">{formatPrice(order.subtotal)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Promotional Discount</span>
                <span>-{formatPrice(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Shipping Fee</span>
              <span className="font-semibold text-gray-900">
                {Number(order.shipping_charge) === 0 ? 'FREE' : formatPrice(order.shipping_charge)}
              </span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between text-base font-bold text-[#5E1224]">
              <span>Final Total</span>
              <span className="font-mono">{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Customer Info, Payment Status, Delivery Address, Staff Notes */}
        <div className="space-y-6">
          {/* Payment Card & Reconciliation Actions */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h2 className="font-serif font-bold text-base text-gray-900 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-[#B58A3C]" />
                <span>Payment Details</span>
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {order.payment_status}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Method:</span>
                <span className="font-semibold text-gray-900">{order.payment_method}</span>
              </div>
              {order.cashfree_order_id && (
                <div className="flex justify-between text-gray-600">
                  <span>Cashfree ID:</span>
                  <span className="font-mono text-gray-800">{order.cashfree_order_id}</span>
                </div>
              )}
            </div>

            {/* Reconciliation Button for Prepaid */}
            {isPrepaid && (
              <button
                type="button"
                disabled={isSyncingPayment}
                onClick={handleSyncPayment}
                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded font-semibold text-xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPayment ? 'animate-spin' : ''}`} />
                <span>{isSyncingPayment ? 'Checking with Cashfree...' : 'Reconcile with Cashfree'}</span>
              </button>
            )}

            {/* Record Cash Collection for COD */}
            {!isPrepaid && !isPaid && order.status !== 'CANCELLED' && (
              <button
                type="button"
                onClick={() => setShowCODModal(true)}
                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-xs transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Record Cash Collection</span>
              </button>
            )}
          </div>

          {/* Customer Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-3 text-xs">
            <h2 className="font-serif font-bold text-base text-gray-900 border-b border-gray-100 pb-2">
              Buyer Details
            </h2>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-semibold">
                Customer Name
              </span>
              <p className="font-bold text-gray-900 text-sm">{order.customer_name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-semibold">
                Contact Phone
              </span>
              <p className="font-mono font-medium text-gray-800">{order.phone}</p>
            </div>
          </div>

          {/* Delivery Address Card */}
          {order.address && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <MapPin className="w-4 h-4 text-[#B58A3C]" />
                <h2 className="font-serif font-bold text-base text-gray-900">
                  Delivery Address
                </h2>
              </div>
              <div className="text-gray-700 space-y-1 leading-relaxed">
                <p className="font-bold text-gray-900">{order.address.name}</p>
                <p>{order.address.line1}</p>
                {order.address.line2 && <p>{order.address.line2}</p>}
                <p>
                  {order.address.city}, {order.address.state} -{' '}
                  <strong className="font-mono">{order.address.pincode}</strong>
                </p>
                <p className="text-gray-500 pt-1">Phone: {order.address.phone}</p>
              </div>
            </div>
          )}

          {/* Staff Notes Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h2 className="font-serif font-bold text-base text-gray-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#B58A3C]" />
                <span>Internal Notes</span>
              </h2>
              {!isEditingNotes && (
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(true)}
                  className="text-xs text-[#5E1224] hover:underline font-semibold"
                >
                  {order.admin_notes ? 'Edit' : '+ Add Note'}
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={staffNoteInput}
                  onChange={(e) => setStaffNoteInput(e.target.value)}
                  placeholder="Record customer communication, custom alterations, or pickup details..."
                  className="w-full p-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224] h-24"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStaffNoteInput(order.admin_notes || '');
                      setIsEditingNotes(false);
                    }}
                    className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingNotes}
                    onClick={handleSaveStaffNotes}
                    className="px-3 py-1 bg-[#5E1224] hover:bg-[#4A0E1C] text-white text-xs font-semibold rounded"
                  >
                    {isSavingNotes ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                {order.admin_notes || <span className="text-gray-400 italic">No internal notes entered.</span>}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cancellation Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-200">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-serif font-bold text-gray-900">
                Confirm Order Cancellation
              </h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to cancel order <strong>{order.order_code}</strong>?
              All reserved garments will be automatically returned to available catalogue stock.
              If a courier shipment has been generated and not picked up, it will be cancelled with Shiprocket.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded text-xs font-medium"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleUpdateStatus('CANCELLED')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
              >
                {isUpdating ? 'Cancelling...' : 'Confirm Cancellation & Restock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record COD Collection Modal */}
      {showCODModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-200">
            <div className="flex items-center gap-3 text-emerald-700">
              <CheckCircle2 className="w-6 h-6" />
              <h3 className="text-base font-serif font-bold text-gray-900">
                Confirm COD Cash Collection
              </h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Record receipt of <strong>{formatPrice(order.total)}</strong> for order{' '}
              <strong>{order.order_code}</strong>. This updates the payment status to <strong>PAID</strong> and logs
              the collection in the activity audit trail.
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Receipt Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Handed over by courier delivery driver"
                value={codNotes}
                onChange={(e) => setCodNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCODModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCollectingCOD}
                onClick={handleConfirmCODCollect}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold"
              >
                {isCollectingCOD ? 'Saving...' : 'Confirm Paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shiprocket Fulfillment Modal */}
      {showFulfillmentModal && order && (
        <FulfillmentModal
          order={order}
          isOpen={true}
          onClose={() => setShowFulfillmentModal(false)}
          onSuccess={(updated) => {
            setOrder(updated);
            setShowFulfillmentModal(false);
          }}
          token={token}
          providerLabel={fulfillmentConfig?.button_label}
        />
      )}
    </div>
  );
};
