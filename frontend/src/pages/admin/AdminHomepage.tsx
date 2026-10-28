import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Save,
  RefreshCw,
  Eye,
  X,
  Volume2,
} from 'lucide-react';
import { fetchAdminStoreSettings, updateAdminStoreSettings } from '../../lib/api';

export const AdminHomepage: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [announcementText, setAnnouncementText] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [heroCtaText, setHeroCtaText] = useState('');
  const [heroCtaLink, setHeroCtaLink] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminStoreSettings(token);
      setAnnouncementEnabled(data.announcement_enabled ?? true);
      setAnnouncementText(data.announcement_text || 'Complimentary shipping across India on orders above ₹2,500');
      setHeroTitle(data.hero_title || "The Royal Festive Edit '26");
      setHeroSubtitle(data.hero_subtitle || 'Pure raw silks, opulent zari borders, and bespoke silhouettes');
      setHeroCtaText(data.hero_cta_text || 'Explore Collection');
      setHeroCtaLink(data.hero_cta_link || '/shop');
      setHeroImageUrl(data.hero_image_url || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1800&q=80');
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load homepage settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotification(null);
    try {
      await updateAdminStoreSettings(token, {
        announcement_enabled: announcementEnabled,
        announcement_text: announcementText.trim(),
        hero_title: heroTitle.trim(),
        hero_subtitle: heroSubtitle.trim(),
        hero_cta_text: heroCtaText.trim(),
        hero_cta_link: heroCtaLink.trim(),
        hero_image_url: heroImageUrl.trim(),
      });
      setNotification({ type: 'success', message: 'Homepage editorial content published to storefront!' });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to publish homepage settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#B58A3C]" />
            Homepage & CMS Editor
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Curate hero banners, announcement bar alerts, and storefront call-to-actions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 bg-white border border-[#E5D9C5] text-xs font-semibold text-gray-700 rounded-lg shadow-sm hover:bg-[#FCF8F0] transition-colors inline-flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-gray-500" />
            View Storefront
          </a>
          <button
            onClick={loadSettings}
            disabled={loading}
            className="p-2 bg-white border border-[#E5D9C5] rounded-lg text-gray-600 hover:bg-[#FCF8F0] transition-colors disabled:opacity-50"
            title="Reload settings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
          <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
          Loading storefront content...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ========================================================
              LEFT COLUMN: EDIT FORM (7 COLS)
              ======================================================== */}
          <form onSubmit={handleSave} className="lg:col-span-7 space-y-5">
            {/* Announcement Bar Section */}
            <div className="bg-white p-5 rounded-xl border border-[#E5D9C5]/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-[#B58A3C]" />
                  <h3 className="font-serif font-bold text-sm text-gray-900">Announcement Bar</h3>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={announcementEnabled}
                    onChange={(e) => setAnnouncementEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-[#5E1224] focus:ring-[#5E1224]"
                  />
                  <span className="text-xs font-semibold text-gray-700">Display Bar</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Announcement Message
                </label>
                <input
                  type="text"
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  placeholder="e.g., Free express shipping across India on orders above ₹2,500"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>
            </div>

            {/* Hero Banner Section */}
            <div className="bg-white p-5 rounded-xl border border-[#E5D9C5]/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <Sparkles className="w-4 h-4 text-[#B58A3C]" />
                <h3 className="font-serif font-bold text-sm text-gray-900">Hero Editorial Banner</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Hero Title / Headline <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                  placeholder="e.g., The Royal Festive Edit '26"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Hero Subtitle / Description
                </label>
                <textarea
                  rows={2}
                  value={heroSubtitle}
                  onChange={(e) => setHeroSubtitle(e.target.value)}
                  placeholder="e.g., Handcrafted pure fabrics, regal embroidery and timeless silhouettes"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">CTA Button Text</label>
                  <input
                    type="text"
                    value={heroCtaText}
                    onChange={(e) => setHeroCtaText(e.target.value)}
                    placeholder="e.g., Explore Collection"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">CTA Target Link</label>
                  <input
                    type="text"
                    value={heroCtaLink}
                    onChange={(e) => setHeroCtaLink(e.target.value)}
                    placeholder="e.g., /shop or /collections/anarkali"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-700">Hero Background Image URL</label>
                  <span className="text-[10px] text-gray-500">Copy link from Media Library</span>
                </div>
                <input
                  type="url"
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                  placeholder="https://... or /uploads/products/media_..."
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C] transition-colors shadow-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Publishing Changes...' : 'Publish to Storefront'}
              </button>
            </div>
          </form>

          {/* ========================================================
              RIGHT COLUMN: LIVE STOREFRONT PREVIEW (5 COLS)
              ======================================================== */}
          <div className="lg:col-span-5 space-y-3 sticky top-6">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-600 px-1">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#5E1224]" />
                Live Storefront Preview
              </span>
              <span className="text-[10px] text-gray-400">Updates dynamically</span>
            </div>

            <div className="bg-[#2B1B1E] rounded-xl overflow-hidden border border-[#E5D9C5] shadow-xl text-white">
              {/* Preview Announcement Bar */}
              {announcementEnabled && (
                <div className="bg-[#5E1224] py-1.5 px-3 text-center border-b border-[#B58A3C]/30">
                  <p className="text-[10px] font-medium tracking-wide text-[#FCF8F0] truncate">
                    {announcementText || 'Complimentary shipping across India on orders above ₹2,500'}
                  </p>
                </div>
              )}

              {/* Preview Hero Stage */}
              <div className="relative min-h-[320px] flex items-center justify-center p-6 text-center overflow-hidden">
                {/* Background image preview */}
                {heroImageUrl ? (
                  <img
                    src={heroImageUrl}
                    alt="Hero banner"
                    className="absolute inset-0 w-full h-full object-cover opacity-40"
                    onError={(e) => {
                      (e.target as any).src = 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80';
                    }}
                  />
                ) : null}

                <div className="relative z-10 space-y-3 max-w-sm">
                  <span className="inline-block text-[9px] uppercase tracking-[0.25em] text-[#B58A3C] font-semibold">
                    Royal Libas Atelier
                  </span>
                  <h2 className="font-serif text-2xl font-bold leading-tight text-[#FCF8F0]">
                    {heroTitle || 'Bespoke Luxury Edit'}
                  </h2>
                  <p className="text-xs text-[#FCF8F0]/80 leading-relaxed">
                    {heroSubtitle || 'Discover timeless craftsmanship.'}
                  </p>
                  <div className="pt-2">
                    <span className="inline-block px-4 py-2 bg-[#5E1224] text-white border border-[#B58A3C] rounded-full text-xs font-semibold tracking-wider uppercase shadow-md">
                      {heroCtaText || 'Shop Now'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Preview Footer note */}
              <div className="p-3 bg-[#1C1214] text-[10px] text-gray-400 text-center border-t border-white/5">
                Shoppers see this exact styling on desktop and mobile web.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
