import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Truck,
  Search,
  RefreshCw,
  ExternalLink,
  FileText,
  CheckCircle,
  Clock,
  Package,
  Send,
  X,
  MapPin,
  Phone,
} from 'lucide-react';
import {
  adminListShipments,
  shipOrderViaFulfillment,
  refreshFulfillmentTracking,
  updateAdminOrderStatus,
} from '../../lib/api';

interface ShipmentRecord {
  order_id: number;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_pincode?: string;
  delivery_city?: string;
  status: string;
  payment_method: string;
  shiprocket_order_id?: string;
  shipment_id?: string;
  awb_code?: string;
  courier_name?: string;
  pickup_status?: string;
  tracking_url?: string;
  label_url?: string;
  manifest_url?: string;
  created_at: string;
}

export const AdminShipping: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters
  const [tab, setTab] = useState<'all' | 'awaiting_shipment' | 'active_shipments' | 'delivered'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Ship Modal State
  const [shippingModalOrder, setShippingModalOrder] = useState<ShipmentRecord | null>(null);
  const [manualCourier, setManualCourier] = useState('');
  const [manualAwb, setManualAwb] = useState('');
  const [manualTrackingUrl, setManualTrackingUrl] = useState('');
  const [submittingShipment, setSubmittingShipment] = useState(false);

  // Live Track Modal State
  const [trackingModalData, setTrackingModalData] = useState<{
    order_code: string;
    data: any;
  } | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const fetchShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListShipments(token, tab, searchTerm);
      setShipments(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch shipment ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, [tab, token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchShipments();
  };

  const handleShiprocketAutoCreate = async (order: ShipmentRecord) => {
    if (!window.confirm(`Generate Shiprocket consignment & AWB for order #${order.order_code}?`)) {
      return;
    }
    setSubmittingShipment(true);
    setActionSuccess(null);
    setError(null);
    try {
      await shipOrderViaFulfillment(token, order.order_id, {
        length: 30,
        breadth: 20,
        height: 10,
        weight: 1.0,
      });
      setActionSuccess(`Shiprocket shipment generated successfully for #${order.order_code}!`);
      await fetchShipments();
    } catch (err: any) {
      setError(err.message || 'Failed to create Shiprocket consignment. Please check Shiprocket credentials.');
    } finally {
      setSubmittingShipment(false);
    }
  };

  const handleManualShipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shippingModalOrder) return;
    if (!manualCourier.trim()) {
      setError('Courier name is required');
      return;
    }
    if (!manualAwb.trim() && !manualTrackingUrl.trim()) {
      setError('Courier tracking link or AWB is required');
      return;
    }

    setSubmittingShipment(true);
    setError(null);
    try {
      await updateAdminOrderStatus(token, shippingModalOrder.order_id, {
        status: 'SHIPPED',
        courier_name: manualCourier.trim(),
        tracking_url: manualTrackingUrl.trim() || (manualAwb.trim() ? `https://track.courier.com/${manualAwb.trim()}` : undefined),
      });
      setActionSuccess(`Order #${shippingModalOrder.order_code} marked as Shipped!`);
      setShippingModalOrder(null);
      setManualCourier('');
      setManualAwb('');
      setManualTrackingUrl('');
      await fetchShipments();
    } catch (err: any) {
      setError(err.message || 'Failed to record manual shipment');
    } finally {
      setSubmittingShipment(false);
    }
  };

  const handleCheckLiveTracking = async (order: ShipmentRecord) => {
    setTrackingLoading(true);
    setError(null);
    try {
      const trackData = await refreshFulfillmentTracking(token, order.order_id);
      setTrackingModalData({
        order_code: order.order_code,
        data: trackData,
      });
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve live carrier tracking.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleMarkDelivered = async (order: ShipmentRecord) => {
    if (!window.confirm(`Confirm order #${order.order_code} has been delivered to customer?`)) return;
    try {
      await updateAdminOrderStatus(token, order.order_id, { status: 'DELIVERED' });
      setActionSuccess(`Order #${order.order_code} marked as Delivered.`);
      await fetchShipments();
    } catch (err: any) {
      setError(err.message || 'Failed to update order status');
    }
  };

  const awaitingCount = shipments.filter(
    (s) => ['CONFIRMED', 'PACKED'].includes(s.status) && !s.awb_code
  ).length;
  const activeCount = shipments.filter((s) => s.awb_code && s.status !== 'DELIVERED').length;
  const deliveredCount = shipments.filter((s) => s.status === 'DELIVERED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <Truck className="w-6 h-6 text-[#B58A3C]" />
            Shipping & Pickups
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Manage dispatch, Shiprocket couriers, AWB allocation, tracking, and pickup schedules.
          </p>
        </div>
        <button
          onClick={fetchShipments}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#E5D9C5] text-xs font-semibold text-gray-700 rounded-lg shadow-sm hover:bg-[#FCF8F0] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-600 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{awaitingCount}</div>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Awaiting Dispatch</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-sky-50 rounded-lg text-sky-600 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{activeCount}</div>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Active In-Transit</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600 shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{deliveredCount}</div>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Delivered</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'awaiting_shipment', label: 'Awaiting Shipment' },
              { id: 'active_shipments', label: 'In Transit' },
              { id: 'delivered', label: 'Delivered' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'bg-[#5E1224] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search code, customer, AWB..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
          </form>
        </div>
      </div>

      {/* Shipment Ledger Table */}
      <div className="bg-white rounded-xl border border-[#E5D9C5]/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
            Loading shipment ledger...
          </div>
        ) : shipments.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <Package className="w-8 h-8 text-gray-300" />
            No shipments match your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-gray-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Order Code</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Destination</th>
                  <th className="py-3 px-4">Carrier & AWB</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Documents</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shipments.map((s) => {
                  const isShipped = !!s.awb_code;
                  return (
                    <tr key={s.order_id} className="hover:bg-amber-50/20 transition-colors">
                      {/* Order Code */}
                      <td className="py-3 px-4">
                        <Link
                          to={`/admin/orders/${s.order_id}`}
                          className="font-bold text-[#5E1224] hover:underline font-mono"
                        >
                          #{s.order_code}
                        </Link>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Recipient */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{s.customer_name}</div>
                        <div className="text-gray-500 flex items-center gap-1 text-[11px] mt-0.5">
                          <Phone className="w-3 h-3 text-gray-400" />
                          {s.customer_phone}
                        </div>
                      </td>

                      {/* Destination */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 text-gray-800">
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{s.delivery_city || 'City N/A'}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                          PIN: {s.delivery_pincode || 'N/A'}
                        </div>
                      </td>

                      {/* Carrier & AWB */}
                      <td className="py-3 px-4">
                        {s.awb_code ? (
                          <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                              <Truck className="w-3 h-3 text-[#B58A3C]" />
                              {s.courier_name || 'Assigned Courier'}
                            </div>
                            <div className="font-mono text-[10px] text-gray-600 mt-0.5">
                              AWB: <span className="font-bold text-gray-900">{s.awb_code}</span>
                            </div>
                            {s.pickup_status && (
                              <span className="inline-block px-1.5 py-0.5 mt-1 bg-gray-100 text-[9px] rounded font-medium text-gray-600">
                                Pickup: {s.pickup_status}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Not Assigned</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'SHIPPED'
                              ? 'bg-sky-100 text-sky-800'
                              : s.status === 'PACKED'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>

                      {/* Documents */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {s.label_url ? (
                            <a
                              href={s.label_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-[#5E1224] font-medium hover:underline"
                            >
                              <FileText className="w-3 h-3" /> Shipping Label
                            </a>
                          ) : null}
                          {s.manifest_url ? (
                            <a
                              href={s.manifest_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-[#5E1224] font-medium hover:underline"
                            >
                              <FileText className="w-3 h-3" /> Manifest
                            </a>
                          ) : null}
                          {s.tracking_url ? (
                            <a
                              href={s.tracking_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-[#B58A3C] font-medium hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" /> Carrier Track
                            </a>
                          ) : null}
                          {!s.label_url && !s.manifest_url && !s.tracking_url && (
                            <span className="text-gray-400 text-[10px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isShipped && s.status !== 'CANCELLED' && (
                            <>
                              <button
                                onClick={() => handleShiprocketAutoCreate(s)}
                                disabled={submittingShipment}
                                className="px-2 py-1 bg-[#5E1224] text-white rounded text-[11px] font-semibold hover:bg-[#4A0E1C] transition-colors disabled:opacity-50"
                                title="Auto-create Shiprocket consignment"
                              >
                                Shiprocket
                              </button>
                              <button
                                onClick={() => setShippingModalOrder(s)}
                                className="px-2 py-1 bg-white border border-[#E5D9C5] text-gray-700 rounded text-[11px] font-semibold hover:bg-gray-50 transition-colors"
                                title="Manual courier dispatch"
                              >
                                Manual Ship
                              </button>
                            </>
                          )}

                          {isShipped && (
                            <>
                              <button
                                onClick={() => handleCheckLiveTracking(s)}
                                disabled={trackingLoading}
                                className="px-2 py-1 bg-white border border-[#E5D9C5] text-gray-700 rounded text-[11px] font-medium hover:bg-gray-50 transition-colors inline-flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Track
                              </button>
                              {s.status !== 'DELIVERED' && (
                                <button
                                  onClick={() => handleMarkDelivered(s)}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold hover:bg-emerald-700 transition-colors"
                                >
                                  Delivered
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Shipping Dispatch Modal */}
      {shippingModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-[#E5D9C5] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-[#5E1224]" />
                Dispatch Order #{shippingModalOrder.order_code}
              </h3>
              <button
                onClick={() => setShippingModalOrder(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualShipSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Courier / Logistics Partner <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Blue Dart, Delhivery, DTDC"
                  value={manualCourier}
                  onChange={(e) => setManualCourier(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Air Waybill Number (AWB)
                </label>
                <input
                  type="text"
                  placeholder="e.g., 7839210492"
                  value={manualAwb}
                  onChange={(e) => setManualAwb(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tracking URL
                </label>
                <input
                  type="url"
                  placeholder="https://track.courier.com/..."
                  value={manualTrackingUrl}
                  onChange={(e) => setManualTrackingUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShippingModalOrder(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingShipment}
                  className="px-4 py-1.5 bg-[#5E1224] text-white text-xs font-semibold rounded-lg hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  {submittingShipment ? 'Updating...' : 'Confirm Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Tracking View Modal */}
      {trackingModalData && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 border border-[#E5D9C5] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#B58A3C]" />
                Live Tracking #{trackingModalData.order_code}
              </h3>
              <button
                onClick={() => setTrackingModalData(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="font-semibold text-gray-800">Carrier Status:</div>
                <div className="text-gray-700 mt-1 font-mono text-xs">
                  {trackingModalData.data?.current_status || 'In Transit'}
                </div>
              </div>

              {trackingModalData.data?.tracking_data?.track_url && (
                <div>
                  <a
                    href={trackingModalData.data.tracking_data.track_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#5E1224] font-semibold hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Carrier Tracking Page
                  </a>
                </div>
              )}

              <div className="max-h-60 overflow-y-auto space-y-2 mt-2">
                {Array.isArray(trackingModalData.data?.scans) && trackingModalData.data.scans.length > 0 ? (
                  trackingModalData.data.scans.map((scan: any, idx: number) => (
                    <div key={idx} className="p-2 border-l-2 border-[#B58A3C] bg-[#FCF8F0]/30 pl-3">
                      <div className="font-semibold text-gray-900">{scan.activity || scan.status}</div>
                      <div className="text-gray-500 text-[10px]">{scan.location} • {scan.date}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500 italic p-2">
                    Latest status: {trackingModalData.data?.status || 'Shipment registered with carrier.'}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setTrackingModalData(null)}
                className="px-4 py-1.5 bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
