import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Clock, ShieldCheck, Search } from 'lucide-react';

export const ShippingPolicy: React.FC = () => {
  useEffect(() => {
    document.title = 'Shipping & Delivery Policy | Royal Libas by Tanya';
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
              PAN-INDIA COURIER DISPATCH
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] mt-2">
            Shipping & Delivery Policy
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 max-w-xl mx-auto font-light leading-relaxed">
            Every Royal Libas garment is hand-inspected, steam-pressed, and packed with care in our atelier before dispatch.
          </p>
        </div>

        {/* Quick Highlights Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <Clock className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">24–48 Hour Dispatch</h3>
            <p className="text-xs text-gray-600 font-light">In-stock orders leave our studio within 1–2 business days.</p>
          </div>
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <Truck className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">3–5 Business Days</h3>
            <p className="text-xs text-gray-600 font-light">Fast express delivery to all tier-1 & tier-2 cities across India.</p>
          </div>
          <div className="bg-white p-6 rounded-none border border-[#E8DFD0] shadow-sm text-center space-y-2">
            <ShieldCheck className="w-7 h-7 text-[#B58A3C] mx-auto" />
            <h3 className="font-serif font-bold text-gray-900 text-sm">Free Prepaid Delivery</h3>
            <p className="text-xs text-gray-600 font-light">Zero shipping fee on all prepaid UPI and card payments.</p>
          </div>
        </div>

        {/* Policy Body */}
        <div className="bg-white rounded-none border border-[#B58A3C]/40 p-6 sm:p-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">1. Shipping Charges & Payment Modes</h2>
            <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-gray-600 font-light">
              <li>
                <strong>Prepaid Orders (UPI, NetBanking, Credit/Debit Cards):</strong> <strong>FREE Express Shipping</strong> across all pincodes in India.
              </li>
              <li>
                <strong>Cash on Delivery (COD) Orders:</strong> Free on orders meeting the boutique threshold, or a nominal delivery fee of <strong>₹99</strong>.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">2. Delivery Timelines & Tracking</h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light">
              Orders placed before 2:00 PM IST on working days are processed the very same day. Once your package is scanned by our courier partner, you receive an automatic WhatsApp and SMS update with your live tracking code.
            </p>
            <div className="bg-[#FCF8F0] p-4 rounded-none border border-[#E8DFD0] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="font-bold text-xs text-gray-900">Already placed an order?</p>
                <p className="text-xs text-gray-600 font-light">Track your parcel journey in real time with your order reference.</p>
              </div>
              <Link
                to="/track-order"
                className="shrink-0 inline-flex items-center px-5 py-2.5 rounded-none bg-[#5E1224] text-[#FCF8F0] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#3A080F] transition-colors shadow"
              >
                <Search className="w-3.5 h-3.5 mr-1.5" />
                Track My Order
              </Link>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">3. Trusted Courier Partners</h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light">
              We partner with India's most dependable express logistics networks including <strong>Delhivery Express</strong>, <strong>BlueDart</strong>, and <strong>DTDC Air</strong> to ensure secure doorstep delivery and careful transit handling.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">4. Tamper-Proof Packaging</h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light">
              Every garment is packed in protective boutique garment pouches inside a sturdy, tamper-sealed shipping box. If your parcel arrives unsealed or visibly damaged, please refuse delivery and immediately message our concierge with photos.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#5E1224]">5. Delays & Unforeseen Events</h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light">
              While 98% of our orders reach within 3–5 business days, occasional delays may occur during regional festivals, national holidays, or extreme weather conditions. Our team monitors every in-transit shipment proactively.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
