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
  title = 'ICONIC ATELIER CREATIONS',
  subtitle = 'Discover our most coveted royal silhouettes, handcrafted with centuries-old needlework.',
}) => {
  const { isInWishlist, toggleWishlist } = useWishlist();

  // Filter products that have valid images
  const validProducts = products.filter(
    (p) => p.primary_image || (p.images && p.images.length > 0)
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState<number>(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const total = validProducts.length;

  const nextSlide = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevSlide = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Autoplay effect with pause on user interaction or reduced motion
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || !isPlaying || total <= 1) return;

    const timer = setInterval(() => {
      nextSlide();
    }, 5500);

    return () => clearInterval(timer);
  }, [isPlaying, nextSlide, total]);

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
    setTouchStartX(e.touches[0].clientX);
    setTouchDeltaX(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    setTouchDeltaX(currentX - touchStartX);
  };

  const handleTouchEnd = () => {
    if (touchDeltaX > 50) {
      prevSlide();
    } else if (touchDeltaX < -50) {
      nextSlide();
    }
    setTouchStartX(null);
    setTouchDeltaX(0);
  };

  // Fallback: if fewer than 3 items, render clean responsive grid
  if (total < 3) {
    return null;
  }

  // Get circular index helper
  const getProductAt = (offset: number) => {
    const idx = (currentIndex + offset + total) % total;
    return { product: validProducts[idx], index: idx };
  };

  const leftItem = getProductAt(-1);
  const centerItem = getProductAt(0);
  const rightItem = getProductAt(1);

  const formattedCounter = `${String(currentIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

  return (
    <section
      ref={sliderRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Featured royal creations carousel"
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

        {/* Carousel Stage: Center Card Enlarged + Left/Right Neighbors */}
        <div
          className="relative min-h-[460px] sm:min-h-[520px] flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={() => setIsPlaying(false)}
          onMouseLeave={() => setIsPlaying(true)}
        >
          {/* ========================================================
              LEFT NEIGHBOR CARD (Desktop & Tablet Peek)
              ======================================================== */}
          <div
            onClick={prevSlide}
            role="button"
            tabIndex={-1}
            aria-label={`Previous piece: ${leftItem.product.name}`}
            className="hidden md:block absolute left-4 lg:left-12 w-64 lg:w-72 aspect-[3/4] z-10 transition-all duration-500 ease-out cursor-pointer transform -translate-y-2 scale-90 opacity-60 hover:opacity-85 filter blur-[0.5px] hover:blur-0"
          >
            <div className="w-full h-full border border-[#E8DFD0] shadow-md overflow-hidden bg-white relative">
              <img
                src={leftItem.product.primary_image || leftItem.product.images?.[0]?.url}
                alt={leftItem.product.name}
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/30 transition-opacity" />
              <div className="absolute bottom-3 left-3 right-3 text-left">
                <span className="text-[9px] uppercase tracking-widest text-[#D4AF67] font-semibold block">
                  {leftItem.product.category || 'Atelier'}
                </span>
                <p className="font-serif text-xs font-bold text-white line-clamp-1 drop-shadow">
                  {leftItem.product.name}
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================
              ACTIVE CENTER CARD (Hero Focus with Scale & Details)
              ======================================================== */}
          <div className="relative w-full max-w-sm sm:max-w-md aspect-[3/4] z-20 transition-all duration-500 ease-out transform scale-100 sm:scale-105 shadow-2xl bg-white border border-[#B58A3C]">
            <Link
              to={`/product/${centerItem.product.slug}`}
              className="block w-full h-full relative group overflow-hidden"
              aria-label={`View ${centerItem.product.name}`}
            >
              <img
                src={centerItem.product.primary_image || centerItem.product.images?.[0]?.url}
                alt={centerItem.product.name}
                className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-700 ease-out"
              />
              {/* Luxury Editorial Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent group-hover:from-black/75 transition-colors" />

              {/* Wishlist Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleWishlist(centerItem.product.id);
                }}
                className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-white/95 text-gray-800 hover:text-[#5E1224] flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                aria-label={isInWishlist(centerItem.product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <Heart
                  className={`w-4 h-4 ${
                    isInWishlist(centerItem.product.id)
                      ? 'fill-[#5E1224] text-[#5E1224]'
                      : 'text-gray-700'
                  }`}
                />
              </button>

              {/* Top Badge */}
              <div className="absolute top-4 left-4 z-20">
                <span className="inline-block px-3 py-1 bg-[#5E1224] text-[#FCF8F0] border border-[#B58A3C]/50 text-[10px] uppercase font-bold tracking-[0.2em] shadow-md">
                  {centerItem.product.badges?.[0] || 'HANDCRAFTED'}
                </span>
              </div>

              {/* Bottom Card Content Box */}
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 text-left space-y-2 z-20">
                <div className="flex items-center justify-between text-[#D4AF67] text-[10px] font-semibold tracking-[0.2em] uppercase">
                  <span>{centerItem.product.fabric || centerItem.product.category || 'Pure Silk'}</span>
                  <span className="font-mono text-white text-xs">
                    {formatPrice(centerItem.product.min_price)}
                  </span>
                </div>

                <h3 className="font-serif text-lg sm:text-xl font-bold text-white group-hover:text-[#D4AF67] transition-colors leading-snug line-clamp-1 drop-shadow-md">
                  {centerItem.product.name}
                </h3>

                <div className="pt-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FCF8F0] group-hover:underline tracking-wider uppercase font-ui">
                    <span>Explore Piece</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#B58A3C] group-hover:translate-x-1 transition-transform" />
                  </span>
                  <span className="text-[10px] text-[#FCF8F0]/70 font-mono">
                    {centerItem.product.variants?.length || 1} sizes available
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* ========================================================
              RIGHT NEIGHBOR CARD (Desktop & Tablet Peek)
              ======================================================== */}
          <div
            onClick={nextSlide}
            role="button"
            tabIndex={-1}
            aria-label={`Next piece: ${rightItem.product.name}`}
            className="hidden md:block absolute right-4 lg:right-12 w-64 lg:w-72 aspect-[3/4] z-10 transition-all duration-500 ease-out cursor-pointer transform -translate-y-2 scale-90 opacity-60 hover:opacity-85 filter blur-[0.5px] hover:blur-0"
          >
            <div className="w-full h-full border border-[#E8DFD0] shadow-md overflow-hidden bg-white relative">
              <img
                src={rightItem.product.primary_image || rightItem.product.images?.[0]?.url}
                alt={rightItem.product.name}
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/30 transition-opacity" />
              <div className="absolute bottom-3 left-3 right-3 text-left">
                <span className="text-[9px] uppercase tracking-widest text-[#D4AF67] font-semibold block">
                  {rightItem.product.category || 'Atelier'}
                </span>
                <p className="font-serif text-xs font-bold text-white line-clamp-1 drop-shadow">
                  {rightItem.product.name}
                </p>
              </div>
            </div>
          </div>
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
            className="w-10 h-10 rounded-full border border-[#B58A3C] bg-white text-[#5E1224] hover:bg-[#5E1224] hover:text-white transition-all shadow-sm flex items-center justify-center hover:scale-105 active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Counter Display & Play/Pause */}
          <div className="flex items-center gap-3 bg-white px-4 py-1.5 rounded-full border border-[#E8DFD0] shadow-sm text-xs">
            <span className="font-mono font-bold text-[#5E1224] tracking-widest text-xs">
              {formattedCounter}
            </span>
            <span className="w-3 h-[1px] bg-gray-300" />
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-gray-500 hover:text-[#5E1224] transition-colors p-1"
              aria-label={isPlaying ? 'Pause automatic carousel' : 'Play automatic carousel'}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Next Button */}
          <button
            type="button"
            onClick={nextSlide}
            aria-label="Next slide"
            className="w-10 h-10 rounded-full border border-[#B58A3C] bg-white text-[#5E1224] hover:bg-[#5E1224] hover:text-white transition-all shadow-sm flex items-center justify-center hover:scale-105 active:scale-95"
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
              className={`h-1.5 rounded-full transition-all duration-300 ${
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

