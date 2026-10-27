import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { fetchAdminProducts, fetchCollections, formatPrice } from '../../lib/api';
import { Product, Collection } from '../../types/product';

interface CollectionWithProducts extends Collection {
  products: Product[];
}

export const AdminCollections: React.FC = () => {
  const [collections, setCollections] = useState<CollectionWithProducts[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [colls, prods] = await Promise.all([
        fetchCollections().catch(() => []),
        fetchAdminProducts(token).catch(() => []),
      ]);

      setAllProducts(prods);

      // Derive products per collection
      const mapped: CollectionWithProducts[] = colls.map((col) => {
        const matchingProducts = prods.filter((p) => {
          // Match by collections array if populated, or by category matching slug/name
          const hasCollectionMatch = p.collections?.includes(col.name);
          const hasCategoryMatch =
            (col.slug === 'festive-edit' && (p.category === 'Festive Sets' || p.category === 'Festive Wear')) ||
            (col.slug === 'everyday-cotton' && p.category === 'Everyday Cotton') ||
            (col.slug === 'kurti-sets' && p.category === 'Kurti Sets') ||
            (col.slug === 'coord-sets' && (p.category === 'Co-ord Sets' || p.category === 'Coord Sets'));

          return hasCollectionMatch || hasCategoryMatch;
        });

        return {
          ...col,
          product_count: matchingProducts.length,
          products: matchingProducts,
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

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
        <p className="text-xs text-gray-500 font-serif">Loading boutique collections...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8DFD0]">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-[#5E1224]" />
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Collections Management
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Curated boutique edits derived from live products ({allProducts.length} total designs)
          </p>
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

      {/* Collections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {collections.map((col) => (
          <div
            key={col.id}
            className="bg-white rounded-2xl border border-[#E8DFD0] shadow-sm p-5 sm:p-6 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-lg sm:text-xl font-bold text-gray-900">
                    {col.name}
                  </h2>
                  <span className="text-[11px] font-mono text-gray-400 block mt-0.5">
                    slug: /{col.slug}
                  </span>
                </div>
                <span className="px-2.5 py-1 bg-[#FCF8F0] border border-[#E8DFD0] text-[#5E1224] font-bold text-xs rounded-full">
                  {col.products.length} {col.products.length === 1 ? 'Product' : 'Products'}
                </span>
              </div>

              {col.description && (
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  {col.description}
                </p>
              )}

              {/* Sample Products List in Collection */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-2">
                  Designs in this edit
                </span>
                {col.products.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No products currently assigned.</p>
                ) : (
                  <div className="space-y-2">
                    {col.products.slice(0, 4).map((p) => {
                      const cover = p.images?.[0]?.url;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-[#FCF8F0] transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-9 rounded bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                              {cover ? (
                                <img src={cover} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-[#5E1224] text-white text-[7px] flex items-center justify-center font-serif">
                                  RL
                                </div>
                              )}
                            </div>
                            <span className="font-medium text-gray-800 truncate">{p.name}</span>
                          </div>
                          <span className="text-gray-500 font-semibold shrink-0 ml-2">
                            {formatPrice(p.min_price || 0)}
                          </span>
                        </div>
                      );
                    })}
                    {col.products.length > 4 && (
                      <p className="text-[11px] text-gray-400 pl-2">
                        +{col.products.length - 4} more designs
                      </p>
                    )}
                  </div>
                )}
              </div>
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
        ))}
      </div>
    </div>
  );
};
