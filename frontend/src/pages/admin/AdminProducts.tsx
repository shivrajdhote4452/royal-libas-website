import React, { useEffect, useState } from 'react';
import {
  Plus,
  Edit2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import {
  fetchAdminProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminAddVariant,
  adminUpdateVariant,
  formatPrice,
} from '../../lib/api';
import { Product, ProductVariant } from '../../types/product';

export const AdminProducts: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);

  // Add Product Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSlug, setNewProductSlug] = useState('');
  const [newCategory, setNewCategory] = useState('Festive Sets');
  const [newFabric, setNewFabric] = useState('Pure Chanderi Silk');
  const [newCare, setNewCare] = useState('Dry clean only');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [initialPrice, setInitialPrice] = useState('2999');

  // Variant Add State
  const [addingVariantForId, setAddingVariantForId] = useState<number | null>(null);
  const [newSize, setNewSize] = useState('XL');
  const [newVariantPrice, setNewVariantPrice] = useState('2999');
  const [newVariantStock, setNewVariantStock] = useState('10');

  // Inline editing state for variant
  const [editingVariantId, setEditingVariantId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminProducts(token);
      setProducts(res);
      if (res.length > 0 && expandedProductId === null) {
        setExpandedProductId(res[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [token]);

  // Handle Create Product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionLoading(true);

    const slug =
      newProductSlug.trim() ||
      newProductName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const priceNum = parseFloat(initialPrice) || 2999;

    const payload = {
      name: newProductName.trim(),
      slug: slug,
      category: newCategory,
      fabric: newFabric,
      care: newCare,
      description: `Boutique luxury ${newCategory.toLowerCase()} handcrafted with fine artisanal details.`,
      is_active: true,
      variants: [
        { size: 'S', selling_price: priceNum, mrp: priceNum + 1000, stock: 8 },
        { size: 'M', selling_price: priceNum, mrp: priceNum + 1000, stock: 12 },
        { size: 'L', selling_price: priceNum, mrp: priceNum + 1000, stock: 6 },
      ],
      images: newImageUrl.trim() ? [{ url: newImageUrl.trim(), sort_order: 1 }] : [],
    };

    try {
      await adminCreateProduct(token, payload);
      setShowAddModal(false);
      setNewProductName('');
      setNewProductSlug('');
      setNewImageUrl('');
      await loadProducts();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create product');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (product: Product) => {
    try {
      const updated = await adminUpdateProduct(token, product.id, {
        is_active: !product.is_active,
      });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: updated.is_active } : p))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to update product status');
    }
  };

  // Quick Stock / Price Update
  const handleSaveVariantEdit = async (variantId: number) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const priceNum = parseFloat(editPrice);
      const stockNum = parseInt(editStock, 10);

      await adminUpdateVariant(token, variantId, {
        selling_price: isNaN(priceNum) ? undefined : priceNum,
        stock: isNaN(stockNum) ? undefined : stockNum,
      });

      setEditingVariantId(null);
      await loadProducts();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update variant');
    } finally {
      setActionLoading(false);
    }
  };

  // Quick +/- Stock
  const handleAdjustStock = async (v: ProductVariant, delta: number) => {
    const nextStock = Math.max(0, v.stock + delta);
    try {
      await adminUpdateVariant(token, v.id, { stock: nextStock });
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust stock');
    }
  };

  // Add Size Variant
  const handleAddVariant = async (productId: number) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await adminAddVariant(token, productId, {
        size: newSize.trim().toUpperCase(),
        selling_price: parseFloat(newVariantPrice) || 2999,
        mrp: (parseFloat(newVariantPrice) || 2999) + 1000,
        stock: parseInt(newVariantStock, 10) || 5,
      });
      setAddingVariantForId(null);
      await loadProducts();
    } catch (err: any) {
      setActionError(err.message || 'Failed to add size variant');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-widest font-bold text-[#C59B27]">
            Catalogue Management
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
            Products & Sizes
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-[#5B111A] hover:bg-[#3A080F] text-white font-semibold text-xs sm:text-sm uppercase tracking-wider rounded-lg shadow transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#5B111A] animate-spin" />
          <p className="text-xs text-gray-500 font-serif">Loading catalogue products...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
          <p className="text-xs sm:text-sm text-red-800 font-semibold">{error}</p>
          <button
            onClick={loadProducts}
            className="px-4 py-2 bg-[#5B111A] text-white rounded text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product) => {
            const isExpanded = expandedProductId === product.id;
            const primaryImg = product.primary_image || product.images?.[0]?.url;

            return (
              <div
                key={product.id}
                className="bg-white rounded-xl border border-[#E8DFD0] shadow-sm overflow-hidden"
              >
                {/* Product Header Row */}
                <div
                  onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-14 rounded bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                      {primaryImg ? (
                        <img src={primaryImg} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#5B111A] text-white text-[9px] flex items-center justify-center p-1 text-center font-serif">
                          RL
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-serif font-bold text-sm sm:text-base text-gray-900">
                          {product.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            product.is_active
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}
                        >
                          {product.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
                        <span>{product.category || 'Apparel'}</span>
                        <span>•</span>
                        <span>{product.variants.length} sizes</span>
                        <span>•</span>
                        <span className="font-semibold text-[#5B111A]">
                          From {formatPrice(product.min_price)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(product);
                      }}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors border ${
                        product.is_active
                          ? 'border-gray-300 text-gray-600 hover:bg-gray-100'
                          : 'border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {product.is_active ? 'Deactivate' : 'Activate'}
                    </button>

                    <span className="text-gray-400">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>
                </div>

                {/* Expanded Variants & Stock Editor */}
                {isExpanded && (
                  <div className="px-4 pb-5 sm:px-6 pt-2 border-t border-gray-100 bg-[#FAF7F2]/30 space-y-4">
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-bold text-xs text-gray-800 uppercase tracking-wider">
                        Size Variants & Live Stock ({product.variants.length})
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setAddingVariantForId(product.id);
                          setNewVariantPrice(String(product.min_price || 2999));
                        }}
                        className="text-xs font-semibold text-[#5B111A] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Size</span>
                      </button>
                    </div>

                    {/* Variants Table */}
                    <div className="bg-white rounded-lg border border-[#E8DFD0] divide-y divide-gray-100 text-xs">
                      {product.variants.map((v) => {
                        const isEditingThis = editingVariantId === v.id;

                        return (
                          <div
                            key={v.id}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded bg-[#FAF7F2] border border-[#E8DFD0] flex items-center justify-center font-bold text-xs text-gray-800">
                                {v.size}
                              </span>
                              <div>
                                <div className="font-semibold text-gray-900">
                                  Price: {formatPrice(v.selling_price)}
                                </div>
                                <span className="text-[11px] text-gray-400">
                                  MRP: {formatPrice(v.mrp)}
                                </span>
                              </div>
                            </div>

                            {/* Direct Inline Edit Form */}
                            {isEditingThis ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-gray-500">Price:</span>
                                  <input
                                    type="number"
                                    value={editPrice}
                                    onChange={(e) => setEditPrice(e.target.value)}
                                    className="w-20 px-2 py-1 text-xs border rounded focus:outline-none focus:border-[#5B111A]"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-gray-500">Stock:</span>
                                  <input
                                    type="number"
                                    value={editStock}
                                    onChange={(e) => setEditStock(e.target.value)}
                                    className="w-16 px-2 py-1 text-xs border rounded focus:outline-none focus:border-[#5B111A]"
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleSaveVariantEdit(v.id)}
                                  disabled={actionLoading}
                                  className="px-2.5 py-1 bg-[#5B111A] text-white rounded text-xs font-semibold hover:bg-[#3A080F]"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingVariantId(null)}
                                  className="px-2 py-1 text-gray-500 hover:text-gray-800 text-xs"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between sm:justify-end gap-4">
                                {/* Stock Counter with +/- */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-gray-500">Stock:</span>
                                  <div className="flex items-center border border-gray-300 rounded bg-[#FAF7F2]">
                                    <button
                                      type="button"
                                      onClick={() => handleAdjustStock(v, -1)}
                                      disabled={v.stock <= 0}
                                      className="px-2 py-0.5 hover:bg-gray-200 text-gray-700 font-bold disabled:opacity-40"
                                      title="Decrease stock by 1"
                                    >
                                      -
                                    </button>
                                    <span
                                      className={`px-2 text-xs font-bold ${
                                        v.stock === 0
                                          ? 'text-red-600'
                                          : v.stock <= 5
                                          ? 'text-amber-700'
                                          : 'text-gray-900'
                                      }`}
                                    >
                                      {v.stock}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleAdjustStock(v, 1)}
                                      className="px-2 py-0.5 hover:bg-gray-200 text-gray-700 font-bold"
                                      title="Increase stock by 1"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingVariantId(v.id);
                                    setEditPrice(String(v.selling_price));
                                    setEditStock(String(v.stock));
                                  }}
                                  className="p-1.5 text-gray-500 hover:text-[#5B111A] rounded hover:bg-gray-100"
                                  title="Edit price or stock directly"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Add Variant Form Drawer */}
                    {addingVariantForId === product.id && (
                      <div className="p-4 bg-white rounded-lg border-2 border-[#5B111A] space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">
                            Add New Size Variant to {product.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setAddingVariantForId(null)}
                            className="text-gray-400 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                              Size
                            </label>
                            <input
                              type="text"
                              value={newSize}
                              onChange={(e) => setNewSize(e.target.value.toUpperCase())}
                              placeholder="XL, XXL, Free Size"
                              className="w-full px-2.5 py-1.5 border rounded focus:outline-none focus:border-[#5B111A]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                              Price (Rs.)
                            </label>
                            <input
                              type="number"
                              value={newVariantPrice}
                              onChange={(e) => setNewVariantPrice(e.target.value)}
                              className="w-full px-2.5 py-1.5 border rounded focus:outline-none focus:border-[#5B111A]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                              Initial Stock
                            </label>
                            <input
                              type="number"
                              value={newVariantStock}
                              onChange={(e) => setNewVariantStock(e.target.value)}
                              className="w-full px-2.5 py-1.5 border rounded focus:outline-none focus:border-[#5B111A]"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={actionLoading || !newSize.trim()}
                          onClick={() => handleAddVariant(product.id)}
                          className="w-full py-2 bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-400 text-white font-semibold rounded shadow transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Save Size Variant</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#E8DFD0] shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="font-serif font-bold text-lg text-gray-900">
                Add New Boutique Product
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-700 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Royal Indigo Silk Anarkali Set"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5B111A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5B111A] bg-white"
                  >
                    <option value="Festive Sets">Festive Sets</option>
                    <option value="Everyday Cotton">Everyday Cotton</option>
                    <option value="Co-ord Sets">Co-ord Sets</option>
                    <option value="Kurti Sets">Kurti Sets</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Selling Price (Rs.) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={initialPrice}
                    onChange={(e) => setInitialPrice(e.target.value)}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5B111A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Fabric
                  </label>
                  <input
                    type="text"
                    value={newFabric}
                    onChange={(e) => setNewFabric(e.target.value)}
                    placeholder="e.g. Pure Mulmul Cotton"
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5B111A]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Wash Care
                  </label>
                  <input
                    type="text"
                    value={newCare}
                    onChange={(e) => setNewCare(e.target.value)}
                    placeholder="Dry clean only"
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5B111A]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Photo URL
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/... or Cloudinary URL"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5B111A]"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Leave empty to use elegant Royal Libas placeholder monogram.
                </p>
              </div>

              <p className="text-[11px] text-gray-500 bg-[#FAF7F2] p-2.5 rounded border border-[#E8DFD0]">
                Initial stock for sizes <strong>S</strong> (8 units), <strong>M</strong> (12 units), and <strong>L</strong> (6 units) will be created automatically. You can add extra sizes anytime.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !newProductName.trim()}
                  className="px-5 py-2 bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-400 text-white font-semibold rounded shadow"
                >
                  {actionLoading ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
