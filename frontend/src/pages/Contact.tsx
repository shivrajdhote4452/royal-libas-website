import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  ArrowRight,
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

  useEffect(() => {
    document.title = 'Contact & Concierge | Royal Libas by Tanya';
    syncWithServer();

    // If navigated with #boutique hash, smoothly route to the boutique section on Home
    const hash = window.location.hash;
    if (hash === '#boutique') {
      window.location.replace('/#boutique');
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

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

  return (
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans py-12 sm:py-16 px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
      <div className="max-w-6xl mx-auto space-y-12 sm:space-y-16">
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
            FLAGSHIP BOUTIQUE INVITATION BANNER
            Invites visitor to see the full boutique on the Homepage
            ======================================================== */}
        <div className="bg-white rounded-none border border-[#B58A3C]/35 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 text-[#5E1224] flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#B58A3C]" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-[0.24em] text-[#B58A3C] font-semibold block">
                FLAGSHIP STORE & ATELIER
              </span>
              <h3 className="font-serif text-lg sm:text-xl font-bold text-[#5E1224]">
                Looking to visit our boutique in Jhansi?
              </h3>
              <p className="text-xs text-gray-600 font-light mt-1 max-w-xl">
                Experience bespoke tailoring consultations, view the live atelier gallery, and get direct map navigation on our Homepage boutique showcase.
              </p>
            </div>
          </div>

          <Link
            to="/#boutique"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-semibold uppercase tracking-[0.16em] transition-colors shrink-0 shadow-sm"
          >
            <span>Visit Boutique</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#D4AF67]" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Contact;
