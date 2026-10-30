import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Ruler,
  ShoppingBag,
  Check,
  AlertCircle,
  X,
  ChevronRight,
  ChevronLeft,
  Minus,
  Plus,
  Truck,
  RefreshCw,
  CreditCard,
  Lock,
  Heart,
  Copy,
  Tag,
  Play,
} from 'lucide-react';
import type { Product, ProductVariant } from '../types/product';
import type { CouponPublic } from '../types/order';
import { fetchProductBySlug, formatPrice, fetchProducts, fetchActiveCoupons } from '../lib/api';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { ProductCard } from '../components/ProductCard';
import { ProductPlaceholder } from '../components/ProductPlaceholder';
import { useStoreSettings } from '../lib/settings';

const RECENTLY_VIEWED_KEY = 'royal_libas_recently_viewed';

export const ProductPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useStoreSettings();
  const { addToCart, openDrawer } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [recentlyViewedProducts, setRecentlyViewedProducts] = useState<Product[]>([]);
  const [coupons, setCoupons] = useState<CouponPublic[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedColor, setSelectedColor] = useState<string>('Maroon');
  const [activeTab, setActiveTab] = useState<'desc' | 'fabric' | 'shipping' | 'exchange'>('desc');
  const [showSizeChart, setShowSizeChart] = useState<boolean>(false);
  const [showAllOffersModal, setShowAllOffersModal] = useState<boolean>(false);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);
  const [btnState, setBtnState] = useState<'idle' | 'adding' | 'added'>('idle');

  // Touch swipe support for mobile product gallery
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  // Load product data
  useEffect(() => {
    let isMounted = true;
    async function loadProduct() {
      if (!id) return;
      try {
        setLoading(true);
        const cleanId = decodeURIComponent(id).trim();
        const data = await fetchProductBySlug(cleanId);
        if (isMounted) {
          setProduct(data);
          document.title = `${data.name} | Royal Libas by Tanya`;
          if (cleanId !== data.slug) {
            navigate(`/product/${data.slug}`, { replace: true });
          }
          setError(null);
          // Pre-select first available variant
          const firstAvailable = data.variants.find((v) => v.stock > 0);
          setSelectedVariant(firstAvailable || null);
          setActiveImageIndex(0);

          // Track in Recently Viewed (Point 25)
          try {
            const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
            const list: number[] = raw ? JSON.parse(raw) : [];
            const updated = [data.id, ...list.filter((pid) => pid !== data.id)].slice(0, 8);
            localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
          } catch {}

          // Structured variant colour initialization
          const productColours = Array.from(
            new Set(data.variants.map((v) => v.colour).filter(Boolean))
          ) as string[];
          const initialColor = firstAvailable?.colour || productColours[0] || '';
          setSelectedColor(initialColor);
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

    // Fetch related & recently viewed products
    fetchProducts({})
      .then((all) => {
        if (isMounted) {
          setRelatedProducts(all.filter((p) => p.slug !== id).slice(0, 4));

          // Resolve recently viewed from localStorage
          try {
            const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
            const savedIds: number[] = raw ? JSON.parse(raw) : [];
            const found = savedIds
              .filter((pid) => all.some((p) => p.id === pid && p.slug !== id))
              .map((pid) => all.find((p) => p.id === pid)!)
              .filter(Boolean)
              .slice(0, 4);
            setRecentlyViewedProducts(found);
          } catch {}
        }
      })
      .catch(() => {});

    // Fetch active coupons for "Available Offers" (Point 17)
    fetchActiveCoupons()
      .then((res) => {
        if (isMounted) setCoupons(res);
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
          <div className="lg:col-span-7 aspect-[4/5] skeleton-shimmer rounded-2xl border border-[#E8DFD0]" />
          <div className="lg:col-span-5 space-y-4">
            <div className="h-8 skeleton-shimmer rounded w-3/4" />
            <div className="h-6 skeleton-shimmer rounded w-1/3" />
            <div className="h-40 skeleton-shimmer rounded-xl" />
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
          className="inline-flex items-center px-6 py-2.5 rounded bg-[#5B111A] text-white text-xs font-ui font-semibold uppercase tracking-wider hover:bg-[#460C13]"
        >
          Return to Shop
        </Link>
      </div>
    );
  }

  const galleryImages =
    product.images && product.images.length > 0
      ? product.images.map((img) => img.url)
      : product.primary_image
      ? [product.primary_image]
      : [];

  const activeImageUrl = galleryImages[activeImageIndex] || galleryImages[0] || null;

  const displaySellingPrice = selectedVariant ? selectedVariant.selling_price : product.min_price || 0;
  const displayMrp = selectedVariant?.mrp ?? (product.variants[0]?.mrp || null);
  const discountPercent =
    displayMrp && displayMrp > displaySellingPrice
      ? Math.round(((displayMrp - displaySellingPrice) / displayMrp) * 100)
      : null;

  const isSoldOut = product.total_stock === 0;
  const inWishlist = isInWishlist(product.id);

  // Parse size chart JSON if present
  let parsedSizeChart: any = null;
  if (product.size_chart) {
    try {
      parsedSizeChart = JSON.parse(product.size_chart);
    } catch {
      parsedSizeChart = null;
    }
  }

  // Variant availability checks
  const variantsForSelectedColor = selectedColor
    ? product.variants.filter((v) => v.colour === selectedColor)
    : product.variants;
  const isColorSoldOut =
    variantsForSelectedColor.length > 0 &&
    variantsForSelectedColor.every((v) => v.stock <= 0);
  const isVariantValidAndAvailable = Boolean(
    selectedVariant &&
    selectedVariant.stock > 0 &&
    (!selectedColor || selectedVariant.colour === selectedColor)
  );

  // Handle customer color selection
  const handleColorChange = (c: string) => {
    setSelectedColor(c);
    const variantsForColor = product.variants.filter((v) => v.colour === c);
    // 1. Try to retain current size if available in the new color
    const sameSizeMatch = variantsForColor.find(
      (v) => v.size === selectedVariant?.size && v.stock > 0
    );
    if (sameSizeMatch) {
      setSelectedVariant(sameSizeMatch);
      setQuantity((q) => Math.min(q, sameSizeMatch.stock > 0 ? sameSizeMatch.stock : 1));
      return;
    }
    // 2. Otherwise pick first available size in this color
    const firstInStock = variantsForColor.find((v) => v.stock > 0);
    if (firstInStock) {
      setSelectedVariant(firstInStock);
      setQuantity((q) => Math.min(q, firstInStock.stock > 0 ? firstInStock.stock : 1));
    } else {
      // 3. Completely sold out in this color: clear selected variant so previous color is never left active!
      setSelectedVariant(null);
    }
  };

  const handleSizeChange = (v: ProductVariant) => {
    if (v.stock <= 0) return;
    setSelectedVariant(v);
    setQuantity((q) => Math.min(q, v.stock > 0 ? v.stock : 1));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchEndX(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;
    const distance = touchStartX - touchEndX;
    const minSwipeDistance = 45;
    if (distance > minSwipeDistance) {
      // Swiped left -> next photo
      setActiveImageIndex((prev) => (prev < galleryImages.length - 1 ? prev + 1 : 0));
    } else if (distance < -minSwipeDistance) {
      // Swiped right -> prev photo
      setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : galleryImages.length - 1));
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  // Handle Add to Cart (Point 5 & Directive 1)
  const handleAddToCart = () => {
    if (!isVariantValidAndAvailable || !selectedVariant || btnState !== 'idle') return;

    setBtnState('adding');
    setTimeout(() => {
      addToCart(
        {
          productId: product.id,
          variantId: selectedVariant.id,
          slug: product.slug,
          name: product.name,
          size: selectedVariant.size,
          colour: selectedVariant.colour,
          sellingPrice: Number(selectedVariant.selling_price),
          image: activeImageUrl,
        },
        quantity
      );
      setBtnState('added');

      setTimeout(() => {
        setBtnState('idle');
        openDrawer();
      }, 500);
    }, 280);
  };

  const handleBuyNow = () => {
    if (!isVariantValidAndAvailable || !selectedVariant) return;
    addToCart(
      {
        productId: product.id,
        variantId: selectedVariant.id,
        slug: product.slug,
        name: product.name,
        size: selectedVariant.size,
        colour: selectedVariant.colour,
        sellingPrice: Number(selectedVariant.selling_price),
        image: activeImageUrl,
      },
      quantity
    );
    navigate('/checkout');
  };

  // Copy Coupon Code (Point 18: Inline feedback, no alert popup)
  const handleCopyCoupon = (code: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code);
    }
    setCopiedCoupon(code);
    setTimeout(() => setCopiedCoupon(null), 1500);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] page-enter font-sans pb-28 sm:pb-12">
      {/* Breadcrumb Navigation */}
      <div className="border-b border-[#E8DFD0] bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <nav className="flex items-center space-x-2 text-xs text-gray-500 font-medium">
            <Link to="/" className="hover:text-[#5B111A]">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <Link to="/shop" className="hover:text-[#5B111A]">Shop</Link>
            {product.category && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                <Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-[#5B111A]">
                  {product.category}
                </Link>
              </>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-900 font-semibold truncate max-w-[200px]">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* ========================================================
              1. IMAGE GALLERY (Point 14: Desktop crossfade + mobile swipe/dots)
              ======================================================== */}
          <div className="lg:col-span-7 space-y-4">
            {/* Main Stage Image */}
            <div
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="relative aspect-[4/5] w-full bg-[#F0E9DF] rounded-2xl overflow-hidden border border-[#E8DFD0] shadow-sm group touch-pan-y"
            >
              {activeImageUrl ? (
                /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(activeImageUrl) ? (
                  <video
                    key={activeImageUrl}
                    src={activeImageUrl}
                    controls
                    playsInline
                    poster={activeImageUrl.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg')}
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <img
                    key={activeImageUrl}
                    src={activeImageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover object-center transition-all duration-300 ease-out group-hover:scale-[1.03]"
                    style={{
                      transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />
                )
              ) : (
                <ProductPlaceholder
                  title={product.name}
                  category={product.category || undefined}
                  className="w-full h-full"
                />
              )}

              {/* Badges */}
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5">
                {product.badges?.map((badge) => (
                  <span
                    key={badge}
                    className={`px-3 py-1 rounded-none text-[10px] font-bold uppercase tracking-[0.2em] shadow-sm ${
                      badge === 'Bestseller'
                        ? 'bg-[#B58A3C] text-[#2B1B1E]'
                        : badge === 'Low Stock'
                        ? 'bg-[#5E1224] text-[#FCF8F0]'
                        : 'bg-[#2B1B1E] text-[#FCF8F0]'
                    }`}
                  >
                    {badge}
                  </span>
                ))}
              </div>

              {/* Wishlist Button (Point 20) */}
              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                className={`absolute top-4 right-4 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                  inWishlist
                    ? 'bg-white text-[#5E1224] shadow-md scale-105'
                    : 'bg-white/90 text-[#2B1B1E] hover:text-[#5E1224] hover:bg-white hover:scale-105 shadow-sm'
                }`}
                aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <Heart
                  className={`w-5 h-5 transition-transform duration-200 ${
                    inWishlist ? 'fill-[#5E1224] stroke-[#5E1224]' : 'stroke-current'
                  }`}
                />
              </button>

              {/* Mobile Carousel Indicators (Point 14) */}
              {galleryImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : galleryImages.length - 1))
                    }
                    className="sm:hidden absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 text-gray-800 flex items-center justify-center shadow"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveImageIndex((prev) => (prev < galleryImages.length - 1 ? prev + 1 : 0))
                    }
                    className="sm:hidden absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 text-gray-800 flex items-center justify-center shadow"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="sm:hidden absolute bottom-3 right-3 bg-black/60 text-white text-[11px] font-bold px-2.5 py-1 rounded-none backdrop-blur-sm">
                    {activeImageIndex + 1} / {galleryImages.length}
                  </div>
                </>
              )}
            </div>

            {/* Desktop Thumbnails (Point 14: subtle 180-250ms crossfade) */}
            {galleryImages.length > 1 && (
              <div className="hidden sm:grid grid-cols-5 gap-3">
                {galleryImages.map((imgUrl, idx) => {
                  const isVid = /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(imgUrl);
                  const thumbUrl = isVid ? imgUrl.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg') : imgUrl;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative aspect-[4/5] rounded-none overflow-hidden border-2 transition-all duration-200 ${
                        activeImageIndex === idx
                          ? 'border-[#5E1224] shadow-md ring-1 ring-[#5E1224]'
                          : 'border-[#E8DFD0] hover:border-[#B58A3C] opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img src={thumbUrl} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                      {isVid && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none">
                          <span className="w-6 h-6 rounded-full bg-white/90 text-[#5E1224] flex items-center justify-center shadow">
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ========================================================
              2. BUYING CONTROLS PANEL (PDF Page 5 & 13)
              ======================================================== */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24 self-start">
            <div>
              <span className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#B58A3C] block mb-1">
                ROYAL LIBAS
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#2B1B1E] leading-tight">
                {product.name}
              </h1>
              {/* Craftsmanship and Category Header */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#B58A3C]">
                  {product.category || 'Atelier Collection'}
                </span>
                <span className="text-gray-300">&bull;</span>
                <span className="text-[11px] text-gray-500 font-medium">Handcrafted Silhouette</span>
              </div>
            </div>

            {/* Pricing Area matching PDF Page 5 */}
            <div className="p-4 bg-white border border-[#E8DFD0] shadow-sm">
              <div className="flex items-baseline gap-3">
                <span className="price-display text-3xl sm:text-4xl font-serif font-bold text-[#5E1224]">
                  {formatPrice(displaySellingPrice)}
                </span>
                {displayMrp && displayMrp > displaySellingPrice && (
                  <span className="price-display text-sm text-gray-400 line-through">
                    {formatPrice(displayMrp)}
                  </span>
                )}
                {discountPercent && (
                  <span className="px-2 py-0.5 text-[#5E1224] bg-[#5E1224]/10 text-xs font-bold border border-[#5E1224]/20">
                    {discountPercent}% OFF
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Inclusive of all taxes</p>
            </div>

            {/* Product short description paragraph */}
            {product.description && (
              <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
                {product.description}
              </p>
            )}

            {/* Color Swatches derived strictly from product variants */}
            {(() => {
              const COLOR_MAP: Record<string, string> = {
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
              const uniqueColours = Array.from(
                new Set(product.variants.map((v) => v.colour).filter(Boolean))
              ) as string[];

              if (!uniqueColours.length && !selectedColor) return null;

              return (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-900">
                    COLOUR:{' '}
                    <span className="text-[#5E1224] font-bold">
                      {selectedColor || uniqueColours[0] || 'Original Silhouette'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {uniqueColours.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleColorChange(c)}
                        style={{ backgroundColor: COLOR_MAP[c] || '#8C6F5B' }}
                        className={`w-7 h-7 rounded-full border transition-all ${
                          selectedColor === c
                            ? 'ring-2 ring-[#5E1224] ring-offset-2 scale-110 shadow-sm'
                            : 'border-black/20 hover:scale-105'
                        }`}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Sold out in selected colour notice */}
            {isColorSoldOut && (
              <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Sold out in this colour &mdash; please choose another shade or explore alternative silhouettes.</span>
              </div>
            )}

            {/* Size Selector (PDF Page 5) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  SIZE:{' '}
                  {selectedVariant && (
                    <strong className="text-[#5E1224] font-bold">({selectedVariant.size})</strong>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowSizeChart(true)}
                  className="inline-flex items-center gap-1 text-xs text-[#5E1224] hover:underline font-semibold"
                >
                  <Ruler className="w-3.5 h-3.5 text-[#B58A3C]" />
                  <span>Size Guide (cm)</span>
                </button>
              </div>

              <div className="grid grid-cols-6 gap-2">
                {(() => {
                  const matchingVariants = selectedColor
                    ? product.variants.filter((v) => v.colour === selectedColor)
                    : product.variants;
                  const variantsToDisplay = matchingVariants.length > 0 ? matchingVariants : product.variants;

                  return variantsToDisplay.map((v) => {
                    const soldOut = v.stock <= 0;
                    const isSelected = selectedVariant?.id === v.id;

                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => handleSizeChange(v)}
                        className={`h-11 rounded-none border text-center transition-all duration-200 ${
                          soldOut
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50 line-through'
                            : isSelected
                            ? 'bg-[#5E1224] text-white border-[#5E1224] shadow-md font-bold'
                            : 'bg-white text-gray-800 border-[#E8DFD0] hover:border-[#B58A3C] font-semibold'
                        }`}
                      >
                        <span className="text-xs sm:text-sm">{v.size}</span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Quantity Selector & Real Low-Stock Message */}
            <div className="flex items-center justify-between pt-1">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-900 block">Quantity</span>
                <div className="flex items-center border border-[#E8DFD0] rounded bg-white">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1 || !isVariantValidAndAvailable}
                    className="p-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 transition-colors"
                    title="Decrease"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold text-gray-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    disabled={Boolean(!isVariantValidAndAvailable || (selectedVariant && quantity >= selectedVariant.stock))}
                    className="p-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 transition-colors"
                    title="Increase"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Real Inventory Status */}
              <div className="text-right">
                {isSoldOut || isColorSoldOut || (selectedVariant && selectedVariant.stock <= 0) || !selectedVariant ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-red-600 font-bold">
                    <span className="w-2 h-2 rounded-full bg-red-600" />
                    {isColorSoldOut ? `Sold Out in ${selectedColor}` : 'Sold Out'}
                  </span>
                ) : selectedVariant && selectedVariant.stock <= 5 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                    Only {selectedVariant.stock} left in stock
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    In Stock (Ships within 2-3 business days)
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons: ADD TO BAG + BUY NOW (PDF Page 5) */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={isSoldOut || isColorSoldOut || !isVariantValidAndAvailable || btnState === 'adding'}
                onClick={handleAddToCart}
                className="w-full py-4 px-6 rounded-none bg-[#5E1224] hover:bg-[#3A080F] disabled:bg-gray-300 disabled:cursor-not-allowed text-[#FCF8F0] font-ui font-semibold text-xs sm:text-sm uppercase tracking-[0.2em] shadow-md transition-all flex items-center justify-center gap-2"
              >
                {btnState === 'adding' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ADDING TO BAG...
                  </span>
                ) : btnState === 'added' ? (
                  <span className="inline-flex items-center gap-2 text-[#B58A3C]">
                    <Check className="w-4 h-4" />
                    ADDED TO BAG ✓
                  </span>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>{isSoldOut ? 'Sold Out' : 'ADD TO BAG'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSoldOut || isColorSoldOut || !isVariantValidAndAvailable}
                onClick={handleBuyNow}
                className="w-full py-3.5 px-6 rounded-none bg-[#FCF8F0] border-2 border-[#5E1224] hover:bg-[#5E1224] hover:text-[#FCF8F0] disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed text-[#5E1224] font-ui font-semibold text-xs sm:text-sm uppercase tracking-[0.2em] transition-all"
              >
                BUY NOW
              </button>
            </div>

            {/* ========================================================
                AVAILABLE OFFERS / COUPON PRESENTATION (Points 17 & 18)
                ======================================================== */}
            {coupons.length > 0 && (
              <div className="bg-white p-4 rounded-none border border-[#E8DFD0] shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 uppercase tracking-wider">
                    <Tag className="w-4 h-4 text-[#B58A3C]" />
                    <span>Available Offers</span>
                  </div>
                  {coupons.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setShowAllOffersModal(true)}
                      className="text-xs text-[#5E1224] hover:underline font-semibold"
                    >
                      View all ({coupons.length})
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {coupons.slice(0, 2).map((c) => {
                    const isCopied = copiedCoupon === c.code;
                    return (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-none border border-dashed border-[#E8DFD0] bg-[#FCF8F0] flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#5E1224] bg-white px-2 py-0.5 rounded-none border border-[#E8DFD0]">
                              {c.code}
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-800">
                              {c.type === 'PERCENT' ? `${Math.round(c.value)}% OFF` : `Flat ₹${Math.round(c.value)} OFF`}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Applicable on orders above {formatPrice(c.min_order_value)}
                          </p>
                        </div>

                        {/* Copy Button with inline feedback (Point 18) */}
                        <button
                          type="button"
                          onClick={() => handleCopyCoupon(c.code)}
                          className="shrink-0 px-2.5 py-1 rounded-none text-xs font-semibold bg-white border border-[#E8DFD0] text-[#5E1224] hover:bg-[#5E1224] hover:text-white transition-colors flex items-center gap-1"
                        >
                          {isCopied ? (
                            <span className="text-emerald-700 flex items-center gap-1 font-bold">
                              <Check className="w-3 h-3" />
                              COPIED ✓
                            </span>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>COPY</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Assurance Strip */}
            <div className={`grid ${settings.codEnabled ? 'grid-cols-4' : 'grid-cols-3'} gap-2 pt-3 border-t border-gray-100 text-center`}>
              <div className="flex flex-col items-center space-y-1">
                <Truck className="w-4 h-4 text-[#B58A3C]" />
                <span className="text-[10px] text-gray-700 font-medium">Free Shipping above ₹{settings.freeShippingThreshold}</span>
              </div>
              {settings.codEnabled && (
                <div className="flex flex-col items-center space-y-1">
                  <CreditCard className="w-4 h-4 text-[#B58A3C]" />
                  <span className="text-[10px] text-gray-700 font-medium">COD Available</span>
                </div>
              )}
              <div className="flex flex-col items-center space-y-1">
                <RefreshCw className="w-4 h-4 text-[#B58A3C]" />
                <span className="text-[10px] text-gray-700 font-medium">Easy Exchange 7 days</span>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <Lock className="w-4 h-4 text-[#B58A3C]" />
                <span className="text-[10px] text-gray-700 font-medium">Secure Payments</span>
              </div>
            </div>

            {/* Tabs: Description | Fabric & Care | Shipping | Exchange */}
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
                        ? 'border-[#5E1224] text-[#5E1224] font-bold'
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
                    <p>{product.description || 'This elegant ensemble is crafted for festive occasions and intimate celebrations with pure artisan precision.'}</p>
                    <ul className="list-disc pl-4 space-y-1 pt-1 text-gray-700">
                      <li>Intricate craftsmanship & hand-finished hems</li>
                      <li>Comfortable, breathable, and flattering drape</li>
                      <li>Includes matching bottom coordinate & dupatta</li>
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
                    <p>&bull; Dispatches within 24 hours from our boutique.</p>
                    <p>&bull; Standard Delivery: 5–7 business days across India.</p>
                    <p>&bull; Free shipping on orders above ₹{settings.freeShippingThreshold}.</p>
                  </div>
                )}
                {activeTab === 'exchange' && (
                  <div className="space-y-1.5">
                    <p>&bull; 7-day doorstep size exchange policy.</p>
                    <p>&bull; Garment must be unused with tags and original packaging intact.</p>
                    <p>&bull; Contact concierge on WhatsApp for instant doorstep pickup.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================
            3. RECENTLY VIEWED PRODUCTS (Point 25: Real products customer opened)
            ======================================================== */}
        {recentlyViewedProducts.length > 0 && (
          <section className="mt-16 sm:mt-20 pt-12 border-t border-[#E8DFD0]">
            <div className="flex items-center justify-between mb-8 pb-3 border-b border-gray-100">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-[#B58A3C] font-bold block">
                  Your Browsing History
                </span>
                <h2 className="font-serif text-2xl font-bold text-[#5E1224]">Recently Viewed</h2>
              </div>
              <Link to="/shop" className="text-xs font-semibold text-[#5E1224] hover:underline">
                Explore More &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {recentlyViewedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* ========================================================
            4. YOU MAY ALSO LIKE (Recommendation Rail)
            ======================================================== */}
        {relatedProducts.length > 0 && (
          <section className="mt-12 sm:mt-16 pt-10 border-t border-[#E8DFD0]">
            <div className="flex items-center justify-between mb-8 pb-3 border-b border-gray-100">
              <h2 className="font-serif text-2xl font-bold text-[#5E1224]">You May Also Like</h2>
              <Link to="/shop" className="text-xs font-semibold text-[#5E1224] hover:underline">
                View All &rarr;
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
          <div className="bg-white rounded-none max-w-lg w-full p-6 shadow-2xl relative border border-[#E8DFD0]">
            <button
              type="button"
              onClick={() => setShowSizeChart(false)}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700"
              aria-label="Close Size Chart"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <Ruler className="w-5 h-5 text-[#B58A3C]" />
              <h3 className="font-serif text-xl font-bold text-[#5E1224]">Standard Size Chart</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              All garment measurements are recorded in <strong>centimetres (cm)</strong>.
            </p>

            <div className="overflow-x-auto border border-gray-200 rounded-none">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FCF8F0] border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[10px]">
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
                        <td className="p-3 font-bold text-[#5E1224]">{sizeKey}</td>
                        <td className="p-3">{m.bust}</td>
                        <td className="p-3">{m.waist}</td>
                        <td className="p-3">{m.hip}</td>
                        <td className="p-3">{m.length}</td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr><td className="p-3 font-bold text-[#5E1224]">S</td><td className="p-3">91.5</td><td className="p-3">76.2</td><td className="p-3">99.0</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5E1224]">M</td><td className="p-3">96.5</td><td className="p-3">81.3</td><td className="p-3">104.1</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5E1224]">L</td><td className="p-3">101.6</td><td className="p-3">86.4</td><td className="p-3">109.2</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5E1224]">XL</td><td className="p-3">106.7</td><td className="p-3">91.4</td><td className="p-3">114.3</td><td className="p-3">114.3</td></tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 rounded-none bg-[#FCF8F0] text-[11px] text-gray-600">
              <span className="font-semibold text-gray-800 block mb-0.5">Measurement Advice:</span>
              Measure around the fullest part of your bust and natural waistline. If you fall between sizes, we recommend sizing up.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          6. ALL OFFERS MODAL (Point 17)
          ======================================================== */}
      {showAllOffersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-2xl relative space-y-4 border border-[#E8DFD0]">
            <button
              type="button"
              onClick={() => setShowAllOffersModal(false)}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700"
              aria-label="Close Offers"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#B58A3C]" />
              <h3 className="font-serif text-xl font-bold text-[#5E1224]">All Available Offers</h3>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {coupons.map((c) => {
                const isCopied = copiedCoupon === c.code;
                return (
                  <div
                    key={c.id}
                    className="p-3 rounded-none border border-[#E8DFD0] bg-[#FCF8F0] flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-mono text-xs font-bold text-[#5E1224] bg-white px-2 py-0.5 rounded-none border border-[#E8DFD0]">
                        {c.code}
                      </span>
                      <p className="text-xs font-semibold text-gray-900 mt-1">
                        {c.type === 'PERCENT' ? `${Math.round(c.value)}% Discount` : `Flat ₹${Math.round(c.value)} Discount`}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Min. order value: {formatPrice(c.min_order_value)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyCoupon(c.code)}
                      className="shrink-0 px-3 py-1.5 rounded-none text-xs font-semibold bg-white border border-[#E8DFD0] text-[#5E1224] hover:bg-[#5E1224] hover:text-white transition-colors"
                    >
                      {isCopied ? 'COPIED ✓' : 'COPY'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          7. MOBILE STICKY ADD TO CART & BUY NOW BAR (Point 1 & PDF Page 13)
          ======================================================== */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FCF8F0]/98 backdrop-blur-md border-t border-[#E8DFD0] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-xl flex items-center justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-gray-900 truncate">{product.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="price-display text-xs font-bold text-[#5E1224]">
              {formatPrice(displaySellingPrice)}
            </span>
            {selectedVariant ? (
              <span className="text-[10px] text-gray-500 font-medium truncate">
                &bull; Size {selectedVariant.size} {selectedVariant.colour ? `(${selectedVariant.colour})` : ''}
              </span>
            ) : isColorSoldOut ? (
              <span className="text-[10px] text-red-600 font-bold truncate">Sold out in {selectedColor}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isSoldOut || isColorSoldOut || !isVariantValidAndAvailable || btnState === 'adding'}
            onClick={handleAddToCart}
            className="px-3 py-2.5 rounded-none bg-[#5E1224] hover:bg-[#3A080F] disabled:bg-gray-300 disabled:cursor-not-allowed text-[#FCF8F0] font-ui font-semibold text-[11px] uppercase tracking-wider shadow flex items-center gap-1"
          >
            {btnState === 'adding' ? (
              <span>...</span>
            ) : btnState === 'added' ? (
              <span className="text-[#B58A3C]">Added ✓</span>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Add</span>
              </>
            )}
          </button>
          <button
            type="button"
            disabled={isSoldOut || isColorSoldOut || !isVariantValidAndAvailable}
            onClick={handleBuyNow}
            className="px-3 py-2.5 rounded-none border border-[#5E1224] bg-[#FCF8F0] text-[#5E1224] hover:bg-[#5E1224] hover:text-[#FCF8F0] disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed font-ui font-semibold text-[11px] uppercase tracking-wider"
          >
            Buy Now
          </button>
        </div>
      </div>
    </div>
  );
};
