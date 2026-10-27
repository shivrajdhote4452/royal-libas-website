import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  Loader2,
  ArrowRight,
  Check,
  Clock,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { fetchOrderByCode, fetchProducts, formatPrice, syncCashfreePayment } from '../lib/api';
import { OrderResponse } from '../types/order';
import { Product } from '../types/product';
import { ProductCard } from '../components/ProductCard';
import { BrandLogo } from '../components/BrandLogo';

export const OrderSuccess: React.FC = () => {
  const { orderCode } = useParams<{ orderCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();

  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const orderToken =
    searchParams.get('token') ||
    (orderCode ? sessionStorage.getItem(`rl_token_${orderCode}`) || '' : '');

  const loadOrder = async () => {
    if (!orderCode) {
      setError('Order reference code missing from URL.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchOrderByCode(orderCode, orderToken);
      setOrder(data);

      // SAFE CART CLEARING: Only clear cart when order is actually confirmed
      if (data.payment_status === 'PAID' || data.payment_method === 'COD') {
        clearCart();
      }

      if (data.payment_method === 'PREPAID' && data.payment_status !== 'PAID') {
        document.title = `Payment Pending: ${data.order_code} | Royal Libas`;
      } else {
        document.title = `Order Confirmation: ${data.order_code} | Royal Libas`;
      }
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve order details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();

    let isMounted = true;
    fetchProducts({})
      .then((items) => {
        if (isMounted) setRecommended(items.slice(0, 4));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [orderCode]);

  const handleVerifyPayment = async () => {
    if (!orderCode) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const syncResult = await syncCashfreePayment(orderCode);
      setSyncMessage(syncResult.message);
      const updated = await fetchOrderByCode(orderCode, orderToken);
      setOrder(updated);
      if (updated.payment_status === 'PAID') {
        clearCart();
      }
    } catch (err: any) {
      setSyncMessage(err.message || 'Unable to verify payment status with gateway. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-[#5E1224] animate-spin" />
        <p className="font-serif text-gray-700 text-sm">Retrieving your order status...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-white border border-red-200 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
          !
        </div>
        <h2 className="font-serif text-xl font-bold text-gray-900">Order Access Error</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          {error || 'Could not verify or load the requested order.'}
        </p>
        <p className="text-[11px] text-gray-500">
          Your shopping bag items remain saved. You can retry retrieving the order or return to shop.
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={loadOrder}
            className="px-5 py-2.5 bg-[#5E1224] text-white rounded-none text-xs font-semibold uppercase tracking-wider"
          >
            Retry Loading
          </button>
          <Link
            to="/shop"
            className="px-5 py-2.5 border border-[#5E1224] text-[#5E1224] rounded-none text-xs font-semibold uppercase tracking-wider"
          >
            Return to Shop
          </Link>
        </div>
      </div>
    );
  }

  const isPrepaidPending = order.payment_method === 'PREPAID' && order.payment_status === 'PENDING';
  const isPrepaidFailed = order.payment_method === 'PREPAID' && order.payment_status === 'FAILED';
  const isCancelled = order.status === 'CANCELLED';
  const isConfirmed = order.payment_status === 'PAID' || order.payment_method === 'COD';

  return (
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
      {/* ========================================================
          ORDER CONFIRMATION / PAYMENT STATE CARD
          ======================================================== */}
      <div className="max-w-2xl mx-auto bg-white border border-[#B58A3C]/40 shadow-sm p-8 sm:p-12 text-center space-y-6 relative">
        {/* Brand Authenticity Header */}
        <div className="flex justify-center pb-4 border-b border-gray-100">
          <BrandLogo layout="compact" emblemSize={30} />
        </div>

        {/* 1. STATE: PAYMENT PENDING */}
        {isPrepaidPending && (
          <div className="space-y-4">
            <div className="w-20 h-20 rounded-full bg-amber-50 border-4 border-amber-400 flex items-center justify-center mx-auto shadow-md">
              <Clock className="w-10 h-10 text-amber-700 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-amber-100 text-amber-900">
                Payment Verification in Progress
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#5E1224]">
                Awaiting Payment Confirmation
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                If you completed the payment on UPI, NetBanking, or Card, click below to immediately verify status. Your cart is preserved until payment is verified.
              </p>
            </div>

            {syncMessage && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-xs text-amber-900 rounded-none max-w-md mx-auto">
                {syncMessage}
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <button
                type="button"
                onClick={handleVerifyPayment}
                disabled={syncing}
                className="py-3 px-6 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-[#FCF8F0] font-semibold text-xs uppercase tracking-[0.2em] transition-colors flex items-center justify-center gap-2"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>VERIFY PAYMENT STATUS</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/checkout')}
                className="py-3 px-6 border border-[#5E1224] text-[#5E1224] hover:bg-[#5E1224]/5 font-semibold text-xs uppercase tracking-[0.2em] transition-colors"
              >
                RETRY IN CHECKOUT
              </button>
            </div>
          </div>
        )}

        {/* 2. STATE: PAYMENT FAILED */}
        {isPrepaidFailed && (
          <div className="space-y-4">
            <div className="w-20 h-20 rounded-full bg-red-50 border-4 border-red-400 flex items-center justify-center mx-auto shadow-md">
              <AlertTriangle className="w-10 h-10 text-red-700 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-red-100 text-red-900">
                Payment Incomplete
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
                Payment Was Declined or Incomplete
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                The payment attempt did not complete. No money was charged. Your items remain saved in your bag so you can try another payment method or select Cash on Delivery.
              </p>
            </div>

            <div className="pt-2 max-w-xs mx-auto">
              <Link
                to="/checkout"
                className="py-3.5 px-6 bg-[#5E1224] hover:bg-[#4A0E1C] text-white font-semibold text-xs uppercase tracking-[0.2em] block transition-colors shadow flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>RETURN TO CHECKOUT</span>
              </Link>
            </div>
          </div>
        )}

        {/* 3. STATE: CANCELLED */}
        {isCancelled && (
          <div className="space-y-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 border-4 border-gray-400 flex items-center justify-center mx-auto">
              <span className="text-2xl font-serif text-gray-600 font-bold">✕</span>
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-gray-100 text-gray-800">
                Order Cancelled
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
                This Order Has Been Cancelled
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                This order was cancelled and any reserved items have been released back to boutique stock.
              </p>
            </div>

            <div className="pt-2 max-w-xs mx-auto">
              <Link
                to="/shop"
                className="py-3.5 px-6 bg-[#5E1224] hover:bg-[#4A0E1C] text-white font-semibold text-xs uppercase tracking-[0.2em] block transition-colors text-center"
              >
                EXPLORE NEW ARRIVALS
              </Link>
            </div>
          </div>
        )}

        {/* 4. STATE: CONFIRMED (PAID or COD) */}
        {isConfirmed && !isCancelled && (
          <>
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#5E1224] to-[#7D1B32] border-4 border-[#B58A3C] flex items-center justify-center mx-auto shadow-xl relative">
              <div className="absolute inset-0 rounded-full border border-amber-200/40 animate-pulse" />
              <Check className="w-10 h-10 text-[#FCF8F0] stroke-[3] animate-draw-check" />
            </div>

            <div className="space-y-2">
              <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#2B1B1E] uppercase">
                ORDER CONFIRMED
              </h1>
              <p className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#B58A3C] font-semibold">
                THANK YOU FOR SHOPPING WITH ROYAL LIBAS
              </p>
            </div>

            <div className="inline-block px-4 py-2 bg-[#FCF8F0] border border-[#B58A3C]/40 text-xs font-mono font-bold tracking-wider text-[#5E1224]">
              ORDER #{order.order_code}
            </div>

            <p className="text-xs text-gray-600 max-w-md mx-auto leading-relaxed">
              Your order has been recorded at our atelier. Every garment is hand-inspected, steam-pressed, and packed with care before dispatch.
            </p>
          </>
        )}

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
                    <span className="text-gray-400 text-[11px] ml-1.5">Size {it.size_snapshot} × {it.quantity}</span>
                  </div>
                  <span className="font-semibold text-[#2B1B1E]">{formatPrice(it.unit_price_snapshot * it.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between items-center font-bold text-xs text-[#5E1224]">
              <span>Authoritative Total:</span>
              <span className="text-sm font-serif">{formatPrice(order.total)}</span>
            </div>
          </div>
        )}

        {/* Action CTAs (PDF Page 8) */}
        {isConfirmed && !isCancelled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto pt-2">
            <Link
              to={`/track-order?order_code=${encodeURIComponent(order.order_code)}`}
              className="py-3.5 px-6 bg-[#5E1224] hover:bg-[#4A0E1C] text-[#FCF8F0] font-semibold text-xs uppercase tracking-[0.2em] transition-colors shadow flex items-center justify-center gap-2"
            >
              <span>TRACK ORDER</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/shop"
              className="py-3.5 px-6 bg-transparent border border-[#5E1224] text-[#5E1224] hover:bg-[#5E1224] hover:text-[#FCF8F0] font-semibold text-xs uppercase tracking-[0.2em] block transition-colors text-center"
            >
              CONTINUE SHOPPING
            </Link>
          </div>
        )}

        {/* Footer trust icons (PDF Page 8) */}
        <div className="pt-6 border-t border-gray-100 grid grid-cols-3 gap-2 text-center text-[10.5px] text-gray-500 uppercase tracking-widest">
          <div>SECURE CHECKOUT</div>
          <div>HANDCRAFTED HERITAGE</div>
          <div>AUTHENTIC WEAVES</div>
        </div>
      </div>

      {/* ========================================================
          YOU MAY ALSO LIKE (Recommendation Rail - PDF Page 7)
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

