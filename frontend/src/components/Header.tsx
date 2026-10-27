import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X, Search, Heart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { BrandLogo } from './BrandLogo';
import { useStoreSettings } from '../lib/settings';

export const Header: React.FC = () => {
  const location = useLocation();
  const { totalItems, openDrawer } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { settings } = useStoreSettings();

  return (
    <header className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E8DFD0]">
      {/* Top Boutique Announcement Bar - Option C Exact Text */}
      <div className="bg-[#5B111A] text-[#FAF7F2] text-[11px] sm:text-xs py-2 px-4 text-center tracking-wider font-medium flex items-center justify-center gap-2">
        <span>Free shipping on orders above ₹{settings.freeShippingThreshold} | COD Available | 3-5 Days Delivery</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-700 hover:text-[#5B111A] focus:outline-none"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Logo / Brand Name - Option 5 Floral Motif Identity */}
          <Link
            to="/"
            className="group flex flex-col items-center justify-center focus:outline-none py-1 transition-transform hover:scale-[1.01]"
            aria-label="Royal Libas Homepage"
          >
            <BrandLogo layout="compact" emblemSize={26} />
          </Link>

          {/* Desktop Navigation Links - Option C */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium font-ui">
            <Link
              to="/"
              className={`transition-colors py-1 border-b-2 ${
                location.pathname === '/'
                  ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                  : 'text-gray-700 hover:text-[#5B111A] border-transparent'
              }`}
            >
              Home
            </Link>
            <Link
              to="/shop"
              className={`transition-colors py-1 border-b-2 ${
                location.pathname === '/shop' && !location.search
                  ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                  : 'text-gray-700 hover:text-[#5B111A] border-transparent'
              }`}
            >
              Shop
            </Link>
            <Link
              to="/shop?collection=festive-edit"
              className={`transition-colors py-1 border-b-2 ${
                location.search.includes('collection')
                  ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                  : 'text-gray-700 hover:text-[#5B111A] border-transparent'
              }`}
            >
              Collections
            </Link>
            <Link
              to="/about"
              className={`transition-colors py-1 border-b-2 ${
                location.pathname === '/about'
                  ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                  : 'text-gray-700 hover:text-[#5B111A] border-transparent'
              }`}
            >
              About
            </Link>
          </nav>

          {/* Right Header Icons - Option C (Search, Wishlist, Cart) */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <Link
              to="/shop"
              className="p-2 text-gray-700 hover:text-[#5B111A] transition-colors focus:outline-none"
              title="Search catalogue"
              aria-label="Search catalogue"
            >
              <Search className="w-5 h-5" />
            </Link>
            <Link
              to="/shop"
              className="hidden sm:inline-flex p-2 text-gray-700 hover:text-[#5B111A] transition-colors focus:outline-none"
              title="Wishlist"
              aria-label="Wishlist"
            >
              <Heart className="w-5 h-5" />
            </Link>
            <button
              type="button"
              onClick={openDrawer}
              className="relative p-2 text-gray-800 hover:text-[#5B111A] transition-colors focus:outline-none flex items-center gap-1.5"
              aria-label="Open Shopping Bag"
            >
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
              {totalItems > 0 && (
                <span
                  key={totalItems}
                  className="absolute -top-1 -right-1 bg-[#5B111A] text-white text-[11px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-[#FAF7F2] animate-cart-bounce shadow-sm font-ui"
                >
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#FAF7F2] border-b border-[#E8DFD0] px-4 pt-3 pb-6 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-center pb-2.5 border-b border-[#E8DFD0]/80">
            <BrandLogo layout="compact" emblemSize={24} />
          </div>
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-base font-medium ${
              location.pathname === '/' ? 'bg-[#5B111A] text-white' : 'text-gray-800 hover:bg-[#E8DFD0]/50'
            }`}
          >
            Home
          </Link>
          <Link
            to="/shop"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-base font-medium ${
              location.pathname === '/shop' ? 'bg-[#5B111A] text-white' : 'text-gray-800 hover:bg-[#E8DFD0]/50'
            }`}
          >
            Shop All Designs
          </Link>
          <Link
            to="/shop?collection=festive-edit"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-800 hover:bg-[#E8DFD0]/50"
          >
            Festive Edit
          </Link>
          <Link
            to="/shop?collection=everyday-cotton"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-800 hover:bg-[#E8DFD0]/50"
          >
            Everyday Cotton Co-ords
          </Link>
          <Link
            to="/about"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-base font-medium ${
              location.pathname === '/about' ? 'bg-[#5B111A] text-white' : 'text-gray-800 hover:bg-[#E8DFD0]/50'
            }`}
          >
            About Tanya & Atelier
          </Link>
          <Link
            to="/contact"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-base font-medium ${
              location.pathname === '/contact' ? 'bg-[#5B111A] text-white' : 'text-gray-800 hover:bg-[#E8DFD0]/50'
            }`}
          >
            Contact & WhatsApp
          </Link>
          <Link
            to="/track-order"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-base font-medium ${
              location.pathname === '/track-order' ? 'bg-[#5B111A] text-white' : 'text-gray-800 hover:bg-[#E8DFD0]/50'
            }`}
          >
            Track Order
          </Link>
        </div>
      )}
    </header>
  );
};
