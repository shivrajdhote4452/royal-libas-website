import React, { useEffect } from 'react';

export const PrivacyPolicy: React.FC = () => {
  useEffect(() => {
    document.title = 'Privacy Policy | Royal Libas by Tanya';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-gray-800 py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
            Trust & Data Protection
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5B111A] mt-2">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-2 max-w-xl mx-auto">
            Last Updated: November 2026. How Royal Libas safeguards your personal data.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E8DFD0] p-6 sm:p-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">1. Commitment to Customer Privacy</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              At Royal Libas by Tanya ("we", "our", or "us"), we value your privacy and trust. We do not sell, rent, trade, or broadcast your personal data to any third-party marketing brokers or advertisers. We operate with guest checkouts specifically so you are never forced to maintain complex accounts.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">2. Information We Collect</h2>
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
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">3. Payment Security & Zero Card Storage</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              All electronic payments are processed directly through <strong>Razorpay</strong>, which is certified under <strong>PCI-DSS Level 1</strong> (the highest global standard in banking payment security). Royal Libas never accesses, transmits, or stores your credit card numbers, debit card PINs, CVV codes, or UPI passwords on our servers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">4. Courier Sharing & Order Notifications</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Your name, shipping address, and phone number are shared solely with our authorized courier logistics partners (e.g. Delhivery, BlueDart) to facilitate package delivery, doorstep verification, and real-time tracking updates via SMS or WhatsApp.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">5. Your Rights & Data Inquiries</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Under India's Digital Personal Data Protection Act 2023, you have the right to request review or deletion of your historical order contact record once dispatch and statutory accounting retention periods expire. Write to us at <code>care@royallibas.com</code> for any data privacy inquiries.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
