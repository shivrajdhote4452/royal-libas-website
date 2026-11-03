import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X, Search, Heart, ChevronDown, User } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { BrandLogo } from './BrandLogo';
import { useStoreSettings } from '../lib/settings';
import { SearchModal } from './SearchModal';

export interface NavSubcategory {
  name: string;
  href: string;
}

export interface NavCategory {
  id: string;
  name: string;
  displayName: string;
  href: string;
  subcategories: NavSubcategory[];
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'two_pieces',
    name: 'TWO PIECES',
    displayName: 'Two Pieces',
    href: '/shop?category=TWO+PIECES',
    subcategories: [
      { name: 'Co-ord Sets', href: '/shop?category=TWO+PIECES&subcategory=Co-ord+Sets' },
    ],
  },
  {
    id: 'suit_set',
    name: 'SUIT SET',
    displayName: 'Suit Set',
    href: '/shop?category=SUIT+SET',
    subcategories: [
      { name: 'Three Pieces', href: '/shop?category=SUIT+SET&subcategory=Three+Pieces' },
      { name: 'Semi-party Wear', href: '/shop?category=SUIT+SET&subcategory=Semi-party+Wear' },
      { name: 'Party Wear', href: '/shop?category=SUIT+SET&subcategory=Party+Wear' },
    ],
  },
  {
    id: 'heavy_dress',
    name: 'HEAVY DRESS',
    displayName: 'Heavy Dress',
    href: '/shop?category=HEAVY+DRESS',
    subcategories: [
      { name: 'Lehenga', href: '/shop?category=HEAVY+DRESS&subcategory=Lehenga' },
      { name: 'Short Kurta', href: '/shop?category=HEAVY+DRESS&subcategory=Short+Kurta' },
      { name: 'Palazzo Set', href: '/shop?category=HEAVY+DRESS&subcategory=Palazzo+Set' },
      { name: 'Designer Wear', href: '/shop?category=HEAVY+DRESS&subcategory=Designer+Wear' },
      { name: 'Sharara / Gharara', href: '/shop?category=HEAVY+DRESS&subcategory=Sharara+%2F+Gharara' },
    ],
  },
  {
    id: 'unstitched_material',
    name: 'UNSTITCHED MATERIAL',
    displayName: 'Unstitched Material',
    href: '/shop?category=UNSTITCHED+MATERIAL',
    subcategories: [
      { name: 'Unstitched Suits', href: '/shop?category=UNSTITCHED+MATERIAL&subcategory=Unstitched+Suits' },
      { name: 'Dress Material', href: '/shop?category=UNSTITCHED+MATERIAL&subcategory=Dress+Material' },
    ],
  },
];

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

  // Desktop Categories Dropdown
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);
  const categoriesDropdownRef = useRef<HTMLDivElement>(null);
  const closeDropdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile Drawer Category Accordions
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(true);
  const [mobileSubOpen, setMobileSubOpen] = useState<{ [key: string]: boolean }>({
    two_pieces: false,
    suit_set: false,
    heavy_dress: false,
    unstitched_material: false,
  });

  const handleCategoriesEnter = () => {
    if (closeDropdownTimerRef.current) {
      clearTimeout(closeDropdownTimerRef.current);
      closeDropdownTimerRef.current = null;
    }
    setCategoriesDropdownOpen(true);
  };

  const handleCategoriesLeave = () => {
    closeDropdownTimerRef.current = setTimeout(() => {
      setCategoriesDropdownOpen(false);
    }, 180);
  };

  // Scroll detection (reduce height smoothly after 60-100px)
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
    setCategoriesDropdownOpen(false);
  }, [location.pathname, location.search]);

  // Click outside listener for desktop Categories dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (
        categoriesDropdownRef.current &&
        !categoriesDropdownRef.current.contains(e.target as Node)
      ) {
        setCategoriesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  // Support Escape to close open menus, dropdowns, and modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCategoriesDropdownOpen(false);
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
        {/* Top Announcement Bar */}
        <div className="bg-[#5E1224] text-[#FCF8F0] text-[9px] sm:text-[10px] md:text-[10.5px] py-1.5 px-3 sm:px-6 lg:px-8 tracking-[0.14em] sm:tracking-[0.2em] uppercase font-medium flex items-center justify-between transition-all duration-300">
          <div className="hidden md:block w-36 text-[8.5px] sm:text-[9.5px] text-[#D4AF67] tracking-[0.22em] font-serif whitespace-nowrap">
            ROYAL LIBAS BY TANYA
          </div>
          <div className="flex-1 text-center truncate px-2">
            <span className="font-medium tracking-[0.12em] sm:tracking-[0.18em]">{dynamicAnnouncement}</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-[8.5px] sm:text-[9.5px] text-[#FCF8F0] font-medium tracking-wider">
            <span>INDIA (INR) ▾</span>
          </div>
        </div>

        {/* Main Navbar: Responsive 3-Zone Flex Architecture (No Overlap) */}
        <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 relative">
          <div
            className={`flex items-center justify-between transition-all duration-250 ease-out ${
              isScrolled ? 'h-13 sm:h-16' : 'h-15 sm:h-20'
            }`}
          >
            {/* ========================================================
                LEFT ZONE:
                - Mobile & Tablet (< 1024px): Hamburger Button + Search Button
                - Desktop (1024px+): NEW IN, SHOP, and CATEGORIES Dropdown
                ======================================================== */}
            <div className="flex items-center flex-1 justify-start min-w-0">
              {/* Mobile / Tablet (< 1024px) Action Pair */}
              <div className="flex items-center space-x-0.5 sm:space-x-1 lg:hidden">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="p-1.5 sm:p-2 text-[#2B1B1E] hover:text-[#5E1224] focus:outline-none rounded-full hover:bg-black/5"
                  aria-label="Open Navigation Menu"
                >
                  <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(true)}
                  className="p-1.5 sm:p-2 text-gray-700 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5"
                  title="Search styles"
                  aria-label="Open Search"
                >
                  <Search className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Desktop Left Nav (1024px+): Compact 3-item layout leaving space for centered logo */}
              <nav className="hidden lg:flex items-center space-x-4 xl:space-x-6 text-[11px] xl:text-xs font-semibold uppercase tracking-[0.14em] xl:tracking-[0.18em] font-ui">
                <Link
                  to="/shop?sort=newest"
                  className={`transition-colors py-1 hover:text-[#5E1224] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#B58A3C] ${
                    location.search.includes('sort=newest') ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                  }`}
                >
                  NEW IN
                </Link>
                <Link
                  to="/shop"
                  className={`transition-colors py-1 hover:text-[#5E1224] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#B58A3C] ${
                    location.pathname === '/shop' && !location.search ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                  }`}
                >
                  SHOP
                </Link>

                {/* Single CATEGORIES Dropdown */}
                <div
                  ref={categoriesDropdownRef}
                  className="relative"
                  onMouseEnter={handleCategoriesEnter}
                  onMouseLeave={handleCategoriesLeave}
                >
                  <button
                    type="button"
                    onClick={() => setCategoriesDropdownOpen((prev) => !prev)}
                    onFocus={handleCategoriesEnter}
                    className={`transition-colors py-1 flex items-center gap-1 hover:text-[#5E1224] focus:outline-none whitespace-nowrap focus-visible:ring-1 focus-visible:ring-[#B58A3C] ${
                      location.search.includes('category=')
                        ? 'text-[#5E1224] border-b-2 border-[#B58A3C]'
                        : 'text-gray-700'
                    }`}
                    aria-haspopup="true"
                    aria-expanded={categoriesDropdownOpen}
                    id="desktop-categories-menu-button"
                  >
                    <span>CATEGORIES</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[#B58A3C] transition-transform duration-200 ease-out ${
                        categoriesDropdownOpen ? 'rotate-180 text-[#5E1224]' : ''
                      }`}
                    />
                  </button>

                  {/* Mega Dropdown Panel */}
                  <div
                    className={`absolute top-full left-0 w-[680px] xl:w-[740px] max-w-[90vw] bg-[#FCF8F0] border border-[#E8DFD0] border-t-2 border-t-[#B58A3C] shadow-2xl p-6 transition-all duration-200 ease-out z-50 ${
                      categoriesDropdownOpen
                        ? 'opacity-100 visible translate-y-0 pointer-events-auto'
                        : 'opacity-0 invisible -translate-y-2 pointer-events-none'
                    }`}
                    role="menu"
                    aria-labelledby="desktop-categories-menu-button"
                  >
                    <div className="grid grid-cols-4 gap-4 xl:gap-6">
                      {NAV_CATEGORIES.map((cat) => (
                        <div key={cat.id} className="space-y-2.5">
                          {/* Main Category Header Link */}
                          <Link
                            to={cat.href}
                            onClick={() => setCategoriesDropdownOpen(false)}
                            className="font-serif text-xs xl:text-sm font-bold text-[#5E1224] hover:text-[#B58A3C] tracking-[0.08em] uppercase block pb-1.5 border-b border-[#E8DFD0] transition-colors focus:outline-none focus-visible:text-[#B58A3C]"
                            role="menuitem"
                          >
                            {cat.name}
                          </Link>

                          {/* Subcategories list */}
                          <ul className="space-y-1.5 pt-0.5">
                            {cat.subcategories.map((sub) => (
                              <li key={sub.name}>
                                <Link
                                  to={sub.href}
                                  onClick={() => setCategoriesDropdownOpen(false)}
                                  className="text-xs text-gray-700 hover:text-[#5E1224] transition-colors block py-1 hover:translate-x-0.5 transition-transform font-normal focus:outline-none focus-visible:text-[#5E1224]"
                                  role="menuitem"
                                >
                                  {sub.name}
                                </Link>
                              </li>
                            ))}
                          </ul>

                          {/* Explore All link */}
                          <div className="pt-2">
                            <Link
                              to={cat.href}
                              onClick={() => setCategoriesDropdownOpen(false)}
                              className="text-[10px] font-bold text-[#B58A3C] hover:text-[#5E1224] hover:underline flex items-center gap-1 tracking-wider"
                              role="menuitem"
                            >
                              <span>Explore All &rarr;</span>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Bottom strip */}
                    <div className="mt-5 pt-3 border-t border-[#E8DFD0] flex items-center justify-between text-[11px] text-gray-500">
                      <span className="italic font-serif text-gray-600">
                        Handcrafted ethnic ensembles &amp; bespoke boutique textiles
                      </span>
                      <Link
                        to="/shop"
                        onClick={() => setCategoriesDropdownOpen(false)}
                        className="font-bold text-[#5E1224] hover:text-[#B58A3C] transition-colors uppercase tracking-wider flex items-center gap-1"
                      >
                        <span>View Full Catalog &rarr;</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </nav>
            </div>

            {/* ========================================================
                CENTER ZONE: Brand Logo
                - Centered naturally between left and right flex-1 columns
                - Sized gracefully on mobile and desktop without overlap
                ======================================================== */}
            <div className="flex items-center justify-center shrink-0 px-2 sm:px-4 text-center">
              <Link
                to="/"
                className="group flex flex-col items-center justify-center focus:outline-none py-0.5 transition-transform duration-200 hover:scale-[1.01]"
                aria-label="Royal Libas by Tanya Homepage"
              >
                <BrandLogo
                  layout="compact"
                  emblemSize={isScrolled ? 16 : 20}
                  taglineText="BY TANYA"
                  className="scale-[0.88] sm:scale-100 origin-center"
                />
              </Link>
            </div>

            {/* ========================================================
                RIGHT ZONE:
                - Desktop (1024px+): "OUR STORY", "CONTACT US" + Action Icons
                - Mobile & Tablet (< 1024px): User, Wishlist, Cart
                ======================================================== */}
            <div className="flex items-center flex-1 justify-end min-w-0">
              {/* Desktop Right Nav (1024px+) */}
              <nav className="hidden lg:flex items-center space-x-4 xl:space-x-5 text-[11px] xl:text-xs font-semibold uppercase tracking-[0.14em] xl:tracking-[0.18em] font-ui mr-3">
                <Link
                  to="/about"
                  className={`transition-colors py-1 hover:text-[#5E1224] ${
                    location.pathname === '/about' ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                  }`}
                >
                  OUR STORY
                </Link>
                <Link
                  to="/contact"
                  className={`transition-colors py-1 hover:text-[#5E1224] ${
                    location.pathname === '/contact' ? 'text-[#5E1224] border-b-2 border-[#B58A3C]' : 'text-gray-700'
                  }`}
                >
                  CONTACT US
                </Link>
              </nav>

              {/* Action Icons */}
              <div className="flex items-center space-x-0.5 sm:space-x-1.5">
                {/* Search: Desktop Only (Mobile has it on the left next to Menu) */}
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(true)}
                  className="hidden lg:flex p-2 text-gray-700 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5"
                  title="Search styles"
                  aria-label="Open Search"
                >
                  <Search className="w-5 h-5" />
                </button>

                {/* Account / Admin Login */}
                <Link
                  to="/admin/login"
                  className="hidden min-[360px]:flex p-1.5 sm:p-2 text-gray-700 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5"
                  title="Account / Boutique Admin"
                  aria-label="Account Login"
                >
                  <User className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                </Link>

                {/* Wishlist */}
                <Link
                  to="/shop?wishlist=true"
                  className="relative p-1.5 sm:p-2 text-gray-700 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5"
                  title="Wishlist"
                  aria-label="View Wishlist"
                >
                  <Heart className={`w-4.5 h-4.5 sm:w-5 sm:h-5 ${wishlistCount > 0 ? 'fill-[#5E1224] text-[#5E1224]' : ''}`} />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-[#B58A3C] text-white text-[9px] sm:text-[10px] font-bold rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 flex items-center justify-center shadow-sm">
                      {wishlistCount}
                    </span>
                  )}
                </Link>

                {/* Cart / Shopping Bag */}
                <button
                  type="button"
                  onClick={openDrawer}
                  className="relative p-1.5 sm:p-2 text-gray-800 hover:text-[#5E1224] transition-colors focus:outline-none rounded-full hover:bg-black/5 flex items-center"
                  aria-label="Open Shopping Bag"
                >
                  <ShoppingBag className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                  {totalItems > 0 && (
                    <span
                      key={totalItems}
                      className="absolute -top-1 -right-1 bg-[#5E1224] text-white text-[10px] sm:text-[11px] font-bold rounded-full h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center border-2 border-[#FCF8F0] animate-cart-bounce shadow-sm font-ui"
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

      {/* Search Overlay Modal */}
      <SearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />

      {/* Slide-in Mobile & Tablet Menu Drawer (Consistent lg:hidden breakpoint) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden lg:hidden">
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
            {/* Drawer Header */}
            <div className="p-4 bg-white border-b border-[#E8DFD0] flex items-center justify-between">
              <BrandLogo layout="compact" emblemSize={22} />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-[#5E1224] focus:outline-none"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions in Drawer */}
            <div className="p-3 bg-[#FCF8F0] border-b border-[#E8DFD0] grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSearchModalOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-white border border-[#E8DFD0] rounded-none text-gray-700 hover:text-[#5E1224] min-h-[44px]"
              >
                <Search className="w-3.5 h-3.5 text-[#B58A3C]" />
                <span>Search</span>
              </button>
              <Link
                to="/shop?wishlist=true"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-white border border-[#E8DFD0] rounded-none text-gray-700 hover:text-[#5E1224] min-h-[44px]"
              >
                <Heart className="w-3.5 h-3.5 text-[#5E1224]" />
                <span>Wishlist {wishlistCount > 0 ? `(${wishlistCount})` : ''}</span>
              </Link>
            </div>

            {/* Menu Links with generous bottom padding for MobileBottomNav clearance */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5 pb-28">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 transition-colors"
              >
                Home
              </Link>
              <Link
                to="/shop?sort=newest"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 transition-colors"
              >
                New In
              </Link>
              <Link
                to="/shop"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 transition-colors"
              >
                Shop All Boutique Styles
              </Link>

              {/* Single Expandable CATEGORIES Accordion */}
              <div className="border-t border-b border-[#E8DFD0]/60 py-1 my-1">
                <button
                  type="button"
                  onClick={() => setMobileCategoriesOpen((prev) => !prev)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-bold text-gray-900 hover:bg-[#E8DFD0]/40 flex items-center justify-between min-h-[44px] transition-colors"
                  aria-expanded={mobileCategoriesOpen}
                >
                  <span className="tracking-wide text-xs sm:text-sm uppercase font-serif text-[#5E1224]">
                    CATEGORIES
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                      mobileCategoriesOpen ? 'rotate-180 text-[#5E1224]' : ''
                    }`}
                  />
                </button>

                {mobileCategoriesOpen && (
                  <div className="pl-1 pr-1 py-1 space-y-2 mt-1">
                    {NAV_CATEGORIES.map((cat) => {
                      const isSubOpen = !!mobileSubOpen[cat.id];
                      return (
                        <div
                          key={cat.id}
                          className="bg-white/80 border border-[#E8DFD0] rounded-none p-2 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <Link
                              to={cat.href}
                              onClick={() => setMobileMenuOpen(false)}
                              className="flex-1 text-xs font-bold text-gray-900 hover:text-[#5E1224] uppercase tracking-wider py-1.5 px-1 min-h-[40px] flex items-center"
                            >
                              {cat.displayName}
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                setMobileSubOpen((prev) => ({
                                  ...prev,
                                  [cat.id]: !prev[cat.id],
                                }))
                              }
                              className="p-2 text-gray-500 hover:text-[#5E1224] min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none"
                              aria-label={`Toggle ${cat.displayName} subcategories`}
                              aria-expanded={isSubOpen}
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isSubOpen ? 'rotate-180 text-[#5E1224]' : ''
                                }`}
                              />
                            </button>
                          </div>

                          {isSubOpen && (
                            <div className="pl-3 pr-1 py-1 space-y-1 border-l-2 border-[#B58A3C] ml-1 mt-0.5 animate-in slide-in-from-top-1 duration-150">
                              {cat.subcategories.map((sub) => (
                                <Link
                                  key={sub.name}
                                  to={sub.href}
                                  onClick={() => setMobileMenuOpen(false)}
                                  className="block py-2 px-1 text-xs text-gray-700 hover:text-[#5E1224] font-medium min-h-[40px] flex items-center"
                                >
                                  {sub.name}
                                </Link>
                              ))}
                              <Link
                                to={cat.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className="block py-1.5 px-1 text-[11px] font-bold text-[#B58A3C] hover:text-[#5E1224] hover:underline"
                              >
                                Explore All {cat.displayName} &rarr;
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Link
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 transition-colors"
              >
                About Tanya
              </Link>
              <Link
                to="/track-order"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 transition-colors"
              >
                Track Your Order
              </Link>
              <Link
                to="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 transition-colors"
              >
                Contact &amp; Concierge
              </Link>
              <Link
                to="/admin/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-[#5E1224] hover:bg-[#E8DFD0]/40 transition-colors"
              >
                Admin / Staff Portal
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
