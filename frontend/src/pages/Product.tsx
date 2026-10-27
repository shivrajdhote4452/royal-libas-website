import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Ruler,
  ShoppingBag,
  Check,
  AlertCircle,
  X,
  Star,
  ChevronRight,
  Minus,
  Plus,
  Truck,
  RefreshCw,
  CreditCard,
  Lock
} from 'lucide-react';
import type { Product, ProductVariant } from '../types/product';
import { fetchProductBySlug, formatPrice, fetchProducts } from '../lib/api';
import { useCart } from '../context/CartContext';
import { ProductCard } from '../components/ProductCard';
import { useStoreSettings } from '../lib/settings';

export const ProductPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useStoreSettings();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedColor, setSelectedColor] = useState<string>('Maroon');
  const [activeTab, setActiveTab] = useState<'desc' | 'fabric' | 'shipping' | 'exchange'>('desc');
  const [showSizeChart, setShowSizeChart] = useState<boolean>(false);
  const [addedToast, setAddedToast] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    async function loadProduct() {
      if (!id) return;
      try {
        setLoading(true);
        const data = await fetchProductBySlug(id);
        if (isMounted) {
          setProduct(data);
          document.title = `${data.name} | Royal Libas by Tanya`;
          setError(null);
          // Pre-select first available variant
          const firstAvailable = data.variants.find((v) => v.stock > 0);
          setSelectedVariant(firstAvailable || null);

          // Infer color from product name
          if (data.name.toLowerCase().includes('maroon') || data.name.toLowerCase().includes('zari')) {
            setSelectedColor('Maroon');
          } else if (data.name.toLowerCase().includes('chandni') || data.name.toLowerCase().includes('ivory')) {
            setSelectedColor('Ivory');
          } else if (data.name.toLowerCase().includes('emerald') || data.name.toLowerCase().includes('sage')) {
            setSelectedColor('Emerald');
          } else if (data.name.toLowerCase().includes('pink') || data.name.toLowerCase().includes('gulabi')) {
            setSelectedColor('Rose Pink');
          } else {
            setSelectedColor('Maroon');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Product not found');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProduct();

    // Fetch related products
    fetchProducts({})
      .then((all) => {
        if (isMounted) setRelatedProducts(all.filter((p) => p.slug !== id).slice(0, 4));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 aspect-[3/4] bg-gray-200/60 animate-pulse rounded-xl" />
          <div className="lg:col-span-5 space-y-4">
            <div className="h-8 bg-gray-200/60 animate-pulse rounded w-3/4" />
            <div className="h-6 bg-gray-200/60 animate-pulse rounded w-1/3" />
            <div className="h-32 bg-gray-200/60 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">Design Not Found</h2>
        <p className="text-sm text-gray-600 mb-6">
          {error || 'The requested product could not be found in our catalogue.'}
        </p>
        <Link
          to="/shop"
          className="inline-flex items-center px-6 py-2.5 rounded bg-[#5B111A] text-white text-xs font-ui font-semibold uppercase tracking-wider hover:bg-[#3A080F]"
        >
          Return to Shop
        </Link>
      </div>
    );
  }

  const isSoldOut = product.total_stock === 0 || product.badges.includes('Sold Out');
  const activeImage =
    product.images && product.images.length > 0
      ? product.images[activeImageIndex]?.url
      : product.primary_image;

  const displaySellingPrice = selectedVariant ? selectedVariant.selling_price : product.min_price || 0;
  const displayMrp = selectedVariant?.mrp ?? (product.variants[0]?.mrp || null);
  const discountPercent = displayMrp && displayMrp > displaySellingPrice
    ? Math.round(((displayMrp - displaySellingPrice) / displayMrp) * 100)
    : null;

  let parsedSizeChart: any = null;
  if (product.size_chart) {
    try {
      parsedSizeChart = JSON.parse(product.size_chart);
    } catch {
      parsedSizeChart = null;
    }
  }

  const handleAddToCart = () => {
    if (!selectedVariant || selectedVariant.stock <= 0) return;
    addToCart(
      {
        productId: product.id,
        variantId: selectedVariant.id,
        slug: product.slug,
        name: product.name,
        size: selectedVariant.size,
        sellingPrice: Number(selectedVariant.selling_price),
        image: activeImage || null,
      },
      quantity
    );
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 3000);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    navigate('/checkout');
  };

  const colorSwatches = [
    { name: 'Maroon', hex: '#5B111A' },
    { name: 'Ivory', hex: '#EFE9DF' },
    { name: 'Emerald', hex: '#1A4D2E' },
    { name: 'Mustard', hex: '#C59B27' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] page-enter font-sans pb-16 sm:pb-24">
      {/* Toast Notification */}
      {addedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1A4D2E] text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-draw-check">
          <Check className="w-5 h-5 text-[#EAD186]" />
          <div className="text-xs sm:text-sm font-medium">
            <span className="font-bold">{product.name} (Size {selectedVariant?.size})</span> added to your bag!
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* ========================================================
            1. BREADCRUMBS
            ======================================================== */}
        <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-6 font-medium">
          <Link to="/" className="hover:text-[#5B111A] transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <Link to="/shop" className="hover:text-[#5B111A] transition-colors">Kurti Sets</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-900 font-semibold truncate">{product.name}</span>
        </nav>

        {/* ========================================================
            2. PRODUCT DISPLAY (PDF Page 4 Split Layout)
            Left: Gallery Strip + Main Image
            Right: Sticky Purchase Information
            ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* LEFT: GALLERY AREA (lg:col-span-7) */}
          <div className="lg:col-span-7 flex flex-col-reverse sm:flex-row gap-4">
            {/* Vertical Thumbnail Strip on Desktop */}
            {product.images && product.images.length > 1 && (
              <div className="flex sm:flex-col gap-2.5 overflow-x-auto sm:overflow-y-auto sm:w-20 shrink-0">
                {product.images.map((img, idx) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-16 h-20 sm:w-20 sm:h-26 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                      activeImageIndex === idx
                        ? 'border-[#C59B27] ring-1 ring-[#C59B27] shadow-sm'
                        : 'border-[#E8DFD0] hover:border-gray-400 opacity-80 hover:opacity-100'
                    }`}
                    aria-label={`View photo ${idx + 1}`}
                  >
                    <img src={img.url} alt={img.alt_text || `Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Main Featured Image */}
            <div className="flex-1 relative aspect-[3/4] rounded-2xl overflow-hidden bg-white border border-[#E8DFD0] shadow-md">
              {/* Visible SAMPLE PHOTO Badge */}
              <div className="absolute top-4 right-4 z-20 pointer-events-none no-motion">
                <span className="inline-flex items-center px-2.5 py-1 rounded bg-black/75 text-amber-200 text-[10px] font-bold tracking-wider uppercase shadow-md border border-amber-400/40 backdrop-blur-sm">
                  SAMPLE PHOTO
                </span>
              </div>

              {/* Dynamic Badge */}
              {product.badges && product.badges.length > 0 && (
                <div className="absolute top-4 left-4 z-20 no-motion">
                  <span className="inline-flex items-center px-3 py-1 rounded bg-[#5B111A] text-white text-[11px] font-bold tracking-wider uppercase shadow-md">
                    {product.badges[0]}
                  </span>
                </div>
              )}

              {/* Sold Out Overlay */}
              {isSoldOut && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
                  <span className="bg-[#1F1A1C] text-white font-serif font-bold text-lg uppercase tracking-widest px-6 py-2.5 rounded-lg shadow-xl">
                    Sold Out
                  </span>
                </div>
              )}

              {activeImage ? (
                <img
                  key={activeImageIndex}
                  src={activeImage}
                  alt={product.name}
                  className="w-full h-full object-cover object-top transition-opacity duration-300 ease-out"
                />
              ) : (
                <div className="w-full h-full bg-[#5B111A] flex items-center justify-center text-white p-8 text-center font-serif text-2xl font-bold">
                  {product.name}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: STICKY PURCHASE PANEL (lg:col-span-5) (PDF Page 4) */}
          <div className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-2xl border border-[#E8DFD0] shadow-sm lg:sticky lg:top-28 space-y-5">
            {/* Product Title */}
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A] leading-tight">
                {product.name}
              </h1>
              {/* Star Rating */}
              <div className="flex items-center gap-1.5 mt-2">
                <div className="flex text-[#C59B27]">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#C59B27]" />
                  ))}
                </div>
                <span className="text-xs font-semibold text-gray-800">4.8</span>
                <span className="text-xs text-gray-400">(120 reviews)</span>
              </div>
            </div>

            {/* Price Row */}
            <div className="pb-4 border-b border-gray-100">
              <div className="flex items-baseline gap-2.5 flex-wrap no-motion">
                <span className="price-display text-2xl sm:text-3xl font-bold text-[#5B111A]">
                  {formatPrice(displaySellingPrice)}
                </span>
                {displayMrp && displayMrp > displaySellingPrice && (
                  <span className="price-display text-sm text-gray-500 line-through">
                    {formatPrice(displayMrp)}
                  </span>
                )}
                {discountPercent && (
                  <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs font-bold border border-green-200">
                    {discountPercent}% OFF
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Inclusive of all taxes</p>
            </div>

            {/* Color Swatches */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-900">
                Color: <span className="text-[#5B111A] font-bold">{selectedColor}</span>
              </div>
              <div className="flex items-center gap-2">
                {colorSwatches.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setSelectedColor(c.name)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-7 h-7 rounded-full border transition-all ${
                      selectedColor === c.name
                        ? 'ring-2 ring-[#5B111A] ring-offset-2 scale-110 shadow-sm'
                        : 'border-black/20 hover:scale-105'
                    }`}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Size Selector */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-900">Size:</span>
                <button
                  type="button"
                  onClick={() => setShowSizeChart(true)}
                  className="inline-flex items-center gap-1 text-xs text-[#5B111A] hover:underline font-semibold"
                >
                  <Ruler className="w-3.5 h-3.5 text-[#C59B27]" />
                  <span>Size Guide</span>
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {product.variants.map((v) => {
                  const soldOut = v.stock <= 0;
                  const isSelected = selectedVariant?.id === v.id;

                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={soldOut}
                      onClick={() => setSelectedVariant(v)}
                      className={`h-11 rounded-lg border text-center transition-all ${
                        soldOut
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60 line-through'
                          : isSelected
                          ? 'bg-[#5B111A] text-white border-[#5B111A] shadow-md font-bold'
                          : 'bg-[#FAF7F2] text-gray-800 border-[#E8DFD0] hover:bg-gray-100 font-semibold'
                      }`}
                    >
                      <span className="text-xs sm:text-sm">{v.size}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity Selector & Live Stock Indicator */}
            <div className="flex items-center justify-between pt-1">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-gray-900 block">Quantity:</span>
                <div className="flex items-center border border-[#E8DFD0] rounded-lg bg-[#FAF7F2]">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="p-2 hover:bg-gray-200 text-gray-700 disabled:opacity-40"
                    title="Decrease"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold text-gray-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    disabled={Boolean(selectedVariant && quantity >= selectedVariant.stock)}
                    className="p-2 hover:bg-gray-200 text-gray-700 disabled:opacity-40"
                    title="Increase"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Stock Status Badge */}
              <div className="text-right">
                {isSoldOut || (selectedVariant && selectedVariant.stock <= 0) ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-red-600 font-bold">
                    <span className="w-2 h-2 rounded-full bg-red-600" />
                    Sold Out
                  </span>
                ) : selectedVariant && selectedVariant.stock <= 3 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                    Only {selectedVariant.stock} left in stock
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    In Stock
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons: ADD TO CART + BUY NOW */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={isSoldOut || !selectedVariant || selectedVariant.stock <= 0}
                onClick={handleAddToCart}
                className="w-full py-3.5 px-6 rounded-lg bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-ui font-semibold text-xs sm:text-sm uppercase tracking-wider shadow transition-all flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{isSoldOut ? 'Sold Out' : 'ADD TO CART'}</span>
              </button>

              <button
                type="button"
                disabled={isSoldOut || !selectedVariant || selectedVariant.stock <= 0}
                onClick={handleBuyNow}
                className="w-full py-3.5 px-6 rounded-lg bg-transparent border-2 border-[#5B111A] hover:bg-[#5B111A]/5 disabled:border-gray-300 disabled:cursor-not-allowed text-[#5B111A] font-ui font-semibold text-xs sm:text-sm uppercase tracking-wider transition-all"
              >
                BUY NOW
              </button>
            </div>

            {/* Assurance Strip (PDF Page 4) */}
            <div className="grid grid-cols-4 gap-2 pt-4 border-t border-gray-100 text-center">
              <div className="flex flex-col items-center space-y-1">
                <Truck className="w-4 h-4 text-[#C59B27]" />
                <span className="text-[10px] text-gray-700 font-medium">Free Shipping above ₹{settings.freeShippingThreshold}</span>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <CreditCard className="w-4 h-4 text-[#C59B27]" />
                <span className="text-[10px] text-gray-700 font-medium">COD Available</span>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <RefreshCw className="w-4 h-4 text-[#C59B27]" />
                <span className="text-[10px] text-gray-700 font-medium">Easy Exchange 7 days</span>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <Lock className="w-4 h-4 text-[#C59B27]" />
                <span className="text-[10px] text-gray-700 font-medium">Secure Payments</span>
              </div>
            </div>

            {/* Tabs: Description | Fabric & Care | Shipping | Exchange (PDF Page 4) */}
            <div className="pt-4 border-t border-gray-100">
              <div className="flex border-b border-gray-200 text-xs font-semibold">
                {[
                  { id: 'desc', label: 'Description' },
                  { id: 'fabric', label: 'Fabric & Care' },
                  { id: 'shipping', label: 'Shipping' },
                  { id: 'exchange', label: 'Exchange' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id as any)}
                    className={`pb-2 px-3 border-b-2 transition-colors ${
                      activeTab === t.id
                        ? 'border-[#5B111A] text-[#5B111A] font-bold'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="pt-3 text-xs text-gray-600 leading-relaxed">
                {activeTab === 'desc' && (
                  <div className="space-y-2">
                    <p>{product.description || 'This elegant kurti set is crafted for festive occasions and special gatherings. The intricate embroidery and premium fabric make it a timeless addition to your wardrobe.'}</p>
                    <ul className="list-disc pl-4 space-y-1 pt-1 text-gray-700">
                      <li>Premium quality fabric</li>
                      <li>Intricate embroidery work</li>
                      <li>Comfortable and breathable</li>
                      <li>Perfect for festive and casual occasions</li>
                    </ul>
                  </div>
                )}
                {activeTab === 'fabric' && (
                  <div className="space-y-1.5">
                    <p><strong>Fabric:</strong> {product.fabric || 'Pure Chanderi & Mulmul'}</p>
                    <p><strong>Wash Care:</strong> {product.care || 'Gentle hand wash or dry clean recommended.'}</p>
                    <p><strong>Lining:</strong> 100% breathable pure cotton lining included.</p>
                  </div>
                )}
                {activeTab === 'shipping' && (
                  <div className="space-y-1.5">
                    <p>• Dispatches within 24 hours from our boutique.</p>
                    <p>• Standard Delivery: 5–7 business days across India.</p>
                    <p>• Free shipping on orders above ₹{settings.freeShippingThreshold}.</p>
                  </div>
                )}
                {activeTab === 'exchange' && (
                  <div className="space-y-1.5">
                    <p>• 7-day doorstep size exchange policy.</p>
                    <p>• Garment must be unused with tags and original packaging intact.</p>
                    <p>• Contact us on WhatsApp for instant doorstep pickup arrangement.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================
            3. SUPPORTING EDITORIAL LOOKBOOK STRIP (PDF Page 4)
            ======================================================== */}
        <section className="mt-16 sm:mt-24 pt-12 border-t border-[#E8DFD0]">
          <div className="text-center mb-8">
            <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
              Lookbook
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A] mt-1">
              The Editorial Edit
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-200">
              <img src="/images/products/maroon_worn.jpg" alt="Lookbook 1" className="w-full h-full object-cover" />
            </div>
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-200">
              <img src="/images/products/chandni_ivory_worn.jpg" alt="Lookbook 2" className="w-full h-full object-cover" />
            </div>
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-200">
              <img src="/images/styling_moment_1.jpg" alt="Lookbook 3" className="w-full h-full object-cover" />
            </div>
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-200">
              <img src="/images/styling_moment_2.jpg" alt="Lookbook 4" className="w-full h-full object-cover" />
            </div>
          </div>
        </section>

        {/* ========================================================
            4. YOU MAY ALSO LIKE (Recommendation Rail)
            ======================================================== */}
        {relatedProducts.length > 0 && (
          <section className="mt-16 sm:mt-20 pt-12 border-t border-[#E8DFD0]">
            <div className="flex items-center justify-between mb-8 pb-3 border-b border-gray-100">
              <h2 className="font-serif text-2xl font-bold text-[#5B111A]">You May Also Like</h2>
              <Link to="/shop" className="text-xs font-semibold text-[#5B111A] hover:underline">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ========================================================
          5. SIZE CHART MODAL (In cm)
          ======================================================== */}
      {showSizeChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowSizeChart(false)}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700"
              aria-label="Close Size Chart"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <Ruler className="w-5 h-5 text-[#C59B27]" />
              <h3 className="font-serif text-xl font-bold text-[#5B111A]">Standard Size Chart</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              All garment measurements are recorded in <strong>centimetres (cm)</strong>.
            </p>

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF7F2] border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Size</th>
                    <th className="p-3">Bust (cm)</th>
                    <th className="p-3">Waist (cm)</th>
                    <th className="p-3">Hip (cm)</th>
                    <th className="p-3">Length (cm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {parsedSizeChart?.measurements ? (
                    Object.entries(parsedSizeChart.measurements).map(([sizeKey, m]: any) => (
                      <tr key={sizeKey} className={selectedVariant?.size === sizeKey ? 'bg-amber-50/60 font-bold' : ''}>
                        <td className="p-3 font-bold text-[#5B111A]">{sizeKey}</td>
                        <td className="p-3">{m.bust}</td>
                        <td className="p-3">{m.waist}</td>
                        <td className="p-3">{m.hip}</td>
                        <td className="p-3">{m.length}</td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr><td className="p-3 font-bold text-[#5B111A]">S</td><td className="p-3">91.5</td><td className="p-3">76.2</td><td className="p-3">99.0</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5B111A]">M</td><td className="p-3">96.5</td><td className="p-3">81.3</td><td className="p-3">104.1</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5B111A]">L</td><td className="p-3">101.6</td><td className="p-3">86.4</td><td className="p-3">109.2</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5B111A]">XL</td><td className="p-3">106.7</td><td className="p-3">91.4</td><td className="p-3">114.3</td><td className="p-3">114.3</td></tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 rounded bg-[#FAF7F2] text-[11px] text-gray-600">
              <span className="font-semibold text-gray-800 block mb-0.5">Measurement Advice:</span>
              Measure around the fullest part of your bust and natural waistline. If you fall between sizes, we recommend sizing up.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          6. MOBILE STICKY ADD TO CART BAR (PDF Page 4)
          ======================================================== */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8DFD0] p-3 shadow-lg flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">{product.name}</p>
          <div className="flex items-center gap-1.5 no-motion">
            <span className="price-display text-sm font-bold text-[#5B111A]">
              {formatPrice(displaySellingPrice)}
            </span>
            {selectedVariant && (
              <span className="text-[11px] text-gray-500 font-medium">
                • Size {selectedVariant.size}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={isSoldOut || !selectedVariant || selectedVariant.stock <= 0}
          onClick={handleAddToCart}
          className="shrink-0 px-4 py-2.5 rounded bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-ui font-semibold text-xs uppercase tracking-wider shadow flex items-center gap-1.5"
        >
          {addedToast ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#EAD186]" />
              <span>Added</span>
            </>
          ) : (
            <>
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{isSoldOut ? 'Sold Out' : 'Add to Cart'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
