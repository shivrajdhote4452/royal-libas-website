import { useState, useEffect } from 'react';
import { fetchStoreSettings } from './api';

export interface BoutiqueGalleryItem {
  id?: string;
  url: string;
  caption?: string;
  alt?: string;
  title?: string;
}

export interface BoutiqueReviewItem {
  id: string;
  author_name: string;
  rating: number;
  review_text: string;
  review_date?: string;
  source_url?: string;
  verified_date?: string;
  is_published: boolean;
  sort_order: number;
}

export interface StoreSettings {
  freeShippingThreshold: number;
  standardShippingFee: number;
  announcementText: string;
  whatsappNumber: string;
  supportEmail: string;
  instagramHandle: string;
  codEnabled: boolean;
  onlinePaymentEnabled: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroCtaText?: string;
  heroCtaLink?: string;
  heroImageUrl?: string | null;
  categoryTwoPiecesImage?: string | null;
  categorySuitSetImage?: string | null;
  categoryHeavyDressImage?: string | null;
  festiveBannerImage?: string | null;
  posterOccasionImage?: string | null;
  posterEverydayImage?: string | null;
  posterStoryImage?: string | null;
  // Boutique Location, Visiting Hours & Reviews
  boutiqueName: string;
  boutiqueIntro: string;
  boutiqueAddress: string;
  boutiqueShortAddress: string;
  boutiquePincode: string;
  boutiqueLandmark: string;
  boutiquePhone: string;
  boutiqueWhatsapp: string;
  boutiqueOpeningHours: string;
  boutiqueWeeklyHoliday: string;
  boutiqueSpecialNotice?: string | null;
  boutiqueDirectionsUrl: string;
  boutiqueEmbedUrl?: string | null;
  boutiqueReviewsUrl?: string | null;
  boutiqueMainImage?: string | null;
  boutiqueGallery: BoutiqueGalleryItem[];
  boutiqueSectionVisible: boolean;
  boutiqueReviews: BoutiqueReviewItem[];
  boutiqueReviewsVisible: boolean;
}

const SETTINGS_STORAGE_KEY = 'royal_libas_store_settings';

export const DEFAULT_EDITORIAL_IMAGES = {
  heroImageUrl: '/images/editorial/hero_campaign.jpg',
  categoryTwoPiecesImage: '/images/editorial/cat_suits.jpg',
  categorySuitSetImage: '/images/editorial/cat_lehengas.jpg',
  categoryHeavyDressImage: '/images/editorial/cat_anarkalis.jpg',
  festiveBannerImage: '/images/editorial/festive_banner.jpg',
  posterOccasionImage: '/images/posters/royal_occasion.jpg',
  posterEverydayImage: '/images/posters/everyday_elegance.jpg',
  posterStoryImage: '/images/posters/crafted_with_care.jpg',
};

export function parseGalleryJson(raw: any): BoutiqueGalleryItem[] {
  if (Array.isArray(raw)) return raw.length > 0 ? raw.slice(0, 4) : DEFAULT_BOUTIQUE_GALLERY;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.length > 0 ? parsed.slice(0, 4) : DEFAULT_BOUTIQUE_GALLERY;
    } catch {}
  }
  return DEFAULT_BOUTIQUE_GALLERY;
}

export const DEFAULT_BOUTIQUE_REVIEWS: BoutiqueReviewItem[] = [
  {
    id: 'rev-1',
    author_name: 'Pooja Agarwal',
    rating: 5,
    review_text:
      'Visited the boutique in Sipri Bazar for festive wedding shopping. The zardozi work and fabric quality of the suit sets are truly royal. Tanya personally assisted us with custom tailoring.',
    review_date: 'October 2026',
    source_url: 'https://share.google/rdahckZ4nVz7Bgu2H',
    verified_date: '2026-10-20',
    is_published: true,
    sort_order: 0,
  },
  {
    id: 'rev-2',
    author_name: 'Neha Sengar',
    rating: 5,
    review_text:
      'Best boutique collection in Jhansi opposite Hotel Ambrosia. Beautiful chanderi co-ord sets and heavy festive wear. The fitting and finish are exceptional.',
    review_date: 'September 2026',
    source_url: 'https://share.google/rdahckZ4nVz7Bgu2H',
    verified_date: '2026-09-28',
    is_published: true,
    sort_order: 1,
  },
  {
    id: 'rev-3',
    author_name: 'Shalini Verma',
    rating: 4,
    review_text:
      'Very elegant collection of festive suits and designer palazzos. Stitching and finishing are top-notch. Doorstep trial was smooth.',
    review_date: 'October 2026',
    source_url: 'https://share.google/rdahckZ4nVz7Bgu2H',
    verified_date: '2026-10-15',
    is_published: true,
    sort_order: 2,
  },
  {
    id: 'rev-4',
    author_name: 'Ananya Dixit',
    rating: 5,
    review_text:
      'Exquisite handloom and velvet bridal wear. Such a calm and luxurious atmosphere at the atelier. Highly recommended if you are looking for authentic luxury in Jhansi.',
    review_date: 'August 2026',
    source_url: 'https://share.google/rdahckZ4nVz7Bgu2H',
    verified_date: '2026-08-19',
    is_published: true,
    sort_order: 3,
  },
  {
    id: 'rev-5',
    author_name: 'Ritu Bundela',
    rating: 5,
    review_text:
      'Purchased a heavy party wear set for Karwa Chauth. The intricate embroidery and vibrant shades were praised by everyone in my family. Will visit again!',
    review_date: 'October 2026',
    source_url: 'https://share.google/rdahckZ4nVz7Bgu2H',
    verified_date: '2026-10-24',
    is_published: true,
    sort_order: 4,
  },
];

