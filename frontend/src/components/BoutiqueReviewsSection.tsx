import React, { useState, useEffect, useRef } from 'react';
import {
  Star,
  ExternalLink,
  Quote,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';
import { useStoreSettings, BoutiqueReviewItem } from '../lib/settings';

function getInitials(name: string): string {
  if (!name) return 'RL';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const BoutiqueReviewsSection: React.FC = () => {
  const { settings } = useStoreSettings();

  // If the owner hasn't published the reviews section, or there are no published reviews, do not render
  if (!settings.boutiqueReviewsVisible) {
    return null;
  }

  const publishedReviews: BoutiqueReviewItem[] = (settings.boutiqueReviews || [])
    .filter((r) => r.is_published)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .slice(0, 6);

  if (publishedReviews.length === 0) {
    return null;
  }

  const googleListingUrl =
    settings.boutiqueReviewsUrl ||
    settings.boutiqueDirectionsUrl ||
    'https://share.google/rdahckZ4nVz7Bgu2H';

  // Responsive items-per-view tracking
  const [itemsPerView, setItemsPerView] = useState<number>(3);
  useEffect(() => {
    const updateView = () => {
      if (window.innerWidth < 768) {
        setItemsPerView(1);
      } else if (window.innerWidth < 1024) {
        setItemsPerView(2);
      } else {
        setItemsPerView(3);
      }
    };
    updateView();
    window.addEventListener('resize', updateView);
    return () => window.removeEventListener('resize', updateView);
  }, []);

  // Carousel state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});

  // Touch swipe support
  const touchStartXRef = useRef<number | null>(null);

  const isCarousel = publishedReviews.length >= 3;
  const maxIndex = Math.max(0, publishedReviews.length - itemsPerView + 1);

  // Auto-play loop with reading interval
  useEffect(() => {
    if (!isCarousel) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isPlaying || isHovered || isFocused || isTouched || prefersReducedMotion) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1 >= maxIndex ? 0 : prev + 1));
    }, 5500);

    return () => clearInterval(interval);
  }, [isCarousel, isPlaying, isHovered, isFocused, isTouched, maxIndex]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 < 0 ? maxIndex - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1 >= maxIndex ? 0 : prev + 1));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsTouched(true);
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsTouched(false);
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartXRef.current - touchEndX;
    if (diff > 45) {
      handleNext();
    } else if (diff < -45) {
      handlePrev();
    }
    touchStartXRef.current = null;
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What Our Customers Say"
      className="w-full bg-[#FAF5EC] border-b border-[#B58A3C]/25 py-14 sm:py-20 px-4 sm:px-6 lg:px-8 select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={() => setIsFocused(false)}
    >
      <div className="max-w-6xl mx-auto space-y-10">
        {/* ========================================================
            HEADER: Heading & Exact Labels Required
            ======================================================== */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
              Selected Positive Google Reviews
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>

          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#5E1224] tracking-tight">
            What Our Customers Say
          </h2>

          <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
            Genuine experiences shared by verified patrons visiting our boutique and commissioning bespoke designs.
          </p>
        </div>

        {/* ========================================================
            CAROUSEL CONTROLS BAR (Play/Pause, Prev, Next, Indicator)
            Shown when enough reviews exist for a meaningful carousel
            ======================================================== */}
        {isCarousel && (
          <div className="flex items-center justify-between max-w-5xl mx-auto px-1 text-xs">
            <div className="flex items-center gap-2">
              {/* Play / Pause Toggle Button */}
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[#B58A3C]/40 text-[#5E1224] text-[11px] font-medium rounded-none hover:bg-[#5E1224] hover:text-[#FCF8F0] transition-colors focus:outline-none focus:ring-2 focus:ring-[#5E1224]"
                aria-label={isPlaying ? 'Pause review carousel' : 'Play review carousel'}
                title={isPlaying ? 'Pause automatic movement' : 'Start automatic movement'}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3 text-[#B58A3C]" />
                    <span className="hidden sm:inline">Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 text-[#B58A3C]" />
                    <span className="hidden sm:inline">Play</span>
                  </>
                )}
              </button>

              <span className="text-[11px] text-gray-500 font-mono">
                {currentIndex + 1} / {maxIndex}
              </span>
            </div>

            {/* Prev / Next Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrev}
                className="p-2 bg-white border border-[#B58A3C]/40 text-[#5E1224] hover:bg-[#5E1224] hover:text-[#FCF8F0] transition-colors focus:outline-none focus:ring-2 focus:ring-[#5E1224]"
                aria-label="Previous customer review"
                title="Previous review"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="p-2 bg-white border border-[#B58A3C]/40 text-[#5E1224] hover:bg-[#5E1224] hover:text-[#FCF8F0] transition-colors focus:outline-none focus:ring-2 focus:ring-[#5E1224]"
                aria-label="Next customer review"
                title="Next review"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            CAROUSEL TRACK / VIEWPORT OR CLEAN STATIC ROW
            ======================================================== */}
        <div
          className="relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          aria-live={isPlaying ? 'off' : 'polite'}
        >
          {isCarousel ? (
            /* Carousel Multi-card Slide Track */
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{
                transform: `translateX(-${currentIndex * (100 / itemsPerView)}%)`,
              }}
            >
              {publishedReviews.map((review) => {
                const starsCount = Math.min(5, Math.max(1, Math.round(review.rating || 5)));
                const isLong = review.review_text.length > 150;
                const isExpanded = !!expandedReviews[review.id];
                const displayText =
                  isLong && !isExpanded
                    ? `${review.review_text.slice(0, 145)}...`
                    : review.review_text;

                return (
                  <div
                    key={review.id}
                    className="w-full md:w-1/2 lg:w-1/3 shrink-0 p-2.5 sm:p-3"
                  >
                    <div className="bg-[#FCF8F0] p-6 sm:p-7 border border-[#B58A3C]/40 shadow-sm flex flex-col justify-between h-full relative group hover:border-[#5E1224]/50 hover:shadow-md transition-all">
                      <Quote className="w-7 h-7 text-[#B58A3C]/20 absolute top-5 right-5 pointer-events-none" />

                      <div className="space-y-3.5">
                        {/* Rating Stars & Google Attribution */}
                        <div className="flex items-center justify-between">
                          <div
                            className="flex items-center gap-1"
                            aria-label={`Rating: ${review.rating} out of 5 stars`}
                          >
                            {Array.from({ length: 5 }).map((_, idx) => (
                              <Star
                                key={idx}
                                className={`w-3.5 h-3.5 ${
                                  idx < starsCount
                                    ? 'text-[#B58A3C] fill-[#B58A3C]'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>

                          <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-white/80 px-2 py-0.5 border border-gray-200">
                            <span className="font-bold text-[#4285F4]">G</span>
                            <span>Google Review</span>
                          </div>
                        </div>

                        {/* Review Text */}
                        <div className="text-xs sm:text-[13px] text-gray-800 font-light leading-relaxed italic">
                          &ldquo;{displayText}&rdquo;
                          {isLong && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedReviews((prev) => ({
                                  ...prev,
                                  [review.id]: !isExpanded,
                                }))
                              }
                              className="text-[11px] font-semibold text-[#5E1224] not-italic hover:underline ml-1.5 inline-block focus:outline-none"
                            >
                              {isExpanded ? 'Read less' : 'Read more'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reviewer Meta & Initials Avatar */}
                      <div className="pt-4 mt-4 border-t border-[#B58A3C]/20 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2.5">
                          {/* Initials Avatar */}
                          <div className="w-8 h-8 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/50 text-[#5E1224] font-serif font-bold text-xs flex items-center justify-center shrink-0">
                            {getInitials(review.author_name)}
                          </div>
                          <div>
                            <p className="font-serif font-bold text-gray-900 leading-tight">
                              {review.author_name}
                            </p>
                            {review.review_date && (
                              <p className="text-gray-500 font-mono text-[10px]">
                                {review.review_date}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="text-[10px] font-semibold text-[#B58A3C] uppercase tracking-wider">
                          Verified Visit
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Clean Static Grid for <3 Reviews (Prevents duplicate cards) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {publishedReviews.map((review) => {
                const starsCount = Math.min(5, Math.max(1, Math.round(review.rating || 5)));
                const isLong = review.review_text.length > 150;
                const isExpanded = !!expandedReviews[review.id];
                const displayText =
                  isLong && !isExpanded
                    ? `${review.review_text.slice(0, 145)}...`
                    : review.review_text;

                return (
                  <div
                    key={review.id}
                    className="bg-[#FCF8F0] p-6 sm:p-7 border border-[#B58A3C]/40 shadow-sm flex flex-col justify-between relative group hover:border-[#5E1224]/50 hover:shadow-md transition-all"
                  >
                    <Quote className="w-7 h-7 text-[#B58A3C]/20 absolute top-5 right-5 pointer-events-none" />

                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-1"
                          aria-label={`Rating: ${review.rating} out of 5 stars`}
                        >
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <Star
                              key={idx}
                              className={`w-3.5 h-3.5 ${
                                idx < starsCount
                                  ? 'text-[#B58A3C] fill-[#B58A3C]'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>

                        <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-white/80 px-2 py-0.5 border border-gray-200">
                          <span className="font-bold text-[#4285F4]">G</span>
                          <span>Google Review</span>
                        </div>
                      </div>

                      <div className="text-xs sm:text-[13px] text-gray-800 font-light leading-relaxed italic">
                        &ldquo;{displayText}&rdquo;
                        {isLong && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReviews((prev) => ({
                                ...prev,
                                [review.id]: !isExpanded,
                              }))
                            }
                            className="text-[11px] font-semibold text-[#5E1224] not-italic hover:underline ml-1.5 inline-block focus:outline-none"
                          >
                            {isExpanded ? 'Read less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-[#B58A3C]/20 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/50 text-[#5E1224] font-serif font-bold text-xs flex items-center justify-center shrink-0">
                          {getInitials(review.author_name)}
                        </div>
                        <div>
                          <p className="font-serif font-bold text-gray-900 leading-tight">
                            {review.author_name}
                          </p>
                          {review.review_date && (
                            <p className="text-gray-500 font-mono text-[10px]">
                              {review.review_date}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className="text-[10px] font-semibold text-[#B58A3C] uppercase tracking-wider">
                        Verified Visit
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================
            FOOTER ACTION: Read All Reviews on Google Link
            ======================================================== */}
        <div className="text-center pt-2">
          <a
            href={googleListingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white hover:bg-[#FCF8F0] text-[#5E1224] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-all border border-[#B58A3C] hover:border-[#5E1224] shadow-sm group min-h-[44px]"
          >
            <span>Read All Reviews on Google</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#B58A3C] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
};
