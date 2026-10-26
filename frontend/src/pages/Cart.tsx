import React from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/api';

export const Cart: React.FC = () => {
  const { items, totalItems, subtotal, removeFromCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <div className="w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#E8DFD0] flex items-center justify-center text-gray-400 mb-4">
          <ShoppingBag className="w-8 h-8 text-[#C59B27]" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">
          Your Cart is Empty
        </h2>
        <p className="text-xs sm:text-sm text-gray-600 mb-6 max-w-sm">
          Discover our latest festive arrivals and effortless cotton co-ord sets.
        </p>
        <Link
          to="/shop"
          className="inline-flex items-center px-6 py-3 rounded bg-[#5B111A] hover:bg-[#3A080F] text-white text-xs sm:text-sm font-semibold transition-colors shadow"
        >
          Explore the Shop
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 min-h-screen">
      <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A] mb-6">
        Your Shopping Bag ({totalItems} {totalItems === 1 ? 'item' : 'items'})
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items List */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.variantId}
              className="bg-white p-4 rounded-lg border border-[#E8DFD0] flex gap-4 items-center shadow-sm"
            >
              <div className="w-20 h-24 rounded overflow-hidden bg-gray-100 shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#5B111A] text-white text-[10px] flex items-center justify-center p-1 text-center">
                    {item.name}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <Link
                  to={`/product/${item.slug}`}
                  className="font-serif font-semibold text-sm sm:text-base text-gray-900 hover:text-[#5B111A] truncate block"
                >
                  {item.name}
                </Link>
                <div className="text-xs text-gray-500 mt-0.5">
                  Size: <strong className="text-gray-800">{item.size}</strong> | Qty: {item.quantity}
                </div>
                <div className="text-sm font-bold text-[#5B111A] mt-2">
                  {formatPrice(item.sellingPrice * item.quantity)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeFromCart(item.variantId)}
                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                title="Remove Item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Order Summary & Notice */}
        <div className="bg-white p-6 rounded-lg border border-[#E8DFD0] shadow-sm h-fit space-y-4">
          <h2 className="font-serif font-bold text-lg text-gray-900 border-b border-gray-100 pb-3">
            Order Summary
          </h2>

          <div className="space-y-2 text-xs sm:text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Estimated Shipping</span>
              <span className="text-emerald-700 font-semibold">FREE (Prepaid)</span>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3 flex justify-between items-baseline">
            <span className="font-bold text-gray-900">Total</span>
            <span className="font-serif text-xl font-bold text-[#5B111A]">
              {formatPrice(subtotal)}
            </span>
          </div>

          <div className="p-3 bg-amber-50 rounded border border-amber-200 text-xs text-amber-900 leading-relaxed">
            <p className="font-bold mb-0.5">Phase 3 Notice:</p>
            <p>Cart storage & live item count are fully functional. Checkout and Razorpay integration will be built in <strong>Phase 4</strong>.</p>
          </div>

          <Link
            to="/shop"
            className="w-full py-3 bg-[#5B111A] hover:bg-[#3A080F] text-white text-xs sm:text-sm font-semibold uppercase tracking-wider rounded transition-colors text-center block shadow"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
};
