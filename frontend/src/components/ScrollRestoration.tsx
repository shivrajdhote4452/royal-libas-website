import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigationType, useNavigate } from 'react-router-dom';

/**
 * ScrollRestoration — Centralized Deterministic Scroll Controller for Royal Libas.
 * 
 * Guarantees:
 * 1. Normal navigation (Home → Shop, Shop → Product, etc.) starts at top (0, 0).
 * 2. Page reload & Browser Back/Forward: Starts at top (0, 0) UNLESS the destination has an intentional section hash.
 * 3. Shop filters (category, subcategory, collection, search, sort) start at top.
 * 4. Section hash links (#boutique, #reviews) scroll to the section with fixed header offset.
 * 5. Cancels pending retries immediately on user interaction (touch, wheel, keys), navigation, or unmount.
 * 6. Uses React Router's navigate for in-page hash links (no window.history.pushState bypass).
 * 7. Scoped to protect admin panel workflows and preserve mobile menus/swipes.
 */
export const ScrollRestoration: React.FC = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();

  const isInitialMountRef = useRef<boolean>(true);
  const prevPathnameRef = useRef<string>(location.pathname);
  const prevSearchRef = useRef<string>(location.search);
  const prevHashRef = useRef<string>(location.hash);
  const prevKeyRef = useRef<string>(location.key);

  // Async task tracking refs for bulletproof cleanup
  const timerIdsRef = useRef<number[]>([]);
  const rafIdsRef = useRef<number[]>([]);
  const cleanupInteractionRef = useRef<(() => void) | null>(null);

  // Helper: Cancel all pending timers, animation frames, and user interaction listeners
  const cancelAllPending = () => {
    timerIdsRef.current.forEach((id) => clearTimeout(id));
    timerIdsRef.current = [];

    rafIdsRef.current.forEach((id) => cancelAnimationFrame(id));
    rafIdsRef.current = [];

    if (cleanupInteractionRef.current) {
      cleanupInteractionRef.current();
      cleanupInteractionRef.current = null;
    }
  };

  // Helper: Reset scroll to top instantly
  const resetScrollToTop = () => {
    cancelAllPending();

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const rafId = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    rafIdsRef.current.push(rafId);
  };

  // Helper: Scroll to target section hash element accounting for the fixed sticky header
  const scrollToHashElement = (hashId: string) => {
    cancelAllPending();

    const cleanId = hashId.replace(/^#/, '').trim();
    if (!cleanId) return;

    const performScroll = (): boolean => {
      const target =
        document.getElementById(cleanId) ||
        document.querySelector(`[name="${cleanId}"]`);

      if (!target) return false;

      const header = document.querySelector('header');
      const headerHeight = header ? header.getBoundingClientRect().height : 90;
      const targetRect = target.getBoundingClientRect();
      const absoluteTop = targetRect.top + window.pageYOffset;
      const targetOffset = Math.max(0, absoluteTop - headerHeight - 16);

      // If already within 4px of target offset, skip to avoid jitter
      if (Math.abs(targetRect.top - (headerHeight + 16)) > 4) {
        window.scrollTo({
          top: targetOffset,
          left: 0,
          behavior: 'instant',
        });
      }
      return true;
    };

    // Perform initial scroll attempt
    performScroll();

    // Listen for any user interaction to immediately cancel pending retries
    // This guarantees the page never pulls the user back once they start scrolling
    const handleUserInteraction = () => {
      cancelAllPending();
    };

    const interactionEvents: (keyof WindowEventMap)[] = [
      'wheel',
      'touchstart',
      'touchmove',
      'pointerdown',
      'keydown',
    ];

    interactionEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserInteraction, { passive: true, capture: true });
    });

    cleanupInteractionRef.current = () => {
      interactionEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserInteraction, { capture: true });
      });
    };

    // Bounded retries for dynamic content (images/fonts loading above section)
    const retryDelays = [60, 160, 360, 700];
    retryDelays.forEach((delay, index) => {
      const timerId = window.setTimeout(() => {
        performScroll();
        // After last retry, auto-clean user interaction listeners
        if (index === retryDelays.length - 1 && cleanupInteractionRef.current) {
          cleanupInteractionRef.current();
          cleanupInteractionRef.current = null;
        }
      }, delay);
      timerIdsRef.current.push(timerId);
    });
  };

  // 1. One-time browser configuration & global anchor interception
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // Reset scroll position on page reload before unload IF no hash is present
    const handleBeforeUnload = () => {
      if (!window.location.hash) {
        window.scrollTo(0, 0);
      }
    };

    // Intercept in-page hash links to keep React Router history synchronized
    const handleAnchorClick = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
      if (e.button !== 0) return;

      const anchor = (e.target as HTMLElement)?.closest('a');
      if (!anchor) return;

      // Don't intercept external links, mailto, tel, downloads, or admin panel links
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const rawHref = anchor.getAttribute('href');
      if (!rawHref) return;

      // Skip admin links
      if (location.pathname.startsWith('/admin') || rawHref.startsWith('/admin')) return;

      let targetHash = '';
      let isSamePage = false;

      if (rawHref.startsWith('#') && rawHref.length > 1) {
        targetHash = rawHref;
        isSamePage = true;
      } else if (rawHref.includes('#')) {
        try {
          const url = new URL(rawHref, window.location.origin);
          if (
            url.origin === window.location.origin &&
            url.pathname === location.pathname &&
            url.search === location.search
          ) {
            targetHash = url.hash;
            isSamePage = true;
          }
        } catch {
          // ignore malformed URLs
        }
      }

      if (isSamePage && targetHash) {
        e.preventDefault();
        // Use React Router's navigate for clean history synchronization
        navigate(
          {
            pathname: location.pathname,
            search: location.search,
            hash: targetHash,
          },
          { replace: false }
        );
        // Execute offset scroll (also handles repeated clicks on the same hash)
        scrollToHashElement(targetHash);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleAnchorClick);

    return () => {
      cancelAllPending();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleAnchorClick);
    };
  }, [location.pathname, location.search, navigate]);

  // 2. Main Scroll Controller for Route, Filter, and Hash Navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Scope check: If navigating in admin panel
    if (location.pathname.startsWith('/admin')) {
      const isPathnameChanged = location.pathname !== prevPathnameRef.current;
      if (isPathnameChanged) {
        resetScrollToTop();
      }
      prevPathnameRef.current = location.pathname;
      prevSearchRef.current = location.search;
      prevHashRef.current = location.hash;
      prevKeyRef.current = location.key;
      return;
    }

    // Initial mount handling
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      if (location.hash) {
        scrollToHashElement(location.hash);
      } else {
        resetScrollToTop();
      }
      prevPathnameRef.current = location.pathname;
      prevSearchRef.current = location.search;
      prevHashRef.current = location.hash;
      prevKeyRef.current = location.key;
      return;
    }

    const isPathnameChanged = location.pathname !== prevPathnameRef.current;
    const isHashChanged = location.hash !== prevHashRef.current;
    const isKeyChanged = location.key !== prevKeyRef.current;
    const isPopNavigation = navigationType === 'POP';

    // Parse search parameters for /shop filter detection
    const prevParams = new URLSearchParams(prevSearchRef.current);
    const currParams = new URLSearchParams(location.search);
    const isShopFilterChanged =
      location.pathname === '/shop' &&
      (prevParams.get('category') !== currParams.get('category') ||
        prevParams.get('subcategory') !== currParams.get('subcategory') ||
        prevParams.get('collection') !== currParams.get('collection') ||
        prevParams.get('search') !== currParams.get('search') ||
        prevParams.get('sort') !== currParams.get('sort'));

    // CASE 1: Location contains an intentional section hash (#boutique, #reviews)
    // Applies on new hash, POP back/forward to hash, or re-navigation to hash
    if (location.hash) {
      if (isHashChanged || isPathnameChanged || isPopNavigation || isKeyChanged) {
        scrollToHashElement(location.hash);
      }
    }
    // CASE 2: No hash in destination
    // On route change, POP back/forward, shop filter change, or re-navigation
    else if (isPathnameChanged || isPopNavigation || isShopFilterChanged || isKeyChanged) {
      resetScrollToTop();
    }

    prevPathnameRef.current = location.pathname;
    prevSearchRef.current = location.search;
    prevHashRef.current = location.hash;
    prevKeyRef.current = location.key;

    return () => {
      cancelAllPending();
    };
  }, [location.pathname, location.search, location.hash, location.key, navigationType]);

  return null;
};
