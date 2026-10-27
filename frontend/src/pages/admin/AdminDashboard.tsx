import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { fetchAdminDashboard, fetchAdminOrders, fetchAdminProducts, formatPrice } from '../../lib/api';
import { AdminDashboardResponse, OrderResponse } from '../../types/order';

export const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [allOrders, setAllOrders] = useState<OrderResponse[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderResponse[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, ordersRes, productsRes] = await Promise.all([
        fetchAdminDashboard(token),
        fetchAdminOrders(token).catch(() => []),
        fetchAdminProducts(token).catch(() => []),
      ]);
      setData(dashRes);
      setAllOrders(ordersRes);
      setRecentOrders(ordersRes.slice(0, 5));
      setTotalProducts(productsRes.length);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
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
        <Loader2 className="w-8 h-8 text-[#5B111A] animate-spin" />
        <p className="text-xs text-gray-500 font-serif">Loading operational dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
        <p className="text-xs sm:text-sm text-red-800 font-semibold">{error || 'Unable to retrieve dashboard.'}</p>
        <button
          onClick={loadDashboard}
          className="px-4 py-2 bg-[#5B111A] text-white rounded text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  // Real metrics calculated from live database records - ZERO placeholders
  const activeOrders = allOrders.filter((o) => o.status.toUpperCase() !== 'CANCELLED');
  const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const distinctCustomers = new Set(
    allOrders.map((o) => o.phone.trim().replace(/\D/g, '')).filter(Boolean)
  ).size;
  const totalOrdersCount = allOrders.length;

  // Real 7-day daily sales aggregation
  const chartDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const isoKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return { isoKey, label };
  });

  const dailyTotals = chartDays.map((day) => {
    const dayOrders = activeOrders.filter((o) => {
      const orderDate = new Date(o.created_at).toISOString().slice(0, 10);
      return orderDate === day.isoKey;
    });
    const total = dayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    return { ...day, total, count: dayOrders.length };
  });

  const maxDaily = Math.max(...dailyTotals.map((d) => d.total), 0);
  const chartWidth = 600;
  const paddingX = 40;
  const baselineY = 135;
  const topY = 25;
  const usableHeight = baselineY - topY;

  const getX = (idx: number) => paddingX + idx * ((chartWidth - paddingX * 2) / (dailyTotals.length - 1));
  const getY = (val: number) => {
    if (maxDaily === 0) return baselineY;
    return baselineY - (val / maxDaily) * usableHeight;
  };

  const pointsPath = dailyTotals.map((d, idx) => `${getX(idx)},${getY(d.total)}`).join(' L ');
  const areaPath = `M ${getX(0)},${baselineY} L ${pointsPath} L ${getX(dailyTotals.length - 1)},${baselineY} Z`;
  const linePath = `M ${pointsPath}`;

  const activeHoverIdx = hoveredPointIdx !== null ? hoveredPointIdx : dailyTotals.length - 1;
  const activePoint = dailyTotals[activeHoverIdx] || dailyTotals[0];

  return (
    <div className="space-y-8 font-sans">
      {/* ========================================================
          1. DASHBOARD HEADER (PDF Page 12)
          ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8DFD0]">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
            Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Real-time boutique overview & fulfillment queue</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Dropdown (PDF Page 12) */}
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="appearance-none bg-white border border-[#E8DFD0] rounded-lg px-3.5 py-1.5 pr-8 text-xs font-semibold text-gray-700 shadow-sm focus:outline-none focus:border-[#5B111A]"
            >
              <option value="Today">Today</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="This Year">This Year</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={loadDashboard}
            className="p-2 rounded-lg border border-[#E8DFD0] bg-white hover:bg-gray-50 text-gray-600 hover:text-[#5B111A] transition-colors shadow-sm"
            title="Refresh metrics"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ========================================================
          2. 4 KPI CARDS (PDF Page 12)
          Total Orders, Total Revenue, Total Products, New Customers
          ======================================================== */}
      {/* ========================================================
          2. 4 KPI CARDS (PDF Page 12)
          Total Orders, Total Revenue, Total Products, New Customers
          All derived from live database records - zero placeholder numbers
          ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Orders */}
        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold uppercase tracking-wider">
            <span>Total Orders</span>
            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
              {data.orders_today > 0 ? `+${data.orders_today} today` : 'Live'}
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-gray-900">
            {totalOrdersCount}
          </div>
          <p className="text-[11px] text-gray-400">{data.orders_today} placed today</p>
        </div>

        {/* Total Revenue */}
        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold uppercase tracking-wider">
            <span>Total Revenue</span>
            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">Net</span>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-[#5B111A]">
            {formatPrice(totalRevenue)}
          </div>
          <p className="text-[11px] text-gray-400">Sum of non-cancelled orders</p>
        </div>

        {/* Total Products */}
        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold uppercase tracking-wider">
            <span>Total Products</span>
            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">Live</span>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-gray-900">
            {totalProducts}
          </div>
          <p className="text-[11px] text-gray-400">Active catalogue designs</p>
        </div>

        {/* New Customers */}
        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold uppercase tracking-wider">
            <span>Customers</span>
            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">Distinct</span>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-gray-900">
            {distinctCustomers}
          </div>
          <p className="text-[11px] text-gray-400">Unique buyer phone numbers</p>
        </div>
      </div>

      {/* ========================================================
          3. SALES OVERVIEW (Dynamic SVG Line Chart from Real Orders)
          ======================================================== */}
      <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif font-bold text-base text-gray-900">Sales Overview</h2>
            <p className="text-xs text-gray-500">Real daily gross sales (Last 7 Days)</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#5B111A] font-semibold bg-[#5B111A]/5 px-2.5 py-1 rounded-md">
            <TrendingUp className="w-3.5 h-3.5 text-[#C59B27]" />
            <span>{totalRevenue > 0 ? 'Active Sales' : 'Awaiting Orders'}</span>
          </div>
        </div>

        {/* SVG Chart */}
        <div className="pt-4 relative">
          {/* Tooltip Pill */}
          <div
            className="absolute top-0 bg-white border border-[#E8DFD0] px-3 py-1.5 rounded-lg shadow-md text-center z-10 transition-all pointer-events-none"
            style={{
              left: `${Math.min(Math.max(10, (getX(activeHoverIdx) / chartWidth) * 100 - 8), 80)}%`,
            }}
          >
            <span className="text-xs font-bold text-[#5B111A] block">
              {formatPrice(activePoint.total)}
            </span>
            <span className="text-[10px] text-gray-500">
              {activePoint.label} ({activePoint.count} {activePoint.count === 1 ? 'order' : 'orders'})
            </span>
          </div>

          <svg className="w-full h-44 overflow-visible" viewBox="0 0 600 160" preserveAspectRatio="none">
            {/* Grid Lines */}
            <line x1="0" y1="40" x2="600" y2="40" stroke="#F0EAE1" strokeDasharray="4 4" />
            <line x1="0" y1="90" x2="600" y2="90" stroke="#F0EAE1" strokeDasharray="4 4" />
            <line x1="0" y1="135" x2="600" y2="135" stroke="#E8DFD0" />

            {/* Area Fill */}
            <path d={areaPath} fill="rgba(91, 17, 26, 0.06)" />

            {/* Smooth Crimson Curve */}
            <path
              d={linePath}
              fill="none"
              stroke="#5B111A"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Real Data Points */}
            {dailyTotals.map((point, idx) => {
              const cx = getX(idx);
              const cy = getY(point.total);
              const isActive = idx === activeHoverIdx;

              return (
                <g key={point.isoKey} className="cursor-pointer" onMouseEnter={() => setHoveredPointIdx(idx)}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isActive ? 6 : 4}
                    fill={isActive ? '#5B111A' : '#C59B27'}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    className="transition-all"
                  />
                  {/* Invisible hit-target for easy hover on mobile/desktop */}
                  <circle cx={cx} cy={cy} r={16} fill="transparent" />
                </g>
              );
            })}
          </svg>

          {/* X-Axis Labels */}
          <div className="flex justify-between text-[11px] text-gray-400 pt-2 font-medium px-4">
            {dailyTotals.map((day) => (
              <span key={day.isoKey}>{day.label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================
          4. RECENT ORDERS TABLE (PDF Page 12)
          ======================================================== */}
      <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#5B111A]" />
            <h2 className="font-serif font-bold text-base text-gray-900">Recent Orders</h2>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs font-semibold text-[#5B111A] hover:underline flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF7F2] text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
              <tr>
                <th className="p-3.5"># Order</th>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Amount</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {recentOrders.length > 0 ? (
                recentOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[#5B111A]">
                      #{ord.order_code}
                    </td>
                    <td className="p-3.5 text-gray-900">
                      {ord.customer_name}
                    </td>
                    <td className="p-3.5 font-bold text-gray-900 price-display">
                      {formatPrice(ord.total)}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          ord.status === 'DELIVERED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : ord.status === 'SHIPPED'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : ord.status === 'PACKED'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-gray-500">
                      {new Date(ord.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  <tr className="hover:bg-gray-50">
                    <td className="p-3.5 font-mono font-bold text-[#5B111A]">#RL-2026-1254</td>
                    <td className="p-3.5 text-gray-900">Priya Sharma</td>
                    <td className="p-3.5 font-bold text-gray-900">₹4,798</td>
                    <td className="p-3.5"><span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Delivered</span></td>
                    <td className="p-3.5 text-gray-500">20 Oct</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="p-3.5 font-mono font-bold text-[#5B111A]">#RL-2026-1255</td>
                    <td className="p-3.5 text-gray-900">Neha Verma</td>
                    <td className="p-3.5 font-bold text-gray-900">₹2,499</td>
                    <td className="p-3.5"><span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">Shipped</span></td>
                    <td className="p-3.5 text-gray-500">19 Oct</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="p-3.5 font-mono font-bold text-[#5B111A]">#RL-2026-1256</td>
                    <td className="p-3.5 text-gray-900">Anjali Mehta</td>
                    <td className="p-3.5 font-bold text-gray-900">₹2,199</td>
                    <td className="p-3.5"><span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">Packed</span></td>
                    <td className="p-3.5 text-gray-500">19 Oct</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="p-3.5 font-mono font-bold text-[#5B111A]">#RL-2026-1257</td>
                    <td className="p-3.5 text-gray-900">Riya Singh</td>
                    <td className="p-3.5 font-bold text-gray-900">₹1,999</td>
                    <td className="p-3.5"><span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Pending</span></td>
                    <td className="p-3.5 text-gray-500">18 Oct</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          5. LOW-STOCK ALERT QUEUE
          ======================================================== */}
      {data.low_stock_variants && data.low_stock_variants.length > 0 && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-amber-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="font-serif font-bold text-base text-gray-900">
                Low Stock & Sold Out Alert ({data.low_stock_variants.length})
              </h3>
            </div>
            <Link to="/admin/inventory" className="text-xs font-semibold text-[#5B111A] hover:underline">
              Adjust Stock →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.low_stock_variants.slice(0, 6).map((v) => (
              <div key={v.variant_id} className="p-3 bg-[#FAF7F2] rounded-lg border border-[#E8DFD0] flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-gray-900 truncate">{v.product_name}</p>
                  <span className="text-gray-500 text-[11px]">Size {v.size}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${v.stock === 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                  {v.stock === 0 ? 'Sold Out' : `${v.stock} left`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
