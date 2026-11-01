import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Clock,
  Navigation,
  Calendar,
  Copy,
  Check,
  Phone,
  MessageCircle,
  Star,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { StoreSettings, useStoreSettings } from '../lib/settings';

interface ContentProps {
  settings: StoreSettings;
}

const BoutiqueHomepageContent: React.FC<ContentProps> = ({ settings }) => {
  const [addressCopied, setAddressCopied] = useState(false);
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  const gallery = (settings.boutiqueGallery || []).slice(0, 4);

  const directionsUrl =
    settings.boutiqueDirectionsUrl || 'https://share.google/rdahckZ4nVz7Bgu2H';
  const boutiquePhone =
    settings.boutiquePhone || settings.whatsappNumber || '+91 98112 23344';
  const boutiqueWhatsapp =
    settings.boutiqueWhatsapp || settings.whatsappNumber || '+91 98112 23344';

  // Handle smooth scroll if page loads or changes to #boutique
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#boutique') {
        const el = document.getElementById('boutique');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Keyboard accessibility for Lightbox
  useEffect(() => {
    if (activeLightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveLightboxIndex(null);
      } else if (e.key === 'ArrowRight') {
        setActiveLightboxIndex((prev) =>
          prev !== null ? (prev + 1) % gallery.length : 0
        );
      } else if (e.key === 'ArrowLeft') {
        setActiveLightboxIndex((prev) =>
          prev !== null ? (prev - 1 + gallery.length) % gallery.length : 0
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLightboxIndex, gallery.length]);

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

  return (
    <section
      id="boutique"
      aria-labelledby="boutique-heading"
      className="scroll-mt-24 w-full bg-[#FCF8F0] border-t border-b border-[#B58A3C]/25 py-14 sm:py-20 px-4 sm:px-6 lg:px-8 transition-colors"
    >
      <div className="max-w-6xl mx-auto space-y-10">
        {/* ========================================================
            HEADER: Flagship Store & Atelier
            ======================================================== */}
        <div className="space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
              FLAGSHIP STORE & ATELIER
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>

          <h2
            id="boutique-heading"
            className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#5E1224] tracking-tight"
          >
            Visit Our Boutique
          </h2>

          <p className="font-serif italic text-base sm:text-lg text-[#B58A3C] font-medium tracking-wide">
            {settings.boutiqueName || 'Royal Libas by Tanya'}
          </p>

          <p className="text-xs sm:text-sm text-gray-700 font-light leading-relaxed">
            {settings.boutiqueIntro ||
              'Experience our master craftsmanship, bespoke tailoring consultations, and luxury handloom collections in person at our flagship Jhansi boutique.'}
          </p>
        </div>

        {/* Optional Special Notice Banner */}
        {settings.boutiqueSpecialNotice && (
          <div className="p-4 bg-amber-50 border-l-4 border-[#B58A3C] text-amber-900 text-xs flex items-start gap-3 shadow-sm">
            <Calendar className="w-4 h-4 text-[#B58A3C] shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900 uppercase tracking-wider text-[11px]">Notice</p>
              <p className="text-amber-800 mt-0.5">{settings.boutiqueSpecialNotice}</p>
            </div>
          </div>
        )}

        {/* ========================================================
            TWO-COLUMN GRID: Left Details, Right Real Google Map
            ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: Address, Hours, Contact & Direction Buttons (lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Address Card */}
            <div className="p-5 sm:p-6 bg-white border border-[#B58A3C]/35 shadow-sm space-y-3.5">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[#5E1224] bg-white border border-[#B58A3C]/40 hover:bg-[#5E1224] hover:text-[#FCF8F0] transition-colors shrink-0 shadow-xs"
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
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold block">
                    Landmark
                  </span>
                  <span className="font-medium text-gray-800">
                    {settings.boutiqueLandmark || 'Opposite Hotel Ambrosia'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold block">
                    Postal PIN Code
                  </span>
                  <span className="font-medium text-gray-800">
                    {settings.boutiquePincode || '284003'}
                  </span>
                </div>
              </div>
            </div>

            {/* Physical Visiting Hours & Holiday Card */}
            <div className="p-5 sm:p-6 bg-white border border-[#B58A3C]/35 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#5E1224] shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-[#B58A3C] uppercase tracking-wider block">
                    Physical Store Hours
                  </span>
                  <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5">
                    {settings.boutiqueOpeningHours || 'Mon – Sat: 10:30 AM – 8:30 PM'}
                  </p>
                  <span className="text-[10px] text-gray-500 block mt-0.5">
                    Personal styling & in-person shopping
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-[#5E1224] shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-[#B58A3C] uppercase tracking-wider block">
                    Weekly Holiday
                  </span>
                  <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5">
                    {settings.boutiqueWeeklyHoliday || 'Sunday'}
                  </p>
                  <span className="text-[10px] text-gray-500 block mt-0.5">
                    Online concierge available on holidays
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons: Directions, Call, WhatsApp, View Reviews */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
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

              <a
                href={`tel:${boutiquePhone.replace(/[^0-9+]/g, '')}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-[#B58A3C]/50 hover:bg-[#5E1224]/5 text-[#5E1224] text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs"
              >
                <Phone className="w-3.5 h-3.5 text-[#B58A3C]" />
                <span>Call Boutique</span>
              </a>

              <a
                href={`https://wa.me/${boutiqueWhatsapp.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-[#B58A3C]/50 hover:bg-[#5E1224]/5 text-[#5E1224] text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#B58A3C]" />
                <span>WhatsApp Store</span>
              </a>

              <a
                href="#reviews"
                onClick={(e) => {
                  e.preventDefault();
                  const target = document.getElementById('reviews') || document.querySelector('[aria-label="What Our Customers Say"]');
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold text-gray-700 hover:text-[#5E1224] hover:underline transition-colors"
              >
                <Star className="w-3.5 h-3.5 text-[#B58A3C]" />
                <span>View Google Reviews</span>
              </a>
            </div>
          </div>

          {/* RIGHT: Interactive Map with Direct Shop Location Click-Through (lg:col-span-5) */}
          <div className="lg:col-span-5">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block w-full aspect-video sm:aspect-[4/3] lg:aspect-square rounded-none border border-[#B58A3C]/50 overflow-hidden shadow-md bg-[#2B1B1E]/5 group cursor-pointer"
              title="Click to open Royal Libas by Tanya in Google Maps"
            >
              {/* Full Real Google Map Embed */}
              <iframe
                src={
                  settings.boutiqueEmbedUrl ||
                  'https://maps.google.com/maps?q=Royal%20Libas%20By%20Tanya%2C%20Opposite%20Hotel%20Ambrosia%2C%20Prem%20Ganj%2C%20Sipri%20Bazar%2C%20Jhansi%2C%20Uttar%20Pradesh%20284003&t=&z=16&ie=UTF8&iwloc=&output=embed'
                }
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
                  <div className="text-left">
                    <p className="text-xs font-bold leading-tight truncate max-w-[190px] sm:max-w-none">
                      Royal Libas by Tanya
                    </p>
                    <p className="text-[10px] text-gray-300 font-light truncate max-w-[190px] sm:max-w-none">
                      {settings.boutiqueLandmark || 'Opposite Hotel Ambrosia, Sipri Bazar'}
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D4AF67] tracking-wider uppercase bg-black/40 px-2.5 py-1 border border-[#B58A3C]/40">
                  <span>DIRECT LOCATION</span>
                  <ExternalLink className="w-3 h-3" />
                </div>
              </div>
            </a>
          </div>
        </div>

        {/* ========================================================
            LOWER SECTION: Atelier & Boutique Photo Showcase
            ======================================================== */}
        {gallery.length > 0 && (
          <div className="pt-6 border-t border-[#B58A3C]/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-[0.24em] text-[#B58A3C] font-semibold block">
                  ATELIER GLIMPSES
                </span>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-[#5E1224]">
                  Boutique & Atelier Showcase
                </h3>
              </div>
              <p className="text-[11px] text-gray-500 hidden sm:block">
                Click any image to enlarge and preview our handcrafted sanctuary.
              </p>
            </div>

            {/* Photo Grid */}
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
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                    <span className="text-[11px] text-white font-medium truncate">
                      {item.caption || 'Royal Libas Atelier'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
          {/* Modal Container */}
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
    </section>
  );
};

export const BoutiqueHomepageSection: React.FC = () => {
  const { settings } = useStoreSettings();

  // Clean conditional wrapper: guarantees hooks inside content component always run in invariant order
  if (settings.boutiqueSectionVisible === false) {
    return null;
  }

  return <BoutiqueHomepageContent settings={settings} />;
};

export default BoutiqueHomepageSection;
