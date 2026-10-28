import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle2, Truck, Bell, MessageCircle, AlertCircle, Loader2 } from 'lucide-react';
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

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  useEffect(() => {
    syncWithServer();
  }, []);

  useEffect(() => {
    setFreeShippingThreshold(String(settings.freeShippingThreshold));
    setStandardShippingFee(String(settings.standardShippingFee));
    setAnnouncementText(settings.announcementText);
    setWhatsappNumber(settings.whatsappNumber);
    setSupportEmail(settings.supportEmail);
    setInstagramHandle(settings.instagramHandle);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);

    const thresholdNum = Number(freeShippingThreshold) || 1500;
    const feeNum = Number(standardShippingFee) || 99;
    const cleanAnnouncement = announcementText.trim() || `COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹${thresholdNum}`;

    try {
      if (token) {
        await updateAdminStoreSettings(token, {
          standard_cod_free_threshold: thresholdNum,
          standard_shipping_fee: feeNum,
          announcement_text: cleanAnnouncement,
          whatsapp_number: whatsappNumber.trim(),
          support_email: supportEmail.trim(),
          instagram_handle: instagramHandle.trim(),
        });
      }

      updateSettings({
        freeShippingThreshold: thresholdNum,
        standardShippingFee: feeNum,
        announcementText: cleanAnnouncement,
        whatsappNumber: whatsappNumber.trim(),
        supportEmail: supportEmail.trim(),
        instagramHandle: instagramHandle.trim(),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to persist settings to server.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-sans max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E8DFD0]">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-[#5E1224]" />
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Store Settings
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure logistics, announcement bar, and boutique contact channels
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings Saved to Server</span>
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-800 border border-red-200 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span>{saveError}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Logistics & Delivery Settings */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Truck className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">
              Shipping & Delivery Thresholds
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Free Shipping Threshold (₹)
              </label>
              <input
                type="number"
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0]"
              />
              <p className="text-[11px] text-gray-400 mt-1">Orders above this qualify for free shipping</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Standard Shipping Charge (₹)
              </label>
              <input
                type="number"
                value={standardShippingFee}
                onChange={(e) => setStandardShippingFee(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0]"
              />
              <p className="text-[11px] text-gray-400 mt-1">Applied when cart subtotal is under threshold</p>
            </div>
          </div>
        </div>

        {/* Announcement Bar Message */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Bell className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">
              Top Announcement Banner
            </h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Storefront Announcement Message
            </label>
            <input
              type="text"
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0]"
            />
            <p className="text-[11px] text-gray-400 mt-1">Displayed at the top of every storefront page</p>
          </div>
        </div>

        {/* Contact & Social Channels */}
        <div className="bg-white p-6 rounded-2xl border border-[#E8DFD0] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <MessageCircle className="w-5 h-5 text-[#B58A3C]" />
            <h2 className="font-serif font-bold text-base text-gray-900">
              Boutique Contact Channels
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">WhatsApp Concierge</label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Email</label>
              <input
                type="text"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Instagram Handle</label>
              <input
                type="text"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E8DFD0] text-xs font-medium focus:outline-none focus:border-[#5E1224] bg-[#FCF8F0]"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-7 py-3 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-400 text-white text-xs font-ui font-semibold uppercase tracking-wider rounded-lg shadow-md transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Saving to Server...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
