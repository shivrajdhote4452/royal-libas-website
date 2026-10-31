import React, { useState, useEffect } from 'react';
import { MessageCircle, Mail, Instagram, Clock, Send, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { submitContactInquiry } from '../lib/api';
import { useStoreSettings } from '../lib/settings';

export const Contact: React.FC = () => {
  const { settings, syncWithServer } = useStoreSettings();
  const [submitted, setSubmitted] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const DEFAULT_CONTACT_IMAGE = '/images/editorial/cat_lehengas.jpg';
  const rawImage = settings.heroImageUrl || settings.posterStoryImage;
  const effectiveContactImage = (!imgFailed && rawImage && !rawImage.includes('res.cloudinary.com/demo/'))
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
    document.title = 'Contact & Get in Touch | Royal Libas by Tanya';
    window.scrollTo(0, 0);
    syncWithServer();
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
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* ========================================================
            CONTACT PAGE SPLIT LAYOUT (PDF Page 11)
            Left: Contact Touchpoints & Restrained Form
            Right: Editorial Portrait Photography
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
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224]">
                Get in Touch
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed max-w-md">
                We are here to assist you. Reach out for any inquiries regarding measurements, bespoke styling, or order concierge.
              </p>
            </div>

            {/* Circular Touchpoint List (PDF Page 11) */}
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

              {/* Working Hours */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5E1224]/10 border border-[#B58A3C]/40 text-[#5E1224] flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-[#B58A3C]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Atelier Hours</span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">Mon &ndash; Sat, 10:00 AM &ndash; 7:00 PM IST</span>
                </div>
              </div>
            </div>

            {/* Restrained Contact Form (PDF Page 11) */}
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
                <form onSubmit={handleSubmit} className="space-y-3">
                  {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Your Full Name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={isSubmitting}
                      className="px-3.5 py-2.5 rounded-none border border-[#E8DFD0] text-xs focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-50"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Your Email Address"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={isSubmitting}
                      className="px-3.5 py-2.5 rounded-none border border-[#E8DFD0] text-xs focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-50"
                    />
                  </div>
                  <textarea
                    required
                    rows={3}
                    placeholder="How may our concierge assist you today?"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 rounded-none border border-[#E8DFD0] text-xs focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-[#5E1224] hover:bg-[#3A080F] disabled:bg-gray-400 text-[#FCF8F0] text-xs font-ui font-semibold uppercase tracking-[0.2em] rounded-none transition-colors shadow flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Inquiry...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Inquiry</span>
                        <Send className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* RIGHT: Editorial Fashion Portrait (lg:col-span-5) (PDF Page 11) */}
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
      </div>
    </div>
  );
};
