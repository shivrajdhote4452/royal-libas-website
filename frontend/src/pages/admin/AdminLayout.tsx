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
  Layers,
  BarChart3,
} from 'lucide-react';
import { BrandLogo } from '../../components/BrandLogo';

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
    { to: '/admin/collections', label: 'Collections', icon: Layers },
    { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
    { to: '/admin/customers', label: 'Customers', icon: Users },
    { to: '/admin/coupons', label: 'Coupons', icon: Tag },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
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
          <div className="p-5 border-b border-[#5B111A]">
            <Link to="/admin/dashboard" className="block text-center hover:opacity-95 transition-opacity" aria-label="Royal Libas Admin Dashboard">
              <BrandLogo variant="white" layout="compact" emblemSize={28} />
              <span className="text-[9px] uppercase tracking-[0.25em] text-[#C59B27] font-semibold block mt-1.5">
                Admin Panel
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
        <header className="lg:hidden bg-[#3A080F] text-white p-3.5 sticky top-0 z-30 flex items-center justify-between border-b border-[#5B111A]">
          <Link to="/admin/dashboard" className="flex items-center gap-2">
            <BrandLogo variant="white" layout="horizontal" emblemSize={26} showTagline={false} />
            <span className="text-[9px] text-[#C59B27] uppercase tracking-wider font-semibold border-l border-[#5B111A] pl-2">Admin</span>
          </Link>
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
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#3A080F] border-t border-[#5B111A] z-40 px-2 py-1.5 shadow-2xl overflow-x-auto no-scrollbar">
        <div className="flex items-center min-w-max mx-auto px-1 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center py-1 px-2.5 rounded text-[10px] transition-colors shrink-0 ${
                    isActive ? 'text-[#EAD186] font-bold bg-white/10' : 'text-white/70 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 mb-0.5 text-[#C59B27]" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
