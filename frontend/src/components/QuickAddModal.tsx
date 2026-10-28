import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Minus, Plus, ShoppingBag, Check, ArrowRight } from 'lucide-react';
import { useQuickAdd } from '../context/QuickAddContext';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/api';
import { ProductVariant } from '../types/product';

export const QuickAddModal: React.FC = () => {
  const { activeProduct, closeQuickAdd } = useQuickAdd();
  const { addToCart, openDrawer } = useCart();
  const navigate = useNavigate();

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [btnState, setBtnState] = useState<'idle' | 'adding' | 'added'>('idle');

  // Sync state when activeProduct changes
  useEffect(() => {
    if (activeProduct) {
      setQuantity(1);
      setBtnState('idle');
      // Auto-select first in-stock variant
      const firstInStock = activeProduct.variants?.find((v) => v.stock > 0) || null;
      setSelectedVariant(firstInStock);
      // Lock background scroll
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeProduct]);

  if (!activeProduct) return null;

  const imageUrl =
    activeProduct.primary_image ||
    (activeProduct.images && activeProduct.images.length > 0 ? activeProduct.images[0].url : null);

  const displaySellingPrice = selectedVariant
    ? selectedVariant.selling_price
    : activeProduct.min_price || 0;
  const displayMrp = selectedVariant?.mrp ?? (activeProduct.variants[0]?.mrp || null);
  const discountPercent =
    displayMrp && displayMrp > displaySellingPrice
      ? Math.round(((displayMrp - displaySellingPrice) / displayMrp) * 100)
      : null;

  const isSoldOut = activeProduct.total_stock === 0;

  const handleAddToCart = () => {
    if (!selectedVariant || selectedVariant.stock <= 0 || btnState !== 'idle') return;

    setBtnState('adding');
    setTimeout(() => {
      addToCart(
        {
          productId: activeProduct.id,
          variantId: selectedVariant.id,
          slug: activeProduct.slug,
          name: activeProduct.name,
          size: selectedVariant.size,
          colour: selectedVariant.colour,
          sellingPrice: Number(selectedVariant.selling_price),
          image: imageUrl,
        },
        quantity
      );
      setBtnState('added');

      setTimeout(() => {
        closeQuickAdd();
        openDrawer();
      }, 500);
    }, 280);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-end sm:items-center justify-center">
      {/* Backdrop with 180-220ms fade */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200"
        onClick={closeQuickAdd}
        aria-hidden="true"
      />

      {/* Panel: bottom sheet on mobile (translateY 24px -> 0), centered modal on desktop */}
      <div
        className="relative w-full sm:max-w-md bg-[#FAF7F2] rounded-t-2xl sm:rounded-2xl border border-[#E8DFD0] shadow-2xl p-5 sm:p-6 z-10 font-sans max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-300 ease-out"
        style={{
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Header Bar */}
        <div className="flex items-start justify-between pb-3 border-b border-[#E8DFD0]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#C59B27]">
            Quick Add to Bag
          </div>
          <button
            onClick={closeQuickAdd}
            className="p-1.5 rounded-full hover:bg-gray-200/60 text-gray-500 hover:text-gray-900 transition-colors"
            aria-label="Close Quick Add"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product Summary Row */}
        <div className="flex gap-4 py-4 items-center">
          <div className="w-20 h-24 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-200">
            {imageUrl ? (
              <img src={imageUrl} alt={activeProduct.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#5B111A] text-white flex items-center justify-center font-serif text-sm">
                RL
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-base sm:text-lg font-bold text-gray-900 line-clamp-1">
              {activeProduct.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {activeProduct.fabric || activeProduct.category || 'Pure Festive Wear'}
            </p>

            {/* Pricing */}
            <div className="flex items-baseline gap-2 mt-2">
              <span className="price-display text-base sm:text-lg font-bold text-[#5B111A]">
                {formatPrice(displaySellingPrice)}
              </span>
              {displayMrp && displayMrp > displaySellingPrice && (
                <span className="price-display text-xs text-gray-400 line-through">
                  {formatPrice(displayMrp)}
                </span>
              )}
              {discountPercent && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  {discountPercent}% OFF
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Size Selection */}
        <div className="space-y-2 py-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-900">
              Select Size: {selectedVariant && <span className="text-[#5B111A] font-bold">({selectedVariant.size})</span>}
            </span>
            {selectedVariant && selectedVariant.stock > 0 && selectedVariant.stock <= 5 && (
              <span className="text-[11px] font-bold text-amber-700 animate-pulse">
                Only {selectedVariant.stock} left
              </span>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {activeProduct.variants?.map((v) => {
              const soldOut = v.stock <= 0;
              const isSelected = selectedVariant?.id === v.id;

              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={soldOut}
                  onClick={() => setSelectedVariant(v)}
                  className={`h-10 rounded-lg border text-center transition-all ${
                    soldOut
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50 line-through'
                      : isSelected
                      ? 'bg-[#5B111A] text-white border-[#5B111A] shadow font-bold'
                      : 'bg-white text-gray-800 border-[#E8DFD0] hover:border-gray-400 font-medium'
                  }`}
                >
                  <span className="text-xs sm:text-sm">{v.size}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quantity Controls */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <span className="text-xs font-semibold text-gray-900">Quantity</span>
          <div className="flex items-center border border-gray-300 rounded-lg bg-white">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="p-1.5 hover:bg-gray-100 text-gray-700 disabled:opacity-40 transition-colors"
              title="Decrease"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-xs font-bold text-gray-900">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              disabled={Boolean(selectedVariant && quantity >= selectedVariant.stock)}
              className="p-1.5 hover:bg-gray-100 text-gray-700 disabled:opacity-40 transition-colors"
              title="Increase"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-3 border-t border-[#E8DFD0]">
          <button
            type="button"
            disabled={isSoldOut || !selectedVariant || selectedVariant.stock <= 0 || btnState === 'adding'}
            onClick={handleAddToCart}
            className="w-full py-3 px-4 rounded-lg bg-[#5B111A] hover:bg-[#460C13] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-ui font-semibold text-xs sm:text-sm uppercase tracking-wider transition-all shadow flex items-center justify-center gap-2"
          >
            {btnState === 'adding' ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ADDING...
              </span>
            ) : btnState === 'added' ? (
              <span className="inline-flex items-center gap-1.5 text-amber-200">
                <Check className="w-4 h-4" />
                ADDED ✓
              </span>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                <span>{isSoldOut ? 'Sold Out' : 'ADD TO CART'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              closeQuickAdd();
              navigate(`/product/${activeProduct.slug}`);
            }}
            className="w-full py-2.5 text-center text-xs font-semibold text-[#5B111A] hover:underline flex items-center justify-center gap-1"
          >
            <span>VIEW FULL PRODUCT DETAILS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
