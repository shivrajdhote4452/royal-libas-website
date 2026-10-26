import React from 'react';
import { ProductCard } from '../components/ProductCard';
import { SAMPLE_PRODUCTS } from '../data/sampleProducts';

export const Shop: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Page Header */}
      <div className="mb-8 pb-4 border-b border-[#E8DFD0]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-widest font-bold text-[#C59B27]">
            Catalogue Placeholder
          </span>
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#5B111A]">
          Sample Shop
        </h1>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
          Browse the 5 mock sample items created for Phase 0 layout verification. Full shop filtering, sorting, and categories will be implemented in subsequent phases.
        </p>
      </div>

      {/* Grid of sample products */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {SAMPLE_PRODUCTS.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
};
