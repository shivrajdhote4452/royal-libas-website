import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { Shop } from './pages/Shop';
import { ProductPage } from './pages/Product';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { OrderSuccess } from './pages/OrderSuccess';
import { TrackOrder } from './pages/TrackOrder';
import { About } from './pages/About';
import { ShippingPolicy } from './pages/ShippingPolicy';
import { ReturnsPolicy } from './pages/ReturnsPolicy';
import { Contact } from './pages/Contact';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { QuickAddProvider } from './context/QuickAddContext';
import { QuickAddModal } from './components/QuickAddModal';

// Admin imports
import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminOrders } from './pages/admin/AdminOrders';
import { AdminOrderDetail } from './pages/admin/AdminOrderDetail';
import { AdminPayments } from './pages/admin/AdminPayments';
import { AdminShipping } from './pages/admin/AdminShipping';
import { AdminReturns } from './pages/admin/AdminReturns';
import { AdminProducts } from './pages/admin/AdminProducts';
import { AdminCollections } from './pages/admin/AdminCollections';
import { AdminInventory } from './pages/admin/AdminInventory';
import { AdminSizeCharts } from './pages/admin/AdminSizeCharts';
import { AdminMedia } from './pages/admin/AdminMedia';
import { AdminCustomers } from './pages/admin/AdminCustomers';
import { AdminHomepage } from './pages/admin/AdminHomepage';
import { AdminCoupons } from './pages/admin/AdminCoupons';
import { AdminReports } from './pages/admin/AdminReports';
import { AdminStaff } from './pages/admin/AdminStaff';
import { AdminActivityLog } from './pages/admin/AdminActivityLog';
import { AdminSettings } from './pages/admin/AdminSettings';
import { CartDrawer } from './components/CartDrawer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { BackToTop } from './components/BackToTop';

const StorefrontLayout: React.FC = () => {
  const location = useLocation();
  const hasBottomNav = !location.pathname.startsWith('/product/') && !location.pathname.startsWith('/checkout');

  return (
    <div className="min-h-screen flex flex-col bg-[#FCF8F0] text-[#2B1B1E] selection:bg-[#B58A3C] selection:text-white">
      <Header />
      <CartDrawer />
      <QuickAddModal />
      <main className={`flex-1 ${hasBottomNav ? 'pb-16 md:pb-0' : ''}`}>
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
      <BackToTop />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <CartProvider>
      <WishlistProvider>
        <QuickAddProvider>
          <BrowserRouter>
            <Routes>
          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:id" element={<AdminOrderDetail />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="shipping" element={<AdminShipping />} />
            <Route path="returns" element={<AdminReturns />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="collections" element={<AdminCollections />} />
            <Route path="size-charts" element={<AdminSizeCharts />} />
            <Route path="media" element={<AdminMedia />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="homepage" element={<AdminHomepage />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="activity" element={<AdminActivityLog />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          {/* Customer Storefront Routes */}
          <Route element={<StorefrontLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<ProductPage />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-success/:orderCode" element={<OrderSuccess />} />
            <Route path="/track-order" element={<TrackOrder />} />

            {/* Boutique Information & Policy Pages */}
            <Route path="/about" element={<About />} />
            <Route path="/shipping-policy" element={<ShippingPolicy />} />
            <Route path="/return-policy" element={<ReturnsPolicy />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />

            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
        </QuickAddProvider>
      </WishlistProvider>
    </CartProvider>
  );
};

export default App;
