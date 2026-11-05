import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Sparkles, ArrowRight } from 'lucide-react';
import { Product } from '../types/product';
import { formatPrice } from '../lib/api';
import { useWishlist } from '../context/WishlistContext';
import { ProductCard } from './ProductCard';

interface FeaturedSliderProps {
  products: Product[];
  title?: string;
  subtitle?: string;
}

export const FeaturedSlider: React.FC<FeaturedSliderProps> = ({
  products,
  title = 'ICONIC ATELIER SILHOUETTES',
  subtitle = 'Explore signature handcrafted pieces from our seasonal and festive collections.',
}) => {
  const { isInWishlist, toggleWishlist } = useWishlist();

  // Filter products that have valid images
  const validProducts = products.filter(
    (p) => p.primary_image || (p.images && p.images.length > 0)
  );

  const total = validProducts.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  // Touch Swipe Gesture Tracking
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState<number>(0);
  const stageRef = useRef<HTMLDivElement>(null);

  // Circular navigation: advances smoothly through all pieces
  const nextSlide = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevSlide = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Autoplay Effect: pauses on card hover or touch/interaction, respects reduced motion
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || isHovered || isInteracting || total <= 1) {
      return;
    }

    const timer = setInterval(() => {
      nextSlide();
    }, 4800);

    return () => clearInterval(timer);
  }, [isHovered, isInteracting, nextSlide, total]);

  // Desktop Mouse Wheel & Trackpad Navigation
  // ONLY activates when cursor is directly over the photos / cards!
  useEffect(() => {
    const el = stageRef.current;
    if (!el || total <= 1) return;

    let wheelAccumulator = 0;
    let lastWheelTime = 0;
    const COOLDOWN_MS = 400;
    const THRESHOLD = 30;

    const onWheel = (e: WheelEvent) => {
      // STRICT CHECK: Only intercept wheel if the cursor is directly on a product photo/card
      const targetEl = e.target as HTMLElement | null;
      const isOverCard = Boolean(targetEl?.closest('[data-testid^="slider-card-"]'));
      if (!isOverCard) {
        // Outside photos: allow normal vertical page scrolling
        return;
      }

      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      // Dominant horizontal trackpad swipe
      if (absX > absY) {
        if (absX < 5) return;
        e.preventDefault();
        const now = performance.now();
        if (now - lastWheelTime < COOLDOWN_MS) return;

        wheelAccumulator += e.deltaX;
        if (wheelAccumulator >= THRESHOLD) {
          nextSlide();
          lastWheelTime = now;
          wheelAccumulator = 0;
        } else if (wheelAccumulator <= -THRESHOLD) {
          prevSlide();
          lastWheelTime = now;
          wheelAccumulator = 0;
        }
        return;
      }

      // Vertical mouse wheel over photo: controlled stepping with non-trapping boundaries
      if (absY < 5) return;

      // Allow natural vertical page scroll when at start or end of deliberate sequence
      if (currentIndex === 0 && e.deltaY < 0) {
        wheelAccumulator = 0;
        return;
      }
      if (currentIndex === total - 1 && e.deltaY > 0) {
        wheelAccumulator = 0;
        return;
      }

      // Directly over card: smoothly step 1 card horizontally
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheelTime < COOLDOWN_MS) return;

      wheelAccumulator += e.deltaY;
      if (wheelAccumulator >= THRESHOLD) {
        nextSlide();
        lastWheelTime = now;
        wheelAccumulator = 0;
      } else if (wheelAccumulator <= -THRESHOLD) {
        prevSlide();
        lastWheelTime = now;
        wheelAccumulator = 0;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [currentIndex, total, nextSlide, prevSlide]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextSlide();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCurrentIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCurrentIndex(Math.max(0, total - 1));
    }
  };

  // Touch Swipe Handlers for Mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsInteracting(true);
    setTouchStartX(e.touches[0].clientX);
    setTouchDeltaX(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    setTouchDeltaX(currentX - touchStartX);
  };

  const handleTouchEnd = () => {
    if (touchDeltaX > 40) {
      prevSlide();
    } else if (touchDeltaX < -40) {
      nextSlide();
    }
    setTouchStartX(null);
    setTouchDeltaX(0);
    setIsInteracting(false);
  };

  // Fallback: if fewer than 3 items, render clean responsive grid
  if (total < 3) {
    if (total === 0) return null;
    return (
      <section
        data-testid="featured-slider-fallback"
        className="py-10 sm:py-14 bg-[#FAF7F2] border-y border-[#E8DFD0]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-6 sm:mb-8 space-y-2">
            <div className="inline-flex items-center justify-center gap-2">
              <span className="w-8 h-[1px] bg-[#B58A3C]" />
              <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#B58A3C]" />
                CURATED MASTERPIECES
              </span>
              <span className="w-8 h-[1px] bg-[#B58A3C]" />
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] tracking-tight">{title}</h2>
            <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto font-light leading-relaxed">{subtitle}</p>
          </div>
          <div
            className={`grid gap-6 mx-auto ${
              total === 1 ? 'max-w-sm grid-cols-1' : 'max-w-2xl grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {validProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Calculate shortest circular offset from currentIndex so all 3 cards are always visible
  const getOffset = (index: number) => {
    let offset = (index - currentIndex + total) % total;
    if (offset > total / 2) {
      offset -= total;
    }
    return offset;
  };

  // Dynamic 3D transform positioning for smooth card gliding across any screen width
  const getCardStyle = (offset: number) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const isTablet = typeof window !== 'undefined' && window.innerWidth >= 640 && window.innerWidth < 1024;
    const spacing = isMobile ? 290 : isTablet ? 340 : 380;
    const dragOffset = offset === 0 ? touchDeltaX : touchDeltaX * 0.35;
    const translateX = offset * spacing + dragOffset;

    if (offset === 0) {
      return {
        transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(${isMobile ? 1.0 : 1.04})`,
        zIndex: 30,
        opacity: 1,
        pointerEvents: 'auto' as const,
      };
    }
    if (offset === 1 || offset === -1) {
      return {
        transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(${isMobile ? 0.85 : 0.88})`,
        zIndex: 20,
        opacity: isMobile ? 0.45 : 0.65,
        pointerEvents: 'auto' as const,
      };
    }
    if (offset === 2 || offset === -2) {
      return {
        transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(0.76)`,
        zIndex: 10,
        opacity: 0,
        pointerEvents: 'none' as const,
      };
    }
    return {
      transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(0.7)`,
      zIndex: 0,
      opacity: 0,
      pointerEvents: 'none' as const,
    };
  };

  return (
    <section
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Iconic Atelier Silhouettes product collection"
      className="py-10 sm:py-14 bg-[#FAF7F2] border-y border-[#E8DFD0] overflow-hidden select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B58A3C] focus-visible:ring-offset-2"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8 space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-8 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#B58A3C]" />
              CURATED MASTERPIECES
            </span>
            <span className="w-8 h-[1px] bg-[#B58A3C]" />
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] tracking-tight">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Carousel Stage: ONLY this area intercepts wheel when cursor is over the cards */}
        <div
          ref={stageRef}
          data-testid="featured-slider-stage"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="relative min-h-[460px] sm:min-h-[520px] overflow-hidden flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {validProducts.map((product, idx) => {
            const offset = getOffset(idx);
            // Render visible cards (-2 to +2) for smooth enter/exit animations
            if (Math.abs(offset) > 2) return null;

            const isCenter = offset === 0;
            const isLeft = offset === -1;
            const isRight = offset === 1;
            const cardStyle = getCardStyle(offset);
            const imageSrc = product.primary_image || product.images?.[0]?.url;

            // Calculate unique in-stock size values from actual variant data
            const hasVariantData = Array.isArray(product.variants) && product.variants.length > 0;
            const uniqueInStockSizes = hasVariantData
              ? Array.from(
                  new Set(
                    product.variants
                      .filter(
                        (v) =>
                          typeof v.stock === 'number' &&
                          v.stock > 0 &&
                          typeof v.size === 'string' &&
                          v.size.trim().length > 0
                      )
                      .map((v) => v.size.trim().toUpperCase())
                  )
                )
              : [];
            const inStockSizeCount = uniqueInStockSizes.length;
            const isSoldOut =
              (hasVariantData && inStockSizeCount === 0) ||
              (!hasVariantData && typeof product.total_stock === 'number' && product.total_stock === 0);

            return (
              <div
                key={product.id}
                data-testid={`slider-card-${offset}`}
                onClick={() => {
                  if (isLeft) prevSlide();
                  if (isRight) nextSlide();
                }}
                className={`absolute top-1/2 left-1/2 w-[270px] sm:w-[320px] lg:w-[360px] aspect-[3/4] bg-white border cursor-pointer select-none ${
                  isCenter
                    ? 'border-[#B58A3C] shadow-2xl cursor-default'
                    : 'border-[#E8DFD0] shadow-md hover:border-[#B58A3C]/70'
                }`}
                style={{
                  ...cardStyle,
                  transition: touchStartX !== null
                    ? 'none'
                    : 'transform 700ms cubic-bezier(0.25, 1, 0.5, 1), opacity 700ms cubic-bezier(0.25, 1, 0.5, 1)',
                  willChange: 'transform, opacity',
                }}
              >
                <div className="relative w-full h-full overflow-hidden group">
                  {/* Product Image */}
                  <img
                    src={imageSrc}
                    alt={product.name}
                    className={`w-full h-full object-cover object-top transition-transform duration-700 ease-out ${
                      isCenter ? 'group-hover:scale-[1.03]' : ''
                    }`}
                    loading={isCenter || isLeft || isRight ? 'eager' : 'lazy'}
                  />

                  {/* Gradient Overlay: Deep gradient ensuring legible 2-line title and details */}
                  <div
                    className={`absolute inset-0 transition-opacity ${
                      isCenter
                        ? 'bg-gradient-to-t from-black/95 via-black/45 to-transparent'
                        : 'bg-black/30 group-hover:bg-black/20'
                    }`}
                  />

                  {/* Badge: Category / Collection */}
                  <div className="absolute top-4 left-4 z-20">
                    <span className="px-2.5 py-1 text-[10px] sm:text-[11px] uppercase tracking-widest font-semibold bg-[#5E1224] text-[#FCF8F0] shadow-md">
                      {product.badges?.[0] || 'New'}
                    </span>
                  </div>

                  {/* Wishlist Button */}
                  {isCenter && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleWishlist(product.id);
                      }}
                      className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-white/95 text-gray-800 hover:text-[#5E1224] flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#B58A3C]"
                      aria-label={
                        isInWishlist(product.id)
                          ? `Remove ${product.name} from wishlist`
                          : `Add ${product.name} to wishlist`
                      }
                      title={isInWishlist(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                    >
                      <Heart
                        className={`w-4 h-4 transition-transform duration-200 ${
                          isInWishlist(product.id)
                            ? 'fill-[#5E1224] text-[#5E1224] animate-heart-pop'
                            : 'text-gray-700'
                        }`}
                      />
                    </button>
                  )}

                  {/* Center Card Content Overlay */}
                  {isCenter ? (
                    <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 text-left space-y-2 z-20">
                      {/* Category & Pricing */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] sm:text-xs uppercase tracking-widest text-[#D4AF67] font-semibold font-ui">
                          {product.category || 'Atelier Exclusive'}
                        </span>
                        <div className="text-right">
                          <span className="font-serif text-sm sm:text-base font-bold text-white tracking-wide">
                            {(() => {
                              const purchasable = (product.variants || []).filter((v) => v.is_active && v.stock > 0);
                              const eligiblePrices = purchasable.map((v) => Number(v.selling_price));
                              const minPrice = eligiblePrices.length > 0 ? Math.min(...eligiblePrices) : (product.min_price ? Number(product.min_price) : null);
                              const maxPrice = eligiblePrices.length > 0 ? Math.max(...eligiblePrices) : (product.max_price ? Number(product.max_price) : null);
                              const hasRange = minPrice !== null && maxPrice !== null && minPrice !== maxPrice;
                              if (minPrice === null || product.total_stock === 0) return 'Sold Out';
                              return `${hasRange ? 'From ' : ''}${formatPrice(minPrice)}`;
                            })()}
                          </span>
                        </div>
                      </div>

                      {/* Product Title */}
                      <h3 className="font-serif text-base sm:text-xl font-bold text-white group-hover:text-[#D4AF67] transition-colors leading-snug line-clamp-2 drop-shadow-md">
                        {product.name}
                      </h3>

                      {/* Action Links & Availability */}
                      <div className="pt-1 sm:pt-2 flex items-center justify-between gap-2">
                        <Link
                          to={`/product/${product.slug}`}
                          className="inline-flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-semibold text-[#FCF8F0] hover:text-[#D4AF67] group-hover:underline tracking-wider uppercase font-ui shrink-0 focus:outline-none focus:underline"
                          aria-label={`Explore piece ${product.name}`}
                        >
                          <span>Explore Piece</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#B58A3C] group-hover:translate-x-1 transition-transform" />
                        </Link>
                        {hasVariantData && inStockSizeCount > 0 ? (
                          <span className="text-[9.5px] sm:text-[10px] text-[#FCF8F0]/80 font-mono tracking-wider shrink-0">
                            {inStockSizeCount} {inStockSizeCount === 1 ? 'size' : 'sizes'} in stock
                          </span>
                        ) : isSoldOut ? (
                          <span className="text-[9.5px] sm:text-[10px] text-amber-200 font-mono tracking-wider uppercase font-semibold shrink-0">
                            Sold out
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    /* Neighbor Card Preview Label */
                    <div className="absolute bottom-3 left-3 right-3 text-left">
                      <span className="text-[9px] uppercase tracking-widest text-[#D4AF67] font-semibold block">
                        {product.category || 'Atelier'}
                      </span>
                      <p className="font-serif text-xs font-bold text-white line-clamp-1 drop-shadow">
                        {product.name}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturedSlider;
