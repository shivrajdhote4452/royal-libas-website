import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  CheckCircle2,
  Truck,
  Bell,
  MessageCircle,
  AlertCircle,
  Loader2,
  CreditCard,
  AlertTriangle,
  ShieldAlert,
  MapPin,
  Image as ImageIcon,
  Plus,
  Trash2,
  MoveLeft,
  MoveRight,
  MoveUp,
  MoveDown,
  Star,
  Upload,
  Eye,
  EyeOff,
  X,
  Edit2,
} from 'lucide-react';
import { useStoreSettings, BoutiqueGalleryItem, BoutiqueReviewItem } from '../../lib/settings';
import { updateAdminStoreSettings, adminUploadMedia } from '../../lib/api';
import { MediaLibraryPickerModal } from '../../components/admin/MediaLibraryPickerModal';
import { MediaAsset } from '../../types/product';

export const AdminSettings: React.FC = () => {
  const { settings, updateSettings, syncWithServer } = useStoreSettings();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [freeShippingThreshold, setFreeShippingThreshold] = useState(String(settings.freeShippingThreshold));
  const [standardShippingFee, setStandardShippingFee] = useState(String(settings.standardShippingFee));
  const [announcementText, setAnnouncementText] = useState(settings.announcementText);
  const [whatsappNumber, setWhatsappNumber] = useState(settings.whatsappNumber);
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail);
  const [instagramHandle, setInstagramHandle] = useState(settings.instagramHandle);

  // Payment controls state
  const [codEnabled, setCodEnabled] = useState<boolean>(settings.codEnabled);
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState<boolean>(settings.onlinePaymentEnabled);
  const [showConfirmBothDisabledModal, setShowConfirmBothDisabledModal] = useState<boolean>(false);

  // Boutique Location & Visiting Hours State
  const [boutiqueName, setBoutiqueName] = useState(settings.boutiqueName);
  const [boutiqueIntro, setBoutiqueIntro] = useState(settings.boutiqueIntro);
  const [boutiqueAddress, setBoutiqueAddress] = useState(settings.boutiqueAddress);
  const [boutiqueShortAddress, setBoutiqueShortAddress] = useState(settings.boutiqueShortAddress);
  const [boutiquePincode, setBoutiquePincode] = useState(settings.boutiquePincode);
  const [boutiqueLandmark, setBoutiqueLandmark] = useState(settings.boutiqueLandmark);
  const [boutiquePhone, setBoutiquePhone] = useState(settings.boutiquePhone || '');
  const [boutiqueWhatsapp, setBoutiqueWhatsapp] = useState(settings.boutiqueWhatsapp || '');
  const [boutiqueOpeningHours, setBoutiqueOpeningHours] = useState(settings.boutiqueOpeningHours || '');
  const [boutiqueWeeklyHoliday, setBoutiqueWeeklyHoliday] = useState(settings.boutiqueWeeklyHoliday || '');
  const [boutiqueSpecialNotice, setBoutiqueSpecialNotice] = useState(settings.boutiqueSpecialNotice || '');
  const [boutiqueDirectionsUrl, setBoutiqueDirectionsUrl] = useState(settings.boutiqueDirectionsUrl);
  const [boutiqueEmbedUrl, setBoutiqueEmbedUrl] = useState(settings.boutiqueEmbedUrl || '');
  const [boutiqueReviewsUrl, setBoutiqueReviewsUrl] = useState(settings.boutiqueReviewsUrl || '');
  const [boutiqueMainImage, setBoutiqueMainImage] = useState(settings.boutiqueMainImage || '');
  const [boutiqueGallery, setBoutiqueGallery] = useState<BoutiqueGalleryItem[]>(settings.boutiqueGallery || []);
  const [boutiqueSectionVisible, setBoutiqueSectionVisible] = useState<boolean>(settings.boutiqueSectionVisible ?? true);

  // Selected Customer Reviews State
  const [boutiqueReviews, setBoutiqueReviews] = useState<BoutiqueReviewItem[]>(settings.boutiqueReviews || []);
  const [boutiqueReviewsVisible, setBoutiqueReviewsVisible] = useState<boolean>(settings.boutiqueReviewsVisible ?? false);

  // Media Library & Upload State
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'main' | 'gallery'>('main');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Review Dialog State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [editingReviewIndex, setEditingReviewIndex] = useState<number | null>(null);
  const [reviewForm, setReviewForm] = useState<BoutiqueReviewItem>({
    id: '',
    author_name: '',
    rating: 5,
    review_text: '',
    review_date: '',
    source: 'google',
    source_url: '',
    is_verified: false,
    owner_approved: false,
    verified_date: null,
    is_published: false,
    sort_order: 0,
  });

  // RBAC role state
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  useEffect(() => {
    syncWithServer();
    if (token) {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
      fetch(`${API_BASE_URL}/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.role) setCurrentUserRole(data.role);
        })
        .catch(() => { });
    }
  }, []);

  useEffect(() => {
    setFreeShippingThreshold(String(settings.freeShippingThreshold));
    setStandardShippingFee(String(settings.standardShippingFee));
    setAnnouncementText(settings.announcementText);
    setWhatsappNumber(settings.whatsappNumber);
    setSupportEmail(settings.supportEmail);
    setInstagramHandle(settings.instagramHandle);
    setCodEnabled(settings.codEnabled);
    setOnlinePaymentEnabled(settings.onlinePaymentEnabled);

    // Boutique state sync
    setBoutiqueName(settings.boutiqueName);
    setBoutiqueIntro(settings.boutiqueIntro);
    setBoutiqueAddress(settings.boutiqueAddress);
    setBoutiqueShortAddress(settings.boutiqueShortAddress);
    setBoutiquePincode(settings.boutiquePincode);
    setBoutiqueLandmark(settings.boutiqueLandmark);
    setBoutiquePhone(settings.boutiquePhone || '');
    setBoutiqueWhatsapp(settings.boutiqueWhatsapp || '');
    setBoutiqueOpeningHours(settings.boutiqueOpeningHours || '');
    setBoutiqueWeeklyHoliday(settings.boutiqueWeeklyHoliday || '');
    setBoutiqueSpecialNotice(settings.boutiqueSpecialNotice || '');
    setBoutiqueDirectionsUrl(settings.boutiqueDirectionsUrl);
    setBoutiqueEmbedUrl(settings.boutiqueEmbedUrl || '');
    setBoutiqueReviewsUrl(settings.boutiqueReviewsUrl || '');
    setBoutiqueMainImage(settings.boutiqueMainImage || '');
    setBoutiqueGallery(settings.boutiqueGallery || []);
    setBoutiqueSectionVisible(settings.boutiqueSectionVisible ?? true);

    // Reviews state sync
    setBoutiqueReviews(settings.boutiqueReviews || []);
    setBoutiqueReviewsVisible(settings.boutiqueReviewsVisible ?? false);
  }, [settings]);

  // Handle iframe or direct embed URL cleaning
  const handleEmbedUrlChange = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.includes('<iframe') && trimmed.includes('src=')) {
      const match = trimmed.match(/src=["'](https:\/\/[^"']+)["']/i);
      if (match && match[1]) {
        setBoutiqueEmbedUrl(match[1]);
        return;
      }
    }
    setBoutiqueEmbedUrl(trimmed);
  };

  // Upload handler for main image or gallery
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'main' | 'gallery') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded = await adminUploadMedia(token, file, 'royal_libas/boutique');
      const assetUrl = uploaded.secure_url || uploaded.url;
      if (target === 'main') {
        setBoutiqueMainImage(assetUrl);
      } else {
        if (boutiqueGallery.length >= 4) {
          setUploadError('Maximum 4 photographs allowed in the boutique gallery.');
          return;
        }
        setBoutiqueGallery([
          ...boutiqueGallery,
          {
            id: String(uploaded.id || Date.now()),
            url: assetUrl,
            caption: file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
          },
        ]);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload photo.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Media picker select callback
  const handleSelectMedia = (selectedAssets: MediaAsset[]) => {
    if (selectedAssets.length === 0) return;
    if (pickerTarget === 'main') {
      const asset = selectedAssets[0];
      setBoutiqueMainImage(asset.secure_url || asset.url);
    } else {
      const remainingSlots = 4 - boutiqueGallery.length;
      if (remainingSlots <= 0) {
        setUploadError('Maximum 4 photographs allowed in the boutique gallery.');
        setIsPickerOpen(false);
        return;
      }
      const newItems: BoutiqueGalleryItem[] = selectedAssets.slice(0, remainingSlots).map((asset) => ({
        id: String(asset.id || asset.public_id || Date.now()),
        url: asset.secure_url || asset.url,
        caption: asset.filename ? asset.filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') : 'Boutique Photo',
      }));
      setBoutiqueGallery([...boutiqueGallery, ...newItems]);
    }
    setIsPickerOpen(false);
  };

  // Gallery manipulation
  const handleMoveGallery = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= boutiqueGallery.length) return;
    const updated = [...boutiqueGallery];
    const [item] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, item);
    setBoutiqueGallery(updated);
  };

  const handleRemoveGallery = (index: number) => {
    setBoutiqueGallery(boutiqueGallery.filter((_, i) => i !== index));
  };

  const handleGalleryCaptionChange = (index: number, caption: string) => {
    const updated = [...boutiqueGallery];
    updated[index] = { ...updated[index], caption };
    setBoutiqueGallery(updated);
  };

  // Reviews manipulation
  const handleMoveReview = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= boutiqueReviews.length) return;
    const updated = [...boutiqueReviews];
    const [item] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, item);
    updated.forEach((r, idx) => {
      r.sort_order = idx;
    });
    setBoutiqueReviews(updated);
  };

  const handleRemoveReview = (index: number) => {
    setBoutiqueReviews(boutiqueReviews.filter((_, i) => i !== index));
  };

  const handleToggleReviewPublished = (index: number) => {
    const rev = boutiqueReviews[index];
    if (!rev.is_published) {
      const isEligible = (rev.is_verified || rev.owner_approved) && Number(rev.rating) >= 4 && (!rev.source || rev.source === 'google');
      if (!isEligible) {
        if (Number(rev.rating) < 4) {
          alert('Review cannot be published: Only 4-star and 5-star positive reviews are eligible for this section.');
          return;
        }
        if (rev.source && rev.source !== 'google') {
          alert('Review cannot be published: Only genuine Google reviews are eligible for this section.');
          return;
        }
        alert('Review cannot be published: It requires valid owner approval or explicit Google verification.');
        return;
      }
    }
    const updated = [...boutiqueReviews];
    const willBePublished = !updated[index].is_published;
    updated[index] = {
      ...updated[index],
      is_published: willBePublished,
      owner_approved: willBePublished ? (updated[index].owner_approved ?? true) : updated[index].owner_approved,
    };
    setBoutiqueReviews(updated);
  };

  const openAddReviewModal = () => {
    setEditingReviewIndex(null);
    setReviewForm({
      id: `rev-${Date.now()}`,
      author_name: '',
      rating: 5,
      review_text: '',
      review_date: '',
      source: 'google',
      source_url: '',
      is_verified: false,
      owner_approved: false,
      verified_date: null,
      is_published: false,
      sort_order: boutiqueReviews.length,
    });
    setIsReviewModalOpen(true);
  };

  const openEditReviewModal = (index: number) => {
    setEditingReviewIndex(index);
    setReviewForm({ ...boutiqueReviews[index] });
    setIsReviewModalOpen(true);
  };

  const handleSaveReviewModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewForm.author_name.trim() || !reviewForm.review_text.trim()) {
      return;
    }

    const ratingNum = Number(reviewForm.rating) || 5;
    const isGoogle = !reviewForm.source || reviewForm.source === 'google';
    const isEligible = (reviewForm.is_verified || reviewForm.owner_approved) && ratingNum >= 4 && isGoogle;
    let published = Boolean(reviewForm.is_published);
    if (published && !isEligible) {
      published = false;
    }

    const sanitizedReview: BoutiqueReviewItem = {
      ...reviewForm,
      author_name: reviewForm.author_name.trim(),
      rating: ratingNum,
      review_text: reviewForm.review_text.trim(),
      review_date: reviewForm.review_date ? reviewForm.review_date.trim() : null,
      source: reviewForm.source || 'google',
      source_url: reviewForm.source_url ? reviewForm.source_url.trim() : null,
      is_verified: Boolean(reviewForm.is_verified),
      owner_approved: Boolean(reviewForm.owner_approved),
      verified_date: reviewForm.is_verified
        ? reviewForm.verified_date || new Date().toISOString().split('T')[0]
        : null,
      is_published: published,
    };

    if (editingReviewIndex !== null) {
      const updated = [...boutiqueReviews];
      updated[editingReviewIndex] = {
        ...sanitizedReview,
        sort_order: updated[editingReviewIndex].sort_order ?? editingReviewIndex,
      };
      setBoutiqueReviews(updated);
    } else {
      setBoutiqueReviews([
        ...boutiqueReviews,
        {
          ...sanitizedReview,
          sort_order: boutiqueReviews.length,
        },
      ]);
    }
    setIsReviewModalOpen(false);
  };

  const executeSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);

    const thresholdNum = Number(freeShippingThreshold) || 1500;
    const feeNum = Number(standardShippingFee) || 99;
    const cleanAnnouncement =
      announcementText.trim() ||
      (codEnabled
        ? `COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹${thresholdNum}`
        : `COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS`);

    try {
      if (token) {
        await updateAdminStoreSettings(token, {
          standard_cod_free_threshold: thresholdNum,
          standard_shipping_fee: feeNum,
          announcement_text: cleanAnnouncement,
          whatsapp_number: whatsappNumber.trim(),
          support_email: supportEmail.trim(),
          instagram_handle: instagramHandle.trim(),
          cod_enabled: codEnabled,
          online_payment_enabled: onlinePaymentEnabled,
          // Boutique Location & Information (preserves explicit clearing)
          boutique_name: boutiqueName.trim() || null,
          boutique_intro: boutiqueIntro.trim() || null,
          boutique_address: boutiqueAddress.trim() || null,
          boutique_short_address: boutiqueShortAddress.trim() || null,
          boutique_pincode: boutiquePincode.trim() || null,
          boutique_landmark: boutiqueLandmark.trim() || null,
          boutique_phone: boutiquePhone.trim() || null,
          boutique_whatsapp: boutiqueWhatsapp.trim() || null,
          boutique_opening_hours: boutiqueOpeningHours.trim() || null,
          boutique_weekly_holiday: boutiqueWeeklyHoliday.trim() || null,
          boutique_special_notice: boutiqueSpecialNotice.trim() || null,
          boutique_directions_url: boutiqueDirectionsUrl.trim() || null,
          boutique_embed_url: boutiqueEmbedUrl.trim() || null,
          boutique_reviews_url: boutiqueReviewsUrl.trim() || null,
          boutique_main_image: boutiqueMainImage.trim() || null,
          boutique_gallery_json: JSON.stringify(boutiqueGallery),
          boutique_section_visible: boutiqueSectionVisible,
          boutique_reviews_json: JSON.stringify(boutiqueReviews),
          boutique_reviews_visible: boutiqueReviewsVisible,
        });
      }

      updateSettings({
        freeShippingThreshold: thresholdNum,
        standardShippingFee: feeNum,
        announcementText: cleanAnnouncement,
        whatsappNumber: whatsappNumber.trim(),
        supportEmail: supportEmail.trim(),
        instagramHandle: instagramHandle.trim(),
        codEnabled,
        onlinePaymentEnabled,
        // Boutique Location & Information (empty values stay null)
        boutiqueName: boutiqueName.trim() || 'Royal Libas by Tanya',
        boutiqueIntro: boutiqueIntro.trim() || '',
        boutiqueAddress: boutiqueAddress.trim() || '',
        boutiqueShortAddress: boutiqueShortAddress.trim() || '',
        boutiquePincode: boutiquePincode.trim() || '',
        boutiqueLandmark: boutiqueLandmark.trim() || '',
        boutiquePhone: boutiquePhone.trim() || null,
        boutiqueWhatsapp: boutiqueWhatsapp.trim() || null,
        boutiqueOpeningHours: boutiqueOpeningHours.trim() || null,
        boutiqueWeeklyHoliday: boutiqueWeeklyHoliday.trim() || null,
        boutiqueSpecialNotice: boutiqueSpecialNotice.trim() || null,
        boutiqueDirectionsUrl: boutiqueDirectionsUrl.trim() || 'https://share.google/rdahckZ4nVz7Bgu2H',
        boutiqueEmbedUrl: boutiqueEmbedUrl.trim() || null,
        boutiqueReviewsUrl: boutiqueReviewsUrl.trim() || null,
        boutiqueMainImage: boutiqueMainImage.trim() || null,
        boutiqueGallery,
        boutiqueSectionVisible,
        boutiqueReviews,
        boutiqueReviewsVisible,
      });

      setSaved(true);
      setShowConfirmBothDisabledModal(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to persist settings to server.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codEnabled && !onlinePaymentEnabled) {
      setShowConfirmBothDisabledModal(true);
      return;
    }
    await executeSave();
  };

  const isRoleUnauthorized = currentUserRole !== null && currentUserRole !== 'OWNER';

  return (
    <div className="space-y-6 font-sans max-w-4xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E8DFD0]">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-[#5E1224]" />
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">Store Settings</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure boutique location, visiting hours, customer reviews, payment methods, and thresholds
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings Saved Successfully</span>
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-800 border border-red-200 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
      </div>

      {isRoleUnauthorized && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Restricted Access (Role: {currentUserRole})</p>
            <p className="mt-0.5 text-amber-800">
              Only store administrators with the <strong>OWNER</strong> role have permission to save modifications to
              store settings and location. Settings are shown in read-only preview mode.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* ========================================================
            1. BOUTIQUE LOCATION & VISITING HOURS (New Feature)
            ======================================================== */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-[#5E1224]" />
              </div>
              <div>
                <h2 className="font-serif font-bold text-base text-gray-900">
                  Flagship Boutique Location & Visiting Hours
                </h2>
                <p className="text-[11px] text-gray-500">
                  Manage physical store address, hours, Google Maps links, and gallery
                </p>
              </div>
            </div>

            {/* Homepage Section Visibility Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700 hidden sm:inline">
                Homepage Visibility
              </span>
              <button
                type="button"
                disabled={isRoleUnauthorized}
                onClick={() => setBoutiqueSectionVisible(!boutiqueSectionVisible)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${boutiqueSectionVisible ? 'bg-emerald-600' : 'bg-gray-300'
                  } ${isRoleUnauthorized ? 'opacity-50 cursor-not-allowed' : ''}`}
                role="switch"
                aria-checked={boutiqueSectionVisible}
                aria-label="Toggle Boutique Section on Homepage"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${boutiqueSectionVisible ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>
          </div>

          {/* Name & Intro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Boutique Display Name
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueName}
                onChange={(e) => setBoutiqueName(e.target.value)}
                placeholder="Royal Libas by Tanya"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Short Introduction / Tagline
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueIntro}
                onChange={(e) => setBoutiqueIntro(e.target.value)}
                placeholder="Experience our master craftsmanship in person at our flagship Jhansi boutique."
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>
          </div>

          {/* Addresses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Full Postal Address (Contact Page & Directions)
              </label>
              <textarea
                rows={2}
                disabled={isRoleUnauthorized}
                value={boutiqueAddress}
                onChange={(e) => setBoutiqueAddress(e.target.value)}
                placeholder="Opposite Hotel Ambrosia, Prem Ganj, Sipri Bazar, Jhansi, Uttar Pradesh 284003"
                className="w-full px-3.5 py-2 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Short Footer Address (Footer Brand Column)
              </label>
              <textarea
                rows={2}
                disabled={isRoleUnauthorized}
                value={boutiqueShortAddress}
                onChange={(e) => setBoutiqueShortAddress(e.target.value)}
                placeholder="Opp. Hotel Ambrosia, Prem Ganj, Sipri Bazar, Jhansi, UP 284003"
                className="w-full px-3.5 py-2 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>
          </div>

          {/* Landmark & PIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Landmark</label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueLandmark}
                onChange={(e) => setBoutiqueLandmark(e.target.value)}
                placeholder="Opposite Hotel Ambrosia"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Postal PIN Code</label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiquePincode}
                onChange={(e) => setBoutiquePincode(e.target.value)}
                placeholder="284003"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>
          </div>

          {/* Phone & WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Boutique Phone Number
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiquePhone}
                onChange={(e) => setBoutiquePhone(e.target.value)}
                placeholder="+91 98112 23344"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Boutique WhatsApp Number
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueWhatsapp}
                onChange={(e) => setBoutiqueWhatsapp(e.target.value)}
                placeholder="+91 98112 23344"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>
          </div>

          {/* Visiting Hours, Weekly Holiday, Special Notice */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Physical Visiting Hours
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueOpeningHours}
                onChange={(e) => setBoutiqueOpeningHours(e.target.value)}
                placeholder="Mon – Sat: 10:30 AM – 8:30 PM"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Weekly Holiday
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueWeeklyHoliday}
                onChange={(e) => setBoutiqueWeeklyHoliday(e.target.value)}
                placeholder="Sunday"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Special Closure Notice (Optional)
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueSpecialNotice}
                onChange={(e) => setBoutiqueSpecialNotice(e.target.value)}
                placeholder="Closed on Diwali, Nov 1"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>
          </div>

          {/* URLs: Directions, Embed, Reviews */}
          <div className="space-y-4 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Google Maps Directions URL
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueDirectionsUrl}
                onChange={(e) => setBoutiqueDirectionsUrl(e.target.value)}
                placeholder="https://share.google/rdahckZ4nVz7Bgu2H"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Destination for &ldquo;Get Directions&rdquo; buttons on Homepage and Contact page
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Google Map Embed URL (or paste &lt;iframe&gt; code)
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueEmbedUrl}
                onChange={(e) => handleEmbedUrlChange(e.target.value)}
                placeholder="https://www.google.com/maps/embed?pb=... or paste <iframe> code"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60 font-mono text-[11px]"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                If omitted, an elegant fallback directions card is rendered without a broken iframe
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Google Reviews / Listing URL
              </label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={boutiqueReviewsUrl}
                onChange={(e) => setBoutiqueReviewsUrl(e.target.value)}
                placeholder="https://share.google/rdahckZ4nVz7Bgu2H"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>
          </div>

          {/* Main Homepage Boutique Photo */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <label className="block text-xs font-semibold text-gray-700">
              Main Homepage Boutique Photograph
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-40 aspect-video rounded-lg overflow-hidden border border-[#B58A3C]/40 bg-gray-100 shrink-0">
                {boutiqueMainImage ? (
                  <img
                    src={boutiqueMainImage}
                    alt="Boutique main preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                    No Photo Set
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isRoleUnauthorized || isUploading}
                    onClick={() => {
                      setPickerTarget('main');
                      setIsPickerOpen(true);
                    }}
                    className="px-3.5 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-medium hover:bg-[#4A0E1C] transition-colors flex items-center gap-1.5"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-[#B58A3C]" />
                    <span>Choose from Media Library</span>
                  </button>

                  <label className="px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-gray-500" />
                    <span>Upload New</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isRoleUnauthorized || isUploading}
                      onChange={(e) => handleFileUpload(e, 'main')}
                      className="hidden"
                    />
                  </label>

                  {boutiqueMainImage && (
                    <button
                      type="button"
                      disabled={isRoleUnauthorized}
                      onClick={() => setBoutiqueMainImage('')}
                      className="px-3 py-2 text-xs text-red-600 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  Featured on the left side of the &ldquo;Visit Our Boutique&rdquo; homepage section
                </p>
              </div>
            </div>
          </div>

          {/* Boutique Gallery (Up to 4 Photos) */}
          <div className="pt-4 border-t border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Boutique Gallery Showcase (Up to 4 Photographs)
                </label>
                <p className="text-[11px] text-gray-400">
                  Featured on the Contact page &ldquo;Visit Our Boutique&rdquo; section with interactive lightbox preview
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isRoleUnauthorized || isUploading || boutiqueGallery.length >= 4}
                  onClick={() => {
                    setPickerTarget('gallery');
                    setIsPickerOpen(true);
                  }}
                  className="px-3 py-1.5 bg-[#5E1224] text-white rounded-lg text-xs font-medium hover:bg-[#4A0E1C] transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add from Library</span>
                </button>

                <label
                  className={`px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-1.5 ${boutiqueGallery.length >= 4 ? 'opacity-40 pointer-events-none' : ''
                    }`}
                >
                  <Upload className="w-3.5 h-3.5 text-gray-500" />
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isRoleUnauthorized || isUploading || boutiqueGallery.length >= 4}
                    onChange={(e) => handleFileUpload(e, 'gallery')}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Gallery Thumbnails List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {boutiqueGallery.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3 bg-[#FCF8F0] border border-[#B58A3C]/30 rounded-xl space-y-2.5"
                >
                  <div className="aspect-[4/3] rounded-lg overflow-hidden border border-gray-200 bg-black/5 relative group">
                    <img src={item.url} alt={item.caption || 'Gallery photo'} className="w-full h-full object-cover" />
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono font-bold">
                      #{idx + 1}
                    </span>
                  </div>

                  <input
                    type="text"
                    disabled={isRoleUnauthorized}
                    value={item.caption || ''}
                    onChange={(e) => handleGalleryCaptionChange(idx, e.target.value)}
                    placeholder="Caption / description"
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
                  />

                  <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isRoleUnauthorized || idx === 0}
                        onClick={() => handleMoveGallery(idx, -1)}
                        className="p-1 text-gray-600 hover:text-gray-900 disabled:opacity-20"
                        title="Move left"
                      >
                        <MoveLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isRoleUnauthorized || idx === boutiqueGallery.length - 1}
                        onClick={() => handleMoveGallery(idx, 1)}
                        className="p-1 text-gray-600 hover:text-gray-900 disabled:opacity-20"
                        title="Move right"
                      >
                        <MoveRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isRoleUnauthorized}
                      onClick={() => handleRemoveGallery(idx)}
                      className="p-1 text-red-600 hover:text-red-800"
                      title="Remove image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {boutiqueGallery.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                No boutique gallery photos selected. Default atelier editorial images are shown on the Contact page.
              </p>
            )}
          </div>
        </div>

        {/* ========================================================
            2. SELECTED CUSTOMER REVIEWS MANAGER
            ======================================================== */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#B58A3C]/10 border border-[#B58A3C]/40 flex items-center justify-center">
                <Star className="w-5 h-5 text-[#B58A3C]" />
              </div>
              <div>
                <h2 className="font-serif font-bold text-base text-gray-900">
                  Selected Customer Reviews
                </h2>
                <p className="text-[11px] text-gray-500">
                  Curate verified Google reviews and patron experiences to feature on the homepage
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-700 hidden sm:inline">
                Publish on Homepage
              </span>
              <button
                type="button"
                disabled={isRoleUnauthorized}
                onClick={() => setBoutiqueReviewsVisible(!boutiqueReviewsVisible)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${boutiqueReviewsVisible ? 'bg-emerald-600' : 'bg-gray-300'
                  } ${isRoleUnauthorized ? 'opacity-50 cursor-not-allowed' : ''}`}
                role="switch"
                aria-checked={boutiqueReviewsVisible}
                aria-label="Toggle Reviews on Homepage"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${boutiqueReviewsVisible ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>
          </div>

          <div className="p-3.5 bg-[#FCF8F0] border border-[#B58A3C]/30 text-xs text-gray-700 rounded-xl space-y-1">
            <p className="font-semibold text-[#5E1224]">Authenticity Standard:</p>
            <p className="text-gray-600 leading-relaxed text-[11.5px]">
              Only genuine patron reviews verified from Google Maps, Justdial, or direct boutique visits should be
              entered. Do not fabricate ratings or invent reviews. If no verified reviews are ready, keep this section
              unpublished.
            </p>
          </div>

          {/* Reviews List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Curated Reviews ({boutiqueReviews.length})
              </span>
              <button
                type="button"
                disabled={isRoleUnauthorized}
                onClick={openAddReviewModal}
                className="px-3.5 py-1.5 bg-[#5E1224] text-white rounded-lg text-xs font-medium hover:bg-[#4A0E1C] transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Verified Review</span>
              </button>
            </div>

            {boutiqueReviews.map((rev, idx) => (
              <div
                key={rev.id || idx}
                className="p-4 bg-[#FCF8F0]/70 border border-[#E8DFD0] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-gray-900">{rev.author_name}</span>
                    <div className="flex items-center text-[#B58A3C]">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${i < Math.round(rev.rating) ? 'fill-[#B58A3C] text-[#B58A3C]' : 'text-gray-300'
                            }`}
                        />
                      ))}
                    </div>
                    {rev.is_published ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                        Published
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200 text-gray-700">
                        Draft
                      </span>
                    )}
                    {rev.is_verified ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        Verified Google
                      </span>
                    ) : rev.owner_approved ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        Owner Approved
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-700 italic font-light">&ldquo;{rev.review_text}&rdquo;</p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono">
                    {rev.review_date && <span>Date: {rev.review_date}</span>}
                    {rev.verified_date && <span>Verified: {rev.verified_date}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={isRoleUnauthorized}
                    onClick={() => handleToggleReviewPublished(idx)}
                    className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-white"
                    title={rev.is_published ? 'Unpublish' : 'Publish'}
                  >
                    {rev.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-emerald-600" />}
                  </button>

                  <button
                    type="button"
                    disabled={isRoleUnauthorized || idx === 0}
                    onClick={() => handleMoveReview(idx, -1)}
                    className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-white disabled:opacity-20"
                    title="Move up"
                  >
                    <MoveUp className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    disabled={isRoleUnauthorized || idx === boutiqueReviews.length - 1}
                    onClick={() => handleMoveReview(idx, 1)}
                    className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-white disabled:opacity-20"
                    title="Move down"
                  >
                    <MoveDown className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    disabled={isRoleUnauthorized}
                    onClick={() => openEditReviewModal(idx)}
                    className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-white"
                    title="Edit review"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    disabled={isRoleUnauthorized}
                    onClick={() => handleRemoveReview(idx)}
                    className="p-2 text-red-600 hover:text-red-800 rounded-lg hover:bg-white"
                    title="Delete review"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {boutiqueReviews.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-5 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                No customer reviews added yet. Click &ldquo;Add Verified Review&rdquo; to add your first review.
              </p>
            )}
          </div>
        </div>

        {/* ========================================================
            3. PAYMENT SETTINGS & CHECKOUT CONTROLS
            ======================================================== */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#B58A3C]" />
              <h2 className="font-serif font-bold text-base text-gray-900">Payment Settings & Checkout Controls</h2>
            </div>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-[#FCF8F0] text-[#5E1224] border border-[#E8DFD0]">
              Instant Enforcement
            </span>
          </div>

          <p className="text-xs text-gray-600 font-light">
            Enable or disable customer payment methods at checkout. Changes apply immediately to all incoming orders
            without requiring server restarts or code changes.
          </p>

          {!codEnabled && !onlinePaymentEnabled && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-3 animate-pulse">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-800">Warning: All Payment Methods Disabled</p>
                <p className="mt-0.5 text-red-700">
                  With both COD and Online Payments turned OFF, customers cannot place any orders at checkout.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* COD Toggle */}
            <div
              className={`p-4 rounded-xl border transition-all ${codEnabled ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-gray-50/50'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className={`w-4 h-4 ${codEnabled ? 'text-emerald-700' : 'text-gray-400'}`} />
                  <span className="text-xs font-bold text-gray-900">Cash on Delivery (COD)</span>
                </div>
                <button
                  type="button"
                  disabled={isRoleUnauthorized}
                  onClick={() => setCodEnabled(!codEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#5E1224] ${codEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                    } ${isRoleUnauthorized ? 'opacity-50 cursor-not-allowed' : ''}`}
                  role="switch"
                  aria-checked={codEnabled}
                  aria-label="Toggle Cash on Delivery"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${codEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${codEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                    }`}
                >
                  {codEnabled ? 'Active in Checkout' : 'Disabled / Hidden'}
                </span>
                <span className="text-[11px] text-gray-500">Default: OFF for new orders</span>
              </div>
            </div>

            {/* Cashfree Online Payments Toggle */}
            <div
              className={`p-4 rounded-xl border transition-all ${onlinePaymentEnabled ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-gray-50/50'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className={`w-4 h-4 ${onlinePaymentEnabled ? 'text-emerald-700' : 'text-gray-400'}`} />
                  <span className="text-xs font-bold text-gray-900">Cashfree Online Payments</span>
                </div>
                <button
                  type="button"
                  disabled={isRoleUnauthorized}
                  onClick={() => setOnlinePaymentEnabled(!onlinePaymentEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#5E1224] ${onlinePaymentEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                    } ${isRoleUnauthorized ? 'opacity-50 cursor-not-allowed' : ''}`}
                  role="switch"
                  aria-checked={onlinePaymentEnabled}
                  aria-label="Toggle Cashfree Online Payments"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${onlinePaymentEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${onlinePaymentEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                    }`}
                >
                  {onlinePaymentEnabled ? 'Active in Checkout' : 'Disabled / Hidden'}
                </span>
                <span className="text-[11px] text-gray-500">Default: ON</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================
            4. LOGISTICS & DELIVERY SETTINGS
            ======================================================== */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Truck className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">Shipping & Delivery Thresholds</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Free Shipping Threshold (₹)
              </label>
              <input
                type="number"
                disabled={isRoleUnauthorized}
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400 mt-1">Orders above this qualify for free shipping</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Standard Shipping Charge (₹)
              </label>
              <input
                type="number"
                disabled={isRoleUnauthorized}
                value={standardShippingFee}
                onChange={(e) => setStandardShippingFee(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400 mt-1">Applied when cart subtotal is under threshold</p>
            </div>
          </div>
        </div>

        {/* ========================================================
            5. TOP ANNOUNCEMENT BANNER
            ======================================================== */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Bell className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">Top Announcement Banner</h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Storefront Announcement Message
            </label>
            <input
              type="text"
              disabled={isRoleUnauthorized}
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Displayed at the top of every storefront page. Dynamically reflects COD availability when saved.
            </p>
          </div>
        </div>

        {/* ========================================================
            6. BOUTIQUE CONTACT CHANNELS (Concierge Support)
            ======================================================== */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <MessageCircle className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">Online Concierge Channels</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">WhatsApp Concierge</label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Support Email</label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Instagram Handle</label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving || isRoleUnauthorized}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-white text-xs font-ui font-semibold uppercase tracking-wider rounded-lg shadow-md transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Saving Settings...' : 'Save All Settings'}</span>
          </button>
        </div>
      </form>

      {/* Confirmation Modal: Both Payment Methods Disabled */}
      {showConfirmBothDisabledModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-gray-900">Pause Store Checkout?</h3>
                <p className="text-xs text-red-700">Both payment methods are disabled</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              You are about to save settings with <strong>both Cash on Delivery (COD)</strong> and{' '}
              <strong>Cashfree Online Payments turned OFF</strong>.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              Customers will be unable to complete any purchases at checkout until at least one payment method is
              re-enabled.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmBothDisabledModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel & Review
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={executeSave}
                className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Confirm & Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Library Picker Modal */}
      <MediaLibraryPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleSelectMedia}
        title={pickerTarget === 'main' ? 'Select Main Boutique Photo' : 'Select Gallery Photos'}
      />

      {/* Add / Edit Review Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-serif font-bold text-base text-gray-900">
                {editingReviewIndex !== null ? 'Edit Customer Review' : 'Add Verified Customer Review'}
              </h3>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReviewModal} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Customer / Author Name *</label>
                <input
                  type="text"
                  required
                  value={reviewForm.author_name}
                  onChange={(e) => setReviewForm({ ...reviewForm, author_name: e.target.value })}
                  placeholder="e.g. Meenakshi Sharma"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Rating (1 to 5 Stars)</label>
                  <select
                    value={reviewForm.rating}
                    onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224] bg-white"
                  >
                    <option value={5}>5 Stars (Exceptional)</option>
                    <option value={4}>4 Stars (Very Good)</option>
                    <option value={3}>3 Stars (Good)</option>
                    <option value={2}>2 Stars (Fair)</option>
                    <option value={1}>1 Star</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Review Date</label>
                  <input
                    type="text"
                    value={reviewForm.review_date || ''}
                    onChange={(e) => setReviewForm({ ...reviewForm, review_date: e.target.value })}
                    placeholder="e.g. October 2026"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Review Text / Excerpt *</label>
                <textarea
                  rows={3}
                  required
                  value={reviewForm.review_text}
                  onChange={(e) => setReviewForm({ ...reviewForm, review_text: e.target.value })}
                  placeholder="The craftsmanship and bespoke fitting of my festive suit were extraordinary..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Source *</label>
                  <select
                    value={reviewForm.source || 'google'}
                    onChange={(e) => setReviewForm({ ...reviewForm, source: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224] bg-white"
                  >
                    <option value="google">Google Maps / Review</option>
                    <option value="direct">Direct Feedback (Not for Google section)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Source URL (Google Link)</label>
                  <input
                    type="text"
                    value={reviewForm.source_url || ''}
                    onChange={(e) => setReviewForm({ ...reviewForm, source_url: e.target.value })}
                    placeholder="https://maps.google.com/..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                  />
                </div>
              </div>

              {/* Owner Approval Toggle */}
              <div className="p-3 bg-amber-50/60 border border-[#B58A3C]/40 rounded-lg space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rev_owner_approved"
                    checked={Boolean(reviewForm.owner_approved)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setReviewForm({
                        ...reviewForm,
                        owner_approved: checked,
                        is_published: checked ? reviewForm.is_published : (reviewForm.is_verified ? reviewForm.is_published : false),
                      });
                    }}
                    className="w-4 h-4 text-[#5E1224] rounded border-gray-300"
                  />
                  <label htmlFor="rev_owner_approved" className="font-semibold text-gray-800 cursor-pointer text-xs">
                    Owner Approved for Storefront Publication
                  </label>
                </div>
                <p className="text-[10.5px] text-gray-500 pl-6">
                  Approves patron review for storefront display without requiring independent API verification.
                </p>
              </div>

              {/* Explicit Verification Toggle */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rev_verified"
                    checked={reviewForm.is_verified}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setReviewForm({
                        ...reviewForm,
                        is_verified: checked,
                        verified_date: checked ? (reviewForm.verified_date || new Date().toISOString().split('T')[0]) : null,
                        is_published: checked ? reviewForm.is_published : (reviewForm.owner_approved ? reviewForm.is_published : false),
                      });
                    }}
                    className="w-4 h-4 text-[#5E1224] rounded border-gray-300"
                  />
                  <label htmlFor="rev_verified" className="font-semibold text-gray-800 cursor-pointer text-xs">
                    Independently Verified by Google
                  </label>
                </div>
                {reviewForm.is_verified && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Verification Date</label>
                    <input
                      type="date"
                      value={reviewForm.verified_date || ''}
                      onChange={(e) => setReviewForm({ ...reviewForm, verified_date: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded border border-gray-300 text-xs focus:outline-none focus:border-[#5E1224]"
                    />
                  </div>
                )}
              </div>

              {/* Publication Toggle (Enabled if owner approved OR verified, rating >= 4, and source === 'google') */}
              {(() => {
                const isEligible = (reviewForm.is_verified || reviewForm.owner_approved) && Number(reviewForm.rating) >= 4 && (!reviewForm.source || reviewForm.source === 'google');
                return (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="rev_publish"
                        disabled={!isEligible}
                        checked={reviewForm.is_published}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setReviewForm({
                            ...reviewForm,
                            is_published: checked,
                            owner_approved: checked ? (reviewForm.owner_approved ?? true) : reviewForm.owner_approved,
                          });
                        }}
                        className="w-4 h-4 text-[#5E1224] rounded border-gray-300 disabled:opacity-40"
                      />
                      <label
                        htmlFor="rev_publish"
                        className={`font-semibold cursor-pointer text-xs ${!isEligible ? 'text-gray-400' : 'text-gray-700'
                          }`}
                      >
                        Mark as Published (Visible on storefront if section is enabled)
                      </label>
                    </div>
                    {!isEligible && (
                      <p className="text-[10.5px] text-amber-700 pl-6">
                        Requirement: Requires valid owner approval or Google verification, plus actual rating 4 or 5 stars.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="pt-3 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#5E1224] hover:bg-[#4A0E1C] text-white rounded-lg font-semibold uppercase tracking-wider"
                >
                  Save Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
