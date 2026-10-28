import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Package,
  RefreshCw,
  Download,
  ShoppingBag,
} from 'lucide-react';
import { adminGetReports, adminExportOrdersCsv, formatPrice } from '../../lib/api';

interface TopProduct {
  name: string;
  units: number;
  revenue: number;
}

interface ReportSummary {
  total_orders: number;
  prepaid_count: number;
  prepaid_revenue_paid: number;
  cod_count: number;
  cod_revenue_pending: number;
  cod_revenue_collected: number;
  cancelled_count: number;
  cancelled_amount: number;
  refunded_count: number;
  refunded_amount: number;
  status_breakdown: Record<string, number>;
  payment_breakdown: Record<string, number>;
  top_products: TopProduct[];
}

export const AdminReports: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'this_month' | 'all'>('30d');
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGetReports(token, period);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate operational reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [period, token]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await adminExportOrdersCsv(token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `royal_libas_orders_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to export CSV report');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#5E1224]" />
            Sales & Operational Reports
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Aggregated financials, collected revenues vs pending cash, and order metrics computed from the database.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Selector */}
          <div className="flex items-center gap-1 bg-white border border-[#E5D9C5] rounded-lg p-0.5 shadow-sm">
            {[
              { id: 'today', label: 'Today' },
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: 'this_month', label: 'This Month' },
              { id: 'all', label: 'All Time' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as any)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  period === p.id
                    ? 'bg-[#5E1224] text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* CSV Export Button */}
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="px-3.5 py-2 bg-[#FCF8F0] border border-[#E5D9C5] text-xs font-semibold text-[#5E1224] rounded-lg shadow-sm hover:bg-[#F3EAD7] transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Generating CSV...' : 'Export Orders CSV'}
          </button>

          <button
            onClick={fetchReportData}
            disabled={loading}
            className="p-2 bg-white border border-[#E5D9C5] rounded-lg text-gray-600 hover:bg-[#FCF8F0] transition-colors disabled:opacity-50"
            title="Refresh reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
          <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
          Computing verified report metrics...
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* Revenue Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Prepaid Revenue (Verified Collected) */}
            <div className="bg-white p-5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                Collected Prepaid Revenue
              </div>
              <div className="text-2xl font-serif font-bold text-gray-900 my-2">
                ₹{report.prepaid_revenue_paid.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-gray-500">
                From {report.prepaid_count} verified gateway orders
              </div>
            </div>

            {/* Pending COD Revenue (Not Yet Collected) */}
            <div className="bg-white p-5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                Pending COD Expected
              </div>
              <div className="text-2xl font-serif font-bold text-gray-900 my-2">
                ₹{report.cod_revenue_pending.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-gray-500">
                Awaiting courier delivery & cash remittance
              </div>
            </div>

            {/* Total Orders Placed */}
            <div className="bg-white p-5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Total Orders Placed
              </div>
              <div className="text-2xl font-serif font-bold text-gray-900 my-2">
                {report.total_orders}
              </div>
              <div className="text-[11px] text-gray-500">
                {report.cancelled_count} cancelled ({formatPrice(report.cancelled_amount)})
              </div>
            </div>

            {/* Recorded Refunds */}
            <div className="bg-white p-5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
                Processed Refunds
              </div>
              <div className="text-2xl font-serif font-bold text-rose-900 my-2">
                ₹{report.refunded_amount.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-gray-500">
                {report.refunded_count} refund transactions recorded
              </div>
            </div>
          </div>

          {/* Fulfillment Status Distribution */}
          <div className="bg-white p-5 rounded-xl border border-[#E5D9C5]/80 shadow-sm space-y-3">
            <h3 className="font-serif font-bold text-sm text-gray-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#5E1224]" />
              Fulfillment Pipeline Breakdown ({period.toUpperCase()})
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'PLACED', color: 'bg-amber-50 border-amber-200 text-amber-900' },
                { label: 'PACKED', color: 'bg-blue-50 border-blue-200 text-blue-900' },
                { label: 'SHIPPED', color: 'bg-indigo-50 border-indigo-200 text-indigo-900' },
                { label: 'DELIVERED', color: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
                { label: 'CANCELLED', color: 'bg-rose-50 border-rose-200 text-rose-900' },
              ].map((s) => {
                const count = report.status_breakdown[s.label] || 0;
                return (
                  <div key={s.label} className={`p-3 rounded-lg border ${s.color}`}>
                    <div className="text-[10px] font-semibold uppercase">{s.label}</div>
                    <div className="text-xl font-bold font-serif mt-1">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Selling Products Table */}
          <div className="bg-white rounded-xl border border-[#E5D9C5]/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif font-bold text-sm text-gray-900 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#B58A3C]" />
                Top Performing Garments ({period.toUpperCase()})
              </h3>
              <span className="text-[11px] text-gray-500">Sorted by verified units sold</span>
            </div>

            {report.top_products.length === 0 ? (
              <div className="p-10 text-center text-xs text-gray-400">
                No product line items recorded in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-gray-600 font-semibold text-[10px] uppercase">
                      <th className="py-2.5 px-4">Garment Title</th>
                      <th className="py-2.5 px-4 text-center">Units Sold</th>
                      <th className="py-2.5 px-4 text-right">Gross Line Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.top_products.map((p, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/20">
                        <td className="py-2.5 px-4 font-semibold text-gray-900">{p.name}</td>
                        <td className="py-2.5 px-4 text-center font-bold text-gray-700">{p.units}</td>
                        <td className="py-2.5 px-4 text-right font-serif font-bold text-[#5E1224]">
                          ₹{p.revenue.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
