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

    async function loadPublicPromotions(isInitial = false) {
      try {
        if (isInitial) {
          setLoading(true);
        }
        // Strictly fetch coupons designated for public storefront promotion (is_public=true)
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
        if (isMounted && isInitial) {
          setLoading(false);
        }
      }
    }

    // 1. Initial fetch on component mount
    loadPublicPromotions(true);

    // 2. Event-driven refresh: when visitor refocuses or switches back to tab
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        loadPublicPromotions(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // 3. Low-frequency background sync (every 60s while tab remains open and active)
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadPublicPromotions(false);
      }
    }, 60000);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      clearInterval(intervalId);
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
        textArea.setSelectionRange(0, 99999);
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

  const isSingle = coupons.length === 1;

  return (
    <section
      id="homepage-coupon-tickets"
      aria-label="Exclusive Boutique Offers"
      className="relative w-full bg-[#FAF5EC] text-[#2B1B1E] py-5 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 border-t border-[#B58A3C]/30 border-b border-[#E8DFC8] shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
    >
      <div className="max-w-7xl mx-auto">
        <div
          className={`grid gap-5 sm:gap-6 ${
            isSingle ? 'grid-cols-1 max-w-6xl mx-auto' : 'grid-cols-1 lg:grid-cols-2'
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
                className="relative bg-[#FFFDF9] border border-[#B58A3C] shadow-[0_4px_24px_rgba(43,27,30,0.06)] p-4 sm:p-5 lg:px-8 lg:py-5 flex flex-col justify-between transition-transform duration-300 hover:scale-[1.006] group overflow-hidden"
              >
                {/* Decorative Inset Ticket Border Frame */}
                <div
                  aria-hidden="true"
                  className="absolute inset-1 sm:inset-1.5 border border-[#B58A3C]/30 pointer-events-none rounded-[1px]"
                />

                {/* Semicircular Ticket Punch-Out Notches on Left & Right Edges */}
                <div
                  aria-hidden="true"
                  className="absolute -left-3 sm:-left-3.5 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#FAF5EC] border-r border-[#B58A3C] shadow-inner pointer-events-none z-10"
                />
                <div
                  aria-hidden="true"
                  className="absolute -right-3 sm:-right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#FAF5EC] border-l border-[#B58A3C] shadow-inner pointer-events-none z-10"
                />

                {/* ========================================================
                    1. DESKTOP / TABLET SINGLE-ROW LAYOUT (>= md screens)
                    Matches exact visual reference hierarchy across full width
                    ======================================================== */}
                <div className="hidden md:flex items-center justify-between gap-4 lg:gap-6 w-full relative z-20">
                  {/* Left: Large Burgundy Discount */}
                  <div className="shrink-0 text-left min-w-[140px] lg:min-w-[170px]">
                    <span className="font-serif text-3xl lg:text-[40px] font-bold tracking-tight text-[#5E1224] leading-none whitespace-nowrap">
                      {offerText}
                    </span>
                  </div>

                  {/* Vertical Separator 1 */}
                  <div
                    aria-hidden="true"
                    className="h-10 w-[1px] bg-[#B58A3C]/35 shrink-0"
                  />

                  {/* Center-Left: Gold-Highlighted Coupon Code */}
                  <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                    <span className="text-sm lg:text-base text-[#4A3B32] font-medium">
                      Use code:
                    </span>
                    <span
                      id={`coupon-code-${coupon.id}`}
                      className="font-serif text-base lg:text-lg font-bold tracking-wider text-[#5E1224] bg-[#F4EBD9] px-3 py-1 rounded border border-[#B58A3C]/50 shadow-2xs"
                    >
                      {coupon.code}
                    </span>
                  </div>

                  {/* Vertical Separator 2 */}
                  <div
                    aria-hidden="true"
                    className="h-10 w-[1px] bg-[#B58A3C]/35 shrink-0"
                  />

                  {/* Center-Right: Minimum Order Value */}
                  <div className="text-sm lg:text-base text-[#4A3B32] font-medium whitespace-nowrap shrink-0">
                    {minOrder > 0 ? (
                      <span>
                        Minimum order: <strong className="text-[#2B1B1E] font-bold">₹{minOrder.toLocaleString('en-IN')}</strong>
                      </span>
                    ) : (
                      <span className="text-emerald-800 font-semibold">No minimum order</span>
                    )}
                  </div>

                  {/* Right: Rounded Burgundy COPY CODE Button */}
                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(coupon.code, coupon.id)}
                      aria-label={`Copy coupon code ${coupon.code}`}
                      className={`min-h-[44px] px-6 lg:px-8 py-3 rounded-md text-xs font-semibold uppercase tracking-[0.2em] font-ui transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow active:scale-[0.98] ${
                        isCopied
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                          : 'bg-[#5E1224] text-[#FFFDF9] hover:bg-[#4A0E1C]'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>COPIED!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#FFFDF9]/80 group-hover:scale-110 transition-transform" />
                          <span>COPY CODE</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* ========================================================
                    2. MOBILE APPROVED TWO-ROW COMPACT LAYOUT (< md screens)
                    Comfortable touch targets (min 44px) & zero horizontal overflow
                    ======================================================== */}
                <div className="flex md:hidden flex-col gap-3 w-full relative z-20">
                  {/* Row 1: Large Burgundy Discount & Gold-Highlighted Coupon Code */}
                  <div className="flex items-center justify-between gap-3 border-b border-[#B58A3C]/20 pb-2.5 px-0.5">
                    <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#5E1224] leading-none whitespace-nowrap">
                      {offerText}
                    </span>
                    <div className="flex items-center gap-1.5 bg-[#F4EBD9] px-2.5 py-1 rounded border border-[#B58A3C]/50 shadow-2xs shrink-0">
                      <span className="text-[11px] text-[#4A3B32] font-medium uppercase tracking-wider">
                        Use code:
                      </span>
                      <span
                        id={`coupon-code-mobile-${coupon.id}`}
                        className="font-serif text-sm sm:text-base font-bold tracking-wider text-[#5E1224]"
                      >
                        {coupon.code}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Clear Minimum Order & Rounded Burgundy COPY CODE Button */}
                  <div className="flex items-center justify-between gap-3 px-0.5">
                    <div className="text-xs sm:text-sm text-[#4A3B32] font-medium leading-tight">
                      {minOrder > 0 ? (
                        <span>
                          Min. order: <strong className="text-[#2B1B1E] font-semibold">₹{minOrder.toLocaleString('en-IN')}</strong>
                        </span>
                      ) : (
                        <span className="text-emerald-800 font-semibold">No min. order</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyCode(coupon.code, coupon.id)}
                      aria-label={`Copy coupon code ${coupon.code}`}
                      className={`min-h-[44px] px-5 sm:px-6 py-2.5 rounded-md text-xs font-semibold uppercase tracking-[0.16em] font-ui transition-all duration-200 flex items-center justify-center gap-2 shadow-xs shrink-0 active:scale-[0.98] ${
                        isCopied
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                          : 'bg-[#5E1224] text-[#FFFDF9] hover:bg-[#4A0E1C]'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>COPIED!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#FFFDF9]/80" />
                          <span>COPY CODE</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
