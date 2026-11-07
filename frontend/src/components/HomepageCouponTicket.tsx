import React, { useState, useEffect } from 'react';
import { Check, Copy } from 'lucide-react';
import { CouponPublic } from '../types/order';
import { fetchActiveCoupons } from '../lib/api';

export const HomepageCouponTicket: React.FC = () => {
  const [coupons, setCoupons] = useState<CouponPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadPublicPromotions() {
      try {
        setLoading(true);
        // Strictly fetch coupons designated for public promotion (is_public=true)
        const data = await fetchActiveCoupons(true);
        if (isMounted) {
          // Double-check eligibility on client: active and public
          const eligible = (data || []).filter(
            (c) => c.is_active && (c.is_public === undefined || c.is_public === true)
          );
          setCoupons(eligible);
        }
      } catch {
        if (isMounted) {
          // Gracefully suppress errors so homepage remains pristine
          setCoupons([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPublicPromotions();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyCode = async (code: string, id: number) => {
    let copied = false;

    // 1. Modern Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(code);
        copied = true;
      } catch {
        copied = false;
      }
    }

    // 2. Reliable Fallback via textarea selection
    if (!copied) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2500);
    } else {
      window.prompt('Copy this coupon code:', code);
    }
  };

  // If loading or no eligible public coupons exist, completely hide the section
  if (loading || coupons.length === 0) {
    return null;
  }

  return (
    <section
      id="homepage-coupon-tickets"
      aria-label="Exclusive Boutique Offers"
      className="relative bg-[#180A0E] text-[#2B1B1E] pt-2 pb-8 sm:pb-12 px-4 sm:px-6 lg:px-8 border-b border-[#B58A3C]/40"
    >
      <div className="max-w-6xl mx-auto">
        <div
          className={`grid gap-5 sm:gap-6 ${
            coupons.length === 1 ? 'grid-cols-1 max-w-4xl mx-auto' : 'grid-cols-1 lg:grid-cols-2'
          }`}
        >
          {coupons.map((coupon) => {
            const isPercent =
              typeof coupon.type === 'string' &&
              coupon.type.trim().toUpperCase() in { PERCENT: 1, PERCENTAGE: 1, '%': 1 };
            const offerText = isPercent
              ? `${Number(coupon.value)}% OFF`
              : `₹${Math.round(Number(coupon.value)).toLocaleString('en-IN')} OFF`;
            const isCopied = copiedId === coupon.id;
            const minOrder = Number(coupon.min_order_value || 0);

            return (
              <div
                key={coupon.id}
                className="relative bg-[#FCF8F0] border border-[#B58A3C]/80 shadow-[0_8px_30px_rgba(0,0,0,0.45)] p-4 sm:p-5 lg:px-7 lg:py-5 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-5 transition-transform duration-300 hover:scale-[1.01] group overflow-hidden"
              >
                {/* Semicircular Ticket Notches on Left & Right Edges */}
                <div
                  aria-hidden="true"
                  className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#180A0E] border-r border-[#B58A3C] shadow-inner pointer-events-none z-10"
                />
                <div
                  aria-hidden="true"
                  className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#180A0E] border-l border-[#B58A3C] shadow-inner pointer-events-none z-10"
                />

                {/* Left Zone: Offer Headline (Serif Burgundy Bold) */}
                <div className="flex items-center justify-center sm:justify-start shrink-0 text-center sm:text-left min-w-[130px] lg:min-w-[150px]">
                  <span className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#5E1224] leading-none whitespace-nowrap">
                    {offerText}
                  </span>
                </div>

                {/* Vertical Divider (Desktop/Tablet) */}
                <div
                  aria-hidden="true"
                  className="hidden sm:block h-9 w-[1px] bg-[#B58A3C]/35 shrink-0"
                />

                {/* Center Zone: Code & Minimum Order Details */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5 text-center sm:text-left flex-1 min-w-0">
                  {/* Coupon Code Callout */}
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="text-xs sm:text-sm text-[#2B1B1E]/80 font-medium">
                      Use code:
                    </span>
                    <span
                      id={`coupon-code-${coupon.id}`}
                      className="font-serif sm:font-mono text-base sm:text-lg font-bold tracking-wider text-[#5E1224] bg-[#5E1224]/5 px-2 py-0.5 border border-[#5E1224]/20 rounded-xs"
                    >
                      {coupon.code}
                    </span>
                  </div>

                  {/* Vertical Divider between Code & Min Order */}
                  <div
                    aria-hidden="true"
                    className="hidden sm:block h-6 w-[1px] bg-[#B58A3C]/25 shrink-0"
                  />

                  {/* Minimum Order */}
                  <div className="text-xs sm:text-sm text-[#2B1B1E]/80 whitespace-nowrap">
                    {minOrder > 0 ? (
                      <span>
                        Minimum order: <strong className="text-[#2B1B1E] font-semibold">₹{minOrder.toLocaleString('en-IN')}</strong>
                      </span>
                    ) : (
                      <span className="text-emerald-800 font-medium">No minimum order</span>
                    )}
                  </div>
                </div>

                {/* Right Zone: COPY CODE Button */}
                <div className="shrink-0 w-full sm:w-auto flex justify-center sm:justify-end z-20">
                  <button
                    type="button"
                    onClick={() => handleCopyCode(coupon.code, coupon.id)}
                    aria-label={`Copy coupon code ${coupon.code}`}
                    className={`w-full sm:w-auto min-h-[44px] px-6 py-2.5 sm:py-3 text-xs font-semibold uppercase tracking-[0.2em] font-ui transition-all duration-200 flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] ${
                      isCopied
                        ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                        : 'bg-[#5E1224] text-[#FCF8F0] hover:bg-[#4A0E1C]'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>COPIED!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#FCF8F0]/80 group-hover:scale-110 transition-transform" />
                        <span>COPY CODE</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
