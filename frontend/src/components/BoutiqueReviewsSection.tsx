import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Star,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';
import { StoreSettings, BoutiqueReviewItem, useStoreSettings } from '../lib/settings';

function getInitials(name: string): string {
  if (!name) return 'RL';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Defensively validate review source URL on client side:
 * Strictly HTTPS and host matches verified Google domains.
 */
function isValidGoogleSourceUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    const trustedHosts = [
      'share.google',
      'search.google.com',
      'maps.google.com',
      'www.google.com',
      'google.com',
      'g.page',
      'goo.gl',
      'maps.app.goo.gl',
    ];
    if (trustedHosts.includes(host)) return true;
    if (host.endsWith('.google.com') || host.endsWith('.goo.gl')) return true;
    return false;
  } catch {
    return false;
  }
}

interface ContentProps {
  settings: StoreSettings;
}

const BoutiqueReviewsContent: React.FC<ContentProps> = ({ settings }) => {
  // Filter for owner-published reviews with actual ratings 4 or 5
  const eligibleReviews = useMemo<BoutiqueReviewItem[]>(() => {
    return (settings.boutiqueReviews || [])
      .filter((r) => {
        const rating = Number(r.rating) || 0;
        const isNotSample = r.source !== 'unverified_sample';
        return Boolean(r.is_published) && rating >= 4 && isNotSample;
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [settings.boutiqueReviews]);

  // If no eligible reviews exist, safely hide the section without errors
  if (eligibleReviews.length === 0) {
    return null;
  }

  return <BoutiqueReviewsDisplay settings={settings} reviews={eligibleReviews} />;
};

interface DisplayProps {
  settings: StoreSettings;
  reviews: BoutiqueReviewItem[];
}

const BoutiqueReviewsDisplay: React.FC<DisplayProps> = ({ settings, reviews }) => {
  const googleListingUrl =
    settings.boutiqueReviewsUrl ||
    settings.boutiqueDirectionsUrl ||
    'https://share.google/rdahckZ4nVz7Bgu2H';

  // Responsive items-per-view tracking
  const [itemsPerView, setItemsPerView] = useState<number>(3);
  useEffect(() => {
    const updateView = () => {
      if (typeof window === 'undefined') return;
      if (window.innerWidth < 640) {
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

  const isCarousel = reviews.length > itemsPerView;

  // Track and card measurement refs
  const trackRef = useRef<HTMLDivElement>(null);
  const [stepDistance, setStepDistance] = useState<number>(0);

  const measureStep = useCallback(() => {
    if (trackRef.current && trackRef.current.children.length > 1) {
      const el0 = trackRef.current.children[0] as HTMLElement;
      const el1 = trackRef.current.children[1] as HTMLElement;
      if (el0 && el1) {
        const diff = el1.offsetLeft - el0.offsetLeft;
        if (diff > 0) {
          setStepDistance(diff);
          return;
        }
      }
      if (el0) {
        setStepDistance(el0.offsetWidth + 24);
      }
    }
  }, []);

  useEffect(() => {
    measureStep();
    window.addEventListener('resize', measureStep);
    // Double measurement after next render tick to account for font loading
    const timer = setTimeout(measureStep, 150);
    return () => {
      window.removeEventListener('resize', measureStep);
      clearTimeout(timer);
    };
  }, [measureStep, reviews.length]);

  // Infinite Carousel State
  // displayIndex moves from 0 to reviews.length smoothly.
  // When it hits reviews.length (the clone of card 0), transitionEnd snaps it back to 0 instantly.
  const [displayIndex, setDisplayIndex] = useState(0);
  const [withTransition, setWithTransition] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  const touchStartXRef = useRef<number | null>(null);
  const isNavigatingRef = useRef(false);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reconcile position if review count or itemsPerView changes
  useEffect(() => {
    if (displayIndex >= reviews.length) {
      setWithTransition(false);
      setDisplayIndex(0);
      isNavigatingRef.current = false;
    }
  }, [reviews.length, itemsPerView, displayIndex]);

  // Clean up animation timeout on unmount
  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    };
  }, []);

  // Seamless Next navigation with rapid-click and overshoot prevention
  const handleNext = useCallback(() => {
    if (!isCarousel) return;

    if (prefersReducedMotion) {
      setDisplayIndex((prev) => (prev + 1) % reviews.length);
      return;
    }

    if (isNavigatingRef.current) return;

    // Guard against advancing beyond the clone track
    if (displayIndex >= reviews.length) {
      setWithTransition(false);
      setDisplayIndex(0);
      return;
    }

    isNavigatingRef.current = true;
    setWithTransition(true);
    setDisplayIndex((prev) => prev + 1);

    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
    }, 650);
  }, [isCarousel, prefersReducedMotion, displayIndex, reviews.length]);

  // Seamless Prev navigation with rapid-click and overshoot prevention
  const handlePrev = useCallback(() => {
    if (!isCarousel) return;

    if (prefersReducedMotion) {
      setDisplayIndex((prev) => (prev - 1 + reviews.length) % reviews.length);
      return;
    }

    if (isNavigatingRef.current) return;

    isNavigatingRef.current = true;
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
    }, 650);

    if (displayIndex === 0) {
      // Instantly jump to clone position without transition, then animate back
      setWithTransition(false);
      setDisplayIndex(reviews.length);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setWithTransition(true);
          setDisplayIndex(reviews.length - 1);
        });
      });
    } else {
      setWithTransition(true);
      setDisplayIndex((prev) => Math.max(0, prev - 1));
    }
  }, [isCarousel, prefersReducedMotion, displayIndex, reviews.length]);

  // On transition end, release navigation lock and snap seamlessly to 0 if at clone boundary
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    // Ensure transition-end handling ONLY responds to the intended track transform
    if (e.target !== trackRef.current || e.propertyName !== 'transform') {
      return;
    }

    if (animTimeoutRef.current) {
      clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
    isNavigatingRef.current = false;

    if (displayIndex >= reviews.length) {
      setWithTransition(false);
      setDisplayIndex(0);
    }
  };

  // Auto-play timer
  useEffect(() => {
    if (!isCarousel) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isPlaying || isHovered || isFocused || isTouched || prefersReducedMotion) {
      return;
    }

    const interval = setInterval(() => {
      handleNext();
    }, 5500);

    return () => clearInterval(interval);
  }, [isCarousel, isPlaying, isHovered, isFocused, isTouched, handleNext]);

  // Touch Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    setIsTouched(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) {
      setIsTouched(false);
      return;
    }
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    if (deltaX > 45) {
      handlePrev();
    } else if (deltaX < -45) {
      handleNext();
    }
    touchStartXRef.current = null;
    setIsTouched(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Clones for seamless infinite looping
  const carouselCards = useMemo(() => {
    if (!isCarousel) return reviews.map((r) => ({ review: r, isClone: false, key: r.id }));
    const primary = reviews.map((r) => ({ review: r, isClone: false, key: `prim-${r.id}` }));
    // Append duplicate clones to provide a seamless loop
    const clones = reviews.map((r, idx) => ({
      review: r,
      isClone: true,
      key: `clone-${r.id}-${idx}`,
    }));
    return [...primary, ...clones];
  }, [isCarousel, reviews]);

  // Pixel-accurate translation
  const trackStyle = isCarousel
    ? {
        transform: `translateX(-${displayIndex * stepDistance}px)`,
        transition: withTransition ? 'transform 600ms cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
      }
    : undefined;

  return (
    <section
      id="reviews"
      aria-roledescription="carousel"
      aria-label="What Our Customers Say"
      className="w-full bg-[#FAF5EC] border-b border-[#B58A3C]/25 py-14 sm:py-20 px-4 sm:px-6 lg:px-8 select-none overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={() => setIsFocused(false)}
    >
      <div className="max-w-6xl mx-auto space-y-10">
        {/* ========================================================
            HEADER: Selected Positive Google Reviews
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
            Authentic experiences from patrons who visited our boutique and experienced our bespoke craftsmanship in Jhansi.
          </p>
        </div>

        {/* ========================================================
            CONTROLS: Carousel manual navigation (when carousel is active)
            ======================================================== */}
        {isCarousel && (
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="p-2 border border-[#B58A3C]/40 bg-white text-gray-700 hover:text-[#5E1224] hover:bg-[#FCF8F0] transition-colors focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
              aria-label={isPlaying ? 'Pause automatic review rotation' : 'Resume automatic review rotation'}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handlePrev}
              className="p-2 border border-[#B58A3C]/40 bg-white text-gray-700 hover:text-[#5E1224] hover:bg-[#FCF8F0] transition-colors focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
              aria-label="Previous review"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="p-2 border border-[#B58A3C]/40 bg-white text-gray-700 hover:text-[#5E1224] hover:bg-[#FCF8F0] transition-colors focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
              aria-label="Next review"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ========================================================
            REVIEWS CONTAINER: Seamless loop or Clean static row
            ======================================================== */}
        <div
          className="w-full overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isCarousel ? (
            <div
              ref={trackRef}
              style={trackStyle}
              onTransitionEnd={handleTransitionEnd}
              className="flex gap-4 sm:gap-6 will-change-transform"
            >
              {carouselCards.map(({ review, isClone, key }) => (
                <ReviewCard
                  key={key}
                  review={review}
                  isClone={isClone}
                  isExpanded={Boolean(expandedMap[review.id])}
                  onToggleExpand={() => toggleExpand(review.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap sm:flex-nowrap gap-4 sm:gap-6 justify-center">
              {reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  isClone={false}
                  isExpanded={Boolean(expandedMap[review.id])}
                  onToggleExpand={() => toggleExpand(review.id)}
                />
              ))}
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
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-white border border-[#B58A3C]/50 hover:bg-[#5E1224] hover:text-[#FCF8F0] text-[#5E1224] text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow-xs"
          >
            <span>Read All Reviews on Google</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
};

interface CardProps {
  review: BoutiqueReviewItem;
  isClone: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const ReviewCard: React.FC<CardProps> = ({ review, isClone, isExpanded, onToggleExpand }) => {
  const isLong = review.review_text.length > 155;
  const displayText =
    isLong && !isExpanded ? `${review.review_text.slice(0, 150)}…` : review.review_text;
  const ratingNum = Math.min(5, Math.max(1, Number(review.rating) || 5));
  const hasValidGoogleLink = isValidGoogleSourceUrl(review.source_url);

  return (
    <article
      aria-hidden={isClone}
      className="w-[84%] sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] shrink-0 bg-white border border-[#B58A3C]/30 shadow-sm p-5 sm:p-6 flex flex-col justify-between space-y-4 rounded-none transition-shadow hover:shadow-md"
    >
      <div className="space-y-3.5">
        {/* Header: Initials, Author Name, Date & Google G Tag */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 text-[#5E1224] flex items-center justify-center font-serif font-bold text-xs shrink-0">
              {getInitials(review.author_name)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif font-bold text-sm text-gray-900 truncate">
                {review.author_name}
              </h3>
              {review.review_date && (
                <span className="text-[10px] text-gray-400 block truncate">
                  {review.review_date}
                </span>
              )}
            </div>
          </div>

          <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-50 px-2 py-0.5 border border-gray-200 shrink-0">
            <span className="font-bold text-[#4285F4]">G</span>
            <span>Google</span>
          </div>
        </div>

        {/* Star Rating */}
        <div
          className="flex items-center gap-1"
          aria-label={`Rating: ${review.rating} out of 5 stars`}
        >
          {Array.from({ length: 5 }).map((_, idx) => (
            <Star
              key={idx}
              className={`w-3.5 h-3.5 ${
                idx < ratingNum ? 'fill-[#D4AF67] text-[#D4AF67]' : 'text-gray-200'
              }`}
            />
          ))}
          <span className="text-[11px] font-mono font-medium text-gray-600 ml-1.5">
            {ratingNum}.0
          </span>
        </div>

        {/* Review Text */}
        <div className="text-xs text-gray-700 leading-relaxed font-light italic">
          {isLong && !isExpanded && (
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block not-italic mb-1">
              Excerpt
            </span>
          )}
          &ldquo;{displayText}&rdquo;
          {isLong && (
            <button
              type="button"
              tabIndex={isClone ? -1 : 0}
              onClick={onToggleExpand}
              className="text-[11px] text-[#5E1224] hover:underline font-semibold not-italic ml-1.5 inline-block focus:outline-none"
            >
              {isExpanded ? 'Read less' : 'Read more'}
            </button>
          )}
        </div>
      </div>

      {/* Card Footer: Attribution & Verified External Link */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1 text-gray-500 text-[10px] uppercase tracking-wider font-medium">
          {review.is_verified ? 'Verified Google Review' : 'Selected Patron Review'}
        </span>

        {hasValidGoogleLink && (
          <a
            href={review.source_url!}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={isClone ? -1 : 0}
            className="text-gray-400 hover:text-[#5E1224] transition-colors focus:outline-none"
            title="View original Google review"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </article>
  );
};

export const BoutiqueReviewsSection: React.FC = () => {
  const { settings } = useStoreSettings();

  // Visibility wrapper: guarantees hooks inside content component always run in invariant order
  if (!settings.boutiqueReviewsVisible) {
    return null;
  }

  return <BoutiqueReviewsContent settings={settings} />;
};

export default BoutiqueReviewsSection;
