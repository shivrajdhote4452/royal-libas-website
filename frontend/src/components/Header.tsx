import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Header: React.FC = () => {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E8DFD0]">
      {/* Top Announcement Bar */}
      <div className="bg-[#5B111A] text-[#FAF7F2] text-xs py-1.5 px-4 text-center tracking-wider font-medium">
        <span className="inline-block px-2 py-0.5 bg-[#C59B27] text-[#3A080F] text-[10px] font-bold rounded mr-2 uppercase tracking-widest">
          Notice
        </span>
        Sample catalogue demonstration — Real photos & online ordering coming in later phases
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo / Brand Name */}
          <Link to="/" className="group flex flex-col items-start focus:outline-none">
            <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#5B111A] group-hover:text-[#3A080F] transition-colors">
              Royal Libas
            </span>
            <span className="text-[11px] sm:text-xs uppercase tracking-[0.25em] text-[#C59B27] -mt-1 font-medium">
              by Tanya
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-6 sm:space-x-8 text-sm font-medium">
            <Link
              to="/"
              className={`transition-colors py-1 border-b-2 ${
                location.pathname === '/'
                  ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                  : 'text-gray-600 hover:text-[#5B111A] border-transparent'
              }`}
            >
              Home
            </Link>
            <Link
              to="/shop"
              className={`transition-colors py-1 border-b-2 ${
                location.pathname === '/shop'
                  ? 'text-[#5B111A] border-[#C59B27] font-semibold'
                  : 'text-gray-600 hover:text-[#5B111A] border-transparent'
              }`}
            >
              Shop
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};
