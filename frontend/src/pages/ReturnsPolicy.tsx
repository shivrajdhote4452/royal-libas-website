import React, { useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export const ReturnsPolicy: React.FC = () => {
  useEffect(() => {
    document.title = '7-Day Size Exchange & Return Policy | Royal Libas';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-gray-800 py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
            Our Sizing Guarantee
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5B111A] mt-2">
            7-Day Size Exchange & Returns
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-2 max-w-xl mx-auto">
            We want every woman to feel radiant and comfortable in Royal Libas. If your set needs a different size, our exchange process is seamless and respectful.
          </p>
        </div>

        {/* Big Assurance Banner */}
        <div className="bg-[#5B111A] text-white p-6 sm:p-8 rounded-2xl shadow-md border border-[#C59B27]/40 mb-10 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
          <div className="w-16 h-16 rounded-full bg-[#FAF7F2]/10 border border-[#C59B27] flex items-center justify-center shrink-0">
            <RefreshCw className="w-8 h-8 text-[#C59B27]" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-xl sm:text-2xl text-[#EAD186]">
              "Size exchange within 7 days, tags intact, subject to stock."
            </h3>
            <p className="text-xs sm:text-sm text-white/80">
              No endless forms, no interrogation. Message our concierge on WhatsApp and we will dispatch your replacement piece promptly.
            </p>
          </div>
        </div>

        {/* Policy Details */}
        <div className="bg-white rounded-2xl border border-[#E8DFD0] p-6 sm:p-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">1. Eligibility Criteria for Exchange</h2>
            <div className="space-y-2">
              {[
                'The exchange request must be initiated within 7 calendar days of parcel delivery.',
                'Garment must be unworn, unwashed, unaltered, and free of perfume, makeup, or stains.',
                'All original boutique tags, cloth labels, and spare button envelopes must remain intact and attached.',
                'The garment must be handed back in its original Royal Libas packaging.',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">2. How the Exchange Process Works (3 Steps)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#E8DFD0] space-y-2">
                <span className="font-bold text-xs text-[#5B111A]">STEP 1</span>
                <h4 className="font-bold text-sm text-gray-900">Message on WhatsApp</h4>
                <p className="text-xs text-gray-600">
                  Share your Order Code (e.g. RL-2026-XXXX) and the new size you require (XS to XXL).
                </p>
              </div>

              <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#E8DFD0] space-y-2">
                <span className="font-bold text-xs text-[#5B111A]">STEP 2</span>
                <h4 className="font-bold text-sm text-gray-900">Reverse Pickup</h4>
                <p className="text-xs text-gray-600">
                  Our courier partner collects the existing parcel from your doorstep within 24–48 hours.
                </p>
              </div>

              <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#E8DFD0] space-y-2">
                <span className="font-bold text-xs text-[#5B111A]">STEP 3</span>
                <h4 className="font-bold text-sm text-gray-900">Replacement Dispatched</h4>
                <p className="text-xs text-gray-600">
                  Once your parcel is picked up, your fresh replacement piece is dispatched with a new tracking link.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">3. What if the requested size is Sold Out?</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              If your desired size is no longer in stock, you may choose any other available design of equivalent value from the boutique, or opt for full store credit valid for 12 months with no expiry pressure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">4. Non-Exchangeable Items</h2>
            <div className="flex items-start gap-2.5 text-xs sm:text-sm text-amber-800 bg-amber-50 p-4 rounded-xl border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Pieces that have undergone customized alteration requests (e.g., custom kurti sleeve adjustment) or marked as "Final Clearance Archive Sale" are not eligible for size exchange or return.
              </span>
            </div>
          </section>
        </div>

        {/* CTA Concierge Box */}
        <div className="mt-10 text-center bg-white p-8 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <h3 className="font-serif text-xl font-bold text-[#5B111A]">
            Need to request an exchange right now?
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
            Our team is available Monday to Saturday, 10:30 AM to 7:30 PM to assist you with quick doorstep exchanges.
          </p>
          <p className="text-xs font-medium text-gray-500">
            WhatsApp Concierge: <span className="font-semibold text-gray-700">To be confirmed by Tanya</span>
          </p>
        </div>
      </div>
    </div>
  );
};
