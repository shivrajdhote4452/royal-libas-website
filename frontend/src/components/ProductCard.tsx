import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../types/product';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <Link
      to={`/product/${product.id}`}
      className="group block bg-white rounded-lg overflow-hidden border border-[#E8DFD0] shadow-sm hover:shadow-md transition-all duration-300"
    >
      {/* Image container */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#F0E9DF]">
        {/* Prominent SAMPLE PHOTO Badge */}
        <div className="absolute top-3 left-3 z-10">
          <span className="inline-flex items-center px-2.5 py-1 rounded bg-[#5B111A] text-[#FAF7F2] text-xs font-semibold tracking-wider uppercase shadow-md border border-[#C59B27]/40">
            SAMPLE PHOTO
          </span>
        </div>

        {/* Image or Coloured Fallback Box */}
        {!imageError ? (
          <img
            src={product.images[0]}
            alt={`Sample: ${product.name}`}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none"
            style={{
              backgroundColor: product.placeholderBgColor,
              color: product.placeholderTextColor,
            }}
          >
            <div className="w-12 h-12 rounded-full border border-current/30 flex items-center justify-center mb-3">
              <span className="font-serif text-lg font-bold">RL</span>
            </div>
            <p className="font-serif font-semibold text-lg leading-snug">
              {product.name}
            </p>
            <span className="mt-2 text-xs uppercase tracking-widest opacity-80 border-t border-current/20 pt-2">
              Sample Placeholder
            </span>
          </div>
        )}
      </div>

      {/* Details container */}
      <div className="p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-[#C59B27] mb-1">
            {product.fabric}
          </div>
          <h3 className="font-serif text-base sm:text-lg font-semibold text-gray-900 group-hover:text-[#5B111A] transition-colors line-clamp-1">
            {product.name}
          </h3>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] block uppercase font-medium text-gray-500">
              Sample Price
            </span>
            <span className="text-base sm:text-lg font-bold text-[#5B111A]">
              {product.sample_price_label}
            </span>
          </div>

          <div className="flex gap-1">
            {product.sizes.map((s) => (
              <span
                key={s.size}
                className="w-6 h-6 rounded text-[10px] flex items-center justify-center font-medium bg-gray-100 text-gray-700 border border-gray-200"
                title={`Sample Stock: ${s.stock}`}
              >
                {s.size}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
};
