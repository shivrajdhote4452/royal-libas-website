import React from 'react';
import { ProductCard } from '../components/ProductCard';
import { SAMPLE_PRODUCTS } from '../data/sampleProducts';

export const Home: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-[#FAF7F2] to-[#F3ECE0] border-b border-[#E8DFD0] py-14 sm:py-20 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#5B111A]/10 text-[#5B111A] text-xs font-semibold uppercase tracking-wider mb-5">
            <span className="w-2 h-2 rounded-full bg-[#C59B27] animate-pulse"></span>
            Phase 0 Scaffold
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold text-[#5B111A] tracking-tight">
            Royal Libas by Tanya
          </h1>
          <p className="mt-4 text-lg sm:text-xl font-medium text-gray-700 tracking-wide font-serif italic">
            Sample catalogue — real photos coming in Phase 6
          </p>
          <p className="mt-3 text-sm text-gray-500 max-w-xl mx-auto">
            This is a development scaffolding preview. All catalogue items, prices, and imagery displayed below are non-commercial sample mockups.
          </p>
        </div>
      </section>

      {/* Product Grid Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 flex-1 w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 pb-4 border-b border-[#E8DFD0]">
          <div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Sample Catalogue Preview
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Showing all 5 sample sets with mock stock and placeholder photography
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded bg-[#EAD186]/50 text-[#5B111A] mt-2 sm:mt-0 inline-block border border-[#C59B27]/30">
            5 Sample Products
          </span>
        </div>

        {/* 5 Sample Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {SAMPLE_PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Footer Info */}
      <footer className="bg-white border-t border-[#E8DFD0] py-8 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-serif text-sm font-semibold text-[#5B111A] mb-1">
            Royal Libas by Tanya
          </p>
          <p>Phase 0: Scaffold + Sample Catalogue only. No online checkout or payments active in this phase.</p>
        </div>
      </footer>
    </div>
  );
};
