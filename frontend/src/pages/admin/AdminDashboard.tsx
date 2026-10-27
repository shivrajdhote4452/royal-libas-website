import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  AlertTriangle,
  ShoppingBag,
  TrendingUp,
  Clock,
  ArrowRight,
  Plus,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { fetchAdminDashboard, formatPrice } from '../../lib/api';
import { AdminDashboardResponse } from '../../types/order';

export const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminDashboard(token);
      setData(res);
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
        <p className="text-xs text-gray-500 font-serif">Loading boutique dashboard...</p>
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

  return (
    <div className="space-y-6">
      {/* Top Welcome & Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest font-bold text-[#C59B27]">
            Overview
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
            Tanya's Daily Dashboard
          </h1>
        </div>

        <button
          type="button"
          onClick={loadDashboard}
          className="p-2 rounded-lg border border-gray-200 hover:bg-white text-gray-600 hover:text-[#5B111A] transition-colors"
          title="Refresh dashboard metrics"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {/* Orders Today */}
        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Orders Today
            </span>
            <div className="text-2xl sm:text-3xl font-serif font-bold text-gray-900">
              {data.orders_today}
            </div>
            <p className="text-[11px] text-gray-400">Placed in last 24 hours</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-[#FAF7F2] border border-[#E8DFD0] flex items-center justify-center text-[#5B111A]">
            <Clock className="w-6 h-6 text-[#C59B27]" />
          </div>
        </div>

        {/* Orders Needing Packing */}
        <Link
          to="/admin/orders"
          className="bg-white p-5 rounded-xl border border-amber-300 shadow-sm flex items-center justify-between hover:border-[#5B111A] transition-colors group"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-800 font-bold uppercase tracking-wider">
                Needs Packing
              </span>
              {data.to_pack_count > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </div>
            <div className="text-2xl sm:text-3xl font-serif font-bold text-amber-900">
              {data.to_pack_count}
            </div>
            <p className="text-[11px] text-amber-700 font-medium group-hover:underline flex items-center gap-1">
              <span>View packing queue</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <Package className="w-6 h-6" />
          </div>
        </Link>

        {/* Total Lifetime Orders */}
        <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Total Orders
            </span>
            <div className="text-2xl sm:text-3xl font-serif font-bold text-[#5B111A]">
              {data.total_orders}
            </div>
            <p className="text-[11px] text-gray-400">All recorded orders</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-[#FAF7F2] border border-[#E8DFD0] flex items-center justify-center text-[#5B111A]">
            <TrendingUp className="w-6 h-6 text-[#C59B27]" />
          </div>
        </div>
      </div>

      {/* Quick Action Buttons for Tanya */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link
          to="/admin/orders"
          className="p-3.5 bg-[#5B111A] hover:bg-[#3A080F] text-white rounded-xl shadow-sm text-center font-semibold text-xs transition-colors flex items-center justify-center gap-2"
        >
          <Package className="w-4 h-4" />
          <span>Fulfill Orders</span>
        </Link>

        <Link
          to="/admin/products"
          className="p-3.5 bg-white hover:bg-gray-50 text-gray-900 border border-[#E8DFD0] rounded-xl shadow-sm text-center font-semibold text-xs transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4 text-[#C59B27]" />
          <span>Add New Product</span>
        </Link>

        <Link
          to="/admin/products"
          className="col-span-2 sm:col-span-1 p-3.5 bg-white hover:bg-gray-50 text-gray-900 border border-[#E8DFD0] rounded-xl shadow-sm text-center font-semibold text-xs transition-colors flex items-center justify-center gap-2"
        >
          <ShoppingBag className="w-4 h-4 text-[#C59B27]" />
          <span>Update Stock & Prices</span>
        </Link>
      </div>

      {/* Low-Stock Variant Alerts Section */}
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h2 className="font-serif font-bold text-base text-gray-900">
              Low Stock & Sold Out Sizes Alert
            </h2>
          </div>
          <Link
            to="/admin/products"
            className="text-xs font-semibold text-[#5B111A] hover:underline"
          >
            Manage Catalogue
          </Link>
        </div>

        {data.low_stock_variants.length === 0 ? (
          <p className="text-xs text-gray-500 py-3 text-center">
            All active product sizes have healthy stock (&gt; 5 units).
          </p>
        ) : (
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {data.low_stock_variants.map((v) => (
              <div
                key={v.variant_id}
                className="py-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{v.product_name}</p>
                  <div className="text-gray-500 text-[11px] mt-0.5 flex items-center gap-2">
                    <span>Size: <strong className="text-gray-800">{v.size}</strong></span>
                    {v.colour && <span>| Colour: {v.colour}</span>}
                    <span>| Price: {formatPrice(v.selling_price)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      v.stock === 0
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {v.stock === 0 ? 'Sold Out' : `${v.stock} left`}
                  </span>

                  <Link
                    to="/admin/products"
                    className="text-xs font-semibold text-[#5B111A] hover:underline px-2 py-1 rounded bg-[#FAF7F2] border border-[#E8DFD0]"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
