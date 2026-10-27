import React, { useEffect, useState } from 'react';
import { Users, Phone, MessageCircle, Loader2 } from 'lucide-react';
import { fetchAdminCustomers, formatPrice } from '../../lib/api';
import { AdminCustomerResponse } from '../../types/order';

export const AdminCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<AdminCustomerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminCustomers(token);
      setCustomers(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load customer list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-xs uppercase tracking-widest font-bold text-[#B58A3C]">
            Clientele Roster
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
            Registered Buyers
          </h1>
        </div>
        <span className="text-xs text-gray-500 font-medium">
          {customers.length} {customers.length === 1 ? 'buyer' : 'buyers'} recorded
        </span>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#5E1224] animate-spin" />
          <p className="text-xs text-gray-500 font-serif">Loading boutique clientele...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
          <p className="text-xs sm:text-sm text-red-800 font-semibold">{error}</p>
          <button
            onClick={loadCustomers}
            className="px-4 py-2 bg-[#5E1224] text-white rounded text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white p-10 rounded-xl border border-[#E8DFD0] text-center space-y-2">
          <Users className="w-10 h-10 text-gray-400 mx-auto" />
          <h3 className="font-serif font-bold text-gray-900 text-base">No customers yet</h3>
          <p className="text-xs text-gray-500">
            Customer profiles appear automatically when orders are placed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customers.map((c) => (
            <div
              key={c.phone}
              className="bg-white p-5 rounded-xl border border-[#E8DFD0] shadow-sm flex flex-col justify-between space-y-3 hover:border-[#5E1224]/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-serif font-bold text-base text-gray-900">
                    {c.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">+91 {c.phone}</p>
                </div>

                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#FCF8F0] border border-[#E8DFD0] text-[#5E1224]">
                  {c.order_count} {c.order_count === 1 ? 'order' : 'orders'}
                </span>
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <div>
                  <span className="text-[11px] text-gray-400 block">Total Spent</span>
                  <span className="font-bold text-gray-900">{formatPrice(c.total_spent)}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 block">Last Active</span>
                  <span className="font-medium text-gray-700">
                    {new Date(c.last_order_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>

                {/* Direct Action */}
                <div className="flex items-center gap-1.5">
                  <a
                    href={`https://wa.me/91${c.phone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(
                      c.name
                    )},%20this%20is%20Tanya%20from%20Royal%20Libas.`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                    title="Send WhatsApp message"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>

                  <a
                    href={`tel:+91${c.phone.replace(/\D/g, '')}`}
                    className="p-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                    title="Call customer"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
