import React, { useEffect } from 'react';
import { Scale, FileText, CheckCircle2 } from 'lucide-react';

export const TermsOfService: React.FC = () => {
  useEffect(() => {
    document.title = 'Terms of Service | Royal Libas by Tanya';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#FCF8F0] text-gray-800 font-sans page-enter py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
              LEGAL TERMS & CUSTOMER AGREEMENT
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] mt-2">
            Terms of Service
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 max-w-xl mx-auto font-light leading-relaxed">
            Please review these terms before placing an order with our atelier. Transparent boutique guidelines.
          </p>
        </div>

        {/* Quick Highlights Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <CheckCircle2 className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">Authentic Handcrafts</h3>
            <p className="text-xs text-gray-600 font-light">Handmade weaves, gota patti and zari variations are inherent hallmarks of quality.</p>
          </div>
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <Scale className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">Fair Pricing & Taxes</h3>
            <p className="text-xs text-gray-600 font-light">All prices are in Indian Rupees (INR) and inclusive of all applicable statutory taxes.</p>
          </div>
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <FileText className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">COD Verification</h3>
            <p className="text-xs text-gray-600 font-light">COD orders undergo WhatsApp / phone verification prior to dispatch.</p>
          </div>
        </div>

        <div className="bg-white rounded-none border border-[#E8DFD0] p-6 sm:p-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">1. Overview & General Conditions</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              By accessing our website and placing an order with Royal Libas by Tanya, you agree to be bound by these Terms of Service and our associated Shipping, Exchange, and Privacy Policies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">2. Product Descriptions & Color Accuracy</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              We make every effort to display the colors, fabrics, and embroideries of our boutique garments with maximum fidelity. However, as ethnic fabrics involve hand-dyeing, natural light photography, and varied screen calibrations, slight color variations (within acceptable industry tolerances) may occur.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">3. Pricing, Taxes & Authoritative Totals</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              All prices shown on the website are in Indian Rupees (INR) and are inclusive of applicable goods and services taxes. The total calculated by our secure server at checkout is authoritative.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">4. Order Confirmation & COD Verification</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              For Cash on Delivery orders, our boutique team contacts the buyer via WhatsApp or telephone to verify phone number and address accuracy prior to dispatch. Royal Libas reserves the right to decline or cancel orders with unreachable contact details or repeat return history.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">5. Intellectual Property</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              All designs, brand logos, studio photographs, garment silhouettes, and copy on this website are the intellectual property of Royal Libas by Tanya and may not be reproduced, copied, or exploited without express written permission.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">6. Governing Law & Jurisdiction</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              These Terms and any contractual transactions shall be governed by and construed in accordance with the laws of India, and any disputes shall be subject to the exclusive jurisdiction of the competent courts in Jaipur, Rajasthan.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

