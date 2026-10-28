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
  cancelOrder,
  createCashfreeOrder,
  fetchPaymentGatewayConfig,
} from '../lib/api';
import { CouponValidateResponse, OrderCreatePayload, PaymentGatewayConfigResponse } from '../types/order';
import { useStoreSettings } from '../lib/settings';

export const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { items, subtotal, removePurchasedItems } = useCart();
  const { settings } = useStoreSettings();

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [pincode, setPincode] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PREPAID' | 'COD'>('PREPAID');
  const [shippingMethod, setShippingMethod] = useState<'STANDARD' | 'EXPRESS'>('STANDARD');
  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfigResponse | null>(null);

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidateResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);

  // Redirect if cart is empty & check gateway status
  useEffect(() => {
    document.title = 'Secure Guest Checkout | Royal Libas by Tanya';
    if (items.length === 0) {
      navigate('/cart');
    }
    fetchPaymentGatewayConfig()
      .then((cfg) => {
        setGatewayConfig(cfg);
        if (!cfg.configured) {
          setPaymentMethod('COD');
        }
      })
      .catch(() => {
        setGatewayConfig({ configured: false, mode: 'sandbox' });
        setPaymentMethod('COD');
      });
  }, [items, navigate]);

  // Dynamic server-aligned fee calculations
  const discountAmount = appliedCoupon?.valid ? appliedCoupon.discount : 0;
  const shippingCharge =
    shippingMethod === 'EXPRESS'
      ? settings.standardShippingFee
      : paymentMethod === 'PREPAID'
      ? 0
      : subtotal >= settings.freeShippingThreshold
      ? 0
      : settings.standardShippingFee;
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
        shipping_method: shippingMethod,
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
      const orderToken = orderResponse.order_token || '';
      if (orderToken) {
        try {
          sessionStorage.setItem(`rl_token_${orderResponse.order_code}`, orderToken);
        } catch {}
      }

      // Handle based on payment method
      if (paymentMethod === 'COD') {
        // Cash on delivery: Order is confirmed immediately! Remove purchased items once
        removePurchasedItems(cartItemsPayload.map((item) => ({ variantId: item.variant_id, quantity: item.quantity })));
        try {
          sessionStorage.setItem(`rl_cleared_${orderResponse.order_code}`, 'true');
        } catch {}
        navigate(`/order-success/${orderResponse.order_code}?token=${encodeURIComponent(orderToken)}`);
        return;
      }

      // 3. PREPAID Flow with Cashfree
      if (!gatewayConfig || !gatewayConfig.configured) {
        // Cancel the unpayable prepaid reservation immediately so stock is not locked
        await cancelOrder(orderResponse.order_code, orderToken, 'Payment gateway unconfigured').catch(() => {});
        setFormError('Online payments are currently unavailable. Please choose Cash on Delivery.');
        setPaymentMethod('COD');
        setIsSubmitting(false);
        return;
      }

      try {
        // Dynamically ensure Cashfree JS SDK v3 is loaded
        const loadCashfreeSDK = (): Promise<boolean> => {
          return new Promise((resolve) => {
            if (typeof (window as any).Cashfree === 'function') {
              resolve(true);
              return;
            }
            const existingScript = document.getElementById('cashfree-js-sdk');
            if (existingScript) {
              existingScript.addEventListener('load', () => resolve(true));
              existingScript.addEventListener('error', () => resolve(false));
              return;
            }
            const script = document.createElement('script');
            script.id = 'cashfree-js-sdk';
            script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
          });
        };

        const isLoaded = await loadCashfreeSDK();
        if (!isLoaded || typeof (window as any).Cashfree !== 'function') {
          await cancelOrder(orderResponse.order_code, orderToken, 'Cashfree SDK failed to load').catch(() => {});
          setFormError('Unable to load payment gateway. Your cart is preserved. Please choose Cash on Delivery.');
          setPaymentMethod('COD');
          setIsSubmitting(false);
          return;
        }

        const cfOrder = await createCashfreeOrder(orderResponse.order_code);
        const mode = (cfOrder.mode || gatewayConfig.mode || 'sandbox') === 'production' ? 'production' : 'sandbox';
        const cashfree = (window as any).Cashfree({ mode });

        // Launch Cashfree checkout with payment_session_id
        // Note: Do NOT clear cart yet. Cart is cleared only when order is confirmed paid on success page.
        cashfree.checkout({
          paymentSessionId: cfOrder.payment_session_id,
          redirectTarget: '_self',
        });
      } catch (paymentErr: any) {
        // Safe recovery: cancel reservation so items are immediately returned to stock
        await cancelOrder(orderResponse.order_code, orderToken, 'Payment session creation failed').catch(() => {});
        setFormError('Could not launch payment gateway. Your cart has been preserved. Please retry or choose Cash on Delivery.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to place order. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FCF8F0] page-enter font-sans">
      {/* ========================================================
          1. CHECKOUT BANNER (PDF Page 7)
          "CHECKOUT - A few details closer to something beautiful."
          ======================================================== */}
      <section className="bg-[#2B1B1E] text-[#FCF8F0] py-10 sm:py-14 px-4 sm:px-6 lg:px-8 border-b border-[#B58A3C]/30 text-center">
        <div className="max-w-4xl mx-auto space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#B58A3C] font-semibold">
              FINAL DETAILS
            </span>
            <span className="w-6 h-[1px] bg-[#B58A3C]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FCF8F0]">
            CHECKOUT
          </h1>
          <p className="text-xs sm:text-sm text-[#FCF8F0]/80 font-light italic">
            A few details closer to something beautiful.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/cart"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-600 hover:text-[#5E1224] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Shopping Bag</span>
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <Lock className="w-3.5 h-3.5 text-emerald-700" />
            <span>100% Secure and Encrypted Checkout</span>
          </div>
        </div>

        {/* Stepper Progress Bar matching PDF Page 7 */}
        <div className="mb-8 bg-white p-4 border border-[#E8DFD0] shadow-sm">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            {[
              { num: 1, label: 'Contact' },
              { num: 2, label: 'Delivery' },
              { num: 3, label: 'Payment' },
              { num: 4, label: 'Review' },
            ].map((s, idx, arr) => (
              <React.Fragment key={s.num}>
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-[#5E1224] text-[#FCF8F0] flex items-center justify-center text-xs font-bold font-serif shadow-sm">
                    {s.num}
                  </div>
                  <span className="text-[11px] font-semibold text-gray-800 mt-1">{s.label}</span>
                </div>
                {idx < arr.length - 1 && (
                  <div className="flex-1 h-0.5 bg-[#B58A3C]/40 mx-2 -mt-4" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

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
          <div className="bg-white p-5 sm:p-6 rounded-none border border-[#E8DFD0] shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <span className="w-7 h-7 rounded-none bg-[#5E1224] text-[#FCF8F0] flex items-center justify-center text-xs font-bold font-serif">
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
                  className="w-full px-3.5 py-2.5 rounded-none border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
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
                    className="w-full pl-12 pr-3.5 py-2.5 rounded-none border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              We send order tracking updates & delivery SMS to this number.
            </p>
          </div>

          {/* STEP 2: Shipping Address */}
          <div className="bg-white p-5 sm:p-6 rounded-none border border-[#E8DFD0] shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <span className="w-7 h-7 rounded-none bg-[#5E1224] text-[#FCF8F0] flex items-center justify-center text-xs font-bold font-serif">
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
                  className="w-full px-3.5 py-2.5 rounded-none border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
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
                  className="w-full px-3.5 py-2.5 rounded-none border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
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
                    className="w-full px-3.5 py-2.5 rounded-none border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
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
                    className="w-full px-3.5 py-2.5 rounded-none border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
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
                    className="w-full px-3.5 py-2.5 rounded-none border border-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* STEP 3: Shipping Method (PDF Page 6) */}
          <div className="bg-white p-5 sm:p-6 rounded-none border border-[#E8DFD0] shadow-sm space-y-3">
            <h2 className="font-serif font-bold text-base text-gray-900 border-b border-gray-100 pb-2.5">
              Shipping Method
            </h2>
            <div className="space-y-2">
              <label
                onClick={() => setShippingMethod('STANDARD')}
                className={`flex items-center justify-between p-3 rounded-none border cursor-pointer transition-colors ${
                  shippingMethod === 'STANDARD'
                    ? 'border-[#5E1224] bg-[#FCF8F0]'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="shipping_method"
                    value="STANDARD"
                    checked={shippingMethod === 'STANDARD'}
                    onChange={() => setShippingMethod('STANDARD')}
                    className="text-[#5E1224] focus:ring-[#B58A3C]"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-gray-800">
                    Standard Delivery (5–7 days)
                  </span>
                </div>
                <span className="text-xs font-bold text-emerald-700">Free</span>
              </label>

              <label
                onClick={() => setShippingMethod('EXPRESS')}
                className={`flex items-center justify-between p-3 rounded-none border cursor-pointer transition-colors ${
                  shippingMethod === 'EXPRESS'
                    ? 'border-[#5E1224] bg-[#FCF8F0]'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="shipping_method"
                    value="EXPRESS"
                    checked={shippingMethod === 'EXPRESS'}
                    onChange={() => setShippingMethod('EXPRESS')}
                    className="text-[#5E1224] focus:ring-[#B58A3C]"
                  />
                  <span className="text-xs sm:text-sm font-medium text-gray-800">
                    Express Delivery (2–3 days)
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-800">₹99</span>
              </label>
            </div>
          </div>

          {/* STEP 4: Payment Options (PDF Page 6 & 13) */}
          <div className="bg-white p-5 sm:p-6 rounded-none border border-[#E8DFD0] shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <span className="w-7 h-7 rounded-none bg-[#5E1224] text-[#FCF8F0] flex items-center justify-center text-xs font-bold font-serif">
                3
              </span>
              <h2 className="font-serif font-bold text-lg text-gray-900">
                Payment Method
              </h2>
            </div>

            <div className="space-y-3">
              {/* Prepaid Choice */}
              <label
                className={`p-4 rounded-none border flex items-start gap-3 transition-colors ${
                  gatewayConfig && !gatewayConfig.configured
                    ? 'opacity-60 cursor-not-allowed bg-gray-50 border-gray-200'
                    : paymentMethod === 'PREPAID'
                    ? 'border-[#5E1224] bg-[#FCF8F0] ring-1 ring-[#5E1224] cursor-pointer'
                    : 'border-gray-200 hover:border-gray-300 bg-white cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="payment_choice"
                  value="PREPAID"
                  disabled={gatewayConfig ? !gatewayConfig.configured : false}
                  checked={paymentMethod === 'PREPAID' && (gatewayConfig ? gatewayConfig.configured : true)}
                  onChange={() => {
                    if (gatewayConfig?.configured !== false) {
                      setPaymentMethod('PREPAID');
                    }
                  }}
                  className="mt-1 text-[#5E1224] focus:ring-[#B58A3C]"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs sm:text-sm text-gray-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#B58A3C]" />
                      <span>Online Payment (UPI, Cards, NetBanking)</span>
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200">
                      FREE SHIPPING
                    </span>
                  </div>
                  {gatewayConfig && !gatewayConfig.configured ? (
                    <p className="text-[11px] text-amber-700 font-semibold mt-1">
                      Prepaid payment not available right now, please choose COD
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 mt-1">
                      Instant confirmation via Cashfree. Zero transaction convenience fees.
                    </p>
                  )}
                </div>
              </label>

              {/* COD Choice */}
              <label
                className={`p-4 rounded-none border flex items-start gap-3 cursor-pointer transition-colors ${
                  paymentMethod === 'COD'
                    ? 'border-[#5E1224] bg-[#FCF8F0] ring-1 ring-[#5E1224]'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="payment_choice"
                  value="COD"
                  checked={paymentMethod === 'COD'}
                  onChange={() => setPaymentMethod('COD')}
                  className="mt-1 text-[#5E1224] focus:ring-[#B58A3C]"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs sm:text-sm text-gray-900 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#B58A3C]" />
                      <span>Cash on Delivery (COD)</span>
                    </span>
                    <span className="text-[11px] font-semibold text-gray-600">
                      {subtotal >= settings.freeShippingThreshold ? (
                        <span className="text-emerald-700 font-bold">FREE SHIPPING</span>
                      ) : (
                        `+ Rs. ${settings.standardShippingFee} shipping`
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
          <div className="bg-white p-5 rounded-none border border-[#E8DFD0] shadow-sm space-y-3">
            <h3 className="font-serif font-bold text-sm text-gray-900 border-b border-gray-100 pb-2">
              Order Items ({items.length})
            </h3>
            <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
              {items.map((item) => (
                <div key={item.variantId} className="flex items-center gap-3 text-xs">
                  <div className="w-12 h-14 rounded-none bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#5E1224] text-white text-[8px] flex items-center justify-center p-1 text-center font-serif">
                        RL
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-gray-500 text-[11px]">
                      Size: <strong className="text-gray-700">{item.size}</strong> {item.colour ? `| Colour: ${item.colour}` : ''} × {item.quantity}
                    </p>
                  </div>
                  <span className="font-semibold text-gray-800 shrink-0">
                    {formatPrice(item.sellingPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Coupon Box */}
          <div className="bg-white p-5 rounded-none border border-[#E8DFD0] shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-800">
              <Tag className="w-4 h-4 text-[#B58A3C]" />
              <span>Have a Promo Coupon?</span>
            </div>

            {appliedCoupon?.valid ? (
              <div className="p-3 bg-emerald-50 rounded-none border border-emerald-200 flex items-center justify-between text-xs text-emerald-800">
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
                  className="flex-1 px-3 py-2 rounded-none border border-gray-300 text-xs uppercase placeholder:normal-case focus:outline-none focus:border-[#5E1224]"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={isApplyingCoupon || !couponInput.trim()}
                  className="px-4 py-2 bg-[#5E1224] hover:bg-[#3A080F] disabled:bg-gray-300 text-[#FCF8F0] text-xs font-semibold rounded-none transition-colors tracking-wider"
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
          <div className="bg-white p-5 rounded-none border border-[#B58A3C]/40 shadow-sm space-y-3">
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
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#5E1224]">
                {formatPrice(estimatedTotal)}
              </span>
            </div>

            {/* Payment Logos (PDF Page 6) */}
            <div className="pt-2 flex items-center justify-center gap-4 text-xs font-bold text-gray-500 uppercase tracking-widest border-t border-gray-100">
              <span className="text-[#1A1F71] font-black italic text-sm">VISA</span>
              <span className="text-[#EB001B] font-bold text-xs">Mastercard</span>
              <span className="text-[#097939] font-black text-xs">UPI</span>
              <span className="text-gray-600 font-bold text-xs">RuPay</span>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="terms_agree"
                defaultChecked
                required
                className="rounded-none border-gray-300 text-[#5E1224] focus:ring-[#B58A3C]"
              />
              <label htmlFor="terms_agree" className="text-[11px] text-gray-600 select-none">
                I agree to the <Link to="/terms-of-service" className="text-[#5E1224] underline">Terms & Conditions</Link> and <Link to="/privacy-policy" className="text-[#5E1224] underline">Privacy Policy</Link>.
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-[#5E1224] hover:bg-[#3A080F] disabled:bg-gray-400 text-[#FCF8F0] text-xs sm:text-sm font-ui font-semibold uppercase tracking-[0.2em] transition-all shadow-md flex items-center justify-center gap-2 mt-2 rounded-none"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>PROCESSING ORDER...</span>
                </span>
              ) : (
                <span>{paymentMethod === 'COD' ? 'PLACE ORDER →' : 'PAY & PLACE ORDER →'}</span>
              )}
            </button>
            <p className="text-[10px] text-center text-gray-400 mt-2">
              🔒 100% Secure and Encrypted Checkout
            </p>
          </div>

          {/* Security Badge */}
          <div className="p-3 bg-[#FCF8F0] rounded-none border border-[#E8DFD0] text-[11px] text-gray-600 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#B58A3C] shrink-0" />
            <span>Guaranteed designer quality attire with secure dispatch tracking.</span>
          </div>
        </div>
      </form>
    </div>
  </div>
  );
};
