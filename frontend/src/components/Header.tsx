import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X, Search, Heart, ChevronDown } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { BrandLogo } from './BrandLogo';
import { useStoreSettings } from '../lib/settings';
import { SearchModal } from './SearchModal';

export const Header: React.FC = () => {
  const location = useLocation();
  const { totalItems, openDrawer } = useCart();
  const { wishlistCount } = useWishlist();
  const { settings } = useStoreSettings();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [collectionsAccordionOpen, setCollectionsAccordionOpen] = useState(false);

  // Scroll detection (Point 9: reduce height smoothly after 60-100px)
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setSearchModalOpen(false);
  }, [location.pathname, location.search]);

  // Lock scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header
        className={`sticky top-0 z-40 bg-[#FAF7F2]/98 backdrop-blur-md transition-all duration-250 ease-out ${
          isScrolled
            ? 'shadow-[0_2px_12px_rgba(43,27,30,0.06)] border-b border-[#E8DFD0]'
            : 'border-b border-[#E8DFD0]'
        }`}
      >
        {/* Top Announcement Bar (Point 10) */}
        <div className="bg-[#5B111A] text-[#FAF7F2] text-[11px] sm:text-xs py-2 px-4 text-center tracking-wider font-medium flex items-center justify-center gap-2 transition-all duration-300">
          <span>Free shipping on orders above ₹{settings.freeShippingThreshold} | COD Available | 3-5 Days Delivery</span>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`flex items-center justify-between transition-all duration-250 ease-out ${
              isScrolled ? 'h-16' : 'h-20'
            }`}
          >
            {/* Mobile Hamburger Button */}
            <div className="flex items-center md:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 text-gray-800 hover:text-[#5B111A] focus:outline-none"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>

            {/* Logo / Brand Name - Option 5 Floral Motif Identity */}
            <Link
              to="/"
              className="group flex flex-col items-center justify-center focus:outline-none py-1 transition-transform duration-200 hover:scale-[1.01]"
              aria-label="Royal Libas Homepage"
            >
              <BrandLogo layout="compact" emblemSize={isScrolled ? 22 : 26} />
            </Link>

            {/* Desktop Navigation Links */}
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
                Shop All
              </Link>
              <div className="relative group">
                <Link
                  to="/shop?collection=festive-edit"
                  className={`transition-colors py-1 border-b-2 flex items-center gap-1 ${
                    location.search.includes('collection')
                      ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                      : 'text-gray-700 hover:text-[#5B111A] border-transparent'
                  }`}
                >
                  <span>Collections</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#5B111A] transition-transform duration-200 group-hover:rotate-180" />
                </Link>

                {/* Sub-menu Dropdown */}
                <div className="absolute top-full left-0 w-52 bg-white rounded-xl border border-[#E8DFD0] shadow-xl p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-50">
                  <Link
                    to="/shop?collection=festive-edit"
                    className="block px-3 py-2 rounded-lg text-xs font-semibold text-gray-800 hover:bg-[#FAF7F2] hover:text-[#5B111A]"
                  >
                    Festive Edit
                  </Link>
                  <Link
                    to="/shop?collection=everyday-cotton"
                    className="block px-3 py-2 rounded-lg text-xs font-semibold text-gray-800 hover:bg-[#FAF7F2] hover:text-[#5B111A]"
                  >
                    Everyday Cotton
                  </Link>
                  <Link
                    to="/shop?collection=bestsellers"
                    className="block px-3 py-2 rounded-lg text-xs font-semibold text-gray-800 hover:bg-[#FAF7F2] hover:text-[#5B111A]"
                  >
                    Bestsellers
                  </Link>
                </div>
              </div>
              <Link
                to="/about"
                className={`transition-colors py-1 border-b-2 ${
                  location.pathname === '/about'
                    ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                    : 'text-gray-700 hover:text-[#5B111A] border-transparent'
                }`}
              >
                About Tanya
              </Link>
            </nav>

            {/* Right Header Icons: Search, Wishlist, Bag */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                type="button"
                onClick={() => setSearchModalOpen(true)}
                className="p-2 text-gray-700 hover:text-[#5B111A] transition-colors focus:outline-none rounded-full hover:bg-gray-100/60"
                title="Search styles"
                aria-label="Open Search"
              >
                <Search className="w-5 h-5" />
              </button>

              <Link
                to="/shop?wishlist=true"
                className="relative p-2 text-gray-700 hover:text-[#5B111A] transition-colors focus:outline-none rounded-full hover:bg-gray-100/60"
                title="Wishlist"
                aria-label="View Wishlist"
              >
                <Heart className={`w-5 h-5 ${wishlistCount > 0 ? 'fill-[#5B111A] text-[#5B111A]' : ''}`} />
                {wishlistCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[#C59B27] text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center shadow-sm">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              <button
                type="button"
                onClick={openDrawer}
                className="relative p-2 text-gray-800 hover:text-[#5B111A] transition-colors focus:outline-none rounded-full hover:bg-gray-100/60 flex items-center gap-1.5"
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
      </header>

      {/* Search Overlay Modal (Point 7 & 8) */}
      <SearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />

      {/* Slide-in Mobile Menu (Point 11: translateX(-100%) -> 0) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div
            className="relative w-4/5 max-w-sm h-full bg-[#FAF7F2] shadow-2xl flex flex-col font-sans animate-in slide-in-from-left duration-300 ease-out"
            style={{
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {/* Header */}
            <div className="p-4 bg-white border-b border-[#E8DFD0] flex items-center justify-between">
              <BrandLogo layout="compact" emblemSize={24} />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu Links */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40"
              >
                Home
              </Link>
              <Link
                to="/shop"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40"
              >
                Shop All Boutique Styles
              </Link>

              {/* Collections Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() => setCollectionsAccordionOpen(!collectionsAccordionOpen)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 flex items-center justify-between"
                >
                  <span>Curated Collections</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                      collectionsAccordionOpen ? 'rotate-180 text-[#5B111A]' : ''
                    }`}
                  />
                </button>

                {collectionsAccordionOpen && (
                  <div className="pl-4 pr-2 py-1 space-y-1 text-xs border-l-2 border-[#C59B27] ml-3 mt-1 animate-in slide-in-from-top-1 duration-200">
                    <Link
                      to="/shop?collection=festive-edit"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5B111A] font-medium"
                    >
                      Festive Edit
                    </Link>
                    <Link
                      to="/shop?collection=everyday-cotton"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5B111A] font-medium"
                    >
                      Everyday Cotton Co-ords
                    </Link>
                    <Link
                      to="/shop?collection=bestsellers"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5B111A] font-medium"
                    >
                      Bestsellers
                    </Link>
                  </div>
                )}
              </div>

              <Link
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40"
              >
                About Tanya
              </Link>
              <Link
                to="/track-order"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40"
              >
                Track Your Order
              </Link>
              <Link
                to="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40"
              >
                Contact & Concierge
              </Link>
            </div>

            {/* Footer in Drawer */}
            <div className="p-4 bg-white border-t border-[#E8DFD0] text-center space-y-2">
              <p className="text-[11px] text-gray-500 font-serif">
                Royal Libas by Tanya &bull; Handcrafted Ethnic Wear
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
