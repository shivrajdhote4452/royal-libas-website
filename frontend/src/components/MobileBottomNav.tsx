import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Heart, Truck } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';

export const MobileBottomNav: React.FC = () => {
  const { wishlistCount } = useWishlist();
  const location = useLocation();

  // Hide mobile bottom nav on PDP and Checkout to prevent collision with sticky purchase bar
  if (location.pathname.startsWith('/product/') || location.pathname.startsWith('/checkout')) {
    return null;
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FCF8F0]/95 backdrop-blur-md border-t border-[#E8DFD0] px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center justify-around shadow-[0_-4px_16px_rgba(43,27,30,0.06)] font-sans"
      aria-label="Mobile Bottom Navigation"
    >
      <NavLink
        to="/"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-3 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
            isActive ? 'text-[#5E1224]' : 'text-gray-500 hover:text-[#5E1224]'
          }`
        }
      >
        <Home className="w-5 h-5 mb-0.5" />
        <span>Home</span>
      </NavLink>

      <NavLink
        to="/shop"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-3 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
            isActive ? 'text-[#5E1224]' : 'text-gray-500 hover:text-[#5E1224]'
          }`
        }
      >
        <ShoppingBag className="w-5 h-5 mb-0.5" />
        <span>Shop</span>
      </NavLink>

      <NavLink
        to="/shop?wishlist=true"
        className={({ isActive }) =>
          `relative flex flex-col items-center justify-center py-1 px-3 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
            isActive ? 'text-[#5E1224]' : 'text-gray-500 hover:text-[#5E1224]'
          }`
        }
      >
        <div className="relative">
          <Heart className="w-5 h-5 mb-0.5" />
          {wishlistCount > 0 && (
            <span className="absolute -top-1 -right-2 bg-[#B58A3C] text-white text-[9px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center shadow-sm">
              {wishlistCount}
            </span>
          )}
        </div>
        <span>Wishlist</span>
      </NavLink>

      <NavLink
        to="/track-order"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-3 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
            isActive ? 'text-[#5E1224]' : 'text-gray-500 hover:text-[#5E1224]'
          }`
        }
      >
        <Truck className="w-5 h-5 mb-0.5" />
        <span>Track</span>
      </NavLink>
    </nav>
  );
};

export default MobileBottomNav;
