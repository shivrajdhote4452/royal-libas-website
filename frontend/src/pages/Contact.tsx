import React, { useState, useEffect } from 'react';
import { MessageCircle, Mail, Instagram, Clock, Send, CheckCircle2 } from 'lucide-react';

export const Contact: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });

  useEffect(() => {
    document.title = 'Contact & Get in Touch | Royal Libas by Tanya';
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] page-enter font-sans py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* ========================================================
            CONTACT PAGE SPLIT LAYOUT (PDF Page 11)
            Left: Contact Touchpoints & Restrained Form
            Right: Editorial Portrait Photography
            ======================================================== */}
        <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-md overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* LEFT: Information & Contact Form (lg:col-span-7) */}
          <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 space-y-8 flex flex-col justify-between">
            <div className="space-y-3">
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5B111A]">
                Get in Touch
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed max-w-md">
                We're here to help. Feel free to reach out for any questions or support regarding sizing, styling, or orders.
              </p>
            </div>

            {/* Circular Touchpoint List (PDF Page 11) */}
            <div className="space-y-4">
              {/* WhatsApp */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5B111A]/10 border border-[#C59B27]/40 text-[#5B111A] flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5 text-[#C59B27]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">WhatsApp</span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">To be confirmed by Tanya</span>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5B111A]/10 border border-[#C59B27]/40 text-[#5B111A] flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-[#C59B27]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Email</span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">To be confirmed by Tanya</span>
                </div>
              </div>

              {/* Instagram */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5B111A]/10 border border-[#C59B27]/40 text-[#5B111A] flex items-center justify-center shrink-0">
                  <Instagram className="w-5 h-5 text-[#C59B27]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Instagram</span>
                  <a
                    href="https://instagram.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm font-semibold text-[#5B111A] hover:underline"
                  >
                    @royal_libas_by_tanya
                  </a>
                </div>
              </div>

              {/* Working Hours */}
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#5B111A]/10 border border-[#C59B27]/40 text-[#5B111A] flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-[#C59B27]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Working Hours</span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">Mon - Sat, 10 AM - 7 PM</span>
                </div>
              </div>
            </div>

            {/* Restrained Contact Form (PDF Page 11) */}
            <div className="pt-4 border-t border-gray-100">
              {submitted ? (
                <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-2">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                  <h3 className="font-serif font-bold text-base text-gray-900">Message Received</h3>
                  <p className="text-xs text-gray-600">
                    Thank you for reaching out. We will connect with you shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs focus:outline-none focus:border-[#5B111A] bg-[#FAF7F2]"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs focus:outline-none focus:border-[#5B111A] bg-[#FAF7F2]"
                    />
                  </div>
                  <textarea
                    required
                    rows={3}
                    placeholder="Message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs focus:outline-none focus:border-[#5B111A] bg-[#FAF7F2]"
                  />
                  <button
                    type="submit"
                    className="w-full py-3 bg-[#5B111A] hover:bg-[#3A080F] text-white text-xs font-ui font-semibold uppercase tracking-wider rounded-lg transition-colors shadow flex items-center justify-center gap-2"
                  >
                    <span>Send Message</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* RIGHT: Editorial Fashion Portrait (lg:col-span-5) (PDF Page 11) */}
          <div className="lg:col-span-5 min-h-[350px] lg:min-h-full bg-gray-100 relative">
            <img
              src="/images/products/maroon_front.jpg"
              alt="Royal Libas Model Editorial Portrait"
              className="w-full h-full object-cover object-center"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
