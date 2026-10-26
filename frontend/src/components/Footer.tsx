import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, ShieldCheck, RefreshCw, Truck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#FAF7F2] border-t border-[#E8DFD0] pt-14 pb-10 text-gray-700 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12 pb-12 border-b border-[#E8DFD0]">
          {/* Brand Col */}
          <div className="space-y-4">
            <Link to="/" className="inline-block">
              <span className="font-serif text-2xl font-bold tracking-tight text-[#5B111A]">
                Royal Libas
              </span>
              <span className="block text-[10px] uppercase tracking-[0.25em] text-[#C59B27] -mt-1 font-medium">
                by Tanya
              </span>
            </Link>
            <p className="text-xs text-gray-600 leading-relaxed">
              Curated festive silhouettes and effortless everyday co-ord sets. Designed with premium fabrics and artisanal craftsmanship for modern women.
            </p>
            <div className="flex items-center space-x-3 pt-1">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#5B111A]/10 text-[#5B111A] flex items-center justify-center hover:bg-[#5B111A] hover:text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="mailto:contact@royallibas.com"
                className="w-8 h-8 rounded-full bg-[#5B111A]/10 text-[#5B111A] flex items-center justify-center hover:bg-[#5B111A] hover:text-white transition-colors"
                aria-label="Email"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-serif font-bold text-[#5B111A] text-sm uppercase tracking-wider mb-4">
              Explore Collections
            </h4>
            <ul className="space-y-2.5 text-xs text-gray-600">
              <li>
                <Link to="/shop" className="hover:text-[#5B111A] transition-colors">
                  All Designs
                </Link>
              </li>
              <li>
                <Link to="/shop?collection=festive-edit" className="hover:text-[#5B111A] transition-colors">
                  Festive Edit
                </Link>
              </li>
              <li>
                <Link to="/shop?collection=everyday-cotton" className="hover:text-[#5B111A] transition-colors">
                  Everyday Cotton Co-ords
                </Link>
              </li>
              <li>
                <Link to="/shop?category=Kurti+Sets" className="hover:text-[#5B111A] transition-colors">
                  Kurti Sets
                </Link>
              </li>
            </ul>
          </div>

          {/* Customer Care & Policies */}
          <div>
            <h4 className="font-serif font-bold text-[#5B111A] text-sm uppercase tracking-wider mb-4">
              Customer Care
            </h4>
            <ul className="space-y-2.5 text-xs text-gray-600">
              <li>
                <Link to="/track-order" className="hover:text-[#5B111A] transition-colors">
                  Track Your Order
                </Link>
              </li>
              <li>
                <span className="text-gray-500 cursor-default">Size Chart & Fit Guide</span>
              </li>
              <li>
                <span className="text-gray-500 cursor-default">7-Day Size Exchange Policy</span>
              </li>
              <li>
                <span className="text-gray-500 cursor-default">Shipping & Delivery Info (3–5 Days)</span>
              </li>
            </ul>
          </div>

          {/* Trust Guarantees */}
          <div className="bg-white p-4 rounded-lg border border-[#E8DFD0] space-y-3">
            <h4 className="font-serif font-bold text-[#5B111A] text-xs uppercase tracking-wider">
              Boutique Promise
            </h4>
            <div className="flex items-start gap-2.5 text-xs text-gray-600">
              <Truck className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
              <span>Free Delivery across India on prepaid orders. COD available.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-600">
              <RefreshCw className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
              <span>Hassle-free size exchange within 7 days.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-600">
              <ShieldCheck className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
              <span>100% Genuine Handcrafted Pieces.</span>
            </div>
          </div>
        </div>

        {/* Bottom Credits & Phase Notice */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4 text-center sm:text-left">
          <p>© {new Date().getFullYear()} Royal Libas by Tanya. All rights reserved.</p>
          <p className="italic">
            Phase 3: Storefront Shell, Home, Shop & Product with Live API Integration.
          </p>
        </div>
      </div>
    </footer>
  );
};
