import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Boxes,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  History,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  adminListInventory,
  adminAdjustStock,
  adminListStockAdjustments,
  formatPrice,
} from '../../lib/api';

interface InventoryItem {
  variant_id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  category?: string;
  subcategory?: string;
  status?: string;
  is_draft?: boolean;
  is_archived?: boolean;
  primary_image?: string;
  size: string;
  colour?: string;
  sku?: string;
  mrp?: number;
  selling_price: number;
  stock: number;
  is_available: boolean;
  is_product_active: boolean;
}

interface AdjustmentRecord {
  id: number;
  variant_id: number;
  product_name: string;
  size: string;
  colour?: string;
  sku?: string;
  previous_stock: number;
  new_stock: number;
  change_amount: number;
  reason: string;
  note?: string;
  actor_email?: string;
  created_at: string;
}

const CATEGORY_TAXONOMY: Record<string, string[]> = {
  'TWO PIECES': ['Co-ord Sets', 'Kurta Pant'],
  'SUIT SET': ['Three Pieces', 'Semi-party Wear', 'Party Wear'],
  'HEAVY DRESS': ['Lehenga', 'Short Kurta', 'Palazzo Set', 'Designer Wear', 'Sharara / Gharara'],
};

export const AdminInventory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') || 'working';
  const initialSearch = searchParams.get('search') || '';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<string>(initialFilter);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('ALL');

  // Stock Adjustment Modal
  const [selectedVariant, setSelectedVariant] = useState<InventoryItem | null>(null);
  const [adjustmentStock, setAdjustmentStock] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('RESTOCK');
  const [adjustmentNote, setAdjustmentNote] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState<boolean>(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  // History Drawer/Modal
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyRecords, setHistoryRecords] = useState<AdjustmentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadInventory = async () => {
    setLoading(true);
    try {
      const data = await adminListInventory(
        token,
        filterState,
        searchQuery,
        selectedCategory !== 'ALL' ? selectedCategory : undefined,
        selectedSubcategory !== 'ALL' ? selectedSubcategory : undefined
      );
      setItems(data);
    } catch (e) {
      console.error('Failed to load inventory', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [token, filterState, selectedCategory, selectedSubcategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadInventory();
  };

  const handleFilterChange = (newFilter: string) => {
    setFilterState(newFilter);
    setSearchParams(newFilter === 'working' ? {} : { filter: newFilter });
  };

  const openAdjustModal = (item: InventoryItem) => {
    setSelectedVariant(item);
    setAdjustmentStock(item.stock);
    setAdjustmentReason('RESTOCK');
    setAdjustmentNote('');
    setAdjustmentError(null);
  };

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant) return;

    if (adjustmentStock < 0) {
      setAdjustmentError('Stock count cannot be negative.');
      return;
    }

    setIsAdjusting(true);
    setAdjustmentError(null);

    try {
      const result = await adminAdjustStock(token, {
        variant_id: selectedVariant.variant_id,
        new_stock: adjustmentStock,
        reason: adjustmentReason,
        note: adjustmentNote.trim() || undefined,
      });

      // Update local state immediately
      setItems((prev) =>
        prev.map((it) =>
          it.variant_id === selectedVariant.variant_id
            ? { ...it, stock: result.new_stock, is_available: result.new_stock > 0 }
            : it
        )
      );

      setSelectedVariant(null);
    } catch (err: any) {
      setAdjustmentError(err.message || 'Failed to update stock');
    } finally {
      setIsAdjusting(false);
    }
  };

  const openHistory = async (variantId?: number) => {
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const history = await adminListStockAdjustments(token, variantId);
      setHistoryRecords(history);
    } catch (e) {
      console.error('Failed to fetch history', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const publishedItems = items.filter(
    (it) => it.status === 'PUBLISHED' || (!it.status && it.is_product_active && !it.is_archived)
  );
  const draftItems = items.filter((it) => it.status === 'DRAFT' || it.is_draft);
  const publishedUnits = publishedItems.reduce((sum, it) => sum + it.stock, 0);
  const draftUnits = draftItems.reduce((sum, it) => sum + it.stock, 0);

  const lowStockCount = publishedItems.filter((it) => it.stock > 0 && it.stock <= 5).length;
  const outOfStockCount = publishedItems.filter((it) => it.stock === 0).length;

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#B58A3C]/20">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-6 h-6 text-[#5E1224]" />
            <h1 className="font-serif text-2xl font-bold text-[#5E1224]">
              Inventory Management
            </h1>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Real-time variant-level stock matrix, atomic adjustments, and audit trail.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openHistory()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded text-xs font-semibold shadow-sm transition-colors"
          >
            <History className="w-3.5 h-3.5 text-[#B58A3C]" />
            <span>Audit History</span>
          </button>
          <button
            onClick={loadInventory}
            className="p-2 rounded border border-[#B58A3C]/30 bg-white hover:bg-[#FCF8F0] text-[#5E1224] shadow-sm transition-colors"
            title="Refresh inventory"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary KPI Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
            Published Live Stock
          </span>
          <span className="text-xl font-serif font-bold text-gray-900 mt-1 block">
            {publishedUnits.toLocaleString('en-IN')} units
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5 block">
            {publishedItems.length} active variants
          </span>
        </div>

        <div className="bg-amber-50/50 p-3.5 rounded-lg border border-amber-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
            Draft Setup Stock
          </span>
          <span className="text-xl font-serif font-bold text-amber-900 mt-1 block">
            {draftUnits.toLocaleString('en-IN')} units
          </span>
          <span className="text-[10px] text-amber-700/80 mt-0.5 block">
            {draftItems.length} draft variants (setup)
          </span>
        </div>

        <div className="bg-amber-50/60 p-3.5 rounded-lg border border-amber-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
            Low Stock (&le; 5 units)
          </span>
          <span className="text-xl font-serif font-bold text-amber-700 mt-1 block">
            {lowStockCount} items
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5 block">
            Published catalogue alerts
          </span>
        </div>

        <div className="bg-red-50/60 p-3.5 rounded-lg border border-red-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-800 block">
            Sold Out (0 units)
          </span>
          <span className="text-xl font-serif font-bold text-red-700 mt-1 block">
            {outOfStockCount} items
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5 block">
            Published catalogue alerts
          </span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => handleFilterChange('working')}
            className={`px-3 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'working'
                ? 'bg-[#5E1224] text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Working Inventory
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('published')}
            className={`px-3 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'published'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Published
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('draft')}
            className={`px-3 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'draft'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Draft Setup
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('low_stock')}
            className={`px-3 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'low_stock'
                ? 'bg-amber-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Low Stock (&le; 5)
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('out_of_stock')}
            className={`px-3 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'out_of_stock'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Sold Out (0)
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('archived')}
            className={`px-3 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'archived'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Archived
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('all')}
            className={`px-3 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'all'
                ? 'bg-[#5E1224] text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Variants
          </button>
        </div>

        {/* Search, Category, Subcategory Row */}
        <div className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full md:w-auto flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by product name, SKU, or shade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-[#5E1224] text-white hover:bg-[#4A0E1C] rounded text-xs font-semibold shrink-0"
            >
              Search
            </button>
          </form>

          <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedSubcategory('ALL');
              }}
              className="px-2.5 py-1.5 border border-gray-300 rounded text-xs bg-white font-medium focus:outline-none focus:border-[#5E1224]"
            >
              <option value="ALL">All Categories</option>
              <option value="TWO PIECES">TWO PIECES</option>
              <option value="SUIT SET">SUIT SET</option>
              <option value="HEAVY DRESS">HEAVY DRESS</option>
            </select>

            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-300 rounded text-xs bg-white font-medium focus:outline-none focus:border-[#5E1224]"
            >
              <option value="ALL">All Subcategories</option>
              {selectedCategory !== 'ALL' &&
                CATEGORY_TAXONOMY[selectedCategory]?.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              {selectedCategory === 'ALL' &&
                Object.values(CATEGORY_TAXONOMY)
                  .flat()
                  .map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
            </select>

            {(searchQuery || selectedCategory !== 'ALL' || selectedSubcategory !== 'ALL' || filterState !== 'working') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                  setSelectedSubcategory('ALL');
                  handleFilterChange('working');
                }}
                className="text-gray-500 hover:text-gray-800 text-xs underline whitespace-nowrap pl-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500">Loading live stock levels...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400 text-xs">
          No inventory variants match your search or filter.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-[#FCF8F0] border-b border-gray-200 text-gray-600 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Garment & SKU</th>
                  <th className="py-3 px-4">Variant Attributes</th>
                  <th className="py-3 px-4">Selling Price</th>
                  <th className="py-3 px-4">Stock Level</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it) => {
                  const isSoldOut = it.stock === 0;
                  const isLow = it.stock > 0 && it.stock <= 5;

                  return (
                    <tr key={it.variant_id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {it.primary_image ? (
                            <img
                              src={it.primary_image}
                              alt={it.product_name}
                              className="w-10 h-12 object-cover rounded bg-gray-100 border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-12 rounded bg-[#FCF8F0] border border-gray-200 flex items-center justify-center text-[10px] font-serif text-[#5E1224] shrink-0">
                              RL
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900">{it.product_name}</span>
                              {it.is_archived || it.status === 'ARCHIVED' ? (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                  ARCHIVED
                                </span>
                              ) : it.is_draft || it.status === 'DRAFT' ? (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                  DRAFT
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  PUBLISHED
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="font-mono">SKU: {it.sku || `RL-V${it.variant_id}`}</span>
                              {it.category && (
                                <>
                                  <span>•</span>
                                  <span className="text-gray-600">
                                    {it.category} {it.subcategory ? `› ${it.subcategory}` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 font-bold text-gray-800 rounded text-xs mr-2">
                          {it.size}
                        </span>
                        {it.colour && <span className="text-gray-600">{it.colour}</span>}
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-gray-900">
                        {formatPrice(it.selling_price)}
                        {it.mrp && it.mrp > it.selling_price && (
                          <span className="text-[10px] text-gray-400 line-through ml-1.5 font-normal">
                            {formatPrice(it.mrp)}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold font-mono ${
                            isSoldOut
                              ? 'bg-red-100 text-red-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {it.stock} units
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {isSoldOut ? (
                          <span className="text-[10px] font-bold uppercase text-red-600 flex items-center gap-1">
                            <X className="w-3 h-3" /> Sold Out
                          </span>
                        ) : isLow ? (
                          <span className="text-[10px] font-bold uppercase text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Low Stock
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> In Stock
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openAdjustModal(it)}
                            className="px-3 py-1 bg-[#5E1224] hover:bg-[#4A0E1C] text-white rounded text-[11px] font-semibold transition-colors"
                          >
                            Adjust Stock
                          </button>
                          <button
                            type="button"
                            onClick={() => openHistory(it.variant_id)}
                            className="p-1 text-gray-400 hover:text-gray-700"
                            title="View variant history"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          STOCK ADJUSTMENT MODAL
          ======================================================== */}
      {selectedVariant && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmAdjustment}
            className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-200"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-gray-900">
                  Adjust Inventory Stock
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedVariant.product_name} &bull; Size {selectedVariant.size}
                  {selectedVariant.colour ? ` (${selectedVariant.colour})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVariant(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adjustmentError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800 text-xs">
                {adjustmentError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded border border-gray-200">
                <div>
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Current Stock</span>
                  <span className="font-mono font-bold text-lg text-gray-900">{selectedVariant.stock}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Net Change</span>
                  <span
                    className={`font-mono font-bold text-lg ${
                      adjustmentStock - selectedVariant.stock >= 0
                        ? 'text-emerald-700'
                        : 'text-red-700'
                    }`}
                  >
                    {adjustmentStock - selectedVariant.stock >= 0 ? '+' : ''}
                    {adjustmentStock - selectedVariant.stock}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  New Physical Stock Count <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustmentStock}
                  onChange={(e) => setAdjustmentStock(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-[#5E1224]"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Adjustment Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-xs focus:outline-none focus:border-[#5E1224]"
                >
                  <option value="RESTOCK">Restock / New Artisan Batch Arrival</option>
                  <option value="CORRECTION">Physical Inventory Audit / Count Correction</option>
                  <option value="DAMAGED">Damaged / Defective Garment Removal</option>
                  <option value="RETURN">Customer Return Restock</option>
                  <option value="OTHER">Other Operational Reason</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Audit Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Checked batch from Jaipur atelier"
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setSelectedVariant(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdjusting}
                className="px-4 py-2 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-white rounded text-xs font-semibold"
              >
                {isAdjusting ? 'Recording...' : 'Update Live Stock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================
          STOCK ADJUSTMENT AUDIT HISTORY MODAL
          ======================================================== */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-gray-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#B58A3C]" />
                <h3 className="text-base font-serif font-bold text-gray-900">
                  Stock Adjustment Audit History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {loadingHistory ? (
                <div className="py-8 text-center text-gray-500">Loading audit history...</div>
              ) : historyRecords.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  No stock adjustments recorded yet.
                </div>
              ) : (
                historyRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 bg-gray-50 rounded border border-gray-200 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{rec.product_name}</span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          rec.change_amount > 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {rec.change_amount > 0 ? `+${rec.change_amount}` : rec.change_amount} units
                      </span>
                    </div>

                    <div className="text-[11px] text-gray-600 flex items-center gap-3">
                      <span>Size: <strong>{rec.size}</strong></span>
                      <span>Stock: {rec.previous_stock} &rarr; <strong>{rec.new_stock}</strong></span>
                      <span className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-semibold text-[#5E1224]">
                        {rec.reason}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-200/60">
                      <span>By: {rec.actor_email || 'System'}</span>
                      <span>{new Date(rec.created_at).toLocaleString('en-IN')}</span>
                    </div>
                    {rec.note && (
                      <p className="text-[11px] text-gray-700 italic pt-0.5">"{rec.note}"</p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded text-xs font-semibold"
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
