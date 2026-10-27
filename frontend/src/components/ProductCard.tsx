import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../types/product';
import { formatPrice } from '../lib/api';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [imageError, setImageError] = useState(false);

  // Determine primary image
  const imageUrl =
    product.primary_image ||
    (product.images && product.images.length > 0 ? product.images[0].url : null);

  // Compute MRP and Selling Price
  const firstVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null;
  const sellingPrice = product.min_price ?? (firstVariant ? firstVariant.selling_price : 0);
  const mrp = firstVariant?.mrp ?? null;
  const isSoldOut = product.total_stock === 0 || product.badges.includes('Sold Out');

  // Choose badge style
  const primaryBadge = product.badges && product.badges.length > 0 ? product.badges[0] : null;

  return (
    <Link
      to={`/product/${product.slug}`}
      className={`group block bg-white rounded-lg overflow-hidden border border-[#E8DFD0] shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out ${
        isSoldOut ? 'opacity-90' : ''
      }`}
    >
      {/* Image container with reserved 3/4 aspect ratio */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#F0E9DF]">
        {/* Dynamic primary badge (Bestseller, Low Stock, etc.) */}
        {primaryBadge && (
          <div className="absolute top-2.5 left-2.5 z-10 no-motion">
            <span
              className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold tracking-wider uppercase shadow-sm ${
                primaryBadge === 'Sold Out'
                  ? 'bg-neutral-800 text-white'
                  : primaryBadge === 'Low Stock'
                  ? 'bg-amber-600 text-white'
                  : primaryBadge === 'Bestseller'
                  ? 'bg-[#C59B27] text-[#3A080F]'
                  : 'bg-[#5B111A] text-white'
              }`}
            >
              {primaryBadge}
            </span>
          </div>
        )}

        {/* Visible SAMPLE PHOTO badge on every card — visible on mobile and desktop */}
        <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none no-motion">
          <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded text-[9px] sm:text-[10px] font-bold tracking-wider uppercase bg-black/75 text-amber-200 border border-amber-400/40 shadow-sm backdrop-blur-[2px]">
            SAMPLE PHOTO
          </span>
        </div>

        {/* Sold out overlay */}
        {isSoldOut && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-[5] pointer-events-none flex items-center justify-center">
            <span className="bg-neutral-900/90 text-white text-xs sm:text-sm font-bold tracking-widest uppercase px-3 py-1 rounded shadow">
              Sold Out
            </span>
          </div>
        )}

        {/* Image or fallback */}
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={product.name}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover object-center group-hover:scale-[1.06] transition-transform duration-350 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center select-none bg-[#5B111A] text-[#FAF7F2]">
            <div className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center mb-2">
              <span className="font-serif text-base font-bold">RL</span>
            </div>
            <p className="font-serif font-semibold text-sm line-clamp-2">
              {product.name}
            </p>
            <span className="mt-2 text-[10px] uppercase tracking-widest opacity-80 border-t border-white/20 pt-1">
              {isSoldOut ? 'Sold Out' : 'Royal Libas'}
            </span>
          </div>
        )}
      </div>

      {/* Details container */}
      <div className="p-3 sm:p-4 flex flex-col justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#C59B27] truncate mb-0.5">
            {product.fabric || product.category || 'Boutique Collection'}
          </div>
          <h3 className="font-serif text-sm sm:text-base font-semibold text-gray-900 group-hover:text-[#5B111A] transition-colors line-clamp-1">
            {product.name}
          </h3>
        </div>

        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5 flex-wrap no-motion">
            <span className="price-display text-sm sm:text-base font-bold text-[#5B111A]">
              {formatPrice(sellingPrice)}
            </span>
            {mrp && mrp > sellingPrice && (
              <span className="price-display text-xs text-gray-600 line-through">
                {formatPrice(mrp)}
              </span>
            )}
          </div>

          {/* Sizes available preview */}
          {product.variants && product.variants.length > 0 && (
            <div className="hidden sm:flex gap-1 no-motion">
              {product.variants.map((v) => (
                <span
                  key={v.id}
                  className={`w-5 h-5 rounded text-[9px] flex items-center justify-center font-medium border ${
                    v.stock > 0
                      ? 'bg-gray-50 text-gray-700 border-gray-200'
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
  );
};
