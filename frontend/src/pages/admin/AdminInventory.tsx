import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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
  Plus,
  LayoutGrid,
  List,
  Package,
  PenTool,
  Layers,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
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
  const [selectedSize, setSelectedSize] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<string>('recently_updated');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 12;

  // Stable overall boutique statistics from backend summary endpoint
  const [overallSummary, setOverallSummary] = useState<InventorySummaryData | null>(null);

  // Multi-Variant Edit Stock Drawer / Modal State
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
    setCurrentPage(1);
  }, [token, filterState, selectedCategory, selectedSubcategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadInventory();
    setCurrentPage(1);
  };

  const handleFilterChange = (newFilter: string) => {
    setFilterState(newFilter);
    setSearchParams(newFilter === 'working' ? {} : { filter: newFilter });
    setCurrentPage(1);
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

  // Client-side filtering by size and sorting
  const filteredAndSortedProducts = useMemo(() => {
    let list = [...productGroups];

    if (selectedSize !== 'ALL') {
      const targetSize = selectedSize.toUpperCase().trim();
      list = list.filter((g) =>
        g.variants.some((v) => {
          const vSize = v.size.toUpperCase().trim();
          if (targetSize === 'FREE SIZE') {
            return /free|one/i.test(vSize);
          }
          return vSize === targetSize;
        })
      );
    }

    if (sortOption === 'stock_asc') {
      list.sort((a, b) => a.total_stock - b.total_stock);
    } else if (sortOption === 'stock_desc') {
      list.sort((a, b) => b.total_stock - a.total_stock);
    } else if (sortOption === 'name_asc') {
      list.sort((a, b) => a.product_name.localeCompare(b.product_name));
    } else if (sortOption === 'name_desc') {
      list.sort((a, b) => b.product_name.localeCompare(a.product_name));
    } else {
      // default: recently updated or id descending
      list.sort((a, b) => b.product_id - a.product_id);
    }

    return list;
  }, [productGroups, selectedSize, sortOption]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedProducts.slice(start, start + pageSize);
  }, [filteredAndSortedProducts, currentPage, pageSize]);

  // Filtered match stats (clearly distinct from overall boutique totals)
  const isFilterActive =
    filterState !== 'working' ||
    searchQuery.trim() !== '' ||
    selectedCategory !== 'ALL' ||
    selectedSubcategory !== 'ALL' ||
    selectedSize !== 'ALL';

  const filteredStats = useMemo(() => {
    const totalUnits = filteredAndSortedProducts.reduce((sum, g) => sum + g.total_stock, 0);
    const totalVariants = filteredAndSortedProducts.reduce((sum, g) => sum + g.variants.length, 0);
    return {
      productCount: filteredAndSortedProducts.length,
      totalUnits,
      totalVariants,
    };
  }, [filteredAndSortedProducts]);

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

  // Open multi-variant Edit Stock drawer for a product
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
  const handleSaveBulkStock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

  // Helper to extract base SKU without variant size suffix (e.g. "RL-TP-KP-01")
  const getBaseSku = (variant?: InventoryItem, productId?: number): string => {
    if (!variant?.sku) return `RL-${productId || '0'}`;
    const lastDash = variant.sku.lastIndexOf('-');
    if (lastDash > 0) {
      return variant.sku.substring(0, lastDash);
    }
    return variant.sku;
  };

  // Helper to render size matrix for table view
  const renderSizeMatrix = (variants: InventoryItem[]) => {
    const variantBySize = new Map<string, InventoryItem>();
    for (const v of variants) {
      variantBySize.set(v.size.toUpperCase().trim(), v);
    }

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

  // Helper to render size matrix for a single variant group (e.g. single shade or single-shade product)
  const renderSingleGroupSizeStock = (variants: InventoryItem[]) => {
    // Check if this variant group consists only of Free Size (or custom one-size)
    const isFreeSizeGroup = variants.every((v) => /free|one/i.test(v.size));

    if (isFreeSizeGroup) {
      return (
        <div className="flex items-center gap-3 flex-wrap text-xs py-0.5">
          {variants.map((v) => (
            <div key={v.variant_id} className="flex items-center gap-1.5 font-mono">
              <span className="font-sans text-gray-700 font-medium">Free Size:</span>
              <span
                className={`font-mono font-bold px-1.5 py-0.5 rounded text-xs ${
                  v.stock === 0
                    ? 'text-red-600 bg-red-50 border border-red-200'
                    : v.stock <= 5
                    ? 'text-amber-700 bg-amber-50 border border-amber-200'
                    : 'text-gray-900 bg-gray-50 border border-gray-200'
                }`}
                title={`Free Size: ${v.stock} units`}
              >
                {v.stock}
              </span>
            </div>
          ))}
        </div>
      );
    }

    // Map variants in this specific group by normalized size
    const variantMap = new Map<string, InventoryItem>();
    for (const v of variants) {
      variantMap.set(v.size.toUpperCase().trim(), v);
    }

    const standardSizes = ['S', 'M', 'L', 'XL', 'XXL'];
    const hasAnyStandardSize = variants.some((v) =>
      standardSizes.includes(v.size.toUpperCase().trim())
    );

    let sizesToDisplay: string[];
    if (hasAnyStandardSize) {
      const customSizes = variants
        .map((v) => v.size.toUpperCase().trim())
        .filter((s) => !standardSizes.includes(s));
      sizesToDisplay = [...standardSizes, ...Array.from(new Set(customSizes))];
    } else {
      sizesToDisplay = Array.from(variantMap.keys());
    }

    return (
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs font-mono">
        {sizesToDisplay.map((sizeKey) => {
          const v = variantMap.get(sizeKey);
          const hasVariant = !!v;
          const stock = v?.stock ?? 0;

          return (
            <div key={sizeKey} className="flex items-center gap-1">
              <span className="font-sans text-[11px] font-medium text-gray-600">
                {sizeKey}:
              </span>
              {!hasVariant ? (
                <span className="text-gray-400 font-sans text-xs select-none" title={`Size ${sizeKey} does not exist`}>
                  —
                </span>
              ) : stock === 0 ? (
                <span className="text-red-600 font-bold" title="Out of stock (0 units)">
                  0
                </span>
              ) : stock <= 5 ? (
                <span className="text-amber-700 font-bold" title="Low stock alert">
                  {stock}
                </span>
              ) : (
                <span className="text-gray-900 font-semibold" title="In stock">
                  {stock}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Helper to render size-wise stock in Product Stock Card
  const renderCardSizeStock = (group: ProductInventoryGroup) => {
    // Multi-shade product: render each colour group distinctly so duplicate sizes across shades never collide
    if (group.colourGroups.length > 1) {
      return (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
          {group.colourGroups.map((cg) => {
            const shadeStock = cg.variants.reduce((sum, v) => sum + v.stock, 0);

            return (
              <div
                key={cg.colour}
                className="py-1.5 first:pt-0.5 last:pb-0.5 border-b last:border-b-0 border-amber-200/50 space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[#5E1224] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B58A3C]" />
                    <span>Shade: {cg.colour}</span>
                  </span>
                  <span className="font-mono text-gray-500 text-[10px]">
                    {shadeStock} units
                  </span>
                </div>
                {renderSingleGroupSizeStock(cg.variants)}
              </div>
            );
          })}
        </div>
      );
    }

    // Single colour or standard product
    return renderSingleGroupSizeStock(group.variants);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#B58A3C]/20">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#5E1224] tracking-tight">
            Inventory
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Manage product stock, sizes and availability across your store.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            to="/admin/products/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#5E1224] hover:bg-[#4A0E1C] active:bg-[#3D0B17] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </Link>
          <button
            type="button"
            onClick={() => openHistory()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <History className="w-3.5 h-3.5 text-[#B58A3C]" />
            <span>Audit History</span>
          </button>
          <button
            onClick={() => {
              loadInventory();
              loadSummary();
            }}
            className="p-2 rounded-lg border border-[#B58A3C]/30 bg-white hover:bg-[#FCF8F0] text-[#5E1224] shadow-xs transition-colors"
            title="Refresh inventory and statistics"
            aria-label="Refresh inventory"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Summary Cards (Option 2 Warm Cream Styling) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Products */}
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#EFE5D8] shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FAF5EC] border border-amber-200/60 flex items-center justify-center text-[#5E1224] shrink-0">
            <Package className="w-5 h-5 text-[#B58A3C]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-sans font-bold text-2xl text-gray-900 tracking-tight">
                {overallSummary ? overallSummary.published_products : '—'}
              </span>
              <span className="text-xs font-bold text-gray-900">Products</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-700 block truncate">
              {overallSummary
                ? `(${overallSummary.published_units.toLocaleString('en-IN')} units)`
                : 'Loading units...'}
            </span>
          </div>
        </div>

        {/* Card 2: Draft Setup */}
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#EFE5D8] shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FAF5EC] border border-amber-200/60 flex items-center justify-center text-amber-700 shrink-0">
            <PenTool className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-sans font-bold text-2xl text-gray-900 tracking-tight">
                {overallSummary ? overallSummary.draft_products : '—'}
              </span>
              <span className="text-xs font-bold text-gray-900">Draft Setup</span>
            </div>
            <span className="text-[11px] font-mono text-amber-700 block truncate">
              {overallSummary
                ? `(${overallSummary.draft_units.toLocaleString('en-IN')} units)`
                : '—'}
            </span>
          </div>
        </div>

        {/* Card 3: Low Stock */}
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#EFE5D8] shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FAF5EC] border border-amber-200/60 flex items-center justify-center text-amber-700 shrink-0">
            <Layers className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-sans font-bold text-2xl text-amber-700 tracking-tight">
                {overallSummary ? overallSummary.low_stock_products : '—'}
              </span>
              <span className="text-xs font-bold text-gray-900">Low Stock</span>
            </div>
            <span className="text-[11px] text-amber-800/80 block">
              (&le; 5 units)
            </span>
          </div>
        </div>

        {/* Card 4: Sold Out */}
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#EFE5D8] shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FAF5EC] border border-amber-200/60 flex items-center justify-center text-red-600 shrink-0">
            <ShoppingBag className="w-5 h-5 text-red-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-sans font-bold text-2xl text-red-600 tracking-tight">
                {overallSummary ? overallSummary.out_of_stock_products : '—'}
              </span>
              <span className="text-xs font-bold text-gray-900">Sold Out</span>
            </div>
            <span className="text-[11px] text-red-800/80 block">
              (0 units)
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Toolbar */}
      <div className="space-y-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => handleFilterChange('working')}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'working'
                ? 'bg-[#5E1224] text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Working Inventory
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('published')}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'published'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Published
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('draft')}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'draft'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Draft Setup
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('low_stock')}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'low_stock'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Low Stock
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('out_of_stock')}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'out_of_stock'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Sold Out
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('archived')}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'archived'
                ? 'bg-gray-700 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Archived
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('all')}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${
              filterState === 'all'
                ? 'bg-[#5E1224] text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            All Catalogue
          </button>
        </div>

        {/* Search, Categories, Sizes, Sort & View Mode Toolbar */}
        <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-[#EFE5D8] shadow-xs flex flex-col lg:flex-row items-center justify-between gap-3 text-xs">
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full lg:w-auto flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by product name, SKU or designer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-[#5E1224]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#5E1224] text-white hover:bg-[#4A0E1C] active:bg-[#3D0B17] rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-xs"
            >
              Search
            </button>
          </form>

          {/* Filters & View Toggle */}
          <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 flex-wrap justify-between lg:justify-end">
            {/* Categories */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedSubcategory('ALL');
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white font-medium focus:outline-none focus:border-[#5E1224]"
            >
              <option value="ALL">All Categories</option>
              <option value="TWO PIECES">TWO PIECES</option>
              <option value="SUIT SET">SUIT SET</option>
              <option value="HEAVY DRESS">HEAVY DRESS</option>
              <option value="UNSTITCHED MATERIAL">UNSTITCHED MATERIAL</option>
            </select>

            {/* Subcategories (if category selected) */}
            {selectedCategory !== 'ALL' && (
              <select
                value={selectedSubcategory}
                onChange={(e) => {
                  setSelectedSubcategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white font-medium focus:outline-none focus:border-[#5E1224]"
              >
                <option value="ALL">All Subcategories</option>
                {CATEGORY_TAXONOMY[selectedCategory]?.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            )}

            {/* Sizes */}
            <select
              value={selectedSize}
              onChange={(e) => {
                setSelectedSize(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white font-medium focus:outline-none focus:border-[#5E1224]"
            >
              <option value="ALL">All Sizes</option>
              <option value="S">Size S</option>
              <option value="M">Size M</option>
              <option value="L">Size L</option>
              <option value="XL">Size XL</option>
              <option value="XXL">Size XXL</option>
              <option value="FREE SIZE">Free Size</option>
            </select>

            {/* Sort */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white font-medium focus:outline-none focus:border-[#5E1224]"
            >
              <option value="recently_updated">Sort: Recently Updated</option>
              <option value="stock_asc">Sort: Stock (Low to High)</option>
              <option value="stock_desc">Sort: Stock (High to Low)</option>
              <option value="name_asc">Sort: Product Name (A to Z)</option>
              <option value="name_desc">Sort: Product Name (Z to A)</option>
            </select>

            {/* View Mode Toggle (Grid vs Table) */}
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-[#5E1224] text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Product Stock Cards Grid View"
                aria-label="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-2 transition-colors ${
                  viewMode === 'table'
                    ? 'bg-[#5E1224] text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Table View"
                aria-label="Table view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filters Summary Bar */}
        {isFilterActive && (
          <div className="bg-[#FAF5EC] border border-[#B58A3C]/30 px-3.5 py-2.5 rounded-xl flex items-center justify-between text-xs flex-wrap gap-2 animate-fade-in">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-[#B58A3C] shrink-0" />
              <span className="font-semibold text-gray-900">
                Filtered Match:
              </span>
              <span className="text-gray-700">
                Showing <strong>{filteredStats.productCount}</strong> garment{filteredStats.productCount === 1 ? '' : 's'} &bull;{' '}
                <strong>{filteredStats.totalUnits}</strong> total units across {filteredStats.totalVariants} sizes
              </span>
              {filterState !== 'working' && (
                <span className="px-2 py-0.5 rounded-full bg-white border border-[#B58A3C]/30 text-[#5E1224] text-[10px] font-bold uppercase">
                  Tab: {filterState.replace('_', ' ')}
                </span>
              )}
              {searchQuery.trim() && (
                <span className="px-2 py-0.5 rounded-full bg-white border border-[#B58A3C]/30 text-gray-700 text-[10px]">
                  Search: "{searchQuery.trim()}"
                </span>
              )}
              {selectedCategory !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full bg-white border border-[#B58A3C]/30 text-gray-700 text-[10px]">
                  Category: {selectedCategory}
                </span>
              )}
              {selectedSize !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full bg-white border border-[#B58A3C]/30 text-gray-700 text-[10px]">
                  Size: {selectedSize}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
                setSelectedSubcategory('ALL');
                setSelectedSize('ALL');
                setSortOption('recently_updated');
                handleFilterChange('working');
              }}
              className="text-[#5E1224] font-semibold hover:underline text-[11px]"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area: Cards Grid or Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500">Loading boutique product inventory...</p>
        </div>
      ) : filteredAndSortedProducts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-xs">
          No boutique garments match your current search or filter criteria.
        </div>
      ) : viewMode === 'grid' ? (
        /* ========================================================
           OPTION 2: PRODUCT STOCK CARDS GRID
           ======================================================== */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {paginatedProducts.map((group) => {
              const skuDisplay = getBaseSku(group.variants[0], group.product_id);

              return (
                <div
                  key={group.product_id}
                  className="bg-white rounded-xl border border-[#EFE5D8] shadow-xs hover:shadow-md transition-all p-3.5 flex flex-col justify-between gap-3"
                >
                  {/* Card Top: Thumbnail + Details */}
                  <div className="flex gap-3">
                    {/* Left: Product Image Thumbnail */}
                    <div className="w-24 sm:w-28 shrink-0 relative bg-[#FAF5EC] rounded-lg overflow-hidden border border-amber-200/40 aspect-[3/4]">
                      {group.primary_image ? (
                        <img
                          src={group.primary_image}
                          alt={group.product_name}
                          className="w-full h-full object-cover object-top"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-[#5E1224] font-serif font-bold text-xs bg-[#FAF5EC]">
                          <span>RL</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Garment info + Size stock matrix */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      {/* Title & Status */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            className="font-serif font-bold text-gray-900 text-sm leading-snug line-clamp-2"
                            title={group.product_name}
                          >
                            {group.product_name}
                          </h3>
                          <span
                            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${
                              group.status === 'ARCHIVED'
                                ? 'bg-gray-100 text-gray-600 border border-gray-200'
                                : group.status === 'DRAFT'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {group.status}
                          </span>
                        </div>

                        {/* Category & SKU */}
                        <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                          {group.category || 'Garment'} {group.subcategory ? `› ${group.subcategory}` : ''}
                          <span className="text-gray-300 mx-1">|</span>
                          <span className="font-mono text-gray-600">
                            SKU: {skuDisplay}
                          </span>
                        </p>
                      </div>

                      {/* Multi-shade indicator if present */}
                      {group.colourGroups.length > 1 && (
                        <div className="text-[10px] text-gray-500 font-medium mt-1 truncate">
                          <span className="font-semibold text-gray-700">Shades:</span>{' '}
                          {group.colourGroups.map((cg) => cg.colour).join(', ')}
                        </div>
                      )}

                      {/* Size-wise stock counts */}
                      <div className="mt-2 py-1.5 px-2 bg-[#FAF5EC]/70 rounded-lg border border-amber-100/80">
                        {renderCardSizeStock(group)}
                      </div>

                      {/* Total Stock + Health Badge */}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-gray-100">
                        <span className="text-xs font-bold text-gray-900 font-mono">
                          Total: <span className={group.total_stock === 0 ? 'text-red-600 font-bold' : 'text-gray-900'}>{group.total_stock}</span> units
                        </span>

                        {/* Health Tag */}
                        {group.is_all_sold_out ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                            SOLD OUT
                          </span>
                        ) : group.low_stock_variants_count > 0 || group.total_stock <= 5 ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                            <span className="text-[9px]">▲</span> LOW STOCK
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            IN STOCK
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Manage Stock Button */}
                  <button
                    type="button"
                    onClick={() => openEditModal(group)}
                    className="w-full py-2 px-3 bg-[#5E1224] hover:bg-[#4A0E1C] active:bg-[#3D0B17] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Boxes className="w-3.5 h-3.5 text-[#B58A3C]" />
                    <span>Manage Stock</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bg-white p-3.5 rounded-xl border border-[#EFE5D8] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-gray-500">
                Showing{' '}
                <strong className="text-gray-900">
                  {(currentPage - 1) * pageSize + 1}
                </strong>{' '}
                to{' '}
                <strong className="text-gray-900">
                  {Math.min(currentPage * pageSize, filteredAndSortedProducts.length)}
                </strong>{' '}
                of <strong className="text-gray-900">{filteredAndSortedProducts.length}</strong> garments
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`min-w-[32px] h-8 rounded-lg font-semibold transition-colors ${
                      currentPage === page
                        ? 'bg-[#5E1224] text-white shadow-xs'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ========================================================
           TABLE VIEW (Preserved for Admin Flexibility)
           ======================================================== */
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-[#FAF5EC] border-b border-gray-200 text-gray-600 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Garment & Category</th>
                  <th className="py-3 px-4">Size-Wise Stock Matrix</th>
                  <th className="py-3 px-4">Total Stock</th>
                  <th className="py-3 px-4">Status & Health</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedProducts.map((group) => {
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
                              className="w-12 h-14 object-cover rounded-lg bg-gray-100 border border-gray-200 shrink-0 shadow-xs"
                            />
                          ) : (
                            <div className="w-12 h-14 rounded-lg bg-[#FAF5EC] border border-gray-200 flex items-center justify-center text-[10px] font-serif text-[#5E1224] shrink-0 font-bold">
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
                            SKU: {getBaseSku(group.variants[0], group.product_id)}
                          </span>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="inline-flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(group)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5E1224] hover:bg-[#4A0E1C] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Stock</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openHistory(group.product_id, group.product_name)}
                            className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
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
          OPTION 2: MANAGE STOCK SLIDE-OVER DRAWER (DESKTOP)
          & FULL-SCREEN MODAL (MOBILE)
          ======================================================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Darkened Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setEditingProduct(null)}
          />

          {/* Drawer Wrapper */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
            <div className="w-screen max-w-md md:max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-slide-left">
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0">
                <h2 className="font-serif text-lg font-bold text-gray-900">
                  Manage Stock
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Drawer Content */}
              <form onSubmit={handleSaveBulkStock} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Product Preview Card (Matching Image 2 Reference) */}
                <div className="bg-[#FAF5EC] border border-[#EFE5D8] rounded-xl p-3.5 flex items-center gap-3.5 shadow-xs">
                  {editingProduct.primary_image ? (
                    <img
                      src={editingProduct.primary_image}
                      alt={editingProduct.product_name}
                      className="w-14 h-16 object-cover rounded-lg bg-white border border-amber-200/50 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-16 rounded-lg bg-white border border-amber-200/50 flex items-center justify-center font-serif font-bold text-sm text-[#5E1224] shrink-0">
                      RL
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif font-bold text-sm text-gray-900 truncate">
                      {editingProduct.product_name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {editingProduct.category || 'Garment'} {editingProduct.subcategory ? `› ${editingProduct.subcategory}` : ''}
                      <span className="text-gray-300 mx-1">|</span>
                      <span className="font-mono">
                        SKU: {getBaseSku(editingProduct.variants[0], editingProduct.product_id)}
                      </span>
                    </p>
                    <div className="mt-1">
                      {editingProduct.is_all_sold_out ? (
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                          SOLD OUT
                        </span>
                      ) : editingProduct.low_stock_variants_count > 0 || editingProduct.total_stock <= 5 ? (
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">
                          ▲ Low Stock
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          In Stock
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Concurrency Conflict Alert */}
                {conflictDetected && (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Concurrency Conflict Detected</span>
                    </div>
                    <p>
                      The stock for this garment was updated by another administrator or an online order while your form was open.
                      Please reload the live stock levels before making changes to prevent overwriting recent activity.
                    </p>
                    <button
                      type="button"
                      onClick={handleReloadLiveStock}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reload Live Stock</span>
                    </button>
                  </div>
                )}

                {editError && !conflictDetected && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                {/* Live Stock Totals Preview */}
                <div className="grid grid-cols-3 gap-2 bg-[#FAF5EC] p-3 rounded-xl border border-[#EFE5D8] text-xs">
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Current Total</span>
                    <span className="font-mono font-bold text-sm text-gray-900">{modalTotals.originalTotal} units</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">New Proposed</span>
                    <span className="font-mono font-bold text-sm text-gray-900">
                      {modalTotals.hasErrors ? (
                        <span className="text-amber-700 text-xs font-sans font-medium">Fix invalid</span>
                      ) : (
                        `${modalTotals.newTotal} units`
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Net Change</span>
                    <span
                      className={`font-mono font-bold text-sm ${
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

                {/* Section: Size-wise Stock (Units) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      Size-wise Stock (Units)
                    </h4>
                    <button
                      type="button"
                      onClick={handleResetAllVariants}
                      className="text-[11px] text-gray-500 hover:text-gray-800 underline inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset all</span>
                    </button>
                  </div>

                  {editingProduct.colourGroups.length > 1 ? (
                    <div className="space-y-3.5">
                      {editingProduct.colourGroups.map((cg) => {
                        const shadeProposedTotal = cg.variants.reduce((sum, v) => {
                          const raw = stockInputStrings[v.variant_id];
                          const parsed = parseInt(raw ?? '', 10);
                          return sum + (isNaN(parsed) ? (initialStockMap[v.variant_id] ?? 0) : parsed);
                        }, 0);

                        return (
                          <div
                            key={cg.colour}
                            className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs"
                          >
                            <div className="bg-[#FAF5EC] px-3.5 py-2 border-b border-gray-200 flex items-center justify-between text-xs">
                              <span className="font-bold text-[#5E1224] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#B58A3C]" />
                                <span>Shade: {cg.colour}</span>
                              </span>
                              <span className="font-mono text-gray-600 font-semibold text-[11px]">
                                {shadeProposedTotal} units
                              </span>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {cg.variants.map((v) => {
                                const orig = initialStockMap[v.variant_id] ?? 0;
                                const rawVal = stockInputStrings[v.variant_id] ?? '';
                                const fieldError = getVariantValidationError(rawVal);
                                const parsed = parseInt(rawVal, 10);
                                const isValidNumber = !fieldError && !isNaN(parsed);
                                const diff = isValidNumber ? parsed - orig : null;

                                return (
                                  <div
                                    key={v.variant_id}
                                    className="p-3 flex items-center justify-between hover:bg-gray-50/70 transition-colors"
                                  >
                                    {/* Left: Size, SKU & Current */}
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span className="w-12 text-center py-1 bg-gray-100 rounded-md font-mono font-bold text-xs text-gray-900 shrink-0">
                                        {v.size}
                                      </span>
                                      <div className="min-w-0">
                                        {v.sku && (
                                          <p className="text-[10px] text-gray-400 font-mono truncate">
                                            {v.sku}
                                          </p>
                                        )}
                                        <p className="text-xs text-gray-600 font-mono">
                                          Current: <span className="font-semibold">{orig}</span>
                                        </p>
                                      </div>
                                    </div>

                                    {/* Right: Stepper Control [-] [ count ] [+] */}
                                    <div className="flex flex-col items-end gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleQuickDelta(v.variant_id, -1)}
                                          className="w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm transition-colors"
                                          title="Decrease 1"
                                        >
                                          -
                                        </button>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={rawVal}
                                          onChange={(e) => handleStockInputChange(v.variant_id, e.target.value)}
                                          className={`w-14 h-8 text-center font-mono font-bold text-sm border rounded-lg focus:outline-none transition-colors ${
                                            fieldError
                                              ? 'border-red-500 bg-red-50/40 text-red-900 focus:border-red-600'
                                              : 'border-gray-300 focus:border-[#5E1224]'
                                          }`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleQuickDelta(v.variant_id, 1)}
                                          className="w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm transition-colors"
                                          title="Increase 1"
                                        >
                                          +
                                        </button>
                                        {diff !== null && diff !== 0 && (
                                          <button
                                            type="button"
                                            onClick={() => handleResetVariantStock(v.variant_id)}
                                            className="p-1 text-gray-400 hover:text-gray-700 ml-0.5"
                                            title="Reset to current"
                                          >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                      {fieldError ? (
                                        <span className="text-[10px] text-red-600 font-medium">
                                          {fieldError}
                                        </span>
                                      ) : diff !== null && diff !== 0 ? (
                                        <span
                                          className={`text-[11px] font-mono font-semibold ${
                                            diff > 0 ? 'text-emerald-700' : 'text-red-600'
                                          }`}
                                        >
                                          {diff > 0 ? `+${diff}` : diff} units
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                      {editingProduct.variants.map((v) => {
                        const orig = initialStockMap[v.variant_id] ?? 0;
                        const rawVal = stockInputStrings[v.variant_id] ?? '';
                        const fieldError = getVariantValidationError(rawVal);
                        const parsed = parseInt(rawVal, 10);
                        const isValidNumber = !fieldError && !isNaN(parsed);
                        const diff = isValidNumber ? parsed - orig : null;

                        return (
                          <div
                            key={v.variant_id}
                            className="p-3 flex items-center justify-between hover:bg-gray-50/70 transition-colors"
                          >
                            {/* Left: Size, Colour & Current */}
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-12 text-center py-1 bg-gray-100 rounded-md font-mono font-bold text-xs text-gray-900 shrink-0">
                                {v.size}
                              </span>
                              <div className="min-w-0">
                                {v.colour && (
                                  <p className="text-[11px] text-gray-500 truncate">
                                    {v.colour}
                                  </p>
                                )}
                                <p className="text-xs text-gray-600 font-mono">
                                  Current: <span className="font-semibold">{orig}</span>
                                </p>
                              </div>
                            </div>

                            {/* Right: Stepper Control [-] [ count ] [+] */}
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleQuickDelta(v.variant_id, -1)}
                                  className="w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm transition-colors"
                                  title="Decrease 1"
                                >
                                  -
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={rawVal}
                                  onChange={(e) => handleStockInputChange(v.variant_id, e.target.value)}
                                  className={`w-14 h-8 text-center font-mono font-bold text-sm border rounded-lg focus:outline-none transition-colors ${
                                    fieldError
                                      ? 'border-red-500 bg-red-50/40 text-red-900 focus:border-red-600'
                                      : 'border-gray-300 focus:border-[#5E1224]'
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleQuickDelta(v.variant_id, 1)}
                                  className="w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm transition-colors"
                                  title="Increase 1"
                                >
                                  +
                                </button>
                                {diff !== null && diff !== 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetVariantStock(v.variant_id)}
                                    className="p-1 text-gray-400 hover:text-gray-700 ml-0.5"
                                    title="Reset to current"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              {fieldError ? (
                                <span className="text-[10px] text-red-600 font-medium">
                                  {fieldError}
                                </span>
                              ) : diff !== null && diff !== 0 ? (
                                <span
                                  className={`text-[11px] font-mono font-semibold ${
                                    diff > 0 ? 'text-emerald-700' : 'text-red-600'
                                  }`}
                                >
                                  {diff > 0 ? `+${diff}` : diff} units
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section: Adjustment Reason */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                    Adjustment Reason <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-xs text-gray-800 focus:outline-none focus:border-[#5E1224]"
                  >
                    <option value="RESTOCK">Restock / New Artisan Batch Arrival</option>
                    <option value="CORRECTION">Physical Inventory Audit / Count Correction</option>
                    <option value="DAMAGED">Damaged / Defective Garment Removal</option>
                    <option value="RETURN">Customer Return Restock</option>
                    <option value="OTHER">Other Operational Reason</option>
                  </select>
                </div>

                {/* Section: Adjustment Note */}
                <div>
                  <input
                    type="text"
                    placeholder="Enter adjustment details (optional)..."
                    value={adjustmentNote}
                    onChange={(e) => setAdjustmentNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-800 focus:outline-none focus:border-[#5E1224]"
                  />
                </div>

                {/* Direct Link to Stock History */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => openHistory(editingProduct.product_id, editingProduct.product_name)}
                    className="inline-flex items-center gap-1.5 text-xs text-[#5E1224] hover:text-[#4A0E1C] font-semibold hover:underline"
                  >
                    <History className="w-3.5 h-3.5 text-[#B58A3C]" />
                    <span>View Stock History</span>
                  </button>
                </div>
              </form>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-gray-100 bg-[#FAF5EC]/40 shrink-0 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 sm:flex-none px-6 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveBulkStock()}
                  disabled={isSaving || hasInputErrors}
                  className="flex-1 py-2.5 px-6 bg-[#5E1224] hover:bg-[#4A0E1C] active:bg-[#3D0B17] disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Stock...</span>
                    </>
                  ) : (
                    <span>Save Stock</span>
                  )}
                </button>
              </div>
            </div>
          </div>
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
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold transition-colors"
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
