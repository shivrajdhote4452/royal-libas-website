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
 * 2. Deterministic initialization: Reduced-motion preference and initial viewport visibility
 *    are verified before mounting or starting video playback, eliminating autoplay race conditions.
 * 3. Reduced-motion compliance: Detects `prefers-reduced-motion: reduce` synchronously on render.
 *    Renders the still poster image without ever mounting, requesting, or buffering the video.
 * 4. Deferred off-screen loading: Off-screen videos remain unmounted (rendering the poster only)
 *    until scrolled into view, conserving user data and system memory.
 * 5. Silent inline autoplay: Starts automatically only when visible on screen, muted, loop, playsinline.
 * 6. Visibility management: Automatically pauses when scrolled out of viewport or when browser
 *    tab becomes hidden; resumes seamlessly when visible again.
 * 7. Fallback on block or error: If autoplay is blocked by browser policy (e.g. low-power mode)
 *    or if video loading fails, cleanly displays the still poster image without broken UI or play buttons.
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

  // Track if video has entered viewport (to defer mounting off-screen video assets)
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

  // 3. Track viewport entry and visibility via IntersectionObserver
  useEffect(() => {
    // If user prefers reduced motion, never observe or mount video
    if (prefersReducedMotion) return;

    const target = containerRef.current;
    if (!target) return;

    // Check immediate viewport intersection synchronously on mount
    try {
      const rect = target.getBoundingClientRect();
      const inViewNow = rect.top < window.innerHeight && rect.bottom > 0 && rect.height > 0;
      if (inViewNow) {
        setHasBeenVisible(true);
        setIsInViewport(true);
      }
    } catch { }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const visible = entry.isIntersecting;
          setIsInViewport(visible);
          if (visible) {
            setHasBeenVisible(true);
          }
        });
      },
      { threshold: [0, 0.2, 0.5] }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  // 4. Autoplay & Viewport/Tab Visibility Pause/Resume Engine
  useEffect(() => {
    // Do not attempt playback if not mounted, reduced motion, error, or blocked
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

  // State 3: Off-screen video not yet visible -> Defer video mounting and buffering, show poster only
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

  // State 4: Verified in view -> Mount video with conditional autoplay and zero visible controls
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
