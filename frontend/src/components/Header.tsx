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
  const [twoPiecesAccordionOpen, setTwoPiecesAccordionOpen] = useState(false);
  const [suitSetAccordionOpen, setSuitSetAccordionOpen] = useState(false);
  const [heavyDressAccordionOpen, setHeavyDressAccordionOpen] = useState(false);
  const [unstitchedMaterialAccordionOpen, setUnstitchedMaterialAccordionOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'two_pieces' | 'suit_set' | 'heavy_dress' | 'unstitched_material' | null>(null);
  const closeDropdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDropdownEnter = (type: 'two_pieces' | 'suit_set' | 'heavy_dress' | 'unstitched_material') => {
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
                - Desktop (1024px+): Editorial Category Links
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

              {/* Desktop Left Nav (1024px+) */}
              <nav className="hidden lg:flex items-center space-x-3.5 xl:space-x-5 text-[11px] xl:text-xs font-semibold uppercase tracking-[0.12em] xl:tracking-[0.15em] font-ui">
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

                {/* TWO PIECES Dropdown */}
                <div
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('two_pieces')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <Link
                    to="/shop?category=TWO+PIECES"
                    onFocus={() => handleDropdownEnter('two_pieces')}
                    className={`transition-colors py-1 flex items-center gap-1 hover:text-[#5E1224] focus:outline-none whitespace-nowrap ${
                      location.search.includes('category=TWO+PIECES') || location.search.includes('category=TWO%20PIECES')
                        ? 'text-[#5E1224] border-b-2 border-[#B58A3C]'
                        : 'text-gray-700'
                    }`}
                    aria-haspopup="true"
                    aria-expanded={activeDropdown === 'two_pieces'}
                  >
                    <span>TWO PIECES</span>
                    <ChevronDown
                      className={`w-3 h-3 text-[#B58A3C] transition-transform duration-250 ease-out ${
                        activeDropdown === 'two_pieces' ? 'rotate-180' : ''
                      }`}
                    />
                  </Link>

                  <div
                    className={`absolute top-full left-0 w-52 bg-[#FCF8F0] border border-[#E8DFD0] border-t-2 border-t-[#B58A3C] shadow-2xl py-2 transition-all duration-200 ease-out z-50 ${
                      activeDropdown === 'two_pieces'
                        ? 'opacity-100 visible translate-y-0 pointer-events-auto'
                        : 'opacity-0 invisible -translate-y-2 pointer-events-none'
                    }`}
                  >
                    <div className="px-4 py-1.5 border-b border-[#E8DFD0]/60 mb-1">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-[#B58A3C] font-bold block">
                        Two Pieces
                      </span>
                    </div>
                    <Link
                      to="/shop?category=TWO+PIECES&subcategory=Co-ord+Sets"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Co-ord Sets</span>
                    </Link>
                    <div className="pt-1 mt-1 border-t border-[#E8DFD0]/60">
                      <Link
                        to="/shop?category=TWO+PIECES"
                        onClick={() => setActiveDropdown(null)}
                        className="px-4 py-1.5 text-[11px] font-bold text-[#5E1224] hover:underline flex items-center gap-1"
                      >
                        <span>Explore All Two Pieces &rarr;</span>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* SUIT SET Dropdown */}
                <div
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('suit_set')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <Link
                    to="/shop?category=SUIT+SET"
                    onFocus={() => handleDropdownEnter('suit_set')}
                    className={`transition-colors py-1 flex items-center gap-1 hover:text-[#5E1224] focus:outline-none whitespace-nowrap ${
                      location.search.includes('category=SUIT+SET') || location.search.includes('category=SUIT%20SET')
                        ? 'text-[#5E1224] border-b-2 border-[#B58A3C]'
                        : 'text-gray-700'
                    }`}
                    aria-haspopup="true"
                    aria-expanded={activeDropdown === 'suit_set'}
                  >
                    <span>SUIT SET</span>
                    <ChevronDown
                      className={`w-3 h-3 text-[#B58A3C] transition-transform duration-250 ease-out ${
                        activeDropdown === 'suit_set' ? 'rotate-180' : ''
                      }`}
                    />
                  </Link>

                  <div
                    className={`absolute top-full left-0 w-52 bg-[#FCF8F0] border border-[#E8DFD0] border-t-2 border-t-[#B58A3C] shadow-2xl py-2 transition-all duration-200 ease-out z-50 ${
                      activeDropdown === 'suit_set'
                        ? 'opacity-100 visible translate-y-0 pointer-events-auto'
                        : 'opacity-0 invisible -translate-y-2 pointer-events-none'
                    }`}
                  >
                    <div className="px-4 py-1.5 border-b border-[#E8DFD0]/60 mb-1">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-[#B58A3C] font-bold block">
                        Suit Set
                      </span>
                    </div>
                    <Link
                      to="/shop?category=SUIT+SET&subcategory=Three+Pieces"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Three Pieces</span>
                    </Link>
                    <Link
                      to="/shop?category=SUIT+SET&subcategory=Semi-party+Wear"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Semi-party Wear</span>
                    </Link>
                    <Link
                      to="/shop?category=SUIT+SET&subcategory=Party+Wear"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Party Wear</span>
                    </Link>
                    <div className="pt-1 mt-1 border-t border-[#E8DFD0]/60">
                      <Link
                        to="/shop?category=SUIT+SET"
                        onClick={() => setActiveDropdown(null)}
                        className="px-4 py-1.5 text-[11px] font-bold text-[#5E1224] hover:underline flex items-center gap-1"
                      >
                        <span>Explore All Suit Sets &rarr;</span>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* HEAVY DRESS Dropdown */}
                <div
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('heavy_dress')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <Link
                    to="/shop?category=HEAVY+DRESS"
                    onFocus={() => handleDropdownEnter('heavy_dress')}
                    className={`transition-colors py-1 flex items-center gap-1 hover:text-[#5E1224] focus:outline-none whitespace-nowrap ${
                      location.search.includes('category=HEAVY+DRESS') || location.search.includes('category=HEAVY%20DRESS')
                        ? 'text-[#5E1224] border-b-2 border-[#B58A3C]'
                        : 'text-gray-700'
                    }`}
                    aria-haspopup="true"
                    aria-expanded={activeDropdown === 'heavy_dress'}
                  >
                    <span>HEAVY DRESS</span>
                    <ChevronDown
                      className={`w-3 h-3 text-[#B58A3C] transition-transform duration-250 ease-out ${
                        activeDropdown === 'heavy_dress' ? 'rotate-180' : ''
                      }`}
                    />
                  </Link>

                  <div
                    className={`absolute top-full left-0 w-56 bg-[#FCF8F0] border border-[#E8DFD0] border-t-2 border-t-[#B58A3C] shadow-2xl py-2 transition-all duration-200 ease-out z-50 ${
                      activeDropdown === 'heavy_dress'
                        ? 'opacity-100 visible translate-y-0 pointer-events-auto'
                        : 'opacity-0 invisible -translate-y-2 pointer-events-none'
                    }`}
                  >
                    <div className="px-4 py-1.5 border-b border-[#E8DFD0]/60 mb-1">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-[#B58A3C] font-bold block">
                        Heavy Dress
                      </span>
                    </div>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Lehenga"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Lehenga</span>
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Short+Kurta"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Short Kurta</span>
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Palazzo+Set"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Palazzo Set</span>
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Designer+Wear"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Designer Wear</span>
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Sharara+%2F+Gharara"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Sharara / Gharara</span>
                    </Link>
                    <div className="pt-1 mt-1 border-t border-[#E8DFD0]/60">
                      <Link
                        to="/shop?category=HEAVY+DRESS"
                        onClick={() => setActiveDropdown(null)}
                        className="px-4 py-1.5 text-[11px] font-bold text-[#5E1224] hover:underline flex items-center gap-1"
                      >
                        <span>Explore All Heavy Dresses &rarr;</span>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* UNSTITCHED MATERIAL Dropdown */}
                <div
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('unstitched_material')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <Link
                    to="/shop?category=UNSTITCHED+MATERIAL"
                    onFocus={() => handleDropdownEnter('unstitched_material')}
                    className={`transition-colors py-1 flex items-center gap-1 hover:text-[#5E1224] focus:outline-none whitespace-nowrap ${
                      location.search.includes('category=UNSTITCHED+MATERIAL') || location.search.includes('category=UNSTITCHED%20MATERIAL')
                        ? 'text-[#5E1224] border-b-2 border-[#B58A3C]'
                        : 'text-gray-700'
                    }`}
                    aria-haspopup="true"
                    aria-expanded={activeDropdown === 'unstitched_material'}
                  >
                    <span>UNSTITCHED MATERIAL</span>
                    <ChevronDown
                      className={`w-3 h-3 text-[#B58A3C] transition-transform duration-250 ease-out ${
                        activeDropdown === 'unstitched_material' ? 'rotate-180' : ''
                      }`}
                    />
                  </Link>

                  <div
                    className={`absolute top-full left-0 w-56 bg-[#FCF8F0] border border-[#E8DFD0] border-t-2 border-t-[#B58A3C] shadow-2xl py-2 transition-all duration-200 ease-out z-50 ${
                      activeDropdown === 'unstitched_material'
                        ? 'opacity-100 visible translate-y-0 pointer-events-auto'
                        : 'opacity-0 invisible -translate-y-2 pointer-events-none'
                    }`}
                  >
                    <div className="px-4 py-1.5 border-b border-[#E8DFD0]/60 mb-1">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-[#B58A3C] font-bold block">
                        Unstitched Material
                      </span>
                    </div>
                    <Link
                      to="/shop?category=UNSTITCHED+MATERIAL&subcategory=Unstitched+Suits"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Unstitched Suits</span>
                    </Link>
                    <Link
                      to="/shop?category=UNSTITCHED+MATERIAL&subcategory=Dress+Material"
                      onClick={() => setActiveDropdown(null)}
                      className="px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-[#F3E9DA] hover:text-[#5E1224] transition-colors flex items-center justify-between"
                    >
                      <span>Dress Material</span>
                    </Link>
                    <div className="pt-1 mt-1 border-t border-[#E8DFD0]/60">
                      <Link
                        to="/shop?category=UNSTITCHED+MATERIAL"
                        onClick={() => setActiveDropdown(null)}
                        className="px-4 py-1.5 text-[11px] font-bold text-[#5E1224] hover:underline flex items-center gap-1"
                      >
                        <span>Explore All Unstitched Material &rarr;</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </nav>
            </div>

            {/* ========================================================
                CENTER ZONE: Brand Logo
                - Centered naturally between left and right flex-1 columns
                - Sized gracefully on mobile so it never overlaps controls
                ======================================================== */}
            <div className="flex items-center justify-center shrink-0 px-1 sm:px-3 text-center">
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
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-white border border-[#E8DFD0] rounded-none text-gray-700 hover:text-[#5E1224]"
              >
                <Search className="w-3.5 h-3.5 text-[#B58A3C]" />
                <span>Search</span>
              </button>
              <Link
                to="/shop?wishlist=true"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-white border border-[#E8DFD0] rounded-none text-gray-700 hover:text-[#5E1224]"
              >
                <Heart className="w-3.5 h-3.5 text-[#5E1224]" />
                <span>Wishlist {wishlistCount > 0 ? `(${wishlistCount})` : ''}</span>
              </Link>
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

              {/* Three Main Expandable Categories */}
              {/* 1. TWO PIECES Accordion */}
              <div className="border-b border-[#E8DFD0]/40 pb-1">
                <button
                  type="button"
                  onClick={() => setTwoPiecesAccordionOpen(!twoPiecesAccordionOpen)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 flex items-center justify-between"
                  aria-expanded={twoPiecesAccordionOpen}
                >
                  <span className="tracking-wide">TWO PIECES</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                      twoPiecesAccordionOpen ? 'rotate-180 text-[#5E1224]' : ''
                    }`}
                  />
                </button>

                {twoPiecesAccordionOpen && (
                  <div className="pl-4 pr-2 py-1 space-y-1 text-xs border-l-2 border-[#C59B27] ml-3 mt-0.5 animate-in slide-in-from-top-1 duration-200">
                    <Link
                      to="/shop?category=TWO+PIECES&subcategory=Co-ord+Sets"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Co-ord Sets
                    </Link>
                    <Link
                      to="/shop?category=TWO+PIECES"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-[#5E1224] font-semibold hover:underline"
                    >
                      View All Two Pieces &rarr;
                    </Link>
                  </div>
                )}
              </div>

              {/* 2. SUIT SET Accordion */}
              <div className="border-b border-[#E8DFD0]/40 pb-1">
                <button
                  type="button"
                  onClick={() => setSuitSetAccordionOpen(!suitSetAccordionOpen)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 flex items-center justify-between"
                  aria-expanded={suitSetAccordionOpen}
                >
                  <span className="tracking-wide">SUIT SET</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                      suitSetAccordionOpen ? 'rotate-180 text-[#5E1224]' : ''
                    }`}
                  />
                </button>

                {suitSetAccordionOpen && (
                  <div className="pl-4 pr-2 py-1 space-y-1 text-xs border-l-2 border-[#C59B27] ml-3 mt-0.5 animate-in slide-in-from-top-1 duration-200">
                    <Link
                      to="/shop?category=SUIT+SET&subcategory=Three+Pieces"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Three Pieces
                    </Link>
                    <Link
                      to="/shop?category=SUIT+SET&subcategory=Semi-party+Wear"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Semi-party Wear
                    </Link>
                    <Link
                      to="/shop?category=SUIT+SET&subcategory=Party+Wear"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Party Wear
                    </Link>
                    <Link
                      to="/shop?category=SUIT+SET"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-[#5E1224] font-semibold hover:underline"
                    >
                      View All Suit Sets &rarr;
                    </Link>
                  </div>
                )}
              </div>

              {/* 3. HEAVY DRESS Accordion */}
              <div className="border-b border-[#E8DFD0]/40 pb-1">
                <button
                  type="button"
                  onClick={() => setHeavyDressAccordionOpen(!heavyDressAccordionOpen)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 flex items-center justify-between"
                  aria-expanded={heavyDressAccordionOpen}
                >
                  <span className="tracking-wide">HEAVY DRESS</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                      heavyDressAccordionOpen ? 'rotate-180 text-[#5E1224]' : ''
                    }`}
                  />
                </button>

                {heavyDressAccordionOpen && (
                  <div className="pl-4 pr-2 py-1 space-y-1 text-xs border-l-2 border-[#C59B27] ml-3 mt-0.5 animate-in slide-in-from-top-1 duration-200">
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Lehenga"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Lehenga
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Short+Kurta"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Short Kurta
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Palazzo+Set"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Palazzo Set
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Designer+Wear"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Designer Wear
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS&subcategory=Sharara+%2F+Gharara"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Sharara / Gharara
                    </Link>
                    <Link
                      to="/shop?category=HEAVY+DRESS"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-[#5E1224] font-semibold hover:underline"
                    >
                      View All Heavy Dresses &rarr;
                    </Link>
                  </div>
                )}
              </div>

              {/* 4. UNSTITCHED MATERIAL Accordion */}
              <div className="border-b border-[#E8DFD0]/40 pb-1">
                <button
                  type="button"
                  onClick={() => setUnstitchedMaterialAccordionOpen(!unstitchedMaterialAccordionOpen)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 flex items-center justify-between"
                  aria-expanded={unstitchedMaterialAccordionOpen}
                >
                  <span className="tracking-wide">UNSTITCHED MATERIAL</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                      unstitchedMaterialAccordionOpen ? 'rotate-180 text-[#5E1224]' : ''
                    }`}
                  />
                </button>

                {unstitchedMaterialAccordionOpen && (
                  <div className="pl-4 pr-2 py-1 space-y-1 text-xs border-l-2 border-[#C59B27] ml-3 mt-0.5 animate-in slide-in-from-top-1 duration-200">
                    <Link
                      to="/shop?category=UNSTITCHED+MATERIAL&subcategory=Unstitched+Suits"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Unstitched Suits
                    </Link>
                    <Link
                      to="/shop?category=UNSTITCHED+MATERIAL&subcategory=Dress+Material"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-gray-700 hover:text-[#5E1224] font-medium"
                    >
                      Dress Material
                    </Link>
                    <Link
                      to="/shop?category=UNSTITCHED+MATERIAL"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-2.5 py-1.5 rounded text-[#5E1224] font-semibold hover:underline"
                    >
                      View All Unstitched Material &rarr;
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
              <Link
                to="/admin/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-800 hover:bg-[#E8DFD0]/40 border-t border-[#E8DFD0]/60 mt-2 pt-3"
              >
                Account / Boutique Login
              </Link>
            </div>

            {/* Footer in Drawer */}
            <div className="p-4 bg-white border-t border-[#E8DFD0] text-center space-y-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
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

export default Header;
