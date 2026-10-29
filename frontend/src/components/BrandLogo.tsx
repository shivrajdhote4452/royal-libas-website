import React from 'react';

export type LogoVariant = 'primary' | 'gold' | 'black' | 'white' | 'maroon-bg';
export type LogoLayout = 'stacked' | 'compact' | 'horizontal' | 'emblem-only' | 'wordmark-only';

export interface BrandLogoProps {
  variant?: LogoVariant;
  layout?: LogoLayout;
  className?: string;
  emblemSize?: number;
  showTagline?: boolean;
  taglineText?: string;
}

/**
 * Royal Libas by Tanya — Official Vector Logo (Option 5: Floral Motif)
 * 
 * Features the approved 5-petal symmetrical lotus/floral emblem inspired
 * by Indian textile and floral craftsmanship, positioned with the luxury
 * high-fashion serif wordmark "ROYAL LIBAS" and spaced tagline.
 * 
 * Colors:
 * - Deep Maroon: #5E1224
 * - Antique Gold: #B58A3C
 * - Warm Ivory: #FCF8F0
 * - Dark Ink: #2B1B1E
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'primary',
  layout = 'compact',
  className = '',
  emblemSize,
  showTagline = true,
  taglineText = 'BY TANYA',
}) => {
  // Resolve colors based on variant
  let petalFill = '#5E1224'; // Deep Maroon
  let goldAccent = '#B58A3C'; // Antique Gold
  let textRoyal = '#5E1224';
  let textTanya = '#B58A3C';
  let spineColor = '#B58A3C';
  let lineColor = '#B58A3C';
  let diamondColor = '#B58A3C';

  if (variant === 'gold') {
    petalFill = 'none';
    goldAccent = '#B58A3C';
    textRoyal = '#B58A3C';
    textTanya = '#B58A3C';
    spineColor = '#B58A3C';
    lineColor = '#B58A3C';
    diamondColor = '#B58A3C';
  } else if (variant === 'black') {
    petalFill = '#2B1B1E';
    goldAccent = '#2B1B1E';
    textRoyal = '#2B1B1E';
    textTanya = '#2B1B1E';
    spineColor = '#FFFFFF';
    lineColor = '#2B1B1E';
    diamondColor = '#2B1B1E';
  } else if (variant === 'white' || variant === 'maroon-bg') {
    petalFill = variant === 'maroon-bg' ? '#5E1224' : 'none';
    goldAccent = '#FCF8F0';
    textRoyal = '#FCF8F0';
    textTanya = '#E2D3BE';
    spineColor = '#FCF8F0';
    lineColor = '#E2D3BE';
    diamondColor = '#E2D3BE';
  }

  // Pure Vector Floral Motif (viewBox 0 0 160 160)
  const renderEmblem = (size: number, extraClass = '') => (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      className={`shrink-0 overflow-visible ${extraClass}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 1. Crown Droplet Dots (3 vertically aligned dots) */}
      <circle cx="80" cy="10" r="2.8" fill={goldAccent} />
      <circle cx="80" cy="20" r="4.2" fill={goldAccent} />
      <circle cx="80" cy="32" r="6" fill={goldAccent} />

      {/* 2. Side Accent Dots */}
      <circle cx="16" cy="62" r="3.2" fill={goldAccent} />
      <circle cx="144" cy="62" r="3.2" fill={goldAccent} />
      <circle cx="3" cy="116" r="2.8" fill={goldAccent} />
      <circle cx="157" cy="116" r="2.8" fill={goldAccent} />

      {/* 3. Center Petal (Outer Gold Frame + Inner Petal + Gold Spine) */}
      <path
        d="M 80 40 C 60 74 58 108 78 140 C 79 141 81 141 82 140 C 102 108 100 74 80 40 Z"
        fill={variant === 'gold' || variant === 'white' ? 'none' : goldAccent}
        stroke={goldAccent}
        strokeWidth={variant === 'gold' || variant === 'white' ? '2.5' : '1'}
      />
      {variant !== 'white' && (
        <path
          d="M 80 48 C 64 78 63 106 78 136 C 79 137 81 137 82 136 C 97 106 96 78 80 48 Z"
          fill={variant === 'gold' ? '#B58A3C' : petalFill}
          fillOpacity={variant === 'gold' ? 0.2 : 1}
        />
      )}
      <line
        x1="80"
        y1="56"
        x2="80"
        y2="128"
        stroke={spineColor}
        strokeWidth={variant === 'black' ? 2 : 2.2}
        strokeLinecap="round"
      />

      {/* 4. Diagonal Middle Petals */}
      {/* Left Diagonal Petal */}
      <path
        d="M 24 64 C 32 96 56 126 76 139 C 58 112 46 84 24 64 Z"
        fill={variant === 'gold' || variant === 'white' ? 'none' : goldAccent}
        stroke={goldAccent}
        strokeWidth={variant === 'gold' || variant === 'white' ? '2.4' : '1'}
      />
      {variant !== 'white' && (
        <path
          d="M 30 68 C 38 96 58 122 74 135 C 58 112 48 87 30 68 Z"
          fill={variant === 'gold' ? '#B58A3C' : petalFill}
          fillOpacity={variant === 'gold' ? 0.2 : 1}
        />
      )}
      <line
        x1="34"
        y1="72"
        x2="68"
        y2="124"
        stroke={spineColor}
        strokeWidth={variant === 'black' ? 1.8 : 2}
        strokeLinecap="round"
      />

      {/* Right Diagonal Petal */}
      <path
        d="M 136 64 C 128 96 104 126 84 139 C 102 112 114 84 136 64 Z"
        fill={variant === 'gold' || variant === 'white' ? 'none' : goldAccent}
        stroke={goldAccent}
        strokeWidth={variant === 'gold' || variant === 'white' ? '2.4' : '1'}
      />
      {variant !== 'white' && (
        <path
          d="M 130 68 C 122 96 102 122 86 135 C 102 112 112 87 130 68 Z"
          fill={variant === 'gold' ? '#B58A3C' : petalFill}
          fillOpacity={variant === 'gold' ? 0.2 : 1}
        />
      )}
      <line
        x1="126"
        y1="72"
        x2="92"
        y2="124"
        stroke={spineColor}
        strokeWidth={variant === 'black' ? 1.8 : 2}
        strokeLinecap="round"
      />

      {/* 5. Lower Sweeping Petals */}
      {/* Left Lower Petal */}
      <path
        d="M 8 118 C 22 104 54 116 76 142 C 50 137 24 132 8 118 Z"
        fill={variant === 'gold' || variant === 'white' ? 'none' : goldAccent}
        stroke={goldAccent}
        strokeWidth={variant === 'gold' || variant === 'white' ? '2.4' : '1'}
      />
      {variant !== 'white' && (
        <path
          d="M 14 118 C 26 108 52 119 72 139 C 48 134 26 130 14 118 Z"
          fill={variant === 'gold' ? '#B58A3C' : petalFill}
          fillOpacity={variant === 'gold' ? 0.2 : 1}
        />
      )}
      <line
        x1="18"
        y1="118"
        x2="64"
        y2="135"
        stroke={spineColor}
        strokeWidth={variant === 'black' ? 1.8 : 2}
        strokeLinecap="round"
      />

      {/* Right Lower Petal */}
      <path
        d="M 152 118 C 138 104 106 116 84 142 C 110 137 136 132 152 118 Z"
        fill={variant === 'gold' || variant === 'white' ? 'none' : goldAccent}
        stroke={goldAccent}
        strokeWidth={variant === 'gold' || variant === 'white' ? '2.4' : '1'}
      />
      {variant !== 'white' && (
        <path
          d="M 146 118 C 134 108 108 119 88 139 C 112 134 134 130 146 118 Z"
          fill={variant === 'gold' ? '#B58A3C' : petalFill}
          fillOpacity={variant === 'gold' ? 0.2 : 1}
        />
      )}
      <line
        x1="142"
        y1="118"
        x2="96"
        y2="135"
        stroke={spineColor}
        strokeWidth={variant === 'black' ? 1.8 : 2}
        strokeLinecap="round"
      />

      {/* 6. Base Anchor Pedestal & Flourishes */}
      <path
        d="M 76 142 C 68 146 64 150 60 148 C 59 147 60 146 62 147 C 65 147 69 144 75 141 Z"
        fill={goldAccent}
      />
      <path
        d="M 84 142 C 92 146 96 150 100 148 C 101 147 100 146 98 147 C 95 147 91 144 85 141 Z"
        fill={goldAccent}
      />
      {/* Hanging Base Diamond */}
      <polygon points="80,144 86,152 80,160 74,152" fill={goldAccent} />
    </svg>
  );

  // 1. EMBLEM ONLY LAYOUT
  if (layout === 'emblem-only') {
    const size = emblemSize || 48;
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {renderEmblem(size)}
      </div>
    );
  }

  // 2. WORDMARK ONLY LAYOUT
  if (layout === 'wordmark-only') {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <span
          className="font-serif font-bold tracking-[0.16em] uppercase transition-colors"
          style={{ color: textRoyal }}
        >
          ROYAL LIBAS
        </span>
        {showTagline && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-3 sm:w-5 h-[1px]" style={{ backgroundColor: lineColor }} />
            <span
              className="text-[9px] uppercase tracking-[0.28em] font-semibold"
              style={{ color: textTanya }}
            >
              {taglineText}
            </span>
            <span className="w-3 sm:w-5 h-[1px]" style={{ backgroundColor: lineColor }} />
          </div>
        )}
      </div>
    );
  }

  // 3. HORIZONTAL LAYOUT (Emblem on left, Wordmark on right)
  if (layout === 'horizontal') {
    const size = emblemSize || 38;
    return (
      <div className={`inline-flex items-center gap-2.5 sm:gap-3 ${className}`}>
        {renderEmblem(size)}
        <div className="flex flex-col items-start leading-none">
          <span
            className="font-serif font-bold text-lg sm:text-xl tracking-[0.15em] uppercase transition-colors"
            style={{ color: textRoyal }}
          >
            ROYAL LIBAS
          </span>
          {showTagline && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-3 h-[1px]" style={{ backgroundColor: lineColor }} />
              <span
                className="text-[8px] sm:text-[9px] uppercase tracking-[0.28em] font-semibold"
                style={{ color: textTanya }}
              >
                {taglineText}
              </span>
              <span className="w-3 h-[1px]" style={{ backgroundColor: lineColor }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4. COMPACT LAYOUT (Tailored for Website Header Navbar ~48-56px total height)
  if (layout === 'compact') {
    const size = emblemSize || 24;
    return (
      <div className={`flex flex-col items-center text-center leading-none ${className}`}>
        {renderEmblem(size, 'mb-0.5')}
        <span
          className="font-serif font-bold text-sm sm:text-xl tracking-[0.1em] sm:tracking-[0.15em] whitespace-nowrap uppercase transition-colors"
          style={{ color: textRoyal }}
        >
          ROYAL LIBAS
        </span>
        {showTagline && (
          <div className="flex items-center justify-center gap-1 sm:gap-1.5 mt-0.5">
            <span className="w-2.5 sm:w-4 h-[1px]" style={{ backgroundColor: lineColor }} />
            <span
              className="text-[7.5px] sm:text-[8.5px] uppercase tracking-[0.24em] sm:tracking-[0.3em] font-semibold whitespace-nowrap"
              style={{ color: textTanya }}
            >
              {taglineText}
            </span>
            <span className="w-2.5 sm:w-4 h-[1px]" style={{ backgroundColor: lineColor }} />
          </div>
        )}
      </div>
    );
  }

  // 5. STACKED LAYOUT (Full Luxury Presentation for Hero, Splash, Admin Login, Footers)
  const size = emblemSize || 58;
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      {renderEmblem(size, 'mb-2.5')}
      <span
        className="font-serif font-bold text-2xl sm:text-3xl tracking-[0.18em] uppercase transition-colors"
        style={{ color: textRoyal }}
      >
        ROYAL LIBAS
      </span>
      {showTagline && (
        <>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <span className="w-6 sm:w-8 h-[1px]" style={{ backgroundColor: lineColor }} />
            <span
              className="text-[10px] sm:text-[11px] uppercase tracking-[0.32em] font-semibold"
              style={{ color: textTanya }}
            >
              {taglineText}
            </span>
            <span className="w-6 sm:w-8 h-[1px]" style={{ backgroundColor: lineColor }} />
          </div>
          {/* Centered Diamond Accent below By Tanya */}
          <div className="mt-1 flex items-center justify-center">
            <svg viewBox="0 0 10 10" width="7" height="7">
              <polygon points="5,0 9,5 5,10 1,5" fill={diamondColor} />
            </svg>
          </div>
        </>
      )}
    </div>
  );
};

export default BrandLogo;
