import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * ScrollRestoration — Centralized Deterministic Scroll Controller for Royal Libas.
 * 
 * Guarantees:
 * 1. New page navigation (Home → Shop, Shop → Product, etc.) starts instantly at (0, 0).
 * 2. Reload: Always opens at the top of the page.
 * 3. Browser Back & Forward: Opens destination route at (0, 0); disables browser's auto-restoration.
 * 4. Section hash links (#id): Accurately scrolls to target section accounting for the fixed sticky header
 *    even after asynchronous images/content settle.
 * 5. Shop filters and category links: Changes to category, subcategory, collection, or search on /shop
 *    scroll to the top of results.
 * 6. Responsive: Eliminates visible jumping or sluggish transitions across mobile Chrome and desktop.
 */
export const ScrollRestoration: React.FC = () => {
  const location = useLocation();
  const navigationType = useNavigationType();

  const isInitialMountRef = useRef<boolean>(true);
  const prevPathnameRef = useRef<string>(location.pathname);
  const prevSearchRef = useRef<string>(location.search);
  const prevKeyRef = useRef<string>(location.key);

  // Helper: Reset to top instantly across all modern browsers
  const resetScrollToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Keep firmly at top on the next animation frame in case of layout shifts
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });

    // Secondary defensive pass for late-mounting content
    setTimeout(() => {
      if (!window.location.hash) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    }, 50);
  };

  // Helper: Scroll to target section hash element accounting for the fixed sticky header
  const scrollToHashElement = (hashId: string) => {
    const cleanId = hashId.replace(/^#/, '').trim();
    if (!cleanId) return;

    const performScroll = () => {
      const target =
        document.getElementById(cleanId) ||
        document.querySelector(`[name="${cleanId}"]`);

      if (!target) return false;

      const header = document.querySelector('header');
      const headerHeight = header ? header.getBoundingClientRect().height : 90;
      const targetRect = target.getBoundingClientRect();
      const absoluteTop = targetRect.top + window.pageYOffset;
      const offsetPosition = Math.max(0, absoluteTop - headerHeight - 16);

      window.scrollTo({
        top: offsetPosition,
        left: 0,
        behavior: 'instant',
      });
      return true;
    };

    // Attempt immediate scroll
    performScroll();

    // Retry at intervals as hero posters, fonts, and images above load and shift document height
    const timers = [30, 80, 160, 320, 600, 1000, 1600].map((delay) =>
      setTimeout(performScroll, delay)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  };

  // 1. Configure browser scrollRestoration to 'manual' once on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }

      // If initial page load has no hash, ensure top position immediately
      if (!window.location.hash) {
        resetScrollToTop();
      }

      // Reset scroll position on page reload before unload
      const handleBeforeUnload = () => {
        window.scrollTo(0, 0);
      };

      // Intercept in-page hash anchor clicks (e.g. <a href="#reviews">) to offset for sticky header
      const handleAnchorClick = (e: MouseEvent) => {
        const anchor = (e.target as HTMLElement)?.closest('a');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (href && href.startsWith('#') && href.length > 1) {
          e.preventDefault();
          const targetHash = href;
          if (window.location.hash !== targetHash) {
            window.history.pushState(null, '', targetHash);
          }
          scrollToHashElement(targetHash);
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('click', handleAnchorClick);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('click', handleAnchorClick);
      };
    }
  }, []);

  // 2. Main Scroll Controller for Route & Filter Navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Handle initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      if (location.hash) {
        return scrollToHashElement(location.hash);
      } else {
        resetScrollToTop();
        return;
      }
    }

    // ========================================================
    // CASE A: URL contains a section hash (#boutique, #reviews, etc.)
    // ========================================================
    if (location.hash) {
      const cleanup = scrollToHashElement(location.hash);
      prevPathnameRef.current = location.pathname;
      prevSearchRef.current = location.search;
      prevKeyRef.current = location.key;
      return cleanup;
    }

    // Listen to native hash changes on same page
    const handleHashChange = () => {
      if (window.location.hash) {
        scrollToHashElement(window.location.hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);

    // ========================================================
    // CASE B: Standard route or filter navigation (no hash)
    // ========================================================
    const isPathnameChanged = location.pathname !== prevPathnameRef.current;
    const isKeyChanged = location.key !== prevKeyRef.current;
    const isPopNavigation = navigationType === 'POP';

    // Parse search queries to detect filter updates on /shop
    const prevParams = new URLSearchParams(prevSearchRef.current);
    const currParams = new URLSearchParams(location.search);

    const isShopFilterChanged =
      location.pathname === '/shop' &&
      (prevParams.get('category') !== currParams.get('category') ||
        prevParams.get('subcategory') !== currParams.get('subcategory') ||
        prevParams.get('collection') !== currParams.get('collection') ||
        prevParams.get('search') !== currParams.get('search') ||
        prevParams.get('sort') !== currParams.get('sort'));

    // Scroll to top on:
    // - Any new route change (Home → Shop, Shop → Product, etc.)
    // - Browser Back / Forward (POP navigation)
    // - Shop category / subcategory / collection / sort filter changes
    // - Re-navigation with new key
    if (isPathnameChanged || isPopNavigation || isShopFilterChanged || isKeyChanged) {
      resetScrollToTop();
    }

    prevPathnameRef.current = location.pathname;
    prevSearchRef.current = location.search;
    prevKeyRef.current = location.key;

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [location.pathname, location.search, location.hash, location.key, navigationType]);

  return null;
};
