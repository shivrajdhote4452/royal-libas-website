import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2,
  ArrowRight,
  Check,
  Clock
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { fetchOrderByCode, fetchProducts, formatPrice } from '../lib/api';
import { OrderResponse } from '../types/order';
import { Product } from '../types/product';
import { ProductCard } from '../components/ProductCard';
import { BrandLogo } from '../components/BrandLogo';

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
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
      {/* ========================================================
          1. ORDER CONFIRMED CARD (PDF Page 8)
          ======================================================== */}
      <div className="max-w-2xl mx-auto bg-white border border-[#B58A3C]/40 shadow-sm p-8 sm:p-12 text-center space-y-6 relative">
        {/* Brand Authenticity Header */}
        <div className="flex justify-center pb-4 border-b border-gray-100">
          <BrandLogo layout="compact" emblemSize={30} />
        </div>

        {isPrepaidPending ? (
          <>
            <div className="w-20 h-20 rounded-full bg-amber-50 border-4 border-amber-400 flex items-center justify-center mx-auto shadow-md">
              <Clock className="w-10 h-10 text-amber-700 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-amber-100 text-amber-900">
                Payment pending verification
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224]">
                Payment Verification in Progress
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
                We have received your order details and are waiting for payment confirmation from Cashfree. Your order will be confirmed once payment is verified.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Gold Floral Medallion Checkmark (PDF Page 8) */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#5E1224] to-[#7D1B32] border-4 border-[#B58A3C] flex items-center justify-center mx-auto shadow-xl relative">
              <div className="absolute inset-0 rounded-full border border-amber-200/40 animate-pulse" />
              <Check className="w-10 h-10 text-[#FCF8F0] stroke-[3] animate-draw-check" />
            </div>

            {/* Heading & Subtext matching PDF Page 8 */}
            <div className="space-y-2">
              <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#2B1B1E] uppercase">
                ORDER CONFIRMED
              </h1>
              <p className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#B58A3C] font-semibold">
                THANK YOU FOR SHOPPING WITH ROYAL LIBAS
              </p>
            </div>
          </>
        )}

        {/* Order ID Tag matching PDF Page 8 */}
        <div className="inline-block px-4 py-2 bg-[#FCF8F0] border border-[#B58A3C]/40 text-xs font-mono font-bold tracking-wider text-[#5E1224]">
          ORDER #{order.order_code}
        </div>

        <p className="text-xs text-gray-600 max-w-md mx-auto leading-relaxed">
          Your order has been placed successfully. You will receive a confirmation message with your order details shortly.
        </p>

        {/* Order Summary box matching PDF Page 8 */}
        {order.items && order.items.length > 0 && (
          <div className="border border-[#E8DFD0] bg-[#FCF8F0] p-4 text-left max-w-md mx-auto space-y-2.5">
            <span className="text-[10.5px] uppercase tracking-[0.2em] font-bold text-[#B58A3C] block border-b border-gray-200 pb-1.5">
              ORDER SUMMARY
            </span>
            <div className="space-y-2 text-xs">
              {order.items.map((it) => (
                <div key={it.id} className="flex justify-between items-center text-gray-700">
                  <div>
                    <span className="font-medium">{it.product_name_snapshot}</span>
                    <span className="text-gray-400 text-[11px] ml-1.5">Qty: {it.quantity}</span>
                  </div>
                  <span className="font-semibold text-[#2B1B1E]">{formatPrice(it.unit_price_snapshot * it.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between items-center font-bold text-xs text-[#5E1224]">
              <span>Total:</span>
              <span className="text-sm font-serif">{formatPrice(order.total)}</span>
            </div>
          </div>
        )}

        {/* Action CTAs (PDF Page 8) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto pt-2">
          <Link
            to="/track-order"
            className="py-3.5 px-6 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-colors shadow flex items-center justify-center gap-2"
          >
            <span>TRACK ORDER</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/shop"
            className="py-3.5 px-6 bg-transparent border border-[#5E1224] text-[#5E1224] hover:bg-[#5E1224] hover:text-[#FCF8F0] font-ui font-semibold text-xs uppercase tracking-[0.2em] block transition-colors text-center"
          >
            CONTINUE SHOPPING
          </Link>
        </div>

        {/* Footer trust icons (PDF Page 8) */}
        <div className="pt-6 border-t border-gray-100 grid grid-cols-3 gap-2 text-center text-[10.5px] text-gray-500 uppercase tracking-widest">
          <div>SECURE CHECKOUT</div>
          <div>PREMIUM QUALITY</div>
          <div>TIMELESS TRADITION</div>
        </div>
      </div>

      {/* ========================================================
          2. YOU MAY ALSO LIKE (Recommendation Rail - PDF Page 7)
          ======================================================== */}
      {recommended.length > 0 && (
        <div className="max-w-6xl mx-auto mt-16 pt-10 border-t border-[#E8DFD0]">
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#5E1224] text-center mb-8">
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
