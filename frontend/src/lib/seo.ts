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
 * Route-specific metadata mapping for all public storefront routes.
 * Guarantees every route has its own title and description and prevents
 * metadata inheritance from previously visited pages.
 */
export const ROUTE_METADATA: Record<string, { title: string; description: string }> = {
  '/': {
    title: DEFAULT_HOMEPAGE_TITLE,
    description: DEFAULT_HOMEPAGE_DESCRIPTION,
  },
  '/shop': {
    title: 'Shop Handcrafted Festive Silhouettes | Royal Libas by Tanya',
    description:
      'Browse our handcrafted collection of designer suit sets, co-ords, and festive silhouettes at Royal Libas by Tanya, Jhansi.',
  },
  '/about': {
    title: 'About Us & Tanya’s Story | Royal Libas',
    description:
      'Learn about Royal Libas by Tanya, our Jhansi flagship atelier, master craftsmanship, and the heritage behind our luxury handcrafted ethnic silhouettes.',
  },
  '/contact': {
    title: 'Contact & Concierge | Royal Libas by Tanya',
    description:
      'Get in touch with Royal Libas by Tanya. Visit our flagship boutique in Jhansi, reach our styling concierge, or connect via WhatsApp for bespoke assistance.',
  },
  '/shipping-policy': {
    title: 'Shipping & Delivery Policy | Royal Libas by Tanya',
    description:
      'Learn about Royal Libas shipping timelines, insured pan-India delivery, packaging standards, and order dispatch terms.',
  },
  '/return-policy': {
    title: 'Returns & Exchange Policy | Royal Libas',
    description:
      'Review the Royal Libas returns and exchange policy for luxury boutique ethnic wear and custom orders.',
  },
  '/exchange-policy': {
    title: 'Returns & Exchange Policy | Royal Libas',
    description:
      'Review the Royal Libas returns and exchange policy for luxury boutique ethnic wear and custom orders.',
  },
  '/privacy-policy': {
    title: 'Privacy Policy | Royal Libas by Tanya',
    description:
      'Read the privacy policy of Royal Libas by Tanya detailing our data protection standards, payment security, and customer privacy commitments.',
  },
  '/terms-of-service': {
    title: 'Terms of Service | Royal Libas by Tanya',
    description:
      'Read the terms of service and conditions for purchasing handcrafted designer ethnic wear from Royal Libas by Tanya.',
  },
  '/track-order': {
    title: 'Track Your Order | Royal Libas by Tanya',
    description:
      'Track your Royal Libas order status in real-time with your order code and phone number for verified delivery updates.',
  },
  '/cart': {
    title: 'Shopping Bag | Royal Libas by Tanya',
    description:
      'Review the selected designer silhouettes and handcrafted ethnic ensembles in your Royal Libas shopping bag.',
  },
  '/checkout': {
    title: 'Secure Guest Checkout | Royal Libas by Tanya',
    description:
      'Complete your purchase with encrypted, secure guest checkout and verified payment methods at Royal Libas by Tanya.',
  },
};

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
