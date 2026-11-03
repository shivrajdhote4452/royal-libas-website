import React, { useEffect, useState, useMemo } from 'react';
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
  Edit3,
  AlertCircle,
  RotateCcw,
  Check,
  Filter,
} from 'lucide-react';
import {
  adminListInventory,
  adminGetInventorySummary,
  adminBulkAdjustStock,
  adminListStockAdjustments,
  formatPrice,
  InventorySummaryData,
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

interface ProductInventoryGroup {
  product_id: number;
  product_name: string;
  product_slug: string;
  primary_image?: string;
  category?: string;
  subcategory?: string;
  status: string; // 'PUBLISHED', 'DRAFT', 'ARCHIVED'
  is_draft: boolean;
  is_archived: boolean;
  is_product_active: boolean;
  min_price: number;
  max_price: number;
  total_stock: number;
  variants: InventoryItem[];
  colourGroups: { colour: string; variants: InventoryItem[] }[];
  low_stock_variants_count: number;
  out_of_stock_variants_count: number;
  is_all_sold_out: boolean;
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
  'UNSTITCHED MATERIAL': ['Unstitched Suits', 'Dress Material'],
};

const STANDARD_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

export const AdminInventory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') || 'working';
  const initialSearch = searchParams.get('search') || '';

  const [rawItems, setRawItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<string>(initialFilter);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('ALL');

  // Stable overall boutique statistics from backend summary endpoint
  const [overallSummary, setOverallSummary] = useState<InventorySummaryData | null>(null);

  // Multi-Variant Edit Stock Modal State
  const [editingProduct, setEditingProduct] = useState<ProductInventoryGroup | null>(null);
  // User's exact raw input strings while editing (prevents premature coercion to 0)
  const [stockInputStrings, setStockInputStrings] = useState<Record<number, string>>({});
  const [initialStockMap, setInitialStockMap] = useState<Record<number, number>>({});
  const [adjustmentReason, setAdjustmentReason] = useState<string>('RESTOCK');
  const [adjustmentNote, setAdjustmentNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [conflictDetected, setConflictDetected] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // History Modal
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyTitle, setHistoryTitle] = useState<string>('Stock Adjustment Audit History');
  const [historyRecords, setHistoryRecords] = useState<AdjustmentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  // Load stable overall summary
  const loadSummary = async () => {
    try {
      const summary = await adminGetInventorySummary(token);
      setOverallSummary(summary);
    } catch (e) {
      console.error('Failed to load inventory summary', e);
    }
  };

  // Load inventory list matching current filter & search
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
      setRawItems(data);
    } catch (e) {
      console.error('Failed to load inventory list', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, [token]);

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

  // Group raw items into product-wise cards/rows
  const productGroups = useMemo<ProductInventoryGroup[]>(() => {
    const map = new Map<number, ProductInventoryGroup>();

    for (const it of rawItems) {
      let group = map.get(it.product_id);
      if (!group) {
        const prodStatus = it.status || (it.is_archived ? 'ARCHIVED' : it.is_draft ? 'DRAFT' : 'PUBLISHED');
        group = {
          product_id: it.product_id,
          product_name: it.product_name,
          product_slug: it.product_slug,
          primary_image: it.primary_image,
          category: it.category,
          subcategory: it.subcategory,
          status: prodStatus,
          is_draft: !!it.is_draft || prodStatus === 'DRAFT',
          is_archived: !!it.is_archived || prodStatus === 'ARCHIVED',
          is_product_active: it.is_product_active,
          min_price: it.selling_price,
          max_price: it.selling_price,
          total_stock: 0,
          variants: [],
          colourGroups: [],
          low_stock_variants_count: 0,
          out_of_stock_variants_count: 0,
          is_all_sold_out: false,
        };
        map.set(it.product_id, group);
      }

      group.variants.push(it);
      group.total_stock += it.stock;
      if (it.selling_price < group.min_price) group.min_price = it.selling_price;
      if (it.selling_price > group.max_price) group.max_price = it.selling_price;
      if (it.stock === 0) group.out_of_stock_variants_count += 1;
      else if (it.stock <= 5) group.low_stock_variants_count += 1;
    }

    // Build colour groups and calculate completely sold out state
    for (const group of map.values()) {
      group.is_all_sold_out = group.variants.length > 0 && group.total_stock === 0;

      const colMap = new Map<string, InventoryItem[]>();
      for (const v of group.variants) {
        const colKey = (v.colour || '').trim() || 'Standard';
        if (!colMap.has(colKey)) {
          colMap.set(colKey, []);
        }
        colMap.get(colKey)!.push(v);
      }
      group.colourGroups = Array.from(colMap.entries()).map(([colour, variants]) => ({
        colour,
        variants,
      }));
    }

    return Array.from(map.values());
  }, [rawItems]);

  // Filtered match stats (clearly distinct from overall boutique totals)
  const isFilterActive =
    filterState !== 'working' ||
    searchQuery.trim() !== '' ||
    selectedCategory !== 'ALL' ||
    selectedSubcategory !== 'ALL';

  const filteredStats = useMemo(() => {
    const totalUnits = productGroups.reduce((sum, g) => sum + g.total_stock, 0);
    const totalVariants = productGroups.reduce((sum, g) => sum + g.variants.length, 0);
    return {
      productCount: productGroups.length,
      totalUnits,
      totalVariants,
    };
  }, [productGroups]);

  // Validation function for individual stock input
  const getVariantValidationError = (rawVal: string | undefined): string | null => {
    if (rawVal === undefined || rawVal.trim() === '') {
      return 'Stock cannot be empty. Enter 0 if sold out.';
    }
    const trimmed = rawVal.trim();
    if (trimmed.startsWith('-')) {
      return 'Stock cannot be negative.';
    }
    if (trimmed.includes('.')) {
      return 'Decimals not allowed. Whole numbers only.';
    }
    if (!/^\d+$/.test(trimmed)) {
      return 'Please enter a valid whole number (e.g. 0, 1, 5).';
    }
    return null;
  };

  // Open multi-variant Edit Stock modal for a product
  const openEditModal = (group: ProductInventoryGroup) => {
    setEditingProduct(group);
    const initialMap: Record<number, number> = {};
    const inputStrings: Record<number, string> = {};
    for (const v of group.variants) {
      initialMap[v.variant_id] = v.stock;
      inputStrings[v.variant_id] = String(v.stock);
    }
    setInitialStockMap(initialMap);
    setStockInputStrings(inputStrings);
    setAdjustmentReason('RESTOCK');
    setAdjustmentNote('');
    setEditError(null);
    setConflictDetected(false);
  };

  // Keep user's raw input while typing (no silent coercion to zero)
  const handleStockInputChange = (variantId: number, rawVal: string) => {
    setStockInputStrings((prev) => ({ ...prev, [variantId]: rawVal }));
  };

  // Quick adjustment buttons (+1, -1, +5)
  const handleQuickDelta = (variantId: number, delta: number) => {
    setStockInputStrings((prev) => {
      const currentStr = prev[variantId];
      const parsed = parseInt(currentStr ?? '', 10);
      const base = isNaN(parsed) ? (initialStockMap[variantId] ?? 0) : parsed;
      const next = Math.max(0, base + delta);
      return { ...prev, [variantId]: String(next) };
    });
  };

  const handleResetVariantStock = (variantId: number) => {
    const orig = initialStockMap[variantId] ?? 0;
    setStockInputStrings((prev) => ({
      ...prev,
      [variantId]: String(orig),
    }));
  };

  const handleResetAllVariants = () => {
    const resetStrings: Record<number, string> = {};
    for (const [vid, num] of Object.entries(initialStockMap)) {
      resetStrings[Number(vid)] = String(num);
    }
    setStockInputStrings(resetStrings);
  };

  // Reload latest stock from server in case of conflict
  const handleReloadLiveStock = async () => {
    if (!editingProduct) return;
    try {
      const freshData = await adminListInventory(token, 'all');
      setRawItems(freshData);
      await loadSummary();

      const matchingVariants = freshData.filter(
        (it: InventoryItem) => it.product_id === editingProduct.product_id
      );
      if (matchingVariants.length > 0) {
        const freshInitial: Record<number, number> = {};
        const freshStrings: Record<number, string> = {};
        for (const v of matchingVariants) {
          freshInitial[v.variant_id] = v.stock;
          freshStrings[v.variant_id] = String(v.stock);
        }
        setInitialStockMap(freshInitial);
        setStockInputStrings(freshStrings);
        setConflictDetected(false);
        setEditError(null);
      }
    } catch (e) {
      console.error('Failed to reload latest stock', e);
    }
  };

  // Check if any variant currently has an invalid input
  const hasInputErrors = useMemo(() => {
    if (!editingProduct) return false;
    return editingProduct.variants.some(
      (v) => getVariantValidationError(stockInputStrings[v.variant_id]) !== null
    );
  }, [editingProduct, stockInputStrings]);

  // Calculate modal preview totals only when inputs are valid
  const modalTotals = useMemo(() => {
    if (!editingProduct) return { originalTotal: 0, newTotal: 0, delta: 0, changedCount: 0, hasErrors: false };
    let originalTotal = 0;
    let newTotal = 0;
    let changedCount = 0;
    let hasErrors = false;

    for (const v of editingProduct.variants) {
      const orig = initialStockMap[v.variant_id] ?? 0;
      originalTotal += orig;

      const rawStr = stockInputStrings[v.variant_id];
      const err = getVariantValidationError(rawStr);
      if (err) {
        hasErrors = true;
      } else {
        const parsed = parseInt(rawStr, 10);
        newTotal += parsed;
        if (orig !== parsed) changedCount += 1;
      }
    }

    return {
      originalTotal,
      newTotal,
      delta: newTotal - originalTotal,
      changedCount,
      hasErrors,
    };
  }, [editingProduct, stockInputStrings, initialStockMap]);

  // Save bulk stock changes
  const handleSaveBulkStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    // Strict validation: reject any blank, negative, decimal, or invalid input
    for (const v of editingProduct.variants) {
      const raw = stockInputStrings[v.variant_id];
      const err = getVariantValidationError(raw);
      if (err) {
        setEditError(`Size ${v.size}: ${err}`);
        return;
      }
    }

    setIsSaving(true);
    setEditError(null);
    setConflictDetected(false);

    try {
      const itemsPayload = editingProduct.variants.map((v) => {
        const parsed = parseInt(stockInputStrings[v.variant_id], 10);
        return {
          variant_id: v.variant_id,
          new_stock: parsed,
          expected_stock: initialStockMap[v.variant_id],
        };
      });

      const res = await adminBulkAdjustStock(token, {
        product_id: editingProduct.product_id,
        reason: adjustmentReason,
        note: adjustmentNote.trim() || undefined,
        items: itemsPayload,
      });

      // Update local state immediately with new stock levels
      setRawItems((prev) =>
        prev.map((it) => {
          if (it.product_id === editingProduct.product_id && stockInputStrings[it.variant_id] !== undefined) {
            const nextStock = parseInt(stockInputStrings[it.variant_id], 10);
            return {
              ...it,
              stock: nextStock,
              is_available: nextStock > 0 && it.is_product_active && it.status === 'PUBLISHED',
            };
          }
          return it;
        })
      );

      // Refresh stable summary
      loadSummary();

      setSuccessToast(
        `Updated stock for "${editingProduct.product_name}" (Total: ${res.total_stock} units)`
      );
      setTimeout(() => setSuccessToast(null), 4000);
      setEditingProduct(null);
    } catch (err: any) {
      if (err.status === 409 || err.message?.includes('conflict') || err.detail?.includes('conflict')) {
        setConflictDetected(true);
      }
      setEditError(err.message || 'Failed to update stock');
    } finally {
      setIsSaving(false);
    }
  };

  // Open audit history modal
  const openHistory = async (productId?: number, productName?: string, variantId?: number) => {
    setShowHistoryModal(true);
    setLoadingHistory(true);
    setHistoryTitle(
      productName
        ? `Audit History: ${productName}`
        : variantId
        ? `Audit History for Variant #${variantId}`
        : 'Global Stock Adjustment Audit History'
    );
    try {
      const history = await adminListStockAdjustments(token, variantId, productId);
      setHistoryRecords(history);
    } catch (e) {
      console.error('Failed to fetch history', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Helper to render size matrix for a group of variants
  const renderSizeMatrix = (variants: InventoryItem[]) => {
    const variantBySize = new Map<string, InventoryItem>();
    for (const v of variants) {
      variantBySize.set(v.size.toUpperCase().trim(), v);
    }

    // Determine sizes to display: standard S-XXL, plus any custom boutique sizes present
    const customSizes = variants
      .map((v) => v.size.toUpperCase().trim())
      .filter((s) => !STANDARD_SIZES.includes(s));
    const allSizesToDisplay = [...STANDARD_SIZES, ...Array.from(new Set(customSizes))];

    return (
      <div className="flex items-center gap-1.5 flex-wrap font-mono">
        {allSizesToDisplay.map((sizeKey, idx) => {
          const variant = variantBySize.get(sizeKey);
          const hasVariant = !!variant;
          const stock = variant?.stock ?? 0;
          const isSoldOut = hasVariant && stock === 0;
          const isLow = hasVariant && stock > 0 && stock <= 5;

          return (
            <React.Fragment key={sizeKey}>
              {idx > 0 && <span className="text-gray-300 font-sans text-xs select-none">|</span>}
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                  !hasVariant
                    ? 'bg-gray-50 text-gray-400 border border-gray-200/60'
                    : isSoldOut
                    ? 'bg-red-50 text-red-700 border border-red-200 font-bold'
                    : isLow
                    ? 'bg-amber-50 text-amber-800 border border-amber-300 font-bold'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold'
                }`}
                title={
                  !hasVariant
                    ? `Size ${sizeKey} does not exist for this product`
                    : isSoldOut
                    ? `Size ${sizeKey}: Out of stock (0 units)`
                    : isLow
                    ? `Size ${sizeKey}: Low stock alert (${stock} units left)`
                    : `Size ${sizeKey}: In stock (${stock} units)`
                }
              >
                <span className="font-sans text-[10px] font-bold text-gray-500 uppercase">
                  {sizeKey}:
                </span>
                <span>{hasVariant ? stock : '—'}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 bg-[#1e4620] text-white px-4 py-3 rounded-lg shadow-xl border border-emerald-600 flex items-center gap-3 animate-fade-in text-xs">
          <Check className="w-4 h-4 text-emerald-300 shrink-0" />
          <span className="font-medium">{successToast}</span>
        </div>
      )}

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
            Product-wise catalogue stock matrix, multi-size bulk adjustments, and verified audit trail.
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
            onClick={() => {
              loadInventory();
              loadSummary();
            }}
            className="p-2 rounded border border-[#B58A3C]/30 bg-white hover:bg-[#FCF8F0] text-[#5E1224] shadow-sm transition-colors"
            title="Refresh inventory and statistics"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stable Overall Boutique KPI Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Overall Boutique Capacity (Stable Totals)
          </span>
          <span className="text-[10px] text-gray-400">
            Active Store Inventory
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
              Published Live Catalogue
            </span>
            <span className="text-xl font-serif font-bold text-gray-900 mt-1 block">
              {overallSummary ? `${overallSummary.published_products} Products` : '—'}
            </span>
            <span className="text-[11px] font-mono text-emerald-700 mt-0.5 block">
              {overallSummary
                ? `${overallSummary.published_units.toLocaleString('en-IN')} units live (${overallSummary.published_variants} sizes)`
                : 'Loading units...'}
            </span>
          </div>

          <div className="bg-amber-50/50 p-3.5 rounded-lg border border-amber-200 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
              Draft Setup Catalogue
            </span>
            <span className="text-xl font-serif font-bold text-amber-900 mt-1 block">
              {overallSummary ? `${overallSummary.draft_products} Products` : '—'}
            </span>
            <span className="text-[11px] font-mono text-amber-700 mt-0.5 block">
              {overallSummary
                ? `${overallSummary.draft_units.toLocaleString('en-IN')} units setup (${overallSummary.draft_variants} sizes)`
                : 'Loading units...'}
            </span>
          </div>

          <div className="bg-amber-50/70 p-3.5 rounded-lg border border-amber-200 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
              Low Stock Alerts (&le; 5 units)
            </span>
            <span className="text-xl font-serif font-bold text-amber-700 mt-1 block">
              {overallSummary ? `${overallSummary.low_stock_products} Products` : '—'}
            </span>
            <span className="text-[11px] text-amber-800/80 mt-0.5 block">
              {overallSummary ? `Across ${overallSummary.low_stock_variants} size variants` : '—'}
            </span>
          </div>

          <div className="bg-red-50/70 p-3.5 rounded-lg border border-red-200 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-800 block">
              Sold Out (0 units)
            </span>
            <span className="text-xl font-serif font-bold text-red-700 mt-1 block">
              {overallSummary ? `${overallSummary.out_of_stock_products} Products` : '—'}
            </span>
            <span className="text-[11px] text-red-800/80 mt-0.5 block">
              {overallSummary ? `Across ${overallSummary.out_of_stock_variants} size variants` : '—'}
            </span>
          </div>
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
            All Catalogue
          </button>
        </div>

        {/* Search, Category, Subcategory Row */}
        <div className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full md:w-auto flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by garment name, SKU, or shade..."
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

            {isFilterActive && (
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
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Separately Labelled Filtered Results Indicator Bar */}
        {isFilterActive && (
          <div className="bg-[#FCF8F0] border border-[#B58A3C]/30 px-3.5 py-2.5 rounded-lg flex items-center justify-between text-xs flex-wrap gap-2 animate-fade-in">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-[#B58A3C] shrink-0" />
              <span className="font-semibold text-gray-900">
                Filtered Match:
              </span>
              <span className="text-gray-700">
                Showing <strong>{filteredStats.productCount}</strong> matching garment{filteredStats.productCount === 1 ? '' : 's'} &bull;{' '}
                <strong>{filteredStats.totalUnits}</strong> total units across {filteredStats.totalVariants} sizes
              </span>
              {filterState !== 'working' && (
                <span className="px-2 py-0.5 rounded bg-white border border-[#B58A3C]/30 text-[#5E1224] text-[10px] font-bold uppercase">
                  Tab: {filterState.replace('_', ' ')}
                </span>
              )}
              {searchQuery.trim() && (
                <span className="px-2 py-0.5 rounded bg-white border border-[#B58A3C]/30 text-gray-700 text-[10px]">
                  Search: "{searchQuery.trim()}"
                </span>
              )}
              {selectedCategory !== 'ALL' && (
                <span className="px-2 py-0.5 rounded bg-white border border-[#B58A3C]/30 text-gray-700 text-[10px]">
                  Category: {selectedCategory}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
                setSelectedSubcategory('ALL');
                handleFilterChange('working');
              }}
              className="text-[#5E1224] font-semibold hover:underline text-[11px]"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Product-Wise Inventory Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500">Loading boutique product inventory...</p>
        </div>
      ) : productGroups.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400 text-xs">
          No boutique garments match your current search or filter.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-[#FCF8F0] border-b border-gray-200 text-gray-600 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Garment & Category</th>
                  <th className="py-3 px-4">Size-Wise Stock Matrix</th>
                  <th className="py-3 px-4">Total Stock</th>
                  <th className="py-3 px-4">Status & Health</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {productGroups.map((group) => {
                  const hasMultipleColours = group.colourGroups.length > 1;

                  return (
                    <tr key={group.product_id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Product Column */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-start gap-3">
                          {group.primary_image ? (
                            <img
                              src={group.primary_image}
                              alt={group.product_name}
                              className="w-12 h-14 object-cover rounded bg-gray-100 border border-gray-200 shrink-0 shadow-xs"
                            />
                          ) : (
                            <div className="w-12 h-14 rounded bg-[#FCF8F0] border border-gray-200 flex items-center justify-center text-[10px] font-serif text-[#5E1224] shrink-0 font-bold">
                              RL
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">
                                {group.product_name}
                              </span>
                              {group.status === 'ARCHIVED' ? (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                  ARCHIVED
                                </span>
                              ) : group.status === 'DRAFT' ? (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                  DRAFT
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  PUBLISHED
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                              {group.category && (
                                <span className="text-gray-600 font-medium">
                                  {group.category} {group.subcategory ? `› ${group.subcategory}` : ''}
                                </span>
                              )}
                              <span>•</span>
                              <span className="font-mono text-gray-800 font-semibold">
                                {group.min_price === group.max_price
                                  ? formatPrice(group.min_price)
                                  : `${formatPrice(group.min_price)} - ${formatPrice(group.max_price)}`}
                              </span>
                              {group.colourGroups.length === 1 && group.colourGroups[0].colour !== 'Standard' && (
                                <>
                                  <span>•</span>
                                  <span className="inline-block px-1.5 py-0.2 rounded bg-gray-100 text-gray-700 text-[10px]">
                                    Shade: {group.colourGroups[0].colour}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Size Matrix Column */}
                      <td className="py-3.5 px-4 align-top">
                        {hasMultipleColours ? (
                          <div className="space-y-2">
                            {group.colourGroups.map((cg) => (
                              <div key={cg.colour} className="bg-gray-50/70 p-1.5 rounded border border-gray-100">
                                <span className="text-[10px] font-bold text-gray-600 uppercase block mb-1">
                                  Shade: {cg.colour}
                                </span>
                                {renderSizeMatrix(cg.variants)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="pt-1">
                            {renderSizeMatrix(group.variants)}
                          </div>
                        )}
                        <span className="text-[10px] text-gray-400 mt-1 block">
                          0 = Out of stock &bull; &mdash; = Size not created
                        </span>
                      </td>

                      {/* Total Stock Column */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="pt-1">
                          <span
                            className={`inline-block px-2.5 py-1 rounded text-xs font-bold font-mono ${
                              group.is_all_sold_out
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : group.total_stock <= 10
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            }`}
                          >
                            {group.total_stock} units
                          </span>
                          <span className="text-[10px] text-gray-500 mt-1 block">
                            Across {group.variants.length} existing size{group.variants.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>

                      {/* Status / Health Column */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="pt-1 space-y-1">
                          {group.is_all_sold_out ? (
                            <span className="text-[10px] font-bold uppercase text-red-600 flex items-center gap-1">
                              <X className="w-3.5 h-3.5" /> All Sizes Sold Out
                            </span>
                          ) : group.out_of_stock_variants_count > 0 ? (
                            <span className="text-[10px] font-bold uppercase text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              {group.out_of_stock_variants_count} Size{group.out_of_stock_variants_count > 1 ? 's' : ''} Sold Out
                            </span>
                          ) : group.low_stock_variants_count > 0 ? (
                            <span className="text-[10px] font-bold uppercase text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {group.low_stock_variants_count} Low Stock
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Healthy Stock
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 block font-mono">
                            SKU: {group.variants[0]?.sku ? group.variants[0].sku.split('-')[0] : `RL-P${group.product_id}`}
                          </span>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="inline-flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(group)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5E1224] hover:bg-[#4A0E1C] text-white rounded text-xs font-semibold shadow-xs transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Stock</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openHistory(group.product_id, group.product_name)}
                            className="p-1.5 border border-gray-200 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                            title="View stock history for this garment"
                          >
                            <History className="w-4 h-4 text-[#B58A3C]" />
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
          MULTI-VARIANT "EDIT STOCK" MODAL
          ======================================================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveBulkStock}
            className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-gray-200 my-8"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-100 pb-4">
              <div className="flex items-start gap-3">
                {editingProduct.primary_image ? (
                  <img
                    src={editingProduct.primary_image}
                    alt={editingProduct.product_name}
                    className="w-12 h-14 object-cover rounded bg-gray-100 border border-gray-200 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-14 rounded bg-[#FCF8F0] border border-gray-200 flex items-center justify-center text-xs font-serif text-[#5E1224] shrink-0 font-bold">
                    RL
                  </div>
                )}
                <div>
                  <h3 className="text-base font-serif font-bold text-gray-900">
                    Edit Stock: {editingProduct.product_name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {editingProduct.category} {editingProduct.subcategory ? `› ${editingProduct.subcategory}` : ''} &bull;{' '}
                    <span className="font-semibold text-gray-700">{editingProduct.status}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error or Concurrency Conflict Banner */}
            {conflictDetected && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Concurrency Conflict Detected</span>
                </div>
                <p>
                  The stock for this garment was updated by another administrator or a customer order while your form was open.
                  To protect inventory integrity, please reload the latest stock levels before making changes.
                </p>
                <button
                  type="button"
                  onClick={handleReloadLiveStock}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded text-xs font-semibold shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload Live Stock</span>
                </button>
              </div>
            )}

            {editError && !conflictDetected && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            {/* Total Stock Live Indicator */}
            <div className="grid grid-cols-3 gap-3 bg-[#FCF8F0] p-3 rounded-lg border border-[#B58A3C]/30 text-xs">
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Original Total</span>
                <span className="font-mono font-bold text-base text-gray-900">{modalTotals.originalTotal} units</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">New Proposed Total</span>
                <span className="font-mono font-bold text-base text-gray-900">
                  {modalTotals.hasErrors ? (
                    <span className="text-amber-700 text-xs font-sans font-medium">Fix invalid inputs</span>
                  ) : (
                    `${modalTotals.newTotal} units`
                  )}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Net Change</span>
                <span
                  className={`font-mono font-bold text-base ${
                    modalTotals.hasErrors
                      ? 'text-gray-400 font-normal text-xs'
                      : modalTotals.delta > 0
                      ? 'text-emerald-700'
                      : modalTotals.delta < 0
                      ? 'text-red-700'
                      : 'text-gray-600'
                  }`}
                >
                  {modalTotals.hasErrors
                    ? '—'
                    : modalTotals.delta > 0
                    ? `+${modalTotals.delta}`
                    : modalTotals.delta} units
                </span>
              </div>
            </div>

            {/* Existing Size Variants Grid with Explicit Per-Field Validation */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Existing Size Variants ({editingProduct.variants.length})
                </span>
                <button
                  type="button"
                  onClick={handleResetAllVariants}
                  className="text-[11px] text-gray-500 hover:text-gray-800 underline inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset all counts</span>
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-[10px] font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3">Size & Shade</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Current</th>
                      <th className="py-2.5 px-3">New Stock Count</th>
                      <th className="py-2.5 px-3 text-right">Net Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {editingProduct.variants.map((v) => {
                      const orig = initialStockMap[v.variant_id] ?? 0;
                      const rawVal = stockInputStrings[v.variant_id] ?? '';
                      const fieldError = getVariantValidationError(rawVal);
                      const parsed = parseInt(rawVal, 10);
                      const isValidNumber = !fieldError && !isNaN(parsed);
                      const diff = isValidNumber ? parsed - orig : null;

                      return (
                        <tr key={v.variant_id} className="hover:bg-gray-50/60">
                          <td className="py-2.5 px-3 font-semibold text-gray-900 align-top">
                            <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-xs mr-2 font-mono font-bold">
                              {v.size}
                            </span>
                            {v.colour && <span className="text-gray-600 text-xs font-normal">{v.colour}</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500 align-top">
                            {v.sku || `RL-V${v.variant_id}`}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-700 align-top">
                            {orig} units
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleQuickDelta(v.variant_id, -1)}
                                  className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-100 text-gray-600 shrink-0 font-bold"
                                  title="Subtract 1"
                                >
                                  -
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={rawVal}
                                  onChange={(e) => handleStockInputChange(v.variant_id, e.target.value)}
                                  className={`w-20 px-2 py-1 border rounded font-mono text-xs text-center font-bold focus:outline-none transition-colors ${
                                    fieldError
                                      ? 'border-red-500 bg-red-50/40 text-red-900 focus:border-red-600'
                                      : 'border-gray-300 focus:border-[#5E1224]'
                                  }`}
                                  placeholder="0"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleQuickDelta(v.variant_id, 1)}
                                  className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-100 text-gray-600 shrink-0 font-bold"
                                  title="Add 1"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickDelta(v.variant_id, 5)}
                                  className="px-1.5 py-1 text-[10px] border border-gray-300 rounded hover:bg-gray-100 text-gray-600 shrink-0 font-mono"
                                  title="Add 5"
                                >
                                  +5
                                </button>
                                {rawVal !== String(orig) && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetVariantStock(v.variant_id)}
                                    className="p-1 text-gray-400 hover:text-gray-700"
                                    title="Reset to original"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {fieldError && (
                                <p className="text-[10px] text-red-600 font-medium">
                                  {fieldError}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold align-top">
                            {diff === null ? (
                              <span className="text-red-500 text-[10px] font-sans">Invalid</span>
                            ) : diff === 0 ? (
                              <span className="text-gray-400 font-normal">&mdash;</span>
                            ) : diff > 0 ? (
                              <span className="text-emerald-700">+{diff}</span>
                            ) : (
                              <span className="text-red-700">{diff}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Audit Reason & Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
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
                  placeholder="e.g. Fresh consignment from artisan workshop"
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                {hasInputErrors ? (
                  <span className="text-red-600 font-medium">Please fix invalid input fields</span>
                ) : modalTotals.changedCount === 0 ? (
                  'No sizes modified'
                ) : (
                  `${modalTotals.changedCount} size variant${modalTotals.changedCount > 1 ? 's' : ''} modified`
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || hasInputErrors}
                  className="px-5 py-2 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Stock...</span>
                    </>
                  ) : (
                    <span>Save Stock Changes</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================
          STOCK ADJUSTMENT AUDIT HISTORY MODAL
          ======================================================== */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-gray-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#B58A3C]" />
                <h3 className="text-base font-serif font-bold text-gray-900">
                  {historyTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {loadingHistory ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin text-[#5E1224]" />
                  <span>Loading audit trail...</span>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  No stock adjustments recorded for this selection.
                </div>
              ) : (
                historyRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5"
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

                    <div className="text-[11px] text-gray-600 flex items-center gap-3 flex-wrap">
                      <span>
                        Size: <strong className="font-mono">{rec.size}</strong>
                      </span>
                      {rec.colour && (
                        <span>
                          Shade: <strong>{rec.colour}</strong>
                        </span>
                      )}
                      <span>
                        Stock: {rec.previous_stock} &rarr; <strong>{rec.new_stock}</strong>
                      </span>
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
