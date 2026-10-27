import React, { useEffect, useState } from 'react';
import {
  Boxes,
  Search,
  Plus,
  Minus,
  Check,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { fetchAdminProducts, adminUpdateVariant, formatPrice } from '../../lib/api';
import { Product } from '../../types/product';

export const AdminInventory: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'low' | 'out'>('all');
  const [savingVariantId, setSavingVariantId] = useState<number | null>(null);
  const [savedVariantId, setSavedVariantId] = useState<number | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminProducts(token);
      setProducts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Inventory Management | Royal Libas Admin';
    loadData();
  }, [token]);

  const handleStockChange = async (variantId: number, currentStock: number, delta: number) => {
    const newStock = Math.max(0, currentStock + delta);
    setSavingVariantId(variantId);
    try {
      await adminUpdateVariant(token, variantId, { stock: newStock });
      setProducts((prev) =>
        prev.map((p) => ({
          ...p,
          variants: p.variants.map((v) =>
            v.id === variantId ? { ...v, stock: newStock } : v
          ),
          total_stock: p.variants.reduce(
            (sum, v) => sum + (v.id === variantId ? newStock : v.stock),
            0
          ),
        }))
      );
      setSavedVariantId(variantId);
      setTimeout(() => setSavedVariantId(null), 1500);
    } catch (e) {
      console.error('Failed to update stock:', e);
    } finally {
      setSavingVariantId(null);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterState === 'low') {
      return p.variants.some((v) => v.stock > 0 && v.stock <= 3);
    }
    if (filterState === 'out') {
      return p.variants.some((v) => v.stock === 0) || p.total_stock === 0;
    }
    return true;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8DFD0]">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-6 h-6 text-[#5E1224]" />
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Inventory Management
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time size-wise stock matrix with fast stock controls
          </p>
        </div>

        <button
          onClick={loadData}
          className="p-2 rounded-lg border border-[#E8DFD0] bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm self-start sm:self-auto"
          title="Refresh inventory"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E8DFD0] shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by product name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-lg border border-[#E8DFD0] bg-[#FCF8F0] focus:outline-none focus:border-[#5E1224]"
          />
        </div>

        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilterState('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterState === 'all'
                ? 'bg-[#5E1224] text-white shadow-sm'
                : 'bg-[#FCF8F0] text-gray-700 hover:bg-gray-100'
            }`}
          >
            All Pieces ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterState('low')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterState === 'low'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-[#FCF8F0] text-amber-800 hover:bg-amber-50'
            }`}
          >
            Low Stock (≤ 3)
          </button>
          <button
            type="button"
            onClick={() => setFilterState('out')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterState === 'out'
                ? 'bg-red-700 text-white shadow-sm'
                : 'bg-[#FCF8F0] text-red-800 hover:bg-red-50'
            }`}
          >
            Out of Stock
          </button>
        </div>
      </div>

      {/* Inventory Matrix Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500 font-serif">Loading inventory matrix...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FCF8F0] text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
                <tr>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 text-center">Size Variants & Stock Controls</th>
                  <th className="p-3.5 text-right">Total Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                    {/* Thumbnail & Title */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-12 rounded bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                          {p.primary_image ? (
                            <img src={p.primary_image} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-[#5E1224] text-white text-[8px] flex items-center justify-center font-serif">RL</div>
                          )}
                        </div>
                        <div>
                          <p className="font-serif font-bold text-gray-900 line-clamp-1">{p.name}</p>
                          <span className="text-[11px] text-[#5E1224] font-bold price-display">
                            {formatPrice(p.min_price || 0)}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="p-3.5 text-gray-600">
                      {p.category || 'Kurti Sets'}
                    </td>

                    {/* Size-wise stock controls */}
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        {p.variants.map((v) => {
                          const isSaving = savingVariantId === v.id;
                          const isSaved = savedVariantId === v.id;
                          return (
                            <div
                              key={v.id}
                              className={`p-1.5 rounded-lg border text-center transition-all ${
                                v.stock === 0
                                  ? 'bg-red-50/60 border-red-200'
                                  : v.stock <= 3
                                  ? 'bg-amber-50/60 border-amber-200'
                                  : 'bg-[#FCF8F0] border-[#E8DFD0]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-gray-600 mb-1">
                                <span>Size {v.size}</span>
                                {isSaved && <Check className="w-3 h-3 text-emerald-600" />}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={v.stock <= 0 || isSaving}
                                  onClick={() => handleStockChange(v.id, v.stock, -1)}
                                  className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <span className={`w-6 text-center text-xs font-bold ${v.stock === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                  {isSaving ? '...' : v.stock}
                                </span>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleStockChange(v.id, v.stock, 1)}
                                  className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    {/* Total Stock */}
                    <td className="p-3.5 text-right">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                          p.total_stock === 0
                            ? 'bg-red-100 text-red-800'
                            : p.total_stock <= 5
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {p.total_stock} units
                      </span>
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
