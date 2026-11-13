import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  CreditCard,
  Truck,
  Boxes,
  Users,
  Image,
  Sparkles,
  Tag,
  BarChart3,
  Shield,
  ShieldAlert,
  FileText,
  Settings,
  LogOut,
  ExternalLink,
  Layers,
  Menu,
  X,
  User,
  ArrowRight,
} from 'lucide-react';
import { BrandLogo } from '../../components/BrandLogo';

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('royal_libas_admin_token');
  const [staffProfile, setStaffProfile] = useState<{ email: string; name?: string; role?: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }

    const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
    fetch(`${API_BASE_URL}/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('royal_libas_admin_token');
            navigate('/admin/login');
          }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setStaffProfile(data);
      })
      .catch(() => {});
  }, [token, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('royal_libas_admin_token');
    navigate('/admin/login');
  };

  const currentRole = (staffProfile?.role || 'OWNER').toUpperCase().trim();
  const isOwner = currentRole === 'OWNER';
  const isFulfillment = currentRole === 'FULFILLMENT_STAFF';
  const canViewActivity = isOwner || currentRole === 'STORE_MANAGER';

  // Automatically redirect fulfillment staff away from dashboard to orders
  useEffect(() => {
    if (staffProfile && isFulfillment) {
      const p = location.pathname.replace(/\/+$/, '');
      if (p === '/admin' || p === '/admin/dashboard') {
        navigate('/admin/orders', { replace: true });
      }
    }
  }, [staffProfile, isFulfillment, location.pathname, navigate]);

  // Role-filtered navigation sections
  const navSections = isFulfillment
    ? [
        {
          title: 'FULFILLMENT & DISPATCH',
          items: [
            { to: '/admin/orders', label: 'Orders', icon: Package },
            { to: '/admin/shipping', label: 'Shipping & Pickups', icon: Truck },
          ],
        },
      ]
    : [
        {
          title: 'OPERATIONS',
          items: [
            { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { to: '/admin/orders', label: 'Orders', icon: Package },
            { to: '/admin/payments', label: 'Payments', icon: CreditCard },
            { to: '/admin/shipping', label: 'Shipping & Pickups', icon: Truck },
          ],
        },
        {
          title: 'CATALOGUE & STOCK',
          items: [
            { to: '/admin/products', label: 'Products', icon: ShoppingBag },
            { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
            { to: '/admin/collections', label: 'Collections', icon: Layers },
            { to: '/admin/media', label: 'Media Library', icon: Image },
          ],
        },
        {
          title: 'CUSTOMER & CONTENT',
          items: [
            { to: '/admin/customers', label: 'Customers & Support', icon: Users },
            { to: '/admin/homepage', label: 'Homepage & CMS', icon: Sparkles },
            { to: '/admin/coupons', label: 'Coupons', icon: Tag },
            { to: '/admin/reports', label: 'Reports & Exports', icon: BarChart3 },
          ],
        },
        {
          title: 'MANAGEMENT',
          items: [
            ...(isOwner ? [{ to: '/admin/staff', label: 'Staff & Roles', icon: Shield }] : []),
            ...(canViewActivity ? [{ to: '/admin/activity', label: 'Activity Log', icon: FileText }] : []),
            { to: '/admin/settings', label: 'Store Settings', icon: Settings },
          ],
        },
      ];

  // Route-level permission check for direct navigation
  const checkRoutePermission = (): { allowed: boolean; reason?: string; redirectPath: string; redirectLabel: string } => {
    if (!staffProfile) return { allowed: true, redirectPath: '/admin/orders', redirectLabel: 'Orders' };
    const p = location.pathname.replace(/\/+$/, '');

    if (isFulfillment) {
      const isAllowed = p === '/admin/orders' || p.startsWith('/admin/orders/') || p === '/admin/shipping';
      if (!isAllowed) {
        return {
          allowed: false,
          reason: 'Your account is assigned the Fulfillment Staff role, with permissions focused on order packing, labeling, and shipping logistics. Customer directories, financials, catalogue management, and store settings are restricted.',
          redirectPath: '/admin/orders',
          redirectLabel: 'Go to Orders & Packing',
        };
      }
    }

    if (!isOwner && (p === '/admin/staff' || p.startsWith('/admin/staff/'))) {
      return {
        allowed: false,
        reason: 'Staff account and role management is reserved exclusively for the boutique Owner. If you need account changes or permission adjustments, please contact the store owner.',
        redirectPath: isFulfillment ? '/admin/orders' : '/admin/dashboard',
        redirectLabel: isFulfillment ? 'Go to Orders' : 'Return to Dashboard',
      };
    }

    if (!canViewActivity && (p === '/admin/activity' || p.startsWith('/admin/activity/'))) {
      return {
        allowed: false,
        reason: 'Activity audit logs are accessible only by Store Managers and the boutique Owner.',
        redirectPath: isFulfillment ? '/admin/orders' : '/admin/dashboard',
        redirectLabel: isFulfillment ? 'Go to Orders' : 'Return to Dashboard',
      };
    }

    return { allowed: true, redirectPath: '/admin/orders', redirectLabel: 'Orders' };
  };

  const routePerm = checkRoutePermission();
  const homePath = isFulfillment ? '/admin/orders' : '/admin/dashboard';

  return (
    <div className="min-h-screen bg-[#FCF8F0] text-gray-900 flex font-sans">
      {/* ========================================================
          DESKTOP LUXURY SIDEBAR
          ======================================================== */}
      <aside className="hidden lg:flex w-64 bg-[#5E1224] text-white flex-col justify-between shrink-0 fixed inset-y-0 left-0 z-30 shadow-2xl border-r border-[#4A0E1C] overflow-hidden">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Brand Header */}
          <div className="p-5 border-b border-[#4A0E1C]/80 shrink-0">
            <Link to={homePath} className="block text-center hover:opacity-95 transition-opacity" aria-label="Royal Libas Admin Dashboard">
              <BrandLogo variant="white" layout="compact" emblemSize={28} />
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <span className="text-[9px] uppercase tracking-[0.25em] text-[#B58A3C] font-semibold">
                  Admin Panel
                </span>
                {staffProfile?.role && (
                  <span className="text-[9px] bg-[#B58A3C]/20 text-[#E6C687] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                    {staffProfile.role}
                  </span>
                )}
              </div>
            </Link>
          </div>

          {/* Navigation Items (Scrollable) */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 custom-scrollbar">
            {navSections.map((sec) => (
              <div key={sec.title}>
                <div className="px-3 text-[10px] uppercase font-bold tracking-[0.2em] text-[#B58A3C]/70 mb-1.5">
                  {sec.title}
                </div>
                <nav className="space-y-0.5">
                  {sec.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3.5 py-2 text-xs font-medium transition-all ${
                            isActive
                              ? 'bg-[#4A0E1C] text-[#B58A3C] font-bold shadow-inner border-l-4 border-[#B58A3C]'
                              : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 text-[#B58A3C] shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>

          {/* User Profile & Actions Footer */}
          <div className="p-3.5 border-t border-[#4A0E1C]/80 bg-[#4A0E1C]/50 shrink-0 space-y-2">
            <div className="flex items-center gap-2.5 px-2 py-1 text-white/90">
              <div className="w-7 h-7 rounded-full bg-[#B58A3C]/30 flex items-center justify-center text-[#B58A3C] shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="truncate flex-1 min-w-0">
                <div className="text-xs font-semibold truncate text-white">
                  {staffProfile?.name || staffProfile?.email || 'Authenticated Staff'}
                </div>
                <div className="text-[10px] text-[#B58A3C] truncate font-medium">
                  {staffProfile?.role || 'OWNER'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1 text-xs">
              <Link
                to="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 rounded transition-colors text-[11px]"
              >
                <ExternalLink className="w-3 h-3 text-[#B58A3C]" />
                <span>Store</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-950/40 hover:bg-red-900/50 text-red-200 rounded transition-colors text-[11px]"
              >
                <LogOut className="w-3 h-3 text-red-300" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ==========================================
          MOBILE NAVIGATION DRAWER
          ========================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] bg-[#5E1224] text-white flex flex-col justify-between shadow-2xl z-10">
            <div className="p-4 border-b border-[#4A0E1C] flex items-center justify-between">
              <BrandLogo variant="white" layout="compact" emblemSize={24} />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-white/80 hover:text-white"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {navSections.map((sec) => (
                <div key={sec.title}>
                  <div className="px-3 text-[10px] uppercase font-bold tracking-[0.2em] text-[#B58A3C]/70 mb-1">
                    {sec.title}
                  </div>
                  <nav className="space-y-0.5">
                    {sec.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3.5 py-2.5 min-h-[40px] text-xs font-medium ${
                              isActive
                                ? 'bg-[#4A0E1C] text-[#B58A3C] font-bold border-l-4 border-[#B58A3C]'
                                : 'text-white/80 hover:text-white hover:bg-white/5'
                            }`
                          }
                        >
                          <Icon className="w-4 h-4 text-[#B58A3C]" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-[#4A0E1C] bg-[#4A0E1C]/40 flex items-center justify-between">
              <span className="text-[11px] text-white/70 truncate">{staffProfile?.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-red-300 hover:text-red-100 flex items-center gap-1 font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MAIN CONTENT AREA
          ======================================================== */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden bg-[#5E1224] text-white p-3.5 sticky top-0 z-30 flex items-center justify-between border-b border-[#4A0E1C] shadow-md">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 rounded hover:bg-white/10 text-white"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 text-[#B58A3C]" />
            </button>
            <Link to={homePath} className="flex items-center gap-2">
              <BrandLogo variant="white" layout="horizontal" emblemSize={24} showTagline={false} />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" target="_blank" className="text-xs text-[#B58A3C] font-medium">
              View Store
            </Link>
            <button onClick={handleLogout} className="text-xs text-red-300 font-medium">
              Logout
            </button>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-12">
          {routePerm.allowed ? (
            <Outlet />
          ) : (
            <div className="min-h-[60vh] flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-amber-200/80 shadow-xl text-center space-y-5">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-[#5E1224]">
                  <ShieldAlert className="w-8 h-8 text-[#5E1224]" />
                </div>
                <div>
                  <h2 className="text-xl font-serif font-bold text-[#5E1224] tracking-wide">
                    Access Restricted
                  </h2>
                  <p className="text-xs uppercase tracking-widest text-[#B58A3C] font-semibold mt-1">
                    Role: {currentRole}
                  </p>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {routePerm.reason}
                </p>
                <div className="pt-2">
                  <Link
                    to={routePerm.redirectPath}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#5E1224] text-white hover:bg-[#4A0E1C] transition-all font-medium text-xs tracking-wider uppercase shadow-md hover:shadow-lg"
                  >
                    <span>{routePerm.redirectLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#B58A3C]" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Quick-Access Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#5E1224] border-t border-[#4A0E1C] z-40 px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] shadow-2xl flex items-center justify-around font-sans">
        {isFulfillment ? (
          <>
            <NavLink
              to="/admin/orders"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-3 min-w-[60px] min-h-[44px] text-[10px] ${
                  isActive ? 'text-[#B58A3C] font-bold' : 'text-white/70 hover:text-white'
                }`
              }
            >
              <Package className="w-4 h-4 mb-0.5" />
              <span>Orders</span>
            </NavLink>
            <NavLink
              to="/admin/shipping"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-3 min-w-[60px] min-h-[44px] text-[10px] ${
                  isActive ? 'text-[#B58A3C] font-bold' : 'text-white/70 hover:text-white'
                }`
              }
            >
              <Truck className="w-4 h-4 mb-0.5" />
              <span>Shipping</span>
            </NavLink>
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center py-1.5 px-3 min-w-[60px] min-h-[44px] text-[10px] text-[#B58A3C] hover:text-[#E6C687]"
            >
              <Menu className="w-4 h-4 mb-0.5" />
              <span>Menu</span>
            </button>
          </>
        ) : (
          <>
            <NavLink
              to="/admin/dashboard"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-2 min-w-[50px] min-h-[44px] text-[10px] ${
                  isActive ? 'text-[#B58A3C] font-bold' : 'text-white/70 hover:text-white'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4 mb-0.5" />
              <span>Overview</span>
            </NavLink>
            <NavLink
              to="/admin/orders"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-2 min-w-[50px] min-h-[44px] text-[10px] ${
                  isActive ? 'text-[#B58A3C] font-bold' : 'text-white/70 hover:text-white'
                }`
              }
            >
              <Package className="w-4 h-4 mb-0.5" />
              <span>Orders</span>
            </NavLink>
            <NavLink
              to="/admin/payments"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-2 min-w-[50px] min-h-[44px] text-[10px] ${
                  isActive ? 'text-[#B58A3C] font-bold' : 'text-white/70 hover:text-white'
                }`
              }
            >
              <CreditCard className="w-4 h-4 mb-0.5" />
              <span>Payments</span>
            </NavLink>
            <NavLink
              to="/admin/inventory"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-2 min-w-[50px] min-h-[44px] text-[10px] ${
                  isActive ? 'text-[#B58A3C] font-bold' : 'text-white/70 hover:text-white'
                }`
              }
            >
              <Boxes className="w-4 h-4 mb-0.5" />
              <span>Stock</span>
            </NavLink>
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center py-1.5 px-2 min-w-[50px] min-h-[44px] text-[10px] text-[#B58A3C] hover:text-[#E6C687]"
            >
              <Menu className="w-4 h-4 mb-0.5" />
              <span>More</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
};
