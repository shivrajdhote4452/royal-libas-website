import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Truck,
  Sparkles,
  Package,
  Heart,
  AlertCircle
} from 'lucide-react';
import { Product } from '../types/product';
import { fetchProducts } from '../lib/api';
import { ProductCard } from '../components/ProductCard';
import { FeaturedSlider } from '../components/FeaturedSlider';

export const Home: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Royal Libas by Tanya | Handcrafted Festive Silhouettes & Couture';
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

  // Editorial Scroll Reveal Observer — Viewport-triggered with no premature timers
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      // Content remains fully visible with no animations
      document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
        el.classList.remove('reveal-primed');
        el.classList.add('is-revealed');
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.06 }
    );

    const elements = document.querySelectorAll('.reveal-on-scroll');
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top >= window.innerHeight - 30) {
        // Below initial viewport: prime for scroll reveal when reached
        el.classList.add('reveal-primed');
        observer.observe(el);
      } else {
        // Above or in initial viewport: render immediately without delayed animation
        el.classList.remove('reveal-primed');
        el.classList.add('is-revealed');
      }
    });

    return () => observer.disconnect();
  }, [loading]);

  const curatedProducts = products.slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col bg-[#FCF8F0] page-enter font-sans text-[#2B1B1E]">
      {/* ========================================================
          1. CINEMATIC CAMPAIGN HERO (Handbook Page 3 & Visual PDF Page 2)
          "A NEW HEIRLOOM" - Dominates first viewport with ONE primary CTA
          ======================================================== */}
      <section className="relative overflow-hidden bg-[#2B1B1E] text-[#FCF8F0] border-b border-[#B58A3C]/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Column: High-Fashion Editorial Narrative */}
            <div className="lg:col-span-5 z-10 flex flex-col justify-center space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center justify-center lg:justify-start gap-2.5">
                <span className="w-8 h-[1px] bg-[#B58A3C]" />
                <span className="text-[11px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
                  TRADITION LIVES FOREVER
                </span>
                <span className="w-8 h-[1px] bg-[#B58A3C]" />
              </div>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#FCF8F0] leading-[1.08]">
                A NEW HEIRLOOM
              </h1>

              <p className="text-sm sm:text-base text-[#FCF8F0]/85 font-light leading-relaxed max-w-lg mx-auto lg:mx-0">
                Handcrafted ethnic wear for the modern woman. Rooted in centuries-old Indian textile heritage, tailored with precision for your celebrations.
              </p>

              {/* Single Primary Hero Action as mandated by Handbook Section 03 */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link
                  to="/shop?collection=festive-edit"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-[#FCF8F0] hover:bg-[#B58A3C] text-[#2B1B1E] hover:text-white font-ui font-semibold text-xs uppercase tracking-[0.22em] transition-all duration-300 shadow-xl group border border-[#B58A3C]"
                >
                  <span>EXPLORE FESTIVE EDIT</span>
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/shop"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-4 bg-transparent hover:bg-white/10 text-[#FCF8F0] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-colors border border-[#FCF8F0]/30"
                >
                  VIEW ALL DESIGNS
                </Link>
              </div>

              <div className="pt-2 flex items-center justify-center lg:justify-start gap-6 text-[10.5px] uppercase tracking-[0.2em] text-[#B58A3C]">
                <span>Pure Chanderi &amp; Modal Silk</span>
                <span>&bull;</span>
                <span>Zari Needlework</span>
              </div>
            </div>

            {/* Right Column: Hero High-Resolution Fashion Photography */}
            <div className="lg:col-span-7">
              <div className="relative aspect-[4/3] sm:aspect-[16/11] lg:aspect-[16/12] overflow-hidden border border-[#B58A3C]/40 shadow-2xl bg-neutral-900 group">
                <img
                  src="/images/products/noorani_maroon_front.jpg"
                  alt="Royal Libas Noorani Embroidered Ensemble"
                  className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

                {/* Editorial Brand Accent */}
                <div className="absolute bottom-4 left-4 z-10">
                  <span className="inline-flex items-center px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase bg-[#5E1224]/95 text-[#FCF8F0] border border-[#B58A3C]/50 shadow-md backdrop-blur-sm">
                    FESTIVE COUTURE &bull; ATELIER EDIT
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Connection Notification if API is offline */}
      {error && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center text-xs text-amber-800 flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================
          2. TRUST ASSURANCE STRIP (Handbook Section 03)
          ======================================================== */}
      <section className="bg-[#FCF8F0] py-6 sm:py-8 px-4 sm:px-6 lg:px-8 border-b border-[#E8DFD0]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 text-center">
          <div className="flex flex-col items-center justify-center p-2 space-y-1.5">
            <Truck className="w-5 h-5 text-[#B58A3C]" strokeWidth={1.5} />
            <h4 className="font-serif font-bold text-xs tracking-[0.14em] uppercase text-[#2B1B1E]">
              COMPLIMENTARY SHIPPING
            </h4>
            <p className="text-[11px] text-gray-600">On all prepaid orders across India</p>
          </div>

          <div className="flex flex-col items-center justify-center p-2 space-y-1.5">
            <Sparkles className="w-5 h-5 text-[#B58A3C]" strokeWidth={1.5} />
            <h4 className="font-serif font-bold text-xs tracking-[0.14em] uppercase text-[#2B1B1E]">
              AUTHENTIC SILK &amp; WEAVES
            </h4>
            <p className="text-[11px] text-gray-600">Pure Chanderi, Modal &amp; Velvet</p>
          </div>

          <div className="flex flex-col items-center justify-center p-2 space-y-1.5">
            <Heart className="w-5 h-5 text-[#B58A3C]" strokeWidth={1.5} />
            <h4 className="font-serif font-bold text-xs tracking-[0.14em] uppercase text-[#2B1B1E]">
              HERITAGE CRAFTSMANSHIP
            </h4>
            <p className="text-[11px] text-gray-600">Master artisan zardozi embroidery</p>
          </div>

          <div className="flex flex-col items-center justify-center p-2 space-y-1.5">
            <Package className="w-5 h-5 text-[#B58A3C]" strokeWidth={1.5} />
            <h4 className="font-serif font-bold text-xs tracking-[0.14em] uppercase text-[#2B1B1E]">
              ATELIER PACKAGING
            </h4>
            <p className="text-[11px] text-gray-600">Hand-inspected &amp; steam-pressed</p>
          </div>
        </div>
      </section>

      {/* ========================================================
          CONTINUOUS LUXURY MARQUEE TICKER (Reference Motion Feature)
          ======================================================== */}
      <div className="bg-[#2B1B1E] text-[#FCF8F0] border-b border-[#B58A3C]/40 py-2.5 overflow-hidden select-none">
        <div className="animate-marquee-track flex items-center text-[10.5px] font-semibold uppercase tracking-[0.25em]">
          {[1, 2].map((group) => (
            <div key={group} className="flex items-center space-x-8 px-4 shrink-0">
              <span className="flex items-center gap-2">
                <span className="text-[#B58A3C]">✦</span> COMPLIMENTARY SHIPPING ACROSS INDIA
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[#B58A3C]">✦</span> HANDCRAFTED CHANDERI &amp; MODAL SILK
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[#B58A3C]">✦</span> MASTER ARTISAN ZARI EMBROIDERY
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[#B58A3C]">✦</span> HASSLE-FREE 7-DAY EXCHANGE
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[#B58A3C]">✦</span> 100% AUTHENTIC ATELIER CRAFTSMANSHIP
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================
          3. SHOP BY CATEGORY (Real Catalog Categories & Edits)
          Kurti Sets, Festive Sets, Co-ord Sets & Everyday Cotton
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 w-full reveal-on-scroll">
        <div className="text-center mb-10 space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
              EXPLORE OUR WORLD
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224]">
            SHOP BY CATEGORY
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto font-light">
            Each silhouette is handcrafted by master artisans using time-honoured Indian textile traditions.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            {
              title: 'KURTI SETS',
              subtitle: '8 Handcrafted Styles',
              image: '/images/products/chandni_ivory_front.jpg',
              href: '/shop?category=Kurti+Sets',
            },
            {
              title: 'FESTIVE SETS',
              subtitle: '4 Royal Ensembles',
              image: '/images/products/zari_mahal_emerald_front.jpg',
              href: '/shop?category=Festive+Sets',
            },
            {
              title: 'CO-ORD SETS',
              subtitle: '4 Modern Silhouettes',
              image: '/images/products/nazm_emerald_front.jpg',
              href: '/shop?category=Co-ord+Sets',
            },
            {
              title: 'EVERYDAY COTTON',
              subtitle: 'Curated Boutique Edit',
              image: '/images/products/bagicha_sage_front.jpg',
              href: '/shop?collection=everyday-cotton',
            },
          ].map((cat, idx) => (
            <Link
              key={idx}
              to={cat.href}
              className={`group relative aspect-[4/5] overflow-hidden border border-[#E8DFD0] hover:border-[#B58A3C]/70 shadow-sm bg-neutral-900 block focus:outline-none stagger-${idx + 1}`}
            >
              <img
                src={cat.image}
                alt={cat.title}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700 ease-out"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent group-hover:from-black/75 transition-colors" />

              {/* Clean HTML Labels - Sharp and Accessible */}
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex flex-col justify-end text-left">
                <span className="font-serif font-bold text-sm sm:text-base tracking-[0.16em] uppercase text-white group-hover:text-[#D4AF67] transition-colors flex items-center justify-between">
                  <span>{cat.title}</span>
                  <span className="transform group-hover:translate-x-1 transition-transform">&rarr;</span>
                </span>
                <span className="text-[10px] text-[#FCF8F0]/70 font-light tracking-wider mt-0.5">
                  {cat.subtitle}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ========================================================
          FEATURED PRODUCT 3D SLIDER (Reference Motion Carousel)
          Center-focused active card with peeking neighbors & smooth controls
          ======================================================== */}
      {products.length > 0 && (
        <div className="reveal-on-scroll">
          <FeaturedSlider
            products={products}
            title="ICONIC ATELIER SILHOUETTES"
            subtitle="Explore signature handcrafted pieces from our seasonal and festive collections."
          />
        </div>
      )}

      {/* ========================================================
          4. THE FESTIVE COLLECTION (Handbook Section 03 & Visual PDF Page 3)
          Full-Width Editorial Campaign Banner
          ======================================================== */}
      <section className="relative overflow-hidden bg-[#2B1B1E] text-[#FCF8F0] border-y border-[#B58A3C]/30 my-6">
        <div className="relative min-h-[380px] sm:min-h-[460px] lg:min-h-[520px] flex items-center">
          <img
            src="/images/products/dastaan_wine_front.jpg"
            alt="The Festive Collection Campaign"
            className="absolute inset-0 w-full h-full object-cover object-top opacity-60"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#2B1B1E]/95 via-[#2B1B1E]/75 to-transparent pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 w-full">
            <div className="max-w-xl space-y-5 text-left">
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#B58A3C] font-semibold block">
                SPECIAL OCCASIONS
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#FCF8F0] leading-tight">
                THE FESTIVE COLLECTION
              </h2>
              <div className="w-12 h-[1px] bg-[#B58A3C]" />
              <p className="text-sm sm:text-base text-[#FCF8F0]/85 leading-relaxed font-light">
                For celebrations that become a part of your story. Tailored in pure chanderi silks, modal velvets, and delicate zardozi needlework.
              </p>
              <div className="pt-2">
                <Link
                  to="/shop?collection=festive-edit"
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-transparent hover:bg-[#B58A3C] text-[#FCF8F0] hover:text-[#2B1B1E] border border-[#B58A3C] font-ui font-semibold text-xs tracking-[0.2em] uppercase transition-all shadow-lg"
                >
                  <span>EXPLORE FESTIVE COLLECTION</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="pt-4 flex flex-wrap gap-3 sm:gap-4 text-[10px] tracking-[0.22em] uppercase text-[#B58A3C]">
                <span>RICH VELVETS</span>
                <span>&bull;</span>
                <span>TIMELESS SILHOUETTES</span>
                <span>&bull;</span>
                <span>MODERN ELEGANCE</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          5. CURATED FOR YOU / NEW ARRIVALS (Handbook Section 03)
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 w-full reveal-on-scroll">
        <div className="flex items-end justify-between mb-10 pb-3 border-b border-[#E8DFD0]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold mb-1">
              OUR FAVOURITES
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224]">
              NEW ARRIVALS
            </h2>
          </div>
          <Link
            to="/shop"
            className="text-xs font-ui font-semibold text-[#5E1224] hover:text-[#B58A3C] transition-colors flex items-center gap-1.5 uppercase tracking-wider"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-[4/5] skeleton-shimmer rounded-none" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {curatedProducts.map((product, idx) => (
              <div key={product.id} className="card-stagger" style={{ animationDelay: `${idx * 40}ms` }}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========================================================
          6. BRAND STORY: CRAFTED LEGACIES (Handbook Section 03 & 07)
          ======================================================== */}
      <section className="bg-silk-pattern border-y border-[#E8DFD0] py-16 sm:py-24 px-4 sm:px-6 lg:px-8 reveal-on-scroll">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Workshop Craftsmanship Photography */}
          <div className="lg:col-span-6 aspect-[4/3] sm:aspect-[16/11] overflow-hidden border border-[#B58A3C]/40 shadow-xl bg-neutral-900 group">
            <img
              src="/images/products/riwayat_plum_front.jpg"
              alt="Artisan Craftsmanship at Royal Libas Atelier"
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700 ease-out"
              loading="lazy"
            />
          </div>

          {/* Right Column: Editorial Narrative */}
          <div className="lg:col-span-6 bg-[#FCF8F0] border border-[#B58A3C]/30 p-8 sm:p-12 lg:p-14 space-y-6 text-left shadow-sm">
            <div className="inline-flex items-center gap-2">
              <span className="w-6 h-[1px] bg-[#B58A3C]" />
              <span className="text-[10.5px] uppercase tracking-[0.3em] text-[#B58A3C] font-semibold">
                OUR STORY
              </span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] leading-tight">
              CRAFTED LEGACIES FOR A BRIGHTER TOMORROW
            </h2>

            <p className="text-sm sm:text-base text-gray-700 leading-relaxed font-light">
              At Royal Libas, we celebrate the richness of Indian textile heritage through meticulously designed silhouettes, supporting skilled master weavers and keeping timeless embroidery traditions alive for the modern wardrobe.
            </p>

            <div className="pt-2">
              <Link
                to="/about"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-transparent hover:bg-[#5E1224] text-[#5E1224] hover:text-[#FCF8F0] border border-[#5E1224] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-all"
              >
                DISCOVER OUR STORY
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
