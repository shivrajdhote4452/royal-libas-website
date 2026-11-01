import React, { useState, useEffect, useRef, useMemo } from 'react';
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

interface ContentProps {
  settings: StoreSettings;
}

const BoutiqueReviewsContent: React.FC<ContentProps> = ({ settings }) => {
  // Requirement B: Filter strictly for published, verified Google reviews with actual rating 4 or 5
  const eligibleReviews = useMemo<BoutiqueReviewItem[]>(() => {
    return (settings.boutiqueReviews || [])
      .filter((r) => {
        const rating = Number(r.rating) || 0;
        const isGoogle = !r.source || r.source === 'google' || (r.source_url && r.source_url.includes('google'));
        return Boolean(r.is_published) && Boolean(r.is_verified) && rating >= 4 && isGoogle;
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [settings.boutiqueReviews]);

  // If there are no eligible verified positive reviews, hide the section completely
  if (eligibleReviews.length === 0) {
    return null;
  }

  return <BoutiqueReviewsCarousel settings={settings} reviews={eligibleReviews} />;
};

interface CarouselProps {
  settings: StoreSettings;
  reviews: BoutiqueReviewItem[];
}

const BoutiqueReviewsCarousel: React.FC<CarouselProps> = ({ settings, reviews }) => {
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

  // Carousel controls & state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  // Clamp current index if review count or itemsPerView changes
  const maxIndex = Math.max(0, reviews.length - itemsPerView);
  useEffect(() => {
    setCurrentIndex((prev) => Math.min(prev, maxIndex));
  }, [maxIndex]);

  const isCarousel = reviews.length > itemsPerView;

  // Touch swipe support
  const touchStartXRef = useRef<number | null>(null);
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
    if (deltaX > 40) {
      // Swiped right -> previous
      handlePrev();
    } else if (deltaX < -40) {
      // Swiped left -> next
      handleNext();
    }
    touchStartXRef.current = null;
    setIsTouched(false);
  };

  // Auto-play interval
  useEffect(() => {
    if (!isCarousel) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isPlaying || isHovered || isFocused || isTouched || prefersReducedMotion) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
    }, 5500);

    return () => clearInterval(interval);
  }, [isCarousel, isPlaying, isHovered, isFocused, isTouched, maxIndex]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev <= 0 ? maxIndex : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
  };

  const toggleExpand = (id: string) => {
    setExpandedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <section
      aria-label="What Our Customers Say"
      className="w-full bg-[#FAF5EC] border-b border-[#B58A3C]/25 py-14 sm:py-20 px-4 sm:px-6 lg:px-8 select-none overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={() => setIsFocused(false)}
    >
      <div className="max-w-6xl mx-auto space-y-10">
        {/* ========================================================
            HEADER: Heading & Labels
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
            Genuine patron experiences shared on Google from visits to our Jhansi boutique and atelier commissions.
          </p>
        </div>

        {/* ========================================================
            CAROUSEL CONTROLS BAR (Play/Pause, Prev, Next, Indicator)
            Shown when enough reviews exist for a carousel
            ======================================================== */}
        {isCarousel && (
          <div className="flex items-center justify-between max-w-5xl mx-auto px-1 text-xs">
            <div className="flex items-center gap-2">
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
                {currentIndex + 1} / {maxIndex + 1}
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
            REVIEWS TRACK / GRID
            ======================================================== */}
        <div
          className="relative max-w-5xl mx-auto overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isCarousel ? (
            <div
              className="flex gap-4 sm:gap-6 transition-transform duration-500 ease-out"
              style={{
                transform: `translateX(-${currentIndex * (itemsPerView === 1 ? 84 : itemsPerView === 2 ? 50 : 33.333)}%)`,
              }}
            >
              {reviews.map((rev) => renderCard(rev, expandedMap[rev.id], () => toggleExpand(rev.id)))}
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-6">
              {reviews.map((rev) => renderCard(rev, expandedMap[rev.id], () => toggleExpand(rev.id)))}
            </div>
          )}
        </div>

        {/* ========================================================
            FOOTER ACTION: Read All Reviews on Google
            ======================================================== */}
        <div className="text-center pt-2">
          <a
            href={googleListingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-[#B58A3C]/50 hover:bg-[#5E1224] hover:text-[#FCF8F0] text-[#5E1224] text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow-xs"
          >
            <span>Read All Reviews on Google</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
};

function renderCard(
  rev: BoutiqueReviewItem,
  isExpanded: boolean,
  onToggleExpand: () => void
) {
  const isLong = rev.review_text.length > 170;
  const displayText = isLong && !isExpanded
    ? rev.review_text.slice(0, 165) + '…'
    : rev.review_text;

  return (
    <article
      key={rev.id}
      className="w-[84%] sm:w-[48%] lg:w-[31.5%] shrink-0 bg-white border border-[#B58A3C]/30 shadow-sm p-5 sm:p-6 flex flex-col justify-between space-y-4 rounded-none transition-shadow hover:shadow-md"
    >
      <div className="space-y-3">
        {/* Author Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 text-[#5E1224] flex items-center justify-center font-serif font-bold text-xs shrink-0">
            {getInitials(rev.author_name)}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-serif font-bold text-sm text-gray-900 truncate">
              {rev.author_name}
            </h3>
            {rev.review_date && (
              <span className="text-[11px] text-gray-400 block truncate">
                {rev.review_date}
              </span>
            )}
          </div>
        </div>

        {/* Star Rating */}
        <div className="flex items-center gap-1" aria-label={`Rating: ${rev.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`w-3.5 h-3.5 ${
                star <= rev.rating
                  ? 'fill-[#D4AF67] text-[#D4AF67]'
                  : 'text-gray-200'
              }`}
            />
          ))}
          <span className="text-[11px] font-mono font-medium text-gray-600 ml-1.5">
            {rev.rating}.0
          </span>
        </div>

        {/* Review Text with Excerpt indication if shortened */}
        <p className="text-xs text-gray-700 leading-relaxed font-light">
          {isLong && !isExpanded && (
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1">
              Excerpt
            </span>
          )}
          "{displayText}"
        </p>

        {isLong && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-[11px] text-[#5E1224] hover:underline font-semibold tracking-wide"
          >
            {isExpanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      {/* Card Footer: Source Attribution */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1 text-gray-500 font-medium">
          <span>Google Review</span>
        </span>
        {rev.source_url && (
          <a
            href={rev.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-[#5E1224] transition-colors"
            title="View original Google review"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </article>
  );
}

export const BoutiqueReviewsSection: React.FC = () => {
  const { settings } = useStoreSettings();

  // Visibility wrapper: guarantees hooks inside content component always run in invariant order
  if (!settings.boutiqueReviewsVisible) {
    return null;
  }

  return <BoutiqueReviewsContent settings={settings} />;
};

export default BoutiqueReviewsSection;
