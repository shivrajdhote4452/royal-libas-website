import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  CheckCircle,
  Folder,
  Edit3,
  Loader2,
  LayoutGrid,
  List,
  AlertCircle,
} from 'lucide-react';
import {
  fetchAdminProducts,
  adminCreateProduct,
  adminDeleteProduct,
} from '../../lib/api';
import {
  Product,
  CATEGORY_GROUPS,
} from '../../types/product';

export { CATEGORY_GROUPS };

export const AdminProducts: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';

  // Products Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layout View Mode (Grid Photo Cards vs List Table)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filter & Search State
  type ProductStatusTab = 'working' | 'all' | 'published' | 'draft' | 'archived';
  const [statusFilter, setStatusFilter] = useState<ProductStatusTab>('working');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Quick Action / Notification State
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add Product Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSlug, setNewProductSlug] = useState('');
  const [newCategory, setNewCategory] = useState('TWO PIECES');
  const [newSubcategory, setNewSubcategory] = useState('Co-ord Sets');
  const [newFabric, setNewFabric] = useState('Pure Chanderi Silk');
  const [newStatus, setNewStatus] = useState<'PUBLISHED' | 'DRAFT' | 'ARCHIVED'>('DRAFT');
  const [newDescription, setNewDescription] = useState('');
  const [initialPrice, setInitialPrice] = useState('2999');
  const [newSizeStock, setNewSizeStock] = useState<Record<string, { enabled: boolean; stock: string; price: string }>>({
    XS: { enabled: false, stock: '0', price: '' },
    S: { enabled: true, stock: '5', price: '' },
    M: { enabled: true, stock: '5', price: '' },
    L: { enabled: true, stock: '5', price: '' },
    XL: { enabled: false, stock: '0', price: '' },
    XXL: { enabled: false, stock: '0', price: '' },
    'Free Size': { enabled: false, stock: '0', price: '' },
  });

  // Delete Confirmation State
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  // Fetch Products
  const loadProducts = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminProducts(token);
      setProducts(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [token]);

  // Tab Counts (Live Computed)
  const counts = useMemo(() => {
    const working = products.filter((p) => p.status !== 'ARCHIVED').length;
    const published = products.filter((p) => p.status === 'PUBLISHED' || (!p.status && p.is_active)).length;
    const draft = products.filter((p) => p.status === 'DRAFT' || (!p.is_active && p.status !== 'ARCHIVED')).length;
    const archived = products.filter((p) => p.status === 'ARCHIVED').length;
    return { working, all: products.length, published, draft, archived };
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // 1. Status Filter
      if (statusFilter === 'working' && p.status === 'ARCHIVED') return false;
      if (statusFilter === 'published' && !(p.status === 'PUBLISHED' || (!p.status && p.is_active))) return false;
      if (statusFilter === 'draft' && !(p.status === 'DRAFT' || (!p.is_active && p.status !== 'ARCHIVED'))) return false;
      if (statusFilter === 'archived' && p.status !== 'ARCHIVED') return false;

      // 2. Category Filter
      if (categoryFilter !== 'ALL') {
        const catUpper = p.category?.toUpperCase() || '';
        const subcatUpper = p.subcategory?.toUpperCase() || '';
        const filterUpper = categoryFilter.toUpperCase();
        if (catUpper !== filterUpper && subcatUpper !== filterUpper) return false;
      }

      // 3. Search Query (Name, SKU, Category, Subcategory)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchCat = p.category?.toLowerCase().includes(q);
        const matchSub = p.subcategory?.toLowerCase().includes(q);
        const matchSku = p.variants?.some((v) => v.sku?.toLowerCase().includes(q));
        if (!matchName && !matchCat && !matchSub && !matchSku) return false;
      }

      return true;
    });
  }, [products, statusFilter, categoryFilter, searchQuery]);

  // Handle New Product Creation
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setActionLoading(true);
    setActionError(null);

    const generatedSlug =
      newProductSlug.trim() ||
      newProductName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

    const variantsPayload = Object.entries(newSizeStock)
      .filter(([_, data]) => data.enabled)
      .map(([size, data]) => {
        const sprice = parseFloat(data.price || initialPrice) || 2999;
        const sizeCode = size === 'Free Size' ? 'FS' : size.replace(/\s+/g, '').toUpperCase();
        return {
          size,
          colour: null,
          sku: `${generatedSlug.slice(0, 10).toUpperCase()}-${sizeCode}`,
          selling_price: sprice,
          mrp: null,
          stock: parseInt(data.stock, 10) || 0,
          is_active: true,
        };
      });

    if (variantsPayload.length === 0) {
      setActionError('At least one size must be enabled with stock.');
      setActionLoading(false);
      return;
    }

    const payload = {
      name: newProductName.trim(),
      slug: generatedSlug,
      description: newDescription.trim() || null,
      fabric: newFabric.trim() || null,
      care: 'Dry clean only',
      fit: 'Tailored Regular Fit',
      category: newCategory,
      subcategory: newSubcategory,
      status: newStatus,
      is_active: newStatus === 'PUBLISHED',
      is_bestseller: false,
      images: [],
      variants: variantsPayload,
    };

    try {
      const created = await adminCreateProduct(token, payload);
      setProducts((prev) => [created, ...prev]);
      setShowAddModal(false);
      // Reset form
      setNewProductName('');
      setNewProductSlug('');
      setNewDescription('');
      setToastMessage(`Product "${created.name}" created successfully!`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to create product');
    } finally {
      setActionLoading(false);
    }
  };



  // Handle Delete Product
  const handleDeleteProductConfirm = async () => {
    if (!deletingProduct || !token) return;
    setActionLoading(true);
    try {
      await adminDeleteProduct(token, deletingProduct.id);
      setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id));
      setDeletingProduct(null);
      setToastMessage('Product deleted successfully');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete product');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ========================================================
          1. HEADER & ACTIONS (Visual 1)
          ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-bold text-gray-900 text-[#5E1224]">
            Products & Sizes
          </h1>
          <p className="text-xs text-gray-500 font-sans mt-0.5">
            Manage your boutique catalogue, sizes, live stock, and pricing.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#5E1224] hover:bg-[#4A0E1C] text-white text-xs font-semibold rounded-lg shadow-sm transition-all hover:scale-[1.01] shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-[#E6C687]" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* ========================================================
          2. STATUS FILTER TABS (Visual 1)
          ======================================================== */}
      <div className="border-b border-[#E8DFD0] overflow-x-auto pb-px custom-scrollbar">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-max">
          <button
            onClick={() => setStatusFilter('working')}
            className={`py-2 px-2.5 sm:px-3 text-xs font-bold transition-all relative ${
              statusFilter === 'working'
                ? 'text-[#5E1224] border-b-2 border-[#5E1224] bg-amber-50/30'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>Working Catalogue</span>
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-700">
              {counts.working}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('published')}
            className={`py-2 px-2.5 sm:px-3 text-xs font-bold transition-all relative ${
              statusFilter === 'published'
                ? 'text-emerald-800 border-b-2 border-emerald-700 bg-emerald-50/30'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>Published</span>
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              {counts.published}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('draft')}
            className={`py-2 px-2.5 sm:px-3 text-xs font-bold transition-all relative ${
              statusFilter === 'draft'
                ? 'text-amber-800 border-b-2 border-amber-600 bg-amber-50/40'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>Draft Setup</span>
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-800 font-semibold">
              {counts.draft}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('archived')}
            className={`py-2 px-2.5 sm:px-3 text-xs font-bold transition-all relative ${
              statusFilter === 'archived'
                ? 'text-gray-800 border-b-2 border-gray-700 bg-gray-100'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>Archived Legacy</span>
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-200 text-gray-700 font-semibold">
              {counts.archived}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('all')}
            className={`py-2 px-2.5 sm:px-3 text-xs font-bold transition-all relative ${
              statusFilter === 'all'
                ? 'text-[#5E1224] border-b-2 border-[#5E1224] bg-amber-50/30'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>All Designs</span>
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-700">
              {counts.all}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================
          3. SEARCH, CATEGORY FILTER & VIEW TOGGLE (Visual 1)
          ======================================================== */}
      <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-[#E8DFD0] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by product name, SKU or design no."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#5E1224] focus:border-transparent bg-gray-50/50"
          />
        </div>

        {/* Category Filter Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-[160px]">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full pl-3 pr-7 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#5E1224] bg-gray-50/50 cursor-pointer text-gray-700 appearance-none"
            >
              <option value="ALL">All Categories</option>
              {Object.keys(CATEGORY_GROUPS).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option disabled>──────────</option>
              {Object.entries(CATEGORY_GROUPS).flatMap(([_, subcats]) =>
                subcats.map((sub) => (
                  <option key={sub} value={sub}>
                    • {sub}
                  </option>
                ))
              )}
            </select>
            <Filter className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Reset Filters */}
          {(searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'working') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('ALL');
                setStatusFilter('working');
              }}
              className="px-2 py-1 text-gray-500 hover:text-gray-900 underline text-xs whitespace-nowrap"
            >
              Reset
            </button>
          )}

          {/* View Mode Toggle (Grid Cards vs List Table) */}
          <div className="flex items-center rounded-lg border border-gray-300 bg-gray-100 p-0.5 shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-[#5E1224] shadow-xs font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
              title="Photo Cards Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-[#5E1224] shadow-xs font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
              title="Compact List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          4. PRODUCT CATALOGUE CONTENT
          ======================================================== */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500 font-serif">Loading boutique designs...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3 max-w-lg mx-auto">
          <AlertCircle className="w-7 h-7 text-red-700 mx-auto" />
          <p className="text-sm text-red-800 font-semibold">{error}</p>
          <button
            onClick={loadProducts}
            className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold shadow hover:bg-[#4A0E1C]"
          >
            Retry Loading
          </button>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E8DFD0] p-10 text-center text-gray-400 text-xs space-y-2">
          <div className="w-10 h-10 rounded-full bg-amber-50 text-[#B58A3C] flex items-center justify-center mx-auto mb-2">
            <Search className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-gray-700">No designs found matching the selected filter criteria.</p>
          <p className="text-gray-400">Try adjusting your search keywords, category filter, or status tab.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* ------------------------------------------------------
           PHOTO CARDS GRID VIEW (Compact & Responsive)
           ------------------------------------------------------ */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-3.5 lg:gap-4">
          {filteredProducts.map((product) => {
            const primaryImg = product.primary_image || product.images?.[0]?.url;
            const totalStock = product.total_stock ?? product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
            const sizeCount = product.variants.length;
            const status = product.status || (product.is_active ? 'PUBLISHED' : 'DRAFT');

            return (
              <div
                key={product.id}
                className="bg-white rounded-xl border border-[#E8DFD0] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group bg-gradient-to-b from-white to-[#FAF6F0]/20 max-w-[300px] sm:max-w-none w-full mx-auto"
              >
                {/* Product Cover Photo Card */}
                <div className="relative aspect-[4/3] sm:aspect-[4/5] w-full overflow-hidden bg-gray-100 border-b border-[#E8DFD0]/60">
                  {primaryImg ? (
                    <img
                      src={primaryImg}
                      alt={product.name}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500 ease-out"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-[#FAF6F0] text-center">
                      <div className="w-10 h-10 rounded-full bg-[#5E1224]/10 text-[#5E1224] flex items-center justify-center font-serif text-base font-bold mb-1 border border-[#B58A3C]/30">
                        RL
                      </div>
                      <span className="text-[10px] text-gray-400 font-serif">No photo uploaded</span>
                    </div>
                  )}

                  {/* Bestseller Badge */}
                  {product.is_bestseller && (
                    <span className="absolute top-2 right-2 bg-[#5E1224] text-[#E6C687] text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow border border-[#B58A3C]/40">
                      Bestseller
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    {/* Product Name */}
                    <h3 className="font-serif font-bold text-xs sm:text-sm text-gray-900 group-hover:text-[#5E1224] transition-colors line-clamp-1 mb-0.5" title={product.name}>
                      {product.name}
                    </h3>

                    {/* Category / Subcategory */}
                    <div className="flex items-center gap-1 text-[11px] text-gray-500 mb-1.5">
                      <Folder className="w-3 h-3 text-[#B58A3C] shrink-0" />
                      <span className="truncate">{product.subcategory || product.category || 'Atelier Design'}</span>
                    </div>

                    {/* Status Pill with dot */}
                    <div className="flex items-center">
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          status === 'PUBLISHED'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : status === 'DRAFT'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            status === 'PUBLISHED'
                              ? 'bg-emerald-600'
                              : status === 'DRAFT'
                              ? 'bg-amber-600'
                              : 'bg-gray-400'
                          }`}
                        />
                        {status === 'PUBLISHED' ? 'Published' : status === 'DRAFT' ? 'Draft' : 'Archived'}
                      </span>
                    </div>
                  </div>

                  {/* Stats Row: Sizes & Total Stock */}
                  <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-gray-400 block">Sizes</span>
                      <span className="font-serif font-bold text-gray-900 text-xs">{sizeCount}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-bold text-gray-400 block">Total Stock</span>
                      <span
                        className={`font-serif font-bold text-xs ${
                          totalStock === 0 ? 'text-red-700' : totalStock < 10 ? 'text-amber-700' : 'text-gray-900'
                        }`}
                      >
                        {totalStock}
                      </span>
                    </div>
                  </div>

                  {/* Manage Product Button (Navigates to Dedicated Edit Page) */}
                  <Link
                    to={`/admin/products/${product.id}`}
                    className="w-full mt-1.5 py-1.5 px-2 border border-[#5E1224]/30 hover:border-[#5E1224] bg-white hover:bg-[#5E1224] text-[#5E1224] hover:text-white rounded-lg text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-1.5 group-hover:border-[#5E1224]"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Manage Product</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ------------------------------------------------------
           COMPACT LIST VIEW (Alternative Density)
           ------------------------------------------------------ */
        <div className="bg-white rounded-xl border border-[#E8DFD0] overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF6F0] text-gray-700 uppercase tracking-wider text-[10px] font-bold border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-3">Design</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-center">Sizes</th>
                <th className="py-2.5 px-3 text-center">Stock</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((product) => {
                const primaryImg = product.primary_image || product.images?.[0]?.url;
                const totalStock = product.total_stock ?? product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                const status = product.status || (product.is_active ? 'PUBLISHED' : 'DRAFT');

                return (
                  <tr key={product.id} className="hover:bg-amber-50/20 transition-colors">
                    {/* Design Photo & Name */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-11 rounded bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                          {primaryImg ? (
                            <img src={primaryImg} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-[#5E1224] text-white text-[8px] flex items-center justify-center font-serif">
                              RL
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-serif font-bold text-gray-900 text-xs sm:text-sm">{product.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">ID: #{product.id}</p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-2 px-3 text-gray-600">
                      <span className="font-semibold text-gray-800 text-xs">{product.category}</span>
                      {product.subcategory && (
                        <span className="block text-[10px] text-gray-500">{product.subcategory}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          status === 'PUBLISHED'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : status === 'DRAFT'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                      >
                        {status}
                      </span>
                    </td>

                    {/* Sizes Count */}
                    <td className="py-2 px-3 text-center font-bold text-gray-800">
                      {product.variants.length}
                    </td>

                    {/* Stock Count */}
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`font-bold text-xs ${
                          totalStock === 0 ? 'text-red-700' : totalStock < 10 ? 'text-amber-700' : 'text-gray-800'
                        }`}
                      >
                        {totalStock}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-2 px-3 text-right">
                      <Link
                        to={`/admin/products/${product.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-[#5E1224]/30 hover:border-[#5E1224] text-[#5E1224] hover:bg-[#5E1224] hover:text-white rounded-md text-xs font-semibold shadow-xs transition-all"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Manage</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================
          5. ADD NEW PRODUCT MODAL (Preserved & Enhanced)
          ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h2 className="font-serif font-bold text-lg text-gray-900 text-[#5E1224]">
                  Add New Boutique Design
                </h2>
                <p className="text-xs text-gray-500">Configure core product details and initial garment sizes.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-700 p-1"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 text-red-800 rounded-lg text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Royal Indigo Silk Anarkali Set"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#5E1224] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setNewCategory(cat);
                      setNewSubcategory(CATEGORY_GROUPS[cat]?.[0] || '');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#5E1224] focus:outline-none bg-white"
                  >
                    {Object.keys(CATEGORY_GROUPS).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Subcategory <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newSubcategory}
                    onChange={(e) => setNewSubcategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#5E1224] focus:outline-none bg-white"
                  >
                    {(CATEGORY_GROUPS[newCategory] || []).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Initial Selling Price (₹)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 2999"
                  value={initialPrice}
                  onChange={(e) => setInitialPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#5E1224]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fabric</label>
                  <input
                    type="text"
                    placeholder="e.g. Pure Chanderi Silk"
                    value={newFabric}
                    onChange={(e) => setNewFabric(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#5E1224]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as 'PUBLISHED' | 'DRAFT' | 'ARCHIVED')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#5E1224] bg-white"
                  >
                    <option value="DRAFT">Draft Setup</option>
                    <option value="PUBLISHED">Published Live</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>

              {/* Size Checkboxes */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">Initial Sizes & Stock</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {Object.entries(newSizeStock).map(([sz, data]) => {
                    const isFreeSize = sz.toLowerCase() === 'free size';
                    return (
                      <div
                        key={sz}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          data.enabled ? 'border-[#5E1224] bg-amber-50/40 shadow-sm' : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                      >
                        <label className="flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={data.enabled}
                            onChange={(e) =>
                              setNewSizeStock((prev) => ({
                                ...prev,
                                [sz]: { ...prev[sz], enabled: e.target.checked },
                              }))
                            }
                            className="rounded text-[#5E1224] focus:ring-[#5E1224] w-3.5 h-3.5"
                          />
                          <span className={isFreeSize ? 'text-xs whitespace-nowrap text-gray-900' : 'text-xs text-gray-900'}>
                            {sz}
                          </span>
                        </label>
                        {data.enabled && (
                          <div className="mt-2 flex items-center justify-center gap-1">
                            <span className="text-[10px] text-gray-500 font-semibold uppercase">Qty:</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={data.stock}
                              onChange={(e) =>
                                setNewSizeStock((prev) => ({
                                  ...prev,
                                  [sz]: { ...prev[sz], stock: e.target.value },
                                }))
                              }
                              className="w-16 px-1.5 py-0.5 text-center text-xs font-semibold border border-gray-300 rounded bg-white focus:ring-1 focus:ring-[#5E1224]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-[#5E1224] text-white rounded-xl text-xs font-semibold hover:bg-[#4A0E1C] disabled:opacity-50 shadow-md"
                >
                  {actionLoading ? 'Creating...' : 'Create & Manage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 space-y-4">
            <h3 className="font-serif font-bold text-lg text-gray-900">Delete Product</h3>
            <p className="text-xs text-gray-700">
              Are you sure you want to delete <strong>{deletingProduct.name}</strong>? All variants and photos will be removed.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="px-4 py-2 border rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProductConfirm}
                disabled={actionLoading}
                className="px-5 py-2 bg-red-700 text-white rounded-xl text-xs font-semibold hover:bg-red-800 disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
