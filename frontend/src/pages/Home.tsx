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

export const Home: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);

  const heroSlides = [
    {
      eyebrow: 'TRADITION LIVES FOREVER',
      title: 'A NEW HEIRLOOM',
      subtitle: "Exquisite ethnic wear for the modern woman. Rooted in heritage, designed for what's next.",
      buttonText: 'SHOP COLLECTION',
      buttonLink: '/shop?collection=festive-edit',
      image: '/images/editorial/hero_campaign.jpg',
      alt: 'Royal Libas Maroon Heirloom Couture',
    },
    {
      eyebrow: 'TIMELESS INDIAN SILHOUETTES',
      title: 'THE MODAL SILK EDIT',
      subtitle: 'Lustrous satin textures with delicate hand-embroidery tailored for effortless grace.',
      buttonText: 'EXPLORE EDIT',
      buttonLink: '/shop?collection=everyday-cotton',
      image: '/images/products/chandni_ivory_front.jpg',
      alt: 'Royal Libas Ivory Silk Ensemble',
    },
  ];

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

  // Editorial Scroll Reveal Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    const elements = document.querySelectorAll('.reveal-on-scroll');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [loading]);

  const curatedProducts = products.slice(0, 4);
  const currentHero = heroSlides[activeHeroSlide];

  return (
    <div className="min-h-screen flex flex-col bg-[#FCF8F0] page-enter font-sans text-[#2B1B1E]">
      {/* ========================================================
          1. CINEMATIC CAMPAIGN HERO (PDF Page 2 & 12)
          "A New Heirloom"
          ======================================================== */}
      <section className="relative overflow-hidden bg-[#2B1B1E] text-[#FCF8F0] border-b border-[#B58A3C]/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Column: High-Fashion Editorial Typography (PDF Page 2) */}
            <div className="lg:col-span-5 z-10 flex flex-col justify-center space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center justify-center lg:justify-start gap-2.5">
                <span className="w-8 h-[1px] bg-[#B58A3C]" />
                <span className="text-[11px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
                  {currentHero.eyebrow}
                </span>
                <span className="w-8 h-[1px] bg-[#B58A3C]" />
              </div>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#FCF8F0] leading-[1.08]">
                {currentHero.title}
              </h1>

              <p className="text-sm sm:text-base text-[#FCF8F0]/85 font-light leading-relaxed max-w-lg mx-auto lg:mx-0">
                {currentHero.subtitle}
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link
                  to={currentHero.buttonLink}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 bg-[#FCF8F0] hover:bg-[#B58A3C] text-[#2B1B1E] hover:text-white font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-md group border border-[#B58A3C]"
                >
                  <span>{currentHero.buttonText}</span>
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link
                  to="/shop"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 bg-transparent hover:bg-white/10 text-[#FCF8F0] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-colors border border-[#FCF8F0]/30"
                >
                  VIEW ALL DESIGNS
                </Link>
              </div>

              {/* Slide Dots Indicator */}
              <div className="pt-4 flex items-center justify-center lg:justify-start gap-3">
                {heroSlides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveHeroSlide(idx)}
                    className={`h-1.5 transition-all duration-300 rounded-full ${
                      activeHeroSlide === idx ? 'w-8 bg-[#B58A3C]' : 'w-2.5 bg-white/30 hover:bg-white/60'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Right Column: Hero Fashion Photography */}
            <div className="lg:col-span-7">
              <div className="relative aspect-[4/3] sm:aspect-[16/11] lg:aspect-[16/12] overflow-hidden border border-[#B58A3C]/40 shadow-2xl bg-neutral-900 group">
                <img
                  src={currentHero.image}
                  alt={currentHero.alt}
                  className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

                {/* Editorial Accent Badge */}
                <div className="absolute bottom-4 left-4 z-10">
                  <span className="inline-flex items-center px-2.5 py-1 text-[10px] font-bold tracking-[0.2em] uppercase bg-[#5E1224]/90 text-[#FCF8F0] border border-[#B58A3C]/40 shadow-sm backdrop-blur-[2px]">
                    ROYAL LIBAS ATELIER
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
          2. SHOP BY CATEGORY (PDF Page 2 Arched/Portrait Cards)
          4 Categories: SAREES, LEHENGAS, ANARKALIS, SUITS & SETS
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
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            {
              title: 'SAREES',
              image: '/images/editorial/cat_sarees.jpg',
              href: '/shop?category=Kurti+Sets',
            },
            {
              title: 'LEHENGAS',
              image: '/images/editorial/cat_lehengas.jpg',
              href: '/shop?collection=festive-edit',
            },
            {
              title: 'ANARKALIS',
              image: '/images/editorial/cat_anarkalis.jpg',
              href: '/shop?category=Co-ord+Sets',
            },
            {
              title: 'SUITS & SETS',
              image: '/images/editorial/cat_suits.jpg',
              href: '/shop?collection=everyday-cotton',
            },
          ].map((cat, idx) => (
            <Link
              key={idx}
              to={cat.href}
              className="group relative aspect-[3/4] overflow-hidden border border-[#E8DFD0] hover:border-[#B58A3C]/60 shadow-sm bg-neutral-900 block focus:outline-none"
            >
              <img
                src={cat.image}
                alt={cat.title}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700 ease-out"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent group-hover:from-black/75 transition-colors" />

              {/* Bottom Label & Arrow matching PDF Page 2 */}
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-center justify-between">
                <span className="font-serif font-bold text-sm sm:text-base tracking-[0.16em] uppercase text-white group-hover:text-[#D4AF67] transition-colors">
                  {cat.title} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ========================================================
          3. THE FESTIVE COLLECTION (PDF Page 3)
          Full-Width Editorial Campaign Banner
          ======================================================== */}
      <section className="relative overflow-hidden bg-[#2B1B1E] text-[#FCF8F0] border-y border-[#B58A3C]/30 my-6">
        <div className="relative min-h-[380px] sm:min-h-[460px] lg:min-h-[520px] flex items-center">
          <img
            src="/images/editorial/festive_banner.jpg"
            alt="The Festive Collection"
            className="absolute inset-0 w-full h-full object-cover object-center opacity-85"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#2B1B1E]/95 via-[#2B1B1E]/70 to-transparent lg:to-[#2B1B1E]/40 pointer-events-none" />

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
                  <span>EXPLORE NOW</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Accents matching PDF Page 3 */}
              <div className="pt-4 flex flex-wrap gap-3 sm:gap-4 text-[10px] tracking-[0.22em] uppercase text-[#B58A3C]">
                <span>RICH TEXTURES</span>
                <span>•</span>
                <span>TIMELESS SILHOUETTES</span>
                <span>•</span>
                <span>MODERN ELEGANCE</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          4. CURATED FOR YOU / OUR FAVOURITES (PDF Page 3)
          ======================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 w-full reveal-on-scroll">
        <div className="flex items-end justify-between mb-10 pb-3 border-b border-[#E8DFD0]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold mb-1">
              OUR FAVOURITES
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224]">
              CURATED FOR YOU
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
              <div key={i} className="aspect-[3/4] skeleton-shimmer rounded-none" />
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
          5. BRAND STORY: CRAFTED LEGACIES (PDF Page 3 & 10)
          Two-Column Asymmetric Storytelling
          ======================================================== */}
      <section className="bg-silk-pattern border-y border-[#E8DFD0] py-16 sm:py-24 px-4 sm:px-6 lg:px-8 reveal-on-scroll">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Workshop Craftsmanship Photography */}
          <div className="lg:col-span-6 aspect-[4/3] sm:aspect-[16/11] overflow-hidden border border-[#B58A3C]/40 shadow-xl bg-neutral-900 group">
            <img
              src="/images/studio_craft.jpg"
              alt="Artisan Craftsmanship at Royal Libas"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              loading="lazy"
            />
          </div>

          {/* Right Column: Editorial Narrative matching PDF Page 3 */}
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
              At Royal Libas, we celebrate the richness of Indian heritage through meticulously crafted designs, supporting master artisans and keeping timeless traditions alive for generations of modern women.
            </p>

            <div className="pt-2">
              <Link
                to="/about"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-transparent hover:bg-[#5E1224] text-[#5E1224] hover:text-[#FCF8F0] border border-[#5E1224] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-all"
              >
                OUR STORY
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          6. TRUST ASSURANCE STRIP (PDF Page 3)
          4 Luxury Pillars: Worldwide Shipping, Premium Craftsmanship, Ethically Made, Exclusive Packaging
          ======================================================== */}
      <section className="bg-[#FCF8F0] py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-b border-[#E8DFD0]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 text-center">
          <div className="flex flex-col items-center justify-center p-3 space-y-2">
            <Truck className="w-6 h-6 text-[#B58A3C]" strokeWidth={1.5} />
            <h4 className="font-serif font-bold text-xs sm:text-sm tracking-[0.12em] uppercase text-[#2B1B1E]">
              WORLDWIDE SHIPPING
            </h4>
            <p className="text-[11.5px] text-gray-600">Prompt & Reliable Delivery</p>
          </div>

          <div className="flex flex-col items-center justify-center p-3 space-y-2">
            <Sparkles className="w-6 h-6 text-[#B58A3C]" strokeWidth={1.5} />
            <h4 className="font-serif font-bold text-xs sm:text-sm tracking-[0.12em] uppercase text-[#2B1B1E]">
              PREMIUM CRAFTSMANSHIP
            </h4>
            <p className="text-[11.5px] text-gray-600">Finest Handcrafted Fabrics</p>
          </div>

          <div className="flex flex-col items-center justify-center p-3 space-y-2">
            <Heart className="w-6 h-6 text-[#B58A3C]" strokeWidth={1.5} />
            <h4 className="font-serif font-bold text-xs sm:text-sm tracking-[0.12em] uppercase text-[#2B1B1E]">
              ETHICALLY MADE
            </h4>
            <p className="text-[11.5px] text-gray-600">Supporting Artisan Communities</p>
          </div>

          <div className="flex flex-col items-center justify-center p-3 space-y-2">
            <Package className="w-6 h-6 text-[#B58A3C]" strokeWidth={1.5} />
            <h4 className="font-serif font-bold text-xs sm:text-sm tracking-[0.12em] uppercase text-[#2B1B1E]">
              EXCLUSIVE PACKAGING
            </h4>
            <p className="text-[11.5px] text-gray-600">Every order beautifully boxed</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
