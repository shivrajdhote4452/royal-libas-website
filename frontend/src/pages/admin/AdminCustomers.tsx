import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Phone,
  MessageCircle,
  Mail,
  Search,
  RefreshCw,
  FileText,
  X,
  ShoppingBag,
  RotateCcw,
  Send,
} from 'lucide-react';
import {
  fetchAdminCustomers,
  formatPrice,
  adminGetCustomerDetail,
  adminListInquiries,
  adminReplyInquiry,
} from '../../lib/api';
import { AdminCustomerResponse } from '../../types/order';

interface CustomerDetail {
  name: string;
  phone: string;
  total_orders: number;
  cancelled_orders: number;
  total_spent: number;
  orders: {
    id: number;
    order_code: string;
    status: string;
    payment_method: string;
    payment_status: string;
    total: number;
    created_at: string;
    items_count: number;
  }[];
  returns: {
    id: number;
    return_code: string;
    request_type: string;
    status: string;
    reason: string;
    created_at: string;
  }[];
  inquiries: {
    id: number;
    message: string;
    status: string;
    created_at: string;
  }[];
}

interface InquiryDetail {
  id: number;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  status: string;
  admin_reply?: string;
  responded_at?: string;
  created_at: string;
}

export const AdminCustomers: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const [activeTab, setActiveTab] = useState<'directory' | 'inbox'>('directory');

  // Customer List State
  const [customers, setCustomers] = useState<AdminCustomerResponse[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // Customer Dossier Modal State
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [customerDossier, setCustomerDossier] = useState<CustomerDetail | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

  // Support Inbox State
  const [inquiries, setInquiries] = useState<InquiryDetail[]>([]);
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState('ALL');
  const [loadingInquiries, setLoadingInquiries] = useState(false);

  // Reply Modal State
  const [replyingInquiry, setReplyingInquiry] = useState<InquiryDetail | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const res = await fetchAdminCustomers(token);
      setCustomers(res);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load customers' });
    } finally {
      setLoadingCustomers(false);
    }
  };

  const loadInquiries = async () => {
    setLoadingInquiries(true);
    try {
      const res = await adminListInquiries(token, inquiryStatusFilter);
      setInquiries(res);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load support inbox' });
    } finally {
      setLoadingInquiries(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [token]);

  useEffect(() => {
    if (activeTab === 'inbox') {
      loadInquiries();
    }
  }, [activeTab, inquiryStatusFilter, token]);

  const handleOpenDossier = async (phone: string) => {
    setSelectedPhone(phone);
    setLoadingDossier(true);
    try {
      const dossier = await adminGetCustomerDetail(token, phone);
      setCustomerDossier(dossier);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to fetch customer profile' });
      setSelectedPhone(null);
    } finally {
      setLoadingDossier(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyingInquiry || !replyText.trim()) return;

    setSubmittingReply(true);
    try {
      await adminReplyInquiry(token, replyingInquiry.id, replyText.trim());
      setNotification({ type: 'success', message: `Reply recorded for ${replyingInquiry.name}` });
      setReplyingInquiry(null);
      setReplyText('');
      await loadInquiries();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to send reply' });
    } finally {
      setSubmittingReply(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch)
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <Users className="w-6 h-6 text-[#5E1224]" />
            Customers & Support Concierge
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Verified buyer history, order dossiers, and customer service message inbox.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-gray-200/80 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'directory'
                ? 'bg-white text-[#5E1224] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Clientele Roster ({customers.length})
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'inbox'
                ? 'bg-white text-[#5E1224] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Support Inbox
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================
          TAB 1: CLIENTELE ROSTER (DIRECTORY)
          ======================================================== */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by customer name or phone number..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            </div>
            <button
              onClick={loadCustomers}
              disabled={loadingCustomers}
              className="p-2 border border-[#E5D9C5] rounded-lg text-gray-600 hover:bg-[#FCF8F0] transition-colors"
              title="Refresh roster"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCustomers ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Cards Grid */}
          {loadingCustomers ? (
            <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
              <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
              Loading customer profiles...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
              <Users className="w-8 h-8 text-gray-300" />
              No customers found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map((c) => (
                <div
                  key={c.phone}
                  className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm hover:border-[#5E1224]/50 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-serif font-bold text-sm text-gray-900">{c.name}</h3>
                        <p className="text-[11px] text-gray-500 font-mono mt-0.5">+91 {c.phone}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FCF8F0] border border-[#E5D9C5] text-[#5E1224]">
                        {c.order_count} {c.order_count === 1 ? 'order' : 'orders'}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-gray-400 block font-medium">Total Spent</span>
                        <span className="font-bold text-gray-900">{formatPrice(c.total_spent)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 block font-medium">Last Active</span>
                        <span className="text-gray-700 text-[11px]">
                          {new Date(c.last_order_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenDossier(c.phone)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-[#5E1224] bg-[#FCF8F0] border border-[#E5D9C5] rounded hover:bg-[#F3EAD7] transition-colors flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" /> View Dossier
                    </button>

                    <div className="flex items-center gap-1">
                      <a
                        href={`https://wa.me/91${c.phone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(
                          c.name
                        )},%20this%20is%20Royal%20Libas%20Concierge.`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        title="WhatsApp Concierge"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href={`tel:+91${c.phone.replace(/\D/g, '')}`}
                        className="p-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        title="Call Customer"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 2: SUPPORT INBOX
          ======================================================== */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-600">Filter Inquiries:</span>
              <select
                value={inquiryStatusFilter}
                onChange={(e) => setInquiryStatusFilter(e.target.value)}
                className="px-3 py-1 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
              >
                <option value="ALL">All Messages</option>
                <option value="NEW">New (Unresponded)</option>
                <option value="RESPONDED">Responded</option>
              </select>
            </div>
            <button
              onClick={loadInquiries}
              disabled={loadingInquiries}
              className="p-2 border border-[#E5D9C5] rounded-lg text-gray-600 hover:bg-[#FCF8F0] transition-colors"
              title="Refresh inbox"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingInquiries ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingInquiries ? (
            <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
              <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
              Loading support messages...
            </div>
          ) : inquiries.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
              <Mail className="w-8 h-8 text-gray-300" />
              No support inquiries found in this inbox.
            </div>
          ) : (
            <div className="space-y-3">
              {inquiries.map((inq) => (
                <div
                  key={inq.id}
                  className="bg-white p-4 rounded-xl border border-[#E5D9C5]/80 shadow-sm hover:border-[#5E1224]/40 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-sm">{inq.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inq.status === 'RESPONDED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inq.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-gray-400" /> {inq.email}
                        </span>
                        {inq.phone && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-gray-400" /> +91 {inq.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400">
                        {new Date(inq.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="py-3 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {inq.message}
                  </div>

                  {inq.admin_reply && (
                    <div className="mt-2 p-3 bg-[#FCF8F0] border-l-4 border-[#B58A3C] rounded text-xs text-gray-800">
                      <div className="font-semibold text-[#5E1224] text-[11px] mb-1">
                        Staff Reply ({inq.responded_at ? new Date(inq.responded_at).toLocaleDateString() : 'Recorded'}):
                      </div>
                      <div className="whitespace-pre-wrap">{inq.admin_reply}</div>
                    </div>
                  )}

                  <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setReplyingInquiry(inq);
                        setReplyText(inq.admin_reply || '');
                      }}
                      className="px-3 py-1 bg-[#5E1224] text-white rounded text-xs font-semibold hover:bg-[#4A0E1C] transition-colors flex items-center gap-1.5"
                    >
                      <Send className="w-3 h-3" />
                      {inq.admin_reply ? 'Update Reply' : 'Record Reply'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Customer Dossier Modal */}
      {selectedPhone && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-[#E5D9C5] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-[#FCF8F0]">
              <h3 className="text-base font-serif font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-[#5E1224]" />
                Customer Dossier: {customerDossier?.name || 'Loading...'}
              </h3>
              <button
                onClick={() => {
                  setSelectedPhone(null);
                  setCustomerDossier(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 text-xs flex-1">
              {loadingDossier ? (
                <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
                  Compiling verified records...
                </div>
              ) : customerDossier ? (
                <>
                  {/* Top Summary Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-[10px] text-gray-500 font-medium">TOTAL ORDERS</div>
                      <div className="text-base font-bold text-gray-900 mt-0.5">
                        {customerDossier.total_orders}
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                      <div className="text-[10px] text-emerald-700 font-medium">LIFETIME SPENT</div>
                      <div className="text-base font-bold text-emerald-900 mt-0.5">
                        ₹{customerDossier.total_spent.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="bg-rose-50 p-3 rounded-lg border border-rose-200">
                      <div className="text-[10px] text-rose-700 font-medium">CANCELLED ORDERS</div>
                      <div className="text-base font-bold text-rose-900 mt-0.5">
                        {customerDossier.cancelled_orders}
                      </div>
                    </div>
                  </div>

                  {/* Order History */}
                  <div>
                    <h4 className="font-serif font-bold text-gray-900 text-sm mb-2 flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-[#B58A3C]" />
                      Order History ({customerDossier.orders.length})
                    </h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#FCF8F0] border-b border-gray-200 text-gray-600 font-semibold text-[10px] uppercase">
                          <tr>
                            <th className="py-2 px-3">Order</th>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">Payment</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {customerDossier.orders.map((o) => (
                            <tr key={o.id} className="hover:bg-amber-50/20">
                              <td className="py-2 px-3">
                                <Link
                                  to={`/admin/orders/${o.id}`}
                                  className="font-mono font-bold text-[#5E1224] hover:underline"
                                >
                                  #{o.order_code}
                                </Link>
                              </td>
                              <td className="py-2 px-3 text-gray-500">
                                {new Date(o.created_at).toLocaleDateString()}
                              </td>
                              <td className="py-2 px-3">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-800">
                                  {o.status}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span className="text-[10px] text-gray-600">
                                  {o.payment_method} ({o.payment_status})
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                ₹{o.total.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Returns History */}
                  {customerDossier.returns.length > 0 && (
                    <div>
                      <h4 className="font-serif font-bold text-gray-900 text-sm mb-2 flex items-center gap-1.5">
                        <RotateCcw className="w-4 h-4 text-purple-700" />
                        Returns & Exchanges ({customerDossier.returns.length})
                      </h4>
                      <div className="space-y-1.5">
                        {customerDossier.returns.map((r) => (
                          <div
                            key={r.id}
                            className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-mono font-bold text-purple-800">#{r.return_code}</span>
                              <span className="text-gray-600 ml-2">Reason: {r.reason}</span>
                            </div>
                            <span className="font-bold text-[10px] px-2 py-0.5 rounded bg-white border border-gray-200">
                              {r.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Support Inbox Reply Modal */}
      {replyingInquiry && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-[#E5D9C5] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-[#5E1224]" />
                Reply to {replyingInquiry.name}
              </h3>
              <button onClick={() => setReplyingInquiry(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReplySubmit} className="mt-4 space-y-3 text-xs">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-gray-700">
                <div className="font-semibold text-gray-900 mb-1">Customer Message:</div>
                <div className="italic">{replyingInquiry.message}</div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Concierge Response Note <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Record what was communicated to the customer or reply note..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplyingInquiry(null)}
                  className="px-3 py-1.5 font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReply}
                  className="px-4 py-1.5 bg-[#5E1224] text-white font-semibold rounded-lg hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  {submittingReply ? 'Saving...' : 'Save Reply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
