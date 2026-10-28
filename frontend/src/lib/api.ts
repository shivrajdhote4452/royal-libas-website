import { Product, Collection } from '../types/product';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

export interface ProductFilters {
  category?: string;
  collection?: string;
  size?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | string;
}

export async function fetchProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.collection) params.append('collection', filters.collection);
  if (filters.size) params.append('size', filters.size);
  if (filters.sort) params.append('sort', filters.sort);

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/products${queryString}`);
  
  if (!response.ok) {
    throw new Error(`Failed to load products: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchProductBySlug(slug: string): Promise<Product> {
  const response = await fetch(`${API_BASE_URL}/products/${slug}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Product not found`);
    }
    throw new Error(`Failed to load product details`);
  }
  return response.json();
}

export async function fetchCollections(): Promise<Collection[]> {
  const response = await fetch(`${API_BASE_URL}/collections`);
  if (!response.ok) {
    throw new Error(`Failed to load collections`);
  }
  return response.json();
}

export function formatPrice(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '';
  return `₹ ${Math.round(amount).toLocaleString('en-IN')}`;
}

import {
  CartItemValidate,
  CartValidateResponse,
  OrderCreatePayload,
  OrderResponse,
  CashfreeOrderResponse,
  PaymentGatewayConfigResponse,
  CouponValidateResponse,
  CouponPublic,
  FulfillmentConfig,
  ServiceabilityResponse,
  ShipmentPayload,
  CashfreeSyncResult,
} from '../types/order';

export async function validateCart(items: CartItemValidate[]): Promise<CartValidateResponse> {
  const response = await fetch(`${API_BASE_URL}/cart/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to validate cart lines');
  }
  return response.json();
}

export async function fetchActiveCoupons(): Promise<CouponPublic[]> {
  const response = await fetch(`${API_BASE_URL}/coupons`);
  if (!response.ok) {
    return [];
  }
  return response.json();
}

export async function validateCoupon(code: string, subtotal: number): Promise<CouponValidateResponse> {
  const response = await fetch(`${API_BASE_URL}/coupons/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotal }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to validate coupon');
  }
  return response.json();
}

export async function createOrder(payload: OrderCreatePayload): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to place order');
  }
  return response.json();
}

export async function fetchOrderByCode(
  orderCode: string,
  token?: string,
  phone?: string,
): Promise<OrderResponse> {
  let url = `${API_BASE_URL}/orders/${encodeURIComponent(orderCode)}`;
  const params = new URLSearchParams();
  if (token) params.append('token', token);
  if (phone) params.append('phone', phone);
  const qs = params.toString();
  if (qs) url += `?${qs}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Order #${orderCode} not found.`);
    }
    throw new Error('Failed to retrieve order details.');
  }
  return response.json();
}

export async function fetchPaymentGatewayConfig(): Promise<PaymentGatewayConfigResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/payments/cashfree/config`);
    if (!response.ok) return { configured: false, mode: 'sandbox' };
    return response.json();
  } catch {
    return { configured: false, mode: 'sandbox' };
  }
}

export async function createCashfreeOrder(orderCode: string): Promise<CashfreeOrderResponse> {
  const response = await fetch(`${API_BASE_URL}/payments/cashfree/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_code: orderCode }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to initiate Cashfree payment');
  }
  return response.json();
}

export async function syncCashfreePayment(orderCode: string): Promise<CashfreeSyncResult> {
  const response = await fetch(`${API_BASE_URL}/payments/cashfree/sync/${encodeURIComponent(orderCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to verify payment with Cashfree');
  }
  return response.json();
}

export async function cancelOrder(
  orderCode: string,
  token?: string,
  reason?: string,
): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE_URL}/orders/${encodeURIComponent(orderCode)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, reason }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to cancel order');
  }
  return response.json();
}

// ==========================================
// Phase 5: Tracking & Admin API Clients
// ==========================================

import {
  OrderTrackResponse,
  OrderStatusUpdateRequest,
  AdminDashboardResponse,
  AdminCustomerResponse,
} from '../types/order';

export async function trackOrder(orderCode: string, phone?: string, token?: string): Promise<OrderTrackResponse> {
  const cleanCode = encodeURIComponent(orderCode.trim());
  let url = `${API_BASE_URL}/orders/track?order_code=${cleanCode}`;
  if (phone && phone.trim()) {
    url += `&phone=${encodeURIComponent(phone.trim())}`;
  }
  if (token && token.trim()) {
    url += `&token=${encodeURIComponent(token.trim())}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Order not found. Please check your order reference code.');
  }
  return response.json();
}

