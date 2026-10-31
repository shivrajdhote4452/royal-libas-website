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
import { EditorialPoster } from '../components/EditorialPoster';
import { useStoreSettings } from '../lib/settings';

export const Home: React.FC = () => {
  const { settings } = useStoreSettings();
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
      <section className="relative overflow-hidden bg-[#180A0E] text-[#FCF8F0] border-b border-[#B58A3C]/40">
        {/* Ambient atmospheric lighting */}
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[#B58A3C]/12 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#2E1218]/60 via-[#180A0E] to-[#12070A] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-20 xl:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
            {/* Mobile-First Fashion Image Display (prominent visual on mobile before text) */}
            <div className="lg:hidden w-full">
              <div className="hero-motion-frame relative aspect-[4/3] sm:aspect-[16/11] overflow-hidden border border-[#B58A3C]/40 shadow-2xl bg-neutral-900 group">
                {settings.heroImageUrl || '/images/editorial/hero_campaign.jpg' ? (
                  <img
                    src={settings.heroImageUrl || '/images/editorial/hero_campaign.jpg'}
                    alt={settings.heroTitle || 'Royal Libas A New Heirloom Campaign'}
                    className="hero-motion-image w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#2B1B1E] via-[#3E161D] to-[#180A0E] text-[#FCF8F0] border border-[#B58A3C]/30 select-none">
                    <div className="w-12 h-12 rounded-full border border-[#D4AF67]/50 flex items-center justify-center mb-2">
                      <span className="font-serif text-lg font-bold text-[#D4AF67]">RL</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF67] font-semibold">
                      ATELIER EDIT 2026
                    </span>
                    <p className="font-serif text-base text-[#FCF8F0] mt-1 font-medium">
                      Photo coming soon
                    </p>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-3 left-3 z-10">
                  <span className="inline-flex items-center px-2.5 py-1 text-[9.5px] font-bold tracking-[0.2em] uppercase bg-[#5E1224]/95 text-[#FCF8F0] border border-[#B58A3C]/50 shadow-md backdrop-blur-sm">
                    ATELIER COUTURE &bull; FESTIVE 2026
                  </span>
                </div>
              </div>
            </div>

            {/* Left Column: High-Fashion Editorial Narrative */}
            <div className="hero-motion-copy lg:col-span-5 z-10 flex flex-col justify-center space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center justify-center lg:justify-start gap-2.5">
                <span className="w-8 h-[1px] bg-[#D4AF67]" />
                <span className="text-[11px] uppercase tracking-[0.3em] text-[#D4AF67] font-semibold">
                  ✦ &nbsp; TRADITION LIVES FOREVER &nbsp; ✦
                </span>
                <span className="w-8 h-[1px] bg-[#D4AF67]" />
              </div>

              <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-[#FCF8F0] leading-[1.06]">
                <span className="block">ROYAL LIBAS</span>
                <span className="block text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-normal tracking-[0.16em] text-[#D4AF67] font-serif italic mt-1 sm:mt-1.5">
                  by Tanya
                </span>
              </h1>

              <div className="space-y-1.5 max-w-lg mx-auto lg:mx-0">
                <p className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#D4AF67] font-semibold">
                  A New Heirloom &bull; Festive 2026
                </p>
                <p className="text-sm sm:text-base text-[#FCF8F0]/90 font-light leading-relaxed">
                  Handcrafted ethnic wear for the modern woman. Rooted in centuries-old Indian textile heritage, tailored with precision for your celebrations.
                </p>
              </div>

              {/* High-Contrast, Prominent Shopping CTA Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link
                  to="/shop?collection=festive-edit"
                  className="luxury-btn-sheen w-full sm:w-auto inline-flex items-center justify-center px-8 sm:px-10 py-4 bg-gradient-to-r from-[#D4AF67] via-[#C5A059] to-[#B58A3C] hover:from-[#E2C27F] hover:to-[#D4AF67] text-[#1A0B0E] font-ui font-bold text-xs sm:text-sm uppercase tracking-[0.24em] transition-all duration-300 shadow-[0_8px_28px_rgba(212,175,103,0.38)] hover:shadow-[0_12px_36px_rgba(212,175,103,0.55)] group border border-[#D4AF67] active:scale-[0.99]"
                >
                  <span>EXPLORE FESTIVE COLLECTION</span>
                  <ArrowRight className="w-4 h-4 ml-2.5 group-hover:translate-x-1.5 transition-transform" />
                </Link>
                <Link
                  to="/shop"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-4 bg-transparent hover:bg-white/10 text-[#FCF8F0] hover:text-[#D4AF67] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-all border border-[#FCF8F0]/30 hover:border-[#D4AF67]"
                >
                  VIEW ALL DESIGNS
                </Link>
              </div>

              <div className="pt-2 flex items-center justify-center lg:justify-start gap-4 sm:gap-6 text-[10.5px] uppercase tracking-[0.2em] text-[#D4AF67]">
                <span>Pure Chanderi &amp; Modal Silk</span>
                <span>&bull;</span>
                <span>Zari Needlework</span>
              </div>
            </div>

            {/* Right Column: Hero High-Resolution Fashion Photography (Desktop) */}
            <div className="hidden lg:block lg:col-span-7">
              <div className="hero-motion-frame relative aspect-[16/11] overflow-hidden border border-[#B58A3C]/45 shadow-[0_24px_60px_rgba(0,0,0,0.65)] bg-neutral-950 group">
                {settings.heroImageUrl || '/images/editorial/hero_campaign.jpg' ? (
                  <img
                    src={settings.heroImageUrl || '/images/editorial/hero_campaign.jpg'}
                    alt={settings.heroTitle || 'Royal Libas Campaign'}
                    className="hero-motion-image w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#2B1B1E] via-[#3E161D] to-[#180A0E] text-[#FCF8F0] border border-[#B58A3C]/30 select-none">
                    <div className="w-16 h-16 rounded-full border border-[#D4AF67]/60 flex items-center justify-center mb-3 shadow-lg bg-[#180A0E]/60">
                      <span className="font-serif text-2xl font-bold text-[#D4AF67]">RL</span>
                    </div>
                    <span className="text-xs uppercase tracking-[0.28em] text-[#D4AF67] font-semibold">
                      ROYAL LIBAS ATELIER
                    </span>
                    <h3 className="font-serif text-2xl text-[#FCF8F0] mt-1 font-bold">
                      {settings.heroTitle || 'Timeless Elegance'}
                    </h3>
                    <p className="text-xs text-[#FCF8F0]/70 mt-1 max-w-sm">
                      Handcrafted silhouettes for modern celebrations. Real photography coming soon.
                    </p>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                {/* Editorial Brand Accent */}
                <div className="absolute bottom-4 left-4 z-10">
                  <span className="inline-flex items-center px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase bg-[#5E1224]/95 text-[#FCF8F0] border border-[#B58A3C]/50 shadow-md backdrop-blur-sm">
                    ATELIER COUTURE &bull; FESTIVE 2026
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: 'TWO PIECES',
              subtitle: 'Co-ord Sets & Kurta Pant',
              image: settings.categoryTwoPiecesImage || '/images/editorial/cat_suits.jpg',
              href: '/shop?category=TWO+PIECES',
              tag: 'Modern Silhouettes',
            },
            {
              title: 'SUIT SET',
              subtitle: 'Three Pieces, Semi-party & Party Wear',
              image: settings.categorySuitSetImage || '/images/editorial/cat_lehengas.jpg',
              href: '/shop?category=SUIT+SET',
              tag: 'Royal Ensembles',
            },
            {
              title: 'HEAVY DRESS',
              subtitle: 'Lehenga, Sharara, Gharara & Designer Wear',
              image: settings.categoryHeavyDressImage || '/images/editorial/cat_anarkalis.jpg',
              href: '/shop?category=HEAVY+DRESS',
              tag: 'Grand Occasions',
            },
          ].map((cat, idx) => (
            <Link
              key={idx}
              to={cat.href}
              className={`reveal-card group relative aspect-[4/5] sm:aspect-[3/4] overflow-hidden border border-[#E8DFD0] hover:border-[#B58A3C]/80 shadow-md bg-neutral-900 block focus:outline-none stagger-${idx + 1}`}
            >
              {cat.image ? (
                <>
                  <img
                    src={cat.image}
                    alt={cat.title}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent group-hover:from-black/75 transition-colors pointer-events-none" />
                </>
              ) : (
                <div className="relative w-full h-full bg-gradient-to-br from-[#2B1B1E] via-[#3E161D] to-[#1A0B0E] flex flex-col justify-between p-6 select-none border border-[#B58A3C]/30">
                  <div
                    className="absolute inset-0 opacity-[0.08] pointer-events-none"
                    style={{
                      backgroundImage: `radial-gradient(circle at 50% 50%, #B58A3C 1px, transparent 1px)`,
                      backgroundSize: '16px 16px',
                    }}
                  />
                  <div className="absolute inset-3 border border-[#B58A3C]/20 pointer-events-none" />
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#D4AF67] px-2.5 py-0.5 bg-[#5E1224]/90 border border-[#B58A3C]/40">
                      {cat.tag}
                    </span>
                    <span className="font-serif text-sm font-bold text-[#D4AF67]">RL</span>
                  </div>

                  <div className="relative z-10 text-center my-auto py-6">
                    <div className="w-12 h-12 mx-auto rounded-full border border-[#D4AF67]/50 flex items-center justify-center mb-2.5 bg-[#1A0B0E]/60 shadow">
                      <span className="font-serif text-base font-bold text-[#D4AF67]">RL</span>
                    </div>
                    <span className="text-[9.5px] uppercase tracking-[0.25em] text-[#D4AF67] block font-ui font-semibold">
                      Photo coming soon
                    </span>
                  </div>

                  <div className="relative z-10">
                    <span className="font-serif font-bold text-lg tracking-[0.16em] uppercase text-white group-hover:text-[#D4AF67] transition-colors flex items-center justify-between">
                      <span>{cat.title}</span>
                      <span className="transform group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </span>
                    <span className="text-[11px] text-[#FCF8F0]/80 font-light tracking-wider mt-1 block">
                      {cat.subtitle}
                    </span>
                  </div>
                </div>
              )}

              {cat.image && (
                <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col justify-end text-left z-10">
                  <span className="font-serif font-bold text-base sm:text-lg tracking-[0.16em] uppercase text-white group-hover:text-[#D4AF67] transition-colors flex items-center justify-between">
                    <span>{cat.title}</span>
                    <span className="transform group-hover:translate-x-1 transition-transform">&rarr;</span>
                  </span>
                  <span className="text-[11px] text-[#FCF8F0]/80 font-light tracking-wider mt-1">
                    {cat.subtitle}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* ========================================================
          4. EDITORIAL POSTER 1: THE OCCASION EDIT (Visual Concept Page 1)
          Maroon festive atmosphere, model on right, content on left
          ======================================================== */}
      <EditorialPoster
        id="occasion-edit"
        theme="occasion"
        kicker="THE OCCASION EDIT"
        heading={
          <>
            A MOMENT TO <br className="hidden sm:inline" />
            REMEMBER
          </>
        }
        subtitle="For the celebrations you will always treasure."
        ctaText="EXPLORE COLLECTION"
        ctaLink="/shop?collection=festive-edit"
        imageWebp="/images/posters/royal_occasion.webp"
        imageJpg="/images/posters/royal_occasion.jpg"
        customImage={settings.posterOccasionImage}
        imageAlt="Festive occasion wear concept silhouette"
        layout="content-left"
      />

      {/* ========================================================
          5. FEATURED PRODUCT 3D SLIDER (Reference Motion Carousel)
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
          6. EDITORIAL POSTER 2: THE EVERYDAY EDIT (Visual Concept Page 2)
          Light ivory sun-washed contrast section, model on left, content on right
          ======================================================== */}
      <EditorialPoster
        id="everyday-edit"
        theme="everyday"
        kicker="THE EVERYDAY EDIT"
        heading={
          <>
            ELEGANCE, <br className="hidden sm:inline" />
            EVERY DAY
          </>
        }
        subtitle="Thoughtful silhouettes for moments made yours."
        ctaText="SHOP THE EDIT"
        ctaLink="/shop?category=TWO+PIECES"
        imageWebp="/images/posters/everyday_elegance.webp"
        imageJpg="/images/posters/everyday_elegance.jpg"
        customImage={settings.posterEverydayImage}
        imageAlt="Everyday contemporary ethnic wear concept silhouette"
        layout="content-right"
      />

      {/* ========================================================
          7. THE FESTIVE COLLECTION (Restored Original Campaign Banner)
          Full-width deep maroon velvet campaign editorial
          ======================================================== */}
      <section className="reveal-on-scroll relative overflow-hidden bg-[#2B1B1E] text-[#FCF8F0] border-y border-[#B58A3C]/30 my-6">
        <div className="relative min-h-[380px] sm:min-h-[460px] lg:min-h-[520px] flex items-center">
          {settings.festiveBannerImage || '/images/editorial/festive_banner.jpg' ? (
            <img
              src={settings.festiveBannerImage || '/images/editorial/festive_banner.jpg'}
              alt="The Festive Collection Campaign"
              className="editorial-motion-image absolute inset-0 w-full h-full object-cover object-center opacity-75"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-[#200A0F] via-[#330F17] to-[#1A060A] opacity-95 pointer-events-none" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#180A0E]/95 via-[#180A0E]/80 to-transparent pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-20 w-full">
            <div className="editorial-motion-copy max-w-xl space-y-4 sm:space-y-5 text-left">
              <span className="text-[9.5px] sm:text-[10px] uppercase tracking-[0.25em] sm:tracking-[0.3em] text-[#D4AF67] font-semibold block">
                SPECIAL OCCASIONS
              </span>
              <h2 className="font-serif text-2xl sm:text-4xl lg:text-5xl font-bold text-[#FCF8F0] leading-tight">
                THE FESTIVE COLLECTION
              </h2>
              <div className="w-12 h-[1px] bg-[#D4AF67]" />
              <p className="text-xs sm:text-base text-[#FCF8F0]/90 leading-relaxed font-light">
                For celebrations that become a part of your story. Tailored in pure chanderi silks, modal velvets, and delicate zardozi needlework.
              </p>
              <div className="pt-2">
                <Link
                  to="/shop?collection=festive-edit"
                  className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 bg-gradient-to-r from-[#D4AF67] via-[#C5A059] to-[#B58A3C] hover:from-[#E2C27F] hover:to-[#D4AF67] text-[#1A0B0E] font-ui font-bold text-xs tracking-[0.2em] sm:tracking-[0.22em] uppercase transition-all shadow-[0_6px_20px_rgba(212,175,103,0.35)] border border-[#D4AF67]"
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
          8. CURATED FOR YOU / NEW ARRIVALS (Handbook Section 03)
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
              <div key={product.id} className={`reveal-card stagger-${idx + 1}`}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========================================================
          9. EDITORIAL POSTER 3: THE ROYAL LIBAS STORY (Visual Concept Page 3)
          Tactile crimson velvet & gold embroidery, hands on right, content on left
          ======================================================== */}
      <EditorialPoster
        id="royal-libas-story"
        theme="story"
        kicker="THE ROYAL LIBAS STORY"
        heading={
          <>
            CRAFTED WITH <br className="hidden sm:inline" />
            INTENTION
          </>
        }
        subtitle="Discover the details that make every piece special."
        ctaText="DISCOVER OUR STORY"
        ctaLink="/about"
        imageWebp="/images/posters/crafted_with_care.webp"
        imageJpg="/images/posters/crafted_with_care.jpg"
        customImage={settings.posterStoryImage}
        imageAlt="Intricate zardozi and gold thread embroidery textile concept"
        layout="content-left"
      />
    </div>
  );
};

export default Home;
