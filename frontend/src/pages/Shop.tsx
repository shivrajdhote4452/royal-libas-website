import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  SlidersHorizontal,
  X,
  AlertCircle,
  ChevronRight,
  Filter,
  Check
} from 'lucide-react';
import { Product, Collection } from '../types/product';
import { fetchProducts, fetchCollections } from '../lib/api';
import { ProductCard } from '../components/ProductCard';

export const Shop: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL search params
  const currentCategory = searchParams.get('category') || '';
  const currentCollection = searchParams.get('collection') || '';
  const currentSize = searchParams.get('size') || '';
  const currentColor = searchParams.get('color') || '';
  const currentSort = searchParams.get('sort') || 'newest';
  const inStockOnly = searchParams.get('in_stock') === 'true';
  const maxPriceParam = searchParams.get('max_price') || '6000';

  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number>(Number(maxPriceParam) || 6000);

  // Load collections
  useEffect(() => {
    document.title = 'Shop All Boutique Collections | Royal Libas by Tanya';
    fetchCollections()
      .then(setCollections)
      .catch((e) => console.error('Failed to load collections:', e));
  }, []);

  // Fetch products from backend
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
      } catch {
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

  // Client-side filtering for color, price range, and in-stock
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const price = p.min_price ?? 0;
      if (price > maxPrice) return false;
      if (inStockOnly && p.total_stock <= 0) return false;
      if (currentColor) {
        const text = `${p.name} ${p.fabric || ''} ${p.description || ''}`.toLowerCase();
        if (!text.includes(currentColor.toLowerCase())) return false;
      }
      return true;
    });
  }, [products, maxPrice, inStockOnly, currentColor]);

  const updateParam = (key: string, value: string) => {
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
    setMaxPrice(6000);
  };

  const hasActiveFilters = Boolean(
    currentCategory ||
    currentCollection ||
    currentSize ||
    currentColor ||
    inStockOnly ||
    maxPrice < 6000 ||
    currentSort !== 'newest'
  );

  const activeCategoryName = currentCollection
    ? collections.find((c) => c.slug === currentCollection)?.name || 'Collection'
    : currentCategory || 'Kurti Sets';

  // Category counts (real product counts from backend, zero mock fallbacks)
  const categoryCounts = {
    'Kurti Sets': products.filter((p) => p.category === 'Kurti Sets').length,
    'Co-ord Sets': products.filter((p) => p.category === 'Co-ord Sets' || p.category === 'Coord Sets').length,
    'Festive Wear': products.filter((p) => p.category === 'Festive Wear' || p.category === 'Festive Sets').length,
    'Everyday Cotton': products.filter((p) => p.category === 'Everyday Cotton').length,
  };

  const colors = [
    { name: 'Maroon', hex: '#5B111A' },
    { name: 'Mustard', hex: '#C59B27' },
    { name: 'Sage', hex: '#8A9A86' },
    { name: 'Pink', hex: '#D47D97' },
    { name: 'Blue', hex: '#2E5B88' },
    { name: 'Navy', hex: '#1D2A44' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] page-enter font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* ========================================================
            1. BREADCRUMB
            ======================================================== */}
        <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-6 font-medium">
          <Link to="/" className="hover:text-[#5B111A] transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-900 font-semibold">{activeCategoryName}</span>
        </nav>

        {/* ========================================================
            2. COLLECTION HERO HEADER (PDF Page 3)
            Split layout: Left Title + Subtitle, Right Featured Photo
            ======================================================== */}
        <div className="bg-white rounded-2xl border border-[#E8DFD0] overflow-hidden shadow-sm mb-10 grid grid-cols-1 md:grid-cols-12 items-center">
          <div className="md:col-span-7 p-6 sm:p-10 lg:p-12 space-y-3">
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#5B111A] leading-tight">
              {activeCategoryName}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 font-light max-w-lg leading-relaxed">
              Explore our handpicked kurti sets, tailored festive co-ords and pure mulmul pieces made for every occasion.
            </p>
          </div>
          <div className="md:col-span-5 h-44 sm:h-56 md:h-full bg-gray-100 relative overflow-hidden">
            <img
              src="/images/products/maroon_worn.jpg"
              alt="Collection Showcase"
              className="w-full h-full object-cover object-top"
            />
          </div>
        </div>

        {/* ========================================================
            3. MAIN CONTENT: SIDEBAR + PRODUCT GRID
            ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Desktop Filter Sidebar (PDF Page 3) */}
          <aside className="hidden lg:block lg:col-span-3 bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-serif font-bold text-base text-gray-900">Filters</h3>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-[#5B111A] hover:underline font-semibold"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="space-y-2.5">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Category</h4>
              <div className="space-y-2">
                {Object.entries(categoryCounts).map(([catName, count]) => (
                  <label
                    key={catName}
                    className="flex items-center justify-between text-xs text-gray-700 cursor-pointer hover:text-[#5B111A]"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={currentCategory === catName}
                        onChange={() => updateParam('category', currentCategory === catName ? '' : catName)}
                        className="rounded border-gray-300 text-[#5B111A] focus:ring-[#C59B27]"
                      />
                      <span>{catName}</span>
                    </div>
                    <span className="text-gray-400">({count})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Price Range Slider */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Price Range</h4>
                <span className="text-xs font-semibold text-[#5B111A]">₹0 - ₹{maxPrice}</span>
              </div>
              <input
                type="range"
                min="1000"
                max="6000"
                step="250"
                value={maxPrice}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxPrice(val);
                  updateParam('max_price', String(val));
                }}
                className="w-full accent-[#5B111A]"
              />
            </div>

            {/* Size Filter (Square Pills) */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Size</h4>
              <div className="grid grid-cols-5 gap-1.5">
                {['XS', 'S', 'M', 'L', 'XL'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateParam('size', currentSize === s ? '' : s)}
                    className={`h-8 rounded text-xs font-semibold flex items-center justify-center transition-all ${
                      currentSize === s
                        ? 'bg-[#5B111A] text-white shadow-sm ring-1 ring-[#C59B27]'
                        : 'bg-[#FAF7F2] text-gray-700 border border-[#E8DFD0] hover:bg-gray-100'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Swatches */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Color</h4>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => updateParam('color', currentColor === c.name ? '' : c.name)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-6 h-6 rounded-full border transition-transform flex items-center justify-center ${
                      currentColor === c.name
                        ? 'ring-2 ring-[#5B111A] ring-offset-2 scale-110'
                        : 'border-black/20 hover:scale-105'
                    }`}
                    title={c.name}
                  >
                    {currentColor === c.name && <Check className="w-3 h-3 text-white stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Availability</h4>
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => updateParam('in_stock', e.target.checked ? 'true' : '')}
                  className="rounded border-gray-300 text-[#5B111A] focus:ring-[#C59B27]"
                />
                <span>In Stock ({products.filter((p) => p.total_stock > 0).length})</span>
              </label>
            </div>
          </aside>

          {/* Right Area: Top Sort Bar + Product Grid */}
          <main className="lg:col-span-9 space-y-6">
            {/* Top Bar: Mobile Filter Button + Product Count + Sort Dropdown */}
            <div className="bg-white p-4 rounded-xl border border-[#E8DFD0] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center justify-between sm:justify-start gap-3">
                {/* Mobile Filter Sheet Trigger */}
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(true)}
                  className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8DFD0] text-xs font-semibold text-gray-700 bg-[#FAF7F2]"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#5B111A]" />
                  <span>Filters</span>
                </button>

                <p className="text-xs text-gray-600 font-medium">
                  Showing <strong className="text-gray-900">{filteredProducts.length}</strong> products
                </p>
              </div>

              {/* Sort By Dropdown */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-xs text-gray-500 font-medium">Sort by:</span>
                <select
                  value={currentSort}
                  onChange={(e) => updateParam('sort', e.target.value)}
                  className="text-xs bg-[#FAF7F2] border border-[#E8DFD0] rounded-lg px-3 py-1.5 text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                >
                  <option value="newest">Newest First</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>
            </div>

            {/* Active Filters Pills */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {currentCategory && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#5B111A] text-white">
                    Category: {currentCategory}
                    <button onClick={() => updateParam('category', '')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {currentSize && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#5B111A] text-white">
                    Size: {currentSize}
                    <button onClick={() => updateParam('size', '')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {currentColor && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#5B111A] text-white">
                    Color: {currentColor}
                    <button onClick={() => updateParam('color', '')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {inStockOnly && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#5B111A] text-white">
                    In Stock Only
                    <button onClick={() => updateParam('in_stock', '')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-[#5B111A] hover:underline font-semibold ml-1"
                >
                  Reset all
                </button>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Product Grid */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-gray-200/60 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
                {filteredProducts.map((product, idx) => (
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
              <div className="bg-white rounded-2xl border border-[#E8DFD0] py-16 px-4 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-[#FAF7F2] border border-[#E8DFD0] flex items-center justify-center mx-auto text-[#C59B27]">
                  <Filter className="w-6 h-6" />
                </div>
                <h3 className="font-serif text-lg font-bold text-gray-900">No pieces found</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  No products matched your exact filter combination. Try adjusting or clearing your active filters.
                </p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center px-6 py-2.5 rounded bg-[#5B111A] text-white text-xs font-ui font-semibold uppercase tracking-wider hover:bg-[#3A080F]"
                >
                  Reset All Filters
                </button>
              </div>
            )}

            {/* Pagination (PDF Page 3) */}
            {filteredProducts.length > 0 && (
              <div className="pt-8 flex items-center justify-center gap-2">
                <button className="w-8 h-8 rounded bg-[#5B111A] text-white text-xs font-semibold shadow">1</button>
                <button className="w-8 h-8 rounded bg-white text-gray-700 border border-[#E8DFD0] text-xs font-semibold hover:bg-gray-50">2</button>
                <button className="w-8 h-8 rounded bg-white text-gray-700 border border-[#E8DFD0] text-xs font-semibold hover:bg-gray-50">3</button>
                <button className="w-8 h-8 rounded bg-white text-gray-700 border border-[#E8DFD0] text-xs font-semibold hover:bg-gray-50">→</button>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ========================================================
          4. MOBILE FILTERS BOTTOM SHEET (PDF Page 3)
          ======================================================== */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileFilterOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-serif font-bold text-lg text-gray-900">Filters</h3>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="p-1 rounded-full text-gray-500 hover:text-gray-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Category</h4>
              {Object.entries(categoryCounts).map(([catName, count]) => (
                <label key={catName} className="flex items-center justify-between text-xs text-gray-700 py-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={currentCategory === catName}
                      onChange={() => updateParam('category', currentCategory === catName ? '' : catName)}
                      className="rounded border-gray-300 text-[#5B111A]"
                    />
                    <span>{catName}</span>
                  </div>
                  <span className="text-gray-400">({count})</span>
                </label>
              ))}
            </div>

            {/* Size */}
            <div className="space-y-2 pt-3 border-t border-gray-100">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Size</h4>
              <div className="flex gap-2">
                {['XS', 'S', 'M', 'L', 'XL'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateParam('size', currentSize === s ? '' : s)}
                    className={`flex-1 h-9 rounded text-xs font-semibold ${
                      currentSize === s ? 'bg-[#5B111A] text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-gray-100 flex gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex-1 py-3 rounded-lg border border-[#E8DFD0] text-xs font-semibold text-gray-700"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-3 rounded-lg bg-[#5B111A] text-white text-xs font-semibold uppercase tracking-wider"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
