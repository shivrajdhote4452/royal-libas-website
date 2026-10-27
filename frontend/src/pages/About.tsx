import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export const About: React.FC = () => {
  useEffect(() => {
    document.title = 'About Us & Tanya’s Story | Royal Libas';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#FCF8F0] text-gray-800 font-sans page-enter">
      {/* ========================================================
          1. HERO HEADER (PDF Page 10)
          "OUR STORY - More Than Fashion, A Living Heritage"
          ======================================================== */}
      <section className="relative py-16 sm:py-24 bg-[#2B1B1E] text-[#FCF8F0] text-center px-4 border-b border-[#B58A3C]/30">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#B58A3C] font-semibold">
              OUR HERITAGE
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-[#FCF8F0] leading-tight">
            More Than Fashion, A Living Heritage
          </h1>
          <p className="text-xs sm:text-sm text-[#FCF8F0]/80 max-w-xl mx-auto font-light leading-relaxed italic">
            Crafted by Generations, Worn with Grace.
          </p>
        </div>
      </section>

      {/* ========================================================
          2. EDITORIAL BRAND STORY (PDF Page 10)
          ======================================================== */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Editorial Campaign Photography */}
          <div className="relative mx-auto w-full aspect-[4/5] rounded-none overflow-hidden shadow-2xl border border-[#B58A3C]/40 bg-neutral-900">
            <img
              src="/images/editorial/brand_story_hero.jpg"
              alt="Royal Libas Living Heritage"
              className="w-full h-full object-cover object-center"
            />
          </div>

          {/* Living Heritage Narrative */}
          <div className="space-y-6">
            <div className="inline-block">
              <span className="text-xs uppercase tracking-[0.24em] font-bold text-[#B58A3C]">
                ATELIER PHILOSOPHY
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#5E1224] mt-1.5 leading-tight">
                Timeless Traditions, Modern Women.
              </h2>
            </div>

            <p className="font-serif text-base sm:text-lg text-gray-800 leading-relaxed italic border-l-2 border-[#B58A3C] pl-4">
              &ldquo;Royal Libas was conceived with a singular devotion: to preserve the sublime artistry of Indian craftsmanship while crafting silhouettes that empower the modern woman.&rdquo;
            </p>

            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-light">
              Rooted in the timeless textile traditions of Rajasthan and Jaipur, every ensemble represents hours of meticulous needlework, purest weaves, and respectful slow fashion. We collaborate closely with master artisans who have inherited centuries-old techniques of Sanganeri handblocking, intricate zardozi, and hand-embroidered hems.
            </p>

            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-light">
              Every single piece is shaped by two foundational pillars: <strong>honesty in fabric</strong> and <strong>precision in drape</strong>. When you slip into a Royal Libas creation, you wear a living cultural legacy.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <Link
                to="/shop"
                className="inline-flex items-center px-8 py-3.5 rounded-none bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-all shadow-md"
              >
                Explore The Collection
                <ArrowRight className="w-3.5 h-3.5 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          3. ARTISANAL CRAFTSMANSHIP GRID (PDF Page 10)
          ======================================================== */}
      <section className="bg-white border-y border-[#E8DFD0] py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
            <div className="inline-flex items-center justify-center gap-2">
              <span className="w-6 h-[1px] bg-[#B58A3C]" />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[#B58A3C] font-semibold">
                BEHIND THE SEAMS
              </span>
              <span className="w-6 h-[1px] bg-[#B58A3C]" />
            </div>
            <h2 className="font-serif text-2xl sm:text-4xl font-bold text-[#2B1B1E]">
              The Art of Slow Boutique Craftsmanship
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
              Mindfully produced in small drops to ensure exceptional quality, zero waste, and fair livelihood for our artisan community.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[#FCF8F0] p-6 rounded-none border border-[#E8DFD0] space-y-4">
              <div className="aspect-[4/3] overflow-hidden rounded-none border border-[#E8DFD0]">
                <img
                  src="/images/editorial/brand_craft_1.jpg"
                  alt="Pure Natural Textiles"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[#B58A3C] font-bold block">01 &bull; PURE TEXTILES</span>
              <h3 className="font-serif font-bold text-lg text-[#2B1B1E]">Breathable Natural Weaves</h3>
              <p className="text-xs text-gray-600 leading-relaxed font-light">
                We select premium mulmul cottons, Chanderi silks, modal satins, and pure organzas. Every garment features pure cotton linings for supreme breathability.
              </p>
            </div>

            <div className="bg-[#FCF8F0] p-6 rounded-none border border-[#E8DFD0] space-y-4">
              <div className="aspect-[4/3] overflow-hidden rounded-none border border-[#E8DFD0]">
                <img
                  src="/images/editorial/brand_craft_2.jpg"
                  alt="Artisanal Embellishments"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[#B58A3C] font-bold block">02 &bull; HERITAGE ZARI</span>
              <h3 className="font-serif font-bold text-lg text-[#2B1B1E]">Handcrafted Heirlooms</h3>
              <p className="text-xs text-gray-600 leading-relaxed font-light">
                Delicate gotta patti, authentic zardozi needlework, and intricate thread embroideries rendered by master artisans with decades of family heritage.
              </p>
            </div>

            <div className="bg-[#FCF8F0] p-6 rounded-none border border-[#E8DFD0] space-y-4">
              <div className="aspect-[4/3] overflow-hidden rounded-none border border-[#E8DFD0]">
                <img
                  src="/images/editorial/brand_craft_3.jpg"
                  alt="Flattering Silhouettes"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[#B58A3C] font-bold block">03 &bull; REFINED FIT</span>
              <h3 className="font-serif font-bold text-lg text-[#2B1B1E]">Tailored Perfection</h3>
              <p className="text-xs text-gray-600 leading-relaxed font-light">
                Every silhouette is tested on diverse real women for effortless comfort, regal posture, and a flattering drape that moves gracefully with you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sizing & Concierge Strip */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h3 className="font-serif text-2xl font-bold text-[#5E1224]">
          Have a question about fit or styling?
        </h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-lg mx-auto font-light">
          Our concierge styling team is at your service to assist you in selecting the ideal size and coordinate for your celebrations.
        </p>
        <div className="pt-2">
          <Link
            to="/contact"
            className="inline-flex items-center px-6 py-2.5 rounded-none border border-[#5E1224] text-[#5E1224] hover:bg-[#5E1224] hover:text-[#FCF8F0] font-ui font-semibold text-xs uppercase tracking-[0.2em] transition-all"
          >
            Contact Concierge
          </Link>
        </div>
      </section>
    </div>
  );
};
