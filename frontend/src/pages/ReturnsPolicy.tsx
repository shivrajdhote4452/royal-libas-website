import React, { useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import { setMetaDescription, ROUTE_METADATA } from '../lib/seo';

export const ReturnsPolicy: React.FC = () => {
  useEffect(() => {
    document.title = ROUTE_METADATA['/return-policy'].title;
    setMetaDescription(ROUTE_METADATA['/return-policy'].description);
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#FCF8F0] text-gray-800 font-sans page-enter py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
              ATELIER POLICY &amp; CRAFTSMANSHIP
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] mt-2">
            Returns &amp; Exchange Policy
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 max-w-xl mx-auto font-light leading-relaxed">
            Royal Libas by Tanya operates under a strict <strong>No Returns and No Exchanges</strong> policy. Each creation is an artisanal handcrafted piece produced with delicate embroideries and premium textiles. All sales are final.
          </p>
        </div>

        {/* Big Assurance Banner */}
        <div className="bg-[#5E1224] text-[#FCF8F0] p-6 sm:p-8 rounded-none shadow-md border border-[#B58A3C]/40 mb-10 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
          <div className="w-16 h-16 rounded-full bg-[#FCF8F0]/10 border border-[#B58A3C] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-8 h-8 text-[#B58A3C]" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-xl sm:text-2xl text-[#B58A3C]">
              &ldquo;Strict Boutique Policy: No returns or exchanges.&rdquo;
            </h3>
            <p className="text-xs sm:text-sm text-[#FCF8F0]/85 font-light">
              Every garment undergoes rigorous multi-point inspection for fabric integrity, embroidery accuracy, and sizing precision before dispatch.
            </p>
          </div>
        </div>

        {/* Policy Details */}
        <div className="bg-white rounded-none border border-[#B58A3C]/40 p-6 sm:p-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">1. All Sales Are Final</h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
              We operate under a clear <strong>no returns and no exchanges</strong> policy. Once an order is placed and confirmed, items cannot be returned, exchanged, or refunded for cash or store credit.
            </p>
            <div className="space-y-2 pt-1">
              {[
                'No returns or exchanges are accepted across any collection or category.',
                'Garments cannot be exchanged for a different size, colour, or design after purchase.',
                'Customized, altered, or special-order pieces are strictly final sale.',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-600 font-light">
                  <CheckCircle2 className="w-4 h-4 text-[#B58A3C] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">2. Sizing &amp; Fit Assistance</h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
              To guarantee complete satisfaction with your fit, comprehensive size charts and measurement guidelines are provided on every product page. If you are uncertain about sizing, chest fit, or length, please connect with our boutique concierge on WhatsApp before placing your order.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">3. Damaged, Defective, or Incorrect Deliveries</h2>
            <div className="flex items-start gap-2.5 text-xs sm:text-sm text-amber-900 bg-amber-50 p-4 rounded-none border border-amber-200 leading-relaxed">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-900">Reporting Transit or Defect Issues:</p>
                <p className="text-xs text-amber-800 font-light">
                  In the rare event that your package arrives visibly damaged, tampered with, or contains an incorrect item, please contact our concierge team within 24 hours of delivery. To facilitate review, an unedited parcel unboxing video showing the outer shipping label and inner contents is required.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">4. Order Cancellation Window</h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
              Orders may be cancelled within 2 hours of placement, prior to atelier processing and fulfillment handover. Once an order enters preparation or dispatch, it cannot be cancelled or modified.
            </p>
          </section>
        </div>

        {/* CTA Concierge Box */}
        <div className="mt-10 text-center bg-white p-8 rounded-none border border-[#B58A3C]/40 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#FCF8F0] border border-[#B58A3C]/40 flex items-center justify-center mx-auto text-[#5E1224]">
            <MessageCircle className="w-6 h-6 text-[#B58A3C]" />
          </div>
          <h3 className="font-serif text-xl font-bold text-[#5E1224]">
            Have questions before ordering?
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto font-light">
            Our atelier team is available Monday to Saturday, 10:00 AM to 7:00 PM IST to assist you with sizing, fabric details, and styling advice.
          </p>
          <div className="pt-2">
            <a
              href="https://wa.me/919876543210"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-6 py-2.5 rounded-none bg-[#5E1224] text-[#FCF8F0] font-ui font-semibold text-xs uppercase tracking-[0.2em] hover:bg-[#3A080F] transition-all shadow"
            >
              WhatsApp Concierge
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
