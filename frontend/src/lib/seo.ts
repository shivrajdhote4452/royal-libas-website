/**
 * SEO & Canonical Tag Utilities for Royal Libas.
 * 
 * Manages route-specific <link rel="canonical"> tags dynamically in the document head.
 * Prevents a single homepage canonical URL from being falsely broadcasted for product
 * or category pages in the React SPA.
 */

const CANONICAL_BASE = 'https://royallibasbytanya.com';

/**
 * Dynamically sets or updates the <link rel="canonical"> element in document.head.
 * Accepts either a full URL or a relative path (e.g. '/shop', '/product/gulnaar-set').
 */
export function setCanonicalUrl(urlOrPath: string): void {
  if (typeof document === 'undefined') return;

  let href = urlOrPath.trim();
  if (!href.startsWith('http://') && !href.startsWith('https://')) {
    const cleanPath = href.startsWith('/') ? href : `/${href}`;
    href = cleanPath === '/' ? `${CANONICAL_BASE}/` : `${CANONICAL_BASE}${cleanPath.replace(/\/+$/, '')}`;
  }

  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

