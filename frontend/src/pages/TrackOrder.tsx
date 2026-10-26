import React, { useState } from 'react';
import { Package, Search, ShieldCheck } from 'lucide-react';

export const TrackOrder: React.FC = () => {
  const [orderCode, setOrderCode] = useState('');
  const [phone, setPhone] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(true);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-14 sm:py-20 min-h-[70vh] flex flex-col justify-center">
      <div className="bg-white p-6 sm:p-10 rounded-xl border border-[#E8DFD0] shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-[#FAF7F2] border border-[#E8DFD0] text-[#5B111A] flex items-center justify-center mx-auto mb-4">
          <Package className="w-7 h-7 text-[#C59B27]" />
        </div>
        <span className="text-xs uppercase tracking-widest font-bold text-[#C59B27]">
          Live Tracking
        </span>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mt-1 mb-2">
          Track Your Order
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 mb-6">
          Enter your unique order code and 10-digit mobile number to check dispatch and courier tracking.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">
              Order Code
            </label>
            <input
              type="text"
              placeholder="e.g. RL-2026-1001"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              className="w-full text-xs sm:text-sm px-4 py-2.5 rounded border border-[#E8DFD0] focus:outline-none focus:ring-1 focus:ring-[#5B111A] bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-xs sm:text-sm px-4 py-2.5 rounded border border-[#E8DFD0] focus:outline-none focus:ring-1 focus:ring-[#5B111A] bg-white"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#5B111A] hover:bg-[#3A080F] text-white font-semibold text-xs sm:text-sm uppercase tracking-wider rounded transition-colors shadow flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            Track Shipment
          </button>
        </form>

        {searched && (
          <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 text-center">
            <p className="font-bold mb-1">Phase 3 Scaffold Notice</p>
            <p>
              Order tracking logic and courier integration are scheduled for <strong>Phase 5</strong> per the plan once orders are placed in Phase 4.
            </p>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="w-4 h-4 text-[#C59B27]" />
          <span>Tracking requires both phone number and order code for customer privacy.</span>
        </div>
      </div>
    </div>
  );
};
