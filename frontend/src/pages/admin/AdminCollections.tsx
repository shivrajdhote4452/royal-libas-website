import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  ExternalLink,
  Loader2,
  RefreshCw,
  Archive,
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { fetchAdminProducts, fetchCollections, formatPrice } from '../../lib/api';
import { Product, Collection } from '../../types/product';

const CANONICAL_TAXONOMY: Record<
  string,
  { slug: string; subcategories: string[] }
> = {
  'TWO PIECES': {
    slug: 'two-pieces',
    subcategories: ['Co-ord Sets', 'Kurta Pant'],
  },
  'SUIT SET': {
    slug: 'suit-set',
    subcategories: ['Three Pieces', 'Semi-party Wear', 'Party Wear'],
  },
  'HEAVY DRESS': {
    slug: 'heavy-dress',
    subcategories: [
      'Lehenga',
      'Short Kurta',
      'Palazzo Set',
      'Designer Wear',
      'Sharara / Gharara',
    ],
  },
};

interface CollectionWithProducts extends Collection {
  products: Product[];
  workingProducts: Product[];
  archivedProducts: Product[];
  draftCount: number;
  publishedCount: number;
}

export const AdminCollections: React.FC = () => {
  const [collections, setCollections] = useState<CollectionWithProducts[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [expandedSubcats, setExpandedSubcats] = useState<Record<string, boolean>>({});
  const [expandedArchived, setExpandedArchived] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const toggleSubcat = (key: string, defaultOpen: boolean) => {
    setExpandedSubcats((prev) => {
      const current = prev[key] !== undefined ? prev[key] : defaultOpen;
      return { ...prev, [key]: !current };
    });
  };

  const toggleArchived = (colId: number) => {
    setExpandedArchived((prev) => ({ ...prev, [colId]: !prev[colId] }));
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [colls, prods] = await Promise.all([
        fetchCollections(true).catch(() => []),
        fetchAdminProducts(token).catch(() => []),
      ]);

      setAllProducts(prods);

      const mapped: CollectionWithProducts[] = colls.map((col) => {
        const matchingProducts = prods.filter((p) => {
          const hasCollectionMatch = p.collections?.some(
            (c) =>
              c.toLowerCase() === col.name.toLowerCase() ||
              c.toLowerCase() === col.slug.toLowerCase()
          );
          const hasCategoryMatch =
            p.category &&
            col.name &&
            p.category.trim().toUpperCase() === col.name.trim().toUpperCase();

          return hasCollectionMatch || hasCategoryMatch;
        });

        const workingProducts = matchingProducts.filter((p) => p.status !== 'ARCHIVED');
        const archivedProducts = matchingProducts.filter((p) => p.status === 'ARCHIVED');
        const draftCount = workingProducts.filter(
          (p) => p.status === 'DRAFT' || !p.is_active
        ).length;
        const publishedCount = workingProducts.filter(
          (p) => p.status === 'PUBLISHED' && p.is_active
        ).length;

        return {
          ...col,
          product_count: workingProducts.length, // working count excludes archived
          products: matchingProducts,
          workingProducts,
          archivedProducts,
          draftCount,
          publishedCount,
        };
      });

      setCollections(mapped);
    } catch (err: any) {
      setError(err.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const canonicalCollections = collections.filter((c) => c.is_active !== false);
  const legacyCollections = collections.filter((c) => c.is_active === false);

  const totalWorking = allProducts.filter((p) => p.status !== 'ARCHIVED').length;
  const totalPublished = allProducts.filter(
    (p) => p.status === 'PUBLISHED' && p.is_active
  ).length;
  const totalDraft = allProducts.filter(
    (p) => p.status !== 'ARCHIVED' && (p.status === 'DRAFT' || !p.is_active)
  ).length;
  const totalArchived = allProducts.filter((p) => p.status === 'ARCHIVED').length;

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
        <p className="text-xs text-gray-500 font-serif">Loading boutique collections...</p>
      </div>
    );
  }

  const renderProductRow = (p: Product) => {
    const cover = p.images?.[0]?.url || p.primary_image;
    const isArchived = p.status === 'ARCHIVED';
    const isDraft = p.status === 'DRAFT' || !p.is_active;

    return (
      <div
        key={p.id}
        className="flex items-center justify-between text-xs py-2 px-2.5 rounded-lg hover:bg-[#FCF8F0] transition-colors border border-transparent hover:border-[#E8DFD0]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-11 rounded bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
            {cover ? (
              <img src={cover} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#5E1224] text-white text-[7px] flex items-center justify-center font-serif">
                RL
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-gray-800 truncate">{p.name}</span>
              {isArchived ? (
                <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-[9px] font-bold rounded">
                  ARCHIVED
                </span>
              ) : isDraft ? (
                <span className="px-1.5 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 text-[9px] font-bold rounded flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  DRAFT
                </span>
              ) : (
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  LIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
              <span>{p.variants?.length || 0} sizes</span>
              <span>•</span>
              <span>Stock: {p.total_stock || 0}</span>
            </div>
          </div>
        </div>
        <span className="text-gray-700 font-semibold shrink-0 ml-3 text-xs">
          {formatPrice(p.min_price || 0)}
        </span>
      </div>
    );
  };

  const renderCanonicalCard = (col: CollectionWithProducts) => {
    const categoryKey = col.name.trim().toUpperCase();
    const taxonomyInfo = CANONICAL_TAXONOMY[categoryKey];
    const subcategoryNames = taxonomyInfo?.subcategories || [];

    // Find any working products with unassigned or unlisted subcategories
    const unassignedWorking = col.workingProducts.filter((p) => {
      const sub = (p.subcategory || '').trim().toLowerCase();
      return !subcategoryNames.some((sn) => sn.toLowerCase() === sub);
    });

    return (
      <div
        key={col.id}
        className="rounded-2xl border border-[#E8DFD0] bg-white shadow-sm p-5 sm:p-6 flex flex-col justify-between space-y-5 hover:shadow-md transition-shadow"
      >
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg sm:text-xl font-bold text-gray-900">
                  {col.name}
                </h2>
                <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold rounded uppercase tracking-wider">
                  Canonical
                </span>
              </div>
              <span className="text-[11px] font-mono text-gray-400 block mt-0.5">
                slug: /{col.slug}
              </span>
            </div>

            {/* Badges for Working / Draft / Published */}
            <div className="flex flex-col items-end gap-1">
              <span className="px-2.5 py-1 bg-[#FCF8F0] border border-[#E8DFD0] text-[#5E1224] font-bold text-xs rounded-full">
                {col.workingProducts.length}{' '}
                {col.workingProducts.length === 1 ? 'Design' : 'Designs'}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500">
                <span className="text-emerald-700 font-semibold">
                  {col.publishedCount} live
                </span>
                <span>•</span>
                <span className="text-amber-700 font-semibold">
                  {col.draftCount} draft
                </span>
              </div>
            </div>
          </div>

          {col.description && (
            <p className="text-xs text-gray-600 mt-2 leading-relaxed">
              {col.description}
            </p>
          )}

          {/* Canonical Subcategory Hierarchy */}
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-gray-100">
              <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                Subcategories ({subcategoryNames.length})
              </span>
              <span className="text-[10px] text-gray-400 italic">
                Click subcategory to expand
              </span>
            </div>

            <div className="space-y-2">
              {subcategoryNames.map((subcatName) => {
                const subcatProducts = col.workingProducts.filter(
                  (p) =>
                    (p.subcategory || '').trim().toLowerCase() ===
                    subcatName.trim().toLowerCase()
                );
                const count = subcatProducts.length;
                const stateKey = `${col.slug}:${subcatName}`;
                // Default to open if there are products
                const isOpen =
                  expandedSubcats[stateKey] !== undefined
                    ? expandedSubcats[stateKey]
                    : count > 0;

                return (
                  <div
                    key={subcatName}
                    className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSubcat(stateKey, count > 0)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-gray-100/70 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                        )}
                        <span className="font-semibold text-xs text-gray-800">
                          {subcatName}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          count > 0
                            ? 'bg-[#5E1224] text-white'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {count} {count === 1 ? 'design' : 'designs'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-2.5 pt-1 bg-white border-t border-gray-100 space-y-1">
                        {count === 0 ? (
                          <p className="text-[11px] text-gray-400 italic py-1 px-1">
                            No active designs in this subcategory (0 count).
                          </p>
                        ) : (
                          subcatProducts.map(renderProductRow)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unassigned Subcategories */}
              {unassignedWorking.length > 0 && (
                <div className="border border-dashed border-gray-300 rounded-xl overflow-hidden bg-gray-50/50">
                  <div className="px-3.5 py-2 flex items-center justify-between">
                    <span className="font-semibold text-xs text-gray-700">
                      Other / Unassigned Subcategory
                    </span>
                    <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-bold">
                      {unassignedWorking.length} designs
                    </span>
                  </div>
                  <div className="px-3 pb-2.5 pt-1 bg-white border-t border-gray-100 space-y-1">
                    {unassignedWorking.map(renderProductRow)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Archived History (Excluded from working counts) */}
          {col.archivedProducts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => toggleArchived(col.id)}
                className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-800 py-1"
              >
                <div className="flex items-center gap-1.5 font-medium">
                  {expandedArchived[col.id] ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>Archived Historical Sample Records ({col.archivedProducts.length})</span>
                </div>
                <span className="text-[10px] text-gray-400">
                  Excluded from active counts
                </span>
              </button>

              {expandedArchived[col.id] && (
                <div className="mt-2 space-y-1 pl-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
                  {col.archivedProducts.map(renderProductRow)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* View Filtered Shop Link */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
          <Link
            to={`/shop?collection=${col.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5E1224] hover:text-[#4A0E1C] transition-colors"
          >
            <span>View Filtered Shop Edit</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <Link
            to="/admin/products"
            className="text-xs text-gray-500 hover:text-gray-800 font-medium"
          >
            Manage in Products →
          </Link>
        </div>
      </div>
    );
  };

  const renderLegacyCard = (col: CollectionWithProducts) => (
    <div
      key={col.id}
      className="rounded-2xl border border-gray-200 bg-gray-50/70 shadow-sm p-5 sm:p-6 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg sm:text-xl font-bold text-gray-800">
                {col.name}
              </h2>
              <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-[10px] font-bold rounded uppercase tracking-wider">
                Legacy / Inactive
              </span>
            </div>
            <span className="text-[11px] font-mono text-gray-400 block mt-0.5">
              slug: /{col.slug}
            </span>
          </div>
          <span className="px-2.5 py-1 bg-white border border-gray-200 text-gray-700 font-bold text-xs rounded-full">
            {col.products.length} {col.products.length === 1 ? 'Design' : 'Designs'}
          </span>
        </div>

        {col.description && (
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            {col.description}
          </p>
        )}

        {/* Designs List */}
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Assigned Designs ({col.products.length})
            </span>
            <span className="text-[10px] text-gray-400">
              {col.archivedProducts.length} archived • {col.workingProducts.length} working
            </span>
          </div>
          {col.products.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No products currently assigned.</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {col.products.map(renderProductRow)}
            </div>
          )}
        </div>
      </div>

      {/* View Links */}
      <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
        <Link
          to={`/shop?collection=${col.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
        >
          <span>View Filtered Shop Edit</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
        <Link
          to="/admin/products"
          className="text-xs text-gray-500 hover:text-gray-800 font-medium"
        >
          Manage in Products →
        </Link>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8DFD0]">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-[#5E1224]" />
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Collections Management
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 flex-wrap">
            <span className="font-semibold text-gray-800">
              {totalWorking} Working Designs
            </span>
            <span>({totalPublished} Live, {totalDraft} Draft)</span>
            <span>•</span>
            <span className="text-gray-400">{totalArchived} Preserved Legacy Records</span>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#E8DFD0] bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-sm transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Canonical Collections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#B58A3C]" />
            <h2 className="font-serif text-lg font-bold text-gray-900">
              Canonical Boutique Collections & Subcategories
            </h2>
          </div>
          <span className="text-xs text-gray-500 hidden sm:inline">
            3 Main Groups • 10 Subcategories
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {canonicalCollections.map(renderCanonicalCard)}
        </div>
      </div>

      {/* Legacy / Archived Collections */}
      {legacyCollections.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-[#E8DFD0]">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-gray-500" />
            <h2 className="font-serif text-lg font-bold text-gray-700">
              Archived / Legacy Collections
            </h2>
            <span className="text-xs text-gray-400">
              (Preserved for past links & editorial continuity)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {legacyCollections.map(renderLegacyCard)}
          </div>
        </div>
      )}
    </div>
  );
};
