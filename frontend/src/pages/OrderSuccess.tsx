import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Package,
  Truck,
  MapPin,
  Calendar,
  MessageCircle,
  ShoppingBag,
  Clock,
  CreditCard,
  Loader2,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { fetchOrderByCode, formatPrice } from '../lib/api';
import { OrderResponse } from '../types/order';

export const OrderSuccess: React.FC = () => {
  const { orderCode } = useParams<{ orderCode: string }>();
  const { clearCart } = useCart();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Clear cart upon arriving on confirmed order success page
    clearCart();

    if (!orderCode) {
      setError('Order code missing from URL.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    fetchOrderByCode(orderCode)
      .then((data) => {
        if (isMounted) {
          setOrder(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unable to load order details.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [orderCode]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-[#5B111A] animate-spin" />
        <p className="font-serif text-gray-700 text-sm">Retrieving your order confirmation...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-md mx-auto my-16 p-6 bg-white rounded-lg border border-red-200 text-center space-y-4">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
          !
        </div>
        <h2 className="font-serif text-xl font-bold text-gray-900">Order Not Found</h2>
        <p className="text-xs text-gray-600">{error || 'Could not find the requested order.'}</p>
        <Link
          to="/shop"
          className="inline-block px-6 py-2.5 bg-[#5B111A] text-white rounded text-xs font-semibold"
        >
          Return to Shop
        </Link>
      </div>
    );
  }

  const isPaid = order.payment_status === 'PAID';
  const isCOD = order.payment_method === 'COD';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 min-h-screen">
      {/* Top Success Banner */}
      <div className="bg-white p-6 sm:p-10 rounded-xl border border-[#E8DFD0] shadow-sm text-center space-y-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div>
          <span className="text-xs uppercase tracking-widest font-bold text-[#C59B27]">
            Thank You for Shopping with Us
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
            Order Confirmed!
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-2 max-w-md mx-auto">
            Your order has been received and scheduled for dispatch. We have noted your order under reference:
          </p>
          <div className="inline-block mt-3 px-4 py-2 bg-[#FAF7F2] border border-[#E8DFD0] rounded font-mono font-bold text-[#5B111A] text-base sm:text-lg">
            {order.order_code}
          </div>
        </div>

        {/* Status Pill */}
        <div className="pt-2 flex justify-center gap-3 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              isPaid
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : isCOD
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-blue-50 text-blue-800 border-blue-300'
            }`}
          >
            {isPaid ? (
              <>
                <CreditCard className="w-3.5 h-3.5" />
                <span>Prepaid & Verified (PAID)</span>
              </>
            ) : isCOD ? (
              <>
                <Truck className="w-3.5 h-3.5" />
                <span>Cash on Delivery (Pending Payment)</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5" />
                <span>Order Status: {order.status}</span>
              </>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-8">
        {/* Delivery Timeline & Address */}
        <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Truck className="w-5 h-5 text-[#C59B27]" />
            <h2 className="font-serif font-bold text-base text-gray-900">
              Delivery Information
            </h2>
          </div>

          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex items-start gap-2.5 text-gray-700">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-gray-900">{order.address.name}</p>
                <p className="text-gray-600 leading-relaxed">
                  {order.address.line1}
                  {order.address.line2 ? `, ${order.address.line2}` : ''}
                </p>
                <p className="text-gray-600">
                  {order.address.city}, {order.address.state} — {order.address.pincode}
                </p>
                <p className="text-gray-500 mt-1">Phone: +91 {order.address.phone}</p>
              </div>
            </div>

            <div className="p-3 bg-[#FAF7F2] rounded border border-[#E8DFD0] flex items-center gap-2.5 text-xs text-gray-700">
              <Calendar className="w-4 h-4 text-[#C59B27] shrink-0" />
              <div>
                <span className="font-semibold text-gray-900">Estimated Delivery:</span> 4 to 6 business days.
              </div>
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <CreditCard className="w-5 h-5 text-[#C59B27]" />
            <h2 className="font-serif font-bold text-base text-gray-900">
              Payment Breakdown
            </h2>
          </div>

          <div className="space-y-2 text-xs sm:text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Payment Mode</span>
              <span className="font-semibold text-gray-900">
                {order.payment_method === 'PREPAID' ? 'Online (Prepaid)' : 'Cash on Delivery (COD)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Items Subtotal</span>
              <span className="font-medium text-gray-900">{formatPrice(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Promotional Discount</span>
                <span>-{formatPrice(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Shipping Fee</span>
              <span>
                {order.shipping_charge === 0 ? (
                  <span className="text-emerald-700 font-semibold">FREE</span>
                ) : (
                  formatPrice(order.shipping_charge)
                )}
              </span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between items-baseline font-bold text-gray-900">
              <span className="text-sm">Total {isPaid ? 'Paid' : 'Payable'}</span>
              <span className="font-serif text-lg text-[#5B111A]">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ordered Items Table */}
      <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-4 mb-8">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <Package className="w-5 h-5 text-[#C59B27]" />
          <h2 className="font-serif font-bold text-base text-gray-900">
            Items in This Order ({order.items.length})
          </h2>
        </div>

        <div className="divide-y divide-gray-100">
          {order.items.map((item) => (
            <div key={item.id} className="py-3.5 flex items-center justify-between gap-4 text-xs sm:text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">
                  {item.product_name_snapshot}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  Size: <strong className="text-gray-700">{item.size_snapshot}</strong>
                  {item.colour_snapshot ? ` | Colour: ${item.colour_snapshot}` : ''} | Qty: {item.quantity}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-[#5B111A]">{formatPrice(item.line_total)}</p>
                <p className="text-[11px] text-gray-400">
                  ({formatPrice(item.unit_price_snapshot)} each)
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Support & Action */}
      <div className="bg-[#FAF7F2] p-6 rounded-xl border border-[#E8DFD0] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div>
          <h3 className="font-serif font-bold text-sm text-gray-900 flex items-center justify-center sm:justify-start gap-1.5">
            <MessageCircle className="w-4 h-4 text-[#C59B27]" />
            <span>Need Assistance with Your Order?</span>
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            Our Tanya boutique concierge is available on WhatsApp at +91 98765 43210.
          </p>
        </div>

        <Link
          to="/shop"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#5B111A] hover:bg-[#3A080F] text-white rounded text-xs font-semibold uppercase tracking-wider transition-colors shadow"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Continue Shopping</span>
        </Link>
      </div>
    </div>
  );
};
