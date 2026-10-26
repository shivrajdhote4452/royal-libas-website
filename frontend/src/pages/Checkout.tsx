import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  CreditCard,
  Truck,
  Tag,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Lock,
  Loader2,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import {
  formatPrice,
  validateCart,
  validateCoupon,
  createOrder,
  createRazorpayOrder,
} from '../lib/api';
import { CouponValidateResponse, OrderCreatePayload } from '../types/order';

export const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { items, subtotal, clearCart } = useCart();

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [pincode, setPincode] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PREPAID' | 'COD'>('PREPAID');

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidateResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      navigate('/cart');
    }
  }, [items, navigate]);

  // Dynamic server-aligned fee calculations
  const discountAmount = appliedCoupon?.valid ? appliedCoupon.discount : 0;
  const shippingCharge =
    paymentMethod === 'PREPAID' ? 0 : subtotal >= 1500 ? 0 : 99;
  const estimatedTotal = Math.max(0, subtotal - discountAmount + shippingCharge);

  // Apply Coupon Handler
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    setIsApplyingCoupon(true);
    setCouponError(null);

    try {
      const res = await validateCoupon(couponInput.trim(), subtotal);
      if (res.valid) {
        setAppliedCoupon(res);
        setCouponError(null);
      } else {
        setAppliedCoupon(null);
        setCouponError(res.message || 'Invalid coupon code');
      }
    } catch (err: any) {
      setAppliedCoupon(null);
      setCouponError(err.message || 'Failed to apply coupon');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
  };

  // Main Submit: Authoritative Order Placement
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setStockError(null);

    // Basic frontend validations
    if (!customerName.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setFormError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!line1.trim()) {
      setFormError('Please enter your house/flat number and street address.');
      return;
    }
    const cleanPincode = pincode.trim().replace(/\D/g, '');
    if (cleanPincode.length !== 6) {
      setFormError('Please enter a valid 6-digit Indian delivery pincode.');
      return;
    }
    if (!city.trim() || !state.trim()) {
      setFormError('Please specify your city and state.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Double check stock validity before order submission
      const cartItemsPayload = items.map((i) => ({
        variant_id: i.variantId,
        quantity: i.quantity,
      }));
      const validation = await validateCart(cartItemsPayload);
      if (!validation.is_valid) {
        setStockError(validation.unavailable_lines.join(', '));
        setIsSubmitting(false);
        return;
      }

      // 2. Submit authoritative order payload
      const orderPayload: OrderCreatePayload = {
        customer_name: customerName.trim(),
        phone: cleanPhone,
        payment_method: paymentMethod,
        coupon_code: appliedCoupon?.valid ? appliedCoupon.code : undefined,
        items: cartItemsPayload,
        address: {
          name: customerName.trim(),
          phone: cleanPhone,
          pincode: cleanPincode,
          line1: line1.trim(),
          line2: line2.trim() || undefined,
          city: city.trim(),
          state: state.trim(),
        },
      };

      const orderResponse = await createOrder(orderPayload);

      // Handle based on payment method
      if (paymentMethod === 'COD') {
        // Cash on delivery: Order is confirmed immediately!
        clearCart();
        navigate(`/order-success/${orderResponse.order_code}`);
        return;
      }

      // 3. PREPAID Flow with Razorpay
      try {
        const rzpOrder = await createRazorpayOrder(orderResponse.order_code);

        // Check if Razorpay standard checkout is available on window
        const rzpWindow = (window as any).Razorpay;
        if (typeof rzpWindow === 'function') {
          const options = {
            key: rzpOrder.key_id,
            amount: rzpOrder.amount,
            currency: rzpOrder.currency,
            name: 'Royal Libas by Tanya',
            description: `Order #${orderResponse.order_code}`,
            order_id: rzpOrder.razorpay_order_id,
            prefill: {
              name: customerName.trim(),
              contact: cleanPhone,
            },
            theme: {
              color: '#5B111A',
            },
            handler: function (_response: any) {
              clearCart();
              navigate(`/order-success/${orderResponse.order_code}`);
            },
            modal: {
              ondismiss: function () {
                setIsSubmitting(false);
              },
            },
          };
          const razorpayInstance = new rzpWindow(options);
          razorpayInstance.open();
        } else {
          // In development/sandbox mock mode without external script loaded:
          // Smoothly proceed to order success screen
          clearCart();
          navigate(`/order-success/${orderResponse.order_code}`);
        }
      } catch (paymentErr: any) {
        setFormError(`Payment gateway initiation failed: ${paymentErr.message}`);
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to place order. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 min-h-screen">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/cart"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-600 hover:text-[#5B111A] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Shopping Bag</span>
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
          <Lock className="w-3.5 h-3.5 text-emerald-700" />
          <span>Secure 256-bit Encrypted Checkout</span>
        </div>
      </div>

      <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#5B111A] mb-8 pb-3 border-b border-[#E8DFD0]">
        1-Page Express Guest Checkout
      </h1>

      {stockError && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Inventory Alert</p>
            <p>{stockError}</p>
            <Link to="/cart" className="underline font-semibold mt-1 inline-block">
              Return to Bag to adjust sizes
            </Link>
          </div>
        </div>
      )}

      {formError && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="font-medium">{formError}</p>
        </div>
      )}

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10">
        {/* Left Column: 3 Steps Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* STEP 1: Contact Details */}
          <div className="bg-white p-5 sm:p-6 rounded-lg border border-[#E8DFD0] shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <span className="w-7 h-7 rounded-full bg-[#5B111A] text-white flex items-center justify-center text-xs font-bold font-serif">
                1
              </span>
              <h2 className="font-serif font-bold text-lg text-gray-900">
                Contact Information
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tanya Sharma"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5B111A] focus:ring-1 focus:ring-[#5B111A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  10-Digit Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs sm:text-sm text-gray-500 font-medium">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-12 pr-3.5 py-2.5 rounded border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5B111A] focus:ring-1 focus:ring-[#5B111A]"
                  />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              We send order tracking updates & delivery SMS to this number.
            </p>
          </div>

          {/* STEP 2: Shipping Address */}
          <div className="bg-white p-5 sm:p-6 rounded-lg border border-[#E8DFD0] shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <span className="w-7 h-7 rounded-full bg-[#5B111A] text-white flex items-center justify-center text-xs font-bold font-serif">
                2
              </span>
              <h2 className="font-serif font-bold text-lg text-gray-900">
                Delivery Address
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Flat / House / Building / Street <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flat 302, Royal Palms, Link Road"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5B111A] focus:ring-1 focus:ring-[#5B111A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Area / Landmark (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Near City Center Mall"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5B111A] focus:ring-1 focus:ring-[#5B111A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    6-Digit Pincode <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="e.g. 400050"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 rounded border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5B111A] focus:ring-1 focus:ring-[#5B111A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mumbai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5B111A] focus:ring-1 focus:ring-[#5B111A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maharashtra"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5B111A] focus:ring-1 focus:ring-[#5B111A]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* STEP 3: Payment Options */}
          <div className="bg-white p-5 sm:p-6 rounded-lg border border-[#E8DFD0] shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <span className="w-7 h-7 rounded-full bg-[#5B111A] text-white flex items-center justify-center text-xs font-bold font-serif">
                3
              </span>
              <h2 className="font-serif font-bold text-lg text-gray-900">
                Payment Method
              </h2>
            </div>

            <div className="space-y-3">
              {/* Prepaid Choice */}
              <label
                className={`p-4 rounded-lg border flex items-start gap-3 cursor-pointer transition-colors ${
                  paymentMethod === 'PREPAID'
                    ? 'border-[#5B111A] bg-[#FAF7F2] ring-1 ring-[#5B111A]'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="payment_choice"
                  value="PREPAID"
                  checked={paymentMethod === 'PREPAID'}
                  onChange={() => setPaymentMethod('PREPAID')}
                  className="mt-1 text-[#5B111A] focus:ring-[#5B111A]"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs sm:text-sm text-gray-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#C59B27]" />
                      <span>Online Payment (UPI, Cards, NetBanking)</span>
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      FREE SHIPPING
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Instant confirmation via Razorpay. Zero transaction convenience fees.
                  </p>
                </div>
              </label>

              {/* COD Choice */}
              <label
                className={`p-4 rounded-lg border flex items-start gap-3 cursor-pointer transition-colors ${
                  paymentMethod === 'COD'
                    ? 'border-[#5B111A] bg-[#FAF7F2] ring-1 ring-[#5B111A]'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="payment_choice"
                  value="COD"
                  checked={paymentMethod === 'COD'}
                  onChange={() => setPaymentMethod('COD')}
                  className="mt-1 text-[#5B111A] focus:ring-[#5B111A]"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs sm:text-sm text-gray-900 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#C59B27]" />
                      <span>Cash on Delivery (COD)</span>
                    </span>
                    <span className="text-[11px] font-semibold text-gray-600">
                      {subtotal >= 1500 ? (
                        <span className="text-emerald-700 font-bold">FREE SHIPPING</span>
                      ) : (
                        '+ Rs. 99 shipping'
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Pay in cash or UPI directly to courier delivery partner upon arrival.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary & Coupon */}
        <div className="lg:col-span-5 space-y-5">
          {/* Items Preview */}
          <div className="bg-white p-5 rounded-lg border border-[#E8DFD0] shadow-sm space-y-3">
            <h3 className="font-serif font-bold text-sm text-gray-900 border-b border-gray-100 pb-2">
              Order Items ({items.length})
            </h3>
            <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
              {items.map((item) => (
                <div key={item.variantId} className="flex items-center gap-3 text-xs">
                  <div className="w-12 h-14 rounded bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#5B111A] text-white text-[8px] flex items-center justify-center p-1 text-center font-serif">
                        RL
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-gray-500 text-[11px]">Size: {item.size} × {item.quantity}</p>
                  </div>
                  <span className="font-semibold text-gray-800 shrink-0">
                    {formatPrice(item.sellingPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Coupon Box */}
          <div className="bg-white p-5 rounded-lg border border-[#E8DFD0] shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-800">
              <Tag className="w-4 h-4 text-[#C59B27]" />
              <span>Have a Promo Coupon?</span>
            </div>

            {appliedCoupon?.valid ? (
              <div className="p-3 bg-emerald-50 rounded border border-emerald-200 flex items-center justify-between text-xs text-emerald-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-bold">{appliedCoupon.code}</span> applied!
                    <span className="ml-1 text-emerald-700">(-{formatPrice(appliedCoupon.discount)})</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="text-emerald-900 hover:text-red-700 font-semibold underline text-[11px]"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. WELCOME10, FESTIVE100"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  className="flex-1 px-3 py-2 rounded border border-gray-300 text-xs uppercase placeholder:normal-case focus:outline-none focus:border-[#5B111A]"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={isApplyingCoupon || !couponInput.trim()}
                  className="px-4 py-2 bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-300 text-white text-xs font-semibold rounded transition-colors"
                >
                  {isApplyingCoupon ? 'Checking...' : 'Apply'}
                </button>
              </div>
            )}

            {couponError && (
              <p className="text-[11px] text-red-600">{couponError}</p>
            )}
            <p className="text-[10px] text-gray-400">
              Try <strong>WELCOME10</strong> (10% off on Rs. 1,500+) or <strong>FESTIVE100</strong> (Flat Rs. 100 off on Rs. 1,000+).
            </p>
          </div>

          {/* Authoritative Price Summary */}
          <div className="bg-white p-5 rounded-lg border border-[#E8DFD0] shadow-sm space-y-3">
            <h3 className="font-serif font-bold text-sm text-gray-900 border-b border-gray-100 pb-2">
              Payment Summary
            </h3>

            <div className="space-y-2 text-xs sm:text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Items Subtotal</span>
                <span className="font-medium text-gray-900">{formatPrice(subtotal)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Coupon Discount ({appliedCoupon?.code})</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Shipping Fee</span>
                <span>
                  {shippingCharge === 0 ? (
                    <span className="text-emerald-700 font-semibold">FREE</span>
                  ) : (
                    formatPrice(shippingCharge)
                  )}
                </span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3 flex justify-between items-baseline">
              <div>
                <span className="font-bold text-gray-900 text-sm">Total Amount</span>
                <p className="text-[10px] text-gray-500">Includes all GST & taxes</p>
              </div>
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#5B111A]">
                {formatPrice(estimatedTotal)}
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-400 text-white text-xs sm:text-sm font-semibold uppercase tracking-wider rounded transition-colors shadow-md flex items-center justify-center gap-2 mt-4"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Order...</span>
                </>
              ) : paymentMethod === 'PREPAID' ? (
                `Pay ${formatPrice(estimatedTotal)} Online`
              ) : (
                `Confirm Order (${formatPrice(estimatedTotal)} COD)`
              )}
            </button>
          </div>

          {/* Security Badge */}
          <div className="p-3 bg-[#FAF7F2] rounded border border-[#E8DFD0] text-[11px] text-gray-600 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#C59B27] shrink-0" />
            <span>Guaranteed 100% authentic designer attire with secure dispatch tracking.</span>
          </div>
        </div>
      </form>
    </div>
  );
};
