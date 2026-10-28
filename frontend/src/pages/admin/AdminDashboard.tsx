import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Loader2,
  CreditCard,
  Truck,
  Boxes,
  Clock,
  XCircle,
} from 'lucide-react';
import { fetchAdminDashboard, formatPrice } from '../../lib/api';
import { OrderResponse } from '../../types/order';

interface UpgradedDashboardData {
  orders_today: number;
  to_pack_count: number;
  total_orders: number;
  pending_prepaid_count?: number;
  failed_payment_count?: number;
  awaiting_shipment_count?: number;
  awaiting_pickup_count?: number;
  low_stock_count?: number;
  out_of_stock_count?: number;
  today_revenue_prepaid?: number | string;
  today_pending_cod?: number | string;
  recent_orders?: OrderResponse[];
  low_stock_variants?: Array<{
    variant_id: number;
    product_name: string;
    product_slug: string;
    size: string;
    colour?: string;
    stock: number;
    selling_price: number | string;
  }>;
}

export const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<UpgradedDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminDashboard(token);
      setData(res as any);
    } catch (err: any) {
      setError(err.message || 'Failed to load operational dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
        <p className="text-xs text-gray-500 font-serif">Loading operational dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center space-y-3 max-w-xl mx-auto my-12">
        <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
        <p className="text-sm text-red-800 font-semibold">{error || 'Unable to retrieve dashboard.'}</p>
        <button
          onClick={loadDashboard}
          className="px-5 py-2 bg-[#5E1224] text-white rounded text-xs font-semibold hover:bg-[#4A0E1C]"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  const prepaidRev = Number(data.today_revenue_prepaid || 0);
  const pendingCod = Number(data.today_pending_cod || 0);

  return (
    <div className="space-y-8">
      {/* Header with Title and Refresh Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#B58A3C]/20 pb-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#5E1224]">Atelier Overview</h1>
          <p className="text-xs text-gray-600 mt-1">
            Real-time operations, inventory, cashflow, and fulfillment status from live database.
          </p>
        </div>
        <button
          onClick={loadDashboard}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#B58A3C]/40 text-[#5E1224] hover:bg-[#FCF8F0] text-xs font-semibold rounded shadow-sm transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Live Data</span>
        </button>
      </div>

      {/* ========================================================
          TRUTHFUL CASHFLOW CARDS (Prepaid Paid vs Pending COD)
          ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Realized Prepaid Revenue */}
        <div className="bg-white border-l-4 border-emerald-600 p-5 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Today's Prepaid Revenue (Bank Settled)
            </span>
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded">
              Verified Paid
            </span>
          </div>
          <div className="text-2xl font-bold font-serif text-gray-900 mt-2">
            ₹ {prepaidRev.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Prepaid orders successfully confirmed via Cashfree webhook signature verification.
          </p>
        </div>

        {/* Pending COD Amount */}
        <div className="bg-white border-l-4 border-amber-500 p-5 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Today's COD Pending Collection
            </span>
            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded">
              Awaiting Collection
            </span>
          </div>
          <div className="text-2xl font-bold font-serif text-gray-900 mt-2">
            ₹ {pendingCod.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Expected on delivery. Not recognized as realized revenue until courier or staff confirms payment receipt.
          </p>
        </div>
      </div>

      {/* ========================================================
          OPERATIONAL METRICS GRID (Each links to filtered page)
          ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Orders Today */}
        <Link
          to="/admin/orders"
          className="bg-white p-4 rounded-lg border border-gray-200 hover:border-[#5E1224] transition-all hover:shadow-md group block"
        >
          <div className="flex items-center justify-between text-gray-500 group-hover:text-[#5E1224]">
            <span className="text-xs font-semibold">Orders Today</span>
            <Package className="w-4 h-4" />
          </div>
          <div className="text-2xl font-serif font-bold text-gray-900 mt-2">
            {data.orders_today}
          </div>
          <div className="text-[10px] text-[#B58A3C] flex items-center gap-1 mt-1 font-medium">
            <span>View All Orders</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Awaiting Packing */}
        <Link
          to="/admin/orders?status=PLACED"
          className="bg-white p-4 rounded-lg border border-gray-200 hover:border-[#5E1224] transition-all hover:shadow-md group block"
        >
          <div className="flex items-center justify-between text-gray-500 group-hover:text-[#5E1224]">
            <span className="text-xs font-semibold">Awaiting Packing</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-blue-700 mt-2">
            {data.to_pack_count}
          </div>
          <div className="text-[10px] text-blue-600 flex items-center gap-1 mt-1 font-medium">
            <span>Filter Placed Orders</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Awaiting Shipment Creation */}
        <Link
          to="/admin/shipping?tab=awaiting_shipment"
          className="bg-white p-4 rounded-lg border border-gray-200 hover:border-[#5E1224] transition-all hover:shadow-md group block"
        >
          <div className="flex items-center justify-between text-gray-500 group-hover:text-[#5E1224]">
            <span className="text-xs font-semibold">Awaiting Courier</span>
            <Truck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-purple-700 mt-2">
            {data.awaiting_shipment_count ?? 0}
          </div>
          <div className="text-[10px] text-purple-600 flex items-center gap-1 mt-1 font-medium">
            <span>Ready for Shiprocket</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Awaiting Pickup */}
        <Link
          to="/admin/shipping?tab=active_shipments"
          className="bg-white p-4 rounded-lg border border-gray-200 hover:border-[#5E1224] transition-all hover:shadow-md group block"
        >
          <div className="flex items-center justify-between text-gray-500 group-hover:text-[#5E1224]">
            <span className="text-xs font-semibold">Awaiting Pickup</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-indigo-700 mt-2">
            {data.awaiting_pickup_count ?? 0}
          </div>
          <div className="text-[10px] text-indigo-600 flex items-center gap-1 mt-1 font-medium">
            <span>Pickup Scheduled</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Pending Payments */}
        <Link
          to="/admin/payments?status=PENDING"
          className="bg-white p-4 rounded-lg border border-gray-200 hover:border-[#5E1224] transition-all hover:shadow-md group block"
        >
          <div className="flex items-center justify-between text-gray-500 group-hover:text-[#5E1224]">
            <span className="text-xs font-semibold">Pending Payments</span>
            <CreditCard className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-amber-600 mt-2">
            {data.pending_prepaid_count ?? 0}
          </div>
          <div className="text-[10px] text-amber-600 flex items-center gap-1 mt-1 font-medium">
            <span>Reconcile Cashfree</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Failed Payments */}
        <Link
          to="/admin/payments?status=FAILED"
          className="bg-white p-4 rounded-lg border border-gray-200 hover:border-[#5E1224] transition-all hover:shadow-md group block"
        >
          <div className="flex items-center justify-between text-gray-500 group-hover:text-[#5E1224]">
            <span className="text-xs font-semibold">Failed Payments</span>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-serif font-bold text-red-600 mt-2">
            {data.failed_payment_count ?? 0}
          </div>
          <div className="text-[10px] text-red-600 flex items-center gap-1 mt-1 font-medium">
            <span>Inspect Failed</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Low Stock Variants */}
        <Link
          to="/admin/inventory?filter=low_stock"
          className="bg-white p-4 rounded-lg border border-gray-200 hover:border-[#5E1224] transition-all hover:shadow-md group block"
        >
          <div className="flex items-center justify-between text-gray-500 group-hover:text-[#5E1224]">
            <span className="text-xs font-semibold">Low Stock (&le; 5)</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-serif font-bold text-amber-600 mt-2">
            {data.low_stock_count ?? (data.low_stock_variants ? data.low_stock_variants.length : 0)}
          </div>
          <div className="text-[10px] text-amber-700 flex items-center gap-1 mt-1 font-medium">
            <span>Restock Variants</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Out of Stock */}
        <Link
          to="/admin/inventory?filter=out_of_stock"
          className="bg-white p-4 rounded-lg border border-gray-200 hover:border-[#5E1224] transition-all hover:shadow-md group block"
        >
          <div className="flex items-center justify-between text-gray-500 group-hover:text-[#5E1224]">
            <span className="text-xs font-semibold">Out of Stock</span>
            <Boxes className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-serif font-bold text-red-600 mt-2">
            {data.out_of_stock_count ?? 0}
          </div>
          <div className="text-[10px] text-red-600 flex items-center gap-1 mt-1 font-medium">
            <span>Sold Out Items</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </div>

      {/* ========================================================
          RECENT ORDERS TABLE
          ======================================================== */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-serif font-bold text-[#5E1224] text-base">Recent Orders</h2>
            <p className="text-xs text-gray-500">Latest orders placed across guest storefront.</p>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs text-[#B58A3C] font-semibold hover:text-[#5E1224] flex items-center gap-1"
          >
            <span>View All ({data.total_orders})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {data.recent_orders && data.recent_orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FCF8F0] border-b border-gray-200 text-gray-600 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Order Code</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recent_orders.map((o) => {
                  const isPrepaid = o.payment_method === 'PREPAID';
                  const isPaid = o.payment_status === 'PAID';
                  return (
                    <tr key={o.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#5E1224]">
                        <Link to={`/admin/orders/${o.id}`} className="hover:underline">
                          {o.order_code}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{o.customer_name}</div>
                        <div className="text-[11px] text-gray-500">{o.phone}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {o.items?.length || 1} item{o.items?.length !== 1 ? 's' : ''}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700'
                              : isPrepaid
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {o.payment_method} &bull; {o.payment_status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            o.status === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : o.status === 'SHIPPED'
                              ? 'bg-blue-100 text-blue-800'
                              : o.status === 'CANCELLED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">
                        {formatPrice(o.total)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          to={`/admin/orders/${o.id}`}
                          className="px-2.5 py-1 bg-[#5E1224] text-white hover:bg-[#4A0E1C] rounded text-[11px] font-medium inline-block"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 text-xs">
            No orders placed yet. Live orders will populate automatically.
          </div>
        )}
      </div>

      {/* ========================================================
          LOW STOCK ALERTS TABLE
          ======================================================== */}
      {data.low_stock_variants && data.low_stock_variants.length > 0 && (
        <div className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-amber-100 bg-amber-50/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h2 className="font-serif font-bold text-amber-900 text-base">Low Stock Priority Alerts</h2>
            </div>
            <Link
              to="/admin/inventory?filter=low_stock"
              className="text-xs text-amber-800 font-semibold hover:underline flex items-center gap-1"
            >
              <span>Manage All Inventory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FCF8F0] border-b border-gray-200 text-gray-600 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Product</th>
                  <th className="py-2.5 px-4">Variant</th>
                  <th className="py-2.5 px-4">Current Stock</th>
                  <th className="py-2.5 px-4">Selling Price</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.low_stock_variants.map((v) => (
                  <tr key={v.variant_id} className="hover:bg-amber-50/20">
                    <td className="py-2.5 px-4 font-medium text-gray-900">
                      {v.product_name}
                    </td>
                    <td className="py-2.5 px-4 text-gray-600">
                      Size: <span className="font-bold text-gray-800">{v.size}</span>
                      {v.colour && <span className="ml-2 text-gray-500">({v.colour})</span>}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          v.stock === 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {v.stock === 0 ? 'SOLD OUT (0 units)' : `${v.stock} units left`}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-900 font-medium">
                      {formatPrice(v.selling_price as any)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Link
                        to={`/admin/inventory?search=${encodeURIComponent(v.product_name)}`}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-medium inline-block"
                      >
                        Restock
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
