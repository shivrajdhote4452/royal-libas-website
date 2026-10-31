import { useState, useEffect } from 'react';
import { fetchStoreSettings } from './api';

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
