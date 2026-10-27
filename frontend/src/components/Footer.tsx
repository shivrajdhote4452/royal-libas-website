import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, ArrowRight, Check } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && email.includes('@')) {
      setSubscribed(true);
      setEmail('');
    }
  };

  return (
    <footer className="bg-[#5E1224] text-[#FCF8F0] pt-16 pb-12 border-t border-[#B58A3C]/30 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-12 pb-14 border-b border-[#B58A3C]/20">
          {/* Brand Column (Col 1-4) */}
          <div className="md:col-span-4 space-y-5">
            <Link to="/" className="inline-block transition-transform hover:scale-[1.01]" aria-label="Royal Libas Homepage">
              <BrandLogo variant="maroon-bg" layout="horizontal" emblemSize={44} />
            </Link>
            <p className="text-xs text-[#FCF8F0]/80 leading-relaxed max-w-sm">
              Rooted in timeless Indian heritage and handcrafted luxury. Meticulously tailored festive silhouettes, sarees, and everyday co-ords crafted for the modern woman.
            </p>
            <div className="flex items-center space-x-3 pt-1">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white/10 text-[#FCF8F0] flex items-center justify-center hover:bg-[#B58A3C] hover:text-[#3A080F] transition-all"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <Link
                to="/contact"
                className="w-9 h-9 rounded-full bg-white/10 text-[#FCF8F0] flex items-center justify-center hover:bg-[#B58A3C] hover:text-[#3A080F] transition-all"
                aria-label="Email Concierge"
              >
                <Mail className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Shop Column (Col 5-6) */}
          <div className="md:col-span-2">
            <h4 className="font-serif font-semibold text-[#B58A3C] text-xs uppercase tracking-[0.2em] mb-4">
              SHOP
            </h4>
            <ul className="space-y-2.5 text-xs text-[#FCF8F0]/85">
              <li>
                <Link to="/shop?sort=newest" className="hover:text-[#B58A3C] transition-colors">
                  New In
                </Link>
              </li>
              <li>
                <Link to="/shop?category=Sarees" className="hover:text-[#B58A3C] transition-colors">
                  Sarees
                </Link>
              </li>
              <li>
                <Link to="/shop?category=Lehengas" className="hover:text-[#B58A3C] transition-colors">
                  Lehengas
                </Link>
              </li>
              <li>
                <Link to="/shop?category=Anarkalis" className="hover:text-[#B58A3C] transition-colors">
                  Anarkalis
                </Link>
              </li>
              <li>
                <Link to="/shop?category=Kurti+Sets" className="hover:text-[#B58A3C] transition-colors">
                  Suits & Sets
                </Link>
              </li>
              <li>
                <Link to="/shop?collection=bestsellers" className="hover:text-[#B58A3C] transition-colors">
                  Bestsellers
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Column (Col 7-8) */}
          <div className="md:col-span-2">
            <h4 className="font-serif font-semibold text-[#B58A3C] text-xs uppercase tracking-[0.2em] mb-4">
              COMPANY
            </h4>
            <ul className="space-y-2.5 text-xs text-[#FCF8F0]/85">
              <li>
                <Link to="/about" className="hover:text-[#B58A3C] transition-colors">
                  Our Story
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-[#B58A3C] transition-colors">
                  Craftsmanship
                </Link>
              </li>
              <li>
                <Link to="/track-order" className="hover:text-[#B58A3C] transition-colors">
                  Track Your Order
                </Link>
              </li>
              <li>
                <Link to="/shipping-policy" className="hover:text-[#B58A3C] transition-colors">
                  Shipping & Delivery
                </Link>
              </li>
              <li>
                <Link to="/return-policy" className="hover:text-[#B58A3C] transition-colors">
                  7-Day Exchange
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-[#B58A3C] transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter Column (Col 9-12) (PDF Page 3) */}
          <div className="md:col-span-4 space-y-4">
            <h4 className="font-serif font-semibold text-[#B58A3C] text-xs uppercase tracking-[0.2em]">
              JOIN OUR WORLD
            </h4>
            <p className="text-xs text-[#FCF8F0]/80 leading-relaxed">
              Be the first to know about new collections, seasonal edits, and private trunk shows.
            </p>
            {subscribed ? (
              <div className="p-3 rounded bg-white/10 border border-[#B58A3C]/40 text-xs text-[#FCF8F0] flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B58A3C]" />
                <span>Thank you for joining the Royal Libas circle.</span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="relative flex items-center">
                <input
                  type="email"
                  required
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/10 border border-[#B58A3C]/40 text-[#FCF8F0] placeholder-[#FCF8F0]/50 text-xs px-3.5 py-3 rounded-none focus:outline-none focus:border-[#B58A3C]"
                />
                <button
                  type="submit"
                  aria-label="Subscribe to newsletter"
                  className="absolute right-0 top-0 bottom-0 px-4 bg-[#B58A3C] hover:bg-[#8C6726] text-[#3A080F] hover:text-white flex items-center justify-center transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
            <p className="text-[10.5px] text-[#FCF8F0]/60">
              By subscribing you agree with our Privacy Policy.
            </p>
          </div>
        </div>

        {/* Bottom Credits & Legal Links */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[#FCF8F0]/60 gap-4 text-center sm:text-left">
          <p>© {new Date().getFullYear()} Royal Libas by Tanya. Handcrafted with pride in India. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-[#FCF8F0]/70">
            <Link to="/privacy-policy" className="hover:text-[#B58A3C] transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link to="/terms-of-service" className="hover:text-[#B58A3C] transition-colors">Terms of Service</Link>
            <span>•</span>
            <Link to="/shipping-policy" className="hover:text-[#B58A3C] transition-colors">Shipping</Link>
            <span>•</span>
            <Link to="/contact" className="hover:text-[#B58A3C] transition-colors">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
