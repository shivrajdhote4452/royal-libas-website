import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Phone,
  MapPin,
  Truck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
} from 'lucide-react';
import {
  fetchAdminOrders,
  updateAdminOrderStatus,
  formatPrice,
  fetchFulfillmentConfig,
  refreshFulfillmentTracking,
} from '../../lib/api';
import { OrderResponse, FulfillmentConfig } from '../../types/order';
import { FulfillmentModal } from '../../components/FulfillmentModal';

export const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Fulfillment configuration and modal state
  const [fulfillmentConfig, setFulfillmentConfig] = useState<FulfillmentConfig | null>(null);
  const [activeFulfillOrder, setActiveFulfillOrder] = useState<OrderResponse | null>(null);
  const [refreshingOrderId, setRefreshingOrderId] = useState<number | null>(null);

  // Manual shipping state (fallback)
  const [shippingOrderId, setShippingOrderId] = useState<number | null>(null);
  const [courierName, setCourierName] = useState('Delhivery');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, cfg] = await Promise.all([
        fetchAdminOrders(token, selectedStatus),
        fetchFulfillmentConfig(token).catch(() => null),
      ]);
      setOrders(res);
      if (cfg) setFulfillmentConfig(cfg);
      // Auto-expand first order if none expanded
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
  }, [token, selectedStatus]);

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

      // Update in local state
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? updated : o))
      );
      setShippingOrderId(null);
      setTrackingUrl('');
    } catch (err: any) {
      setActionError(err.message || 'Failed to update order status');
    } finally {
      setIsUpdating(false);
    }
  };

  const statusFilters = [
    { label: 'All Orders', value: 'ALL' },
    { label: 'Needs Packing', value: 'PLACED' },
    { label: 'Packed', value: 'PACKED' },
    { label: 'Shipped', value: 'SHIPPED' },
    { label: 'Delivered', value: 'DELIVERED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-xs uppercase tracking-widest font-bold text-[#B58A3C]">
            Fulfillment Queue
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
            Customer Orders
          </h1>
        </div>
        <span className="text-xs text-gray-500 font-medium">
          Showing {orders.length} {orders.length === 1 ? 'order' : 'orders'}
        </span>
      </div>

      {/* Filter Tabs (Horizontal Scroll on Mobile) */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {statusFilters.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSelectedStatus(tab.value)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
              selectedStatus === tab.value
                ? 'bg-[#5E1224] text-white border-[#5E1224] shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500 font-serif">Loading order details...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
          <p className="text-xs sm:text-sm text-red-800 font-semibold">{error}</p>
          <button
            onClick={loadOrders}
            className="px-4 py-2 bg-[#5E1224] text-white rounded text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white p-10 rounded-xl border border-[#E8DFD0] text-center space-y-2">
          <Package className="w-10 h-10 text-gray-400 mx-auto" />
          <h3 className="font-serif font-bold text-gray-900 text-base">No orders found</h3>
          <p className="text-xs text-gray-500">
            No orders match the selected filter criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const isCOD = order.payment_method === 'COD';
            const isPaid = order.payment_status === 'PAID';

            return (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-[#E8DFD0] shadow-sm overflow-hidden transition-all duration-200"
              >
                {/* Order Summary Row (Always Visible) */}
                <div
                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FCF8F0] border border-[#E8DFD0] flex items-center justify-center text-[#5E1224] shrink-0 font-serif font-bold text-sm">
                      {order.id}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#5E1224]">
                          {order.order_code}
                        </span>
                        <span className="text-xs font-semibold text-gray-900">
                          {order.customer_name}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
                        <span>{new Date(order.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}</span>
                        <span>•</span>
                        <span>{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span>
                        <span>•</span>
                        <span className="font-semibold text-gray-800">{formatPrice(order.total)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                        order.status === 'DELIVERED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : order.status === 'SHIPPED'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : order.status === 'PACKED'
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          : order.status === 'CANCELLED'
                          ? 'bg-red-50 text-red-800 border-red-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {order.status}
                    </span>

                    <Link
                      to={`/admin/orders/${order.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#5E1224]/5 hover:bg-[#5E1224]/10 text-[#5E1224] text-xs font-semibold transition-colors"
                      title="Open dedicated order page"
                    >
                      <span>Full Page</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>

                    <span className="text-gray-400">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="px-4 pb-5 sm:px-6 pt-2 border-t border-gray-100 bg-[#FCF8F0]/30 space-y-5">
                    {/* Customer Contact & Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      {/* Customer Info */}
                      <div className="bg-white p-4 rounded-lg border border-[#E8DFD0] space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">Customer Details</span>
                          <div className="flex items-center gap-1">
                            {/* Quick WhatsApp button for Tanya */}
                            <a
                              href={`https://wa.me/91${order.phone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(
                                order.customer_name
                              )},%20this%20is%20Tanya%20from%20Royal%20Libas%20regarding%20your%20order%20${order.order_code}.`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1 font-semibold text-[11px]"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>

                            <a
                              href={`tel:+91${order.phone.replace(/\D/g, '')}`}
                              className="p-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center gap-1 font-semibold text-[11px]"
                              title="Call customer"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call</span>
                            </a>
                          </div>
                        </div>

                        <p className="font-semibold text-gray-800">{order.customer_name}</p>
                        <p className="text-gray-600">Phone: +91 {order.phone}</p>

                        {order.address && (
                          <div className="pt-2 border-t border-gray-100 flex items-start gap-1.5 text-gray-600">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-gray-800">
                                {order.address.line1}
                                {order.address.line2 ? `, ${order.address.line2}` : ''}
                              </p>
                              <p>
                                {order.address.city}, {order.address.state} — {order.address.pincode}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Payment & Courier Status */}
                      <div className="bg-white p-4 rounded-lg border border-[#E8DFD0] space-y-2 text-xs">
                        <span className="font-bold text-gray-900 block">Payment & Logistics</span>
                        <div className="space-y-1 text-gray-600">
                          <div className="flex justify-between">
                            <span>Payment Method:</span>
                            <span className="font-semibold text-gray-800">
                              {isCOD ? 'Cash on Delivery (COD)' : 'Online Prepaid'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Payment Status:</span>
                            <span className={`font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {order.payment_status}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total Amount:</span>
                            <span className="font-bold text-[#5E1224]">{formatPrice(order.total)}</span>
                          </div>

                          {order.awb_code && (
                            <div className="pt-2 border-t border-gray-100 space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-[11px] text-gray-500 font-medium">AWB Code:</span>
                                <span className="font-mono font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                                  {order.awb_code}
                                </span>
                              </div>
                              {order.pickup_status && (
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-gray-500">Pickup Status:</span>
                                  <span className="font-semibold text-indigo-700">{order.pickup_status}</span>
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {order.label_url && (
                                  <a
                                    href={order.label_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5E1224] hover:underline"
                                  >
                                    <FileText className="w-3 h-3" />
                                    <span>Label PDF</span>
                                  </a>
                                )}
                                {order.manifest_url && (
                                  <a
                                    href={order.manifest_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5E1224] hover:underline"
                                  >
                                    <FileText className="w-3 h-3" />
                                    <span>Manifest PDF</span>
                                  </a>
                                )}
                                <button
                                  type="button"
                                  disabled={refreshingOrderId === order.id}
                                  onClick={() => handleRefreshTracking(order.id)}
                                  className="inline-flex items-center gap-1 text-[11px] text-indigo-700 hover:text-indigo-900 font-semibold ml-auto disabled:opacity-50"
                                >
                                  <RefreshCw className={`w-3 h-3 ${refreshingOrderId === order.id ? 'animate-spin' : ''}`} />
                                  <span>Refresh tracking</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {order.tracking_url && (
                            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                              <span className="text-[11px] text-gray-500">
                                {order.courier_name || 'Courier'}:
                              </span>
                              <a
                                href={order.tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#5E1224] font-semibold hover:underline flex items-center gap-1"
                              >
                                <span>Track Shipment</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ordered Items List */}
                    <div className="bg-white p-4 rounded-lg border border-[#E8DFD0] space-y-2 text-xs">
                      <span className="font-bold text-gray-900 block">Items in Order</span>
                      <div className="divide-y divide-gray-100">
                        {order.items.map((item) => (
                          <div key={item.id} className="py-2 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-800">{item.product_name_snapshot}</p>
                              <p className="text-[11px] text-gray-500">
                                Size: <strong>{item.size_snapshot}</strong>
                                {item.colour_snapshot ? ` | Colour: ${item.colour_snapshot}` : ''} | Qty: {item.quantity}
                              </p>
                            </div>
                            <span className="font-bold text-[#5E1224]">
                              {formatPrice(item.line_total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Shipping Modal / Input Box (when Tanya clicks "Mark as Shipped") */}
                    {shippingOrderId === order.id && (
                      <div className="bg-white p-4 rounded-lg border-2 border-[#5E1224] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-serif font-bold text-xs sm:text-sm text-[#5E1224] flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-[#B58A3C]" />
                            <span>Add Shipping Details for {order.order_code}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShippingOrderId(null)}
                            className="text-xs text-gray-400 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block font-semibold text-gray-700 mb-1">
                              Courier Partner <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Delhivery / BlueDart / DTDC"
                              value={courierName}
                              onChange={(e) => setCourierName(e.target.value)}
                              className="w-full px-3 py-2 rounded border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                            />
                          </div>

                          <div>
                            <label className="block font-semibold text-gray-700 mb-1">
                              Tracking URL / AWB Link <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="url"
                              required
                              placeholder="https://delhivery.com/track/..."
                              value={trackingUrl}
                              onChange={(e) => setTrackingUrl(e.target.value)}
                              className="w-full px-3 py-2 rounded border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isUpdating || !trackingUrl.trim()}
                          onClick={() =>
                            handleStatusChange(
                              order.id,
                              'SHIPPED',
                              courierName.trim(),
                              trackingUrl.trim()
                            )
                          }
                          className="w-full py-2.5 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-white font-semibold text-xs uppercase tracking-wider rounded transition-colors shadow flex items-center justify-center gap-2"
                        >
                          {isUpdating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Truck className="w-4 h-4" />
                              <span>Confirm Shipment & Notify Tracking</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                      {order.status === 'PLACED' && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(order.id, 'PACKED')}
                          className="px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-semibold rounded text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>Mark as Packed</span>
                        </button>
                      )}

                      {(order.status === 'PLACED' || order.status === 'PACKED') && (
                        <>
                          <div className="relative group">
                            <button
                              type="button"
                              disabled={!fulfillmentConfig?.is_configured}
                              onClick={() => {
                                if (fulfillmentConfig?.is_configured) {
                                  setActiveFulfillOrder(order);
                                }
                              }}
                              title={
                                !fulfillmentConfig?.is_configured
                                  ? (fulfillmentConfig?.disabled_reason || '')
                                  : ''
                              }
                              className="px-3.5 py-2 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-300 disabled:cursor-not-allowed border border-[#5E1224] text-white font-semibold rounded text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                              <Truck className="w-3.5 h-3.5 text-[#B58A3C]" />
                              <span>{fulfillmentConfig?.button_label || 'Ship Parcel'}</span>
                            </button>
                            {!fulfillmentConfig?.is_configured && (
                              <span className="hidden group-hover:block absolute bottom-full left-0 mb-1 z-30 px-2.5 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap">
                                {fulfillmentConfig?.disabled_reason || 'Fulfillment service not configured — use manual tracking'}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setShippingOrderId(order.id);
                              setTrackingUrl(order.tracking_url || '');
                            }}
                            className="px-3.5 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 font-semibold rounded text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                          >
                            <Truck className="w-3.5 h-3.5 text-gray-500" />
                            <span>Manual Tracking Entry</span>
                          </button>
                        </>
                      )}

                      {order.status === 'SHIPPED' && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(order.id, 'DELIVERED')}
                          className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark as Delivered</span>
                        </button>
                      )}

                      {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to cancel order ${order.order_code}?`)) {
                              handleStatusChange(order.id, 'CANCELLED');
                            }
                          }}
                          className="px-3 py-2 text-gray-500 hover:text-red-700 hover:bg-red-50 rounded text-xs font-semibold transition-colors flex items-center gap-1 ml-auto"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel Order</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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

