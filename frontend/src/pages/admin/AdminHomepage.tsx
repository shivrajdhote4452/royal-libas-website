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
  adminUploadMedia,
} from '../../lib/api';
import type { MediaAsset } from '../../types/product';
import {
  CuratedMomentCard,
  DEFAULT_CURATED_MOMENTS,
  parseCuratedMomentsJson,
  saveStoreSettings,
} from '../../lib/settings';
import { MediaLibraryPickerModal } from '../../components/admin/MediaLibraryPickerModal';

interface ImageFieldProps {
  label: string;
  recommendation: string;
  value: string;
  defaultImageUrl?: string;
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
  defaultImageUrl,
  onChange,
  onOpenMediaModal,
  onDirectUpload,
  uploading,
  aspectRatioLabel = '4:5 Portrait',
}) => {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [value]);

  const isDemo = Boolean(value && (value.includes('res.cloudinary.com/demo/') || value.includes('sample_')));
  const isDefault = !value || value === defaultImageUrl || isDemo;
  const isCustom = Boolean(value && !isDefault);
  const displayImage = (!loadError && isCustom) ? value : (defaultImageUrl || value);

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
        {loadError ? (
          <span className="text-[10px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 self-start sm:self-auto">
            Custom Image Failed &bull; Default Active
          </span>
        ) : isCustom ? (
          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 self-start sm:self-auto">
            Custom Image Active ✓
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 self-start sm:self-auto">
            Default Asset Active
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* Preview Container */}
        <div className="w-28 sm:w-32 h-36 sm:h-40 bg-[#FCF8F0] border border-[#E8DFD0] rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner group">
          {displayImage ? (
            <>
              <img
                src={displayImage}
                alt={label}
                onError={() => {
                  if (isCustom) setLoadError(true);
                }}
                className="w-full h-full object-cover object-top"
              />
              {isCustom && (
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-red-700 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                  title="Reset to default image"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
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
              type="text"
              placeholder="https://res.cloudinary.com/... or /images/..."
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

  // Section 4: Curated Moments State
  const [curatedMoments, setCuratedMoments] = useState<CuratedMomentCard[]>(DEFAULT_CURATED_MOMENTS);

  // Universal Media Library Picker Modal State (with full Folder Browsing support)
  const [showMediaPickerModal, setShowMediaPickerModal] = useState(false);
  const [targetFieldSetter, setTargetFieldSetter] = useState<((val: string) => void) | null>(null);
  const [activePickerCardId, setActivePickerCardId] = useState<string | null>(null);

  const isInternalRouteValid = (link: string): boolean => {
    if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes(' ')) return false;
    if (/^(javascript:|data:|vbscript:|file:|http:|https:)/i.test(link)) return false;
    return true;
  };

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
      const sanitizeIncoming = (url?: string | null) => {
        if (!url) return '';
        if (url.includes('res.cloudinary.com/demo/') || url.includes('sample_')) return '';
        return url;
      };
      setHeroImageUrl(sanitizeIncoming(data.hero_image_url));

      setCatTwoPiecesImage(sanitizeIncoming(data.category_two_pieces_image));
      setCatSuitSetImage(sanitizeIncoming(data.category_suit_set_image));
      setCatHeavyDressImage(sanitizeIncoming(data.category_heavy_dress_image));

      setFestiveBannerImage(sanitizeIncoming(data.festive_banner_image));
      setPosterOccasionImage(sanitizeIncoming(data.poster_occasion_image));
      setPosterEverydayImage(sanitizeIncoming(data.poster_everyday_image));
      setPosterStoryImage(sanitizeIncoming(data.poster_story_image));

      // Curated moments cards
      setCuratedMoments(parseCuratedMomentsJson(data.curated_moments_json));
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load homepage settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [token]);

  // Open media picker for general single fields (Hero, category, posters)
  const handleOpenMediaModal = (setter: (val: string) => void) => {
    setTargetFieldSetter(() => setter);
    setActivePickerCardId(null);
    setShowMediaPickerModal(true);
  };

  // Open media picker for a specific Curated Moments card
  const openPickerForCard = (cardId: string) => {
    setActivePickerCardId(cardId);
    setTargetFieldSetter(null);
    setShowMediaPickerModal(true);
  };

  // Callback when an asset is chosen in MediaLibraryPickerModal
  const handleModalSelect = (selectedAssets: MediaAsset[]) => {
    if (selectedAssets.length > 0) {
      const asset = selectedAssets[0];
      const selectedUrl = asset.secure_url || asset.url;
      if (activePickerCardId) {
        updateCard(activePickerCardId, {
          imageUrl: selectedUrl,
          mediaAssetId: asset.id,
        });
      } else if (targetFieldSetter) {
        targetFieldSetter(selectedUrl);
      }
    }
    setShowMediaPickerModal(false);
    setActivePickerCardId(null);
    setTargetFieldSetter(null);
  };

  // Curated moments update & clear helpers
  const updateCard = (cardId: string, updates: Partial<CuratedMomentCard>) => {
    setCuratedMoments((prev) =>
      prev.map((card) => (card.id === cardId ? { ...card, ...updates } : card))
    );
  };

  const clearCardImage = (cardId: string) => {
    // Clears the selection so it falls back to the luxury placeholder without deleting assets from Cloudinary/DB
    updateCard(cardId, { imageUrl: null, mediaAssetId: null });
  };

  const handleDirectUploadForCard = async (cardId: string, file: File) => {
    setUploadingField(`card-${cardId}`);
    setNotification(null);
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Image exceeds 10MB limit.');
      }
      const uploaded = await adminUploadMedia(token, file, 'royal_libas/cms');
      if (uploaded && (uploaded.secure_url || uploaded.url)) {
        updateCard(cardId, {
          imageUrl: uploaded.secure_url || uploaded.url,
          mediaAssetId: uploaded.id,
        });
        setNotification({
          type: 'success',
          message: `Uploaded ${file.name} to Cloudinary successfully!`,
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to upload image' });
    } finally {
      setUploadingField(null);
    }
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

  const handleSave = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const currentToken = localStorage.getItem('royal_libas_admin_token') || token;
    if (!currentToken) {
      setNotification({ type: 'error', message: 'Authentication required. Please log in as an administrator.' });
      return;
    }

    setSaving(true);
    setNotification(null);

    // Validate Curated Moments cards before network submission
    for (const card of curatedMoments) {
      if (!card.title.trim()) {
        setNotification({ type: 'error', message: `Card #${card.displayOrder} must have a title.` });
        setSaving(false);
        return;
      }
      if (!isInternalRouteValid(card.link)) {
        setNotification({
          type: 'error',
          message: `Invalid link for "${card.title}". Destination route must start with '/' (e.g. /shop?category=TWO+PIECES).`,
        });
        setSaving(false);
        return;
      }
    }

    try {
      const updated = await updateAdminStoreSettings(currentToken, {
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
        curated_moments_json: JSON.stringify(
          curatedMoments.map((c) => ({
            id: c.id,
            title: c.title.trim(),
            subtitle: c.subtitle ? c.subtitle.trim() : null,
            image_url: c.imageUrl ? c.imageUrl.trim() : null,
            imageUrl: c.imageUrl ? c.imageUrl.trim() : null,
            media_asset_id: c.mediaAssetId != null ? Number(c.mediaAssetId) : null,
            mediaAssetId: c.mediaAssetId != null ? Number(c.mediaAssetId) : null,
            link: c.link.trim(),
            link_text: (c.linkText || 'EXPLORE COLLECTION').trim(),
            linkText: (c.linkText || 'EXPLORE COLLECTION').trim(),
            display_order: Number(c.displayOrder) || 1,
            displayOrder: Number(c.displayOrder) || 1,
          }))
        ),
      });

      // Synchronize component state and browser localStorage immediately
      const serverMoments = parseCuratedMomentsJson(updated.curated_moments_json);
      setCuratedMoments(serverMoments);
      saveStoreSettings({
        curatedMoments: serverMoments,
        heroImageUrl: heroImageUrl.trim() || null,
        categoryTwoPiecesImage: catTwoPiecesImage.trim() || null,
        categorySuitSetImage: catSuitSetImage.trim() || null,
        categoryHeavyDressImage: catHeavyDressImage.trim() || null,
        festiveBannerImage: festiveBannerImage.trim() || null,
        posterOccasionImage: posterOccasionImage.trim() || null,
        posterEverydayImage: posterEverydayImage.trim() || null,
        posterStoryImage: posterStoryImage.trim() || null,
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
            Upload and assign real client photography for the hero campaign, category cards, banners, editorial posters, and curated moment edits.
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
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="px-3.5 py-2 bg-[#5E1224] hover:bg-[#430C19] text-white text-xs font-semibold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-[#D4AF67]" />
            <span>{saving ? 'Publishing...' : 'Save & Publish'}</span>
          </button>
          <button
            type="button"
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

      <form onSubmit={handleSave} noValidate className="space-y-8">
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
            defaultImageUrl="/images/editorial/hero_campaign.jpg"
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
              defaultImageUrl="/images/editorial/cat_suits.jpg"
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
              defaultImageUrl="/images/editorial/cat_lehengas.jpg"
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
              defaultImageUrl="/images/editorial/cat_anarkalis.jpg"
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
              defaultImageUrl="/images/editorial/festive_banner.jpg"
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
              defaultImageUrl="/images/posters/royal_occasion.jpg"
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
              defaultImageUrl="/images/posters/everyday_elegance.jpg"
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
              defaultImageUrl="/images/posters/crafted_with_care.jpg"
              onChange={setPosterStoryImage}
              onOpenMediaModal={handleOpenMediaModal}
              onDirectUpload={handleDirectUpload}
              uploading={Boolean(uploadingField)}
            />
          </div>
        </div>

        {/* ========================================================
            SECTION 4: CURATED FOR EVERY MOMENT ("DRESS FOR THE MOMENT")
            ======================================================== */}
        <div className="bg-white border border-[#E8DFD0] rounded-xl p-6 shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-lg font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#B58A3C]" />
                4. Curated for Every Moment (&quot;Dress for the Moment&quot;)
              </h2>
              <p className="text-xs text-gray-500">
                Editorial 3-card collection section placed between Everyday Edit and Festive Collection on the storefront.
              </p>
            </div>
            <span className="text-[11px] font-medium text-[#5E1224] bg-[#FCF8F0] px-2.5 py-1 rounded border border-[#E5D9C5] self-start sm:self-auto">
              3 Interactive Occasion Cards
            </span>
          </div>

          <div className="space-y-6">
            {curatedMoments.map((card, idx) => {
              const linkValid = isInternalRouteValid(card.link);
              return (
                <div
                  key={card.id}
                  className="bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-xl p-4 sm:p-5 shadow-sm space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8DFD0] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#5E1224] text-white text-[11px] font-bold flex items-center justify-center">
                        {card.displayOrder || idx + 1}
                      </span>
                      <h3 className="font-serif font-bold text-gray-900 text-sm">
                        Card #{card.displayOrder || idx + 1}: {card.title || 'Untitled Card'}
                      </h3>
                    </div>
                    {card.imageUrl ? (
                      <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 self-start sm:self-auto">
                        Custom Photo Selected ✓
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 self-start sm:self-auto">
                        Tasteful Luxury Placeholder Active
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row gap-5 items-start">
                    {/* Preview Box */}
                    <div className="w-32 sm:w-36 h-44 sm:h-48 bg-[#201014] border border-[#B58A3C]/30 rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner group">
                      {card.imageUrl ? (
                        <>
                          <img
                            src={card.imageUrl}
                            alt={card.title}
                            className="w-full h-full object-cover object-top"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-center p-2">
                            <span className="text-[10px] font-medium text-[#D4AF67] text-center line-clamp-1">
                              {card.title}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => clearCardImage(card.id)}
                            className="absolute top-1.5 right-1.5 p-1 bg-black/70 hover:bg-red-700 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                            title="Clear image selection"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="p-3 text-center space-y-1">
                          <span className="text-[#D4AF67] text-xl block">✤</span>
                          <span className="font-serif text-xs font-bold text-[#FCF8F0] block">RL</span>
                          <span className="text-[9px] uppercase tracking-wider text-[#D4AF67]/80 block">
                            Placeholder Active
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Inputs & Actions */}
                    <div className="flex-1 w-full space-y-3.5">
                      {/* Media Picker / Upload Buttons */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openPickerForCard(card.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5E1224] hover:bg-[#430C19] text-white rounded text-xs font-semibold shadow-sm transition-colors"
                        >
                          <Layers className="w-3.5 h-3.5 text-[#D4AF67]" />
                          <span>Choose from Media Library</span>
                        </button>

                        <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5D9C5] hover:bg-[#FCF8F0] text-gray-700 rounded text-xs font-semibold shadow-sm transition-colors ${
                          uploadingField === `card-${card.id}` ? 'opacity-60 cursor-not-allowed' : ''
                        }`}>
                          <Upload className="w-3.5 h-3.5 text-[#B58A3C]" />
                          <span>{uploadingField === `card-${card.id}` ? 'Uploading...' : 'Upload New Photo'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                            disabled={uploadingField === `card-${card.id}`}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleDirectUploadForCard(card.id, file);
                                e.target.value = '';
                              }
                            }}
                            className="hidden"
                          />
                        </label>

                        {card.imageUrl && (
                          <button
                            type="button"
                            onClick={() => clearCardImage(card.id)}
                            className="px-2.5 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                          >
                            Clear Photo Selection
                          </button>
                        )}
                      </div>

                      {/* Card Title & Display Order */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                            Card Title (Front-end Serif Label)
                          </label>
                          <input
                            type="text"
                            value={card.title}
                            onChange={(e) => updateCard(card.id, { title: e.target.value })}
                            placeholder="e.g. EVERYDAY ELEGANCE"
                            className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                            Display Order
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={6}
                            value={card.displayOrder}
                            onChange={(e) => updateCard(card.id, { displayOrder: parseInt(e.target.value) || 1 })}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
                          />
                        </div>
                      </div>

                      {/* Destination Link */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-gray-700">
                            Destination Link (Internal Relative Path)
                          </label>
                          <span className="text-[10px] text-gray-500">
                            Quick Presets:
                          </span>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {[
                            { label: 'Two Pieces', link: '/shop?category=TWO+PIECES' },
                            { label: 'Suit Set', link: '/shop?category=SUIT+SET' },
                            { label: 'Heavy Dress', link: '/shop?category=HEAVY+DRESS' },
                            { label: 'Festive Edit', link: '/shop?collection=festive-edit' },
                            { label: 'All Shop', link: '/shop' },
                          ].map((preset) => (
                            <button
                              key={preset.link}
                              type="button"
                              onClick={() => updateCard(card.id, { link: preset.link })}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                card.link === preset.link
                                  ? 'bg-[#5E1224] text-white'
                                  : 'bg-white border border-[#E5D9C5] text-gray-700 hover:bg-[#FCF8F0]'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        <input
                          type="text"
                          value={card.link}
                          onChange={(e) => updateCard(card.id, { link: e.target.value.trim() })}
                          placeholder="/shop?category=..."
                          className={`w-full px-3 py-1.5 border rounded text-xs font-mono focus:outline-none ${
                            linkValid ? 'border-gray-300 focus:border-[#5E1224]' : 'border-rose-400 bg-rose-50 text-rose-900'
                          }`}
                        />
                        {!linkValid && (
                          <p className="text-[10px] text-rose-600 mt-0.5">
                            Must be a valid relative internal path starting with &apos;/&apos; (e.g. /shop?category=TWO+PIECES). External or unsafe protocols are not allowed.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save Bar */}
        <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-[#B58A3C]/40 shadow-xl flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Changes to homepage imagery, occasion cards, and copy take effect immediately on save.
          </p>
          <button
            type="submit"
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#5E1224] hover:bg-[#430C19] text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-md transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-[#D4AF67]" />
            <span>{saving ? 'Publishing...' : 'Save & Publish All Changes'}</span>
          </button>
        </div>
      </form>

      {/* ========================================================
          MEDIA LIBRARY PICKER MODAL (With Folder Navigation)
          ======================================================== */}
      <MediaLibraryPickerModal
        isOpen={showMediaPickerModal}
        onClose={() => {
          setShowMediaPickerModal(false);
          setActivePickerCardId(null);
          setTargetFieldSetter(null);
        }}
        onSelect={handleModalSelect}
        title={
          activePickerCardId
            ? `Select Photo for Card: ${curatedMoments.find((c) => c.id === activePickerCardId)?.title || 'Curated Moment'}`
            : 'Select Photo from Media Library'
        }
      />
    </div>
  );
};

export default AdminHomepage;
