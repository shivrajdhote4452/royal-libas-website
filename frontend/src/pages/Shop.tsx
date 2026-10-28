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

// Verified palette color mappings for catalog variant swatches
const COLOR_HEX_MAP: Record<string, string> = {
  'Deep Maroon': '#5E1224',
  'Ivory Pearl': '#FCF8F0',
  'Emerald Green': '#1B4D3E',
  'Emerald Jewel': '#0F52BA',
  'Dusty Rose': '#C8858E',
  'Champagne Gold': '#D4AF37',
  'Sage Green': '#8F9779',
  'Midnight Navy': '#1B243B',
  'Powder Blue': '#9BB7D4',
  'Peach Bloom': '#E8A598',
  'Deep Wine': '#4A1525',
  'Mustard Ochre': '#D49B28',
  'Terracotta Rust': '#B85338',
  'Lilac Frost': '#B8A9C9',
  'Sea Green': '#2E8B57',
  'Royal Plum': '#582949',
};

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
  const maxPriceParam = searchParams.get('max_price');

  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Bottom sheets
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileSortOpen, setMobileSortOpen] = useState(false);

  // Dynamic catalog price bounds from full catalog
  const catalogReference = allProducts.length > 0 ? allProducts : products;

  const catalogMaxPrice = useMemo(() => {
    if (!catalogReference.length) return 10000;
    const max = Math.max(...catalogReference.map((p) => p.max_price || p.min_price || 0));
    return Math.max(max, 6000);
  }, [catalogReference]);

  const catalogMinPrice = useMemo(() => {
    if (!catalogReference.length) return 1500;
    const min = Math.min(...catalogReference.map((p) => p.min_price || 0).filter((v) => v > 0));
    return min < Infinity ? min : 1500;
  }, [catalogReference]);

  // If user selected max_price exists in query, use it; otherwise null (show all products)
  const activeUserMaxPrice = maxPriceParam !== null && !isNaN(Number(maxPriceParam))
    ? Number(maxPriceParam)
    : null;

  // Local state for slider dragging
  const [sliderPrice, setSliderPrice] = useState<number>(activeUserMaxPrice ?? 10000);

  useEffect(() => {
    if (activeUserMaxPrice !== null) {
      setSliderPrice(activeUserMaxPrice);
    } else {
      setSliderPrice(catalogMaxPrice);
    }
  }, [activeUserMaxPrice, catalogMaxPrice]);

  // Load collections and full catalog reference on mount
  useEffect(() => {
    document.title = 'Shop Handcrafted Festive Silhouettes | Royal Libas by Tanya';
    fetchCollections()
      .then(setCollections)
      .catch((e) => console.error('Failed to load collections:', e));

    fetchProducts({})
      .then((data) => setAllProducts(data))
      .catch((e) => console.error('Failed to load catalog products reference:', e));
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

  // Filter products by structured data
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const price = p.min_price ?? 0;
      // Only filter if user actively set a maximum price
      if (activeUserMaxPrice !== null && price > activeUserMaxPrice) return false;
      if (inStockOnly && p.total_stock <= 0) return false;
      if (wishlistOnly && !wishlist.includes(p.id)) return false;

      if (currentSearch) {
        const text = `${p.name} ${p.fabric || ''} ${p.category || ''} ${p.description || ''}`.toLowerCase();
        if (!text.includes(currentSearch.toLowerCase())) return false;
      }

      // Filter colour strictly by structured variant attributes
      if (currentColor) {
        const matchesColour = p.variants?.some((v) => {
          if (!v.colour) return false;
          const vCol = v.colour.toLowerCase().trim();
          const fCol = currentColor.toLowerCase().trim();
          return vCol === fCol || vCol.includes(fCol) || fCol.includes(vCol);
        });
        if (!matchesColour) return false;
      }

      return true;
    });
  }, [products, activeUserMaxPrice, inStockOnly, currentColor, wishlistOnly, wishlist, currentSearch]);

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
    setSliderPrice(catalogMaxPrice);
  };

  const hasActiveFilters = Boolean(
    currentCategory ||
    currentCollection ||
    currentSize ||
    currentColor ||
    inStockOnly ||
    wishlistOnly ||
    currentSearch ||
    activeUserMaxPrice !== null ||
    currentSort !== 'newest'
  );

  const activeCategoryName = wishlistOnly
    ? 'My Wishlist'
    : currentSearch
    ? `Search: "${currentSearch}"`
    : currentCollection
    ? collections.find((c) => c.slug === currentCollection)?.name || 'Collection'
    : currentCategory || 'All Designs';

  // Dynamic category counts from full catalog reference so options never disappear
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    catalogReference.forEach((p) => {
      if (p.category) {
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
    });
    return counts;
  }, [catalogReference]);

  // Dynamic available variant colours from full catalog reference
  const availableColours = useMemo(() => {
    const counts: Record<string, number> = {};
    catalogReference.forEach((p) => {
      const coloursForProduct = new Set<string>();
      p.variants?.forEach((v) => {
        if (v.colour) coloursForProduct.add(v.colour.trim());
      });
      coloursForProduct.forEach((col) => {
        counts[col] = (counts[col] || 0) + 1;
      });
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        hex: COLOR_HEX_MAP[name] || '#8C6F5B',
      }));
  }, [catalogReference]);

  // Dynamic available sizes from full catalog reference
  const availableSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    catalogReference.forEach((p) => {
      p.variants?.forEach((v) => {
        if (v.size) sizeSet.add(v.size);
      });
    });
    const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
    return Array.from(sizeSet).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      return a.localeCompare(b);
    });
  }, [catalogReference]);

  const sortOptions = [
    { label: 'Recommended / Newest', value: 'newest' },
    { label: 'Price: Low to High', value: 'price_asc' },
    { label: 'Price: High to Low', value: 'price_desc' },
  ];

  return (
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans">
      {/* ========================================================
          1. COLLECTION EDITORIAL BANNER (PDF Page 4 & 12)
          "THE ROYAL COLLECTION - Timeless Traditions for a Brighter Tomorrow"
          ======================================================== */}
      <section className="relative bg-[#2B1B1E] text-[#FCF8F0] overflow-hidden border-b border-[#B58A3C]/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7 space-y-4 text-center md:text-left z-10">
            <div className="inline-flex items-center justify-center md:justify-start gap-2">
              <span className="w-6 h-[1px] bg-[#B58A3C]" />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
                THE ROYAL COLLECTION
              </span>
              <span className="w-6 h-[1px] bg-[#B58A3C]" />
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#FCF8F0] leading-tight">
              Timeless Traditions for a Brighter Tomorrow
            </h1>
            <p className="text-xs sm:text-sm text-[#FCF8F0]/85 font-light max-w-lg leading-relaxed mx-auto md:mx-0">
              Exquisite festive sets, kurti sets, and artisanal co-ord ensembles handcrafted from centuries-old Indian heritage.
            </p>
          </div>
          <div className="md:col-span-5 aspect-[16/10] sm:aspect-[4/3] rounded-none overflow-hidden border border-[#B58A3C]/40 shadow-2xl bg-neutral-900">
            <img
              src="/images/products/noorani_maroon_front.jpg"
              alt="The Royal Libas Atelier Collection"
              className="w-full h-full object-cover object-top"
            />
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-6 font-medium">
          <Link to="/" className="hover:text-[#5E1224] transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[#2B1B1E] font-semibold">{activeCategoryName}</span>
        </nav>

        {/* Collection Header Bar matching PDF Page 4 */}
        <div className="mb-8 pb-4 border-b border-[#E8DFD0] flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold uppercase tracking-wider text-[#5E1224]">
              {activeCategoryName}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1 font-light">
              A celebration of grace, heritage and contemporary elegance.
            </p>
          </div>
          <p className="text-xs text-gray-500 font-medium">
            Showing <strong className="text-[#2B1B1E] font-bold">{filteredProducts.length}</strong> handcrafted designs
          </p>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Desktop Filter Sidebar (PDF Page 4: SHOP BY) */}
          <aside className="hidden lg:block lg:col-span-3 bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-serif font-bold text-sm uppercase tracking-[0.16em] text-[#2B1B1E]">
                SHOP BY
              </h3>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-[#5E1224] hover:underline font-semibold"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="space-y-2.5">
              <h4 className="text-[11px] uppercase tracking-[0.18em] font-bold text-[#5E1224]">
                CATEGORY
              </h4>
              <div className="space-y-2">
                {Object.entries(categoryCounts).map(([catName, count]) => (
                  <label
                    key={catName}
                    className="flex items-center justify-between text-xs text-gray-700 cursor-pointer hover:text-[#5E1224]"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={currentCategory === catName}
                        onChange={() => updateParam('category', currentCategory === catName ? '' : catName)}
                        className="rounded-none border-gray-300 text-[#5E1224] focus:ring-[#B58A3C]"
                      />
                      <span>{catName}</span>
                    </div>
                    <span className="text-gray-400 text-[11px]">({count})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Curated Collections Filter */}
            {collections.length > 0 && (
              <div className="space-y-2.5 pt-4 border-t border-gray-100">
                <h4 className="text-[11px] uppercase tracking-[0.18em] font-bold text-[#5E1224]">
                  CURATED EDITS
                </h4>
                <div className="space-y-2">
                  {collections.map((col) => (
                    <label
                      key={col.slug}
                      className="flex items-center justify-between text-xs text-gray-700 cursor-pointer hover:text-[#5E1224]"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={currentCollection === col.slug}
                          onChange={() => updateParam('collection', currentCollection === col.slug ? '' : col.slug)}
                          className="rounded-none border-gray-300 text-[#5E1224] focus:ring-[#B58A3C]"
                        />
                        <span>{col.name}</span>
                      </div>
                      <span className="text-gray-400 text-[11px]">({col.product_count})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Size Filter */}
            {availableSizes.length > 0 && (
              <div className="space-y-2.5 pt-4 border-t border-gray-100">
                <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Size</h4>
                <div className="grid grid-cols-4 gap-2">
                  {availableSizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => updateParam('size', currentSize === sz ? '' : sz)}
                      className={`h-9 rounded-none border text-xs font-semibold transition-all ${
                        currentSize === sz
                          ? 'bg-[#5E1224] text-white border-[#5E1224]'
                          : 'bg-white text-gray-700 border-[#E8DFD0] hover:border-[#B58A3C]'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Palette Filter */}
            {availableColours.length > 0 && (
              <div className="space-y-2.5 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Color Palette</h4>
                  {currentColor && (
                    <button
                      type="button"
                      onClick={() => updateParam('color', '')}
                      className="text-[10px] text-[#5E1224] hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {availableColours.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => updateParam('color', currentColor === c.name ? '' : c.name)}
                      style={{ backgroundColor: c.hex }}
                      className={`w-7 h-7 rounded-full border transition-all ${
                        currentColor === c.name
                          ? 'ring-2 ring-[#5E1224] ring-offset-2 scale-110 shadow-sm'
                          : 'border-black/20 hover:scale-105'
                      }`}
                      title={`${c.name} (${c.count} items)`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Max Price Slider */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center text-xs">
                <span className="uppercase tracking-wider font-bold text-gray-800">Max Price</span>
                <span className="font-bold text-[#5E1224]">
                  {activeUserMaxPrice !== null
                    ? `₹${sliderPrice.toLocaleString('en-IN')}`
                    : 'All Prices'}
                </span>
              </div>
              <input
                type="range"
                min={catalogMinPrice}
                max={catalogMaxPrice}
                step="250"
                value={sliderPrice}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSliderPrice(val);
                }}
                onMouseUp={() => {
                  updateParam('max_price', sliderPrice.toString());
                }}
                onTouchEnd={() => {
                  updateParam('max_price', sliderPrice.toString());
                }}
                onKeyUp={(e) => {
                  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                    updateParam('max_price', sliderPrice.toString());
                  }
                }}
                aria-label="Filter catalogue by maximum price"
                className="w-full accent-[#5E1224] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>₹{catalogMinPrice.toLocaleString('en-IN')}</span>
                <span>₹{catalogMaxPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* In Stock Toggle */}
            <div className="pt-4 border-t border-gray-100">
              <label className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => updateParam('in_stock', e.target.checked ? 'true' : '')}
                  className="rounded border-gray-300 text-[#5E1224] focus:ring-[#B58A3C]"
                />
                <span className="font-medium">In Stock Items Only</span>
              </label>
            </div>
          </aside>

          {/* Product Listing Main Area */}
          <main className="lg:col-span-9 space-y-4">
            {/* Top Toolbar: Filter triggers (mobile) and Sort */}
            <div className="bg-white p-4 rounded-none border border-[#E8DFD0] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Mobile Filter Button */}
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(true)}
                  className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 bg-[#FCF8F0] border border-[#E8DFD0] text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#5E1224]" />
                  <span>Filters</span>
                </button>

                {/* Mobile Sort Button */}
                <button
                  type="button"
                  onClick={() => setMobileSortOpen(true)}
                  className="sm:hidden inline-flex items-center gap-1.5 px-3 py-2 bg-[#FCF8F0] border border-[#E8DFD0] text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] transition-colors"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#5E1224]" />
                  <span>Sort</span>
                </button>

                <p className="text-xs text-gray-600 font-medium">
                  Showing <strong className="text-gray-900">{filteredProducts.length}</strong> designs
                </p>
              </div>

              {/* Desktop Sort Dropdown */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Sort by:</span>
                <select
                  value={currentSort}
                  onChange={(e) => updateParam('sort', e.target.value)}
                  className="text-xs bg-[#FCF8F0] border border-[#E8DFD0] rounded px-3 py-2 text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active Filter Chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
                {currentSearch && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#5E1224] text-white shadow-sm">
                    Search: &ldquo;{currentSearch}&rdquo;
                    <button onClick={() => updateParam('search', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {wishlistOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#5E1224] text-white shadow-sm">
                    <Heart className="w-3 h-3 fill-white" />
                    Wishlist Only
                    <button onClick={() => updateParam('wishlist', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {currentCategory && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#5E1224] text-white shadow-sm">
                    Category: {currentCategory}
                    <button onClick={() => updateParam('category', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {currentCollection && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#5E1224] text-white shadow-sm">
                    Collection: {collections.find((c) => c.slug === currentCollection)?.name || currentCollection}
                    <button onClick={() => updateParam('collection', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {currentSize && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#5E1224] text-white shadow-sm">
                    Size: {currentSize}
                    <button onClick={() => updateParam('size', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {currentColor && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#5E1224] text-white shadow-sm">
                    Color: {currentColor}
                    <button onClick={() => updateParam('color', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {activeUserMaxPrice !== null && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#5E1224] text-white shadow-sm">
                    Max: ₹{activeUserMaxPrice.toLocaleString('en-IN')}
                    <button onClick={() => updateParam('max_price', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                {inStockOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#5E1224] text-white shadow-sm">
                    In Stock Only
                    <button onClick={() => updateParam('in_stock', '')}><X className="w-3.5 h-3.5" /></button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-[#5E1224] hover:underline font-semibold ml-1"
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
                  <div key={i} className="aspect-[4/5] skeleton-shimmer rounded-none border border-[#E8DFD0]" />
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
              <div className="bg-white rounded-none border border-[#E8DFD0] py-16 px-4 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-[#FCF8F0] border border-[#E8DFD0] flex items-center justify-center mx-auto text-[#B58A3C]">
                  <Filter className="w-6 h-6" />
                </div>
                <h3 className="font-serif text-lg font-bold text-gray-900">No pieces found</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  No products matched your exact filter combination. Try clearing some active filters.
                </p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center px-6 py-2.5 rounded-none bg-[#5E1224] text-[#FCF8F0] text-xs font-ui font-semibold uppercase tracking-wider hover:bg-[#3A080F]"
                >
                  Reset All Filters
                </button>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ========================================================
          MOBILE FILTER BOTTOM SHEET (Point 13)
          ======================================================== */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden font-sans">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setMobileFilterOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 bg-[#FCF8F0] rounded-t-xl max-h-[85vh] overflow-y-auto p-6 space-y-6 shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out"
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
                      className="rounded-none border-gray-300 text-[#5E1224] focus:ring-[#B58A3C]"
                    />
                    <span>{catName}</span>
                  </div>
                  <span className="text-gray-400">({count})</span>
                </label>
              ))}
            </div>

            {/* Curated Collections */}
            {collections.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-gray-200">
                <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Curated Edits</h4>
                {collections.map((col) => (
                  <label key={col.slug} className="flex items-center justify-between text-xs text-gray-700 py-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={currentCollection === col.slug}
                        onChange={() => updateParam('collection', currentCollection === col.slug ? '' : col.slug)}
                        className="rounded-none border-gray-300 text-[#5E1224] focus:ring-[#B58A3C]"
                      />
                      <span>{col.name}</span>
                    </div>
                    <span className="text-gray-400">({col.product_count})</span>
                  </label>
                ))}
              </div>
            )}

            {/* Size */}
            {availableSizes.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-gray-200">
                <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Size</h4>
                <div className="grid grid-cols-4 gap-2">
                  {availableSizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => updateParam('size', currentSize === sz ? '' : sz)}
                      className={`h-10 rounded-none border text-xs font-semibold ${
                        currentSize === sz
                          ? 'bg-[#5E1224] text-white border-[#5E1224]'
                          : 'bg-white text-gray-700 border-[#E8DFD0]'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Colors */}
            {availableColours.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-gray-200">
                <h4 className="text-xs uppercase tracking-wider font-bold text-gray-800">Color Palette</h4>
                <div className="flex flex-wrap gap-2.5">
                  {availableColours.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => updateParam('color', currentColor === c.name ? '' : c.name)}
                      style={{ backgroundColor: c.hex }}
                      className={`w-8 h-8 rounded-full border ${
                        currentColor === c.name ? 'ring-2 ring-[#5E1224] ring-offset-2' : 'border-black/20'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Price Filter */}
            <div className="space-y-2 pt-3 border-t border-gray-200">
              <div className="flex justify-between items-center text-xs">
                <span className="uppercase tracking-wider font-bold text-gray-800">Max Price</span>
                <span className="font-bold text-[#5E1224]">
                  {activeUserMaxPrice !== null
                    ? `₹${sliderPrice.toLocaleString('en-IN')}`
                    : 'All Prices'}
                </span>
              </div>
              <input
                type="range"
                min={catalogMinPrice}
                max={catalogMaxPrice}
                step="250"
                value={sliderPrice}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSliderPrice(val);
                }}
                onMouseUp={() => updateParam('max_price', sliderPrice.toString())}
                onTouchEnd={() => updateParam('max_price', sliderPrice.toString())}
                onKeyUp={(e) => {
                  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                    updateParam('max_price', sliderPrice.toString());
                  }
                }}
                aria-label="Filter catalogue by maximum price"
                className="w-full accent-[#5E1224] cursor-pointer"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-[#E8DFD0] flex gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex-1 py-3 bg-white border border-[#E8DFD0] rounded-none text-xs font-semibold text-gray-800 hover:bg-gray-100"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-3 bg-[#5E1224] text-white rounded-none text-xs font-semibold uppercase tracking-wider shadow"
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
            className="fixed inset-x-0 bottom-0 bg-[#FCF8F0] rounded-t-xl p-6 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out"
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
                  className={`w-full p-3 rounded-none border text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                    currentSort === opt.value
                      ? 'bg-[#5E1224] text-white border-[#5E1224]'
                      : 'bg-white text-gray-800 border-[#E8DFD0]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {currentSort === opt.value && <Check className="w-4 h-4 text-[#B58A3C]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
