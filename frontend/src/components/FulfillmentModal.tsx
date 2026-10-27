import React, { useState } from 'react';
import {
  X,
  Truck,
  Package,
  MapPin,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  checkFulfillmentServiceability,
  shipOrderViaFulfillment,
  formatPrice,
} from '../lib/api';
import { OrderResponse, CourierOption } from '../types/order';

interface FulfillmentModalProps {
  order: OrderResponse;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: OrderResponse) => void;
  token: string;
  providerLabel?: string;
}

export const FulfillmentModal: React.FC<FulfillmentModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
  token,
  providerLabel = 'Ship Order',
}) => {
  const [length, setLength] = useState<string>('25');
  const [breadth, setBreadth] = useState<string>('20');
  const [height, setHeight] = useState<string>('5');
  const [weight, setWeight] = useState<string>('0.5');

  const [checkingRates, setCheckingRates] = useState<boolean>(false);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isCOD = order.payment_method === 'COD';

  const validateDimensions = (): { l: number; b: number; h: number; w: number } | null => {
    const l = parseFloat(length);
    const b = parseFloat(breadth);
    const h = parseFloat(height);
    const w = parseFloat(weight);

    if (isNaN(l) || isNaN(b) || isNaN(h) || isNaN(w) || l <= 0 || b <= 0 || h <= 0 || w <= 0) {
      setError("Enter the packed parcel's weight and dimensions");
      return null;
    }
    return { l, b, h, w };
  };

  const handleCheckServiceability = async () => {
    setError(null);
    const dims = validateDimensions();
    if (!dims) return;

    setCheckingRates(true);
    try {
      const res = await checkFulfillmentServiceability(token, order.id, {
        length: dims.l,
        breadth: dims.b,
        height: dims.h,
        weight: dims.w,
      });

      setCouriers(res.available_couriers);
      if (res.recommended_courier_id) {
        setSelectedCourierId(res.recommended_courier_id);
      } else if (res.available_couriers.length > 0) {
        setSelectedCourierId(res.available_couriers[0].courier_company_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check courier serviceability');
    } finally {
      setCheckingRates(false);
    }
  };

  const handleConfirmShipment = async () => {
    setError(null);
    const dims = validateDimensions();
    if (!dims) return;

    setSubmitting(true);
    try {
      const updated = await shipOrderViaFulfillment(token, order.id, {
        length: dims.l,
        breadth: dims.b,
        height: dims.h,
        weight: dims.w,
        courier_id: selectedCourierId,
      });

      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Fulfillment dispatch failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#E8DFD0] overflow-hidden animate-fadeIn my-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-[#FAF7F2] border-b border-[#E8DFD0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#5B111A] text-white flex items-center justify-center">
              <Truck className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-gray-900 text-sm sm:text-base">
                {providerLabel} — {order.order_code}
              </h2>
              <p className="text-[11px] text-gray-500">
                Automated pickup scheduling, AWB assignment & label generation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          {error && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-medium">{error}</div>
            </div>
          )}

          {/* Prefilled Order Details Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Buyer & Address */}
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5">
              <span className="font-bold text-gray-900 block flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#5B111A]" />
                <span>Delivery Address</span>
              </span>
              <p className="font-semibold text-gray-800">{order.customer_name}</p>
              <p className="text-gray-600">Phone: +91 {order.phone}</p>
              {order.address && (
                <p className="text-gray-600 leading-relaxed">
                  {order.address.line1}
                  {order.address.line2 ? `, ${order.address.line2}` : ''}
                  <br />
                  {order.address.city}, {order.address.state} —{' '}
                  <strong className="text-gray-900">{order.address.pincode}</strong>
                </p>
              )}
            </div>

            {/* Payment & Items Snapshot */}
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5">
              <span className="font-bold text-gray-900 block flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-[#5B111A]" />
                <span>Order Summary</span>
              </span>
              <div className="flex justify-between text-gray-600">
                <span>Payment Mode:</span>
                <span className="font-bold text-gray-800">
                  {isCOD ? 'Cash on Delivery (COD)' : 'Prepaid (Confirmed)'}
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Collectable Total:</span>
                <span className="font-bold text-[#5B111A]">{formatPrice(order.total)}</span>
              </div>
              <div className="pt-1 border-t border-gray-200 text-gray-600">
                <span className="text-[11px] font-medium block">
                  Items ({order.items.length}):
                </span>
                <ul className="divide-y divide-gray-100 max-h-20 overflow-y-auto">
                  {order.items.map((it) => (
                    <li key={it.id} className="py-1 flex justify-between">
                      <span className="truncate pr-2">
                        {it.product_name_snapshot} ({it.size_snapshot}) × {it.quantity}
                      </span>
                      <span className="font-medium shrink-0">
                        {formatPrice(it.line_total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Parcel Box Dimensions & Weight (Required) */}
          <div className="p-4 bg-[#FAF7F2] rounded-xl border border-[#E8DFD0] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-serif font-bold text-gray-900 text-xs sm:text-sm">
                  Packed Parcel Dimensions & Weight
                </span>
                <p className="text-[11px] text-gray-500">
                  Measured from the packed box before courier pickup. Required for booking.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Length (cm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  required
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 focus:outline-none focus:border-[#5B111A] font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Breadth (cm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  required
                  value={breadth}
                  onChange={(e) => setBreadth(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 focus:outline-none focus:border-[#5B111A] font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Height (cm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  required
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 focus:outline-none focus:border-[#5B111A] font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Gross Weight (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  required
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded border border-gray-300 focus:outline-none focus:border-[#5B111A] font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={checkingRates || submitting}
              onClick={handleCheckServiceability}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-[#5B111A] border border-[#5B111A] rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              {checkingRates ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking Courier Rates...</span>
                </>
              ) : (
                <>
                  <Truck className="w-3.5 h-3.5" />
                  <span>Calculate Courier Rates & Serviceability</span>
                </>
              )}
            </button>
          </div>

          {/* Available Couriers & Selection */}
          {couriers.length > 0 && (
            <div className="space-y-2">
              <span className="font-bold text-gray-900 block">
                Available Courier Partners ({couriers.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {couriers.map((c) => {
                  const isSelected = selectedCourierId === c.courier_company_id;
                  return (
                    <div
                      key={c.courier_company_id}
                      onClick={() => setSelectedCourierId(c.courier_company_id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#FAF7F2] border-[#5B111A] shadow-sm'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-900 text-xs">
                            {c.courier_name}
                          </span>
                          {c.is_recommended && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded uppercase">
                              Best Rate
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Est. Delivery: {c.etd || '3–5 days'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-[#5B111A] block">
                          {formatPrice(c.rate)}
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border ml-auto flex items-center justify-center mt-1 ${
                            isSelected
                              ? 'bg-[#5B111A] border-[#5B111A] text-white'
                              : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-gray-600 hover:text-gray-900 rounded font-medium"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={submitting || checkingRates}
            onClick={handleConfirmShipment}
            className="px-5 py-2.5 bg-[#5B111A] hover:bg-[#3A080F] disabled:bg-gray-400 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-2 transition-colors uppercase tracking-wider"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Dispatching Shipment...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Confirm Shipment & Generate Label</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
