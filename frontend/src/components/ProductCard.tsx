import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Plus } from 'lucide-react';
import { Product } from '../types/product';
import { formatPrice } from '../lib/api';
import { useWishlist } from '../context/WishlistContext';
import { useQuickAdd } from '../context/QuickAddContext';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { openQuickAdd } = useQuickAdd();

  const [primaryError, setPrimaryError] = useState(false);
  const [secondaryError, setSecondaryError] = useState(false);

  // Images
  const primaryImage =
    product.primary_image ||
    (product.images && product.images.length > 0 ? product.images[0].url : null);
  const secondaryImage =
    product.images && product.images.length > 1 ? product.images[1].url : null;

  // Prices and stock
  const firstVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null;
  const sellingPrice = product.min_price ?? (firstVariant ? firstVariant.selling_price : 0);
  const mrp = firstVariant?.mrp ?? null;
  const isSoldOut = product.total_stock === 0 || product.badges.includes('Sold Out');

  const inWishlist = isInWishlist(product.id);
  const primaryBadge = product.badges && product.badges.length > 0 ? product.badges[0] : null;

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product.id);
  };

  const handleQuickAddClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openQuickAdd(product);
  };

  return (
    <div
      className={`group relative bg-white rounded-none border border-[#E8DFD0] hover:border-[#B58A3C]/50 shadow-sm hover:shadow-[0_8px_24px_rgba(43,27,30,0.08)] transition-all duration-300 ease-out flex flex-col justify-between ${
        isSoldOut ? 'opacity-90' : ''
      }`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <Link to={`/product/${product.slug}`} className="block">
        {/* Image container with 3/4 aspect ratio */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#F6F1EA]">
          {/* Primary Luxury Badge */}
          {primaryBadge && (
            <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
              <span
                className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-none text-[9.5px] font-semibold tracking-[0.16em] uppercase shadow-sm ${
                  primaryBadge === 'Sold Out'
                    ? 'bg-[#2B1B1E] text-white'
                    : primaryBadge === 'Low Stock'
                    ? 'bg-[#8C6F5B] text-white'
                    : primaryBadge === 'Bestseller'
                    ? 'bg-[#B58A3C] text-white'
                    : 'bg-[#5E1224] text-[#FCF8F0]'
                }`}
              >
                {primaryBadge}
              </span>
            </div>
          )}

          {/* Wishlist Heart Icon */}
          <button
            type="button"
            onClick={handleWishlistClick}
            className={`absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
              inWishlist
                ? 'bg-white text-[#5E1224] shadow-md scale-105'
                : 'bg-white/90 text-gray-700 hover:text-[#5E1224] hover:bg-white hover:scale-105 shadow-sm'
            }`}
            aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                inWishlist ? 'fill-[#5E1224] stroke-[#5E1224]' : 'stroke-current'
              }`}
            />
          </button>

          {/* Sold Out Overlay */}
          {isSoldOut && (
            <div className="absolute inset-0 bg-[#FCF8F0]/70 backdrop-blur-[1px] z-[5] pointer-events-none flex items-center justify-center">
              <span className="bg-[#2B1B1E] text-white text-[11px] sm:text-xs font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 shadow">
                Sold Out
              </span>
            </div>
          )}

          {/* Image with Secondary Crossfade & Soft Scale */}
          <div className="relative w-full h-full overflow-hidden">
            {primaryImage && !primaryError ? (
              <img
                src={primaryImage}
                alt={product.name}
                onError={() => setPrimaryError(true)}
                className={`absolute inset-0 w-full h-full object-cover object-top transition-all duration-500 ease-out group-hover:scale-[1.03] ${
                  secondaryImage && !secondaryError ? 'group-hover:opacity-0' : ''
                }`}
                loading="lazy"
                style={{
                  transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center select-none bg-[#5E1224] text-[#FCF8F0]">
                <div className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center mb-2">
                  <span className="font-serif text-base font-bold">RL</span>
                </div>
                <p className="font-serif font-semibold text-sm line-clamp-2">{product.name}</p>
              </div>
            )}

            {/* Secondary image for soft crossfade on desktop hover */}
            {secondaryImage && !secondaryError && (
              <img
                src={secondaryImage}
                alt={`${product.name} alternate view`}
                onError={() => setSecondaryError(true)}
                className="hidden sm:block absolute inset-0 w-full h-full object-cover object-center opacity-0 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-300 ease-out"
                loading="lazy"
                style={{
                  transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            )}
          </div>

          {/* Desktop Hover Quick Add Button (Point 1 & 2) */}
          {!isSoldOut && (
            <div className="hidden sm:block absolute inset-x-3 bottom-3 z-20 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-250 ease-out pointer-events-none group-hover:pointer-events-auto">
              <button
                type="button"
                onClick={handleQuickAddClick}
                className="w-full py-2.5 px-3 bg-[#5E1224]/95 hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-ui font-semibold rounded-none border border-[#B58A3C]/50 shadow-md backdrop-blur-sm tracking-[0.14em] uppercase flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[#B58A3C]" />
                <span>Quick Add</span>
              </button>
            </div>
          )}
        </div>

        {/* Details Container */}
        <div className="p-3.5 sm:p-4 bg-white">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B58A3C] truncate">
              {product.fabric || product.category || 'Atelier Collection'}
            </span>
            {/* 5-star preview */}
            <div className="flex items-center text-[11px] text-[#B58A3C] tracking-tighter" aria-label="5 stars">
              ★★★★★
            </div>
          </div>

          <h3 className="font-serif text-sm sm:text-base font-semibold text-[#2B1B1E] group-hover:text-[#5E1224] transition-colors line-clamp-1">
            {product.name}
          </h3>

          {/* Color dots preview matching PDF Page 3 & 4 */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5E1224] border border-black/10 inline-block" title="Maroon" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#B58A3C] border border-black/10 inline-block" title="Gold" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#FCF8F0] border border-gray-300 inline-block" title="Ivory" />
          </div>

          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-baseline gap-2 flex-wrap no-motion">
              <span className="price-display text-sm sm:text-base font-bold text-[#5E1224]">
                {formatPrice(sellingPrice)}
              </span>
              {mrp && mrp > sellingPrice && (
                <span className="price-display text-xs text-gray-400 line-through">
                  {formatPrice(mrp)}
                </span>
              )}
            </div>

            {/* Sizes available preview */}
            {product.variants && product.variants.length > 0 && (
              <div className="hidden sm:flex gap-1 no-motion">
                {product.variants.slice(0, 4).map((v) => (
                  <span
                    key={v.id}
                    className={`w-5 h-5 rounded text-[9px] flex items-center justify-center font-medium border ${
                      v.stock > 0
                        ? 'bg-[#FCF8F0] text-gray-700 border-[#E8DFD0]'
                        : 'bg-gray-100 text-gray-400 line-through border-gray-200'
                    }`}
                    title={`${v.size}: ${v.stock > 0 ? `${v.stock} in stock` : 'Sold out'}`}
                  >
                    {v.size}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Mobile-Only Quick Add Button Strip (Point 1: Do NOT depend on hover) */}
      {!isSoldOut && (
        <div className="sm:hidden px-3 pb-3 bg-white">
          <button
            type="button"
            onClick={handleQuickAddClick}
            className="w-full py-2 bg-[#FCF8F0] hover:bg-[#5E1224] text-[#5E1224] hover:text-[#FCF8F0] border border-[#B58A3C]/40 text-[11px] font-ui font-semibold rounded-none tracking-[0.14em] uppercase flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#B58A3C]" />
            <span>Quick Add</span>
          </button>
        </div>
      )}
    </div>
  );
};
