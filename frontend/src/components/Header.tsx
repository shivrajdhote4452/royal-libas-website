import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X, Search, Heart, ChevronDown, User } from 'lucide-react';
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

  const dynamicAnnouncement = settings.codEnabled
    ? (settings.announcementText || `COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹${settings.freeShippingThreshold.toLocaleString('en-IN')}`)
    : (settings.announcementText && settings.announcementText.includes('COD')
        ? 'COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | SECURE ONLINE CHECKOUT'
        : (settings.announcementText || 'COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS'));

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [collectionsAccordionOpen, setCollectionsAccordionOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'categories' | 'collections' | null>(null);
  const closeDropdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDropdownEnter = (type: 'categories' | 'collections') => {
    if (closeDropdownTimerRef.current) {
      clearTimeout(closeDropdownTimerRef.current);
      closeDropdownTimerRef.current = null;
    }
    setActiveDropdown(type);
  };

  const handleDropdownLeave = () => {
    closeDropdownTimerRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 160);
  };

  // Scroll detection (Point 9: reduce height smoothly after 60-100px)
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu and dropdowns on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setSearchModalOpen(false);
    setActiveDropdown(null);
  }, [location.pathname, location.search]);

  // Support Escape to close open menus, dropdowns, and modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDropdown(null);
        setMobileMenuOpen(false);
        setSearchModalOpen(false);
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        className={`sticky top-0 z-40 bg-[#FCF8F0]/95 backdrop-blur-md transition-all duration-250 ease-out ${
          isScrolled
            ? 'shadow-[0_2px_14px_rgba(43,27,30,0.08)] border-b border-[#E8DFD0]'
            : 'border-b border-[#E8DFD0]'
        }`}
      >
        {/* Top Announcement Bar (Handbook Section 03 & Configured Business Rules) */}
        <div className="bg-[#5E1224] text-[#FCF8F0] text-[10.5px] sm:text-xs py-2 px-4 sm:px-8 tracking-[0.16em] uppercase font-medium flex items-center justify-between transition-all duration-300">
          <div className="hidden md:block w-28 text-[10px] text-[#D4AF67] tracking-widest font-serif">
            ROYAL LIBAS
          </div>
          <div className="flex-1 text-center">
            <span className="font-medium tracking-[0.18em]">{dynamicAnnouncement}</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-[10.5px] text-[#FCF8F0] font-medium tracking-wider">
            <span>INDIA (INR) ▾</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`flex items-center justify-between transition-all duration-250 ease-out ${
              isScrolled ? 'h-14 sm:h-16' : 'h-16 sm:h-20'
            }`}
          >
            {/* Mobile Hamburger Button */}
            <div className="flex items-center lg:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 text-[#2B1B1E] hover:text-[#5E1224] focus:outline-none"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>

            {/* Left Nav (Desktop Editorial) */}
            <nav className="hidden lg:flex items-center space-x-7 text-xs font-semibold uppercase tracking-[0.18em] font-ui">
              <Link
                to="/shop?sort=newest"
                className={`transition-colors py-1 hover:text-[#5E1224] ${
                  location.search.includes('sort=newest') ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                }`}
              >
                NEW IN
              </Link>
              <Link
                to="/shop"
                className={`transition-colors py-1 hover:text-[#5E1224] ${
                  location.pathname === '/shop' && !location.search ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                }`}
              >
                SHOP
              </Link>
              {/* Categories Navigation with Smooth Dropdown */}
              <div
                className="relative"
                onMouseEnter={() => handleDropdownEnter('categories')}
                onMouseLeave={handleDropdownLeave}
              >
                <Link
                  to="/shop"
                  onFocus={() => handleDropdownEnter('categories')}
                  className={`transition-colors py-1 flex items-center gap-1 hover:text-[#5E1224] focus:outline-none ${
                    location.search.includes('category') ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                  }`}
                  aria-haspopup="true"
                  aria-expanded={activeDropdown === 'categories'}
                >
                  <span>CATEGORIES</span>
                  <ChevronDown
                    className={`w-3 h-3 text-[#B58A3C] transition-transform duration-250 ease-out ${
                      activeDropdown === 'categories' ? 'rotate-180' : ''
                    }`}
                  />
                </Link>

                {/* Categories Dropdown with smooth opacity and slide-down transition */}
                <div
                  className={`absolute top-full left-0 w-60 bg-[#FCF8F0] border border-[#E8DFD0] border-t-2 border-t-[#B58A3C] shadow-2xl py-2 transition-all duration-200 ease-out z-50 ${
                    activeDropdown === 'categories'
                      ? 'opacity-100 visible translate-y-0 pointer-events-auto'
                      : 'opacity-0 invisible -translate-y-2 pointer-events-none'
                  }`}
                >
                  <div className="px-4 py-1.5 border-b border-[#E8DFD0]/60 mb-1">
                    <span className="text-[9.5px] uppercase tracking-[0.2em] text-[#B58A3C] font-bold block">
                      Explore By Silhouette
                    </span>
                  </div>
                  <Link
                    to="/shop?category=Kurti+Sets"
                    onClick={() => setActiveDropdown(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                  >
                    <span>Kurti Sets</span>
                    <span className="text-[10px] text-gray-400 font-mono">8 Styles</span>
                  </Link>
                  <Link
                    to="/shop?category=Festive+Sets"
                    onClick={() => setActiveDropdown(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                  >
                    <span>Festive Sets</span>
                    <span className="text-[10px] text-gray-400 font-mono">4 Styles</span>
                  </Link>
                  <Link
                    to="/shop?category=Co-ord+Sets"
                    onClick={() => setActiveDropdown(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                  >
                    <span>Co-ord Sets</span>
                    <span className="text-[10px] text-gray-400 font-mono">4 Styles</span>
                  </Link>
                  <div className="pt-1 mt-1 border-t border-[#E8DFD0]/60">
                    <Link
                      to="/shop"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-1.5 text-[11px] font-bold text-[#5E1224] hover:underline flex items-center gap-1"
                    >
                      <span>Explore All Silhouettes &rarr;</span>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Collections Navigation with Smooth Dropdown */}
              <div
                className="relative"
                onMouseEnter={() => handleDropdownEnter('collections')}
                onMouseLeave={handleDropdownLeave}
              >
                <Link
                  to="/shop?collection=festive-edit"
                  onFocus={() => handleDropdownEnter('collections')}
                  className={`transition-colors py-1 flex items-center gap-1 hover:text-[#5E1224] focus:outline-none ${
                    location.search.includes('collection') ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                  }`}
                  aria-haspopup="true"
                  aria-expanded={activeDropdown === 'collections'}
                >
                  <span>COLLECTIONS</span>
                  <ChevronDown
                    className={`w-3 h-3 text-[#B58A3C] transition-transform duration-250 ease-out ${
                      activeDropdown === 'collections' ? 'rotate-180' : ''
                    }`}
                  />
                </Link>

                {/* Collections Dropdown with smooth opacity and slide-down transition */}
                <div
                  className={`absolute top-full left-0 w-60 bg-[#FCF8F0] border border-[#E8DFD0] border-t-2 border-t-[#B58A3C] shadow-2xl py-2 transition-all duration-200 ease-out z-50 ${
                    activeDropdown === 'collections'
                      ? 'opacity-100 visible translate-y-0 pointer-events-auto'
                      : 'opacity-0 invisible -translate-y-2 pointer-events-none'
                  }`}
                >
                  <div className="px-4 py-1.5 border-b border-[#E8DFD0]/60 mb-1">
                    <span className="text-[9.5px] uppercase tracking-[0.2em] text-[#B58A3C] font-bold block">
                      Curated Editions
                    </span>
                  </div>
                  <Link
                    to="/shop?collection=festive-edit"
                    onClick={() => setActiveDropdown(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                  >
                    <span>Festive Edit &apos;26</span>
                    <span className="text-[10px] text-amber-700 font-semibold">New</span>
                  </Link>
                  <Link
                    to="/shop?collection=everyday-cotton"
                    onClick={() => setActiveDropdown(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                  >
                    <span>Everyday Cotton</span>
                    <span className="text-[10px] text-gray-400">Pure Weave</span>
                  </Link>
                  <Link
                    to="/shop?collection=bestsellers"
                    onClick={() => setActiveDropdown(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                  >
                    <span>Iconic Bestsellers</span>
                    <span className="text-[10px] text-[#B58A3C]">★ Top Rated</span>
                  </Link>
                  <div className="pt-1 mt-1 border-t border-[#E8DFD0]/60">
                    <Link
                      to="/shop"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-1.5 text-[11px] font-bold text-[#5E1224] hover:underline flex items-center gap-1"
                    >
                      <span>Explore All Editions &rarr;</span>
                    </Link>
                  </div>
                </div>
              </div>
            </nav>

            {/* Center Logo - Floral Motif Identity */}
            <Link
              to="/"
              className="group flex flex-col items-center justify-center focus:outline-none py-0.5 transition-transform duration-200 hover:scale-[1.01]"
              aria-label="Royal Libas Homepage"
            >
              <BrandLogo
                layout="compact"
                emblemSize={isScrolled ? 18 : 22}
                taglineText="TIMELESS TRADITIONS, MODERN WOMEN."
              />
            </Link>

            {/* Right Nav (Desktop Editorial + Action Icons) */}
            <div className="flex items-center space-x-4 sm:space-x-6">
              <nav className="hidden lg:flex items-center space-x-6 text-xs font-semibold uppercase tracking-[0.18em] font-ui">
                <Link
                  to="/about"
                  className={`transition-colors py-1 hover:text-[#5E1224] ${
                    location.pathname === '/about' ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                  }`}
                >
                  OUR STORY
                </Link>
                <Link
                  to="/about#journal"
                  className={`transition-colors py-1 hover:text-[#5E1224] ${
                    location.hash === '#journal' ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                  }`}
                >
                  JOURNAL
                </Link>
              </nav>

              {/* Action Icons: Search, User, Wishlist, Bag */}
              <div className="flex items-center space-x-1 sm:space-x-2">
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(true)}
                  className="p-2 text-gray-700 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5"
                  title="Search styles"
                  aria-label="Open Search"
                >
                  <Search className="w-5 h-5" />
                </button>

                <Link
                  to="/admin/login"
                  className="p-2 text-gray-700 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5"
                  title="Account / Boutique Admin"
                  aria-label="Account Login"
                >
                  <User className="w-5 h-5" />
                </Link>

                <Link
                  to="/shop?wishlist=true"
                  className="relative p-2 text-gray-700 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5"
                  title="Wishlist"
                  aria-label="View Wishlist"
                >
                  <Heart className={`w-5 h-5 ${wishlistCount > 0 ? 'fill-[#5E1224] text-[#5E1224]' : ''}`} />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-[#B58A3C] text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center shadow-sm">
                      {wishlistCount}
                    </span>
                  )}
                </Link>

                <button
                  type="button"
                  onClick={openDrawer}
                  className="relative p-2 text-gray-800 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5 flex items-center gap-1.5"
                  aria-label="Open Shopping Bag"
                >
                  <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
                  {totalItems > 0 && (
                    <span
                      key={totalItems}
                      className="absolute -top-1 -right-1 bg-[#5E1224] text-white text-[11px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-[#FCF8F0] animate-cart-bounce shadow-sm font-ui"
                    >
                      {totalItems}
                    </span>
                  )}
                </button>
              </div>
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
