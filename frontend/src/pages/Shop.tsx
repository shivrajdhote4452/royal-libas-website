import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  SlidersHorizontal,
  X,
  AlertCircle,
  ChevronRight,
  Filter,
  Check,
  ArrowUpDown,
  Heart
} from 'lucide-react';
import { Product, Collection } from '../types/product';
import { fetchProducts, fetchCollections } from '../lib/api';
import { ProductCard } from '../components/ProductCard';
import { useWishlist } from '../context/WishlistContext';

export const Shop: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { wishlist } = useWishlist();

  // URL search params
  const currentCategory = searchParams.get('category') || '';
  const currentCollection = searchParams.get('collection') || '';
  const currentSize = searchParams.get('size') || '';
  const currentColor = searchParams.get('color') || '';
  const currentSort = searchParams.get('sort') || 'newest';
  const currentSearch = searchParams.get('search') || '';
  const inStockOnly = searchParams.get('in_stock') === 'true';
  const wishlistOnly = searchParams.get('wishlist') === 'true';
  const maxPriceParam = searchParams.get('max_price') || '6000';

  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Bottom sheets
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileSortOpen, setMobileSortOpen] = useState(false);
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

  // Lock background scroll when bottom sheet is open
  useEffect(() => {
    if (mobileFilterOpen || mobileSortOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileFilterOpen, mobileSortOpen]);

  // Client-side filtering for color, price range, in-stock, wishlist, and search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const price = p.min_price ?? 0;
      if (price > maxPrice) return false;
      if (inStockOnly && p.total_stock <= 0) return false;
      if (wishlistOnly && !wishlist.includes(p.id)) return false;

      if (currentSearch) {
        const text = `${p.name} ${p.fabric || ''} ${p.category || ''} ${p.description || ''}`.toLowerCase();
        if (!text.includes(currentSearch.toLowerCase())) return false;
      }

      if (currentColor) {
        const text = `${p.name} ${p.fabric || ''} ${p.description || ''}`.toLowerCase();
        if (!text.includes(currentColor.toLowerCase())) return false;
      }
      return true;
    });
  }, [products, maxPrice, inStockOnly, currentColor, wishlistOnly, wishlist, currentSearch]);

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
    wishlistOnly ||
    currentSearch ||
    maxPrice < 6000 ||
    currentSort !== 'newest'
  );

  const activeCategoryName = wishlistOnly
    ? 'My Wishlist'
    : currentSearch
    ? `Search: "${currentSearch}"`
    : currentCollection
    ? collections.find((c) => c.slug === currentCollection)?.name || 'Collection'
    : currentCategory || 'Kurti Sets';

  // Category counts
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

  const sortOptions = [
    { label: 'Recommended / Newest', value: 'newest' },
    { label: 'Price: Low to High', value: 'price_asc' },
    { label: 'Price: High to Low', value: 'price_desc' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] page-enter font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-6 font-medium">
          <Link to="/" className="hover:text-[#5B111A] transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-900 font-semibold">{activeCategoryName}</span>
        </nav>

        {/* Hero Header */}
        <div className="bg-white rounded-2xl border border-[#E8DFD0] overflow-hidden shadow-sm mb-8 grid grid-cols-1 md:grid-cols-12 items-center">
          <div className="md:col-span-7 p-6 sm:p-10 lg:p-12 space-y-3">
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#5B111A] leading-tight">
              {activeCategoryName}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 font-light max-w-lg leading-relaxed">
              Explore our handpicked kurti sets, tailored festive co-ords and pure mulmul pieces made for every celebration.
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

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Desktop Filter Sidebar (Point 12) */}
          <aside className="hidden lg:block lg:col-span-3 bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-6">
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
                    <span className="text-gray-400 text-[11px]">({count})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Size Filter */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Size</h4>
              <div className="grid grid-cols-4 gap-2">
                {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => updateParam('size', currentSize === sz ? '' : sz)}
                    className={`h-9 rounded-lg border text-xs font-semibold transition-all ${
                      currentSize === sz
                        ? 'bg-[#5B111A] text-white border-[#5B111A]'
                        : 'bg-white text-gray-700 border-[#E8DFD0] hover:border-gray-400'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Filter */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Color Palette</h4>
              <div className="flex flex-wrap gap-2.5">
                {colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => updateParam('color', currentColor === c.name ? '' : c.name)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-7 h-7 rounded-full border transition-all ${
                      currentColor === c.name
                        ? 'ring-2 ring-[#5B111A] ring-offset-2 scale-110 shadow-sm'
                        : 'border-black/20 hover:scale-105'
                    }`}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Max Price Slider */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center text-xs">
                <span className="uppercase tracking-wider font-bold text-gray-800">Max Price</span>
                <span className="font-bold text-[#5B111A]">₹{maxPrice.toLocaleString('en-IN')}</span>
              </div>
              <input
                type="range"
                min="1500"
                max="6000"
                step="250"
                value={maxPrice}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxPrice(val);
                  updateParam('max_price', val.toString());
                }}
                className="w-full accent-[#5B111A] cursor-pointer"
              />
            </div>

            {/* In Stock Toggle */}
            <div className="pt-4 border-t border-gray-100">
              <label className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => updateParam('in_stock', e.target.checked ? 'true' : '')}
                  className="rounded border-gray-300 text-[#5B111A] focus:ring-[#C59B27]"
                />
                <span className="font-medium">In Stock Items Only</span>
              </label>
            </div>
          </aside>

          {/* Product Listing Main Area */}
          <main className="lg:col-span-9 space-y-4">
            {/* Top Toolbar: Filter triggers (mobile) and Sort */}
            <div className="bg-white p-4 rounded-xl border border-[#E8DFD0] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Mobile Filter Button (Point 12) */}
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(true)}
                  className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#FAF7F2] border border-[#E8DFD0] text-xs font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#5B111A]" />
                  <span>Filters</span>
                </button>

                {/* Mobile Sort Button (Point 13) */}
                <button
                  type="button"
                  onClick={() => setMobileSortOpen(true)}
                  className="sm:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#E8DFD0] text-xs font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 transition-colors"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#5B111A]" />
                  <span>Sort</span>
                </button>

                <p className="text-xs text-gray-600 font-medium">
                  Showing <strong className="text-gray-900">{filteredProducts.length}</strong> designs
                </p>
              </div>

              {/* Desktop Sort Dropdown (Point 13) */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Sort by:</span>
                <select
                  value={currentSort}
                  onChange={(e) => updateParam('sort', e.target.value)}
                  className="text-xs bg-[#FAF7F2] border border-[#E8DFD0] rounded-lg px-3 py-2 text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#5B111A]"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active Filter Chips (Point 12: Removable with one click) */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
                {currentSearch && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#5B111A] text-white shadow-sm">
                    Search: &ldquo;{currentSearch}&rdquo;
                    <button onClick={() => updateParam('search', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {wishlistOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#5B111A] text-white shadow-sm">
                    <Heart className="w-3 h-3 fill-white" />
                    Wishlist Only
                    <button onClick={() => updateParam('wishlist', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {currentCategory && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#5B111A] text-white shadow-sm">
                    Category: {currentCategory}
                    <button onClick={() => updateParam('category', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {currentSize && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#5B111A] text-white shadow-sm">
                    Size: {currentSize}
                    <button onClick={() => updateParam('size', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {currentColor && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#5B111A] text-white shadow-sm">
                    Color: {currentColor}
                    <button onClick={() => updateParam('color', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {inStockOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#5B111A] text-white shadow-sm">
                    In Stock Only
                    <button onClick={() => updateParam('in_stock', '')}><X className="w-3.5 h-3.5" /></button>
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
                  <div key={i} className="aspect-[3/4] skeleton-shimmer rounded-xl border border-[#E8DFD0]" />
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
                  No products matched your exact filter combination. Try clearing some active filters.
                </p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center px-6 py-2.5 rounded-lg bg-[#5B111A] text-white text-xs font-ui font-semibold uppercase tracking-wider hover:bg-[#460C13]"
                >
                  Reset All Filters
                </button>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ========================================================
          MOBILE FILTERS BOTTOM SHEET (Point 12)
          ======================================================== */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden font-sans">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setMobileFilterOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 bg-[#FAF7F2] rounded-t-2xl max-h-[85vh] overflow-y-auto p-6 space-y-6 shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out"
            style={{
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E8DFD0]">
              <h3 className="font-serif font-bold text-lg text-gray-900">Filter Catalogue</h3>
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
                <label key={catName} className="flex items-center justify-between text-xs text-gray-700 py-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={currentCategory === catName}
                      onChange={() => updateParam('category', currentCategory === catName ? '' : catName)}
                      className="rounded border-gray-300 text-[#5B111A] focus:ring-[#5B111A]"
                    />
                    <span>{catName}</span>
                  </div>
                  <span className="text-gray-400">({count})</span>
                </label>
              ))}
            </div>

            {/* Size */}
            <div className="space-y-2 pt-3 border-t border-gray-200">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Size</h4>
              <div className="grid grid-cols-4 gap-2">
                {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => updateParam('size', currentSize === sz ? '' : sz)}
                    className={`h-10 rounded-lg border text-xs font-semibold ${
                      currentSize === sz
                        ? 'bg-[#5B111A] text-white border-[#5B111A]'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-2 pt-3 border-t border-gray-200">
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Color</h4>
              <div className="flex flex-wrap gap-2.5">
                {colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => updateParam('color', currentColor === c.name ? '' : c.name)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-8 h-8 rounded-full border ${
                      currentColor === c.name ? 'ring-2 ring-[#5B111A] ring-offset-2' : 'border-black/20'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-[#E8DFD0] flex gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex-1 py-3 bg-white border border-[#E8DFD0] rounded-xl text-xs font-semibold text-gray-800 hover:bg-gray-100"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-3 bg-[#5B111A] text-white rounded-xl text-xs font-semibold uppercase tracking-wider shadow"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MOBILE SORT BOTTOM SHEET (Point 13)
          ======================================================== */}
      {mobileSortOpen && (
        <div className="fixed inset-0 z-50 sm:hidden font-sans">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setMobileSortOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 bg-[#FAF7F2] rounded-t-2xl p-6 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out"
            style={{
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E8DFD0]">
              <h3 className="font-serif font-bold text-lg text-gray-900">Sort Products</h3>
              <button
                type="button"
                onClick={() => setMobileSortOpen(false)}
                className="p-1 rounded-full text-gray-500 hover:text-gray-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {sortOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    updateParam('sort', opt.value);
                    setMobileSortOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                    currentSort === opt.value
                      ? 'bg-[#5B111A] text-white border-[#5B111A]'
                      : 'bg-white text-gray-800 border-[#E8DFD0]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {currentSort === opt.value && <Check className="w-4 h-4 text-[#C59B27]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
