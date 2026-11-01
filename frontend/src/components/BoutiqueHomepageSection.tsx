import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Clock,
  Navigation,
  ArrowRight,
  Sparkles,
  Phone,
  MessageCircle,
  Calendar,
} from 'lucide-react';
import { StoreSettings, useStoreSettings } from '../lib/settings';

interface ContentProps {
  settings: StoreSettings;
}

const BoutiqueHomepageContent: React.FC<ContentProps> = ({ settings }) => {
  const directionsUrl =
    settings.boutiqueDirectionsUrl || 'https://share.google/rdahckZ4nVz7Bgu2H';
  const hasRealPhoto = Boolean(
    settings.boutiqueMainImage &&
      typeof settings.boutiqueMainImage === 'string' &&
      settings.boutiqueMainImage.trim().length > 0 &&
      !settings.boutiqueMainImage.includes('/images/editorial/')
  );

  // Smooth scroll listener for direct links or hash changes
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

  return (
    <section
      id="boutique"
      aria-labelledby="boutique-homepage-heading"
      className="scroll-mt-24 w-full bg-[#FCF8F0] border-t border-b border-[#B58A3C]/25 py-12 sm:py-16 px-4 sm:px-6 lg:px-8 transition-colors"
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* LEFT: Real Shop Photograph or Elegant Atelier Emblem Card */}
          <div className="lg:col-span-6 order-1">
            {hasRealPhoto ? (
              <div className="relative group overflow-hidden rounded-none border border-[#B58A3C]/40 shadow-lg bg-[#2B1B1E] aspect-[4/3] sm:aspect-[16/11]">
                <img
                  src={settings.boutiqueMainImage!}
                  alt={`${settings.boutiqueName || 'Royal Libas by Tanya'} Boutique Interior & Atelier`}
                  loading="lazy"
                  width={800}
                  height={550}
                  className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-[#FCF8F0] pointer-events-none">
                  <span className="text-[10px] sm:text-xs font-serif uppercase tracking-[0.25em] text-[#D4AF67] drop-shadow-sm flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF67]" /> Flagship Boutique & Atelier
                  </span>
                  <span className="text-[10px] font-mono tracking-wider text-[#FCF8F0]/80">Jhansi, UP</span>
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-none border border-[#B58A3C]/40 shadow-md bg-gradient-to-br from-[#2B1B1E] via-[#3A080F] to-[#5E1224] p-8 sm:p-12 flex flex-col items-center justify-center text-center aspect-[4/3] sm:aspect-[16/11] space-y-4">
                <div className="w-16 h-16 rounded-full border border-[#D4AF67]/40 bg-[#FCF8F0]/10 flex items-center justify-center">
                  <MapPin className="w-7 h-7 text-[#D4AF67]" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.28em] text-[#D4AF67] font-semibold block">
                    FLAGSHIP STORE & ATELIER
                  </span>
                  <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#FCF8F0]">
                    {settings.boutiqueName || 'Royal Libas by Tanya'}
                  </h3>
                  <p className="text-xs text-[#FCF8F0]/75 font-light max-w-sm pt-1">
                    Prem Ganj, Sipri Bazar, Jhansi, Uttar Pradesh 284003
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    to="/contact#boutique"
                    className="inline-flex items-center gap-1.5 text-xs text-[#D4AF67] hover:underline font-medium uppercase tracking-wider"
                  >
                    <span>View Atelier Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Compact Boutique Information & Action Buttons */}
          <div className="lg:col-span-6 order-2 space-y-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2">
                <span className="w-6 h-[1px] bg-[#B58A3C]" />
                <span className="text-[10px] sm:text-xs uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
                  VISIT OUR ATELIER
                </span>
                <span className="w-6 h-[1px] bg-[#B58A3C]" />
              </div>

              <h2
                id="boutique-homepage-heading"
                className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#5E1224] tracking-tight"
              >
                Visit Our Boutique
              </h2>
              <p className="font-serif text-sm sm:text-base text-[#B58A3C] font-medium tracking-wide">
                {settings.boutiqueName || 'Royal Libas by Tanya'}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-gray-700 font-light leading-relaxed">
              {settings.boutiqueIntro ||
                'Experience our master craftsmanship, bespoke tailoring consultations, and luxury handloom collections in person at our flagship Jhansi boutique.'}
            </p>

            {/* Special Notice if configured */}
            {settings.boutiqueSpecialNotice && (
              <div className="p-3 bg-amber-50 border-l-4 border-[#B58A3C] text-amber-900 text-xs flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-[#B58A3C] shrink-0" />
                <span>{settings.boutiqueSpecialNotice}</span>
              </div>
            )}

            {/* Address & Timings Card */}
            <div className="p-4 sm:p-5 bg-white border border-[#B58A3C]/30 shadow-sm space-y-3">
              {/* Address */}
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-[#B58A3C] shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold text-gray-900">
                    {settings.boutiqueAddress ||
                      'Opposite Hotel Ambrosia, Prem Ganj, Sipri Bazar, Jhansi, Uttar Pradesh 284003'}
                  </p>
                  {settings.boutiqueLandmark && (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      <span className="font-medium text-gray-700">Landmark:</span>{' '}
                      {settings.boutiqueLandmark}
                    </p>
                  )}
                </div>
              </div>

              {/* Hours (if configured) */}
              {(settings.boutiqueOpeningHours || settings.boutiqueWeeklyHoliday) && (
                <div className="flex items-start gap-3 pt-2.5 border-t border-gray-100">
                  <Clock className="w-4 h-4 text-[#B58A3C] shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    {settings.boutiqueOpeningHours && (
                      <p className="font-semibold text-gray-900">
                        {settings.boutiqueOpeningHours}
                      </p>
                    )}
                    {settings.boutiqueWeeklyHoliday && (
                      <p className="text-[11px] text-gray-500">
                        Weekly Holiday: {settings.boutiqueWeeklyHoliday}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons: Get Directions, Explore Our Boutique, Optional Phone/WhatsApp */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-semibold uppercase tracking-[0.16em] transition-colors shadow-sm"
              >
                <Navigation className="w-3.5 h-3.5 text-[#D4AF67]" />
                <span>Get Directions</span>
              </a>

              <Link
                to="/contact#boutique"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-[#B58A3C]/50 hover:bg-[#5E1224]/5 text-[#5E1224] text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs"
              >
                <span>Explore Our Boutique</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#B58A3C]" />
              </Link>

              {settings.boutiquePhone && (
                <a
                  href={`tel:${settings.boutiquePhone.replace(/[^0-9+]/g, '')}`}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white border border-gray-200 hover:border-[#B58A3C] text-gray-700 text-xs font-medium transition-colors"
                  title="Call Boutique"
                >
                  <Phone className="w-3.5 h-3.5 text-[#B58A3C]" />
                  <span className="hidden sm:inline">Call</span>
                </a>
              )}

              {settings.boutiqueWhatsapp && (
                <a
                  href={`https://wa.me/${settings.boutiqueWhatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white border border-gray-200 hover:border-emerald-600 text-gray-700 hover:text-emerald-700 text-xs font-medium transition-colors"
                  title="WhatsApp Boutique"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
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
