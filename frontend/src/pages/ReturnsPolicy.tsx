import React, { useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export const ReturnsPolicy: React.FC = () => {
  useEffect(() => {
    document.title = '7-Day Size Exchange & Return Policy | Royal Libas';
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
              DOORSTEP SIZE ASSURANCE
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] mt-2">
            7-Day Size Exchange & Returns
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 max-w-xl mx-auto font-light leading-relaxed">
            We want every woman to feel radiant and comfortable in Royal Libas. If your set needs a different size, our exchange process is seamless and respectful.
          </p>
        </div>

        {/* Big Assurance Banner */}
        <div className="bg-[#5E1224] text-[#FCF8F0] p-6 sm:p-8 rounded-none shadow-md border border-[#B58A3C]/40 mb-10 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
          <div className="w-16 h-16 rounded-full bg-[#FCF8F0]/10 border border-[#B58A3C] flex items-center justify-center shrink-0">
            <RefreshCw className="w-8 h-8 text-[#B58A3C]" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-xl sm:text-2xl text-[#B58A3C]">
              &ldquo;Size exchange within 7 days, tags intact, subject to stock.&rdquo;
            </h3>
            <p className="text-xs sm:text-sm text-[#FCF8F0]/85 font-light">
              No complicated paperwork. Connect with our concierge and we will arrange your replacement piece with prompt doorstep pickup.
            </p>
          </div>
        </div>

        {/* Policy Details */}
        <div className="bg-white rounded-none border border-[#B58A3C]/40 p-6 sm:p-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">1. Eligibility Criteria for Exchange</h2>
            <div className="space-y-2">
              {[
                'The exchange request must be initiated within 7 calendar days of parcel delivery.',
                'Garment must be unworn, unwashed, unaltered, and free of perfume, makeup, or stains.',
                'All original boutique tags, cloth labels, and spare button envelopes must remain intact and attached.',
                'The garment must be handed back in its original Royal Libas packaging.',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-600 font-light">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">2. How the Exchange Process Works (3 Steps)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-[#FCF8F0] p-4 rounded-none border border-[#E8DFD0] space-y-2">
                <span className="font-bold text-xs text-[#5E1224]">STEP 1</span>
                <h4 className="font-bold text-sm text-gray-900">Message Concierge</h4>
                <p className="text-xs text-gray-600 font-light">
                  Share your Order Code (e.g. RL-2026-XXXX) and the new size you require (XS to XXL).
                </p>
              </div>

              <div className="bg-[#FCF8F0] p-4 rounded-none border border-[#E8DFD0] space-y-2">
                <span className="font-bold text-xs text-[#5E1224]">STEP 2</span>
                <h4 className="font-bold text-sm text-gray-900">Reverse Pickup</h4>
                <p className="text-xs text-gray-600 font-light">
                  Our courier partner collects the existing parcel from your doorstep within 24–48 hours.
                </p>
              </div>

              <div className="bg-[#FCF8F0] p-4 rounded-none border border-[#E8DFD0] space-y-2">
                <span className="font-bold text-xs text-[#5E1224]">STEP 3</span>
                <h4 className="font-bold text-sm text-gray-900">Replacement Dispatched</h4>
                <p className="text-xs text-gray-600 font-light">
                  Once your parcel is picked up, your fresh replacement piece is dispatched with a new tracking link.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">3. What if the requested size is Sold Out?</h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light">
              If your desired size is no longer in stock, you may choose any other available design of equivalent value from the boutique, or opt for full store credit valid for 12 months with no expiry pressure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">4. Non-Exchangeable Items</h2>
            <div className="flex items-start gap-2.5 text-xs sm:text-sm text-amber-800 bg-amber-50 p-4 rounded-none border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Pieces that have undergone customized alteration requests (e.g., custom sleeve adjustment) or marked as final clearance archive sales are not eligible for size exchange.
              </span>
            </div>
          </section>
        </div>

        {/* CTA Concierge Box */}
        <div className="mt-10 text-center bg-white p-8 rounded-none border border-[#B58A3C]/40 shadow-sm space-y-4">
          <h3 className="font-serif text-xl font-bold text-[#5E1224]">
            Need to request an exchange right now?
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto font-light">
            Our team is available Monday to Saturday, 10:00 AM to 7:00 PM IST to assist you with quick doorstep exchanges.
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
