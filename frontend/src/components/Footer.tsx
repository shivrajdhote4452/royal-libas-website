import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, ShieldCheck, RefreshCw, Truck } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#FAF7F2] border-t border-[#E8DFD0] pt-14 pb-10 text-gray-700 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12 pb-12 border-b border-[#E8DFD0]">
          {/* Brand Col */}
          <div className="space-y-4">
            <Link to="/" className="inline-block transition-transform hover:scale-[1.01]" aria-label="Royal Libas Homepage">
              <BrandLogo layout="horizontal" emblemSize={42} />
            </Link>
            <p className="text-xs text-gray-600 leading-relaxed">
              Curated festive silhouettes and effortless everyday co-ord sets. Designed with pure breathable textiles and artisanal craftsmanship in Jaipur, Rajasthan.
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
              <Link
                to="/contact"
                className="w-8 h-8 rounded-full bg-[#5B111A]/10 text-[#5B111A] flex items-center justify-center hover:bg-[#5B111A] hover:text-white transition-colors"
                aria-label="Email: To be confirmed by Tanya"
                title="Email: To be confirmed by Tanya"
              >
                <Mail className="w-4 h-4" />
              </Link>
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
                <Link to="/shop?collection=bestsellers" className="hover:text-[#5B111A] transition-colors">
                  Bestsellers
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
              Customer Care & Policies
            </h4>
            <ul className="space-y-2.5 text-xs text-gray-600">
              <li>
                <Link to="/track-order" className="hover:text-[#5B111A] transition-colors font-medium text-[#5B111A]">
                  Track Your Order →
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-[#5B111A] transition-colors">
                  About Tanya & Atelier Story
                </Link>
              </li>
              <li>
                <Link to="/shipping-policy" className="hover:text-[#5B111A] transition-colors">
                  Shipping & Delivery Info (3–5 Days)
                </Link>
              </li>
              <li>
                <Link to="/return-policy" className="hover:text-[#5B111A] transition-colors">
                  7-Day Size Exchange Promise
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-[#5B111A] transition-colors">
                  Contact & WhatsApp Concierge
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="hover:text-[#5B111A] transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms-of-service" className="hover:text-[#5B111A] transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust Guarantees */}
          <div className="bg-white p-5 rounded-xl border border-[#E8DFD0] space-y-3.5 shadow-sm">
            <h4 className="font-serif font-bold text-[#5B111A] text-xs uppercase tracking-wider">
              Boutique Promise
            </h4>
            <div className="flex items-start gap-2.5 text-xs text-gray-600">
              <Truck className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
              <span>Free Delivery across India on prepaid orders. COD available.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-600">
              <RefreshCw className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
              <span>Hassle-free 7-day doorstep size exchange.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-600">
              <ShieldCheck className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
              <span>100% Genuine Handcrafted Pieces tailored in Jaipur.</span>
            </div>
          </div>
        </div>

        {/* Bottom Credits */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4 text-center sm:text-left">
          <p>© {new Date().getFullYear()} Royal Libas by Tanya. Handcrafted in Jaipur, India. All rights reserved.</p>
          <div className="flex items-center gap-4 text-gray-400">
            <Link to="/privacy-policy" className="hover:text-gray-600 transition-colors">Privacy</Link>
            <span>•</span>
            <Link to="/terms-of-service" className="hover:text-gray-600 transition-colors">Terms</Link>
            <span>•</span>
            <Link to="/contact" className="hover:text-gray-600 transition-colors">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
