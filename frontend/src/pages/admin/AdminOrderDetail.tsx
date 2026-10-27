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
} from 'lucide-react';
import { fetchAdminOrder, updateAdminOrderStatus, formatPrice } from '../../lib/api';
import { OrderResponse } from '../../types/order';

export const AdminOrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fulfillment update state
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showShippingForm, setShowShippingForm] = useState(false);
  const [courierName, setCourierName] = useState('Delhivery');
  const [trackingUrl, setTrackingUrl] = useState('');

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadOrder = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminOrder(token, parseInt(id, 10));
      setOrder(data);
      if (data.courier_name) setCourierName(data.courier_name);
      if (data.tracking_url) setTrackingUrl(data.tracking_url);
    } catch (err: any) {
      setError(err.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [id, token]);

  const handleUpdateStatus = async (
    newStatus: string,
    courier?: string,
    tracking?: string
  ) => {
    if (!order) return;
    setIsUpdating(true);
    setActionError(null);

    try {
      const updated = await updateAdminOrderStatus(token, order.id, {
        status: newStatus,
        courier_name: courier,
        tracking_url: tracking,
      });
      setOrder(updated);
      setShowShippingForm(false);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update order status');
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#5B111A] animate-spin" />
        <p className="text-xs text-gray-500 font-serif">Loading order details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link
          to="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs text-[#5B111A] font-semibold hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Fulfillment Queue</span>
        </Link>
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
          <p className="text-xs sm:text-sm text-red-800 font-semibold">
            {error || 'Order not found.'}
          </p>
          <button
            onClick={loadOrder}
            className="px-4 py-2 bg-[#5B111A] text-white rounded text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const cleanPhone = order.phone.replace(/\D/g, '').slice(-10);
  const whatsappUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(
    `Hello ${order.customer_name}! Thank you for your order with Royal Libas (Ref: ${order.order_code}). We are preparing your pieces.`
  )}`;

  const currentStatus = order.status.toUpperCase();
  const steps = ['PLACED', 'PACKED', 'SHIPPED', 'DELIVERED'];
  const stepIndex = steps.indexOf(currentStatus);
  const isCancelled = currentStatus === 'CANCELLED';

  return (
    <div className="space-y-6 font-sans max-w-5xl">
      {/* Back button & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8DFD0]">
        <div>
          <Link
            to="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#5B111A] font-semibold mb-2"
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
                order.payment_method === 'PREPAID'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {order.payment_method}
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold shadow-sm transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-gray-600" />
            <span>Call Customer</span>
          </a>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Delivery State Stepper */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
        <h2 className="font-serif font-bold text-base text-gray-900 border-b border-gray-100 pb-2">
          Fulfillment State
        </h2>

        {isCancelled ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-800 text-xs font-semibold">
            <XCircle className="w-4 h-4 text-red-600" />
            <span>This order has been CANCELLED and items returned to available stock.</span>
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
                        ? 'bg-[#5B111A] text-white shadow'
                        : 'bg-gray-100 text-gray-400 border border-gray-200'
                    }`}
                  >
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      isCurrent
                        ? 'text-[#5B111A] font-bold'
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
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#5B111A] hover:bg-[#3A080F] text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                <Package className="w-4 h-4" />
                <span>Mark Packed</span>
              </button>
            )}

            {(currentStatus === 'PLACED' || currentStatus === 'PACKED') && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => setShowShippingForm(!showShippingForm)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                <Truck className="w-4 h-4" />
                <span>Mark Shipped & Attach Tracking</span>
              </button>
            )}

            {currentStatus === 'SHIPPED' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleUpdateStatus('DELIVERED')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Delivered</span>
              </button>
            )}

            <button
              type="button"
              disabled={isUpdating}
              onClick={() => {
                if (window.confirm('Cancel this order and restock items to inventory?')) {
                  handleUpdateStatus('CANCELLED');
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold rounded-lg ml-auto transition-colors"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel Order</span>
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
            className="p-4 bg-[#FAF7F2] rounded-xl border border-[#E8DFD0] space-y-3 mt-4"
          >
            <h3 className="font-semibold text-xs text-gray-900">
              Attach Logistics & Tracking Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-600 mb-1 font-medium">Courier Partner</label>
                <select
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 focus:outline-none focus:border-[#5B111A]"
                >
                  <option value="Delhivery">Delhivery Express</option>
                  <option value="BlueDart">BlueDart</option>
                  <option value="DTDC">DTDC Air</option>
                  <option value="India Post">India Post Speed Post</option>
                  <option value="Shiprocket">Shiprocket</option>
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
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 focus:outline-none focus:border-[#5B111A]"
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
                className="px-4 py-1.5 bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-400 text-white text-xs font-semibold rounded shadow"
              >
                {isUpdating ? 'Saving...' : 'Confirm Shipment'}
              </button>
            </div>
          </form>
        )}

        {/* Existing Courier Details Display */}
        {order.courier_name && (
          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="font-semibold text-indigo-900 block">
                Dispatched via {order.courier_name}
              </span>
              {order.tracking_url && (
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-700 hover:underline inline-flex items-center gap-1 mt-0.5 text-[11px]"
                >
                  <span>Track Consignment</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <span className="text-[10px] font-mono text-indigo-500">AWB Active</span>
          </div>
        )}
      </div>

      {/* 2-Column Layout: Customer Details & Order Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Items */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E8DFD0] shadow-sm p-5 sm:p-6 space-y-4">
          <h2 className="font-serif font-bold text-base text-gray-900 border-b border-gray-100 pb-2">
            Items in Order ({order.items.length})
          </h2>

          <div className="space-y-3 divide-y divide-gray-100">
            {order.items.map((item) => (
              <div key={item.id} className="pt-3 first:pt-0 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-14 rounded bg-gray-100 overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center font-serif text-[10px] text-[#5B111A] bg-[#FAF7F2]">
                    RL
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{item.product_name_snapshot}</h3>
                    <p className="text-gray-500 text-[11px] mt-0.5">
                      Size: <strong>{item.size_snapshot}</strong>
                      {item.colour_snapshot && ` • ${item.colour_snapshot}`}
                      {' • '}Qty: <strong>{item.quantity}</strong>
                    </p>
                    <p className="text-gray-400 text-[10px]">
                      Unit: {formatPrice(item.unit_price_snapshot)}
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
                <span>Discount</span>
                <span>-{formatPrice(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Shipping Fee</span>
              <span className="font-semibold text-gray-900">
                {Number(order.shipping_charge) === 0 ? 'FREE' : formatPrice(order.shipping_charge)}
              </span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between text-base font-bold text-[#5B111A]">
              <span>Final Total</span>
              <span className="font-mono">{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Customer Info & Shipping Address */}
        <div className="space-y-6">
          {/* Customer Card */}
          <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-sm p-5 space-y-3 text-xs">
            <h2 className="font-serif font-bold text-base text-gray-900 border-b border-gray-100 pb-2">
              Buyer Details
            </h2>
            <div className="space-y-1.5">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-semibold">
                Customer Name
              </span>
              <p className="font-bold text-gray-900 text-sm">{order.customer_name}</p>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-semibold">
                Contact Phone
              </span>
              <p className="font-mono font-medium text-gray-800">{order.phone}</p>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-semibold">
                Payment Method
              </span>
              <p className="font-semibold text-gray-800">
                {order.payment_method === 'PREPAID' ? 'Prepaid (Gateway)' : 'Cash on Delivery (COD)'}
              </p>
            </div>
          </div>

          {/* Delivery Address Card */}
          {order.address && (
            <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-sm p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <MapPin className="w-4 h-4 text-[#C59B27]" />
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
        </div>
      </div>
    </div>
  );
};
