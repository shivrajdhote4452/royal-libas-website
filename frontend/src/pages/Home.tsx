import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Truck, RefreshCw, ShieldCheck, Instagram, Sparkles, AlertCircle } from 'lucide-react';
import { Product } from '../types/product';
import { fetchProducts } from '../lib/api';
import { ProductCard } from '../components/ProductCard';

export const Home: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const data = await fetchProducts({ sort: 'newest' });
        if (isMounted) {
          setProducts(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError('Could not connect to the backend catalogue API. Ensure backend is running.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const bestsellers = products.filter((p) => p.is_bestseller || p.badges.includes('Bestseller')).slice(0, 4);
  const newInProducts = products.slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2]">
      {/* ========================================================
          BLOCK 1: Hero — One current drop only, one clear CTA
          ======================================================== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#5B111A] via-[#480B13] to-[#3A080F] text-[#FAF7F2] py-16 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-8 border-b border-[#C59B27]/30">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#C59B27_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FAF7F2]/10 backdrop-blur-sm border border-[#C59B27]/40 text-[#EAD186] text-xs font-semibold uppercase tracking-widest mb-6">
            <Sparkles className="w-3.5 h-3.5 text-[#C59B27]" />
            New Festive Drop
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
            Royal Libas by Tanya
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-xl text-[#FAF7F2]/90 max-w-2xl mx-auto font-light leading-relaxed">
            Curated festive silhouettes and effortless cotton co-ord sets. Pure fabrics, honest tailoring, and timeless grace.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/shop"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded bg-[#C59B27] hover:bg-[#B38A1E] text-[#3A080F] font-semibold text-sm sm:text-base uppercase tracking-wider shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
            >
              Shop the Drop
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      {/* Backend Connection Warning if API is offline */}
      {error && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center text-xs text-amber-800 flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================
          BLOCK 2: Shop by Category
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <div className="text-center mb-8 sm:mb-10">
          <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
            Curated Edits
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
            Shop by Category
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-6">
          {[
            {
              title: 'Kurti Sets',
              subtitle: 'Classic festive silhouettes',
              href: '/shop?category=Kurti+Sets',
              bgClass: 'from-[#5B111A]/90 to-[#3A080F]',
            },
            {
              title: 'Co-ord Sets',
              subtitle: 'Modern chic ensembles',
              href: '/shop?category=Co-ord+Sets',
              bgClass: 'from-[#8E3E63]/90 to-[#5B111A]',
            },
            {
              title: 'Festive Edit',
              subtitle: 'Rich zaris & silks',
              href: '/shop?collection=festive-edit',
              bgClass: 'from-[#C59B27]/90 to-[#8A6A12]',
            },
            {
              title: 'Everyday Cotton',
              subtitle: 'Breathable daytime luxury',
              href: '/shop?collection=everyday-cotton',
              bgClass: 'from-[#1A4D2E]/90 to-[#0F2F1C]',
            },
          ].map((cat, idx) => (
            <Link
              key={idx}
              to={cat.href}
              className={`group relative aspect-[4/5] rounded-lg overflow-hidden bg-gradient-to-t ${cat.bgClass} p-5 flex flex-col justify-end text-white shadow-sm hover:shadow-md transition-all`}
            >
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              <div className="relative z-10">
                <h3 className="font-serif text-lg sm:text-xl font-bold leading-tight group-hover:text-[#EAD186] transition-colors">
                  {cat.title}
                </h3>
                <p className="text-[11px] sm:text-xs text-white/80 mt-1">
                  {cat.subtitle}
                </p>
                <span className="inline-flex items-center text-[11px] font-semibold text-[#EAD186] mt-2 group-hover:translate-x-1 transition-transform">
                  Explore →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ========================================================
          BLOCK 3: Bestsellers (Dynamic API products)
          ======================================================== */}
      <section className="bg-white border-y border-[#E8DFD0] py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 pb-4 border-b border-gray-100">
            <div>
              <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
                Customer Favorites
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                Bestsellers
              </h2>
            </div>
            <Link
              to="/shop?collection=bestsellers"
              className="text-xs sm:text-sm font-semibold text-[#5B111A] hover:text-[#C59B27] transition-colors mt-2 sm:mt-0 flex items-center gap-1"
            >
              View All Bestsellers →
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-[4/5] bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : bestsellers.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {bestsellers.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-6 text-center">No bestsellers available yet.</p>
          )}
        </div>
      </section>

      {/* ========================================================
          BLOCK 4: New In (Most recent API products)
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 pb-4 border-b border-[#E8DFD0]">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
              Fresh Arrivals
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
              New In
            </h2>
          </div>
          <Link
            to="/shop?sort=newest"
            className="text-xs sm:text-sm font-semibold text-[#5B111A] hover:text-[#C59B27] transition-colors mt-2 sm:mt-0 flex items-center gap-1"
          >
            See All New Pieces →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-[4/5] bg-gray-100 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {newInProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* ========================================================
          BLOCK 5: Tanya's Story (Founder Voice)
          ======================================================== */}
      <section className="bg-[#FAF7F2] border-t border-[#E8DFD0] py-14 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-white rounded-xl border border-[#E8DFD0] p-6 sm:p-10 shadow-sm flex flex-col md:flex-row items-center gap-8">
          {/* Founder Photo / Emblem */}
          <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-full overflow-hidden shrink-0 bg-[#5B111A] border-4 border-[#EAD186] flex flex-col items-center justify-center text-[#FAF7F2] p-4 text-center shadow-md">
            <span className="font-serif text-2xl font-bold">Tanya</span>
            <span className="text-[10px] uppercase tracking-widest text-[#C59B27] mt-1 font-semibold">Founder</span>
          </div>
          {/* Founder Note */}
          <div className="space-y-3 text-center md:text-left">
            <span className="text-xs uppercase tracking-widest font-bold text-[#C59B27]">
              The Heart of the Brand
            </span>
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A]">
              A Note from Tanya
            </h3>
            <p className="text-sm sm:text-base text-gray-700 leading-relaxed italic">
              "I started Royal Libas because I wanted ethnic wear that didn't compromise on fabric quality or fit. Every piece is selected for breathability, effortless drape, and lasting elegance — outfits you look forward to wearing again and again."
            </p>
            <p className="text-xs text-gray-500 font-medium">
              — Tanya, Founder & Creative Director, Royal Libas
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================
          BLOCK 6: Customer Photos Placeholder (No fake reviews)
          ======================================================== */}
      <section className="bg-white border-t border-[#E8DFD0] py-12 sm:py-16 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
            Community & Moments
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
            Customer Styling Gallery
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
            Real customer styling photos and verified buyer feedback will be featured here upon launch. We do not use invented reviews, fake star ratings, or staged testimonials.
          </p>
          <div className="mt-6 flex justify-center">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#FAF7F2] text-gray-500 text-xs border border-[#E8DFD0]">
              Authentic customer gallery launching in Phase 6
            </span>
          </div>
        </div>
      </section>

      {/* ========================================================
          BLOCK 7: Trust Strip (COD, 3–5 day delivery, size exchange)
          ======================================================== */}
      <section className="bg-[#5B111A] text-[#FAF7F2] py-8 sm:py-10 border-y border-[#C59B27]/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="flex flex-col items-center p-3">
              <Truck className="w-6 h-6 text-[#C59B27] mb-2" />
              <h4 className="font-serif font-bold text-base">Cash on Delivery & Prepaid</h4>
              <p className="text-xs text-[#FAF7F2]/80 mt-1">
                COD available across India. Free shipping on all prepaid orders.
              </p>
            </div>
            <div className="flex flex-col items-center p-3">
              <ShieldCheck className="w-6 h-6 text-[#C59B27] mb-2" />
              <h4 className="font-serif font-bold text-base">Fast 3–5 Day Delivery</h4>
              <p className="text-xs text-[#FAF7F2]/80 mt-1">
                Dispatched via trusted national courier partners with real-time tracking.
              </p>
            </div>
            <div className="flex flex-col items-center p-3">
              <RefreshCw className="w-6 h-6 text-[#C59B27] mb-2" />
              <h4 className="font-serif font-bold text-base">7-Day Size Exchange</h4>
              <p className="text-xs text-[#FAF7F2]/80 mt-1">
                Fit not perfect? Simple hassle-free size exchange within 7 days.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          BLOCK 8: Shop the Reel (Instagram Section)
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-[#5B111A] mb-1">
            <Instagram className="w-4 h-4 text-[#C59B27]" />
            @royallibasbytanya
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
            Shop the Reel
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Seen on our Instagram? Tap any piece below to view details and size availability.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {products.slice(0, 3).map((product, idx) => (
            <Link
              key={product.id}
              to={`/product/${product.slug}`}
              className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-900 border border-[#E8DFD0] shadow-sm block"
            >
              {product.primary_image ? (
                <img
                  src={product.primary_image}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                />
              ) : (
                <div className="w-full h-full bg-[#5B111A] flex items-center justify-center text-white text-xs p-4 text-center">
                  {product.name}
                </div>
              )}
              {/* Instagram Reel overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 p-4 flex flex-col justify-between">
                <span className="self-end px-2 py-1 rounded bg-black/50 text-white text-[10px] font-semibold backdrop-blur-sm">
                  Reel #{idx + 1}
                </span>
                <div>
                  <p className="text-white font-serif text-sm font-semibold leading-snug line-clamp-1">
                    {product.name}
                  </p>
                  <span className="text-[#EAD186] text-xs font-bold block mt-0.5">
                    Tap to Shop →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
