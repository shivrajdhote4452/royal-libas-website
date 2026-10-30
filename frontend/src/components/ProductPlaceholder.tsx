import React from 'react';

interface ProductPlaceholderProps {
  title?: string;
  category?: string;
  className?: string;
  aspectRatio?: string;
  compact?: boolean;
}

export const ProductPlaceholder: React.FC<ProductPlaceholderProps> = ({
  title,
  category,
  className = '',
  aspectRatio = 'aspect-[4/5]',
  compact = false,
}) => {
  return (
    <div
      className={`relative w-full ${aspectRatio} bg-gradient-to-br from-[#2B1B1E] via-[#3A141A] to-[#1E0F12] text-[#FCF8F0] overflow-hidden flex flex-col items-center justify-center p-4 border border-[#B58A3C]/30 select-none ${className}`}
      role="img"
      aria-label={title ? `${title} - Photo coming soon` : 'Product photo coming soon'}
    >
      {/* Subtle royal damask / geometric background filigree */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, #B58A3C 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
        }}
      />

      {/* Ornate Inner Frame */}
      <div className="absolute inset-2 sm:inset-3 border border-[#B58A3C]/20 pointer-events-none" />

      {/* Corner Ornaments */}
      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 w-2 h-2 border-t-2 border-l-2 border-[#B58A3C]/60 pointer-events-none" />
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 w-2 h-2 border-t-2 border-r-2 border-[#B58A3C]/60 pointer-events-none" />
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 w-2 h-2 border-b-2 border-l-2 border-[#B58A3C]/60 pointer-events-none" />
      <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 w-2 h-2 border-b-2 border-r-2 border-[#B58A3C]/60 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-[85%] space-y-2">
        {/* Royal Crest Emblem */}
        <div
          className={`${
            compact ? 'w-8 h-8' : 'w-12 h-12 sm:w-14 sm:h-14'
          } rounded-full bg-gradient-to-b from-[#B58A3C] to-[#7D5A1B] p-[1.5px] shadow-lg flex items-center justify-center`}
        >
          <div className="w-full h-full rounded-full bg-[#2B1B1E] flex items-center justify-center">
            <span
              className={`font-serif font-bold tracking-widest text-[#D4AF67] ${
                compact ? 'text-xs' : 'text-sm sm:text-base'
              }`}
            >
              RL
            </span>
          </div>
        </div>

        {/* Brand Callout */}
        <span
          className={`font-ui uppercase tracking-[0.25em] font-semibold text-[#B58A3C] ${
            compact ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
          }`}
        >
          ROYAL LIBAS
        </span>

        {/* Coming Soon Notice */}
        <div className="space-y-0.5">
          <p
            className={`font-serif font-medium text-[#FCF8F0] tracking-wide ${
              compact ? 'text-[11px]' : 'text-xs sm:text-sm md:text-base'
            }`}
          >
            Photo coming soon
          </p>
          {!compact && (
            <p className="text-[10px] sm:text-[11px] text-[#FCF8F0]/70 font-sans tracking-wide">
              {category || 'Atelier Collection'}
            </p>
          )}
        </div>

        {/* Delicate divider */}
        {!compact && (
          <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-[#B58A3C]/60 to-transparent pt-0.5" />
        )}

        {title && !compact && (
          <p className="text-[10px] text-[#FCF8F0]/60 italic font-serif line-clamp-1 max-w-[180px]">
            {title}
          </p>
        )}
      </div>
    </div>
  );
};

