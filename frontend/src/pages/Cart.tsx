import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, Plus, Minus, ArrowRight, AlertTriangle, ShieldCheck, Truck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatPrice, validateCart } from '../lib/api';
import { CartValidateResponse } from '../types/order';
import { useStoreSettings } from '../lib/settings';

export const Cart: React.FC = () => {
  const navigate = useNavigate();
  const { items, totalItems, subtotal, updateQuantity, removeFromCart } = useCart();
  const { settings } = useStoreSettings();
  const [validationResult, setValidationResult] = useState<CartValidateResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const handleRemove = (variantId: number) => {
    setRemovingId(variantId);
    setTimeout(() => {
      removeFromCart(variantId);
      setRemovingId(null);
    }, 300);
  };

  useEffect(() => {
    document.title = 'Shopping Bag | Royal Libas by Tanya';
  }, []);

  // Validate cart line items against live database stock
  useEffect(() => {
    if (items.length === 0) {
      setValidationResult(null);
      return;
    }

    let isMounted = true;
    const checkStock = async () => {
      setIsValidating(true);
      try {
        const payload = items.map((i) => ({
          variant_id: i.variantId,
          quantity: i.quantity,
        }));
        const res = await validateCart(payload);
        if (isMounted) {
          setValidationResult(res);
        }
      } catch (err) {
        console.warn('Cart live validation warning:', err);
      } finally {
        if (isMounted) {
          setIsValidating(false);
        }
      }
    };

    checkStock();
    return () => {
      isMounted = false;
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <div className="w-20 h-20 rounded-full bg-[#FCF8F0] border border-[#E8DFD0] flex items-center justify-center text-gray-400 mb-5 shadow-sm">
          <ShoppingBag className="w-10 h-10 text-[#B58A3C]" />
        </div>
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          Your Shopping Bag is Empty
        </h2>
        <p className="text-xs sm:text-sm text-gray-600 mb-8 max-w-sm leading-relaxed">
          Explore our handcrafted festive edit and breathable everyday cotton ensembles.
        </p>
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-none bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase transition-colors shadow-md"
        >
          <span>Explore The Shop</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const hasStockErrors = validationResult && !validationResult.is_valid;

  return (
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans">
      {/* ========================================================
          1. CART BANNER (PDF Page 6)
          "YOUR CART - Beautiful choices, a more elegant you."
          ======================================================== */}
      <section className="bg-[#2B1B1E] text-[#FCF8F0] py-10 sm:py-14 px-4 sm:px-6 lg:px-8 border-b border-[#B58A3C]/30 text-center">
        <div className="max-w-4xl mx-auto space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#B58A3C] font-semibold">
              ATELIER SELECTIONS
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FCF8F0]">
            YOUR CART
          </h1>
          <p className="text-xs sm:text-sm text-[#FCF8F0]/80 font-light italic">
            Beautiful choices, a more elegant you.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Stock warning notification if any item is sold out or low */}
        {hasStockErrors && (
          <div className="mb-6 p-4 rounded bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Inventory Notice</p>
              {validationResult.unavailable_lines.map((msg, idx) => (
                <p key={idx} className="text-red-700">{msg}</p>
              ))}
              <p className="text-xs text-red-600 pt-1">
                Please adjust quantities or remove sold-out sizes before proceeding to checkout.
              </p>
            </div>
          </div>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 sm:gap-10">
        {/* Cart Line Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const itemValidation = validationResult?.items.find((v) => v.variant_id === item.variantId);
            const isLineError = itemValidation && !itemValidation.is_available;

            return (
              <div
                key={item.variantId}
                className={`bg-white p-4 sm:p-5 rounded-none border transition-all duration-300 ease-out ${
                  removingId === item.variantId ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100'
                } ${
                  isLineError ? 'border-red-300 bg-red-50/20' : 'border-[#E8DFD0] shadow-sm'
                } flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between`}
              >
                <div className="flex gap-4 items-center min-w-0 flex-1">
                  {/* Thumbnail */}
                  <div className="w-20 h-24 sm:w-24 sm:h-28 rounded-none overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#5E1224] text-white text-[10px] flex items-center justify-center p-2 text-center font-serif">
                        {item.name}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <Link
                      to={`/product/${item.slug}`}
                      className="font-serif font-semibold text-sm sm:text-base text-gray-900 hover:text-[#5E1224] transition-colors line-clamp-1"
                    >
                      {item.name}
                    </Link>
                    <div className="text-xs text-gray-500 flex flex-wrap items-center gap-2">
                      <span>Size: <strong className="text-gray-800">{item.size}</strong></span>
                      {item.colour && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span>Colour: <strong className="text-gray-800">{item.colour}</strong></span>
                        </>
                      )}
                      <span className="text-gray-300">|</span>
                      <span>Unit: {formatPrice(item.sellingPrice)}</span>
                    </div>

                    {isLineError && (
                      <div className="text-xs text-red-600 font-semibold flex items-center gap-1 pt-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{itemValidation.error || 'Insufficient stock'}</span>
                      </div>
                    )}

                    <div className="text-sm font-bold text-[#5E1224] pt-1">
                      {formatPrice(item.sellingPrice * item.quantity)}
                    </div>
                  </div>
                </div>

                {/* Quantity Controls & Remove */}
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                  <div className="flex items-center border border-gray-300 rounded-none bg-[#FCF8F0]">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                      className="p-1.5 hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
                      disabled={item.quantity <= 1}
                      title="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-xs font-bold text-gray-800">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                      className="p-1.5 hover:bg-gray-200 text-gray-700 transition-colors"
                      title="Increase quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(item.variantId)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order Summary Card (PDF Page 6) */}
        <div className="space-y-4">
          <div className="bg-white p-6 sm:p-7 border border-[#B58A3C]/40 shadow-sm space-y-5 relative">
            <h2 className="font-serif font-bold text-xl text-[#2B1B1E] border-b border-gray-100 pb-3">
              Order Summary
            </h2>

            <div className="space-y-3 text-xs sm:text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Items ({totalItems})</span>
                <span className="font-semibold text-gray-900 price-display">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="text-[#5E1224] font-semibold">
                  {subtotal >= settings.freeShippingThreshold
                    ? 'Free'
                    : `₹${settings.standardShippingFee} (Free above ₹${settings.freeShippingThreshold})`}
                </span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 flex justify-between items-baseline">
              <div>
                <span className="font-bold text-gray-900 text-sm">Estimated Total</span>
                <p className="text-[10.5px] text-gray-400">Inclusive of all taxes</p>
              </div>
              <span className="font-serif text-2xl font-bold text-[#5E1224]">
                {formatPrice(subtotal)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/checkout')}
              disabled={hasStockErrors || isValidating}
              className="w-full py-4 bg-[#5E1224] hover:bg-[#3A080F] disabled:bg-gray-300 disabled:cursor-not-allowed text-[#FCF8F0] text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] transition-colors shadow-md flex items-center justify-center gap-2"
            >
              <span>PROCEED TO CHECKOUT</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <Link
              to="/shop"
              className="w-full py-2 text-center text-xs text-gray-500 hover:text-[#5E1224] font-medium block transition-colors uppercase tracking-wider"
            >
              Continue Shopping
            </Link>

            {/* Trust Badges matching PDF Page 6 */}
            <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-center text-[10.5px] text-gray-600">
              <div className="flex flex-col items-center gap-1 p-2 bg-[#FCF8F0] border border-[#E8DFD0]/60">
                <ShieldCheck className="w-4 h-4 text-[#B58A3C]" />
                <span className="font-medium">Secure Checkout</span>
              </div>
              <div className="flex flex-col items-center gap-1 p-2 bg-[#FCF8F0] border border-[#E8DFD0]/60">
                <Truck className="w-4 h-4 text-[#B58A3C]" />
                <span className="font-medium">Reliable Delivery</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};
