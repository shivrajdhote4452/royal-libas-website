import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CuratedMomentCard } from '../lib/settings';

interface CuratedMomentsSectionProps {
  cards?: CuratedMomentCard[];
  eyebrow?: string;
  heading?: string;
  description?: string;
  viewAllLink?: string;
  viewAllText?: string;
}

export const CuratedMomentsSection: React.FC<CuratedMomentsSectionProps> = ({
  cards = [],
  eyebrow = 'CURATED FOR EVERY MOMENT',
  heading = 'DRESS FOR THE MOMENT',
  description = 'From everyday grace to unforgettable celebrations, find the perfect look for every occasion.',
  viewAllLink = '/shop',
  viewAllText = 'VIEW ALL COLLECTIONS',
}) => {
  // Track failed image URLs so we gracefully render the luxury placeholder
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Ensure 3 cards are displayed by default, sorted by displayOrder
  const displayCards = cards && cards.length > 0 ? cards : [];

  const handleImageError = (cardId: string) => {
    setFailedImages((prev) => ({ ...prev, [cardId]: true }));
  };

  return (
    <section
      aria-labelledby="curated-moments-heading"
      className="reveal-on-scroll relative overflow-hidden bg-[#FAF7F2] text-[#2B1B1E] py-16 sm:py-20 lg:py-24 border-y border-[#B58A3C]/20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ========================================================
            HEADER: Eyebrow with gold ornaments, Burgundy Serif Title, Subtitle
            ======================================================== */}
        <div className="text-center max-w-2xl mx-auto">
          {/* Eyebrow flanked by decorative hairline dividers */}
          <div className="flex items-center justify-center gap-3 text-[#B58A3C]">
            <span className="w-8 sm:w-12 h-[1px] bg-[#B58A3C]/50" />
            <span className="text-xs sm:text-sm">✤</span>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.28em] font-semibold">
              {eyebrow}
            </span>
            <span className="text-xs sm:text-sm">✤</span>
            <span className="w-8 sm:w-12 h-[1px] bg-[#B58A3C]/50" />
          </div>

          {/* Heading */}
          <h2
            id="curated-moments-heading"
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[#5B1E28] tracking-wide mt-3 sm:mt-4 leading-tight"
          >
            {heading}
          </h2>

          {/* Supporting line */}
          <p className="text-xs sm:text-sm md:text-base text-gray-700/85 font-light leading-relaxed mt-2.5 sm:mt-3">
            {description}
          </p>
        </div>

        {/* ========================================================
            THREE CARDS GRID: Interactive, responsive, accessible
            ======================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mt-12 sm:mt-16">
          {displayCards.map((card, index) => {
            const hasCustomImage = Boolean(card.imageUrl && !failedImages[card.id]);
            const targetLink = card.link && card.link.startsWith('/') ? card.link : '/shop';
            const linkLabel = card.linkText || 'EXPLORE COLLECTION';

            return (
              <Link
                key={card.id || index}
                to={targetLink}
                aria-label={`${card.title} - ${linkLabel}`}
                className="group relative block aspect-[3/4] sm:aspect-[4/5] md:aspect-[3/4] lg:h-[540px] w-full rounded-sm overflow-hidden bg-[#241418] shadow-md hover:shadow-2xl transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-[#B58A3C] focus:ring-offset-2"
              >
                {/* Background Image OR Tasteful Luxury Placeholder */}
                {hasCustomImage ? (
                  <>
                    <img
                      src={card.imageUrl!}
                      alt={card.title}
                      loading="lazy"
                      onError={() => handleImageError(card.id)}
                      className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    {/* Dark gradient overlay for pristine editorial typography readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#14080B]/95 via-[#14080B]/40 to-transparent pointer-events-none" />
                  </>
                ) : (
                  /* ====================================================
                     TASTEFUL ACCESSIBLE LUXURY PLACEHOLDER
                     Shows an elegant branded atelier pattern without broken icons or AI images
                     ==================================================== */
                  <div
                    role="img"
                    aria-label={`${card.title} curation in progress`}
                    className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#2B1B1E] via-[#201014] to-[#12070A] flex flex-col items-center justify-center p-6 text-center select-none"
                  >
                    {/* Decorative inner gold hairline frame */}
                    <div className="absolute inset-3 sm:inset-4 border border-[#B58A3C]/30 pointer-events-none group-hover:border-[#D4AF67]/50 transition-colors" />

                    {/* Corner gold accents */}
                    <span className="absolute top-3 sm:top-4 left-3 sm:left-4 w-2.5 h-2.5 border-t border-l border-[#B58A3C]/60" />
                    <span className="absolute top-3 sm:top-4 right-3 sm:right-4 w-2.5 h-2.5 border-t border-r border-[#B58A3C]/60" />
                    <span className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 w-2.5 h-2.5 border-b border-l border-[#B58A3C]/60" />
                    <span className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 w-2.5 h-2.5 border-b border-r border-[#B58A3C]/60" />

                    {/* Emblem monogram */}
                    <div className="space-y-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      <span className="text-[#D4AF67] text-2xl sm:text-3xl block">✤</span>
                      <span className="font-serif text-xs uppercase tracking-[0.28em] text-[#D4AF67] font-semibold block">
                        ROYAL LIBAS
                      </span>
                      <span className="text-[9px] uppercase tracking-widest text-[#FCF8F0]/40 block">
                        ATELIER CURATION
                      </span>
                    </div>

                    {/* Dark gradient overlay at bottom for card text */}
                    <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#14080B]/90 to-transparent pointer-events-none" />
                  </div>
                )}

                {/* ====================================================
                    CARD CONTENT: Gold Motif, Uppercase Title, Link CTA
                    ==================================================== */}
                <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 flex flex-col items-center text-center z-10">
                  {/* Gold ornamental motif */}
                  <span className="text-[#D4AF67] text-base sm:text-lg mb-2 sm:mb-2.5 transition-transform duration-300 group-hover:scale-125">
                    ✤
                  </span>

                  {/* Card Title */}
                  <h3 className="font-serif text-xl sm:text-2xl text-[#FCF8F0] tracking-[0.16em] uppercase font-normal mb-2 sm:mb-2.5 drop-shadow-sm">
                    {card.title}
                  </h3>

                  {/* Explore Collection Link */}
                  <span className="text-[10px] sm:text-[11px] font-semibold tracking-[0.25em] text-[#D4AF67] group-hover:text-white uppercase transition-colors inline-flex items-center gap-1.5">
                    {linkLabel}
                    <span className="text-xs transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* ========================================================
            BOTTOM OUTLINED BUTTON: View All Collections
            Flanked by delicate hairline rules and gold ornamental motifs
            ======================================================== */}
        {viewAllLink && (
          <div className="flex items-center justify-center gap-3 sm:gap-5 mt-12 sm:mt-16">
            {/* Left rule & motif */}
            <div className="hidden sm:flex items-center flex-1 max-w-[140px] md:max-w-xs gap-3 justify-end text-[#B58A3C]/70">
              <span className="h-[1px] bg-[#B58A3C]/40 flex-1" />
              <span className="text-xs sm:text-sm">✤</span>
            </div>

            {/* Outlined button */}
            <Link
              to={viewAllLink}
              className="inline-flex items-center justify-center gap-2 px-6 sm:px-10 py-3 sm:py-3.5 border border-[#8C6D3F]/70 hover:border-[#5B1E28] bg-transparent hover:bg-[#5B1E28] text-[#5B1E28] hover:text-[#FCF8F0] font-medium text-[11px] sm:text-xs tracking-[0.22em] uppercase transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <span>{viewAllText}</span>
              <span className="text-sm transition-transform duration-300 hover:translate-x-0.5">
                →
              </span>
            </Link>

            {/* Right motif & rule */}
            <div className="hidden sm:flex items-center flex-1 max-w-[140px] md:max-w-xs gap-3 justify-start text-[#B58A3C]/70">
              <span className="text-xs sm:text-sm">✤</span>
              <span className="h-[1px] bg-[#B58A3C]/40 flex-1" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default CuratedMomentsSection;
