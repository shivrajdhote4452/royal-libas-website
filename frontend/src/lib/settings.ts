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
  review_date?: string | null;
  source?: string;
  source_url?: string | null;
  is_verified: boolean;
  owner_approved?: boolean;
  verified_date?: string | null;
  is_published: boolean;
  sort_order: number;
}

export interface CuratedMomentCard {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  mediaAssetId?: number | null;
  link: string;
  linkText?: string;
  displayOrder: number;
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
  // Curated for Every Moment ("Dress for the Moment")
  curatedMoments: CuratedMomentCard[];
  // Boutique Location, Visiting Hours & Reviews
  boutiqueName: string;
  boutiqueIntro: string;
  boutiqueAddress: string;
  boutiqueShortAddress: string;
  boutiquePincode: string;
  boutiqueLandmark: string;
  boutiquePhone?: string | null;
  boutiqueWhatsapp?: string | null;
  boutiqueOpeningHours?: string | null;
  boutiqueWeeklyHoliday?: string | null;
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

export const DEFAULT_BOUTIQUE_GALLERY: BoutiqueGalleryItem[] = [];

export function parseGalleryJson(raw: any): BoutiqueGalleryItem[] {
  if (Array.isArray(raw)) {
    return raw.slice(0, 4).filter((item) => item && (item.url || typeof item === 'string'));
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 4).filter((item) => item && (item.url || typeof item === 'string'));
      }
    } catch {}
  }
  return [];
}

// Requirement B: Default review list is empty. Sample fallback content removed.
export const DEFAULT_BOUTIQUE_REVIEWS: BoutiqueReviewItem[] = [];

export function parseReviewsJson(raw: any): BoutiqueReviewItem[] {
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    } catch {}
  }

  if (!list || list.length === 0) {
    return [];
  }

  return list.map((item, idx) => ({
    id: String(item.id || `rev-${idx + 1}`),
    author_name: String(item.author_name || '').trim(),
    rating: Number(item.rating) || 5,
    review_text: String(item.review_text || '').trim(),
    review_date: item.review_date ? String(item.review_date).trim() : null,
    source: String(item.source || 'google').trim().toLowerCase(),
    source_url: item.source_url ? String(item.source_url).trim() : null,
    is_verified: Boolean(item.is_verified),
    owner_approved: item.owner_approved !== undefined ? Boolean(item.owner_approved) : Boolean(item.is_published),
    verified_date: item.verified_date ? String(item.verified_date).trim() : null,
    is_published: Boolean(item.is_published),
    sort_order: typeof item.sort_order === 'number' ? item.sort_order : idx,
  }));
}

export const DEFAULT_CURATED_MOMENTS: CuratedMomentCard[] = [
  {
    id: 'everyday-elegance',
    title: 'EVERYDAY ELEGANCE',
    subtitle: 'From everyday grace to effortless sophistication',
    imageUrl: null,
    mediaAssetId: null,
    link: '/shop?category=TWO+PIECES',
    linkText: 'EXPLORE COLLECTION',
    displayOrder: 1,
  },
  {
    id: 'festive-celebrations',
    title: 'FESTIVE CELEBRATIONS',
    subtitle: 'For celebrations that become part of your story',
    imageUrl: null,
    mediaAssetId: null,
    link: '/shop?category=SUIT+SET',
    linkText: 'EXPLORE COLLECTION',
    displayOrder: 2,
  },
  {
    id: 'wedding-guest',
    title: 'WEDDING GUEST',
    subtitle: 'Opulent couture for memorable ceremonies',
    imageUrl: null,
    mediaAssetId: null,
    link: '/shop?category=HEAVY+DRESS',
    linkText: 'EXPLORE COLLECTION',
    displayOrder: 3,
  },
];

