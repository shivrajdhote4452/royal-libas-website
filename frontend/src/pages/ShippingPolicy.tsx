import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Clock, ShieldCheck, Search } from 'lucide-react';

export const ShippingPolicy: React.FC = () => {
  useEffect(() => {
    document.title = 'Shipping & Delivery Policy | Royal Libas by Tanya';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-gray-800 py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
            Careful Dispatch & Pan-India Courier
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5B111A] mt-2">
            Shipping & Delivery Policy
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-2 max-w-xl mx-auto">
            Every Royal Libas garment is hand-inspected, steam-pressed, and packed with care in our Jaipur atelier before dispatch.
          </p>
        </div>

        {/* Quick Highlights Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <Clock className="w-8 h-8 text-[#C59B27] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">24–48 Hour Dispatch</h3>
            <p className="text-xs text-gray-600">In-stock orders leave our studio within 1–2 business days.</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <Truck className="w-8 h-8 text-[#C59B27] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">3–5 Business Days</h3>
            <p className="text-xs text-gray-600">Fast express delivery to all tier-1 & tier-2 cities across India.</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-[#C59B27] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">Free Prepaid Delivery</h3>
            <p className="text-xs text-gray-600">Zero shipping fee on all prepaid UPI and card payments.</p>
          </div>
        </div>

        {/* Policy Body */}
        <div className="bg-white rounded-2xl border border-[#E8DFD0] p-6 sm:p-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">1. Shipping Charges & Payment Modes</h2>
            <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-gray-600">
              <li>
                <strong>Prepaid Orders (UPI, NetBanking, Credit/Debit Cards):</strong> <strong>FREE Express Shipping</strong> across all pincodes in India.
              </li>
              <li>
                <strong>Cash on Delivery (COD) Orders:</strong> A flat handling and verification charge of <strong>₹99</strong> is added to the subtotal.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">2. Delivery Timelines & Tracking</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Orders placed before 2:00 PM IST on working days are processed the very same day. Once your package is scanned by our courier partner, you receive an automatic WhatsApp and SMS update with your tracking code.
            </p>
            <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#E8DFD0] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="font-bold text-xs text-gray-900">Already placed an order?</p>
                <p className="text-xs text-gray-600">Track your parcel journey in real time with your phone number and order code.</p>
              </div>
              <Link
                to="/track-order"
                className="shrink-0 inline-flex items-center px-4 py-2 rounded bg-[#5B111A] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#480B13] transition-colors"
              >
                <Search className="w-3.5 h-3.5 mr-1.5" />
                Track My Order
              </Link>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">3. Trusted Courier Partners</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              We partner with India's most dependable express logistics networks including <strong>Delhivery Express</strong>, <strong>BlueDart</strong>, and <strong>DTDC Air</strong> to ensure secure doorstep delivery and careful transit handling.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">4. Tamper-Proof Packaging</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Every garment is packed in protective boutique garment pouches inside a sturdy, tamper-sealed shipping box. If your parcel arrives unsealed or visibly damaged, please refuse delivery and immediately message us on WhatsApp with photos.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5B111A]">5. Delays & Unforeseen Events</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              While 98% of our orders reach within 3–5 business days, occasional delays may occur during regional festivals, national holidays, or extreme weather conditions. Our team monitors every in-transit shipment proactively.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
