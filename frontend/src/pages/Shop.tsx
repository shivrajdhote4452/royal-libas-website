import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, SlidersHorizontal, RotateCcw, AlertCircle } from 'lucide-react';
import { Product, Collection } from '../types/product';
import { fetchProducts, fetchCollections } from '../lib/api';
import { ProductCard } from '../components/ProductCard';

export const Shop: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read current filters from URL search params
  const currentCategory = searchParams.get('category') || '';
  const currentCollection = searchParams.get('collection') || '';
  const currentSize = searchParams.get('size') || '';
  const currentSort = searchParams.get('sort') || 'newest';

  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load collections for filter bar
  useEffect(() => {
    document.title = 'Shop All Boutique Collections | Royal Libas by Tanya';
    fetchCollections()
      .then(setCollections)
      .catch((e) => console.error('Failed to load collections:', e));
  }, []);

  // Fetch products driven strictly by the backend API query parameters
  useEffect(() => {
    let isMounted = true;
    async function loadProducts() {
      try {
        setLoading(true);
        const data = await fetchProducts({
          category: currentCategory || undefined,
          collection: currentCollection || undefined,
          size: currentSize || undefined,
          sort: currentSort,
        });
        if (isMounted) {
          setProducts(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError('Failed to fetch catalogue from backend. Please verify backend is running.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProducts();
    return () => {
      isMounted = false;
    };
  }, [currentCategory, currentCollection, currentSize, currentSort]);

  // Handler to update a single search param
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(currentCategory || currentCollection || currentSize || currentSort !== 'newest');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 min-h-screen flex flex-col page-enter">
      {/* Header & Breadcrumb */}
      <div className="mb-6 pb-4 border-b border-[#E8DFD0]">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h1 className="font-serif text-2xl sm:text-4xl font-bold text-[#5B111A]">
              {currentCollection
                ? collections.find((c) => c.slug === currentCollection)?.name || 'Collection'
                : currentCategory || 'All Designs'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Showing {products.length} {products.length === 1 ? 'piece' : 'pieces'} curated by Tanya
            </p>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Sort by:</span>
            <select
              value={currentSort}
              onChange={(e) => updateFilter('sort', e.target.value)}
              className="text-xs sm:text-sm bg-white border border-[#E8DFD0] rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-gray-700 transition-colors"
            >
              <option value="newest">Newest Arrivals</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* Filter Bar with Animated Chips */}
        <div className="mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#C59B27]" />
            <span>Filters:</span>
          </div>

          {/* Collections Filter Pills */}
          <button
            type="button"
            onClick={() => updateFilter('collection', '')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
              !currentCollection
                ? 'bg-[#5B111A] text-white shadow-sm ring-1 ring-[#C59B27]/40 scale-[1.02]'
                : 'bg-white text-gray-700 border border-[#E8DFD0] hover:bg-gray-50 hover:border-gray-300'
            }`}
          >
            All Collections
          </button>
          {collections.map((col) => (
            <button
              key={col.slug}
              type="button"
              onClick={() => updateFilter('collection', col.slug === currentCollection ? '' : col.slug)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
                currentCollection === col.slug
                  ? 'bg-[#5B111A] text-white shadow-sm ring-1 ring-[#C59B27]/40 scale-[1.02]'
                  : 'bg-white text-gray-700 border border-[#E8DFD0] hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              {col.name} ({col.product_count})
            </button>
          ))}

          {/* Category Filter Dropdown */}
          <select
            value={currentCategory}
            onChange={(e) => updateFilter('category', e.target.value)}
            className="text-xs bg-white border border-[#E8DFD0] rounded-full px-3.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#C59B27] transition-all hover:border-gray-300"
          >
            <option value="">All Categories</option>
            <option value="Kurti Sets">Kurti Sets</option>
            <option value="Co-ord Sets">Co-ord Sets</option>
            <option value="Festive Sets">Festive Sets</option>
          </select>

          {/* Size Filter Pills */}
          <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
            <span className="text-xs text-gray-400 mr-1">Size:</span>
            {['S', 'M', 'L', 'XL'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateFilter('size', currentSize === s ? '' : s)}
                className={`w-7 h-7 rounded text-xs font-semibold flex items-center justify-center transition-all duration-200 active:scale-95 ${
                  currentSize === s
                    ? 'bg-[#C59B27] text-[#3A080F] shadow-sm font-bold ring-2 ring-[#5B111A]/20 scale-105'
                    : 'bg-white text-gray-700 border border-[#E8DFD0] hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-xs text-[#5B111A] hover:underline font-medium ml-auto transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Error alert if backend API fails */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-6 flex-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-gray-100 animate-pulse rounded-lg border border-gray-200" />
          ))}
        </div>
      ) : products.length > 0 ? (
        /* Product Grid with staggered animation entry */
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-6 flex-1">
          {products.map((product, idx) => (
            <div
              key={product.id}
              className="card-stagger"
              style={{ animationDelay: `${Math.min(idx * 25, 150)}ms` }}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      ) : (
        /* Empty State with friendly message and button back to all products */
        <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#E8DFD0] flex items-center justify-center text-gray-400 mb-4">
            <Filter className="w-8 h-8 text-[#C59B27]" />
          </div>
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            No designs found
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 max-w-md mb-6">
            We couldn't find any pieces matching your selected filter combination. Try adjusting or clearing your filters.
          </p>
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center px-6 py-2.5 rounded bg-[#5B111A] hover:bg-[#3A080F] text-white text-xs sm:text-sm font-semibold transition-colors shadow"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
};
