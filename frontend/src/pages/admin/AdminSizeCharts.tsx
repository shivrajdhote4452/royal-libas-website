import React, { useState, useEffect } from 'react';
import {
  Ruler,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  adminListSizeCharts,
  adminCreateSizeChart,
  adminUpdateSizeChart,
  adminDeleteSizeChart,
} from '../../lib/api';

interface SizeRow {
  size: string;
  bust: string;
  waist: string;
  hip: string;
  length: string;
}

interface SizeChart {
  id: number;
  name: string;
  category?: string;
  measurements: string; // JSON string or text
  created_at: string;
}

const DEFAULT_ROWS: SizeRow[] = [
  { size: 'XS', bust: '32', waist: '26', hip: '36', length: '48' },
  { size: 'S', bust: '34', waist: '28', hip: '38', length: '48' },
  { size: 'M', bust: '36', waist: '30', hip: '40', length: '49' },
  { size: 'L', bust: '38', waist: '32', hip: '42', length: '49' },
  { size: 'XL', bust: '40', waist: '34', hip: '44', length: '50' },
  { size: 'XXL', bust: '42', waist: '36', hip: '46', length: '50' },
];

export const AdminSizeCharts: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const [charts, setCharts] = useState<SizeChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChartId, setEditingChartId] = useState<number | null>(null);
  const [chartName, setChartName] = useState('');
  const [chartCategory, setChartCategory] = useState('');
  const [rows, setRows] = useState<SizeRow[]>(DEFAULT_ROWS);
  const [submitting, setSubmitting] = useState(false);

  const fetchCharts = async () => {
    setLoading(true);
    try {
      const data = await adminListSizeCharts(token);
      setCharts(data);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load size charts' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCharts();
  }, [token]);

  const handleOpenCreate = () => {
    setEditingChartId(null);
    setChartName('');
    setChartCategory('Anarkali');
    setRows(DEFAULT_ROWS);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (chart: SizeChart) => {
    setEditingChartId(chart.id);
    setChartName(chart.name);
    setChartCategory(chart.category || '');
    try {
      const parsed = JSON.parse(chart.measurements);
      if (Array.isArray(parsed)) {
        setRows(parsed);
      } else {
        setRows(DEFAULT_ROWS);
      }
    } catch {
      setRows(DEFAULT_ROWS);
    }
    setIsModalOpen(true);
  };

  const handleRowChange = (index: number, field: keyof SizeRow, value: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  const handleAddRow = () => {
    setRows([...rows, { size: 'Custom', bust: '', waist: '', hip: '', length: '' }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(rows.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chartName.trim()) {
      setNotification({ type: 'error', message: 'Size chart name is required' });
      return;
    }

    setSubmitting(true);
    const measurementsJson = JSON.stringify(rows);

    try {
      if (editingChartId) {
        await adminUpdateSizeChart(token, editingChartId, {
          name: chartName.trim(),
          category: chartCategory.trim() || undefined,
          measurements: measurementsJson,
        });
        setNotification({ type: 'success', message: 'Size chart updated successfully.' });
      } else {
        await adminCreateSizeChart(token, {
          name: chartName.trim(),
          category: chartCategory.trim() || undefined,
          measurements: measurementsJson,
        });
        setNotification({ type: 'success', message: 'Size chart created successfully.' });
      }
      setIsModalOpen(false);
      await fetchCharts();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to save size chart' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (chart: SizeChart) => {
    if (!window.confirm(`Delete size chart "${chart.name}"?`)) return;

    try {
      await adminDeleteSizeChart(token, chart.id);
      setNotification({ type: 'success', message: 'Size chart removed.' });
      await fetchCharts();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete size chart' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <Ruler className="w-6 h-6 text-[#5E1224]" />
            Reusable Size Charts
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Standard boutique sizing measurements attached to luxury garments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C] transition-colors shadow-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Create Size Chart
          </button>
          <button
            onClick={fetchCharts}
            disabled={loading}
            className="p-2 bg-white border border-[#E5D9C5] rounded-lg text-gray-600 hover:bg-[#FCF8F0] transition-colors disabled:opacity-50"
            title="Refresh charts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Charts Grid */}
      {loading ? (
        <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
          <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
          Loading size charts...
        </div>
      ) : charts.length === 0 ? (
        <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
          <Ruler className="w-10 h-10 text-gray-300" />
          <p className="font-semibold text-gray-700">No size charts defined</p>
          <p className="text-[11px] text-gray-400">Create reusable size charts to attach to products.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {charts.map((c) => {
            let parsedRows: SizeRow[] = [];
            try {
              parsedRows = JSON.parse(c.measurements);
            } catch {
              parsedRows = [];
            }

            return (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-[#E5D9C5]/80 shadow-sm p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-gray-100">
                    <div>
                      <h3 className="font-serif font-bold text-base text-gray-900">{c.name}</h3>
                      {c.category && (
                        <span className="text-[10px] uppercase tracking-wider text-[#B58A3C] font-semibold mt-0.5 block">
                          Category: {c.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="p-1.5 text-gray-500 hover:text-[#5E1224] hover:bg-gray-100 rounded"
                        title="Edit Size Chart"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                        title="Delete Size Chart"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Measurements Table Preview */}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-gray-600 font-semibold text-[10px] uppercase">
                          <th className="py-2 px-2.5">Size</th>
                          <th className="py-2 px-2.5">Bust (in)</th>
                          <th className="py-2 px-2.5">Waist (in)</th>
                          <th className="py-2 px-2.5">Hip (in)</th>
                          <th className="py-2 px-2.5">Length (in)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Array.isArray(parsedRows) && parsedRows.length > 0 ? (
                          parsedRows.map((r, idx) => (
                            <tr key={idx} className="hover:bg-amber-50/20">
                              <td className="py-1.5 px-2.5 font-bold text-gray-900">{r.size}</td>
                              <td className="py-1.5 px-2.5 text-gray-700">{r.bust}&quot;</td>
                              <td className="py-1.5 px-2.5 text-gray-700">{r.waist}&quot;</td>
                              <td className="py-1.5 px-2.5 text-gray-700">{r.hip}&quot;</td>
                              <td className="py-1.5 px-2.5 text-gray-700">{r.length}&quot;</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-3 text-center text-gray-400 italic">
                              Raw: {c.measurements}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
                  Created {new Date(c.created_at).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Size Chart Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-5 border border-[#E5D9C5] shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Ruler className="w-4 h-4 text-[#5E1224]" />
                {editingChartId ? 'Edit Size Chart' : 'New Reusable Size Chart'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Chart Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Anarkali & Kurta Set Standard"
                    value={chartName}
                    onChange={(e) => setChartName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Garment Category</label>
                  <input
                    type="text"
                    placeholder="e.g., Anarkali, Lehenga, Saree"
                    value={chartCategory}
                    onChange={(e) => setChartCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
              </div>

              {/* Rows Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-gray-800">Measurements by Size (Inches)</label>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="text-[11px] font-semibold text-[#5E1224] hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Size Row
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FCF8F0] border-b border-gray-200 text-gray-600 font-semibold text-[10px] uppercase">
                      <tr>
                        <th className="py-2 px-2">Size</th>
                        <th className="py-2 px-2">Bust</th>
                        <th className="py-2 px-2">Waist</th>
                        <th className="py-2 px-2">Hip</th>
                        <th className="py-2 px-2">Length</th>
                        <th className="py-2 px-2 text-right">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-amber-50/10">
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.size}
                              onChange={(e) => handleRowChange(idx, 'size', e.target.value)}
                              className="w-14 px-1.5 py-1 border border-gray-200 rounded font-semibold text-center"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.bust}
                              onChange={(e) => handleRowChange(idx, 'bust', e.target.value)}
                              className="w-16 px-1.5 py-1 border border-gray-200 rounded text-center"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.waist}
                              onChange={(e) => handleRowChange(idx, 'waist', e.target.value)}
                              className="w-16 px-1.5 py-1 border border-gray-200 rounded text-center"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.hip}
                              onChange={(e) => handleRowChange(idx, 'hip', e.target.value)}
                              className="w-16 px-1.5 py-1 border border-gray-200 rounded text-center"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.length}
                              onChange={(e) => handleRowChange(idx, 'length', e.target.value)}
                              className="w-16 px-1.5 py-1 border border-gray-200 rounded text-center"
                            />
                          </td>
                          <td className="p-1 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="p-1 text-gray-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#5E1224] text-white font-semibold rounded-lg hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Size Chart'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
