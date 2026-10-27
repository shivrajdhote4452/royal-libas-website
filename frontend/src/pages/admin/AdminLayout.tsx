import React, { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Boxes,
  Tag,
  Settings,
  LogOut,
  ExternalLink,
} from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('royal_libas_admin_token');

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
    }
  }, [token, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('royal_libas_admin_token');
    navigate('/admin/login');
  };

  const navItems = [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/orders', label: 'Orders', icon: Package },
    { to: '/admin/products', label: 'Products', icon: ShoppingBag },
    { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
    { to: '/admin/customers', label: 'Customers', icon: Users },
    { to: '/admin/coupons', label: 'Coupons', icon: Tag },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-gray-900 flex font-sans">
      {/* ========================================================
          DESKTOP DARK MAROON SIDEBAR (PDF Page 12 & 13)
          ======================================================== */}
      <aside className="hidden lg:flex w-64 bg-[#3A080F] text-white flex-col justify-between shrink-0 fixed inset-y-0 left-0 z-30 shadow-xl border-r border-[#5B111A]">
        <div>
          {/* Brand Header */}
          <div className="p-6 border-b border-[#5B111A]">
            <Link to="/admin/dashboard" className="block">
              <span className="font-serif text-xl font-bold tracking-tight text-white block">
                ROYAL LIBAS
              </span>
              <span className="text-[10px] uppercase tracking-[0.25em] text-[#C59B27] font-medium block">
                by Tanya • Admin
              </span>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1.5 font-ui">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[#5B111A] text-[#EAD186] font-bold shadow-inner border-l-4 border-[#C59B27]'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 text-[#C59B27]" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Actions */}
        <div className="p-4 border-t border-[#5B111A] space-y-2">
          <Link
            to="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-[#C59B27]" />
            <span>View Storefront</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-red-300 hover:text-red-100 hover:bg-red-950/40 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ========================================================
          MAIN CONTENT AREA
          ======================================================== */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden bg-[#3A080F] text-white p-4 sticky top-0 z-30 flex items-center justify-between border-b border-[#5B111A]">
          <div>
            <span className="font-serif text-lg font-bold">Royal Libas</span>
            <span className="text-[10px] text-[#C59B27] block -mt-1 uppercase tracking-wider">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" target="_blank" className="text-xs text-[#EAD186]">
              View Store
            </Link>
            <button onClick={handleLogout} className="text-xs text-red-300">
              Logout
            </button>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* ========================================================
          MOBILE BOTTOM NAVIGATION (PDF Page 13)
          ======================================================== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#3A080F] border-t border-[#5B111A] z-40 px-2 py-1.5 shadow-2xl">
        <div className="flex justify-around items-center">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center py-1 px-2 rounded text-[10px] transition-colors ${
                    isActive ? 'text-[#EAD186] font-bold' : 'text-white/70 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
