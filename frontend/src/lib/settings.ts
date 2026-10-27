import { useState, useEffect } from 'react';

export interface StoreSettings {
  freeShippingThreshold: number;
  standardShippingFee: number;
  announcementText: string;
  whatsappNumber: string;
  supportEmail: string;
  instagramHandle: string;
}

const SETTINGS_STORAGE_KEY = 'royal_libas_store_settings';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  freeShippingThreshold: 999,
  standardShippingFee: 99,
  announcementText: 'Free shipping on orders above ₹999 | COD Available | 3-5 Days Delivery',
  whatsappNumber: '+91 98765 43210',
  supportEmail: 'care@royallibas.com',
  instagramHandle: '@royal_libas_by_tanya',
};

export function getStoreSettings(): StoreSettings {
  if (typeof window === 'undefined') return DEFAULT_STORE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_STORE_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STORE_SETTINGS,
      ...parsed,
      freeShippingThreshold: Number(parsed.freeShippingThreshold) || DEFAULT_STORE_SETTINGS.freeShippingThreshold,
      standardShippingFee: Number(parsed.standardShippingFee) || DEFAULT_STORE_SETTINGS.standardShippingFee,
    };
  } catch {
    return DEFAULT_STORE_SETTINGS;
  }
}

export function saveStoreSettings(settings: StoreSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event('royal_libas_settings_updated'));
  } catch (err) {
    console.error('Failed to save store settings to localStorage', err);
  }
}

export function useStoreSettings(): {
  settings: StoreSettings;
  updateSettings: (newSettings: StoreSettings) => void;
} {
  const [settings, setSettings] = useState<StoreSettings>(getStoreSettings);

  useEffect(() => {
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

  const updateSettings = (newSettings: StoreSettings) => {
    saveStoreSettings(newSettings);
    setSettings(newSettings);
  };

  return { settings, updateSettings };
}
