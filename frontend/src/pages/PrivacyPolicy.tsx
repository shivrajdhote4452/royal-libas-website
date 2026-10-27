import React, { useEffect } from 'react';
import { ShieldCheck, Lock, EyeOff } from 'lucide-react';

export const PrivacyPolicy: React.FC = () => {
  useEffect(() => {
    document.title = 'Privacy Policy | Royal Libas by Tanya';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#FCF8F0] text-gray-800 font-sans page-enter py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
              TRUST & DATA PROTECTION
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] mt-2">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 max-w-xl mx-auto font-light leading-relaxed">
            How Royal Libas safeguards your personal data with guest checkout simplicity and zero card storage.
          </p>
        </div>

        {/* Quick Highlights Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <Lock className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">Zero Card Storage</h3>
            <p className="text-xs text-gray-600 font-light">Payments processed via secure gateways. We never store card or PIN details.</p>
          </div>
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <EyeOff className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">No Third-Party Brokers</h3>
            <p className="text-xs text-gray-600 font-light">Your phone number and address are never sold or rented to advertisers.</p>
          </div>
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <ShieldCheck className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">Fulfillment Only</h3>
            <p className="text-xs text-gray-600 font-light">Information used solely for dispatch, courier delivery, and customer care.</p>
          </div>
        </div>

        <div className="bg-white rounded-none border border-[#E8DFD0] p-6 sm:p-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">1. Commitment to Customer Privacy</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              At Royal Libas by Tanya ("we", "our", or "us"), we value your privacy and trust. We do not sell, rent, trade, or broadcast your personal data to any third-party marketing brokers or advertisers. We operate with guest checkouts specifically so you are never forced to maintain complex accounts.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">2. Information We Collect</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              When you place an order on our shop, we collect only the necessary fulfillment details:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-gray-600">
              <li><strong>Contact Details:</strong> Your name, Indian mobile telephone number, and delivery address.</li>
              <li><strong>Order Data:</strong> Selected designs, sizes, quantities, and chosen payment method (Prepaid or COD).</li>
              <li><strong>Tracking Key:</strong> Your phone number acts as the secure verification key for order tracking on <code>/track-order</code>.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">3. Payment Security & Zero Card Storage</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              All electronic payments are processed directly through official payment gateway partners. Royal Libas never accesses, transmits, or stores your credit card numbers, debit card PINs, CVV codes, or UPI passwords on our servers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">4. Courier Sharing & Order Notifications</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Your name, shipping address, and phone number are shared solely with our courier logistics partners to facilitate package delivery, doorstep verification, and tracking updates.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">5. Your Rights & Data Inquiries</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Under applicable Indian privacy regulations, you have the right to request review or deletion of your historical order record once delivery and statutory periods expire. For inquiries, reach out through our official Contact page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

