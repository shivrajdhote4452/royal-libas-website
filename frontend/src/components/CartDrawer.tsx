import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight, Tag, Check, AlertCircle, Truck, Loader2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatPrice, roundCurrency } from '../lib/api';
import { useStoreSettings } from '../lib/settings';

export const CartDrawer: React.FC = () => {
  const navigate = useNavigate();
  const {
    items,
    totalItems,
    subtotal,
    isDrawerOpen,
    closeDrawer,
    updateQuantity,
    removeFromCart,
    appliedCouponCode,
    appliedCoupon,
    couponDiscount,
    couponError,
    couponStatus,
    isValidatingCoupon,
    applyCoupon,
    removeCoupon,
    revalidateCoupon,
  } = useCart();
  const { settings } = useStoreSettings();

  const [couponCode, setCouponCode] = useState(appliedCouponCode || '');

  useEffect(() => {
    if (appliedCouponCode) {
      setCouponCode(appliedCouponCode);
    } else {
      setCouponCode('');
    }
  }, [appliedCouponCode]);

  // Prevent background scrolling while cart drawer is open (Point 6)
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  if (!isDrawerOpen) return null;

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    await applyCoupon(couponCode);
  };

  const handleRemoveCoupon = () => {
    removeCoupon();
    setCouponCode('');
  };

  const isFreeShipping = subtotal >= settings.freeShippingThreshold || subtotal === 0;
  const shippingCharge = isFreeShipping ? 0 : settings.standardShippingFee;
  const finalTotal = roundCurrency(Math.max(0, subtotal - couponDiscount + shippingCharge));
  const remainingForFreeShipping = Math.max(0, settings.freeShippingThreshold - subtotal);
  const freeShippingProgress = Math.min(100, Math.round((subtotal / settings.freeShippingThreshold) * 100));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden no-motion">
      {/* Backdrop (Point 6: Click outside to dismiss) */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#FAF7F2] shadow-2xl flex flex-col h-full border-l border-[#E8DFD0]">
          {/* Drawer Header */}
          <div className="p-4 sm:p-5 border-b border-[#E8DFD0] flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#5B111A]" />
              <h2 className="font-serif text-lg font-bold text-gray-900">
                Your Shopping Bag ({totalItems})
              </h2>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
              aria-label="Close cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Free Shipping Progress Indicator (Point 2) */}
          {items.length > 0 && (
            <div className="bg-[#FCF8F0] px-5 py-3 border-b border-[#E8DFD0] text-xs">
              <div className="flex items-center justify-between font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-[#C59B27]" />
                  {isFreeShipping ? (
                    <span className="text-emerald-700 font-semibold">
                      🎉 You unlocked <strong>Complimentary Shipping</strong>!
                    </span>
                  ) : (
                    <span>
                      Add <strong>{formatPrice(remainingForFreeShipping)}</strong> more for <strong>FREE Delivery</strong>
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  {freeShippingProgress}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#C59B27] to-[#5B111A] transition-all duration-300"
                  style={{ width: `${freeShippingProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-[#FCF8F0] border border-[#E8DFD0] flex items-center justify-center text-gray-400">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-base font-semibold text-gray-900">Your bag is empty</h3>
                  <p className="text-xs text-gray-500 max-w-xs mx-auto">
                    Explore our curated handcrafted ensembles and festive silhouettes.
                  </p>
                </div>
                <Link
                  to="/shop"
                  onClick={closeDrawer}
                  className="inline-block px-5 py-2.5 bg-[#5B111A] text-white text-xs font-ui font-semibold rounded-lg hover:bg-[#460C13] transition-colors"
                >
                  START SHOPPING
                </Link>
              </div>
            ) : (
              <>
                {/* Items List */}
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.variantId}
                      className="p-3 bg-white rounded-xl border border-[#E8DFD0] shadow-sm flex gap-3 items-center"
                    >
                      {/* Image Thumbnail (Point 5) */}
                      <div className="w-16 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-100">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-[#5B111A] text-white flex items-center justify-center text-xs font-serif">
                            RL
                          </div>
                        )}
                      </div>

                      {/* Item Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <Link
                          to={`/product/${item.slug}`}
                          onClick={closeDrawer}
                          className="font-serif text-xs sm:text-sm font-semibold text-gray-900 hover:text-[#5B111A] line-clamp-1 transition-colors"
                        >
                          {item.name}
                        </Link>
                        <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                          <span className="font-medium text-gray-700">Size: {item.size}</span>
                          {item.colour && (
                            <>
                              <span>•</span>
                              <span>{item.colour}</span>
                            </>
                          )}
                        </div>
                        <div className="text-xs font-bold text-[#5B111A] price-display">
                          {formatPrice(item.sellingPrice)}
                        </div>

                        {/* Quantity Controls & Remove */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center border border-gray-200 rounded bg-[#FAF7F2]">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              className="p-1 hover:bg-gray-200 text-gray-600 disabled:opacity-30 transition-colors"
                              title="Decrease"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-semibold text-gray-800">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                              className="p-1 hover:bg-gray-200 text-gray-600 transition-colors"
                              title="Increase"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFromCart(item.variantId)}
                            className="text-gray-400 hover:text-red-600 p-1 transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coupon Code Section */}
                <div className="bg-white p-3.5 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                    <Tag className="w-3.5 h-3.5 text-[#C59B27]" />
                    <span>Apply Coupon</span>
                  </div>

                  {couponStatus === 'VALIDATING' || isValidatingCoupon ? (
                    <div data-testid="coupon-validating-card" className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                        <span>Verifying <strong>{appliedCouponCode}</strong>...</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-xs text-amber-900 hover:text-red-600 underline font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : couponStatus === 'ERROR' ? (
                    <div data-testid="coupon-error-card" className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg space-y-1.5 text-xs text-rose-900">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span className="font-medium">Verification failed for <strong>{appliedCouponCode}</strong></span>
                      </div>
                      <div className="flex items-center gap-3 pt-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => revalidateCoupon(subtotal)}
                          className="font-semibold text-rose-800 hover:underline"
                        >
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveCoupon}
                          className="text-gray-500 hover:text-red-600 underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : appliedCoupon?.valid ? (
                    <div data-testid="applied-coupon-card" className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span><strong className="font-bold">{appliedCoupon.code}</strong> applied!</span>
                        <span className="text-emerald-700">(-{formatPrice(couponDiscount)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-xs text-gray-500 hover:text-red-600 underline font-medium ml-2"
                        title="Remove coupon"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyCoupon} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. ROYAL10"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-none focus:border-[#5B111A] bg-[#FAF7F2] uppercase font-mono"
                      />
                      <button
                        type="submit"
                        disabled={isValidatingCoupon || !couponCode.trim()}
                        className="px-4 py-1.5 bg-[#5B111A] text-white text-xs font-ui font-semibold rounded-lg hover:bg-[#460C13] transition-colors disabled:opacity-50"
                      >
                        {isValidatingCoupon ? '...' : 'Apply'}
                      </button>
                    </form>
                  )}
                  {couponError && couponStatus !== 'ERROR' && (
                    <div className="flex items-center gap-1 text-[11px] text-red-600 font-medium pt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{couponError}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Drawer Footer (Point 4: VIEW CART, CHECKOUT) */}
          {items.length > 0 && (
            <div className="p-4 sm:p-5 bg-white border-t border-[#E8DFD0] space-y-3">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-gray-900 price-display">{formatPrice(subtotal)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Coupon Discount ({appliedCoupon?.code})</span>
                    <span className="price-display">-{formatPrice(couponDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span className="font-semibold text-gray-900">
                    {isFreeShipping ? (
                      <span className="text-emerald-700 font-bold">FREE</span>
                    ) : (
                      `₹${settings.standardShippingFee}`
                    )}
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-2 flex justify-between text-base font-bold text-[#5B111A]">
                  <span>Total</span>
                  <span className="total-display">{formatPrice(finalTotal)}</span>
                </div>
              </div>

              {/* Checkout Button */}
              <button
                type="button"
                disabled={isValidatingCoupon || couponStatus === 'VALIDATING'}
                onClick={() => {
                  closeDrawer();
                  navigate('/checkout');
                }}
                className="w-full py-3.5 px-4 bg-[#5B111A] hover:bg-[#460C13] disabled:bg-gray-400 text-white text-xs sm:text-sm font-ui font-semibold rounded-lg tracking-wider uppercase transition-all shadow flex items-center justify-center gap-2"
              >
                {isValidatingCoupon || couponStatus === 'VALIDATING' ? (
                  <span>VERIFYING COUPON...</span>
                ) : (
                  <>
                    <span>CHECKOUT</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* View Cart Button */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    closeDrawer();
                    navigate('/cart');
                  }}
                  className="text-xs text-[#5B111A] hover:underline font-semibold"
                >
                  VIEW FULL CART
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
