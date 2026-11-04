/**
 * SEO, Meta Tags & Canonical Tag Utilities for Royal Libas.
 * 
 * Manages route-specific <title>, <meta name="description">, and <link rel="canonical"> tags dynamically.
 * Prevents a single homepage canonical or description from being falsely broadcasted across the React SPA,
 * while ensuring that returning to the homepage restores the exact brand title and description.
 */

export const CANONICAL_BASE = 'https://royallibasbytanya.com';

export const DEFAULT_HOMEPAGE_TITLE = 'Royal Libas by Tanya | Designer Ethnic Wear in Jhansi';
export const DEFAULT_HOMEPAGE_DESCRIPTION =
  'Explore designer suit sets, co-ord sets and festive wear at Royal Libas by Tanya, Jhansi. Discover styles for everyday moments and special occasions.';

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

/**
 * Dynamically sets or updates the <meta name="description"> tag in document.head.
 * Also synchronizes og:description and twitter:description when present.
 */
export function setMetaDescription(description: string): void {
  if (typeof document === 'undefined') return;

  const content = description.trim();
  let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);

  const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
  if (ogDesc) {
    ogDesc.setAttribute('content', content);
  }

  const twitterDesc = document.querySelector('meta[name="twitter:description"]') as HTMLMetaElement | null;
  if (twitterDesc) {
    twitterDesc.setAttribute('content', content);
  }
}
