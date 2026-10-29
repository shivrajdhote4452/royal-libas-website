import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  CheckCircle2,
  Truck,
  Bell,
  MessageCircle,
  AlertCircle,
  Loader2,
  CreditCard,
  AlertTriangle,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { useStoreSettings } from '../../lib/settings';
import { updateAdminStoreSettings } from '../../lib/api';

export const AdminSettings: React.FC = () => {
  const { settings, updateSettings, syncWithServer } = useStoreSettings();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [freeShippingThreshold, setFreeShippingThreshold] = useState(String(settings.freeShippingThreshold));
  const [standardShippingFee, setStandardShippingFee] = useState(String(settings.standardShippingFee));
  const [announcementText, setAnnouncementText] = useState(settings.announcementText);
  const [whatsappNumber, setWhatsappNumber] = useState(settings.whatsappNumber);
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail);
  const [instagramHandle, setInstagramHandle] = useState(settings.instagramHandle);

  // Payment controls state
  const [codEnabled, setCodEnabled] = useState<boolean>(settings.codEnabled);
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState<boolean>(settings.onlinePaymentEnabled);
  const [showConfirmBothDisabledModal, setShowConfirmBothDisabledModal] = useState<boolean>(false);

  // RBAC role state
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  useEffect(() => {
    syncWithServer();
    if (token) {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
      fetch(`${API_BASE_URL}/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.role) setCurrentUserRole(data.role);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    setFreeShippingThreshold(String(settings.freeShippingThreshold));
    setStandardShippingFee(String(settings.standardShippingFee));
    setAnnouncementText(settings.announcementText);
    setWhatsappNumber(settings.whatsappNumber);
    setSupportEmail(settings.supportEmail);
    setInstagramHandle(settings.instagramHandle);
    setCodEnabled(settings.codEnabled);
    setOnlinePaymentEnabled(settings.onlinePaymentEnabled);
  }, [settings]);

  const executeSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);

    const thresholdNum = Number(freeShippingThreshold) || 1500;
    const feeNum = Number(standardShippingFee) || 99;
    const cleanAnnouncement =
      announcementText.trim() ||
      (codEnabled
        ? `COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹${thresholdNum}`
        : `COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS`);

    try {
      if (token) {
        await updateAdminStoreSettings(token, {
          standard_cod_free_threshold: thresholdNum,
          standard_shipping_fee: feeNum,
          announcement_text: cleanAnnouncement,
          whatsapp_number: whatsappNumber.trim(),
          support_email: supportEmail.trim(),
          instagram_handle: instagramHandle.trim(),
          cod_enabled: codEnabled,
          online_payment_enabled: onlinePaymentEnabled,
        });
      }

      updateSettings({
        freeShippingThreshold: thresholdNum,
        standardShippingFee: feeNum,
        announcementText: cleanAnnouncement,
        whatsappNumber: whatsappNumber.trim(),
        supportEmail: supportEmail.trim(),
        instagramHandle: instagramHandle.trim(),
        codEnabled,
        onlinePaymentEnabled,
      });

      setSaved(true);
      setShowConfirmBothDisabledModal(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to persist settings to server.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // If both payment methods are disabled, warn the user before proceeding
    if (!codEnabled && !onlinePaymentEnabled) {
      setShowConfirmBothDisabledModal(true);
      return;
    }
    await executeSave();
  };

  const isRoleUnauthorized = currentUserRole !== null && currentUserRole !== 'OWNER';

  return (
    <div className="space-y-6 font-sans max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E8DFD0]">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-[#5E1224]" />
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">Store Settings</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure payment methods, logistics thresholds, top announcement bar, and boutique contacts
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings Saved Successfully</span>
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-800 border border-red-200 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
      </div>

      {isRoleUnauthorized && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Restricted Access (Role: {currentUserRole})</p>
            <p className="mt-0.5 text-amber-800">
              Only store administrators with the <strong>OWNER</strong> role have permission to save modifications to
              payment methods and shipping settings. Settings are shown in read-only preview mode.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Payment Methods Section (Point 1: Payment Controls) */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#B58A3C]" />
              <h2 className="font-serif font-bold text-base text-gray-900">Payment Settings & Checkout Controls</h2>
            </div>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-[#FCF8F0] text-[#5E1224] border border-[#E8DFD0]">
              Instant Enforcement
            </span>
          </div>

          <p className="text-xs text-gray-600 font-light">
            Enable or disable customer payment methods at checkout. Changes apply immediately to all incoming orders
            without requiring server restarts or code changes.
          </p>

          {/* Both Methods Disabled Critical Alert */}
          {!codEnabled && !onlinePaymentEnabled && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-3 animate-pulse">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-800">Warning: All Payment Methods Disabled</p>
                <p className="mt-0.5 text-red-700">
                  With both COD and Online Payments turned OFF, customers cannot place any orders at checkout. The
                  checkout page will display a paused notification until at least one method is re-enabled.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cash on Delivery (COD) Toggle */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                codEnabled ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-gray-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className={`w-4 h-4 ${codEnabled ? 'text-emerald-700' : 'text-gray-400'}`} />
                  <span className="text-xs font-bold text-gray-900">Cash on Delivery (COD)</span>
                </div>
                <button
                  type="button"
                  disabled={isRoleUnauthorized}
                  onClick={() => setCodEnabled(!codEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#5E1224] ${
                    codEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                  } ${isRoleUnauthorized ? 'opacity-50 cursor-not-allowed' : ''}`}
                  role="switch"
                  aria-checked={codEnabled}
                  aria-label="Toggle Cash on Delivery"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      codEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    codEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {codEnabled ? 'Active in Checkout' : 'Disabled / Hidden'}
                </span>
                <span className="text-[11px] text-gray-500">Default: OFF for new orders</span>
              </div>

              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                When enabled, eligible customers can pay in cash or UPI to the courier upon delivery. When disabled, COD
                is hidden from checkout and rejected by the API.
              </p>
            </div>

            {/* Cashfree Online Payments Toggle */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                onlinePaymentEnabled ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-gray-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className={`w-4 h-4 ${onlinePaymentEnabled ? 'text-emerald-700' : 'text-gray-400'}`} />
                  <span className="text-xs font-bold text-gray-900">Cashfree Online Payments</span>
                </div>
                <button
                  type="button"
                  disabled={isRoleUnauthorized}
                  onClick={() => setOnlinePaymentEnabled(!onlinePaymentEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#5E1224] ${
                    onlinePaymentEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                  } ${isRoleUnauthorized ? 'opacity-50 cursor-not-allowed' : ''}`}
                  role="switch"
                  aria-checked={onlinePaymentEnabled}
                  aria-label="Toggle Cashfree Online Payments"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      onlinePaymentEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    onlinePaymentEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {onlinePaymentEnabled ? 'Active in Checkout' : 'Disabled / Hidden'}
                </span>
                <span className="text-[11px] text-gray-500">Default: ON</span>
              </div>

              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                Supports instant online checkout via UPI (Google Pay, PhonePe, Paytm), Credit/Debit Cards, Net Banking,
                and Wallets through Cashfree gateway.
              </p>
            </div>
          </div>

          {/* Granular Instrument Note */}
          <div className="p-3.5 rounded-xl bg-[#FCF8F0] border border-[#E8DFD0] text-xs text-gray-700 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#B58A3C] shrink-0 mt-0.5" />
            <div className="text-[11.5px] leading-relaxed">
              <span className="font-semibold text-gray-900">Cashfree Gateway Configuration Note:</span>
              <p className="text-gray-600 mt-0.5">
                Specific payment instruments (e.g. enabling or disabling specific credit card issuers, EMIs, or UPI apps)
                are managed inside your{' '}
                <a
                  href="https://merchant.cashfree.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5E1224] underline hover:text-[#4A0E1C] font-medium"
                >
                  Cashfree Merchant Dashboard
                </a>
                . The toggles above control whether online checkout is permitted on Royal Libas.
              </p>
            </div>
          </div>
        </div>

        {/* Logistics & Delivery Settings */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Truck className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">Shipping & Delivery Thresholds</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Free Shipping Threshold (₹)
              </label>
              <input
                type="number"
                disabled={isRoleUnauthorized}
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400 mt-1">Orders above this qualify for free shipping</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Standard Shipping Charge (₹)
              </label>
              <input
                type="number"
                disabled={isRoleUnauthorized}
                value={standardShippingFee}
                onChange={(e) => setStandardShippingFee(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400 mt-1">Applied when cart subtotal is under threshold</p>
            </div>
          </div>
        </div>

        {/* Announcement Bar Message */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Bell className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">Top Announcement Banner</h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Storefront Announcement Message
            </label>
            <input
              type="text"
              disabled={isRoleUnauthorized}
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Displayed at the top of every storefront page. Dynamically reflects COD availability when saved.
            </p>
          </div>
        </div>

        {/* Contact & Social Channels */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <MessageCircle className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">Boutique Contact Channels</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">WhatsApp Concierge</label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Email</label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Instagram Handle</label>
              <input
                type="text"
                disabled={isRoleUnauthorized}
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0] disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving || isRoleUnauthorized}
            className="inline-flex items-center gap-2 px-7 py-3 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-white text-xs font-ui font-semibold uppercase tracking-wider rounded-lg shadow-md transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Saving to Server...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Confirmation Modal: Both Payment Methods Disabled */}
      {showConfirmBothDisabledModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-gray-900">Pause Store Checkout?</h3>
                <p className="text-xs text-red-700">Both payment methods are disabled</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              You are about to save settings with <strong>both Cash on Delivery (COD)</strong> and{' '}
              <strong>Cashfree Online Payments turned OFF</strong>.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              Customers will be unable to complete any purchases at checkout until at least one payment method is
              re-enabled.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmBothDisabledModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel & Review
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={executeSave}
                className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Confirm & Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
