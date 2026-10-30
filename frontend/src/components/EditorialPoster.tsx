import React from 'react';
import { Link } from 'react-router-dom';

export interface EditorialPosterProps {
  id?: string;
  theme: 'occasion' | 'everyday' | 'story';
  kicker: string;
  heading: React.ReactNode;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  imageWebp: string;
  imageJpg: string;
  imageAlt: string;
  customImage?: string | null;
  tagline?: string;
  layout?: 'content-left' | 'content-right';
}

export const EditorialPoster: React.FC<EditorialPosterProps> = ({
  id,
  theme,
  kicker,
  heading,
  subtitle,
  ctaText,
  ctaLink,
  imageWebp,
  imageJpg,
  imageAlt,
  customImage,
  tagline,
  layout = theme === 'everyday' ? 'content-right' : 'content-left',
}) => {
  const isEveryday = theme === 'everyday';
  const isStory = theme === 'story';

  // Section styling variables based on theme
  const sectionBg = isEveryday
    ? 'bg-[#FAF5EC] text-[#2B1B1E] border-y border-[#E8DFD0]'
    : isStory
    ? 'bg-[#140608] text-[#FCF8F0] border-y border-[#B58A3C]/35'
    : 'bg-[#16060A] text-[#FCF8F0] border-y border-[#B58A3C]/35';

  const overlayGradient = isEveryday
    ? layout === 'content-right'
      ? 'bg-gradient-to-t from-[#FAF5EC] via-[#FAF5EC]/92 to-[#FAF5EC]/40 lg:bg-gradient-to-l lg:from-[#FAF5EC] lg:via-[#FAF5EC]/95 lg:via-50% lg:to-transparent'
      : 'bg-gradient-to-t from-[#FAF5EC] via-[#FAF5EC]/92 to-[#FAF5EC]/40 lg:bg-gradient-to-r lg:from-[#FAF5EC] lg:via-[#FAF5EC]/95 lg:via-50% lg:to-transparent'
    : layout === 'content-right'
    ? 'bg-gradient-to-t from-[#140608] via-[#140608]/85 to-[#140608]/30 lg:bg-gradient-to-l lg:from-[#140608] lg:via-[#140608]/90 lg:via-50% lg:to-transparent'
    : isStory
    ? 'bg-gradient-to-t from-[#140608] via-[#140608]/85 to-[#140608]/30 lg:bg-gradient-to-r lg:from-[#140608] lg:via-[#140608]/90 lg:via-50% lg:to-transparent'
    : 'bg-gradient-to-t from-[#16060A] via-[#16060A]/85 to-[#16060A]/30 lg:bg-gradient-to-r lg:from-[#16060A] lg:via-[#16060A]/90 lg:via-50% lg:to-transparent';

  const kickerColor = isEveryday ? 'text-[#B58A3C]' : 'text-[#D4AF67]';
  const headingColor = isEveryday ? 'text-[#5E1224]' : 'text-[#FCF8F0]';
  const subtitleColor = isEveryday ? 'text-[#3B282C]' : 'text-[#FCF8F0]/90';
  const taglineColor = isEveryday ? 'text-[#8C6726]' : 'text-[#D4AF67]/75';

  const btnClasses = isEveryday
    ? 'bg-[#5E1224] hover:bg-[#430C19] text-[#FCF8F0] border border-[#5E1224] hover:border-[#B58A3C] shadow-[0_8px_24px_rgba(94,18,36,0.3)] hover:shadow-[0_12px_28px_rgba(94,18,36,0.45)]'
    : 'bg-gradient-to-r from-[#D4AF67] via-[#C5A059] to-[#B58A3C] hover:from-[#E2C27F] hover:to-[#D4AF67] text-[#1A0B0E] border border-[#D4AF67] shadow-[0_8px_24px_rgba(212,175,103,0.35)] hover:shadow-[0_12px_28px_rgba(212,175,103,0.5)]';

  const imagePositionClass =
    theme === 'occasion'
      ? 'poster-img-occasion'
      : theme === 'everyday'
      ? 'poster-img-everyday'
      : 'poster-img-story';

  return (
    <section
      id={id}
      aria-label={kicker}
      className={`reveal-on-scroll poster-motion-wrapper relative w-full my-8 sm:my-12 overflow-hidden ${sectionBg} poster-theme-${theme}`}
    >
      {/* Background Poster Picture with WebP & JPG Progressive Fallbacks */}
      <div className="poster-image-frame pointer-events-none">
        {customImage ? (
          <img
            src={customImage}
            alt={imageAlt}
            loading="lazy"
            decoding="async"
            className={`poster-motion-img ${imagePositionClass}`}
          />
        ) : (
          <picture>
            <source type="image/webp" srcSet={imageWebp} />
            <img
              src={imageJpg}
              alt={imageAlt}
              loading="lazy"
              decoding="async"
              className={`poster-motion-img ${imagePositionClass}`}
            />
          </picture>
        )}
        {/* Soft Vignette & Contrast Overlay */}
        <div className={`absolute inset-0 ${overlayGradient} pointer-events-none`} />
      </div>

      {/* Atmospheric Ambient Glow for Dark Sections */}
      {!isEveryday && (
        <div className="absolute top-1/3 left-1/4 w-[380px] h-[380px] bg-[#B58A3C]/10 rounded-full blur-[120px] pointer-events-none" />
      )}

      {/* Foreground Content Container */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-16 lg:pt-24 pb-8 sm:pb-16 lg:pb-24 min-h-[520px] sm:min-h-[600px] lg:min-h-[600px] flex items-end lg:items-center">
        <div
          className={`w-full grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center ${
            layout === 'content-right' ? 'lg:justify-items-end' : ''
          }`}
        >
          <div
            className={`lg:col-span-6 xl:col-span-5 space-y-4 sm:space-y-5 text-left p-5 sm:p-8 lg:p-0 ${
              isEveryday
                ? 'bg-[#FAF5EC]/85 lg:bg-transparent backdrop-blur-[2px] lg:backdrop-blur-none border border-[#B58A3C]/25 lg:border-0 shadow-md lg:shadow-none'
                : 'bg-[#16060A]/80 lg:bg-transparent backdrop-blur-[2px] lg:backdrop-blur-none border border-[#B58A3C]/35 lg:border-0 shadow-md lg:shadow-none'
            } ${
              layout === 'content-right' ? 'lg:col-start-7 xl:col-start-8' : ''
            }`}
          >
            {/* Kicker */}
            <div className="poster-seq-item poster-seq-1 flex items-center gap-2.5">
              <span className="w-5 h-[1px] bg-[#B58A3C]" />
              <span
                className={`text-[10px] sm:text-xs uppercase tracking-[0.26em] sm:tracking-[0.3em] font-semibold ${kickerColor}`}
              >
                {kicker}
              </span>
            </div>

            {/* Main Heading */}
            <h2
              className={`poster-seq-item poster-seq-2 font-serif text-2xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] ${headingColor}`}
            >
              {heading}
            </h2>

            {/* Subtle Divider */}
            <div className="poster-seq-item poster-seq-2 w-12 h-[1px] bg-[#B58A3C]/70" />

            {/* Subtitle */}
            <p
              className={`poster-seq-item poster-seq-3 text-xs sm:text-base lg:text-lg font-light leading-relaxed max-w-md ${subtitleColor}`}
            >
              {subtitle}
            </p>

            {/* CTA Button with polished hover & keyboard focus */}
            <div className="poster-seq-item poster-seq-4 pt-1 sm:pt-2">
              <Link
                to={ctaLink}
                className={`luxury-btn-sheen inline-flex items-center justify-center gap-2.5 sm:gap-3 px-6 sm:px-10 py-3.5 sm:py-4 text-xs sm:text-sm font-ui font-bold uppercase tracking-[0.2em] sm:tracking-[0.24em] transition-all duration-300 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${btnClasses}`}
              >
                <span>{ctaText}</span>
                <span
                  aria-hidden="true"
                  className="transform group-hover:translate-x-2 group-focus-visible:translate-x-2 transition-transform duration-300 font-serif text-sm sm:text-base"
                >
                  &gt;
                </span>
              </Link>
            </div>

            {/* Sub-label Tagline - Clean brand mark without preview concept claims */}
            <div
              className={`poster-seq-item poster-seq-5 pt-3 sm:pt-6 text-[9.5px] sm:text-[10.5px] uppercase tracking-[0.25em] font-medium flex items-center gap-2 ${taglineColor}`}
            >
              <span>{tagline || 'ROYAL LIBAS'}</span>
              <span className="opacity-40">&bull;</span>
              <span>{isEveryday ? 'EVERYDAY EDIT' : isStory ? 'ATELIER HERITAGE' : 'FESTIVE EDIT'}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EditorialPoster;