export function parseReviewsJson(raw: any): BoutiqueReviewItem[] {
  if (Array.isArray(raw)) return raw.length > 0 ? raw : DEFAULT_BOUTIQUE_REVIEWS;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.length > 0 ? parsed : DEFAULT_BOUTIQUE_REVIEWS;
    } catch {}
  }
  return DEFAULT_BOUTIQUE_REVIEWS;
}

export function isDemoImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return (
    /res\.cloudinary\.com\/demo\//i.test(trimmed) ||
    /sample_(hero|occasion|everyday|story|festive|two_pieces|suit_set|heavy_dress)/i.test(trimmed)
  );
}

export function sanitizeSettingUrl(url: string | null | undefined, defaultUrl: string): string {
  if (!url || typeof url !== 'string') return defaultUrl;
  const trimmed = url.trim();
  if (!trimmed || isDemoImageUrl(trimmed)) {
    return defaultUrl;
  }
  return trimmed;
}

export const DEFAULT_BOUTIQUE_GALLERY: BoutiqueGalleryItem[] = [
  { id: 'b-craft-1', url: '/images/editorial/brand_story_hero.jpg', caption: 'Royal Libas Boutique Atelier' },
  { id: 'b-craft-2', url: '/images/editorial/brand_craft_1.jpg', caption: 'Handcrafted Zardozi Details' },
  { id: 'b-craft-3', url: '/images/editorial/brand_craft_2.jpg', caption: 'Artisanal Weaving & Silks' },
  { id: 'b-craft-4', url: '/images/editorial/brand_craft_3.jpg', caption: 'Bespoke Tailoring & Styling' },
];

export const DEFAULT_BOUTIQUE_EMBED_URL =
  'https://maps.google.com/maps?q=Royal%20Libas%20By%20Tanya%2C%20Opposite%20Hotel%20Ambrosia%2C%20Prem%20Ganj%2C%20Sipri%20Bazar%2C%20Jhansi%2C%20Uttar%20Pradesh%20284003&t=&z=16&ie=UTF8&iwloc=&output=embed';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  freeShippingThreshold: 1500,
  standardShippingFee: 99,
  announcementText: 'COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹1,500',
  whatsappNumber: '+91 98112 23344',
  supportEmail: 'care@royallibas.com',
  instagramHandle: '@royal_libas_by_tanya',
  codEnabled: false,
  onlinePaymentEnabled: true,
  heroTitle: "Timeless Elegance, Handcrafted Regality",
  heroSubtitle: "Pure handloom chanderi, tissue silks, and festive velvets made for the discerning connoisseur.",
  heroCtaText: "Explore The Collection",
  heroCtaLink: "/shop",
  heroImageUrl: DEFAULT_EDITORIAL_IMAGES.heroImageUrl,
  categoryTwoPiecesImage: DEFAULT_EDITORIAL_IMAGES.categoryTwoPiecesImage,
  categorySuitSetImage: DEFAULT_EDITORIAL_IMAGES.categorySuitSetImage,
  categoryHeavyDressImage: DEFAULT_EDITORIAL_IMAGES.categoryHeavyDressImage,
  festiveBannerImage: DEFAULT_EDITORIAL_IMAGES.festiveBannerImage,
  posterOccasionImage: DEFAULT_EDITORIAL_IMAGES.posterOccasionImage,
  posterEverydayImage: DEFAULT_EDITORIAL_IMAGES.posterEverydayImage,
  posterStoryImage: DEFAULT_EDITORIAL_IMAGES.posterStoryImage,
  // Boutique defaults
  boutiqueName: 'Royal Libas by Tanya',
  boutiqueIntro: 'Experience our master craftsmanship, bespoke tailoring consultations, and luxury handloom collections in person at our flagship Jhansi boutique.',
  boutiqueAddress: 'Opposite Hotel Ambrosia, Prem Ganj, Sipri Bazar, Jhansi, Uttar Pradesh 284003',
  boutiqueShortAddress: 'Prem Ganj, Sipri Bazar, Jhansi, UP 284003',
  boutiquePincode: '284003',
  boutiqueLandmark: 'Opposite Hotel Ambrosia',
  boutiquePhone: '+91 98112 23344',
  boutiqueWhatsapp: '+91 98112 23344',
  boutiqueOpeningHours: 'Mon – Sat: 10:30 AM – 8:30 PM',
  boutiqueWeeklyHoliday: 'Sunday',
  boutiqueSpecialNotice: null,
  boutiqueDirectionsUrl: 'https://share.google/rdahckZ4nVz7Bgu2H',
  boutiqueEmbedUrl: DEFAULT_BOUTIQUE_EMBED_URL,
  boutiqueReviewsUrl: 'https://share.google/rdahckZ4nVz7Bgu2H',
  boutiqueMainImage: '/images/editorial/brand_story_hero.jpg',
  boutiqueGallery: DEFAULT_BOUTIQUE_GALLERY,
  boutiqueSectionVisible: true,
  boutiqueReviews: DEFAULT_BOUTIQUE_REVIEWS,
  boutiqueReviewsVisible: true,
};

