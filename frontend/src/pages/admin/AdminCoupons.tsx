import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Tag,
  Plus,
  Search,
  Calendar,
  ShoppingBag,
  BarChart3,
  Pencil,
  Power,
  X,
  Check,
  AlertCircle,
  Trash2,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { AdminCoupon, CouponCreatePayload, CouponUpdatePayload } from '../../types/coupon';
import {
  adminFetchCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminToggleCouponActive,
  adminDeleteCoupon,
} from '../../lib/api';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

export const AdminCoupons: React.FC = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('royal_libas_admin_token') || '' : '';

  // Data state
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & search
  const [activeTab, setActiveTab] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Slide-over Drawer / Form State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<AdminCoupon | null>(null);

  // Form Fields
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<'PERCENT' | 'FLAT'>('PERCENT');
  const [formValue, setFormValue] = useState<string>('10');
  const [formMinOrder, setFormMinOrder] = useState<string>('1000');
  const [formUsageLimit, setFormUsageLimit] = useState<string>('');
  const [formValidFrom, setFormValidFrom] = useState<string>('');
  const [formValidUntil, setFormValidUntil] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // Submission & Action state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Delete modal state
  const [couponToDelete, setCouponToDelete] = useState<AdminCoupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toast trigger
  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Fetch coupons from backend
  const loadCoupons = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchCoupons(token);
      setCoupons(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load discount coupons');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      ALL: coupons.length,
      ACTIVE: coupons.filter((c) => c.status === 'ACTIVE').length,
      INACTIVE: coupons.filter((c) => c.status === 'INACTIVE').length,
      EXPIRED: coupons.filter((c) => c.status === 'EXPIRED').length,
    };
  }, [coupons]);

  // Filtered & searched coupons
  const filteredCoupons = useMemo(() => {
    return coupons.filter((c) => {
      // Status tab match
      if (activeTab !== 'ALL' && c.status !== activeTab) {
        return false;
      }
      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const codeMatch = c.code.toLowerCase().includes(q);
        const valueMatch = c.value.toString().includes(q);
        const typeMatch = c.type.toLowerCase().includes(q);
        return codeMatch || valueMatch || typeMatch;
      }
      return true;
    });
  }, [coupons, activeTab, searchQuery]);

  // Open Drawer for Create
  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setFormCode('');
    setFormType('PERCENT');
    setFormValue('10');
    setFormMinOrder('1000');
    setFormUsageLimit('500');
    // Set default dates: today to +30 days
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFormValidFrom(today);
    setFormValidUntil(nextMonth);
    setFormIsActive(true);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Open Drawer for Edit
  const handleOpenEdit = (c: AdminCoupon) => {
    setEditingCoupon(c);
    setFormCode(c.code);
    setFormType(c.type === 'FLAT' ? 'FLAT' : 'PERCENT');
    setFormValue(c.value.toString());
    setFormMinOrder((c.min_order_value || 0).toString());
    setFormUsageLimit(c.usage_limit ? c.usage_limit.toString() : '');
    setFormValidFrom(c.valid_from ? c.valid_from.split('T')[0] : '');
    setFormValidUntil(c.valid_until ? c.valid_until.split('T')[0] : '');
    setFormIsActive(c.is_active);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Close Drawer
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setEditingCoupon(null);
    setFormError(null);
  };

  // Toggle Coupon Active State
  const handleToggleActive = async (c: AdminCoupon) => {
    if (!token) return;
    if (c.status === 'EXPIRED') {
      handleOpenEdit(c);
      showToast(`Extend validity or usage limit to reactivate coupon ${c.code}.`, 'error');
      return;
    }
    setActionLoadingId(c.id);
    try {
      const updated = await adminToggleCouponActive(token, c.id);
      setCoupons((prev) => prev.map((item) => (item.id === c.id ? updated : item)));
      showToast(`Coupon ${updated.code} is now ${updated.is_active ? 'active' : 'inactive'}.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update coupon status', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete Coupon
  const handleDeleteConfirm = async () => {
    if (!token || !couponToDelete) return;
    setDeleting(true);
    try {
      await adminDeleteCoupon(token, couponToDelete.id);
      setCoupons((prev) => prev.filter((item) => item.id !== couponToDelete.id));
      showToast(`Coupon ${couponToDelete.code} was deleted successfully.`);
      setCouponToDelete(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete coupon', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Save Coupon (Create or Update)
  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanCode = formCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 2) {
      setFormError('Please enter a valid coupon code (at least 2 letters/numbers).');
      return;
    }

    const numValue = parseFloat(formValue);
    if (isNaN(numValue) || numValue <= 0) {
      setFormError('Please enter a positive discount value.');
      return;
    }
    if (formType === 'PERCENT' && numValue > 100) {
      setFormError('Percentage discount cannot exceed 100%.');
      return;
    }

    const numMinOrder = formMinOrder ? parseFloat(formMinOrder) : 0;
    if (isNaN(numMinOrder) || numMinOrder < 0) {
      setFormError('Minimum order amount cannot be negative.');
      return;
    }

    let limitVal: number | null = null;
    if (formUsageLimit.trim()) {
      const parsedLimit = parseInt(formUsageLimit.trim(), 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        setFormError('Usage limit must be at least 1 redemption.');
        return;
      }
      limitVal = parsedLimit;
    }

    if (formValidFrom && formValidUntil && formValidUntil < formValidFrom) {
      setFormError('End date must be on or after the start date.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingCoupon) {
        // Update flow
        const payload: CouponUpdatePayload = {
          code: cleanCode,
          type: formType,
          value: numValue,
          min_order_value: numMinOrder,
          usage_limit: limitVal,
          valid_from: formValidFrom ? new Date(formValidFrom).toISOString() : null,
          valid_until: formValidUntil ? new Date(formValidUntil + 'T23:59:59').toISOString() : null,
          is_active: formIsActive,
        };
        const updated = await adminUpdateCoupon(token, editingCoupon.id, payload);
        setCoupons((prev) => prev.map((item) => (item.id === editingCoupon.id ? updated : item)));
        showToast(`Coupon ${updated.code} updated successfully.`);
        handleCloseDrawer();
      } else {
        // Create flow
        const payload: CouponCreatePayload = {
          code: cleanCode,
          type: formType,
          value: numValue,
          min_order_value: numMinOrder,
          usage_limit: limitVal,
          valid_from: formValidFrom ? new Date(formValidFrom).toISOString() : null,
          valid_until: formValidUntil ? new Date(formValidUntil + 'T23:59:59').toISOString() : null,
          is_active: formIsActive,
        };
        const created = await adminCreateCoupon(token, payload);
        setCoupons((prev) => [created, ...prev]);
        showToast(`Coupon ${created.code} created successfully.`);
        handleCloseDrawer();
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save coupon.');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper date formatter matching reference image "Valid: 01 Jan – 31 Mar"
  const formatValidityDates = (validFrom: string | null, validUntil: string | null) => {
    if (!validFrom && !validUntil) return 'No Expiry';
    const formatDate = (iso: string | null) => {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      } catch {
        return '';
      }
    };
    if (validFrom && validUntil) {
      return `Valid: ${formatDate(validFrom)} – ${formatDate(validUntil)}`;
    }
    if (validUntil) {
      return `Valid until ${formatDate(validUntil)}`;
    }
    if (validFrom) {
      return `Valid from ${formatDate(validFrom)}`;
    }
    return 'No Expiry';
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-fade-in ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Coupons &amp; Offers
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Create and manage discount codes.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          data-testid="create-coupon-btn"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#5E1224] hover:bg-[#4A0E1C] active:bg-[#3D0B17] text-white text-xs font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#5E1224]/30"
        >
          <Plus className="w-4 h-4" />
          <span>Create Coupon</span>
        </button>
      </div>

      {/* Decorative Floral Divider matching Option 2 design */}
      <div className="relative my-2 flex items-center justify-center">
        <div className="w-full border-t border-[#E8DFD0]"></div>
        <div className="absolute px-3 bg-[#FAF6F0] flex items-center gap-1.5 text-[#B38E5D]">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M12 2C12 2 13.5 6.5 16 8C18.5 9.5 22 10 22 10C22 10 18.5 12 17 14.5C15.5 17 15 20.5 15 20.5C15 20.5 13.5 17 12 16C10.5 17 9 20.5 9 20.5C9 20.5 8.5 17 7 14.5C5.5 12 2 10 2 10C2 10 5.5 9.5 8 8C10.5 6.5 12 2 12 2Z"
              opacity="0.8"
            />
          </svg>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['ALL', 'ACTIVE', 'INACTIVE', 'EXPIRED'] as StatusFilter[]).map((tab) => {
            const isSelected = activeTab === tab;
            const label =
              tab === 'ALL'
                ? 'All Coupons'
                : tab === 'ACTIVE'
                ? 'Active'
                : tab === 'INACTIVE'
                ? 'Inactive'
                : 'Expired';
            const count = tabCounts[tab];

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#5E1224] text-white border-[#5E1224] shadow-xs'
                    : 'bg-white hover:bg-[#FAF6F0] text-gray-700 border-[#E8DFD0]'
                }`}
              >
                <span>{label}</span>
                <span
                  className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search coupons by code or offer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#E8DFD0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Coupon Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="bg-white rounded-xl border border-[#E8DFD0] p-4 shadow-xs animate-pulse space-y-3"
            >
              <div className="flex justify-between items-center">
                <div className="h-4 w-16 bg-gray-200 rounded-full"></div>
                <div className="h-3 w-24 bg-gray-100 rounded"></div>
              </div>
              <div className="h-16 bg-[#FAF6F0] rounded-lg border border-dashed border-[#E8DFD0]"></div>
              <div className="flex gap-3">
                <div className="h-3 w-20 bg-gray-200 rounded"></div>
                <div className="h-3 w-24 bg-gray-200 rounded"></div>
              </div>
              <div className="flex gap-2 pt-1">
                <div className="h-7 flex-1 bg-gray-200 rounded-lg"></div>
                <div className="h-7 flex-1 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-white rounded-xl border border-rose-200 shadow-xs space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <p className="text-sm font-semibold text-gray-900">{error}</p>
          <button
            onClick={loadCoupons}
            className="px-4 py-2 bg-[#5E1224] text-white text-xs font-semibold rounded-lg hover:bg-[#4A0E1C]"
          >
            Retry
          </button>
        </div>
      ) : filteredCoupons.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-[#E8DFD0] shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#FAF6F0] border border-[#E8DFD0] flex items-center justify-center mx-auto text-[#5E1224]">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-base text-gray-900">
              {searchQuery ? 'No coupons matched your search' : 'No coupons found'}
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `No coupon matches "${searchQuery}". Try searching for another code or reset your filter.`
                : 'Get started by creating your first promotional coupon for your boutique shoppers.'}
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#5E1224] text-white text-xs font-semibold rounded-lg hover:bg-[#4A0E1C]"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Coupon</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredCoupons.map((coupon) => {
            const isPercent = coupon.type === 'PERCENT';
            const isActionLoading = actionLoadingId === coupon.id;
            const isLimitReached =
              coupon.status === 'EXPIRED' &&
              coupon.usage_limit !== null &&
              (coupon.used_count || 0) >= coupon.usage_limit;

            return (
              <div
                key={coupon.id}
                className="bg-white rounded-xl border border-[#E8DFD0] p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between relative group"
              >
                <div>
                  {/* Card Header: Status Badge + Context Label */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Status Pill */}
                    {coupon.status === 'ACTIVE' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                        Active
                      </span>
                    ) : coupon.status === 'EXPIRED' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                        Expired
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                        Inactive
                      </span>
                    )}

                    {/* Offer Context Tag */}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {isPercent ? 'Percentage Off' : 'Flat Cash Discount'}
                    </span>
                  </div>

                  {/* Ticket Cutout Box matching Option 2 design */}
                  <div className="my-2.5 rounded-lg border border-dashed border-[#DFC4A0] bg-[#FCF9F5] px-3.5 py-2.5 sm:py-3 relative overflow-hidden flex items-center justify-between shadow-xs">
                    {/* Subtle boutique floral watermark decoration in background */}
                    <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none text-[#5E1224] transform translate-x-2 translate-y-2">
                      <svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C12 2 13.5 6.5 16 8C18.5 9.5 22 10 22 10C22 10 18.5 12 17 14.5C15.5 17 15 20.5 15 20.5C15 20.5 13.5 17 12 16C10.5 17 9 20.5 9 20.5C9 20.5 8.5 17 7 14.5C5.5 12 2 10 2 10C2 10 5.5 9.5 8 8C10.5 6.5 12 2 12 2Z" />
                      </svg>
                    </div>

                    {/* Left: Coupon Code */}
                    <div className="relative z-10 pr-2">
                      <span className="font-serif text-base sm:text-lg font-bold text-gray-900 tracking-wider">
                        {coupon.code}
                      </span>
                    </div>

                    {/* Center separator line */}
                    <div className="h-8 w-px border-r border-dashed border-[#DFC4A0] hidden sm:block"></div>

                    {/* Right: Discount display */}
                    <div className="relative z-10 text-right pl-2">
                      <div className="font-serif text-sm sm:text-base font-bold text-[#5E1224]">
                        {isPercent
                          ? `${Number(coupon.value)}% OFF`
                          : `Rs ${Math.round(coupon.value).toLocaleString('en-IN')} OFF`}
                      </div>
                      <div className="text-[10px] text-gray-500 font-medium">on your order</div>
                    </div>
                  </div>

                  {/* Metadata Row: Minimum Order, Validity Dates, Usage redemptions */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-0.5 pb-2 text-[11px] text-gray-600 font-medium">
                    {/* Minimum Order */}
                    <div className="flex items-center gap-1.5" title="Minimum cart order value required">
                      <ShoppingBag className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">
                        {coupon.min_order_value && coupon.min_order_value > 0
                          ? `Min: Rs ${Math.round(coupon.min_order_value).toLocaleString('en-IN')}`
                          : 'No Minimum'}
                      </span>
                    </div>

                    {/* Validity Dates */}
                    <div
                      className="flex items-center gap-1.5"
                      title={formatValidityDates(coupon.valid_from, coupon.valid_until)}
                    >
                      <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">
                        {formatValidityDates(coupon.valid_from, coupon.valid_until)}
                      </span>
                    </div>

                    {/* Usage / Limit */}
                    <div className="flex items-center gap-1.5" title="Redemptions used vs total limit">
                      <BarChart3 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">
                        Usage: {coupon.used_count || 0}
                        {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ' (Unlim.)'}
                      </span>
                    </div>
                  </div>

                  {/* Expired Reason Banner to guide the admin */}
                  {coupon.status === 'EXPIRED' && (
                    <div className="mb-2 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-md text-[10px] text-amber-900 font-medium flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <span className="truncate">
                        {isLimitReached
                          ? `Limit of ${coupon.usage_limit} reached. Increase limit to reactivate.`
                          : 'Validity ended. Extend end date to reactivate.'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer: Edit, Activate/Deactivate/Extend, Delete */}
                <div className="pt-2.5 border-t border-gray-100 flex items-center gap-2">
                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(coupon)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  {/* Contextual Action Button based on status */}
                  {coupon.status === 'EXPIRED' ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenEdit(coupon);
                        showToast(
                          isLimitReached
                            ? `Increase usage limit to reactivate ${coupon.code}.`
                            : `Extend validity end date to reactivate ${coupon.code}.`,
                          'error'
                        );
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-semibold rounded-lg transition-colors"
                      title="Edit dates or limit to reactivate"
                    >
                      {isLimitReached ? (
                        <>
                          <BarChart3 className="w-3.5 h-3.5 text-amber-700" />
                          <span>Increase Limit</span>
                        </>
                      ) : (
                        <>
                          <Calendar className="w-3.5 h-3.5 text-amber-700" />
                          <span>Extend Dates</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleToggleActive(coupon)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#5E1224] hover:bg-[#4A0E1C] active:bg-[#3D0B17] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
                    >
                      {isActionLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Power className="w-3.5 h-3.5" />
                      )}
                      <span>{coupon.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</span>
                    </button>
                  )}

                  {/* Delete Button with clear accessible label and title */}
                  <button
                    type="button"
                    aria-label={`Delete coupon ${coupon.code}`}
                    title={`Delete coupon ${coupon.code}`}
                    onClick={() => setCouponToDelete(coupon)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-Over Drawer: Create / Edit Coupon matching Option 2 visual */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[60] overflow-hidden" data-testid="coupon-drawer">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={handleCloseDrawer}
          />

          {/* Side Drawer Panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10 z-[60]">
            <div className="w-full sm:w-[440px] bg-white border-l border-[#E8DFD0] shadow-2xl flex flex-col justify-between h-full">
              {/* Drawer Header */}
              <div className="p-5 pb-3 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-xl font-bold text-gray-900">
                      {editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {editingCoupon
                        ? 'Update discount rules, order conditions, and limits.'
                        : 'Add a new discount coupon for your customers.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Decorative Mini Floral Divider */}
                <div className="relative mt-3 mb-1 flex items-center justify-center">
                  <div className="w-full border-t border-[#E8DFD0]"></div>
                  <div className="absolute px-2 bg-white text-[#B38E5D]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C12 2 13.5 6.5 16 8C18.5 9.5 22 10 22 10C22 10 18.5 12 17 14.5C15.5 17 15 20.5 15 20.5C15 20.5 13.5 17 12 16C10.5 17 9 20.5 9 20.5C9 20.5 8.5 17 7 14.5C5.5 12 2 10 2 10C2 10 5.5 9.5 8 8C10.5 6.5 12 2 12 2Z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Drawer Form Body */}
              <form id="coupon-form" onSubmit={handleSaveCoupon} className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* Form Error Banner */}
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div>{formError}</div>
                  </div>
                )}

                {/* Expired Coupon Renewal Guidance Banner */}
                {editingCoupon?.status === 'EXPIRED' && !formError && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold">This coupon is currently expired.</p>
                      <p className="text-[11px] text-amber-800 leading-normal">
                        To make it usable at checkout, update the <strong>Validity End Date</strong> to a future date
                        {editingCoupon.usage_limit && (editingCoupon.used_count || 0) >= editingCoupon.usage_limit
                          ? ' and increase or clear the Usage Limit'
                          : ''}.
                      </p>
                    </div>
                  </div>
                )}

                {/* 1. Coupon Code */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Coupon Code <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WELCOME10"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                    className="w-full px-3.5 py-2 text-xs font-mono font-bold tracking-wider uppercase bg-white rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Customers enter this code at checkout. Uppercase letters, numbers, and hyphens only.
                  </p>
                </div>

                {/* 2. Discount Type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Discount Type <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as 'PERCENT' | 'FLAT')}
                    className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
                  >
                    <option value="PERCENT">Percentage Discount (%)</option>
                    <option value="FLAT">Fixed Amount Discount (₹)</option>
                  </select>
                </div>

                {/* 3. Discount Value */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Discount Value <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={1}
                      max={formType === 'PERCENT' ? 100 : 50000}
                      step={formType === 'PERCENT' ? '1' : '10'}
                      placeholder={formType === 'PERCENT' ? 'e.g. 10' : 'e.g. 100'}
                      value={formValue}
                      onChange={(e) => setFormValue(e.target.value)}
                      className="w-full pl-3.5 pr-8 py-2 text-xs bg-white rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-xs pointer-events-none">
                      {formType === 'PERCENT' ? '%' : '₹'}
                    </div>
                  </div>
                </div>

                {/* 4. Minimum Order Amount */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Minimum Order Amount <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-xs pointer-events-none">
                      Rs
                    </div>
                    <input
                      type="number"
                      required
                      min={0}
                      step={50}
                      placeholder="e.g. 1,000"
                      value={formMinOrder}
                      onChange={(e) => setFormMinOrder(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Minimum cart subtotal before this coupon becomes eligible.
                  </p>
                </div>

                {/* 5. Usage Limit (Optional) */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-xs font-semibold text-gray-800">
                      Usage Limit (Optional)
                    </label>
                    <span
                      title="Maximum total redemptions across all customers. Leave empty for unlimited."
                      className="text-gray-400 hover:text-gray-600 cursor-help"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 500"
                    value={formUsageLimit}
                    onChange={(e) => setFormUsageLimit(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-white rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Leave blank to allow unlimited coupon redemptions.
                  </p>
                </div>

                {/* 6. Validity Date Range */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Validity <span className="text-rose-600">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div className="relative">
                      <input
                        type="date"
                        value={formValidFrom}
                        onChange={(e) => setFormValidFrom(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs bg-white rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="date"
                        value={formValidUntil}
                        onChange={(e) => setFormValidUntil(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs bg-white rounded-lg border border-gray-300 focus:outline-none focus:border-[#5E1224]"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Start Date – End Date (coupon expires automatically at end of validity).
                  </p>
                </div>

                {/* 7. Active Status Toggle */}
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="w-4 h-4 text-[#5E1224] rounded border-gray-300 focus:ring-[#5E1224]"
                    />
                    <span className="text-xs font-medium text-gray-700">
                      Enable this coupon immediately upon saving
                    </span>
                  </label>
                </div>
              </form>

              {/* Drawer Footer Action Buttons */}
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  className="flex-1 py-2.5 px-4 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-xs font-semibold text-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="coupon-form"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-[#5E1224] hover:bg-[#4A0E1C] active:bg-[#3D0B17] text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingCoupon ? 'Update Coupon' : 'Save Coupon'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {couponToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center">
              <h3 className="font-serif font-bold text-base text-gray-900">
                Delete Coupon {couponToDelete.code}?
              </h3>
              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete coupon <strong className="text-gray-900 font-semibold">{couponToDelete.code}</strong>?
                {couponToDelete.used_count && couponToDelete.used_count > 0 ? (
                  <span className="block mt-1 text-gray-700">This coupon has been redeemed <strong>{couponToDelete.used_count} time(s)</strong> by shoppers.</span>
                ) : null}
                <span className="block mt-1.5 text-rose-600 font-medium">This action cannot be undone.</span>
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCouponToDelete(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteConfirm}
                className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
