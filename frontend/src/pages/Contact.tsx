import React, { useState, useEffect } from 'react';
import { MessageCircle, Mail, MapPin, Instagram, Phone, Send, CheckCircle2 } from 'lucide-react';

export const Contact: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    topic: 'Sizing & Measurements Help',
    message: '',
  });

  useEffect(() => {
    document.title = 'Contact & Boutique Atelier | Royal Libas by Tanya';
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-gray-800 py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
            Get In Touch
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5B111A] mt-2">
            Contact Tanya & The Boutique Atelier
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-2 max-w-xl mx-auto">
            Whether you have questions about styling, fabric feel, measurements, or order status, we're here to help you personally.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Direct Contact Channels & Studio Address */}
          <div className="lg:col-span-5 space-y-6">
            {/* WhatsApp Highlight Box */}
            <div className="bg-[#1A4D2E] text-white p-6 rounded-2xl border border-emerald-600 shadow-md space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-white">Instant WhatsApp Concierge</h3>
                  <p className="text-[11px] text-emerald-200">Fastest response for sizing & orders</p>
                </div>
              </div>
              <p className="text-xs text-white/90 leading-relaxed">
                Connect directly with Tanya's styling assistant for real-time video preview of fabrics or customized fit recommendations.
              </p>
              <a
                href="https://wa.me/919876543210?text=Hi%20Tanya!%20I'd%20like%20to%20connect%20regarding%20Royal%20Libas."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full py-2.5 rounded bg-emerald-500 hover:bg-emerald-600 text-[#0F2F1C] font-semibold text-xs uppercase tracking-wider transition-colors shadow"
              >
                Start WhatsApp Chat
              </a>
            </div>

            {/* Direct Details Card */}
            <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
              <h3 className="font-serif font-bold text-[#5B111A] text-sm uppercase tracking-wider">
                Boutique Touchpoints
              </h3>

              <div className="flex items-start gap-3 text-xs sm:text-sm text-gray-700">
                <Mail className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
                <div>
                  <span className="block font-semibold text-gray-900">Email Inquiries</span>
                  <span className="text-gray-600">To be confirmed by Tanya</span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs sm:text-sm text-gray-700">
                <Phone className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
                <div>
                  <span className="block font-semibold text-gray-900">Telephone / Studio Line</span>
                  <span className="text-gray-600">To be confirmed by Tanya</span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs sm:text-sm text-gray-700">
                <Instagram className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
                <div>
                  <span className="block font-semibold text-gray-900">Instagram DM</span>
                  <span className="text-gray-600">To be confirmed by Tanya</span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs sm:text-sm text-gray-700 pt-2 border-t border-gray-100">
                <MapPin className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
                <div>
                  <span className="block font-semibold text-gray-900">Design Studio & Workshop</span>
                  <p className="text-gray-600 leading-relaxed text-xs">
                    To be confirmed by Tanya
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Inquiry Consultation Form */}
          <div className="lg:col-span-7 bg-white p-6 sm:p-10 rounded-2xl border border-[#E8DFD0] shadow-sm">
            {submitted ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="font-serif font-bold text-2xl text-[#5B111A]">Message Received!</h3>
                <p className="text-xs sm:text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">
                  Thank you for writing to us. Tanya or our senior styling coordinator will reply to your phone/WhatsApp within 4 business hours.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="px-6 py-2.5 rounded bg-[#5B111A] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#480B13] transition-colors mt-4"
                >
                  Send Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h3 className="font-serif font-bold text-xl text-gray-900">Send an Inquiry to Tanya</h3>
                  <p className="text-xs text-gray-500 mt-0.5">We typically respond within a few hours.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Your Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Radhika Sharma"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full text-xs p-3 rounded-lg border border-[#E8DFD0] focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      10-Digit Phone / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full text-xs p-3 rounded-lg border border-[#E8DFD0] focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    What can we help you with?
                  </label>
                  <select
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    className="w-full text-xs p-3 rounded-lg border border-[#E8DFD0] focus:ring-1 focus:ring-[#C59B27] focus:outline-none bg-white"
                  >
                    <option>Sizing & Measurements Help</option>
                    <option>Product Inquiries / Fabric Details</option>
                    <option>Order Status & Tracking</option>
                    <option>Size Exchange Request</option>
                    <option>Custom Bridal / Festive Order Inquiries</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Your Message *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Tell us what design you are looking at, your usual size, or your question..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full text-xs p-3 rounded-lg border border-[#E8DFD0] focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded bg-[#5B111A] hover:bg-[#480B13] text-white font-semibold text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  Submit Inquiry
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
