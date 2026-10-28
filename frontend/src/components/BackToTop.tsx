import React, { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

export const BackToTop: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 420);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top of page"
      className={`fixed bottom-20 md:bottom-7 right-5 md:right-7 z-40 w-11 h-11 rounded-full bg-[#2B1B1E] hover:bg-[#5E1224] text-[#D4AF67] hover:text-[#FCF8F0] border border-[#B58A3C]/70 shadow-[0_6px_20px_rgba(43,27,30,0.35)] flex items-center justify-center transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-[#B58A3C] group ${
        visible
          ? 'opacity-100 scale-100 pointer-events-auto'
          : 'opacity-0 scale-90 pointer-events-none'
      }`}
    >
      <ChevronUp className="w-5 h-5 transition-transform duration-250 group-hover:-translate-y-0.5" />
    </button>
  );
};

