import React, { useState, useEffect, useRef } from 'react';

export interface ProductGalleryVideoProps {
  src: string;
  poster?: string;
  className?: string;
  alt?: string;
}

/**
 * ProductGalleryVideo — Seamless, Silent Autoplay Video Player for Product Gallery.
 * 
 * Strict specifications:
 * 1. Zero visible controls: No Play/Pause buttons, no native video controls, no badges,
 *    no progress bars, no control overlays.
 * 2. Confirmed IntersectionObserver visibility: Eliminates naive getBoundingClientRect vertical-only
 *    checks. Accurately accounts for horizontal carousel offsets and ancestor overflow clipping
 *    before mounting or playing video assets.
 * 3. Reduced-motion compliance: Detects `prefers-reduced-motion: reduce` synchronously on render.
 *    Renders the clean still poster frame without ever mounting, requesting, or buffering video data.
 * 4. Deferred off-screen loading: Videos hidden horizontally (carousel slides) or vertically
 *    (below the fold) remain unmounted (poster only) until confirmed visible by IntersectionObserver.
 * 5. Avoid unconditional autoplay: Video playback is strictly conditioned on confirmed visibility.
 * 6. Silent inline autoplay & looping: Muted by default, loops continuously, plays inline on mobile.
 * 7. Visibility lifecycle: Automatically pauses when scrolled out of viewport, swiped away in carousel,
 *    or when the browser tab is hidden; resumes seamlessly when visible again.
 * 8. Fallback on block or error: If autoplay is blocked by browser policy or video fails to load,
 *    cleanly displays the still poster image without broken UI or play buttons.
 */
export const ProductGalleryVideo: React.FC<ProductGalleryVideoProps> = ({
  src,
  poster,
  className = 'w-full h-full object-cover bg-black',
  alt = 'Product showcase video',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. Synchronous detection of reduced-motion preference before mount
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  // Confirmed visibility via IntersectionObserver (accounts for horizontal carousel & ancestor clipping)
  const [hasBeenVisible, setHasBeenVisible] = useState<boolean>(false);
  const [isInViewport, setIsInViewport] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);

  // Derive poster URL (uses Cloudinary's dynamic .jpg frame if no custom poster provided)
  const posterUrl =
    poster || (src ? src.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg') : undefined);

  // 2. Listen for runtime changes to reduced-motion preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

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

  // 3. Track confirmed visibility via IntersectionObserver
  // (Accurately handles horizontal carousel positioning and ancestor overflow:hidden clipping)
  useEffect(() => {
    if (prefersReducedMotion) return;

    const target = containerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Confirmed intersection against root viewport and all ancestor clipping containers
          const isVisible = entry.isIntersecting;
          setIsInViewport(isVisible);
          if (isVisible) {
            setHasBeenVisible(true);
          }
        });
      },
      { threshold: [0, 0.15, 0.5] }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  // 4. Autoplay & Viewport/Tab Visibility Pause/Resume Engine
  useEffect(() => {
    if (!hasBeenVisible || prefersReducedMotion || hasError || autoplayBlocked) return;

    const video = videoRef.current;
    if (!video) return;

    // Strict DOM properties sync for mobile WebKit & Blink autoplay
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const attemptPlay = async () => {
      if (!isInViewport || document.hidden) {
        if (!video.paused) {
          video.pause();
        }
        return;
      }

      try {
        await video.play();
      } catch (err: any) {
        if (err?.name === 'NotAllowedError') {
          setAutoplayBlocked(true);
        }
      }
    };

    attemptPlay();

    // 5. Tab visibility change listener (pause when switching tabs, resume when active)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (!video.paused) {
          video.pause();
        }
      } else {
        if (isInViewport && !prefersReducedMotion && !autoplayBlocked && !hasError) {
          attemptPlay();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasBeenVisible, isInViewport, prefersReducedMotion, hasError, autoplayBlocked]);

  // Fallback 1: User requested reduced motion -> Render clean still poster frame (0 video downloads, 0 video tags)
  if (prefersReducedMotion) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden bg-black select-none pointer-events-none"
      >
        <img
          src={posterUrl}
          alt={alt}
          className={className}
          loading="lazy"
          draggable={false}
        />
      </div>
    );
  }

  // Fallback 2: Autoplay blocked by browser or video load error -> Clean still poster without broken UI or controls
  if (hasError || autoplayBlocked) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden bg-black select-none pointer-events-none"
      >
        <img
          src={posterUrl}
          alt={alt}
          className={className}
          loading="lazy"
          draggable={false}
        />
      </div>
    );
  }

  // State 3: Off-screen horizontally or vertically -> Defer video mounting and buffering, show poster only
  if (!hasBeenVisible) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden bg-black select-none pointer-events-none"
        aria-label={alt}
      >
        <img
          src={posterUrl}
          alt={alt}
          className={className}
          loading="lazy"
          draggable={false}
        />
      </div>
    );
  }

  // State 4: Confirmed visible -> Mount video with conditional autoplay and zero visible controls
  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-black select-none pointer-events-none"
      aria-label={alt}
    >
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl}
        autoPlay={isInViewport && !prefersReducedMotion}
        muted
        loop
        playsInline
        // @ts-ignore - Vendor attributes for older iOS/WeChat/WebKit
        webkit-playsinline="true"
        x5-playsinline="true"
        preload="metadata"
        className={className}
        aria-label={alt}
        onError={() => setHasError(true)}
      />
    </div>
  );
};
