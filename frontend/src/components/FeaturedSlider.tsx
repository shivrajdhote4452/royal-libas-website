import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pause, Play, Heart, Sparkles, ArrowRight } from 'lucide-react';
import { Product } from '../types/product';
import { formatPrice } from '../lib/api';
import { useWishlist } from '../context/WishlistContext';

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

  // Robust Autoplay State Machine: Separate manual user pause from transient hover/touch
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  // Touch Swipe Gesture Tracking
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState<number>(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const nextSlide = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevSlide = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Autoplay Effect: strictly respects manual pause, hover, interaction, and reduced motion
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // NEVER autoplay if manually paused, hovered, interacting, or prefers reduced motion
    if (prefersReducedMotion || isManuallyPaused || isHovered || isInteracting || total <= 1) {
      return;
    }

    const timer = setInterval(() => {
      nextSlide();
    }, 5500);

    return () => clearInterval(timer);
  }, [isManuallyPaused, isHovered, isInteracting, nextSlide, total]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      nextSlide();
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
    if (touchDeltaX > 45) {
      prevSlide();
    } else if (touchDeltaX < -45) {
      nextSlide();
    }
    setTouchStartX(null);
    setTouchDeltaX(0);
    setIsInteracting(false);
  };

  // Toggle user-explicit pause/play
  const togglePlayPause = () => {
    setIsManuallyPaused((prev) => !prev);
  };

  // Fallback: if fewer than 3 items, do not render a broken slider
  if (total < 3) {
    return null;
  }

  // Calculate shortest circular offset for each card
  const getOffset = (idx: number) => {
    let diff = idx - currentIndex;
    while (diff > total / 2) diff -= total;
    while (diff < -total / 2) diff += total;
    return diff;
  };

  // Dynamic 3D transform positioning for smooth card gliding
  const getCardStyle = (offset: number) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const spacing = isMobile ? 310 : 400;
    const dragOffset = offset === 0 ? touchDeltaX : touchDeltaX * 0.4;
    const translateX = offset * spacing + dragOffset;

    if (offset === 0) {
      return {
        transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(${isMobile ? 1.0 : 1.05})`,
        zIndex: 30,
        opacity: 1,
        filter: 'none',
        pointerEvents: 'auto' as const,
      };
    }
    if (offset === 1) {
      return {
        transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(${isMobile ? 0.86 : 0.88})`,
        zIndex: 20,
        opacity: isMobile ? 0.45 : 0.65,
        filter: 'blur(0.5px)',
        pointerEvents: 'auto' as const,
      };
    }
    if (offset === -1) {
      return {
        transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(${isMobile ? 0.86 : 0.88})`,
        zIndex: 20,
        opacity: isMobile ? 0.45 : 0.65,
        filter: 'blur(0.5px)',
        pointerEvents: 'auto' as const,
      };
    }
    if (offset === 2) {
      return {
        transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(0.75)`,
        zIndex: 10,
        opacity: 0,
        filter: 'blur(1px)',
        pointerEvents: 'none' as const,
      };
    }
    if (offset === -2) {
      return {
        transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(0.75)`,
        zIndex: 10,
        opacity: 0,
        filter: 'blur(1px)',
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

  const formattedCounter = `${String(currentIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

  return (
    <section
      ref={sliderRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Featured royal silhouettes carousel"
      className="py-14 sm:py-20 bg-[#FAF7F2] border-y border-[#E8DFD0] overflow-hidden select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B58A3C]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14 space-y-2">
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

        {/* Carousel Stage: Smooth 3D Track with Physically Moving Cards */}
        <div
          data-testid="featured-slider-stage"
          className="relative min-h-[470px] sm:min-h-[530px] overflow-hidden flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
        >
          {validProducts.map((product, idx) => {
            const offset = getOffset(idx);
            // Render only cards in visible neighborhood (-2 to +2) for peak performance
            if (Math.abs(offset) > 2) return null;

            const isCenter = offset === 0;
            const isLeft = offset === -1;
            const isRight = offset === 1;
            const cardStyle = getCardStyle(offset);
            const imageSrc = product.primary_image || product.images?.[0]?.url;

            return (
              <div
                key={product.id}
                data-testid={`slider-card-${offset}`}
                onClick={() => {
                  if (isLeft) prevSlide();
                  if (isRight) nextSlide();
                }}
                className={`absolute top-1/2 left-1/2 w-[280px] sm:w-[350px] lg:w-[390px] aspect-[3/4] bg-white border cursor-pointer select-none ${
                  isCenter
                    ? 'border-[#B58A3C] shadow-2xl cursor-default'
                    : 'border-[#E8DFD0] shadow-md hover:border-[#B58A3C]/70'
                }`}
                style={{
                  ...cardStyle,
                  transition: touchStartX !== null
                    ? 'none'
                    : 'transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 480ms cubic-bezier(0.22, 1, 0.36, 1), filter 480ms ease-out',
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
                    loading={isCenter ? 'eager' : 'lazy'}
                  />

                  {/* Gradient Overlay */}
                  <div
                    className={`absolute inset-0 transition-opacity ${
                      isCenter
                        ? 'bg-gradient-to-t from-black/85 via-black/20 to-transparent'
                        : 'bg-black/35 group-hover:bg-black/20'
                    }`}
                  />

                  {/* Wishlist Button (Only active on Center Card) */}
                  {isCenter && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleWishlist(product.id);
                      }}
                      className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-white/95 text-gray-800 hover:text-[#5E1224] flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
                      aria-label={
                        isInWishlist(product.id)
                          ? `Remove ${product.name} from wishlist`
                          : `Add ${product.name} to wishlist`
                      }
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

                  {/* Top Badge */}
                  <div className="absolute top-4 left-4 z-20">
                    <span
                      className={`inline-block px-3 py-1 text-[10px] uppercase font-bold tracking-[0.2em] shadow-md ${
                        isCenter
                          ? 'bg-[#5E1224] text-[#FCF8F0] border border-[#B58A3C]/50'
                          : 'bg-[#2B1B1E]/80 text-[#FCF8F0]'
                      }`}
                    >
                      {product.badges?.[0] || 'HANDCRAFTED'}
                    </span>
                  </div>

                  {/* Center Card Editorial Details */}
                  {isCenter ? (
                    <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 text-left space-y-2 z-20">
                      <div className="flex items-center justify-between text-[#D4AF67] text-[10px] font-semibold tracking-[0.2em] uppercase">
                        <span>{product.fabric || product.category || 'Pure Silk'}</span>
                        <span className="font-mono text-white text-xs">
                          {formatPrice(product.min_price)}
                        </span>
                      </div>

                      <h3 className="font-serif text-lg sm:text-xl font-bold text-white group-hover:text-[#D4AF67] transition-colors leading-snug line-clamp-1 drop-shadow-md">
                        {product.name}
                      </h3>

                      <div className="pt-2 flex items-center justify-between">
                        <Link
                          to={`/product/${product.slug}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FCF8F0] hover:text-[#D4AF67] group-hover:underline tracking-wider uppercase font-ui"
                          aria-label={`Explore piece ${product.name}`}
                        >
                          <span>Explore Piece</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#B58A3C] group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <span className="text-[10px] text-[#FCF8F0]/70 font-mono">
                          {product.variants?.length || 1} sizes available
                        </span>
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

        {/* ========================================================
            NAVIGATION CONTROLS & PAGINATION
            ======================================================== */}
        <div className="mt-8 sm:mt-10 flex items-center justify-center gap-6">
          {/* Previous Button */}
          <button
            type="button"
            onClick={prevSlide}
            aria-label="Previous slide"
            className="w-10 h-10 rounded-full border border-[#B58A3C] bg-white text-[#5E1224] hover:bg-[#5E1224] hover:text-white transition-all shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#B58A3C]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Counter Display & Play/Pause */}
          <div className="flex items-center gap-3 bg-white px-4 py-1.5 rounded-full border border-[#E8DFD0] shadow-sm text-xs">
            <span
              data-testid="slider-counter"
              className="font-mono font-bold text-[#5E1224] tracking-widest text-xs"
            >
              {formattedCounter}
            </span>
            <span className="w-3 h-[1px] bg-gray-300" />
            <button
              type="button"
              data-testid="slider-play-pause-btn"
              onClick={togglePlayPause}
              className="text-gray-500 hover:text-[#5E1224] transition-colors p-1 focus:outline-none focus:ring-1 focus:ring-[#B58A3C] rounded"
              aria-label={isManuallyPaused ? 'Play automatic carousel' : 'Pause automatic carousel'}
              title={isManuallyPaused ? 'Play' : 'Pause'}
            >
              {isManuallyPaused ? (
                <Play className="w-3.5 h-3.5 text-gray-700 hover:text-[#5E1224]" />
              ) : (
                <Pause className="w-3.5 h-3.5 text-gray-700 hover:text-[#5E1224]" />
              )}
            </button>
          </div>

          {/* Next Button */}
          <button
            type="button"
            onClick={nextSlide}
            aria-label="Next slide"
            className="w-10 h-10 rounded-full border border-[#B58A3C] bg-white text-[#5E1224] hover:bg-[#5E1224] hover:text-white transition-all shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#B58A3C]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Dot Pagination */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {validProducts.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none ${
                idx === currentIndex
                  ? 'w-6 bg-[#5E1224]'
                  : 'w-2 bg-[#D4AF67]/50 hover:bg-[#B58A3C]'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
