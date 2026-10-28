import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  ExternalLink,
  X,
  FileCheck,
} from 'lucide-react';
import { adminListPayments, adminSyncPayment, adminCollectCOD, formatPrice } from '../../lib/api';

interface PaymentRecord {
  order_id: number;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  amount: number | string;
  payment_method: string;
  payment_status: string;
  cashfree_order_id?: string;
  order_status: string;
  created_at: string;
  is_reconciled: boolean;
}

export const AdminPayments: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'ALL';

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Reconcile loading states
  const [syncingOrderCode, setSyncingOrderCode] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ code: string; success: boolean; message: string } | null>(null);

  // Record COD modal state
  const [codModalOrder, setCodModalOrder] = useState<PaymentRecord | null>(null);
  const [codNote, setCodNote] = useState<string>('');
  const [isRecordingCOD, setIsRecordingCOD] = useState<boolean>(false);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadPayments = async () => {
    setLoading(true);
    try {
      const data = await adminListPayments(token, selectedStatus, selectedMethod, searchQuery);
      setPayments(data);
    } catch (e) {
      console.error('Failed to load payments', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [token, selectedStatus, selectedMethod]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPayments();
  };

  const handleReconcile = async (orderCode: string) => {
    setSyncingOrderCode(orderCode);
    setSyncFeedback(null);
    try {
      const result = await adminSyncPayment(token, orderCode);
      setSyncFeedback({
        code: orderCode,
        success: result.is_paid || result.payment_status === 'PAID',
        message: result.message || `Status: ${result.payment_status}`,
      });
      // Refresh list
      loadPayments();
    } catch (err: any) {
      setSyncFeedback({
        code: orderCode,
        success: false,
        message: err.message || 'Reconciliation failed',
      });
    } finally {
      setSyncingOrderCode(null);
    }
  };

  const handleConfirmCOD = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codModalOrder) return;

    setIsRecordingCOD(true);
    try {
      await adminCollectCOD(token, codModalOrder.order_id, codNote.trim() || undefined);
      setCodModalOrder(null);
      loadPayments();
    } catch (err: any) {
      alert(err.message || 'Failed to record COD collection');
    } finally {
      setIsRecordingCOD(false);
    }
  };

  const totalPrepaidPaid = payments
    .filter((p) => p.payment_method === 'PREPAID' && p.payment_status === 'PAID')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalCODPending = payments
    .filter((p) => p.payment_method === 'COD' && p.payment_status !== 'PAID' && p.order_status !== 'CANCELLED')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalCODCollected = payments
    .filter((p) => p.payment_method === 'COD' && p.payment_status === 'PAID')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#B58A3C]/20">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-[#5E1224]" />
            <h1 className="font-serif text-2xl font-bold text-[#5E1224]">Payments & Gateway Ledger</h1>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Reconcile Cashfree transactions, manage pending COD receipts, and audit realized revenue.
          </p>
        </div>
        <button
          onClick={loadPayments}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#B58A3C]/30 text-[#5E1224] hover:bg-[#FCF8F0] text-xs font-semibold rounded shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border-l-4 border-emerald-600 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
            Prepaid Paid (Settled via Gateway)
          </span>
          <span className="text-2xl font-serif font-bold text-gray-900 mt-1 block">
            ₹ {totalPrepaidPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Verified HMAC signatures from Cashfree payment gateway.
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border-l-4 border-amber-500 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
            COD Awaiting Collection
          </span>
          <span className="text-2xl font-serif font-bold text-amber-700 mt-1 block">
            ₹ {totalCODPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Deliveries in transit. Not recognized as realized revenue.
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border-l-4 border-blue-600 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">
            COD Cash Collected & Confirmed
          </span>
          <span className="text-2xl font-serif font-bold text-blue-900 mt-1 block">
            ₹ {totalCODCollected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Confirmed collected by boutique logistics or courier partner.
          </p>
        </div>
      </div>

      {syncFeedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
            syncFeedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 shrink-0" />
            <span>
              <strong>{syncFeedback.code}:</strong> {syncFeedback.message}
            </span>
          </div>
          <button onClick={() => setSyncFeedback(null)} className="hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="flex-1 w-full sm:w-auto flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by order code, Cashfree order ID, customer, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[#5E1224] text-white hover:bg-[#4A0E1C] rounded text-xs font-semibold"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Method:</span>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="border border-gray-300 rounded px-2.5 py-1 text-xs bg-white"
            >
              <option value="ALL">All Methods</option>
              <option value="PREPAID">Prepaid</option>
              <option value="COD">Cash on Delivery (COD)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">State:</span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setSearchParams(e.target.value === 'ALL' ? {} : { status: e.target.value });
              }}
              className="border border-gray-300 rounded px-2.5 py-1 text-xs bg-white"
            >
              <option value="ALL">All States</option>
              <option value="PAID">Paid Only</option>
              <option value="PENDING">Pending Only</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500">Loading payment ledger...</p>
        </div>
      ) : payments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400 text-xs">
          No payment transactions found matching these filters.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-[#FCF8F0] border-b border-gray-200 text-gray-600 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Order Reference</th>
                  <th className="py-3 px-4">Customer Details</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Method & Gateway Ref</th>
                  <th className="py-3 px-4">Payment State</th>
                  <th className="py-3 px-4">Order State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => {
                  const isPrepaid = p.payment_method === 'PREPAID';
                  const isPaid = p.payment_status === 'PAID';

                  return (
                    <tr key={p.order_id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#5E1224]">
                        <Link to={`/admin/orders/${p.order_id}`} className="hover:underline">
                          {p.order_code}
                        </Link>
                        <span className="block text-[10px] text-gray-400 font-sans mt-0.5">
                          {new Date(p.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{p.customer_name}</div>
                        <div className="text-[11px] font-mono text-gray-500">{p.customer_phone}</div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-gray-900 text-sm">
                        {formatPrice(p.amount as any)}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-gray-800">{p.payment_method}</span>
                        {p.cashfree_order_id && (
                          <span className="block font-mono text-[10px] text-gray-500 mt-0.5">
                            CF: {p.cashfree_order_id}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.payment_status === 'FAILED'
                              ? 'bg-red-100 text-red-800'
                              : p.payment_status === 'REFUNDED'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.payment_status}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.order_status === 'DELIVERED'
                              ? 'bg-emerald-50 text-emerald-800'
                              : p.order_status === 'CANCELLED'
                              ? 'bg-red-50 text-red-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {p.order_status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {isPrepaid && (
                            <button
                              type="button"
                              disabled={syncingOrderCode === p.order_code}
                              onClick={() => handleReconcile(p.order_code)}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded text-[11px] font-semibold inline-flex items-center gap-1"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${syncingOrderCode === p.order_code ? 'animate-spin' : ''}`}
                              />
                              <span>Reconcile</span>
                            </button>
                          )}

                          {!isPrepaid && !isPaid && p.order_status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setCodModalOrder(p);
                                setCodNote('');
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold"
                            >
                              Collect Cash
                            </button>
                          )}

                          <Link
                            to={`/admin/orders/${p.order_id}`}
                            className="p-1 text-gray-400 hover:text-gray-700"
                            title="Inspect order details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record COD Collection Modal */}
      {codModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCOD}
            className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-200"
          >
            <div className="flex items-center gap-3 text-emerald-700">
              <CheckCircle2 className="w-6 h-6" />
              <h3 className="text-base font-serif font-bold text-gray-900">
                Record COD Cash Collection
              </h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Confirm receipt of <strong>{formatPrice(codModalOrder.amount as any)}</strong> for order{' '}
              <strong>{codModalOrder.order_code}</strong>. This marks payment status as <strong>PAID</strong> and
              settles the pending COD ledger amount.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Receipt Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Courier settlement batch #2026-OCT-10"
                value={codNote}
                onChange={(e) => setCodNote(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#5E1224]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCodModalOrder(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRecordingCOD}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold"
              >
                {isRecordingCOD ? 'Recording...' : 'Confirm Paid'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
