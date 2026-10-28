import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Plus, ShoppingBag } from 'lucide-react';
import { Product } from '../types/product';
import { formatPrice } from '../lib/api';
import { useWishlist } from '../context/WishlistContext';
import { useQuickAdd } from '../context/QuickAddContext';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { openQuickAdd } = useQuickAdd();

  const [primaryError, setPrimaryError] = useState(false);
  const [secondaryError, setSecondaryError] = useState(false);
  const [secondaryLoaded, setSecondaryLoaded] = useState(false);

  // Available image URLs: safely ensure photos or video posters are rendered
  const toImageUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(url)) {
      return url.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg');
    }
    return url;
  };

  const pureImageUrls = (product.images || [])
    .map((img) => img.url)
    .filter((url) => !/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(url));

  const rawPrimary =
    toImageUrl(product.primary_image) ||
    pureImageUrls[0] ||
    (product.images && product.images.length > 0 ? toImageUrl(product.images[0].url) : null);

  const rawSecondary =
    pureImageUrls.length > 1
      ? pureImageUrls[1]
      : (product.images && product.images.length > 1 ? toImageUrl(product.images[1].url) : null);

  // Reset image status on product or image URL changes
  useEffect(() => {
    setPrimaryError(false);
    setSecondaryError(false);
    setSecondaryLoaded(false);
  }, [product.id, rawPrimary, rawSecondary]);

  // Robust fallback:
  // If primary fails, use secondary. If both fail, primaryImage becomes null (rendering branded placeholder)
  const primaryImage = !primaryError
    ? rawPrimary
    : (!secondaryError ? rawSecondary : null);

  // Secondary candidate is eligible only if primary displays rawPrimary and rawSecondary is valid & distinct
  const secondaryImage = (!primaryError && !secondaryError && rawSecondary && rawSecondary !== rawPrimary)
    ? rawSecondary
    : null;

  // Preloading & desktop hover crossfade state
  const hasSecondary = Boolean(primaryImage && secondaryImage);
  const canCrossfade = Boolean(hasSecondary && secondaryLoaded);

  // Prices and stock
  const firstVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null;
  const sellingPrice = product.min_price ?? (firstVariant ? firstVariant.selling_price : 0);
  const mrp = firstVariant?.mrp ?? null;
  const isSoldOut = product.total_stock === 0 || product.badges.includes('Sold Out');

  const inWishlist = isInWishlist(product.id);
  const primaryBadge = product.badges && product.badges.length > 0 ? product.badges[0] : null;

  // Concise fabric description avoiding tiny text & excessive truncation on narrow cards
  const conciseFabric = product.fabric
    ? product.fabric.replace(/\s+(?:with|paired with|featuring).*$/i, '').trim()
    : null;

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product.id);
  };

  const handleQuickAddClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openQuickAdd(product);
  };

  return (
    <article
      className={`product-card-hover group relative bg-white rounded-none border border-[#E8DFD0] hover:border-[#B58A3C]/50 shadow-sm hover:shadow-[0_8px_24px_rgba(43,27,30,0.08)] transition-all duration-300 ease-out flex flex-col justify-between ${
        isSoldOut ? 'opacity-90' : ''
      }`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      aria-labelledby={`product-title-${product.id}`}
      data-testid={`product-card-${product.id}`}
    >
      {/* ========================================================
          IMAGE CONTAINER (Aspect 4:5)
          Non-nested DOM: Main link wraps visual canvas; buttons are siblings.
          ======================================================== */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#F6F1EA]">
        {/* Main Product Link (Visual click / tap area) */}
        <Link
          to={`/product/${product.slug}`}
          className="absolute inset-0 z-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B58A3C]"
          aria-label={`View ${product.name}`}
        >
          {primaryImage ? (
            <img
              src={primaryImage}
              alt={product.name}
              onError={() => {
                if (!primaryError) setPrimaryError(true);
                else setSecondaryError(true);
              }}
              className={`product-card-image-primary absolute inset-0 w-full h-full object-cover object-top transition-all duration-500 ease-out sm:group-hover:scale-[1.03] ${
                canCrossfade ? 'has-crossfade sm:group-hover:opacity-0' : 'opacity-100'
              }`}
              loading="lazy"
              style={{
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          ) : (
            /* Graceful Placeholder when no images exist or both fail */
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center select-none bg-[#5E1224] text-[#FCF8F0]">
              <div className="w-10 h-10 rounded-full border border-[#D4AF67]/40 flex items-center justify-center mb-2">
                <span className="font-serif text-base font-bold text-[#D4AF67]">RL</span>
              </div>
              <p className="font-serif font-semibold text-xs line-clamp-2 px-2 text-[#FCF8F0]">
                {product.name}
              </p>
              <span className="text-[9px] uppercase tracking-[0.2em] text-[#D4AF67] mt-1 font-ui">
                Royal Libas Atelier
              </span>
            </div>
          )}

          {/* Secondary image rendered in DOM for desktop preloading and smooth hover crossfade */}
          {hasSecondary && secondaryImage && (
            <img
              src={secondaryImage}
              alt={`${product.name} alternate view`}
              onLoad={() => setSecondaryLoaded(true)}
              onError={() => {
                setSecondaryError(true);
                setSecondaryLoaded(false);
              }}
              className={`product-card-image-secondary hidden sm:block absolute inset-0 w-full h-full object-cover object-center transition-all duration-500 ease-out pointer-events-none ${
                canCrossfade ? 'opacity-0 sm:group-hover:opacity-100 sm:group-hover:scale-[1.03]' : 'opacity-0'
              }`}
              loading="lazy"
              style={{
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          )}
        </Link>

        {/* Primary Luxury Badge */}
        {primaryBadge && (
          <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
            <span
              className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-none text-[9.5px] font-semibold tracking-[0.16em] uppercase shadow-sm ${
                primaryBadge === 'Sold Out'
                  ? 'bg-[#2B1B1E] text-white'
                  : primaryBadge === 'Low Stock'
                  ? 'bg-[#8C6F5B] text-white'
                  : primaryBadge === 'Bestseller'
                  ? 'bg-[#B58A3C] text-white'
                  : 'bg-[#5E1224] text-[#FCF8F0]'
              }`}
            >
              {primaryBadge}
            </span>
          </div>
        )}

        {/* Wishlist Heart Button (z-20 sibling, NOT nested in <a>!) */}
        <button
          type="button"
          onClick={handleWishlistClick}
          className={`absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20 w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B58A3C] active:scale-95 ${
            inWishlist
              ? 'bg-white text-[#5E1224] shadow-md scale-105'
              : 'bg-white/95 text-gray-700 hover:text-[#5E1224] hover:bg-white hover:scale-105 shadow-sm'
          }`}
          aria-label={inWishlist ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          data-testid={`wishlist-btn-${product.id}`}
        >
          <Heart
            className={`w-4 h-4 sm:w-3.5 sm:h-3.5 transition-transform duration-200 ${
              inWishlist ? 'fill-[#5E1224] stroke-[#5E1224] animate-heart-pop' : 'stroke-current'
            }`}
          />
        </button>

        {/* Sold Out Overlay */}
        {isSoldOut && (
          <div className="absolute inset-0 bg-[#FCF8F0]/70 backdrop-blur-[1px] z-10 pointer-events-none flex items-center justify-center">
            <span className="bg-[#2B1B1E] text-white text-[11px] sm:text-xs font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 shadow">
              Sold Out
            </span>
          </div>
        )}

        {/* Desktop Quick Add Button (z-20 sibling, NOT nested in <a>!) */}
        {!isSoldOut && (
          <div className="hidden sm:block absolute inset-x-3 bottom-3 z-20 opacity-0 group-hover:opacity-100 focus-within:opacity-100 translate-y-2 group-hover:translate-y-0 focus-within:translate-y-0 transition-all duration-250 ease-out pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto">
            <button
              type="button"
              onClick={handleQuickAddClick}
              aria-label={`Quick add ${product.name} to bag`}
              data-testid={`desktop-quickadd-btn-${product.id}`}
              className="w-full py-2.5 px-3 bg-[#5E1224]/95 hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-ui font-semibold rounded-none border border-[#B58A3C]/60 shadow-lg backdrop-blur-sm tracking-[0.16em] uppercase flex items-center justify-center gap-1.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B58A3C]"
            >
              <Plus className="w-3.5 h-3.5 text-[#D4AF67]" />
              <span>Quick Add</span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================
          DETAILS CONTAINER
          Title link is a separate accessible anchor; price & mobile actions are clean.
          ======================================================== */}
      <div className="p-3.5 sm:p-4 bg-white flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1.5 mb-1 text-[10.5px] sm:text-[11px] font-medium tracking-wide">
            <span className="font-semibold text-[#B58A3C] uppercase tracking-wider truncate">
              {product.category || conciseFabric || 'Atelier Collection'}
            </span>
            {conciseFabric && product.category && (
              <span className="hidden sm:inline text-gray-400 uppercase tracking-normal truncate max-w-[50%]">
                {conciseFabric}
              </span>
            )}
          </div>

          {/* Accessible Title Link (Sibling, NOT nesting buttons!) */}
          <h3
            id={`product-title-${product.id}`}
            className="font-serif text-xs sm:text-sm md:text-base font-semibold text-[#2B1B1E] group-hover:text-[#5E1224] transition-colors line-clamp-2 leading-snug min-h-[2.4rem] sm:min-h-[2.6rem]"
          >
            <Link
              to={`/product/${product.slug}`}
              className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B58A3C] rounded-xs"
            >
              {product.name}
            </Link>
          </h3>

          {/* Color dots preview dynamically derived from product variants */}
          {(() => {
            const COLOR_MAP: Record<string, string> = {
              'Deep Maroon': '#5E1224',
              'Ivory Pearl': '#FCF8F0',
              'Emerald Green': '#1B4D3E',
              'Emerald Jewel': '#0F52BA',
              'Dusty Rose': '#C8858E',
              'Champagne Gold': '#D4AF37',
              'Sage Green': '#8F9779',
              'Midnight Navy': '#1B243B',
              'Powder Blue': '#9BB7D4',
              'Peach Bloom': '#E8A598',
              'Deep Wine': '#4A1525',
              'Mustard Ochre': '#D49B28',
              'Terracotta Rust': '#B85338',
              'Lilac Frost': '#B8A9C9',
              'Sea Green': '#2E8B57',
              'Royal Plum': '#582949',
            };
            const uniqueColours = Array.from(
              new Set(product.variants?.map((v) => v.colour).filter(Boolean))
            ) as string[];

            if (!uniqueColours.length) return null;

            return (
              <div className="flex items-center gap-1.5 mt-2">
                {uniqueColours.slice(0, 4).map((col) => (
                  <span
                    key={col}
                    className="w-2.5 h-2.5 rounded-full border border-black/15 inline-block shadow-xs"
                    style={{ backgroundColor: COLOR_MAP[col] || '#8C6F5B' }}
                    title={col}
                  />
                ))}
                {uniqueColours.length > 4 && (
                  <span className="text-[9px] text-gray-400 font-medium">+{uniqueColours.length - 4}</span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Price Row & Mobile Quick Add Button */}
        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5 sm:gap-2 flex-wrap no-motion min-w-0">
            <span className="price-display text-sm sm:text-base font-bold text-[#5E1224] tracking-tight">
              {formatPrice(sellingPrice)}
            </span>
            {mrp && mrp > sellingPrice && (
              <span className="price-display text-[11px] sm:text-xs text-gray-400 line-through">
                {formatPrice(mrp)}
              </span>
            )}
          </div>

          {/* Mobile Circular Quick-Add Action (Handoff Page 12 - Sibling button, NOT in <a>) */}
          {!isSoldOut && (
            <button
              type="button"
              onClick={handleQuickAddClick}
              className="sm:hidden w-9 h-9 rounded-full bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] flex items-center justify-center shadow-md active:scale-90 transition-transform shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B58A3C]"
              aria-label={`Quick add ${product.name} to bag`}
              data-testid={`mobile-quickadd-btn-${product.id}`}
            >
              <ShoppingBag className="w-4 h-4 text-[#D4AF67]" />
            </button>
          )}

          {/* Sizes available preview for desktop */}
          {product.variants && product.variants.length > 0 && (
            <div className="hidden sm:flex gap-1 no-motion">
              {product.variants.slice(0, 4).map((v) => (
                <span
                  key={v.id}
                  className={`w-5 h-5 rounded text-[9px] flex items-center justify-center font-medium border ${
                    v.stock > 0
                      ? 'bg-[#FCF8F0] text-gray-700 border-[#E8DFD0]'
                      : 'bg-gray-100 text-gray-400 line-through border-gray-200'
                  }`}
                  title={`${v.size}: ${v.stock > 0 ? `${v.stock} in stock` : 'Sold out'}`}
                >
                  {v.size}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
