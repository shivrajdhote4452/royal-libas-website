import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2,
  ArrowRight,
  Check,
  Clock
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { fetchOrderByCode, fetchProducts } from '../lib/api';
import { OrderResponse } from '../types/order';
import { Product } from '../types/product';
import { ProductCard } from '../components/ProductCard';

export const OrderSuccess: React.FC = () => {
  const { orderCode } = useParams<{ orderCode: string }>();
  const { clearCart } = useCart();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
          const isPending = data.payment_method === 'PREPAID' && data.payment_status !== 'PAID';
          document.title = isPending
            ? `Payment Pending: ${data.order_code} | Royal Libas`
            : `Order Placed Successfully: ${data.order_code} | Royal Libas`;
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unable to load order details.');
          setLoading(false);
        }
      });

    fetchProducts({})
      .then((items) => {
        if (isMounted) setRecommended(items.slice(0, 4));
      })
      .catch(() => {});

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

  const isPrepaidPending = order.payment_method === 'PREPAID' && order.payment_status !== 'PAID';

  return (
    <div className="min-h-screen bg-[#FAF7F2] page-enter font-sans py-10 sm:py-16 px-4 sm:px-6 lg:px-8">
      {/* ========================================================
          1. SUCCESS CARD MATCHING PDF PAGE 7
          ======================================================== */}
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-[#E8DFD0] shadow-sm p-8 sm:p-12 text-center space-y-6">
        {isPrepaidPending ? (
          <>
            {/* Pending Verification Icon */}
            <div className="w-20 h-20 rounded-full bg-amber-50 border-4 border-amber-400 flex items-center justify-center mx-auto shadow-md">
              <Clock className="w-10 h-10 text-amber-700 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-100 text-amber-900">
                Payment pending verification
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A]">
                Payment Verification in Progress
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
                We have received your order details and are waiting for payment confirmation from Cashfree. Your order will be confirmed once payment is verified.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Gold Medallion Checkmark */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#5B111A] to-[#8E1C2B] border-4 border-[#C59B27] flex items-center justify-center mx-auto shadow-lg relative">
              <div className="absolute inset-0 rounded-full border border-amber-300/40 animate-pulse" />
              <Check className="w-10 h-10 text-[#EAD186] stroke-[3] animate-draw-check" />
            </div>

            {/* Heading & Subtext */}
            <div className="space-y-2">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A]">
                Order Placed Successfully!
              </h1>
              <p className="text-xs sm:text-sm text-gray-600">
                Thank you for shopping with <strong>Royal Libas</strong>.
              </p>
            </div>
          </>
        )}

        {/* 2-Column Info Pill (PDF Page 7) */}
        <div className="grid grid-cols-2 gap-4 bg-[#FAF7F2] p-4 sm:p-5 rounded-xl border border-[#E8DFD0] max-w-md mx-auto text-center">
          <div className="border-r border-gray-200 pr-2">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">Order ID</span>
            <span className="font-mono text-sm sm:text-base font-bold text-[#5B111A]">
              #{order.order_code}
            </span>
          </div>
          <div className="pl-2">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">Estimated Delivery</span>
            <span className="font-serif text-sm sm:text-base font-bold text-gray-900">
              3–5 Days
            </span>
          </div>
        </div>

        {/* Reassurance Message */}
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          We have sent the order confirmation & tracking details to your phone.
        </p>

        {/* Action CTAs (PDF Page 7) */}
        <div className="space-y-3 max-w-sm mx-auto pt-2">
          <Link
            to="/track-order"
            className="w-full py-3.5 px-6 rounded-lg bg-[#5B111A] hover:bg-[#3A080F] text-white font-ui font-semibold text-xs sm:text-sm uppercase tracking-wider transition-colors shadow flex items-center justify-center gap-2"
          >
            <span>Track Order</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/shop"
            className="w-full py-3 px-6 rounded-lg bg-transparent border border-[#5B111A] text-[#5B111A] hover:bg-[#5B111A]/5 font-ui font-semibold text-xs uppercase tracking-wider block transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>

      {/* ========================================================
          2. YOU MAY ALSO LIKE (Recommendation Rail - PDF Page 7)
          ======================================================== */}
      {recommended.length > 0 && (
        <div className="max-w-6xl mx-auto mt-16 pt-10 border-t border-[#E8DFD0]">
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#5B111A] text-center mb-8">
            You May Also Like
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {recommended.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
