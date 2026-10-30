import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Save,
  RefreshCw,
  Eye,
  X,
  Upload,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Layers,
} from 'lucide-react';
import {
  fetchAdminStoreSettings,
  updateAdminStoreSettings,
  adminListMedia,
  adminUploadMedia,
} from '../../lib/api';
import type { MediaAsset } from '../../types/product';

interface ImageFieldProps {
  label: string;
  recommendation: string;
  value: string;
  onChange: (val: string) => void;
  onOpenMediaModal: (fieldSetter: (val: string) => void) => void;
  onDirectUpload: (file: File, fieldSetter: (val: string) => void) => Promise<void>;
  uploading: boolean;
  aspectRatioLabel?: string;
}

const MediaFieldRow: React.FC<ImageFieldProps> = ({
  label,
  recommendation,
  value,
  onChange,
  onOpenMediaModal,
  onDirectUpload,
  uploading,
  aspectRatioLabel = '4:5 Portrait',
}) => {
  return (
    <div className="bg-white p-4 border border-[#E5D9C5] rounded-xl shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h3 className="font-semibold text-gray-900 text-xs sm:text-sm flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 text-[#B58A3C]" />
            {label}
          </h3>
          <p className="text-[11px] text-gray-500">
            {recommendation} &bull; <span className="font-medium text-[#5E1224]">{aspectRatioLabel}</span>
          </p>
        </div>
        {value && (
          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 self-start sm:self-auto">
            Active Image Configured ✓
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* Preview Container */}
        <div className="w-28 sm:w-32 h-36 sm:h-40 bg-[#FCF8F0] border border-[#E8DFD0] rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner group">
          {value ? (
            <>
              <img
                src={value}
                alt={label}
                className="w-full h-full object-cover object-top"
              />
              <button
                type="button"
                onClick={() => onChange('')}
                className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-red-700 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                title="Remove photo"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <div className="p-3 text-center text-[#5E1224]/60">
              <span className="font-serif text-sm font-bold block mb-1">RL</span>
              <span className="text-[9px] uppercase tracking-wider block font-medium">Coming Soon</span>
            </div>
          )}
        </div>

        {/* Input & Upload Controls */}
        <div className="flex-1 w-full space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5E1224] hover:bg-[#430C19] text-white rounded text-xs font-semibold shadow-sm transition-colors ${
              uploading ? 'opacity-60 cursor-not-allowed' : ''
            }`}>
              <Upload className="w-3.5 h-3.5 text-[#D4AF67]" />
              <span>{uploading ? 'Uploading...' : 'Upload New Photo'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onDirectUpload(file, onChange);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => onOpenMediaModal(onChange)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5D9C5] hover:bg-[#FCF8F0] text-gray-700 rounded text-xs font-semibold shadow-sm transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-[#B58A3C]" />
              <span>Choose from Media Library</span>
            </button>

            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="px-2.5 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
              Or paste direct Cloudinary / image URL:
            </label>
            <input
              type="url"
              placeholder="https://res.cloudinary.com/..."
              value={value}
              onChange={(e) => onChange(e.target.value.trim())}
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:border-[#5E1224]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminHomepage: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [announcementText, setAnnouncementText] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [heroCtaText, setHeroCtaText] = useState('');
  const [heroCtaLink, setHeroCtaLink] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');

  // Category Images (The 3 agreed categories)
  const [catTwoPiecesImage, setCatTwoPiecesImage] = useState('');
  const [catSuitSetImage, setCatSuitSetImage] = useState('');
  const [catHeavyDressImage, setCatHeavyDressImage] = useState('');

  // Festive Banner & Posters
  const [festiveBannerImage, setFestiveBannerImage] = useState('');
  const [posterOccasionImage, setPosterOccasionImage] = useState('');
  const [posterEverydayImage, setPosterEverydayImage] = useState('');
  const [posterStoryImage, setPosterStoryImage] = useState('');

  // Media Library Modal State
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [targetFieldSetter, setTargetFieldSetter] = useState<((val: string) => void) | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminStoreSettings(token);
      setAnnouncementEnabled(data.announcement_enabled ?? true);
      setAnnouncementText(data.announcement_text || 'COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS');
      setHeroTitle(data.hero_title || 'Timeless Elegance, Handcrafted Regality');
      setHeroSubtitle(data.hero_subtitle || 'Pure handloom chanderi, tissue silks, and festive velvets made for the discerning connoisseur.');
      setHeroCtaText(data.hero_cta_text || 'Explore The Collection');
      setHeroCtaLink(data.hero_cta_link || '/shop');
      setHeroImageUrl(data.hero_image_url || '');

      setCatTwoPiecesImage(data.category_two_pieces_image || '');
      setCatSuitSetImage(data.category_suit_set_image || '');
      setCatHeavyDressImage(data.category_heavy_dress_image || '');

      setFestiveBannerImage(data.festive_banner_image || '');
      setPosterOccasionImage(data.poster_occasion_image || '');
      setPosterEverydayImage(data.poster_everyday_image || '');
      setPosterStoryImage(data.poster_story_image || '');
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load homepage settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [token]);

  const handleOpenMediaModal = async (setter: (val: string) => void) => {
    setTargetFieldSetter(() => setter);
    setShowMediaModal(true);
    setLoadingMedia(true);
    try {
      const assets = await adminListMedia(token);
      setMediaAssets(assets);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load media assets' });
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleSelectMedia = (asset: MediaAsset) => {
    if (targetFieldSetter) {
      targetFieldSetter(asset.secure_url || asset.url);
    }
    setShowMediaModal(false);
    setTargetFieldSetter(null);
  };

  const handleDirectUpload = async (file: File, setter: (val: string) => void) => {
    setUploadingField(file.name);
    setNotification(null);
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Image exceeds 10MB limit.');
      }
      const uploaded = await adminUploadMedia(token, file, 'royal_libas/cms');
      if (uploaded && (uploaded.secure_url || uploaded.url)) {
        setter(uploaded.secure_url || uploaded.url);
        setNotification({ type: 'success', message: `Uploaded ${file.name} to Cloudinary successfully!` });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to upload image' });
    } finally {
      setUploadingField(null);
    }
  };

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
        hero_image_url: heroImageUrl.trim() || null,
        category_two_pieces_image: catTwoPiecesImage.trim() || null,
        category_suit_set_image: catSuitSetImage.trim() || null,
        category_heavy_dress_image: catHeavyDressImage.trim() || null,
        festive_banner_image: festiveBannerImage.trim() || null,
        poster_occasion_image: posterOccasionImage.trim() || null,
        poster_everyday_image: posterEverydayImage.trim() || null,
        poster_story_image: posterStoryImage.trim() || null,
      });
      setNotification({ type: 'success', message: 'Homepage & brand imagery successfully saved and published!' });
      window.dispatchEvent(new Event('royal_libas_settings_updated'));
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to publish homepage settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#B58A3C]" />
            Homepage &amp; Brand Media Manager
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Upload and assign real client photography for the hero campaign, category cards, banners, and editorial posters.
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

      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            {notification.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-xs hover:opacity-75">
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* ========================================================
            SECTION 1: HERO CAMPAIGN BANNER
            ======================================================== */}
        <div className="bg-white border border-[#E8DFD0] rounded-xl p-6 shadow-sm space-y-5">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-bold text-gray-900">
                1. Hero Campaign Banner
              </h2>
              <p className="text-xs text-gray-500">
                Main high-fashion campaign showcase seen by every visitor at the top of the homepage.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Campaign Title
              </label>
              <input
                type="text"
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                placeholder="e.g. Timeless Elegance, Handcrafted Regality"
                className="w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-[#5E1224]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                CTA Button Text &amp; Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={heroCtaText}
                  onChange={(e) => setHeroCtaText(e.target.value)}
                  placeholder="Button label"
                  className="w-1/2 px-3 py-2 border rounded text-xs focus:outline-none focus:border-[#5E1224]"
                />
                <input
                  type="text"
                  value={heroCtaLink}
                  onChange={(e) => setHeroCtaLink(e.target.value)}
                  placeholder="/shop"
                  className="w-1/2 px-3 py-2 border rounded text-xs font-mono focus:outline-none focus:border-[#5E1224]"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Campaign Subtitle
            </label>
            <textarea
              rows={2}
              value={heroSubtitle}
              onChange={(e) => setHeroSubtitle(e.target.value)}
              placeholder="Descriptive narrative about craft and fabric..."
              className="w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-[#5E1224]"
            />
          </div>

          <MediaFieldRow
            label="Hero High-Resolution Image"
            recommendation="Recommended 1800 x 1200 px landscape fashion photograph"
            aspectRatioLabel="16:11 or 4:3 Wide"
            value={heroImageUrl}
            onChange={setHeroImageUrl}
            onOpenMediaModal={handleOpenMediaModal}
            onDirectUpload={handleDirectUpload}
            uploading={Boolean(uploadingField)}
          />
        </div>

        {/* ========================================================
            SECTION 2: THE 3 AGREED CATEGORIES
            ======================================================== */}
        <div className="bg-white border border-[#E8DFD0] rounded-xl p-6 shadow-sm space-y-5">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="font-serif text-lg font-bold text-gray-900">
              2. Shop by Category (The 3 Agreed Core Categories)
            </h2>
            <p className="text-xs text-gray-500">
              Featured cards on the homepage pointing to the three verified catalog categories.
            </p>
          </div>

          <div className="space-y-4">
            <MediaFieldRow
              label="TWO PIECES (Co-ord Sets & Kurta Pant)"
              recommendation="Contemporary two-piece silhouette portrait"
              aspectRatioLabel="4:5 Portrait (800 x 1000 px)"
              value={catTwoPiecesImage}
              onChange={setCatTwoPiecesImage}
              onOpenMediaModal={handleOpenMediaModal}
              onDirectUpload={handleDirectUpload}
              uploading={Boolean(uploadingField)}
            />

            <MediaFieldRow
              label="SUIT SET (Three Pieces, Semi-party & Party Wear)"
              recommendation="Regal three-piece suit set or party wear portrait"
              aspectRatioLabel="4:5 Portrait (800 x 1000 px)"
              value={catSuitSetImage}
              onChange={setCatSuitSetImage}
              onOpenMediaModal={handleOpenMediaModal}
              onDirectUpload={handleDirectUpload}
              uploading={Boolean(uploadingField)}
            />

            <MediaFieldRow
              label="HEAVY DRESS (Lehenga, Sharara, Gharara & Designer Wear)"
              recommendation="Grand celebration lehenga or sharara silhouette portrait"
              aspectRatioLabel="4:5 Portrait (800 x 1000 px)"
              value={catHeavyDressImage}
              onChange={setCatHeavyDressImage}
              onOpenMediaModal={handleOpenMediaModal}
              onDirectUpload={handleDirectUpload}
              uploading={Boolean(uploadingField)}
            />
          </div>
        </div>

        {/* ========================================================
            SECTION 3: FESTIVE BANNER & EDITORIAL POSTERS
            ======================================================== */}
        <div className="bg-white border border-[#E8DFD0] rounded-xl p-6 shadow-sm space-y-5">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="font-serif text-lg font-bold text-gray-900">
              3. Festive Campaign Banner &amp; Editorial Posters
            </h2>
            <p className="text-xs text-gray-500">
              Full-width thematic story posters across the homepage.
            </p>
          </div>

          <div className="space-y-4">
            <MediaFieldRow
              label="The Festive Collection Banner"
              recommendation="Rich wide banner for celebrations and festive edits"
              aspectRatioLabel="16:9 Wide Banner (1600 x 900 px)"
              value={festiveBannerImage}
              onChange={setFestiveBannerImage}
              onOpenMediaModal={handleOpenMediaModal}
              onDirectUpload={handleDirectUpload}
              uploading={Boolean(uploadingField)}
            />

            <MediaFieldRow
              label="Editorial Poster 1: The Occasion Edit"
              recommendation="Opulent celebration atmosphere with dark maroon mood"
              aspectRatioLabel="Vertical / Square (1200 x 1200 px)"
              value={posterOccasionImage}
              onChange={setPosterOccasionImage}
              onOpenMediaModal={handleOpenMediaModal}
              onDirectUpload={handleDirectUpload}
              uploading={Boolean(uploadingField)}
            />

            <MediaFieldRow
              label="Editorial Poster 2: The Everyday Edit"
              recommendation="Bright daytime ivory aesthetic for relaxed elegance"
              aspectRatioLabel="Vertical / Square (1200 x 1200 px)"
              value={posterEverydayImage}
              onChange={setPosterEverydayImage}
              onOpenMediaModal={handleOpenMediaModal}
              onDirectUpload={handleDirectUpload}
              uploading={Boolean(uploadingField)}
            />

            <MediaFieldRow
              label="Editorial Poster 3: The Royal Libas Story"
              recommendation="Intimate artisan craft, hand-embroidery, or textile close-up"
              aspectRatioLabel="Vertical / Square (1200 x 1200 px)"
              value={posterStoryImage}
              onChange={setPosterStoryImage}
              onOpenMediaModal={handleOpenMediaModal}
              onDirectUpload={handleDirectUpload}
              uploading={Boolean(uploadingField)}
            />
          </div>
        </div>

        {/* Save Bar */}
        <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-[#B58A3C]/40 shadow-xl flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Changes to homepage imagery and copy take effect immediately on save.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#5E1224] hover:bg-[#430C19] text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-md transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-[#D4AF67]" />
            <span>{saving ? 'Publishing...' : 'Save & Publish All Changes'}</span>
          </button>
        </div>
      </form>

      {/* ========================================================
          MEDIA LIBRARY SELECTION MODAL
          ======================================================== */}
      {showMediaModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#B58A3C]" />
                  Select Photo from Cloudinary Media Library
                </h3>
                <p className="text-xs text-gray-500">
                  Click on any asset to select it for this section.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMediaModal(false);
                  setTargetFieldSetter(null);
                }}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 min-h-[300px]">
              {loadingMedia ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#5E1224] mb-2" />
                  <p className="text-xs">Loading Cloudinary media assets...</p>
                </div>
              ) : mediaAssets.length === 0 ? (
                <div className="text-center py-16 text-gray-500 space-y-2">
                  <ImageIcon className="w-10 h-10 mx-auto text-gray-300" />
                  <p className="text-xs font-medium">No assets found in Media Library.</p>
                  <p className="text-[11px] text-gray-400">
                    Use the &quot;Upload New Photo&quot; button to upload directly from your device.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {mediaAssets
                    .filter((a) => a.resource_type === 'image' || !a.resource_type)
                    .map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => handleSelectMedia(asset)}
                        className="group relative aspect-[4/5] rounded-lg overflow-hidden border-2 border-transparent hover:border-[#5E1224] focus:border-[#5E1224] focus:outline-none transition-all shadow-sm hover:shadow"
                      >
                        <img
                          src={asset.secure_url || asset.url}
                          alt={asset.filename}
                          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold">
                          Select
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowMediaModal(false);
                  setTargetFieldSetter(null);
                }}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminHomepage;
