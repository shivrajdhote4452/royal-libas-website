import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SAMPLE_PRODUCTS } from '../data/sampleProducts';

export const Product: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const product = SAMPLE_PRODUCTS.find((p) => p.id === id || p.slug === id);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  const [selectedSize, setSelectedSize] = useState<string>('M');

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="font-serif text-2xl font-bold text-[#5B111A] mb-4">
          Sample Product Not Found
        </h2>
        <p className="text-gray-600 mb-6">
          The requested sample item does not exist in the Phase 0 sample catalogue.
        </p>
        <Link
          to="/"
          className="inline-flex items-center px-5 py-2.5 rounded bg-[#5B111A] text-white font-medium hover:bg-[#3A080F] transition-colors"
        >
          Return to Home
        </Link>
      </div>
    );
  }

  const handleImageError = (index: number) => {
    setImageErrors((prev) => ({ ...prev, [index]: true }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-xs sm:text-sm text-gray-500 flex items-center gap-2">
        <Link to="/" className="hover:text-[#5B111A] transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link to="/shop" className="hover:text-[#5B111A] transition-colors">
          Sample Shop
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
        {/* Left Column: Image Gallery with 3 Sample Images */}
        <div className="flex flex-col gap-4">
          {/* Main Large Image Container */}
          <div className="relative aspect-[4/5] w-full rounded-lg overflow-hidden bg-[#F0E9DF] border border-[#E8DFD0] shadow-sm">
            {/* Prominent SAMPLE PHOTO Badge */}
            <div className="absolute top-4 left-4 z-20">
              <span className="inline-flex items-center px-3 py-1.5 rounded bg-[#5B111A] text-[#FAF7F2] text-xs font-bold tracking-wider uppercase shadow-lg border border-[#C59B27]/50">
                SAMPLE PHOTO
              </span>
            </div>

            {/* Main Image or Coloured Placeholder Box */}
            {!imageErrors[activeImageIndex] ? (
              <img
                src={product.images[activeImageIndex]}
                alt={`Sample photo ${activeImageIndex + 1} of ${product.name}`}
                onError={() => handleImageError(activeImageIndex)}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center p-8 text-center select-none"
                style={{
                  backgroundColor: product.placeholderBgColor,
                  color: product.placeholderTextColor,
                }}
              >
                <div className="w-16 h-16 rounded-full border border-current/30 flex items-center justify-center mb-4">
                  <span className="font-serif text-2xl font-bold">RL</span>
                </div>
                <h3 className="font-serif font-bold text-2xl leading-snug">
                  {product.name}
                </h3>
                <p className="mt-2 text-sm opacity-90">Sample Image {activeImageIndex + 1} of 3</p>
                <span className="mt-4 text-xs uppercase tracking-widest opacity-80 border-t border-current/20 pt-2">
                  Coloured Placeholder Box
                </span>
              </div>
            )}
          </div>

          {/* 3 Sample Images Thumbnails */}
          <div className="grid grid-cols-3 gap-3">
            {product.images.map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveImageIndex(idx)}
                className={`relative aspect-[4/5] rounded-md overflow-hidden border-2 transition-all text-left ${
                  activeImageIndex === idx
                    ? 'border-[#5B111A] ring-2 ring-[#C59B27]/50'
                    : 'border-transparent hover:border-gray-300 opacity-80 hover:opacity-100'
                }`}
              >
                {/* Small SAMPLE tag on thumbnails */}
                <span className="absolute top-1 left-1 z-10 text-[9px] font-bold px-1 py-0.5 rounded bg-[#5B111A]/90 text-[#FAF7F2]">
                  SAMPLE {idx + 1}
                </span>

                {!imageErrors[idx] ? (
                  <img
                    src={imgUrl}
                    alt={`Thumbnail ${idx + 1}`}
                    onError={() => handleImageError(idx)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-[11px] font-medium p-1 text-center"
                    style={{
                      backgroundColor: product.placeholderBgColor,
                      color: product.placeholderTextColor,
                    }}
                  >
                    Image {idx + 1}
                  </div>
                )}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-500 italic text-center">
            Click any thumbnail above to view all 3 seeded sample images.
          </p>
        </div>

        {/* Right Column: Product Info & Sample Badges */}
        <div className="flex flex-col justify-start">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#EAD186]/40 text-[#5B111A] text-xs font-semibold uppercase tracking-wider w-fit mb-3 border border-[#C59B27]/30">
            Sample Item (is_sample = true)
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            {product.name}
          </h1>

          <div className="mt-3 flex items-baseline gap-3 pb-5 border-b border-[#E8DFD0]">
            <span className="text-xs uppercase font-semibold text-gray-500">
              Sample Price:
            </span>
            <span className="text-3xl font-bold text-[#5B111A]">
              {product.sample_price_label}
            </span>
          </div>

          {/* Fabric Info */}
          <div className="mt-5">
            <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">
              Fabric
            </span>
            <p className="text-base font-medium text-gray-800 mt-1">
              {product.fabric}
            </p>
          </div>

          {/* Sizes with Sample Stock */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">
                Select Size (Sample Stock Count)
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {product.sizes.map((s) => (
                <button
                  key={s.size}
                  type="button"
                  onClick={() => setSelectedSize(s.size)}
                  className={`py-3 px-2 rounded border text-center transition-all ${
                    selectedSize === s.size
                      ? 'border-[#5B111A] bg-[#5B111A]/5 text-[#5B111A] font-bold shadow-sm'
                      : 'border-gray-200 hover:border-gray-400 text-gray-700'
                  }`}
                >
                  <div className="text-base font-semibold">{s.size}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {s.stock} in stock
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="mt-6">
            <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">
              Description
            </span>
            <p className="mt-2 text-sm text-gray-700 leading-relaxed">
              {product.description}
            </p>
          </div>

          {/* Phase 0 Limitation Notice Box */}
          <div className="mt-8 p-4 rounded-lg bg-[#FAF7F2] border border-[#C59B27]/40 text-xs text-gray-700 space-y-2">
            <div className="font-semibold text-[#5B111A] flex items-center gap-1.5 uppercase tracking-wide">
              <span>Phase 0 Scaffold Notice</span>
            </div>
            <p>
              Cart, checkout, Razorpay, and ordering capabilities will be implemented in subsequent phases per the build plan.
            </p>
            <p className="text-gray-500 italic">
              All photos and prices shown are non-commercial placeholders to be replaced with Tanya's authentic catalog in Phase 6.
            </p>
          </div>

          <div className="mt-8">
            <Link
              to="/"
              className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3 rounded border border-[#5B111A] text-[#5B111A] hover:bg-[#5B111A] hover:text-white transition-colors text-sm font-medium"
            >
              ← Back to Sample Catalogue
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
