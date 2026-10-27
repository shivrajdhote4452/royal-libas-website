import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Truck,
  RefreshCw,
  ShieldCheck,
  CreditCard,
  Play,
  Heart,
  Sparkles,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { Product } from '../types/product';
import { fetchProducts } from '../lib/api';
import { ProductCard } from '../components/ProductCard';

export const Home: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Royal Libas by Tanya | Handcrafted Festive Silhouettes & Co-ords';
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const data = await fetchProducts({ sort: 'newest' });
        if (isMounted) {
          setProducts(data);
          setError(null);
        }
      } catch {
        if (isMounted) {
          setError('Could not connect to the boutique catalogue. Please refresh.');
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

  const newArrivals = products.slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] page-enter font-sans">
      {/* ========================================================
          1. EDITORIAL HERO SECTION (PDF Page 2)
          "Tradition Meets Today"
          ======================================================== */}
      <section className="relative overflow-hidden bg-[#FAF7F2] py-8 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 border-b border-[#E8DFD0]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Column: Deep Maroon Editorial Card */}
            <div className="lg:col-span-5 z-10 flex flex-col justify-center">
              <div className="bg-[#5B111A] text-white p-8 sm:p-12 lg:p-14 rounded-2xl shadow-xl relative overflow-hidden border border-[#C59B27]/40">
                <div className="absolute inset-0 gold-shimmer pointer-events-none opacity-20" />
                <div className="relative z-10 space-y-4">
                  <span className="text-[11px] uppercase tracking-[0.25em] text-[#EAD186] font-semibold block">
                    Festive Edit 2026
                  </span>
                  <h1 className="font-serif text-3xl sm:text-5xl lg:text-5xl font-bold tracking-tight text-white leading-[1.15]">
                    Tradition Meets Today
                  </h1>
                  <p className="text-sm sm:text-base text-[#FAF7F2]/90 font-light leading-relaxed pt-1">
                    Elegant ethnic wear for every version of you.
                  </p>
                  <div className="pt-4">
                    <Link
                      to="/shop"
                      className="inline-flex items-center justify-center px-7 py-3 rounded bg-transparent border-2 border-[#C59B27] text-[#EAD186] hover:bg-[#C59B27] hover:text-[#3A080F] font-ui font-semibold text-xs sm:text-sm uppercase tracking-wider transition-all duration-300 shadow-md group"
                    >
                      <span>SHOP THE DROP</span>
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Hero Fashion Photography */}
            <div className="lg:col-span-7">
              <div className="relative aspect-[4/3] sm:aspect-[16/10] lg:aspect-[16/11] rounded-2xl overflow-hidden shadow-2xl border border-[#E8DFD0] bg-gray-100">
                <img
                  src="/images/products/maroon_front.jpg"
                  alt="Royal Libas Festive Maroon Silhouette"
                  className="w-full h-full object-cover object-center"
                />
                {/* Sample Photo Badge */}
                <div className="absolute top-4 right-4 z-10">
                  <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase bg-black/75 text-amber-200 border border-amber-400/40 shadow-sm backdrop-blur-[2px]">
                    SAMPLE PHOTO
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          2. TRUST STRIP (PDF Page 2)
          4 Pillars: Free Shipping, COD, Easy Exchange, Secure Payments
          ======================================================== */}
      <section className="bg-white border-b border-[#E8DFD0] py-5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 text-center">
          <div className="flex flex-col items-center justify-center p-2 space-y-1">
            <Truck className="w-5 h-5 text-[#C59B27]" />
            <h4 className="font-serif font-bold text-xs sm:text-sm text-gray-900">Free Shipping</h4>
            <p className="text-[11px] text-gray-500">Above ₹1999</p>
          </div>
          <div className="flex flex-col items-center justify-center p-2 space-y-1">
            <CreditCard className="w-5 h-5 text-[#C59B27]" />
            <h4 className="font-serif font-bold text-xs sm:text-sm text-gray-900">COD Available</h4>
            <p className="text-[11px] text-gray-500">Pan-India doorstep delivery</p>
          </div>
          <div className="flex flex-col items-center justify-center p-2 space-y-1">
            <RefreshCw className="w-5 h-5 text-[#C59B27]" />
            <h4 className="font-serif font-bold text-xs sm:text-sm text-gray-900">Easy Exchange</h4>
            <p className="text-[11px] text-gray-500">7-Day doorstep support</p>
          </div>
          <div className="flex flex-col items-center justify-center p-2 space-y-1">
            <ShieldCheck className="w-5 h-5 text-[#C59B27]" />
            <h4 className="font-serif font-bold text-xs sm:text-sm text-gray-900">Secure Payments</h4>
            <p className="text-[11px] text-gray-500">100% Protected Checkout</p>
          </div>
        </div>
      </section>

      {/* Connection Warning if API is offline */}
      {error && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center text-xs text-amber-800 flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================
          3. SHOP BY CATEGORY (PDF Page 2 Arched Cards)
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <div className="text-center mb-10">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A]">
            Shop by Category
          </h2>
          <div className="w-12 h-0.5 bg-[#C59B27] mx-auto mt-2" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            {
              title: 'Kurti Sets',
              image: '/images/products/noorani_maroon_front.jpg',
              href: '/shop?category=Kurti+Sets',
            },
            {
              title: 'Co-ord Sets',
              image: '/images/products/chandni_ivory_front.jpg',
              href: '/shop?category=Co-ord+Sets',
            },
            {
              title: 'Festive Wear',
              image: '/images/products/zari_mahal_emerald_front.jpg',
              href: '/shop?collection=festive-edit',
            },
            {
              title: 'Everyday Cotton',
              image: '/images/products/gulabi_rooh_rose_front.jpg',
              href: '/shop?collection=everyday-cotton',
            },
          ].map((cat, idx) => (
            <Link
              key={idx}
              to={cat.href}
              className="group flex flex-col items-center text-center focus:outline-none"
            >
              {/* Arched Photo Card matching PDF Page 2 */}
              <div className="w-full aspect-[3/4] rounded-t-full rounded-b-lg overflow-hidden border border-[#E8DFD0] shadow-sm bg-gray-100 relative group-hover:shadow-md transition-all duration-300">
                <img
                  src={cat.image}
                  alt={cat.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
              </div>
              <h3 className="font-serif font-bold text-sm sm:text-base text-gray-900 mt-3 group-hover:text-[#5B111A] transition-colors">
                {cat.title}
              </h3>
            </Link>
          ))}
        </div>
      </section>

      {/* ========================================================
          4. THE FESTIVE EDIT BANNER (PDF Page 2)
          Split Editorial Composition
          ======================================================== */}
      <section className="bg-white border-y border-[#E8DFD0] py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#FAF7F2] rounded-2xl border border-[#E8DFD0] overflow-hidden shadow-sm grid grid-cols-1 lg:grid-cols-12 items-center">
            {/* Left: Dual Photography Grid */}
            <div className="lg:col-span-7 grid grid-cols-2 gap-2 p-2 sm:p-4">
              <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-200">
                <img
                  src="/images/products/maroon_worn.jpg"
                  alt="Festive Editorial"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-200">
                <img
                  src="/images/products/chandni_ivory_worn.jpg"
                  alt="Festive Detail"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                />
              </div>
            </div>

            {/* Right: Editorial Narrative */}
            <div className="lg:col-span-5 p-6 sm:p-10 lg:p-12 space-y-4 text-center lg:text-left">
              <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#C59B27] block">
                Heritage Silhouettes
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5B111A] leading-tight">
                The Festive Edit
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed font-light">
                Made for celebrations. Designed to stay with you. Handwoven chanderis, pure mulmuls, and intricate zari embroideries created for your special milestones.
              </p>
              <div className="pt-2">
                <Link
                  to="/shop?collection=festive-edit"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded bg-[#5B111A] hover:bg-[#3A080F] text-white font-ui font-semibold text-xs tracking-wider uppercase transition-colors shadow"
                >
                  <span>EXPLORE COLLECTION</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          5. NEW ARRIVALS (PDF Page 2)
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <div className="flex items-end justify-between mb-8 pb-3 border-b border-[#E8DFD0]">
          <div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A]">
              New Arrivals
            </h2>
            <p className="text-xs text-gray-500 mt-1">Freshly tailored sample drops</p>
          </div>
          <Link
            to="/shop"
            className="text-xs sm:text-sm font-ui font-semibold text-[#5B111A] hover:text-[#C59B27] transition-colors flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-gray-200/60 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {newArrivals.map((product, idx) => (
              <div key={product.id} className="card-stagger" style={{ animationDelay: `${idx * 40}ms` }}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========================================================
          6. SHOP THE REEL (PDF Page 2)
          4 Instagram-style vertical video cards
          ======================================================== */}
      <section className="bg-white border-y border-[#E8DFD0] py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-8 pb-3 border-b border-gray-100">
            <div>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A]">
                Shop the Reel
              </h2>
              <p className="text-xs text-gray-500 mt-1">Curated styling reels from our Jaipur boutique</p>
            </div>
            <Link
              to="/shop"
              className="text-xs font-ui font-bold uppercase tracking-wider text-[#C59B27] hover:text-[#9A7718] transition-colors"
            >
              VIEW ALL REELS →
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              {
                title: 'Noorani Festive Chanderi',
                image: '/images/styling_moment_1.jpg',
                slug: 'noorani-chanderi-kurti-set',
              },
              {
                title: 'Firdaus Peplum & Sharara',
                image: '/images/products/firdaus_ochre_worn.jpg',
                slug: 'firdaus-chanderi-peplum-sharara',
              },
              {
                title: 'Everyday Mulmul Co-ord',
                image: '/images/styling_moment_2.jpg',
                slug: 'roza-pure-mulmul-everyday-co-ord',
              },
              {
                title: 'Sitara Tissue Silk Set',
                image: '/images/products/sitara_gold_worn.jpg',
                slug: 'sitara-tissue-silk-kurti-set',
              },
            ].map((reel, idx) => (
              <Link
                key={idx}
                to={`/product/${reel.slug}`}
                className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-900 border border-[#E8DFD0] shadow-sm block"
              >
                <img
                  src={reel.image}
                  alt={reel.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                />
                {/* Play Button Indicator */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-11 h-11 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white border border-white/50 group-hover:scale-110 transition-transform shadow-lg">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </div>

                {/* Bottom Overlay Info */}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                  <p className="text-white font-serif text-xs sm:text-sm font-semibold line-clamp-1">
                    {reel.title}
                  </p>
                  <span className="text-[#EAD186] text-[11px] font-medium block mt-0.5">
                    Tap to view piece →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          7. WHY CHOOSE ROYAL LIBAS (PDF Page 2 Trust Grid)
          4 Pillars
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <div className="text-center mb-10">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A]">
            Why Choose Royal Libas
          </h2>
          <div className="w-12 h-0.5 bg-[#C59B27] mx-auto mt-2" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 text-center">
          <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
            <Heart className="w-6 h-6 text-[#C59B27] mx-auto" />
            <h4 className="font-serif font-bold text-sm sm:text-base text-gray-900">Premium Quality</h4>
            <p className="text-xs text-gray-500">Pure chanderis, silks, and breathable mulmuls.</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
            <Sparkles className="w-6 h-6 text-[#C59B27] mx-auto" />
            <h4 className="font-serif font-bold text-sm sm:text-base text-gray-900">Authentic Designs</h4>
            <p className="text-xs text-gray-500">Handcrafted silhouette cuts tailored for real bodies.</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
            <RefreshCw className="w-6 h-6 text-[#C59B27] mx-auto" />
            <h4 className="font-serif font-bold text-sm sm:text-base text-gray-900">Easy Exchange</h4>
            <p className="text-xs text-gray-500">7-day doorstep size replacement without friction.</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-[#E8DFD0] shadow-sm space-y-2">
            <HelpCircle className="w-6 h-6 text-[#C59B27] mx-auto" />
            <h4 className="font-serif font-bold text-sm sm:text-base text-gray-900">Friendly Support</h4>
            <p className="text-xs text-gray-500">Personal sizing assistance via WhatsApp support.</p>
          </div>
        </div>
      </section>

      {/* ========================================================
          8. FOUNDER QUOTE SECTION (PDF Page 2)
          Split Tanya Portrait & Deep Maroon Card
          ======================================================== */}
      <section className="bg-white border-t border-[#E8DFD0] py-14 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto rounded-2xl overflow-hidden border border-[#E8DFD0] shadow-md grid grid-cols-1 md:grid-cols-12 bg-[#FAF7F2]">
          {/* Left: Tanya Portrait */}
          <div className="md:col-span-5 aspect-[4/5] sm:aspect-auto">
            <img
              src="/images/tanya_founder.jpg"
              alt="Tanya, Founder & Creative Director"
              className="w-full h-full object-cover object-top"
            />
          </div>

          {/* Right: Deep Maroon Quote Card */}
          <div className="md:col-span-7 bg-[#5B111A] text-white p-8 sm:p-12 lg:p-14 flex flex-col justify-center space-y-4 relative">
            <div className="text-4xl sm:text-5xl font-serif text-[#C59B27] select-none leading-none">
              “
            </div>
            <p className="font-serif text-lg sm:text-xl text-[#FAF7F2] leading-relaxed italic -mt-4">
              Royal Libas is my way of sharing pieces that feel like home - timeless, elegant and made for your everyday special moments.
            </p>
            <div className="pt-2 border-t border-[#C59B27]/40 flex items-center justify-between">
              <span className="font-serif font-bold text-base text-[#EAD186] tracking-wide">
                — Tanya
              </span>
              <Link
                to="/about"
                className="text-xs font-ui font-semibold text-white/80 hover:text-white underline underline-offset-4 transition-colors"
              >
                Read Founder Story →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
