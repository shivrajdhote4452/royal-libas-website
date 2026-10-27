import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, X, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { Product } from '../types/product';
import { fetchProducts, formatPrice } from '../lib/api';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const POPULAR_SEARCHES = ['Chanderi', 'Co-ord Sets', 'Anarkali', 'Silk Kurti', 'Mulmul', 'Festive'];
const RECENT_SEARCHES_KEY = 'royal_libas_recent_searches';

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [results, setResults] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Pre-load products when search is opened
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 100);
      if (allProducts.length === 0) {
        fetchProducts({})
          .then(setAllProducts)
          .catch(() => {});
      }
    } else {
      document.body.style.overflow = '';
      setQuery('');
      setResults([]);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Debounced live searching (300ms)
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const clean = query.trim().toLowerCase();
      const matched = allProducts.filter((p) => {
        const text = `${p.name} ${p.fabric || ''} ${p.category || ''} ${p.description || ''}`.toLowerCase();
        return text.includes(clean);
      });
      setResults(matched);
      setIsLoading(false);
    }, 280);

    return () => clearTimeout(timer);
  }, [query, allProducts]);

  const handleSelectRecent = (term: string) => {
    setQuery(term);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Save to recent searches
    const term = query.trim();
    const updated = [term, ...recentSearches.filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, 5);
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {}

    onClose();
    navigate(`/shop?search=${encodeURIComponent(term)}`);
  };

  const clearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex flex-col justify-start">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Search Header and Panel */}
      <div
        className="relative w-full bg-[#FAF7F2] border-b border-[#E8DFD0] shadow-2xl z-10 font-sans max-h-[85vh] flex flex-col animate-in fade-in slide-in-from-top-4 duration-250 ease-out"
        style={{
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-4">
          {/* Input Bar */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="w-5 h-5 text-[#5B111A] absolute left-3.5 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search handcrafted festive sets, co-ords, chanderi silks..."
              className="w-full pl-11 pr-20 py-3.5 bg-white border border-[#E8DFD0] rounded-xl text-sm sm:text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#5B111A] focus:ring-1 focus:ring-[#5B111A] shadow-sm transition-all"
            />
            <div className="absolute right-3 flex items-center gap-1.5">
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  title="Clear input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-semibold px-2.5 py-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200/50"
              >
                ESC
              </button>
            </div>
          </form>

          {/* Quick Tags (when query is empty) */}
          {!query && (
            <div className="pt-4 pb-2 space-y-4">
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mb-2">
                    <span>Recent Searches</span>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-[11px] text-gray-400 hover:text-red-600"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => handleSelectRecent(term)}
                        className="px-3 py-1 rounded-full text-xs bg-white border border-[#E8DFD0] text-gray-700 hover:border-[#5B111A] hover:text-[#5B111A] transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#C59B27]" />
                  <span>Popular Suggestions</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SEARCHES.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="px-3 py-1 rounded-full text-xs bg-white border border-[#E8DFD0] text-gray-700 hover:border-[#C59B27] hover:text-[#5B111A] transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading Skeleton State */}
          {isLoading && query && (
            <div className="py-6 space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5B111A]" />
                <span>Searching catalogue styles...</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="p-3 bg-white rounded-lg border border-[#E8DFD0] flex gap-3 animate-pulse"
                  >
                    <div className="w-14 h-18 bg-gray-200 rounded" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                      <div className="h-3.5 bg-gray-200 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Search Results */}
          {!isLoading && query && results.length > 0 && (
            <div className="py-4 space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-semibold">
                <span>
                  Found {results.length} {results.length === 1 ? 'style' : 'styles'}
                </span>
                <button
                  type="button"
                  onClick={handleSearchSubmit}
                  className="text-[#5B111A] hover:underline flex items-center gap-1 font-bold"
                >
                  <span>View all in Shop</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.slice(0, 6).map((product) => {
                  const thumb =
                    product.primary_image ||
                    (product.images && product.images.length > 0 ? product.images[0].url : null);
                  const price =
                    product.min_price ||
                    (product.variants && product.variants.length > 0
                      ? product.variants[0].selling_price
                      : 0);

                  return (
                    <Link
                      key={product.id}
                      to={`/product/${product.slug}`}
                      onClick={onClose}
                      className="group p-3 bg-white rounded-lg border border-[#E8DFD0] hover:border-[#5B111A] hover:shadow-sm flex gap-3 items-center transition-all"
                    >
                      <div className="w-14 h-18 bg-gray-100 rounded overflow-hidden shrink-0 border border-gray-100">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-[#5B111A] text-white flex items-center justify-center text-[10px] font-serif">
                            RL
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase font-semibold text-[#C59B27] truncate">
                          {product.category || product.fabric || 'Boutique'}
                        </div>
                        <h4 className="font-serif text-sm font-semibold text-gray-900 group-hover:text-[#5B111A] line-clamp-1 transition-colors">
                          {product.name}
                        </h4>
                        <div className="text-xs font-bold text-[#5B111A] mt-1 price-display">
                          {formatPrice(price)}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* No Results Empty State (Point 8) */}
          {!isLoading && query && results.length === 0 && (
            <div className="py-8 text-center space-y-3">
              <p className="font-serif text-base font-bold text-gray-900">
                No styles found for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Try searching by fabric like &ldquo;Chanderi&rdquo; or explore our signature collections:
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {['Kurti Sets', 'Co-ord Sets', 'Festive Wear', 'Everyday Cotton'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(`/shop?category=${encodeURIComponent(cat)}`);
                    }}
                    className="px-3 py-1 rounded-full text-xs bg-white border border-[#E8DFD0] text-[#5B111A] hover:bg-[#5B111A] hover:text-white transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
