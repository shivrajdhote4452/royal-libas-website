import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, Instagram } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

export const About: React.FC = () => {
  useEffect(() => {
    document.title = 'About Us & Tanya’s Story | Royal Libas';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-gray-800">
      {/* Hero Header */}
      <section className="relative py-16 sm:py-24 bg-gradient-to-br from-[#5B111A] via-[#480B13] to-[#3A080F] text-[#FAF7F2] text-center px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex justify-center mb-1">
            <BrandLogo variant="gold" layout="emblem-only" emblemSize={44} />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF7F2]/10 border border-[#C59B27]/40 text-[#EAD186] text-xs font-semibold uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5 text-[#C59B27]" />
            Boutique Atelier • Jaipur
          </span>
          <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            Our Story & Craftsmanship
          </h1>
          <p className="text-sm sm:text-base text-[#FAF7F2]/80 max-w-xl mx-auto font-light leading-relaxed">
            Born out of a longing for ethnic wear that treats pure textiles with reverence and fits women with effortless grace.
          </p>
        </div>
      </section>

      {/* Tanya's Founder Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Portrait with luxury frame */}
          <div className="relative mx-auto w-full max-w-md aspect-square rounded-2xl overflow-hidden shadow-xl border-4 border-white bg-gray-100">
            <img
              src="/images/tanya_founder.jpg"
              alt="Tanya, Founder of Royal Libas"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 left-4 right-4 bg-[#5B111A]/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-[#C59B27]/30 text-white flex items-center justify-between">
              <div>
                <p className="font-serif font-bold text-sm">Tanya</p>
                <p className="text-[10px] uppercase tracking-wider text-[#EAD186]">Founder & Creative Director</p>
              </div>
              <span className="text-xs text-white/70 italic">Jaipur Atelier</span>
            </div>
          </div>

          {/* Tanya's Voice */}
          <div className="space-y-5">
            <div className="inline-block">
              <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
                Founder's Voice
              </span>
              <h2 className="font-serif text-3xl sm:text-5xl font-bold text-[#5B111A] mt-1">
                Hi, I'm Tanya
              </h2>
            </div>

            <p className="font-serif text-base sm:text-lg text-gray-800 leading-relaxed italic border-l-2 border-[#C59B27] pl-4">
              "Royal Libas is my way of sharing pieces that feel like home - timeless, elegant and made for your everyday special moments."
            </p>

            <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
              Growing up surrounded by the rich heritage textiles of Rajasthan, I was captivated by the sheer poetry of Chanderi weaves, Sanganeri handblocks, and delicate zari craftsmanship. Yet, shopping for festive wear as a modern woman often meant choosing between overpriced designer couture or ill-fitting fast fashion made of synthetic polyesters.
            </p>

            <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
              In 2022, I set up a small studio in Jaipur with three master tailors and one simple principle: <strong>honesty in fabric, precision in silhouette</strong>. Royal Libas was born out of that conviction.
            </p>

            <p className="text-sm sm:text-base text-gray-700 leading-relaxed italic border-l-2 border-[#C59B27] pl-4 text-gray-600">
              "Every single cut, lining, and button is tested on real women before it earns a place in our drop. When you slip into a Royal Libas set, you should feel regal yet entirely yourself."
            </p>

            <div className="pt-2 flex items-center gap-4">
              <Link
                to="/shop"
                className="inline-flex items-center px-6 py-3 rounded bg-[#5B111A] hover:bg-[#480B13] text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-md"
              >
                Explore The Collection
                <ArrowRight className="w-3.5 h-3.5 ml-2" />
              </Link>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B111A] hover:text-[#C59B27] transition-colors"
              >
                <Instagram className="w-4 h-4 text-[#C59B27]" />
                @royallibasbytanya
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Craftsmanship & Atelier Section */}
      <section className="bg-white border-y border-[#E8DFD0] py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#C59B27]">
              Behind The Seams
            </span>
            <h2 className="font-serif text-2xl sm:text-4xl font-bold text-gray-900 mt-1">
              The Art of Slow Boutique Tailoring
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-3 leading-relaxed">
              Unlike mass garment factories, our boutique works in mindful, limited drops to protect artisanal traditions and guarantee zero inventory wastage.
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden border border-[#E8DFD0] shadow-sm mb-12">
            <img
              src="/images/studio_craft.jpg"
              alt="Artisanal Handloom Textile Workshop Jaipur"
              className="w-full aspect-[16/9] object-cover"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[#FAF7F2] p-6 rounded-xl border border-[#E8DFD0] space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#5B111A]/10 text-[#5B111A] flex items-center justify-center font-bold">
                01
              </div>
              <h3 className="font-serif font-bold text-lg text-gray-900">Breathable Pure Fibers</h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                We use 100s count mulmul cottons, pure Chanderi silks, modal satins, and micro-velvets. Every piece has a breathable cotton voile inner lining that feels gentle on sensitive skin.
              </p>
            </div>

            <div className="bg-[#FAF7F2] p-6 rounded-xl border border-[#E8DFD0] space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#5B111A]/10 text-[#5B111A] flex items-center justify-center font-bold">
                02
              </div>
              <h3 className="font-serif font-bold text-lg text-gray-900">Handcrafted Heirloom Detailing</h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                From traditional Sanganeri hand-blocks and metallic zari zardozi to delicate gotta patti work, our embellishments are crafted by third-generation Jaipur artisans paid fair livable wages.
              </p>
            </div>

            <div className="bg-[#FAF7F2] p-6 rounded-xl border border-[#E8DFD0] space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#5B111A]/10 text-[#5B111A] flex items-center justify-center font-bold">
                03
              </div>
              <h3 className="font-serif font-bold text-lg text-gray-900">The 7-Day Size Guarantee</h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                We believe shopping online should be stress-free. If the fit isn't absolutely flattering, we provide a doorstep size exchange within 7 days with zero arguments.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sizing & Concierge Strip */}
      <section className="max-w-4xl mx-auto px-4 py-14 text-center space-y-4">
        <h3 className="font-serif text-2xl font-bold text-[#5B111A]">
          Have a sizing question or need styling advice?
        </h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-lg mx-auto">
          Tanya and our boutique styling team are here to assist you in choosing the ideal size for your measurements.
        </p>
        <div className="pt-2">
          <p className="text-xs font-medium text-gray-500">
            WhatsApp Concierge: <span className="font-semibold text-gray-700">To be confirmed by Tanya</span>
          </p>
        </div>
      </section>
    </div>
  );
};
