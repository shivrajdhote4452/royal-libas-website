import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

export interface ProductGalleryVideoProps {
  src: string;
  poster?: string;
  className?: string;
  alt?: string;
  onClick?: () => void;
}

/**
 * ProductGalleryVideo — Luxury Silent Autoplay Video Player for Boutique Gallery.
 * 
 * Features:
 * 1. Automatic, silent, looping playback when scrolled into view.
 * 2. Strict mobile & desktop browser compatibility (autoPlay, muted, playsInline, webkit-playsinline).
 * 3. Native DOM property synchronization for iOS Safari & Android Chrome autoplay policies.
 * 4. Automatic pause when scrolled out of view (IntersectionObserver) or when the browser tab is hidden (Visibility API).
 * 5. Respects user's prefers-reduced-motion accessibility preference (remains paused until tapped).
 * 6. Clean boutique UI without default browser video controls or giant play overlays.
 * 7. Accessible, non-intrusive fallback play button if autoplay is blocked or paused.
 */
export const ProductGalleryVideo: React.FC<ProductGalleryVideoProps> = ({
  src,
  poster,
  className = 'w-full h-full object-cover bg-black',
  alt = 'Product showcase video',
  onClick,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isInView, setIsInView] = useState<boolean>(false);
  const [userPaused, setUserPaused] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  // 1. Detect user's reduced-motion system preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    setPrefersReducedMotion(mediaQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMotionChange);
      return () => mediaQuery.removeEventListener('change', handleMotionChange);
    } else if ('addListener' in mediaQuery) {
      // Legacy Safari fallback
      (mediaQuery as any).addListener(handleMotionChange);
      return () => (mediaQuery as any).removeListener(handleMotionChange);
    }
  }, []);

  // 2. Track viewport visibility via IntersectionObserver
  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Play when at least 35% visible on screen; pause when leaving
          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
          setIsInView(visible);
        });
      },
      {
        threshold: [0, 0.35, 0.7],
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // 3. Autoplay & Visibility Pause/Resume Engine
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Strict DOM property sync for iOS Safari and mobile Chrome autoplay policies
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const attemptPlay = async () => {
      // Do not autoplay if user wants reduced motion, explicitly paused, not in view, or tab is hidden
      if (prefersReducedMotion || userPaused || !isInView || document.hidden) {
        if (!video.paused) {
          video.pause();
          setIsPlaying(false);
        }
        return;
      }

      try {
        await video.play();
        setIsPlaying(true);
        setAutoplayBlocked(false);
      } catch (err) {
        // Autoplay policy prevented playback or low power mode active
        setIsPlaying(false);
        setAutoplayBlocked(true);
      }
    };

    attemptPlay();

    // 4. Tab visibility change listener (pause when switching tabs, resume when returning)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (!video.paused) {
          video.pause();
          setIsPlaying(false);
        }
      } else {
        if (isInView && !userPaused && !prefersReducedMotion) {
          attemptPlay();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInView, userPaused, prefersReducedMotion]);

  // Handle Play/Pause toggle
  const handleTogglePlay = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.muted = true;
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setUserPaused(false);
          setAutoplayBlocked(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setAutoplayBlocked(true);
        });
    } else {
      video.pause();
      setIsPlaying(false);
      setUserPaused(true);
    }

    if (onClick) {
      onClick();
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Prevent double-toggling if a button inside the container was clicked
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    handleTogglePlay(e);
  };

  // Keyboard accessibility: Space or Enter to toggle playback
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleTogglePlay();
    }
  };

  const showFallbackControl = !isPlaying || autoplayBlocked || userPaused || prefersReducedMotion;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden group select-none"
      onClick={handleContainerClick}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label={alt}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={!prefersReducedMotion}
        muted
        loop
        playsInline
        // @ts-ignore - Vendor attributes for older iOS/WeChat/WebKit
        webkit-playsinline="true"
        x5-playsinline="true"
        preload="auto"
        className={`${className} cursor-pointer`}
        aria-label={alt}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Discreet luxury playback fallback / control badge */}
      {showFallbackControl ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePlay(e);
          }}
          className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-[#5E1224] text-white text-xs font-medium backdrop-blur-md shadow-md border border-white/20 transition-all duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B58A3C]"
          aria-label={isPlaying ? 'Pause product video' : 'Play product video'}
          title={prefersReducedMotion ? 'Play video (autoplay paused for reduced motion preference)' : 'Play video'}
        >
          <Play className="w-3.5 h-3.5 fill-current ml-0.5 text-[#B58A3C]" />
          <span className="text-[11px] font-sans tracking-wide">
            {prefersReducedMotion ? 'Play Video' : 'Play'}
          </span>
        </button>
      ) : (
        /* Subtle hover pause button so customer can pause at will */
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePlay(e);
          }}
          className="absolute bottom-3 left-3 z-20 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/50 hover:bg-black/75 text-white/90 text-[11px] font-medium backdrop-blur-sm transition-opacity duration-200 focus:outline-none focus:opacity-100"
          aria-label="Pause product video"
          title="Pause video"
        >
          <Pause className="w-3 h-3 fill-current" />
          <span className="text-[10px] font-sans">Pause</span>
        </button>
      )}

      {/* Reduced motion indicator badge (if user has enabled reduced motion) */}
      {prefersReducedMotion && (
        <div className="absolute top-3 right-3 z-20 bg-black/60 text-white/90 text-[10px] px-2 py-0.5 rounded-none backdrop-blur-sm pointer-events-none">
          Autoplay Off (Reduced Motion)
        </div>
      )}
    </div>
  );
};
