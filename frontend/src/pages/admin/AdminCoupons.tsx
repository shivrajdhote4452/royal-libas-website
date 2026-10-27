import React, { useState } from 'react';
import { Tag, Plus } from 'lucide-react';

interface PromoCoupon {
  id: number;
  code: string;
  type: 'PERCENTAGE' | 'FLAT';
  value: number;
  min_order_value: number;
  status: 'ACTIVE' | 'EXPIRED';
  usage_count: number;
}

export const AdminCoupons: React.FC = () => {
  const [coupons, setCoupons] = useState<PromoCoupon[]>([
    { id: 1, code: 'WELCOME10', type: 'PERCENTAGE', value: 10, min_order_value: 1500, status: 'ACTIVE', usage_count: 24 },
    { id: 2, code: 'FESTIVE100', type: 'FLAT', value: 100, min_order_value: 1000, status: 'ACTIVE', usage_count: 58 },
    { id: 3, code: 'ROYAL10', type: 'PERCENTAGE', value: 10, min_order_value: 2000, status: 'ACTIVE', usage_count: 12 },
    { id: 4, code: 'FESTIVE200', type: 'FLAT', value: 200, min_order_value: 2500, status: 'ACTIVE', usage_count: 9 },
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [newValue, setNewValue] = useState<number>(10);
  const [newMinOrder, setNewMinOrder] = useState<number>(1500);

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    const created: PromoCoupon = {
      id: Date.now(),
      code: newCode.trim().toUpperCase(),
      type: newType,
      value: Number(newValue),
      min_order_value: Number(newMinOrder),
      status: 'ACTIVE',
      usage_count: 0,
    };
    setCoupons([created, ...coupons]);
    setShowCreateModal(false);
    setNewCode('');
  };

  const toggleStatus = (id: number) => {
    setCoupons((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: c.status === 'ACTIVE' ? 'EXPIRED' : 'ACTIVE' } : c
      )
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8DFD0]">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="w-6 h-6 text-[#5B111A]" />
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Coupon Management
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure boutique promotional discounts and cart vouchers
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#5B111A] hover:bg-[#3A080F] text-white text-xs font-ui font-semibold rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create Coupon</span>
        </button>
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-2xl border border-[#E8DFD0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF7F2] text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
              <tr>
                <th className="p-3.5">Coupon Code</th>
                <th className="p-3.5">Discount Type</th>
                <th className="p-3.5">Value</th>
                <th className="p-3.5">Min Order</th>
                <th className="p-3.5">Usage</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-sm text-[#5B111A]">
                    {c.code}
                  </td>
                  <td className="p-3.5 text-gray-700">
                    {c.type === 'PERCENTAGE' ? 'Percentage Off' : 'Flat Cash Discount'}
                  </td>
                  <td className="p-3.5 font-bold text-gray-900">
                    {c.type === 'PERCENTAGE' ? `${c.value}%` : `₹${c.value}`}
                  </td>
                  <td className="p-3.5 text-gray-600">
                    ₹{c.min_order_value}
                  </td>
                  <td className="p-3.5 text-gray-500">
                    {c.usage_count} redemptions
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleStatus(c.id)}
                      className="text-xs font-semibold text-[#5B111A] hover:underline"
                    >
                      {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Coupon Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-serif font-bold text-lg text-gray-900">Create New Coupon</h3>
            <form onSubmit={handleCreateCoupon} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Coupon Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DIWALI15"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono uppercase rounded-lg border border-gray-300 focus:outline-none focus:border-[#5B111A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Discount Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:border-[#5B111A]"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FLAT">Flat (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Value</label>
                  <input
                    type="number"
                    required
                    value={newValue}
                    onChange={(e) => setNewValue(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:border-[#5B111A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Minimum Order Value (₹)</label>
                <input
                  type="number"
                  required
                  value={newMinOrder}
                  onChange={(e) => setNewMinOrder(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:border-[#5B111A]"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-[#5B111A] text-white text-xs font-semibold uppercase tracking-wider"
                >
                  Save Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
