import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Package,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { fetchAdminOrders, formatPrice } from '../../lib/api';
import { OrderResponse } from '../../types/order';

export const AdminReports: React.FC = () => {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminOrders(token);
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load orders reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#5B111A] animate-spin" />
        <p className="text-xs text-gray-500 font-serif">Generating operations reports from real orders...</p>
      </div>
    );
  }

  // Real calculations directly from order records - zero mock numbers
  const nonCancelledOrders = orders.filter((o) => o.status.toUpperCase() !== 'CANCELLED');
  const realTotalRevenue = nonCancelledOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const avgOrderValue = nonCancelledOrders.length > 0 ? realTotalRevenue / nonCancelledOrders.length : 0;

  // Breakdown by payment method
  const prepaidOrders = orders.filter((o) => o.payment_method.toUpperCase() === 'PREPAID');
  const codOrders = orders.filter((o) => o.payment_method.toUpperCase() === 'COD');

  // Breakdown by status
  const statusCounts: Record<string, number> = {
    PLACED: 0,
    PACKED: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };

  orders.forEach((o) => {
    const s = o.status.toUpperCase();
    if (statusCounts[s] !== undefined) {
      statusCounts[s]++;
    } else {
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
  });

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8DFD0]">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#5B111A]" />
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Sales & Fulfillment Reports
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Real aggregated financials and status distributions computed from database records
          </p>
        </div>

        <button
          type="button"
          onClick={loadReports}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#E8DFD0] bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-sm transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Reports</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* KPI Cards (All Real Numbers) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-1.5">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
            Total Orders
          </span>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-gray-900">
            {orders.length}
          </div>
          <p className="text-[11px] text-gray-400">
            {nonCancelledOrders.length} active fulfillment records
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-1.5">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
            Real Total Revenue
          </span>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-[#5B111A]">
            {formatPrice(realTotalRevenue)}
          </div>
          <p className="text-[11px] text-gray-400">Sum of real order totals</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-1.5">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
            Average Order Value
          </span>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-gray-900">
            {formatPrice(avgOrderValue)}
          </div>
          <p className="text-[11px] text-gray-400">Per non-cancelled order</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-1.5">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
            Prepaid vs COD
          </span>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-gray-900">
            {prepaidOrders.length} / {codOrders.length}
          </div>
          <p className="text-[11px] text-gray-400">
            {prepaidOrders.length > 0
              ? `${Math.round((prepaidOrders.length / orders.length) * 100)}% Prepaid adoption`
              : 'All orders currently COD'}
          </p>
        </div>
      </div>

      {/* Orders By Status Grid */}
      <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
        <h2 className="font-serif font-bold text-base text-gray-900 border-b border-gray-100 pb-2.5">
          Orders Distribution by Status
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
            <div className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Needs Packing</span>
            </div>
            <div className="text-xl font-bold font-serif text-amber-900 mt-1">
              {statusCounts.PLACED}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80">
            <div className="flex items-center gap-1.5 text-blue-800 text-xs font-semibold">
              <Package className="w-4 h-4 text-blue-600" />
              <span>Packed</span>
            </div>
            <div className="text-xl font-bold font-serif text-blue-900 mt-1">
              {statusCounts.PACKED}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80">
            <div className="flex items-center gap-1.5 text-indigo-800 text-xs font-semibold">
              <Truck className="w-4 h-4 text-indigo-600" />
              <span>Shipped</span>
            </div>
            <div className="text-xl font-bold font-serif text-indigo-900 mt-1">
              {statusCounts.SHIPPED}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
            <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Delivered</span>
            </div>
            <div className="text-xl font-bold font-serif text-emerald-900 mt-1">
              {statusCounts.DELIVERED}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200/80">
            <div className="flex items-center gap-1.5 text-red-800 text-xs font-semibold">
              <XCircle className="w-4 h-4 text-red-600" />
              <span>Cancelled</span>
            </div>
            <div className="text-xl font-bold font-serif text-red-900 mt-1">
              {statusCounts.CANCELLED}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders List with Link to Dedicated Detail */}
      <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-serif font-bold text-base text-gray-900">
            Recent Orders ({orders.length})
          </h2>
          <Link
            to="/admin/orders"
            className="text-xs font-semibold text-[#5B111A] hover:underline"
          >
            Fulfillment Queue →
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-xs">
            No orders placed yet. Real order metrics will populate once orders are received.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F2] text-gray-600 border-b border-[#E8DFD0] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Order Code</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.slice(0, 10).map((o) => (
                  <tr key={o.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#5B111A]">
                      {o.order_code}
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900">
                      <div>{o.customer_name}</div>
                      <div className="text-[10px] text-gray-400">{o.phone}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(o.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700">
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          o.payment_method === 'PREPAID'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {o.payment_method}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900 font-mono">
                      {formatPrice(o.total)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        to={`/admin/orders/${o.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5B111A] hover:text-[#3A080F]"
                      >
                        <span>Details</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
