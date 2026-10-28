import React, { useEffect, useState } from 'react';
import {
  Plus,
  Edit2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Upload,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Check,
  Play,
} from 'lucide-react';
import {
  fetchAdminProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminAddVariant,
  adminUpdateVariant,
  adminUploadProductImage,
  adminDeleteProduct,
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
  const [newFit, setNewFit] = useState('Tailored Regular Fit');
  const [newStatus, setNewStatus] = useState<'PUBLISHED' | 'DRAFT' | 'ARCHIVED'>('PUBLISHED');
  const [initialPrice, setInitialPrice] = useState('2999');
  const [newMrp, setNewMrp] = useState('3999');

  // Variant Add State
  const [addingVariantForId, setAddingVariantForId] = useState<number | null>(null);
  const [newSize, setNewSize] = useState('XL');
  const [newVariantPrice, setNewVariantPrice] = useState('2999');
  const [newVariantStock, setNewVariantStock] = useState('10');

  // Inline editing state for variant
  const [editingVariantId, setEditingVariantId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');

  // Image Gallery State for Existing Products
  const [photosMap, setPhotosMap] = useState<Record<number, string[]>>({});
  const [photoUrlInput, setPhotoUrlInput] = useState<Record<number, string>>({});
  const [isSavingGallery, setIsSavingGallery] = useState<number | null>(null);
  const [uploadingTarget, setUploadingTarget] = useState<'new' | number | null>(null);

  // Image State for New Product Modal
  const [newImages, setNewImages] = useState<string[]>([]);
  const [newImageUrlInput, setNewImageUrlInput] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminProducts(token);
      setProducts(res);
      const initialMap: Record<number, string[]> = {};
      res.forEach((p) => {
        initialMap[p.id] = (p.images || []).map((img) => img.url);
      });
      setPhotosMap(initialMap);
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

  // Image Handlers: Upload via backend file storage, Add URL, Reorder, Remove
  const handleUploadFiles = async (files: FileList | null, target: 'new' | number) => {
    if (!files || files.length === 0) return;
    setActionError(null);
    setUploadingTarget(target);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|ogg|mkv)$/i.test(file.name);
        const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(file.name);
        if (!isVideo && !isImage) {
          throw new Error(`File ${file.name} is not an allowed format (JPEG, PNG, WebP, MP4, MOV, WebM).`);
        }
        if (isImage && file.size > 15 * 1024 * 1024) {
          throw new Error(`Photo ${file.name} exceeds 15MB limit.`);
        }
        if (isVideo && file.size > 60 * 1024 * 1024) {
          throw new Error(`Video ${file.name} exceeds 60MB limit.`);
        }
        const uploaded = await adminUploadProductImage(token, file);
        if (uploaded && uploaded.url) {
          if (target === 'new') {
            setNewImages((prev) => [...prev, uploaded.url]);
          } else {
            setPhotosMap((prev) => ({
              ...prev,
              [target]: [...(prev[target] || []), uploaded.url],
            }));
          }
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to upload media');
    } finally {
      setUploadingTarget(null);
    }
  };

  const handleAddUrl = (target: 'new' | number) => {
    setActionError(null);
    if (target === 'new') {
      const url = newImageUrlInput.trim();
      if (!url) return;
      if (url.startsWith('data:image/')) {
        setActionError('Base64 data strings cannot be stored in database. Please upload the image file directly.');
        return;
      }
      setNewImages((prev) => [...prev, url]);
      setNewImageUrlInput('');
    } else {
      const url = (photoUrlInput[target] || '').trim();
      if (!url) return;
      if (url.startsWith('data:image/')) {
        setActionError('Base64 data strings cannot be stored in database. Please upload the image file directly.');
        return;
      }
      setPhotosMap((prev) => ({
        ...prev,
        [target]: [...(prev[target] || []), url],
      }));
      setPhotoUrlInput((prev) => ({ ...prev, [target]: '' }));
    }
  };

  const handleReorder = (target: 'new' | number, fromIdx: number, toIdx: number) => {
    if (target === 'new') {
      setNewImages((prev) => {
        const copy = [...prev];
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, moved);
        return copy;
      });
    } else {
      setPhotosMap((prev) => {
        const current = prev[target] || [];
        const copy = [...current];
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, moved);
        return { ...prev, [target]: copy };
      });
    }
  };

  const handleRemoveImage = (target: 'new' | number, index: number) => {
    if (target === 'new') {
      setNewImages((prev) => prev.filter((_, idx) => idx !== index));
    } else {
      setPhotosMap((prev) => ({
        ...prev,
        [target]: (prev[target] || []).filter((_, idx) => idx !== index),
      }));
    }
  };

  const handleSaveGallery = async (productId: number) => {
    setIsSavingGallery(productId);
    setActionError(null);
    try {
      const urls = photosMap[productId] || [];
      if (urls.some((u) => u.startsWith('data:image/'))) {
        throw new Error('Base64 data URLs cannot be saved. Please remove them and upload images directly.');
      }
      const imagePayload = urls.map((url, idx) => ({
        url,
        sort_order: idx + 1,
      }));
      await adminUpdateProduct(token, productId, { images: imagePayload });
      await loadProducts();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save product photos');
    } finally {
      setIsSavingGallery(null);
    }
  };

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
    const mrpNum = parseFloat(newMrp) || priceNum + 1000;

    if (priceNum > mrpNum) {
      setActionError(`Selling price (₹${priceNum}) cannot exceed MRP (₹${mrpNum}).`);
      setActionLoading(false);
      return;
    }

    const payload = {
      name: newProductName.trim(),
      slug: slug,
      category: newCategory,
      fabric: newFabric,
      care: newCare,
      fit: newFit,
      status: newStatus,
      description: `Boutique luxury ${newCategory.toLowerCase()} handcrafted with fine artisanal details.`,
      is_active: newStatus === 'PUBLISHED',
      variants: [
        { size: 'S', selling_price: priceNum, mrp: mrpNum, stock: 8 },
        { size: 'M', selling_price: priceNum, mrp: mrpNum, stock: 12 },
        { size: 'L', selling_price: priceNum, mrp: mrpNum, stock: 6 },
      ],
      images: newImages.map((url, idx) => ({ url, sort_order: idx + 1 })),
    };

    try {
      await adminCreateProduct(token, payload);
      setShowAddModal(false);
      setNewProductName('');
      setNewProductSlug('');
      setNewImages([]);
      setNewImageUrlInput('');
      await loadProducts();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create product');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete product action
  const handleDeleteProduct = async (product: Product) => {
    if (!window.confirm(`Permanently remove product "${product.name}" from catalogue?`)) return;
    try {
      await adminDeleteProduct(token, product.id);
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete product');
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
          <span className="text-xs uppercase tracking-widest font-bold text-[#B58A3C]">
            Catalogue Management
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
            Products & Sizes
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-[#5E1224] hover:bg-[#4A0E1C] text-white font-semibold text-xs sm:text-sm uppercase tracking-wider rounded-lg shadow transition-colors flex items-center justify-center gap-2"
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
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500 font-serif">Loading catalogue products...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
          <p className="text-xs sm:text-sm text-red-800 font-semibold">{error}</p>
          <button
            onClick={loadProducts}
            className="px-4 py-2 bg-[#5E1224] text-white rounded text-xs font-semibold"
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
                        <div className="w-full h-full bg-[#5E1224] text-white text-[9px] flex items-center justify-center p-1 text-center font-serif">
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
                            product.status === 'PUBLISHED' || (!product.status && product.is_active)
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : product.status === 'DRAFT'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}
                        >
                          {product.status || (product.is_active ? 'PUBLISHED' : 'INACTIVE')}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{product.category || 'Apparel'}</span>
                        {product.fit && (
                          <>
                            <span>•</span>
                            <span className="text-[#B58A3C] font-medium">{product.fit}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{product.variants.length} sizes</span>
                        <span>•</span>
                        <span className="font-semibold text-[#5E1224]">
                          From {formatPrice(product.min_price)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(product);
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors border ${
                        product.is_active
                          ? 'border-gray-300 text-gray-600 hover:bg-gray-100'
                          : 'border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {product.is_active ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProduct(product);
                      }}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors"
                      title="Remove product from catalogue"
                    >
                      Delete
                    </button>

                    <span className="text-gray-400">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>
                </div>

                {/* Expanded Variants & Stock Editor */}
                {isExpanded && (
                  <div className="px-4 pb-5 sm:px-6 pt-2 border-t border-gray-100 bg-[#FCF8F0]/30 space-y-4">
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
                        className="text-xs font-semibold text-[#5E1224] hover:underline flex items-center gap-1"
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
                              <span className="w-8 h-8 rounded bg-[#FCF8F0] border border-[#E8DFD0] flex items-center justify-center font-bold text-xs text-gray-800">
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
                                    className="w-20 px-2 py-1 text-xs border rounded focus:outline-none focus:border-[#5E1224]"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-gray-500">Stock:</span>
                                  <input
                                    type="number"
                                    value={editStock}
                                    onChange={(e) => setEditStock(e.target.value)}
                                    className="w-16 px-2 py-1 text-xs border rounded focus:outline-none focus:border-[#5E1224]"
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleSaveVariantEdit(v.id)}
                                  disabled={actionLoading}
                                  className="px-2.5 py-1 bg-[#5E1224] text-white rounded text-xs font-semibold hover:bg-[#4A0E1C]"
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
                                  <div className="flex items-center border border-gray-300 rounded bg-[#FCF8F0]">
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
                                  className="p-1.5 text-gray-500 hover:text-[#5E1224] rounded hover:bg-gray-100"
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
                      <div className="p-4 bg-white rounded-lg border-2 border-[#5E1224] space-y-3 text-xs">
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
                              className="w-full px-2.5 py-1.5 border rounded focus:outline-none focus:border-[#5E1224]"
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
                              className="w-full px-2.5 py-1.5 border rounded focus:outline-none focus:border-[#5E1224]"
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
                              className="w-full px-2.5 py-1.5 border rounded focus:outline-none focus:border-[#5E1224]"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={actionLoading || !newSize.trim()}
                          onClick={() => handleAddVariant(product.id)}
                          className="w-full py-2 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-white font-semibold rounded shadow transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Save Size Variant</span>
                        </button>
                      </div>
                    )}

                    {/* Photos & Image Gallery Management (FIX 6) */}
                    <div className="p-4 bg-white rounded-lg border border-[#E8DFD0] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-[#B58A3C]" />
                          <span className="font-bold text-xs text-gray-800 uppercase tracking-wider">
                            Product Images ({photosMap[product.id]?.length || 0})
                          </span>
                        </div>

                        {photosMap[product.id] && (
                          <button
                            type="button"
                            disabled={isSavingGallery === product.id}
                            onClick={() => handleSaveGallery(product.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5E1224] hover:bg-[#4A0E1C] text-white text-xs font-semibold rounded shadow transition-colors disabled:opacity-50"
                          >
                            {isSavingGallery === product.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Save Image Order</span>
                          </button>
                        )}
                      </div>

                      {/* Photo Thumbnails with Reorder & Remove */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {(photosMap[product.id] || []).map((imgUrl, idx) => (
                          <div
                            key={idx}
                            className="relative group bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm flex flex-col"
                          >
                            <div className="aspect-[4/5] bg-gray-100 overflow-hidden relative">
                              {(() => {
                                const isVid = /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(imgUrl);
                                const pUrl = isVid ? imgUrl.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg') : imgUrl;
                                return (
                                  <>
                                    <img src={pUrl} alt={`Product ${idx + 1}`} className="w-full h-full object-cover" />
                                    {isVid && (
                                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                                          <Play className="w-3 h-3 fill-white ml-0.5" />
                                        </span>
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                              {idx === 0 && (
                                <span className="absolute top-1.5 left-1.5 bg-[#5E1224] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                                  Cover
                                </span>
                              )}
                              <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] px-1 rounded">
                                #{idx + 1}
                              </span>
                            </div>

                            <div className="p-1 bg-[#FCF8F0] border-t border-gray-200 flex items-center justify-between">
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleReorder(product.id, idx, idx - 1)}
                                  className="p-1 hover:bg-gray-200 disabled:opacity-20 text-gray-700 rounded text-xs"
                                  title="Move earlier"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === (photosMap[product.id]?.length || 0) - 1}
                                  onClick={() => handleReorder(product.id, idx, idx + 1)}
                                  className="p-1 hover:bg-gray-200 disabled:opacity-20 text-gray-700 rounded text-xs"
                                  title="Move later"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveImage(product.id, idx)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                title="Remove image"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Add Image Inputs */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                        <label className={`cursor-pointer inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-[#E8DFD0] hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-sm transition-colors ${
                          uploadingTarget === product.id ? 'opacity-60 cursor-not-allowed' : ''
                        }`}>
                          {uploadingTarget === product.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5E1224]" />
                          ) : (
                            <Upload className="w-3.5 h-3.5 text-[#B58A3C]" />
                          )}
                          <span>{uploadingTarget === product.id ? 'Uploading...' : 'Upload Photos'}</span>
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
                            disabled={uploadingTarget === product.id}
                            onChange={(e) => handleUploadFiles(e.target.files, product.id)}
                            className="hidden"
                          />
                        </label>

                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="url"
                            placeholder="Or paste photo URL (Cloudinary, Unsplash)"
                            value={photoUrlInput[product.id] || ''}
                            onChange={(e) =>
                              setPhotoUrlInput((prev) => ({ ...prev, [product.id]: e.target.value }))
                            }
                            className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224] bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddUrl(product.id)}
                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded text-xs font-semibold"
                          >
                            Add URL
                          </button>
                        </div>
                      </div>
                    </div>
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
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224] bg-white"
                  >
                    <option value="Festive Sets">Festive Sets</option>
                    <option value="Everyday Cotton">Everyday Cotton</option>
                    <option value="Co-ord Sets">Co-ord Sets</option>
                    <option value="Kurti Sets">Kurti Sets</option>
                    <option value="Anarkali">Anarkali</option>
                    <option value="Lehenga">Lehenga</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Selling Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={initialPrice}
                    onChange={(e) => setInitialPrice(e.target.value)}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    MRP (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={newMrp}
                    onChange={(e) => setNewMrp(e.target.value)}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Fabric
                  </label>
                  <input
                    type="text"
                    value={newFabric}
                    onChange={(e) => setNewFabric(e.target.value)}
                    placeholder="e.g. Pure Mulmul Cotton"
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Silhouette / Fit
                  </label>
                  <input
                    type="text"
                    value={newFit}
                    onChange={(e) => setNewFit(e.target.value)}
                    placeholder="e.g. Tailored Regular Fit"
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224] bg-white font-medium"
                  >
                    <option value="PUBLISHED">PUBLISHED (Visible)</option>
                    <option value="DRAFT">DRAFT (Hidden)</option>
                    <option value="ARCHIVED">ARCHIVED (Discontinued)</option>
                  </select>
                </div>
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
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Product Photos ({newImages.length})
                </label>
                <div className="flex items-center gap-2">
                  <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FCF8F0] border border-[#E8DFD0] hover:bg-gray-100 text-gray-700 rounded text-xs font-semibold shadow-sm transition-colors ${
                    uploadingTarget === 'new' ? 'opacity-60 cursor-not-allowed' : ''
                  }`}>
                    {uploadingTarget === 'new' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5E1224]" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-[#B58A3C]" />
                    )}
                    <span>{uploadingTarget === 'new' ? 'Uploading...' : 'Upload Photos'}</span>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
                      disabled={uploadingTarget === 'new'}
                      onChange={(e) => handleUploadFiles(e.target.files, 'new')}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="url"
                    placeholder="Or paste photo URL"
                    value={newImageUrlInput}
                    onChange={(e) => setNewImageUrlInput(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded focus:outline-none focus:border-[#5E1224]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddUrl('new')}
                    className="px-3 py-2 bg-gray-800 text-white rounded text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>

                {newImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-gray-100">
                    {newImages.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative bg-white rounded border border-gray-200 overflow-hidden flex flex-col"
                      >
                        <div className="aspect-[4/5] bg-gray-100 relative">
                          {(() => {
                            const isVid = /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(url);
                            const pUrl = isVid ? url.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg') : url;
                            return (
                              <>
                                <img src={pUrl} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                                {isVid && (
                                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                                      <Play className="w-3 h-3 fill-white ml-0.5" />
                                    </span>
                                  </span>
                                )}
                              </>
                            );
                          })()}
                          {idx === 0 && (
                            <span className="absolute top-1 left-1 bg-[#5E1224] text-white text-[8px] font-bold px-1 rounded">
                              Cover
                            </span>
                          )}
                        </div>
                        <div className="p-1 bg-gray-50 flex items-center justify-between">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleReorder('new', idx, idx - 1)}
                              className="p-0.5 hover:bg-gray-200 disabled:opacity-20 text-gray-700 rounded"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === newImages.length - 1}
                              onClick={() => handleReorder('new', idx, idx + 1)}
                              className="p-0.5 hover:bg-gray-200 disabled:opacity-20 text-gray-700 rounded"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage('new', idx)}
                            className="p-0.5 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-gray-500 bg-[#FCF8F0] p-2.5 rounded border border-[#E8DFD0]">
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
                  className="px-5 py-2 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-white font-semibold rounded shadow"
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
