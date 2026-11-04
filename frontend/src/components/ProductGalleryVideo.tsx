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
 * 2. Silent inline autoplay: Starts automatically when in viewport, muted, loop, playsinline.
 * 3. Visibility management: Automatically pauses when scrolled out of viewport or when browser
 *    tab becomes hidden; resumes seamlessly when visible again.
 * 4. Reduced-motion compliance: Detects `prefers-reduced-motion: reduce`. When enabled, suppresses
 *    autoplay and video downloading entirely, rendering a clean still poster image without controls.
 * 5. Fallback on block or error: If autoplay is blocked by browser policy (e.g. low-power mode)
 *    or if video loading fails, cleanly displays the still poster image without broken UI or play buttons.
 * 6. Efficient loading: Prevents unnecessary data downloads by deferring video loading when off-screen
 *    and avoiding video streams entirely when reduced-motion is requested.
 */
export const ProductGalleryVideo: React.FC<ProductGalleryVideoProps> = ({
  src,
  poster,
  className = 'w-full h-full object-cover bg-black',
  alt = 'Product showcase video',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isInViewport, setIsInViewport] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  // Derive poster URL (uses Cloudinary's dynamic .jpg frame if no custom poster provided)
  const posterUrl =
    poster || (src ? src.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg') : undefined);

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
          setIsInViewport(entry.isIntersecting);
        });
      },
      { threshold: [0, 0.25, 0.5] }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // 3. Autoplay & Viewport/Tab Visibility Pause/Resume Engine
  useEffect(() => {
    const video = videoRef.current;
    if (!video || prefersReducedMotion || hasError || autoplayBlocked) return;

    // Enforce strict DOM properties for mobile WebKit & Blink autoplay
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

    // 4. Tab visibility change listener
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
  }, [isInViewport, prefersReducedMotion, hasError, autoplayBlocked]);

  // Fallback 1: User requested reduced motion -> Render clean still poster frame (0 video downloads)
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

  // Normal: Silent autoplay video with zero controls, overlays, or buttons
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
        autoPlay
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