export async function adminLogin(email: string, password: string): Promise<{ access_token: string; token_type: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Invalid email or password');
  }
  return response.json();
}

export async function fetchAdminDashboard(token: string): Promise<AdminDashboardResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load admin dashboard');
  }
  return response.json();
}

export async function fetchAdminOrders(token: string, status?: string, date?: string): Promise<OrderResponse[]> {
  const params = new URLSearchParams();
  if (status && status !== 'ALL') params.append('status', status);
  if (date) params.append('date', date);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/orders${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load admin orders');
  }
  return response.json();
}

export async function fetchAdminOrder(token: string, id: number): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/orders/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Order #${id} not found`);
  }
  return response.json();
}

export async function updateAdminOrderStatus(
  token: string,
  id: number,
  payload: OrderStatusUpdateRequest,
): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/orders/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update order status');
  }
  return response.json();
}

export async function fetchAdminCustomers(token: string): Promise<AdminCustomerResponse[]> {
  const response = await fetch(`${API_BASE_URL}/admin/customers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load customers roster');
  }
  return response.json();
}

export async function fetchAdminProducts(token: string): Promise<Product[]> {
  const response = await fetch(`${API_BASE_URL}/admin/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load admin products');
  }
  return response.json();
}

export async function adminCreateProduct(token: string, payload: any): Promise<Product> {
  const response = await fetch(`${API_BASE_URL}/admin/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create product');
  }
  return response.json();
}

export async function adminUpdateProduct(token: string, id: number, payload: any): Promise<Product> {
  const response = await fetch(`${API_BASE_URL}/admin/products/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update product');
  }
  return response.json();
}

export async function adminAddVariant(token: string, productId: number, payload: any): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/products/${productId}/variants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to add variant');
  }
  return response.json();
}

export async function adminUpdateVariant(token: string, variantId: number, payload: any): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/variants/${variantId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update variant');
  }
  return response.json();
}

export async function fetchFulfillmentConfig(token: string): Promise<FulfillmentConfig> {
  const response = await fetch(`${API_BASE_URL}/admin/fulfillment/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load fulfillment configuration');
  }
  return response.json();
}

export async function checkFulfillmentServiceability(
  token: string,
  orderId: number,
  payload: ShipmentPayload,
): Promise<ServiceabilityResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/fulfillment/serviceability`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to check courier serviceability');
  }
  return response.json();
}

export async function shipOrderViaFulfillment(
  token: string,
  orderId: number,
  payload: ShipmentPayload,
): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/fulfillment/ship`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Fulfillment request failed');
  }
  return response.json();
}

export async function refreshFulfillmentTracking(
  token: string,
  orderId: number,
): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/fulfillment/refresh-tracking`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to refresh live tracking');
  }
  return response.json();
}

export async function fetchStoreSettings(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/settings`);
  if (!response.ok) {
    throw new Error('Failed to fetch store settings');
  }
  return response.json();
}

export async function updateAdminStoreSettings(token: string, payload: any): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update store settings');
  }
  return response.json();
}

export async function submitContactInquiry(payload: { name: string; email: string; message: string }): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to submit inquiry');
  }
  return response.json();
}

export async function subscribeNewsletter(email: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to subscribe to newsletter');
  }
  return response.json();
}

export async function adminUploadProductImage(token: string, file: File): Promise<{ status: string; url: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE_URL}/admin/products/upload-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to upload product image');
  }
  return response.json();
}


