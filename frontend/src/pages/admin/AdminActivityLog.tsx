import React, { useState, useEffect } from 'react';
import {
  FileText,
  RefreshCw,
} from 'lucide-react';
import { adminListActivityLogs } from '../../lib/api';

interface ActivityLogItem {
  id: number;
  admin_id?: number;
  admin_email?: string;
  action: string;
  target_type: string;
  target_id?: number;
  details?: string;
  created_at: string;
}

export const AdminActivityLog: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [targetFilter, setTargetFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListActivityLogs(token, actionFilter, targetFilter);
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit activity logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, targetFilter, token]);

  const getActionBadgeColor = (action: string) => {
    if (action.includes('CANCEL') || action.includes('DELETE') || action.includes('REJECT')) {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    if (action.includes('CREATE') || action.includes('UPLOAD')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (action.includes('RETURN') || action.includes('REFUND')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (action.includes('STOCK')) {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    return 'bg-sky-100 text-sky-800 border-sky-200';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#5E1224]" />
            Activity & Audit Trail
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Immutable log of staff adjustments, stock mutations, order cancellations, and refunds.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-3.5 py-2 bg-white border border-[#E5D9C5] text-xs font-semibold text-gray-700 rounded-lg shadow-sm hover:bg-[#FCF8F0] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Action Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-600">Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
            >
              <option value="ALL">All Actions</option>
              <option value="STOCK_ADJUSTED">STOCK_ADJUSTED</option>
              <option value="ORDER_CANCELLED">ORDER_CANCELLED</option>
              <option value="ORDER_STATUS_UPDATED">ORDER_STATUS_UPDATED</option>
              <option value="ORDER_NOTES_UPDATED">ORDER_NOTES_UPDATED</option>
              <option value="RETURN_STATUS_UPDATED">RETURN_STATUS_UPDATED</option>
              <option value="PRODUCT_CREATED">PRODUCT_CREATED</option>
              <option value="PRODUCT_UPDATED">PRODUCT_UPDATED</option>
              <option value="MEDIA_UPLOADED">MEDIA_UPLOADED</option>
              <option value="SETTINGS_UPDATED">SETTINGS_UPDATED</option>
            </select>
          </div>

          {/* Target Type Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-600">Target:</span>
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
            >
              <option value="ALL">All Targets</option>
              <option value="order">Order</option>
              <option value="product">Product</option>
              <option value="variant">Inventory Variant</option>
              <option value="return">Return / Exchange</option>
              <option value="media">Media</option>
              <option value="settings">Settings</option>
              <option value="admin">Staff</option>
            </select>
          </div>
        </div>

        <span className="text-xs text-gray-500 font-medium">
          {logs.length} {logs.length === 1 ? 'event' : 'events'} recorded
        </span>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-[#E5D9C5]/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
            Loading activity log...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
            <FileText className="w-8 h-8 text-gray-300" />
            No audit records match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-gray-600 font-semibold text-[10px] uppercase">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-amber-50/20 font-sans">
                    <td className="py-3 px-4 text-gray-500 text-[10px] whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-gray-900 block font-mono text-xs">
                        {log.admin_email || 'System'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadgeColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-700">
                      {log.target_type} {log.target_id ? `#${log.target_id}` : ''}
                    </td>
                    <td className="py-3 px-4 text-gray-800 text-xs">
                      {log.details || '-'}
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