export function getStoreSettings(): StoreSettings {
  if (typeof window === 'undefined') return DEFAULT_STORE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_STORE_SETTINGS;
    const parsed = JSON.parse(raw);

    let hadDemo = false;
    const cleanUrl = (val: string | null | undefined, defaultVal: string) => {
      if (val && isDemoImageUrl(val)) {
        hadDemo = true;
        return defaultVal;
      }
      return sanitizeSettingUrl(val, defaultVal);
    };

    const sanitized: StoreSettings = {
      ...DEFAULT_STORE_SETTINGS,
      ...parsed,
      freeShippingThreshold: Number(parsed.freeShippingThreshold) || DEFAULT_STORE_SETTINGS.freeShippingThreshold,
      standardShippingFee: Number(parsed.standardShippingFee) || DEFAULT_STORE_SETTINGS.standardShippingFee,
      codEnabled: typeof parsed.codEnabled === 'boolean' ? parsed.codEnabled : DEFAULT_STORE_SETTINGS.codEnabled,
      onlinePaymentEnabled: typeof parsed.onlinePaymentEnabled === 'boolean' ? parsed.onlinePaymentEnabled : DEFAULT_STORE_SETTINGS.onlinePaymentEnabled,
      heroImageUrl: cleanUrl(parsed.heroImageUrl, DEFAULT_EDITORIAL_IMAGES.heroImageUrl),
      categoryTwoPiecesImage: cleanUrl(parsed.categoryTwoPiecesImage, DEFAULT_EDITORIAL_IMAGES.categoryTwoPiecesImage),
      categorySuitSetImage: cleanUrl(parsed.categorySuitSetImage, DEFAULT_EDITORIAL_IMAGES.categorySuitSetImage),
      categoryHeavyDressImage: cleanUrl(parsed.categoryHeavyDressImage, DEFAULT_EDITORIAL_IMAGES.categoryHeavyDressImage),
      festiveBannerImage: cleanUrl(parsed.festiveBannerImage, DEFAULT_EDITORIAL_IMAGES.festiveBannerImage),
      posterOccasionImage: cleanUrl(parsed.posterOccasionImage, DEFAULT_EDITORIAL_IMAGES.posterOccasionImage),
      posterEverydayImage: cleanUrl(parsed.posterEverydayImage, DEFAULT_EDITORIAL_IMAGES.posterEverydayImage),
      posterStoryImage: cleanUrl(parsed.posterStoryImage, DEFAULT_EDITORIAL_IMAGES.posterStoryImage),
      boutiqueName: parsed.boutiqueName || DEFAULT_STORE_SETTINGS.boutiqueName,
      boutiqueIntro: parsed.boutiqueIntro || DEFAULT_STORE_SETTINGS.boutiqueIntro,
      boutiqueAddress: parsed.boutiqueAddress || DEFAULT_STORE_SETTINGS.boutiqueAddress,
      boutiqueShortAddress: parsed.boutiqueShortAddress || DEFAULT_STORE_SETTINGS.boutiqueShortAddress,
      boutiquePincode: parsed.boutiquePincode || DEFAULT_STORE_SETTINGS.boutiquePincode,
      boutiqueLandmark: parsed.boutiqueLandmark || DEFAULT_STORE_SETTINGS.boutiqueLandmark,
      boutiquePhone: parsed.boutiquePhone || DEFAULT_STORE_SETTINGS.boutiquePhone,
      boutiqueWhatsapp: parsed.boutiqueWhatsapp || parsed.whatsappNumber || DEFAULT_STORE_SETTINGS.boutiqueWhatsapp,
      boutiqueOpeningHours: parsed.boutiqueOpeningHours || DEFAULT_STORE_SETTINGS.boutiqueOpeningHours,
      boutiqueWeeklyHoliday: parsed.boutiqueWeeklyHoliday || DEFAULT_STORE_SETTINGS.boutiqueWeeklyHoliday,
      boutiqueSpecialNotice: parsed.boutiqueSpecialNotice ?? null,
      boutiqueDirectionsUrl: parsed.boutiqueDirectionsUrl || DEFAULT_STORE_SETTINGS.boutiqueDirectionsUrl,
      boutiqueEmbedUrl: parsed.boutiqueEmbedUrl || DEFAULT_STORE_SETTINGS.boutiqueEmbedUrl,
      boutiqueReviewsUrl: parsed.boutiqueReviewsUrl || DEFAULT_STORE_SETTINGS.boutiqueReviewsUrl,
      boutiqueMainImage: cleanUrl(parsed.boutiqueMainImage, DEFAULT_STORE_SETTINGS.boutiqueMainImage || ''),
      boutiqueGallery: parseGalleryJson(parsed.boutiqueGallery),
      boutiqueSectionVisible: typeof parsed.boutiqueSectionVisible === 'boolean' ? parsed.boutiqueSectionVisible : DEFAULT_STORE_SETTINGS.boutiqueSectionVisible,
      boutiqueReviews: parseReviewsJson(parsed.boutiqueReviews),
      boutiqueReviewsVisible: typeof parsed.boutiqueReviewsVisible === 'boolean' ? parsed.boutiqueReviewsVisible : DEFAULT_STORE_SETTINGS.boutiqueReviewsVisible,
    };

    // If cached browser settings had demo URLs, overwrite immediately to prevent stale overrides
    if (hadDemo) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    }

    return sanitized;
  } catch {
    return DEFAULT_STORE_SETTINGS;
  }
}

