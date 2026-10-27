import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight, Tag, Check, AlertCircle, Truck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatPrice, validateCoupon } from '../lib/api';
import { useStoreSettings } from '../lib/settings';

export const CartDrawer: React.FC = () => {
  const navigate = useNavigate();
  const { items, totalItems, subtotal, isDrawerOpen, closeDrawer, updateQuantity, removeFromCart } = useCart();
  const { settings } = useStoreSettings();

  const [couponCode, setCouponCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

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
    setIsValidatingCoupon(true);
    setCouponError(null);
    try {
      const res = await validateCoupon(couponCode.trim().toUpperCase(), subtotal);
      if (res.valid) {
        setDiscountAmount(res.discount);
        setCouponApplied(couponCode.trim().toUpperCase());
      } else {
        setCouponError(res.message || 'Invalid coupon code');
        setDiscountAmount(0);
        setCouponApplied(null);
      }
    } catch {
      setCouponError('Failed to validate coupon');
      setDiscountAmount(0);
      setCouponApplied(null);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const finalTotal = Math.max(0, subtotal - discountAmount);
  const isFreeShipping = subtotal >= settings.freeShippingThreshold || subtotal === 0;
  const remainingForFreeShipping = Math.max(0, settings.freeShippingThreshold - subtotal);
  const freeShippingProgress = Math.min(100, Math.round((subtotal / settings.freeShippingThreshold) * 100));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop with fade in (Point 6) */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-250 ease-out"
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        {/* Drawer with translateX(100%) -> 0 (320ms cubic-bezier) */}
        <div
          className="w-screen max-w-md bg-[#FAF7F2] border-l border-[#E8DFD0] shadow-2xl flex flex-col animate-in slide-in-from-right duration-320 ease-out"
          style={{
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 bg-white border-b border-[#E8DFD0] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#5B111A]" />
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#5B111A]">
                YOUR CART ({totalItems})
              </h2>
            </div>
            <button
              onClick={closeDrawer}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
              aria-label="Close cart drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Free Shipping Progress Indicator */}
          {items.length > 0 && (
            <div className="bg-[#FAF7F2] px-4 py-3 border-b border-[#E8DFD0] space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-[#C59B27]" />
                  {isFreeShipping ? (
                    <span className="text-emerald-700 font-bold">You qualify for FREE Standard Shipping!</span>
                  ) : (
                    <span>
                      Add <strong className="text-[#5B111A]">{formatPrice(remainingForFreeShipping)}</strong> more for Free Shipping
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-gray-500">{freeShippingProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#5B111A] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${freeShippingProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Cart Body - strictly only drawer content scrolls (Point 6) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {items.length === 0 ? (
              /* Empty Cart State (Point 26) */
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-full bg-white border border-[#E8DFD0] flex items-center justify-center mx-auto text-[#C59B27] shadow-sm">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="font-serif text-xl font-bold text-gray-900">Your cart is empty</h3>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Explore our handcrafted festive edit and timeless ethnic co-ords.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    closeDrawer();
                    navigate('/shop');
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#5B111A] hover:bg-[#460C13] text-white text-xs font-ui font-semibold rounded-lg tracking-wider uppercase transition-colors shadow"
                >
                  <span>Continue Shopping</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                {/* Items List */}
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.variantId}
                      className="bg-white p-3.5 rounded-xl border border-[#E8DFD0] shadow-sm flex gap-3.5 items-center transition-all hover:border-[#5B111A]/40"
                    >
                      {/* Thumbnail with reserved ratio */}
                      <div className="w-16 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#5B111A] text-white text-[9px] flex items-center justify-center p-1 text-center font-serif">
                            RL
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/product/${item.slug}`}
                          onClick={closeDrawer}
                          className="font-serif text-sm font-semibold text-gray-900 hover:text-[#5B111A] line-clamp-1 transition-colors"
                        >
                          {item.name}
                        </Link>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Size: <span className="font-bold text-gray-800">{item.size}</span>
                        </div>
                        <div className="text-xs font-bold text-[#5B111A] mt-1 price-display">
                          {formatPrice(item.sellingPrice * item.quantity)}
                        </div>

                        {/* Quantity Controls (Point 19: - 1 +) */}
                        <div className="flex items-center justify-between mt-2.5">
                          <div className="flex items-center border border-gray-300 rounded-lg bg-[#FAF7F2]">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              className="p-1 hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition-colors"
                              title="Decrease"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-gray-900">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                              className="p-1 hover:bg-gray-200 text-gray-700 transition-colors"
                              title="Increase"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFromCart(item.variantId)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors"
                            title="Remove"
                            aria-label={`Remove ${item.name} from bag`}
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
                  <form onSubmit={handleApplyCoupon} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. WELCOME10"
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
                  {couponApplied && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      <span>{couponApplied} applied (-{formatPrice(discountAmount)})</span>
                    </div>
                  )}
                  {couponError && (
                    <div className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
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
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Discount</span>
                    <span className="price-display">-{formatPrice(discountAmount)}</span>
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
                onClick={() => {
                  closeDrawer();
                  navigate('/checkout');
                }}
                className="w-full py-3.5 px-4 bg-[#5B111A] hover:bg-[#460C13] text-white text-xs sm:text-sm font-ui font-semibold rounded-lg tracking-wider uppercase transition-all shadow flex items-center justify-center gap-2"
              >
                <span>CHECKOUT</span>
                <ArrowRight className="w-4 h-4" />
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
