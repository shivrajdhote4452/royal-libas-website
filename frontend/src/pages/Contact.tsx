import React, { useState, useEffect } from 'react';
import {
  MessageCircle,
  Mail,
  Instagram,
  Clock,
  Send,
  CheckCircle2,
  Loader2,
  AlertCircle,
  MapPin,
  Copy,
  Check,
  ExternalLink,
  Phone,
  Navigation,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Star,
} from 'lucide-react';
import { submitContactInquiry } from '../lib/api';
import { useStoreSettings } from '../lib/settings';

export const Contact: React.FC = () => {
  const { settings, syncWithServer } = useStoreSettings();
  const [submitted, setSubmitted] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const DEFAULT_CONTACT_IMAGE = '/images/editorial/cat_lehengas.jpg';
  const rawImage = settings.heroImageUrl || settings.posterStoryImage;
  const effectiveContactImage =
    !imgFailed && rawImage && !rawImage.includes('res.cloudinary.com/demo/')
      ? rawImage
      : DEFAULT_CONTACT_IMAGE;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });

  // Boutique interaction states
  const [addressCopied, setAddressCopied] = useState(false);
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  const gallery = (settings.boutiqueGallery || []).slice(0, 4);

  useEffect(() => {
    document.title = 'Contact & Visit Our Boutique | Royal Libas by Tanya';
    syncWithServer();

    // Smooth scroll to #boutique if hash present on page load
    const hash = window.location.hash;
    if (hash === '#boutique') {
      const timer = setTimeout(() => {
        const el = document.getElementById('boutique');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
      return () => clearTimeout(timer);
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  // Keyboard accessibility for Lightbox
  useEffect(() => {
    if (activeLightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveLightboxIndex(null);
      } else if (e.key === 'ArrowRight') {
        setActiveLightboxIndex((prev) => (prev !== null ? (prev + 1) % gallery.length : 0));
      } else if (e.key === 'ArrowLeft') {
        setActiveLightboxIndex((prev) =>
          prev !== null ? (prev - 1 + gallery.length) % gallery.length : 0
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLightboxIndex, gallery.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      setErrorMsg('Please complete all required fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      await submitContactInquiry({
        name: formData.name.trim(),
        email: formData.email.trim(),
        message: formData.message.trim(),
      });
      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to submit your message at this time. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAddress = async () => {
    const textToCopy = `${settings.boutiqueName || 'Royal Libas by Tanya'}, ${
      settings.boutiqueAddress ||
      'Opposite Hotel Ambrosia, Prem Ganj, Sipri Bazar, Jhansi, Uttar Pradesh 284003'
    }${
      settings.boutiqueLandmark ? ` (Landmark: ${settings.boutiqueLandmark})` : ''
    }, PIN: ${settings.boutiquePincode || '284003'}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 3000);
    } catch {
      setAddressCopied(false);
    }
  };

  const directionsUrl =
    settings.boutiqueDirectionsUrl || 'https://share.google/rdahckZ4nVz7Bgu2H';
  const reviewsUrl = settings.boutiqueReviewsUrl || directionsUrl;

  return (
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans py-12 sm:py-16 px-4 sm:px-6 lg:px-8 space-y-16 sm:space-y-20">
      <div className="max-w-6xl mx-auto space-y-16 sm:space-y-20">
        {/* ========================================================
            UPPER SECTION: CONCIERGE TOUCHPOINTS & INQUIRY FORM
            ======================================================== */}
        <div className="bg-white rounded-none border border-[#B58A3C]/40 shadow-md overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* LEFT: Information & Contact Form (lg:col-span-7) */}
          <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 space-y-8 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2">
                <span className="w-6 h-[1px] bg-[#B58A3C]" />
                <span className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
                  CONCIERGE & SUPPORT
                </span>
                <span className="w-6 h-[1px] bg-[#B58A3C]" />
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] tracking-tight">
                Get in Touch
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed max-w-md">
                We are here to assist you. Reach out for any inquiries regarding measurements, bespoke styling, or order concierge.
              </p>
            </div>

            {/* Circular Touchpoint List */}
            <div className="space-y-4">
              {/* WhatsApp */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 text-[#5E1224] flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5 text-[#B58A3C]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">WhatsApp Concierge</span>
                  <a
                    href={`https://wa.me/${(settings.whatsappNumber || '+919811223344').replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm font-semibold text-[#5E1224] hover:underline"
                  >
                    {settings.whatsappNumber || '+91 98112 23344'}
                  </a>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 text-[#5E1224] flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-[#B58A3C]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Email Concierge</span>
                  <a
                    href={`mailto:${settings.supportEmail || 'care@royallibas.com'}`}
                    className="text-xs sm:text-sm font-semibold text-gray-900 hover:text-[#5E1224] hover:underline"
                  >
                    {settings.supportEmail || 'care@royallibas.com'}
                  </a>
                </div>
              </div>

              {/* Instagram */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 text-[#5E1224] flex items-center justify-center shrink-0">
                  <Instagram className="w-5 h-5 text-[#B58A3C]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Instagram</span>
                  <a
                    href={`https://instagram.com/${(settings.instagramHandle || '@royal_libas_by_tanya').replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm font-semibold text-[#5E1224] hover:underline"
                  >
                    {settings.instagramHandle || '@royal_libas_by_tanya'}
                  </a>
                </div>
              </div>

              {/* Concierge Working Hours */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 text-[#5E1224] flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-[#B58A3C]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                    Online Concierge Hours
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900 block">
                    {settings.boutiqueOpeningHours || 'Mon – Sat, 10:00 AM – 7:00 PM IST'}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    Virtual styling, queries & order tracking assistance
                  </span>
                </div>
              </div>
            </div>

            {/* Restrained Contact Form */}
            <div className="pt-4 border-t border-gray-100">
              {submitted ? (
                <div className="p-5 bg-emerald-50 rounded-none border border-emerald-200 text-center space-y-3">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                  <h3 className="font-serif font-bold text-base text-gray-900">Message Received</h3>
                  <p className="text-xs text-gray-600">
                    Thank you for reaching out. Our concierge will connect with you via email shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setFormData({ name: '', email: '', message: '' });
                    }}
                    className="mt-2 text-xs font-semibold text-[#5E1224] hover:underline uppercase tracking-wider inline-block"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div>
                    <label htmlFor="name" className="block text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Your Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="mt-1 block w-full px-3 py-2 bg-[#FCF8F0]/30 border border-[#B58A3C]/40 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#5E1224] focus:border-[#5E1224]"
                      placeholder="e.g. Tanya Sharma"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="mt-1 block w-full px-3 py-2 bg-[#FCF8F0]/30 border border-[#B58A3C]/40 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#5E1224] focus:border-[#5E1224]"
                      placeholder="e.g. tanya@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Message / Custom Requirement
                    </label>
                    <textarea
                      id="message"
                      rows={3}
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="mt-1 block w-full px-3 py-2 bg-[#FCF8F0]/30 border border-[#B58A3C]/40 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#5E1224] focus:border-[#5E1224]"
                      placeholder="Share your custom sizing questions, dispatch queries, or event deadlines..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-semibold uppercase tracking-[0.18em] transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#B58A3C]" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Inquiry</span>
                        <Send className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* RIGHT: Editorial Fashion Portrait */}
          <div className="lg:col-span-5 min-h-[350px] lg:min-h-full bg-[#2B1B1E] relative flex items-center justify-center">
            <img
              src={effectiveContactImage}
              alt="Royal Libas Atelier Editorial"
              className="w-full h-full object-cover object-top"
              onError={() => {
                if (effectiveContactImage !== DEFAULT_CONTACT_IMAGE) setImgFailed(true);
              }}
            />
          </div>
        </div>

        {/* ========================================================
            LOWER SECTION: VISIT OUR BOUTIQUE (Anchor: #boutique)
            scroll-mt-28 accounts for sticky header
            ======================================================== */}
        <section
          id="boutique"
          className="scroll-mt-28 bg-white rounded-none border border-[#B58A3C]/40 shadow-md p-6 sm:p-10 lg:p-12 space-y-10"
        >
          {/* Section Header */}
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2">
              <span className="w-6 h-[1px] bg-[#B58A3C]" />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
                FLAGSHIP STORE & ATELIER
              </span>
              <span className="w-6 h-[1px] bg-[#B58A3C]" />
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224]">
              Visit Our Boutique
            </h2>
            <p className="font-serif italic text-base sm:text-lg text-[#B58A3C] font-medium">
              {settings.boutiqueName || 'Royal Libas by Tanya'}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
              {settings.boutiqueIntro ||
                'Experience our master craftsmanship, bespoke tailoring consultations, and luxury handloom collections in person at our flagship Jhansi boutique.'}
            </p>
          </div>

          {/* Special Closure or Holiday Notice (Optional) */}
          {settings.boutiqueSpecialNotice && (
            <div className="p-4 bg-amber-50 border-l-4 border-[#B58A3C] text-amber-900 text-xs flex items-start gap-3">
              <Calendar className="w-4 h-4 text-[#B58A3C] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 uppercase tracking-wider text-[11px]">Notice</p>
                <p className="text-amber-800 mt-0.5">{settings.boutiqueSpecialNotice}</p>
              </div>
            </div>
          )}

          {/* Location & Map Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Address, Hours, Contact & Direction Buttons (lg:col-span-7) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Address Card */}
              <div className="p-5 bg-[#FCF8F0] border border-[#B58A3C]/30 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-5 h-5 text-[#5E1224] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-bold text-[#B58A3C] uppercase tracking-wider block">
                        Boutique Address
                      </span>
                      <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5 leading-relaxed">
                        {settings.boutiqueAddress ||
                          'Opposite Hotel Ambrosia, Prem Ganj, Sipri Bazar, Jhansi, Uttar Pradesh 284003'}
                      </p>
                    </div>
                  </div>

                  {/* Copy Address Button */}
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[#5E1224] bg-white border border-[#B58A3C]/40 hover:bg-[#5E1224] hover:text-[#FCF8F0] transition-colors shrink-0"
                    aria-label="Copy Boutique Address"
                  >
                    {addressCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#B58A3C]" />
                        <span>Copy Address</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Landmark & PIN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#B58A3C]/20 text-xs">
                  {settings.boutiqueLandmark && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold block">
                        Landmark
                      </span>
                      <span className="font-medium text-gray-800">
                        {settings.boutiqueLandmark}
                      </span>
                    </div>
                  )}
                  {settings.boutiquePincode && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold block">
                        Postal PIN Code
                      </span>
                      <span className="font-medium text-gray-800">
                        {settings.boutiquePincode}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Physical Visiting Hours & Holiday Card (if configured) */}
              {(settings.boutiqueOpeningHours || settings.boutiqueWeeklyHoliday) && (
                <div className="p-5 bg-[#FCF8F0] border border-[#B58A3C]/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {settings.boutiqueOpeningHours && (
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-[#5E1224] shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold text-[#B58A3C] uppercase tracking-wider block">
                          Physical Store Hours
                        </span>
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5">
                          {settings.boutiqueOpeningHours}
                        </p>
                        <span className="text-[10px] text-gray-500 block mt-0.5">
                          Personal styling & in-person shopping
                        </span>
                      </div>
                    </div>
                  )}

                  {settings.boutiqueWeeklyHoliday && (
                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-[#5E1224] shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold text-[#B58A3C] uppercase tracking-wider block">
                          Weekly Holiday
                        </span>
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5">
                          {settings.boutiqueWeeklyHoliday}
                        </p>
                        <span className="text-[10px] text-gray-500 block mt-0.5">
                          Online concierge available on holidays
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons: Directions, Call, WhatsApp */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-semibold uppercase tracking-[0.16em] transition-colors shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5 text-[#D4AF67]" />
                  <span>Get Directions</span>
                  <ExternalLink className="w-3 h-3 text-[#FCF8F0]/70" />
                </a>

                {settings.boutiquePhone && (
                  <a
                    href={`tel:${settings.boutiquePhone.replace(/[^0-9+]/g, '')}`}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-[#B58A3C]/50 hover:bg-[#5E1224]/5 text-[#5E1224] text-xs font-semibold uppercase tracking-wider transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-[#B58A3C]" />
                    <span>Call Boutique</span>
                  </a>
                )}

                {settings.boutiqueWhatsapp && (
                  <a
                    href={`https://wa.me/${settings.boutiqueWhatsapp.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-[#B58A3C]/50 hover:bg-[#5E1224]/5 text-[#5E1224] text-xs font-semibold uppercase tracking-wider transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#B58A3C]" />
                    <span>WhatsApp Store</span>
                  </a>
                )}

                {reviewsUrl && (
                  <a
                    href={reviewsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold text-gray-600 hover:text-[#5E1224] hover:underline transition-colors"
                  >
                    <Star className="w-3.5 h-3.5 text-[#B58A3C]" />
                    <span>View Google Reviews</span>
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  </a>
                )}
              </div>
            </div>

            {/* Right: Interactive Map or Confirmed Directions Card */}
            <div className="lg:col-span-5">
              {settings.boutiqueEmbedUrl ? (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block w-full aspect-video sm:aspect-[4/3] lg:aspect-square rounded-none border border-[#B58A3C]/50 overflow-hidden shadow-md bg-[#2B1B1E]/5 group cursor-pointer"
                  title="Click to open Royal Libas by Tanya in Google Maps"
                >
                  <iframe
                    src={settings.boutiqueEmbedUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen={false}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Royal Libas Boutique Location Map"
                    className="w-full h-full pointer-events-none transition-transform duration-500 group-hover:scale-[1.02]"
                  />

                  {/* Top Badge: Open in Google Maps */}
                  <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5E1224] group-hover:bg-[#3A080F] text-[#FCF8F0] text-[11px] font-semibold tracking-wider rounded-none shadow-lg border border-[#B58A3C] transition-all group-hover:scale-105">
                    <Navigation className="w-3.5 h-3.5 text-[#D4AF67]" />
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-3 h-3 text-[#FCF8F0]/70" />
                  </div>

                  {/* Bottom Bar: Landmark & Direct Location Button */}
                  <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/75 to-transparent p-3 sm:p-4 flex items-center justify-between text-white group-hover:from-[#5E1224] group-hover:via-[#5E1224]/90 transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#5E1224] border border-[#B58A3C] flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-[#D4AF67]" />
                      </div>
                      <div>
                        <span className="text-xs font-serif font-bold text-[#FCF8F0] block leading-tight">
                          {settings.boutiqueName || 'Royal Libas by Tanya'}
                        </span>
                        <span className="text-[10.5px] text-gray-300 block truncate max-w-[190px] sm:max-w-xs">
                          {settings.boutiqueShortAddress || settings.boutiqueAddress}
                        </span>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#B58A3C] group-hover:bg-[#D4AF67] text-[#3A080F] text-[10.5px] font-bold uppercase tracking-wider transition-colors shrink-0 shadow">
                      <span>Direct Location</span>
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                </a>
              ) : (
                <div className="relative w-full aspect-video sm:aspect-[4/3] lg:aspect-square rounded-none border border-[#B58A3C]/40 bg-[#FCF8F0] p-6 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-[#5E1224]/10 border border-[#B58A3C] flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-[#5E1224]" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-lg text-[#5E1224]">
                      {settings.boutiqueName || 'Royal Libas by Tanya'}
                    </h3>
                    <p className="text-xs text-gray-600 mt-1 max-w-xs">
                      {settings.boutiqueAddress}
                    </p>
                  </div>
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-semibold uppercase tracking-wider transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5 text-[#D4AF67]" />
                    <span>Open in Google Maps</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================
              BOUTIQUE PHOTOGRAPHY GALLERY (Up to 4 Real Photos)
              Rendered only if real gallery photos are configured
              ======================================================== */}
          {gallery.length > 0 && (
            <div className="pt-8 border-t border-[#B58A3C]/20 space-y-5">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-[0.24em] text-[#B58A3C] font-semibold block">
                  ATELIER GLIMPSES
                </span>
                <h3 className="font-serif text-2xl font-bold text-[#5E1224]">
                  Boutique & Atelier Showcase
                </h3>
                <p className="text-xs text-gray-600 font-light">
                  Click any photograph to enlarge and preview our handcrafted sanctuary.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {gallery.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    onClick={() => setActiveLightboxIndex(idx)}
                    className="group relative aspect-[4/3] bg-gray-100 overflow-hidden border border-[#B58A3C]/30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#5E1224]"
                    tabIndex={0}
                    role="button"
                    aria-label={`Enlarge photo ${idx + 1}: ${item.caption || 'Boutique Photo'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveLightboxIndex(idx);
                      }
                    }}
                  >
                    <img
                      src={item.url}
                      alt={item.caption || `Royal Libas Boutique Photo ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    {item.caption && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                        <span className="text-[11px] text-white font-medium truncate">
                          {item.caption}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ========================================================
          ACCESSIBLE LIGHTBOX / ENLARGED PREVIEW MODAL
          ======================================================== */}
      {activeLightboxIndex !== null && gallery[activeLightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActiveLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged photo preview"
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setActiveLightboxIndex(null)}
              className="absolute -top-11 right-0 text-white/80 hover:text-white p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Close enlarged preview"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Navigation Buttons */}
            {gallery.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setActiveLightboxIndex(
                      (activeLightboxIndex - 1 + gallery.length) % gallery.length
                    )
                  }
                  className="absolute left-2 sm:-left-12 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 sm:bg-transparent focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveLightboxIndex((activeLightboxIndex + 1) % gallery.length)
                  }
                  className="absolute right-2 sm:-right-12 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 sm:bg-transparent focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label="Next photo"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </>
            )}

            {/* Enlarged Image */}
            <img
              src={gallery[activeLightboxIndex].url}
              alt={
                gallery[activeLightboxIndex].caption ||
                `Royal Libas Boutique Photo ${activeLightboxIndex + 1}`
              }
              className="max-h-[80vh] max-w-full object-contain rounded-none border border-[#B58A3C]/40 shadow-2xl"
            />

            {/* Caption & Counter Bar */}
            <div className="w-full mt-3 flex items-center justify-between text-white/90 text-xs px-2">
              <span className="font-medium truncate max-w-[80%]">
                {gallery[activeLightboxIndex].caption || 'Royal Libas Boutique & Atelier'}
              </span>
              <span className="text-white/60 text-[11px] font-mono shrink-0">
                {activeLightboxIndex + 1} / {gallery.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contact;
