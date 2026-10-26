import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X } from 'lucide-react';
import { useCart } from '../context/CartContext';

export const Header: React.FC = () => {
  const location = useLocation();
  const { totalItems } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E8DFD0]">
      {/* Top Notice Bar */}
      <div className="bg-[#5B111A] text-[#FAF7F2] text-xs py-1.5 px-4 text-center tracking-wider font-medium">
        <span className="inline-block px-2 py-0.5 bg-[#C59B27] text-[#3A080F] text-[10px] font-bold rounded mr-2 uppercase tracking-widest">
          Notice
        </span>
        Sample catalogue demonstration — Real photos coming in Phase 6
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

          {/* Logo / Brand Name */}
          <Link to="/" className="group flex flex-col items-center md:items-start focus:outline-none">
            <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#5B111A] group-hover:text-[#3A080F] transition-colors">
              Royal Libas
            </span>
            <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-[#C59B27] -mt-1 font-medium">
              by Tanya
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium">
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
                location.pathname === '/shop'
                  ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                  : 'text-gray-700 hover:text-[#5B111A] border-transparent'
              }`}
            >
              Shop
            </Link>
            <Link
              to="/shop?collection=festive-edit"
              className="text-gray-700 hover:text-[#5B111A] transition-colors py-1 border-b-2 border-transparent"
            >
              Festive Edit
            </Link>
            <Link
              to="/shop?collection=everyday-cotton"
              className="text-gray-700 hover:text-[#5B111A] transition-colors py-1 border-b-2 border-transparent"
            >
              Everyday Cotton
            </Link>
            <Link
              to="/track-order"
              className={`transition-colors py-1 border-b-2 ${
                location.pathname === '/track-order'
                  ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                  : 'text-gray-700 hover:text-[#5B111A] border-transparent'
              }`}
            >
              Track Order
            </Link>
          </nav>

          {/* Right Header Action: Cart with Badge */}
          <div className="flex items-center space-x-4">
            <Link
              to="/cart"
              className="relative p-2 text-gray-800 hover:text-[#5B111A] transition-colors focus:outline-none flex items-center gap-1.5"
              aria-label="Shopping Cart"
            >
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-gray-700">
                Cart
              </span>
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 sm:top-0 sm:right-auto bg-[#5B111A] text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#FAF7F2] shadow-sm">
                  {totalItems}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-[#E8DFD0] px-4 pt-3 pb-6 space-y-3 shadow-lg">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded text-base font-medium text-gray-800 hover:bg-[#FAF7F2] hover:text-[#5B111A]"
          >
            Home
          </Link>
          <Link
            to="/shop"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded text-base font-medium text-gray-800 hover:bg-[#FAF7F2] hover:text-[#5B111A]"
          >
            Shop All
          </Link>
          <Link
            to="/shop?collection=festive-edit"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded text-base font-medium text-gray-800 hover:bg-[#FAF7F2] hover:text-[#5B111A]"
          >
            Festive Edit
          </Link>
          <Link
            to="/shop?collection=everyday-cotton"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded text-base font-medium text-gray-800 hover:bg-[#FAF7F2] hover:text-[#5B111A]"
          >
            Everyday Cotton
          </Link>
          <Link
            to="/track-order"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded text-base font-medium text-gray-800 hover:bg-[#FAF7F2] hover:text-[#5B111A]"
          >
            Track Order
          </Link>
        </div>
      )}
    </header>
  );
};