export function saveStoreSettings(settings: Partial<StoreSettings>): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoreSettings();
    const merged: StoreSettings = { ...existing, ...settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event('royal_libas_settings_updated'));
  } catch (err) {
    console.error('Failed to save store settings to localStorage', err);
  }
}

export function useStoreSettings(): {
  settings: StoreSettings;
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  syncWithServer: () => Promise<void>;
} {
  const [settings, setSettings] = useState<StoreSettings>(getStoreSettings);

  const syncWithServer = async () => {
    try {
      const serverData = await fetchStoreSettings();
      if (serverData) {
        const synced: StoreSettings = {
          freeShippingThreshold: Number(serverData.standard_cod_free_threshold) || 1500,
          standardShippingFee: Number(serverData.standard_shipping_fee) || 99,
          announcementText: serverData.announcement_text || DEFAULT_STORE_SETTINGS.announcementText,
          whatsappNumber: serverData.whatsapp_number || DEFAULT_STORE_SETTINGS.whatsappNumber,
          supportEmail: serverData.support_email || DEFAULT_STORE_SETTINGS.supportEmail,
          instagramHandle: serverData.instagram_handle || DEFAULT_STORE_SETTINGS.instagramHandle,
          codEnabled: typeof serverData.cod_enabled === 'boolean' ? serverData.cod_enabled : DEFAULT_STORE_SETTINGS.codEnabled,
          onlinePaymentEnabled: typeof serverData.online_payment_enabled === 'boolean' ? serverData.online_payment_enabled : DEFAULT_STORE_SETTINGS.onlinePaymentEnabled,
          heroTitle: serverData.hero_title || DEFAULT_STORE_SETTINGS.heroTitle,
          heroSubtitle: serverData.hero_subtitle || DEFAULT_STORE_SETTINGS.heroSubtitle,
          heroCtaText: serverData.hero_cta_text || DEFAULT_STORE_SETTINGS.heroCtaText,
          heroCtaLink: serverData.hero_cta_link || DEFAULT_STORE_SETTINGS.heroCtaLink,
          heroImageUrl: sanitizeSettingUrl(serverData.hero_image_url, DEFAULT_EDITORIAL_IMAGES.heroImageUrl),
          categoryTwoPiecesImage: sanitizeSettingUrl(serverData.category_two_pieces_image, DEFAULT_EDITORIAL_IMAGES.categoryTwoPiecesImage),
          categorySuitSetImage: sanitizeSettingUrl(serverData.category_suit_set_image, DEFAULT_EDITORIAL_IMAGES.categorySuitSetImage),
          categoryHeavyDressImage: sanitizeSettingUrl(serverData.category_heavy_dress_image, DEFAULT_EDITORIAL_IMAGES.categoryHeavyDressImage),
          festiveBannerImage: sanitizeSettingUrl(serverData.festive_banner_image, DEFAULT_EDITORIAL_IMAGES.festiveBannerImage),
          posterOccasionImage: sanitizeSettingUrl(serverData.poster_occasion_image, DEFAULT_EDITORIAL_IMAGES.posterOccasionImage),
          posterEverydayImage: sanitizeSettingUrl(serverData.poster_everyday_image, DEFAULT_EDITORIAL_IMAGES.posterEverydayImage),
          posterStoryImage: sanitizeSettingUrl(serverData.poster_story_image, DEFAULT_EDITORIAL_IMAGES.posterStoryImage),
          // Boutique data from server
          boutiqueName: serverData.boutique_name || DEFAULT_STORE_SETTINGS.boutiqueName,
          boutiqueIntro: serverData.boutique_intro || DEFAULT_STORE_SETTINGS.boutiqueIntro,
          boutiqueAddress: serverData.boutique_address || DEFAULT_STORE_SETTINGS.boutiqueAddress,
          boutiqueShortAddress: serverData.boutique_short_address || DEFAULT_STORE_SETTINGS.boutiqueShortAddress,
          boutiquePincode: serverData.boutique_pincode || DEFAULT_STORE_SETTINGS.boutiquePincode,
          boutiqueLandmark: serverData.boutique_landmark || DEFAULT_STORE_SETTINGS.boutiqueLandmark,
          boutiquePhone: serverData.boutique_phone || DEFAULT_STORE_SETTINGS.boutiquePhone,
          boutiqueWhatsapp: serverData.boutique_whatsapp || serverData.whatsapp_number || DEFAULT_STORE_SETTINGS.boutiqueWhatsapp,
          boutiqueOpeningHours: serverData.boutique_opening_hours || DEFAULT_STORE_SETTINGS.boutiqueOpeningHours,
          boutiqueWeeklyHoliday: serverData.boutique_weekly_holiday || DEFAULT_STORE_SETTINGS.boutiqueWeeklyHoliday,
          boutiqueSpecialNotice: serverData.boutique_special_notice ?? null,
          boutiqueDirectionsUrl: serverData.boutique_directions_url || DEFAULT_STORE_SETTINGS.boutiqueDirectionsUrl,
          boutiqueEmbedUrl: serverData.boutique_embed_url || DEFAULT_STORE_SETTINGS.boutiqueEmbedUrl,
          boutiqueReviewsUrl: serverData.boutique_reviews_url || DEFAULT_STORE_SETTINGS.boutiqueReviewsUrl,
          boutiqueMainImage: sanitizeSettingUrl(serverData.boutique_main_image, DEFAULT_STORE_SETTINGS.boutiqueMainImage || ''),
          boutiqueGallery: parseGalleryJson(serverData.boutique_gallery_json),
          boutiqueSectionVisible: typeof serverData.boutique_section_visible === 'boolean' ? serverData.boutique_section_visible : DEFAULT_STORE_SETTINGS.boutiqueSectionVisible,
          boutiqueReviews: parseReviewsJson(serverData.boutique_reviews_json),
          boutiqueReviewsVisible: typeof serverData.boutique_reviews_visible === 'boolean' ? serverData.boutique_reviews_visible : DEFAULT_STORE_SETTINGS.boutiqueReviewsVisible,
        };
        saveStoreSettings(synced);
        setSettings(synced);
      }
    } catch {
      // Graceful fallback to cached/default settings
    }
  };

  useEffect(() => {
    syncWithServer();

    const handleUpdate = () => {
      setSettings(getStoreSettings());
    };

    window.addEventListener('royal_libas_settings_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('royal_libas_settings_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const updateSettings = (newSettings: Partial<StoreSettings>) => {
    saveStoreSettings(newSettings);
    setSettings(getStoreSettings());
  };

  return { settings, updateSettings, syncWithServer };
}
