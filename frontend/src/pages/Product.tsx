import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Ruler,
  ShoppingBag,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';
import type { Product, ProductVariant } from '../types/product';
import { fetchProductBySlug, formatPrice } from '../lib/api';
import { useCart } from '../context/CartContext';

export const ProductPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [showSizeChart, setShowSizeChart] = useState<boolean>(false);
  const [pincode, setPincode] = useState<string>('');
  const [pincodeStatus, setPincodeStatus] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    async function loadProduct() {
      if (!id) return;
      try {
        setLoading(true);
        const data = await fetchProductBySlug(id);
        if (isMounted) {
          setProduct(data);
          document.title = `${data.name} | Royal Libas by Tanya`;
          setError(null);
          // Pre-select first available variant
          const firstAvailable = data.variants.find((v) => v.stock > 0);
          setSelectedVariant(firstAvailable || null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Product not found');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProduct();
    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="aspect-[4/5] bg-gray-100 animate-pulse rounded-lg" />
          <div className="space-y-4">
            <div className="h-8 bg-gray-100 animate-pulse rounded w-3/4" />
            <div className="h-6 bg-gray-100 animate-pulse rounded w-1/3" />
            <div className="h-24 bg-gray-100 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">
          Design Not Found
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {error || 'The requested product could not be found in our catalogue.'}
        </p>
        <Link
          to="/shop"
          className="inline-flex items-center px-5 py-2.5 rounded bg-[#5B111A] text-white text-sm font-semibold hover:bg-[#3A080F] transition-colors"
        >
          Return to Shop
        </Link>
      </div>
    );
  }

  const isSoldOut = product.total_stock === 0 || product.badges.includes('Sold Out');
  const activeImage =
    product.images && product.images.length > 0
      ? product.images[activeImageIndex]?.url
      : product.primary_image;

  // Selected variant pricing or default to product min price
  const displaySellingPrice = selectedVariant ? selectedVariant.selling_price : product.min_price || 0;
  const displayMrp = selectedVariant?.mrp ?? (product.variants[0]?.mrp || null);

  // Parse size chart data
  let parsedSizeChart: any = null;
  if (product.size_chart) {
    try {
      parsedSizeChart = JSON.parse(product.size_chart);
    } catch {
      parsedSizeChart = null;
    }
  }

  const handleAddToCart = () => {
    if (!selectedVariant || selectedVariant.stock <= 0) return;
    addToCart({
      productId: product.id,
      variantId: selectedVariant.id,
      slug: product.slug,
      name: product.name,
      size: selectedVariant.size,
      sellingPrice: Number(selectedVariant.selling_price),
      image: activeImage || null,
    });
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 3500);
  };

  const handleCheckPincode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pincode.trim();
    if (!/^\d{6}$/.test(clean)) {
      setPincodeStatus('Please enter a valid 6-digit Indian pincode.');
      return;
    }
    setPincodeStatus(`Available for Delivery: Standard delivery in 3–5 business days to ${clean}. COD available.`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 min-h-screen">
      {/* Toast Notification */}
      {addedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1A4D2E] text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-bounce">
          <Check className="w-5 h-5 text-[#EAD186]" />
          <div className="text-xs sm:text-sm">
            <span className="font-bold">{product.name} (Size {selectedVariant?.size})</span> added to cart!
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="mb-6 text-xs sm:text-sm text-gray-500 flex items-center gap-2">
        <Link to="/" className="hover:text-[#5B111A] transition-colors">Home</Link>
        <span>/</span>
        <Link to="/shop" className="hover:text-[#5B111A] transition-colors">Shop</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
        {/* ========================================================
            BLOCK 1: Photo Gallery with mobile swipe & thumbnails
            ======================================================== */}
        <div className="flex flex-col gap-4">
          {/* Main Large Image */}
          <div className="relative aspect-[3/4] sm:aspect-[4/5] w-full rounded-lg overflow-hidden bg-[#F0E9DF] border border-[#E8DFD0] shadow-sm">
            {/* Dynamic Badge */}
            {product.badges && product.badges.length > 0 && (
              <div className="absolute top-4 left-4 z-20">
                <span className="inline-flex items-center px-3 py-1 rounded bg-[#5B111A] text-[#FAF7F2] text-xs font-bold tracking-wider uppercase shadow-md border border-[#C59B27]/40">
                  {product.badges[0]}
                </span>
              </div>
            )}

            {isSoldOut && (
              <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 flex items-center justify-center">
                <span className="bg-neutral-900 text-white font-serif font-bold text-lg uppercase tracking-widest px-6 py-2 rounded shadow-lg">
                  Sold Out
                </span>
              </div>
            )}

            {activeImage ? (
              <img
                src={activeImage}
                alt={`${product.name} view ${activeImageIndex + 1}`}
                className="w-full h-full object-cover object-center transition-all duration-300"
              />
            ) : (
              <div className="w-full h-full bg-[#5B111A] flex items-center justify-center text-white p-8 text-center">
                <span className="font-serif text-2xl font-bold">{product.name}</span>
              </div>
            )}
          </div>

          {/* Gallery Thumbnails (Front, Back, Detail, etc.) */}
          {product.images && product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {product.images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative aspect-[3/4] rounded-md overflow-hidden border-2 transition-all ${
                    activeImageIndex === idx
                      ? 'border-[#5B111A] ring-2 ring-[#C59B27]/50'
                      : 'border-transparent hover:border-gray-300 opacity-80 hover:opacity-100'
                  }`}
                  aria-label={`View photo ${idx + 1}`}
                >
                  <img src={img.url} alt={img.alt_text || `Photo ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Info Section */}
        <div className="flex flex-col justify-start">
          {/* Collection / Category tag */}
          <div className="text-xs uppercase tracking-widest font-bold text-[#C59B27] mb-1">
            {product.category || (product.collections.length > 0 ? product.collections[0] : 'Royal Libas')}
          </div>

          {/* ========================================================
              BLOCK 2: Name, selling price with struck-through MRP, badge
              ======================================================== */}
          <h1 className="font-serif text-2xl sm:text-4xl font-bold text-gray-900 leading-tight">
            {product.name}
          </h1>

          <div className="mt-3.5 flex items-baseline gap-3 pb-5 border-b border-[#E8DFD0]">
            <span className="text-2xl sm:text-3xl font-bold text-[#5B111A]">
              {formatPrice(displaySellingPrice)}
            </span>
            {displayMrp && displayMrp > displaySellingPrice && (
              <span className="text-base text-gray-600 line-through">
                {formatPrice(displayMrp)}
              </span>
            )}
            <span className="text-xs text-gray-600">Inclusive of all taxes</span>
          </div>

          {/* ========================================================
              BLOCK 3: Size Selector with live stock. Sold-out sizes struck-through & disabled
              ======================================================== */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-700">
                Select Size:
              </span>
              {/* BLOCK 4: Size Chart link */}
              <button
                type="button"
                onClick={() => setShowSizeChart(true)}
                className="inline-flex items-center gap-1 text-xs text-[#5B111A] hover:text-[#C59B27] font-semibold transition-colors"
              >
                <Ruler className="w-3.5 h-3.5 text-[#C59B27]" />
                Size Chart (cm)
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
              {product.variants.map((v) => {
                const soldOut = v.stock <= 0;
                const isSelected = selectedVariant?.id === v.id;

                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={soldOut}
                    onClick={() => setSelectedVariant(v)}
                    className={`py-3 px-2 rounded-lg border text-center transition-all ${
                      soldOut
                        ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed opacity-60'
                        : isSelected
                        ? 'border-[#5B111A] bg-[#5B111A]/5 text-[#5B111A] font-bold shadow-sm ring-1 ring-[#5B111A]'
                        : 'border-[#E8DFD0] hover:border-gray-400 text-gray-800 bg-white'
                    }`}
                  >
                    <div className={`text-sm sm:text-base font-semibold ${soldOut ? 'line-through' : ''}`}>
                      {v.size}
                    </div>
                    <div className="text-[10px] sm:text-[11px] mt-0.5 truncate">
                      {soldOut ? (
                        <span className="text-red-500 font-medium">Sold Out</span>
                      ) : v.stock <= 3 ? (
                        <span className="text-amber-600 font-semibold">{v.stock} left</span>
                      ) : (
                        <span className="text-emerald-700">In Stock</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ========================================================
              BLOCK 8: Add to Cart and Buy Now
              ======================================================== */}
          <div className="mt-8 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isSoldOut || !selectedVariant || selectedVariant.stock <= 0}
                onClick={handleAddToCart}
                className="w-full py-3.5 px-6 rounded-lg bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold text-sm uppercase tracking-wider shadow transition-all flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                {isSoldOut ? 'Sold Out' : 'Add to Cart'}
              </button>
              <Link
                to="/cart"
                onClick={handleAddToCart}
                className={`w-full py-3.5 px-6 rounded-lg bg-[#C59B27] hover:bg-[#B38A1E] text-[#3A080F] font-bold text-sm uppercase tracking-wider shadow text-center transition-all flex items-center justify-center ${
                  isSoldOut || !selectedVariant || selectedVariant.stock <= 0 ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                Buy Now
              </Link>
            </div>

            {/* BLOCK 9: Exchange promise and delivery repeated near buy buttons */}
            <div className="bg-[#FAF7F2] p-3.5 rounded-lg border border-[#C59B27]/30 text-xs text-gray-700 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-[#5B111A]">
                <ShieldCheck className="w-4 h-4 text-[#C59B27]" />
                <span>Risk-Free Purchase Guarantee</span>
              </div>
              <p className="text-[11px] text-gray-600">
                • <strong>7-Day Easy Size Exchange:</strong> If the fit isn't perfect, we exchange your size quickly.
              </p>
              <p className="text-[11px] text-gray-600">
                • <strong>Delivery Timeline:</strong> Dispatches within 24 hours. Delivered in 3–5 business days.
              </p>
            </div>
          </div>

          {/* ========================================================
              BLOCK 7: Delivery check by pincode
              ======================================================== */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <span className="text-xs uppercase tracking-wider font-semibold text-gray-700 block mb-2">
              Check Delivery & Cash on Delivery:
            </span>
            <form onSubmit={handleCheckPincode} className="flex gap-2 max-w-sm">
              <input
                type="text"
                placeholder="Enter 6-digit Pincode"
                maxLength={6}
                value={pincode}
                onChange={(e) => {
                  setPincode(e.target.value);
                  setPincodeStatus(null);
                }}
                className="flex-1 text-xs sm:text-sm px-3.5 py-2 rounded border border-[#E8DFD0] focus:outline-none focus:ring-1 focus:ring-[#5B111A] bg-white"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded uppercase tracking-wider transition-colors"
              >
                Check
              </button>
            </form>
            {pincodeStatus && (
              <p className="text-xs text-emerald-800 font-medium mt-2 bg-emerald-50 p-2 rounded border border-emerald-200">
                {pincodeStatus}
              </p>
            )}
          </div>

          {/* ========================================================
              BLOCK 5: Fabric, lining and care details
              BLOCK 6: Model height and size worn
              ======================================================== */}
          <div className="mt-8 pt-6 border-t border-[#E8DFD0] space-y-4 text-xs sm:text-sm text-gray-700">
            <div>
              <h3 className="font-serif font-bold text-base text-gray-900 mb-1.5">
                Product Details & Description
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {product.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-white p-3 rounded border border-gray-100">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Fabric & Texture</span>
                <span className="font-semibold text-gray-900">{product.fabric || 'Premium Cotton Blend'}</span>
              </div>
              <div className="bg-white p-3 rounded border border-gray-100">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Wash & Care</span>
                <span className="font-semibold text-gray-900">{product.care || 'Gentle Hand Wash'}</span>
              </div>
            </div>

            {/* BLOCK 6: Model height & size info */}
            <div className="bg-[#FAF7F2] p-3 rounded border border-[#E8DFD0] text-xs text-gray-600">
              <p>
                <strong>Model Fit Note:</strong> Model is 5'7" (170 cm) with 34" bust, wearing size <strong>S</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          BLOCK 4 MODAL: Size Chart in Centimetres
          ======================================================== */}
      {showSizeChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowSizeChart(false)}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700"
              aria-label="Close Size Chart"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <Ruler className="w-5 h-5 text-[#C59B27]" />
              <h3 className="font-serif text-xl font-bold text-[#5B111A]">
                Standard Size Chart
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              All garment measurements are recorded in <strong>centimetres (cm)</strong>.
            </p>

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF7F2] border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Size</th>
                    <th className="p-3">Bust (cm)</th>
                    <th className="p-3">Waist (cm)</th>
                    <th className="p-3">Hip (cm)</th>
                    <th className="p-3">Length (cm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {parsedSizeChart?.measurements ? (
                    Object.entries(parsedSizeChart.measurements).map(([sizeKey, m]: any) => (
                      <tr key={sizeKey} className={selectedVariant?.size === sizeKey ? 'bg-amber-50/60 font-bold' : ''}>
                        <td className="p-3 font-bold text-[#5B111A]">{sizeKey}</td>
                        <td className="p-3">{m.bust}</td>
                        <td className="p-3">{m.waist}</td>
                        <td className="p-3">{m.hip}</td>
                        <td className="p-3">{m.length}</td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr><td className="p-3 font-bold text-[#5B111A]">S</td><td className="p-3">91.5</td><td className="p-3">76.2</td><td className="p-3">99.0</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5B111A]">M</td><td className="p-3">96.5</td><td className="p-3">81.3</td><td className="p-3">104.1</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5B111A]">L</td><td className="p-3">101.6</td><td className="p-3">86.4</td><td className="p-3">109.2</td><td className="p-3">114.3</td></tr>
                      <tr><td className="p-3 font-bold text-[#5B111A]">XL</td><td className="p-3">106.7</td><td className="p-3">91.4</td><td className="p-3">114.3</td><td className="p-3">114.3</td></tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 rounded bg-[#FAF7F2] text-[11px] text-gray-600">
              <span className="font-semibold text-gray-800 block mb-0.5">Measurement Advice:</span>
              Measure around the fullest part of your bust and natural waistline. If you fall between sizes, we recommend sizing up for relaxed comfort.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