export function parseCuratedMomentsJson(raw: any): CuratedMomentCard[] {
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    } catch {}
  }

  if (!list || list.length === 0) {
    return DEFAULT_CURATED_MOMENTS;
  }

  const mapped = list.map((item, idx) => {
    const rawLink = String(item.link || '').trim();
    const safeLink = rawLink.startsWith('/') && !rawLink.startsWith('//') ? rawLink : '/shop';
    const rawImg = item.image_url ?? item.imageUrl;
    const cleanImg =
      rawImg && typeof rawImg === 'string' && rawImg.trim() && !isDemoImageUrl(rawImg)
        ? rawImg.trim()
        : null;
    return {
      id: String(item.id || `moment-${idx + 1}`),
      title: String(item.title || DEFAULT_CURATED_MOMENTS[idx]?.title || `MOMENT ${idx + 1}`).trim(),
      subtitle: item.subtitle ? String(item.subtitle).trim() : null,
      imageUrl: cleanImg,
      mediaAssetId:
        item.media_asset_id != null
          ? Number(item.media_asset_id)
          : item.mediaAssetId != null
          ? Number(item.mediaAssetId)
          : null,
      link: safeLink,
      linkText: String(item.link_text || item.linkText || 'EXPLORE COLLECTION').trim(),
      displayOrder:
        typeof item.display_order === 'number'
          ? item.display_order
          : typeof item.displayOrder === 'number'
          ? item.displayOrder
          : idx + 1,
    };
  });

  return mapped.sort((a, b) => a.displayOrder - b.displayOrder);
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

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  freeShippingThreshold: 1500,
  standardShippingFee: 99,
  announcementText: 'COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹1,500',
  whatsappNumber: '+91 98112 23344',
  supportEmail: 'care@royallibas.com',
  instagramHandle: '@royal_libas_by_tanya',
  codEnabled: false,
  onlinePaymentEnabled: true,
  heroTitle: 'Timeless Elegance, Handcrafted Regality',
  heroSubtitle: 'Pure handloom chanderi, tissue silks, and festive velvets made for the discerning connoisseur.',
  heroCtaText: 'Explore The Collection',
  heroCtaLink: '/shop',
  heroImageUrl: DEFAULT_EDITORIAL_IMAGES.heroImageUrl,
  categoryTwoPiecesImage: DEFAULT_EDITORIAL_IMAGES.categoryTwoPiecesImage,
  categorySuitSetImage: DEFAULT_EDITORIAL_IMAGES.categorySuitSetImage,
  categoryHeavyDressImage: DEFAULT_EDITORIAL_IMAGES.categoryHeavyDressImage,
  festiveBannerImage: DEFAULT_EDITORIAL_IMAGES.festiveBannerImage,
  posterOccasionImage: DEFAULT_EDITORIAL_IMAGES.posterOccasionImage,
  posterEverydayImage: DEFAULT_EDITORIAL_IMAGES.posterEverydayImage,
  posterStoryImage: DEFAULT_EDITORIAL_IMAGES.posterStoryImage,
  // Curated for Every Moment defaults
  curatedMoments: DEFAULT_CURATED_MOMENTS,
  // Boutique defaults
  boutiqueName: 'Royal Libas by Tanya',
  boutiqueIntro:
    'Experience our master craftsmanship, bespoke tailoring consultations, and luxury handloom collections in person at our flagship Jhansi boutique.',
  boutiqueAddress: 'Opposite Hotel Ambrosia, Prem Ganj, Sipri Bazar, Jhansi, Uttar Pradesh 284003',
  boutiqueShortAddress: 'Prem Ganj, Sipri Bazar, Jhansi, UP 284003',
  boutiquePincode: '284003',
  boutiqueLandmark: 'Opposite Hotel Ambrosia',
  boutiquePhone: null,
  boutiqueWhatsapp: null,
  boutiqueOpeningHours: null,
  boutiqueWeeklyHoliday: null,
  boutiqueSpecialNotice: null,
  boutiqueDirectionsUrl: 'https://share.google/rdahckZ4nVz7Bgu2H',
  boutiqueEmbedUrl: null,
  boutiqueReviewsUrl: 'https://share.google/rdahckZ4nVz7Bgu2H',
  boutiqueMainImage: null,
  boutiqueGallery: [],
  boutiqueSectionVisible: true,
  boutiqueReviews: [],
  boutiqueReviewsVisible: false,
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
      freeShippingThreshold:
        Number(parsed.freeShippingThreshold) || DEFAULT_STORE_SETTINGS.freeShippingThreshold,
      standardShippingFee:
        Number(parsed.standardShippingFee) || DEFAULT_STORE_SETTINGS.standardShippingFee,
      codEnabled:
        typeof parsed.codEnabled === 'boolean' ? parsed.codEnabled : DEFAULT_STORE_SETTINGS.codEnabled,
      onlinePaymentEnabled:
        typeof parsed.onlinePaymentEnabled === 'boolean'
          ? parsed.onlinePaymentEnabled
          : DEFAULT_STORE_SETTINGS.onlinePaymentEnabled,
      heroImageUrl: cleanUrl(parsed.heroImageUrl, DEFAULT_EDITORIAL_IMAGES.heroImageUrl),
      categoryTwoPiecesImage: cleanUrl(
        parsed.categoryTwoPiecesImage,
        DEFAULT_EDITORIAL_IMAGES.categoryTwoPiecesImage
      ),
      categorySuitSetImage: cleanUrl(
        parsed.categorySuitSetImage,
        DEFAULT_EDITORIAL_IMAGES.categorySuitSetImage
      ),
      categoryHeavyDressImage: cleanUrl(
        parsed.categoryHeavyDressImage,
        DEFAULT_EDITORIAL_IMAGES.categoryHeavyDressImage
      ),
      festiveBannerImage: cleanUrl(
        parsed.festiveBannerImage,
        DEFAULT_EDITORIAL_IMAGES.festiveBannerImage
      ),
      posterOccasionImage: cleanUrl(
        parsed.posterOccasionImage,
        DEFAULT_EDITORIAL_IMAGES.posterOccasionImage
      ),
      posterEverydayImage: cleanUrl(
        parsed.posterEverydayImage,
        DEFAULT_EDITORIAL_IMAGES.posterEverydayImage
      ),
      posterStoryImage: cleanUrl(
        parsed.posterStoryImage,
        DEFAULT_EDITORIAL_IMAGES.posterStoryImage
      ),
      boutiqueName: parsed.boutiqueName || DEFAULT_STORE_SETTINGS.boutiqueName,
      boutiqueIntro: parsed.boutiqueIntro || DEFAULT_STORE_SETTINGS.boutiqueIntro,
      boutiqueAddress: parsed.boutiqueAddress || DEFAULT_STORE_SETTINGS.boutiqueAddress,
      boutiqueShortAddress: parsed.boutiqueShortAddress || DEFAULT_STORE_SETTINGS.boutiqueShortAddress,
      boutiquePincode: parsed.boutiquePincode || DEFAULT_STORE_SETTINGS.boutiquePincode,
      boutiqueLandmark: parsed.boutiqueLandmark || DEFAULT_STORE_SETTINGS.boutiqueLandmark,
      boutiquePhone: parsed.boutiquePhone != null ? parsed.boutiquePhone : null,
      boutiqueWhatsapp: parsed.boutiqueWhatsapp != null ? parsed.boutiqueWhatsapp : null,
      boutiqueOpeningHours: parsed.boutiqueOpeningHours != null ? parsed.boutiqueOpeningHours : null,
      boutiqueWeeklyHoliday: parsed.boutiqueWeeklyHoliday != null ? parsed.boutiqueWeeklyHoliday : null,
      boutiqueSpecialNotice: parsed.boutiqueSpecialNotice != null ? parsed.boutiqueSpecialNotice : null,
      boutiqueDirectionsUrl: parsed.boutiqueDirectionsUrl || DEFAULT_STORE_SETTINGS.boutiqueDirectionsUrl,
      boutiqueEmbedUrl: parsed.boutiqueEmbedUrl != null ? parsed.boutiqueEmbedUrl : null,
      boutiqueReviewsUrl: parsed.boutiqueReviewsUrl != null ? parsed.boutiqueReviewsUrl : null,
      boutiqueMainImage: parsed.boutiqueMainImage != null ? parsed.boutiqueMainImage : null,
      boutiqueGallery: parseGalleryJson(parsed.boutiqueGallery),
      boutiqueSectionVisible:
        typeof parsed.boutiqueSectionVisible === 'boolean'
          ? parsed.boutiqueSectionVisible
          : DEFAULT_STORE_SETTINGS.boutiqueSectionVisible,
      boutiqueReviews: parseReviewsJson(parsed.boutiqueReviews),
      boutiqueReviewsVisible:
        typeof parsed.boutiqueReviewsVisible === 'boolean'
          ? parsed.boutiqueReviewsVisible
          : DEFAULT_STORE_SETTINGS.boutiqueReviewsVisible,
      curatedMoments: parseCuratedMomentsJson(parsed.curatedMoments),
    };

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
          codEnabled:
            typeof serverData.cod_enabled === 'boolean'
              ? serverData.cod_enabled
              : DEFAULT_STORE_SETTINGS.codEnabled,
          onlinePaymentEnabled:
            typeof serverData.online_payment_enabled === 'boolean'
              ? serverData.online_payment_enabled
              : DEFAULT_STORE_SETTINGS.onlinePaymentEnabled,
          heroTitle: serverData.hero_title || DEFAULT_STORE_SETTINGS.heroTitle,
          heroSubtitle: serverData.hero_subtitle || DEFAULT_STORE_SETTINGS.heroSubtitle,
          heroCtaText: serverData.hero_cta_text || DEFAULT_STORE_SETTINGS.heroCtaText,
          heroCtaLink: serverData.hero_cta_link || DEFAULT_STORE_SETTINGS.heroCtaLink,
          heroImageUrl: sanitizeSettingUrl(
            serverData.hero_image_url,
            DEFAULT_EDITORIAL_IMAGES.heroImageUrl
          ),
          categoryTwoPiecesImage: sanitizeSettingUrl(
            serverData.category_two_pieces_image,
            DEFAULT_EDITORIAL_IMAGES.categoryTwoPiecesImage
          ),
          categorySuitSetImage: sanitizeSettingUrl(
            serverData.category_suit_set_image,
            DEFAULT_EDITORIAL_IMAGES.categorySuitSetImage
          ),
          categoryHeavyDressImage: sanitizeSettingUrl(
            serverData.category_heavy_dress_image,
            DEFAULT_EDITORIAL_IMAGES.categoryHeavyDressImage
          ),
          festiveBannerImage: sanitizeSettingUrl(
            serverData.festive_banner_image,
            DEFAULT_EDITORIAL_IMAGES.festiveBannerImage
          ),
          posterOccasionImage: sanitizeSettingUrl(
            serverData.poster_occasion_image,
            DEFAULT_EDITORIAL_IMAGES.posterOccasionImage
          ),
          posterEverydayImage: sanitizeSettingUrl(
            serverData.poster_everyday_image,
            DEFAULT_EDITORIAL_IMAGES.posterEverydayImage
          ),
          posterStoryImage: sanitizeSettingUrl(
            serverData.poster_story_image,
            DEFAULT_EDITORIAL_IMAGES.posterStoryImage
          ),
          // Boutique data from server (respects cleared null values)
          boutiqueName: serverData.boutique_name || DEFAULT_STORE_SETTINGS.boutiqueName,
          boutiqueIntro: serverData.boutique_intro || DEFAULT_STORE_SETTINGS.boutiqueIntro,
          boutiqueAddress: serverData.boutique_address || DEFAULT_STORE_SETTINGS.boutiqueAddress,
          boutiqueShortAddress:
            serverData.boutique_short_address || DEFAULT_STORE_SETTINGS.boutiqueShortAddress,
          boutiquePincode: serverData.boutique_pincode || DEFAULT_STORE_SETTINGS.boutiquePincode,
          boutiqueLandmark: serverData.boutique_landmark || DEFAULT_STORE_SETTINGS.boutiqueLandmark,
          boutiquePhone: serverData.boutique_phone ? serverData.boutique_phone.trim() : null,
          boutiqueWhatsapp: serverData.boutique_whatsapp
            ? serverData.boutique_whatsapp.trim()
            : null,
          boutiqueOpeningHours: serverData.boutique_opening_hours
            ? serverData.boutique_opening_hours.trim()
            : null,
          boutiqueWeeklyHoliday: serverData.boutique_weekly_holiday
            ? serverData.boutique_weekly_holiday.trim()
            : null,
          boutiqueSpecialNotice: serverData.boutique_special_notice
            ? serverData.boutique_special_notice.trim()
            : null,
          boutiqueDirectionsUrl:
            serverData.boutique_directions_url || DEFAULT_STORE_SETTINGS.boutiqueDirectionsUrl,
          boutiqueEmbedUrl: serverData.boutique_embed_url
            ? serverData.boutique_embed_url.trim()
            : null,
          boutiqueReviewsUrl: serverData.boutique_reviews_url
            ? serverData.boutique_reviews_url.trim()
            : null,
          boutiqueMainImage: serverData.boutique_main_image
            ? serverData.boutique_main_image.trim()
            : null,
          boutiqueGallery: parseGalleryJson(serverData.boutique_gallery_json),
          boutiqueSectionVisible:
            typeof serverData.boutique_section_visible === 'boolean'
              ? serverData.boutique_section_visible
              : true,
          boutiqueReviews: parseReviewsJson(serverData.boutique_reviews_json),
          boutiqueReviewsVisible:
            typeof serverData.boutique_reviews_visible === 'boolean'
              ? serverData.boutique_reviews_visible
              : false,
          curatedMoments: parseCuratedMomentsJson(serverData.curated_moments_json),
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
