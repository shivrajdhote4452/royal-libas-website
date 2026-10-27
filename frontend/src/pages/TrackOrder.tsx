import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Package,
  Search,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Truck,
  ExternalLink,
  MapPin,
  AlertCircle,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import { trackOrder, formatPrice } from '../lib/api';
import { OrderTrackResponse } from '../types/order';

export const TrackOrder: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [orderCode, setOrderCode] = useState(searchParams.get('order_code') || '');
  const [phone, setPhone] = useState(searchParams.get('phone') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderTrackResponse | null>(null);
  const tokenParam = searchParams.get('token') || '';

  useEffect(() => {
    document.title = 'Track Your Order | Royal Libas by Tanya';
  }, []);

  // Auto-search if query params are present in URL
  useEffect(() => {
    const codeParam = searchParams.get('order_code');
    const phoneParam = searchParams.get('phone');
    if (codeParam) {
      handleSearch(codeParam, phoneParam || '', tokenParam);
    }
  }, [searchParams]);

  const handleSearch = async (code: string, phoneNumber?: string, explicitToken?: string) => {
    const cleanCode = (code || '').trim().toUpperCase();
    const cleanPhone = (phoneNumber || '').trim().replace(/\D/g, '');
    const activeToken = explicitToken || tokenParam || sessionStorage.getItem('rl_order_token') || '';

    // Phone-alone lookup must NOT return order details (privacy protection)
    if (!cleanCode && cleanPhone) {
      setError('Please enter your order reference (e.g. RL-2026-1001) to track your order.');
      setOrder(null);
      return;
    }

    if (!cleanCode) {
      setError('Please enter your order reference (e.g. RL-2026-1001).');
      setOrder(null);
      return;
    }

    // Require mobile number or secure order token for privacy protection
    if (!cleanPhone && !activeToken) {
      setError('To protect your privacy, please enter the 10-digit mobile number used when placing this order.');
      setOrder(null);
      return;
    }

    if (cleanPhone && cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      setOrder(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await trackOrder(cleanCode, cleanPhone || undefined, activeToken || undefined);
      setOrder(data);
    } catch (err: any) {
      setOrder(null);
      setError(
        err.message || 'Order not found. Please check your order reference and mobile number.'
      );
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(orderCode, phone);
  };

  // Helper for tracking progress steps
  const steps = ['PLACED', 'PACKED', 'SHIPPED', 'DELIVERED'];
  const currentStepIndex = order ? steps.indexOf(order.status.toUpperCase()) : -1;
  const isCancelled = order?.status.toUpperCase() === 'CANCELLED';

  return (
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans">
      {/* ========================================================
          1. EDITORIAL BANNER (PDF Page 9)
          "TRACK YOUR ORDER"
          ======================================================== */}
      <section className="bg-[#2B1B1E] text-[#FCF8F0] py-10 sm:py-14 px-4 sm:px-6 lg:px-8 border-b border-[#B58A3C]/30 text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto space-y-2 relative z-10">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#B58A3C] font-semibold">
              REAL-TIME DISPATCH
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FCF8F0]">
            TRACK YOUR ORDER
          </h1>
          <p className="text-xs sm:text-sm text-[#FCF8F0]/80 font-light italic">
            Trace the journey of your handcrafted Royal Libas ensemble.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Lookup Form matching PDF Page 9 */}
        <div className="bg-white p-6 sm:p-8 rounded-none border border-[#B58A3C]/40 shadow-sm mb-10">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
            <Package className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-lg text-[#2B1B1E]">
              Order Reference Lookup
            </h2>
          </div>

          <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Order Reference <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. RL-2026-1001"
                value={orderCode}
                onChange={(e) => setOrderCode(e.target.value.toUpperCase())}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-none border border-gray-300 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224] font-mono uppercase placeholder:font-sans placeholder:normal-case"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Registered Mobile <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs sm:text-sm text-gray-400 font-medium">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-11 pr-3.5 py-2.5 text-xs sm:text-sm rounded-none border border-gray-300 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#5E1224] hover:bg-[#3A080F] disabled:bg-gray-400 text-[#FCF8F0] font-ui font-semibold text-xs sm:text-sm uppercase tracking-[0.2em] rounded-none transition-colors shadow flex items-center justify-center gap-2 h-[42px]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Track</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-[11px] text-gray-500">
            <ShieldCheck className="w-3.5 h-3.5 text-[#B58A3C] shrink-0" />
            <span>Order reference lookup is protected by secure privacy verification.</span>
          </div>
        </div>

      {/* Error Message */}
      {error && (
        <div className="mb-8 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Order Lookup Failed</p>
            <p className="mt-0.5 text-red-700 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Order Tracking Result */}
      {order && (
        <div className="space-y-6 animate-fadeIn">
          {/* Status Banner */}
          <div className="bg-white p-6 sm:p-8 rounded-none border border-[#E8DFD0] shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
              <div>
                <span className="text-xs text-gray-500 font-medium">Order Reference:</span>
                <h2 className="font-mono text-lg sm:text-xl font-bold text-[#5E1224]">
                  {order.order_code}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Placed on {new Date(order.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-3.5 py-1.5 rounded-none text-xs font-bold uppercase tracking-wider border ${
                    isCancelled
                      ? 'bg-red-50 text-red-800 border-red-200'
                      : order.status === 'DELIVERED'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : order.status === 'SHIPPED'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  Status: {order.status}
                </span>
              </div>
            </div>

            {/* Vertical Status Timeline matching PDF Page 8 & 9 */}
            {!isCancelled ? (
              <div className="py-4 max-w-md mx-auto">
                <div className="space-y-6 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-gray-200">
                  {[
                    { key: 'PLACED', title: 'Order Placed', subtitle: new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) },
                    { key: 'PACKED', title: 'Packed', subtitle: currentStepIndex >= 1 ? 'Packed & quality checked at atelier' : 'Processing in boutique' },
                    { key: 'SHIPPED', title: 'Shipped', subtitle: order.tracking_url ? `Delivery AWB: ${order.tracking_url}` : currentStepIndex >= 2 ? 'In transit with courier partner' : 'Awaiting courier pickup' },
                    { key: 'OUT_FOR_DELIVERY', title: 'Out for Delivery', subtitle: currentStepIndex >= 3 ? 'Courier out for doorstep delivery' : 'Expected soon' },
                    { key: 'DELIVERED', title: 'Delivered', subtitle: currentStepIndex >= 4 ? 'Delivered successfully' : 'Delivery in 3–5 business days' },
                  ].map((step, idx) => {
                    const isPassed = currentStepIndex >= Math.min(idx, 3);
                    return (
                      <div key={step.key} className="relative flex items-start gap-4">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 transition-colors shadow-sm ${
                            isPassed
                              ? 'bg-[#5E1224] text-white ring-4 ring-white'
                              : 'bg-white border-2 border-gray-300 text-gray-400'
                          }`}
                        >
                          {isPassed ? <CheckCircle2 className="w-4 h-4 text-[#B58A3C]" /> : <span className="w-2 h-2 rounded-full bg-gray-300" />}
                        </div>
                        <div className="pt-0.5">
                          <h4 className={`text-xs sm:text-sm font-bold ${isPassed ? 'text-gray-900' : 'text-gray-400'}`}>
                            {step.title}
                          </h4>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {step.subtitle}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-red-50 border border-red-200 rounded-none text-center text-xs text-red-800 font-medium">
                This order was cancelled. If you need details or a refund update, please contact our concierge below.
              </div>
            )}

            {/* Courier Tracking Action (When Shipped or Delivered) */}
            {(order.tracking_url || order.awb_code) && (
              <div className="p-4 bg-[#FCF8F0] rounded-none border border-[#E8DFD0] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-900">
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-[#B58A3C]" />
                      <span>Courier Partner: {order.courier_name || 'Standard Courier'}</span>
                    </div>
                    {order.awb_code && (
                      <span className="bg-white px-2 py-0.5 rounded-none border border-[#E8DFD0] font-mono text-[11px] text-[#5E1224]">
                        AWB: {order.awb_code}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600">
                    Your shipment is in transit. Click below to view live GPS tracking on the carrier network.
                  </p>
                </div>

                {order.tracking_url && (
                  <a
                    href={order.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-semibold rounded-none shadow transition-colors shrink-0"
                  >
                    <span>Track on Courier Site</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Delivery & Items Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Delivery Destination */}
            {(order.delivery_city || order.address) && (
              <div className="bg-white p-5 rounded-none border border-[#E8DFD0] shadow-sm space-y-2.5">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2 text-xs font-bold text-gray-900">
                  <MapPin className="w-4 h-4 text-[#B58A3C]" />
                  <span>Delivery Destination</span>
                </div>
                <div className="text-xs text-gray-700 space-y-1">
                  <p className="font-semibold text-gray-900">{order.customer_name || order.address?.name}</p>
                  <p className="text-gray-600">
                    {order.delivery_city || order.address?.city}, {order.delivery_state || order.address?.state} — {order.delivery_pincode || order.address?.pincode}
                  </p>
                  <p className="text-gray-500 pt-1">
                    Contact: {order.phone_masked || (order.address?.phone ? `+91 ${order.address.phone}` : '')}
                  </p>
                  <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-gray-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#B58A3C]" />
                    <span>Exact street address is masked for customer privacy.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment & Amount */}
            <div className="bg-white p-5 rounded-none border border-[#E8DFD0] shadow-sm space-y-2.5">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2 text-xs font-bold text-gray-900">
                <Clock className="w-4 h-4 text-[#B58A3C]" />
                <span>Payment & Charges</span>
              </div>
              <div className="text-xs space-y-1.5 text-gray-600">
                <div className="flex justify-between">
                  <span>Payment Mode:</span>
                  <span className="font-medium text-gray-900">
                    {order.payment_method === 'PREPAID' ? 'Online (Prepaid)' : 'Cash on Delivery (COD)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Status:</span>
                  <span className="font-bold text-gray-800">{order.payment_status}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-1.5 font-bold text-gray-900">
                  <span>Total Amount:</span>
                  <span className="font-serif text-sm text-[#5E1224]">
                    {formatPrice(order.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Items In Order */}
          <div className="bg-white p-5 rounded-none border border-[#E8DFD0] shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2 text-xs font-bold text-gray-900">
              <Package className="w-4 h-4 text-[#B58A3C]" />
              <span>Items in this Order ({order.items.length})</span>
            </div>
            <div className="divide-y divide-gray-100">
              {order.items.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-gray-900">{item.product_name_snapshot}</p>
                    <p className="text-gray-500 text-[11px]">
                      Size: <strong>{item.size_snapshot}</strong> | Qty: {item.quantity}
                    </p>
                  </div>
                  <span className="font-bold text-[#5E1224]">
                    {formatPrice(item.line_total)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Support Banner */}
          <div className="p-4 bg-[#FCF8F0] rounded-none border border-[#E8DFD0] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-700">
            <div className="flex items-center gap-2 text-center sm:text-left">
              <MessageCircle className="w-4 h-4 text-[#B58A3C] shrink-0" />
              <span>Have questions about sizing, delivery or exchanges?</span>
            </div>
            <a
              href="https://wa.me/919876543210"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] font-semibold rounded-none shadow transition-colors flex items-center gap-1.5 text-xs shrink-0"
            >
              <span>WhatsApp Concierge</span>
            </a>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
