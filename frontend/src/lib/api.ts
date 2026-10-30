import { Product, Collection, MediaAsset, MediaUploadBatchResponse } from '../types/product';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

export interface ProductFilters {
  category?: string;
  subcategory?: string;
  collection?: string;
  size?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | string;
}

export async function fetchProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.subcategory) params.append('subcategory', filters.subcategory);
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
  const response = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(slug.trim())}`);
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

export async function fetchAdminStoreSettings(token: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load admin settings');
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

export async function adminUploadProductImage(
  token: string,
  file: File,
  folder?: string
): Promise<{ status: string; id: number; url: string; secure_url: string; public_id: string; resource_type: 'image' | 'video'; filename: string; width?: number; height?: number; duration?: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const q = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/products/upload-image${q}`, {
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



// ==========================================
// Upgraded Admin Panel API Endpoints
// ==========================================

export async function adminListPayments(
  token: string,
  status?: string,
  method?: string,
  search?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (status && status !== 'ALL') params.append('status', status);
  if (method && method !== 'ALL') params.append('method', method);
  if (search) params.append('search', search);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/payments${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load payments');
  }
  return response.json();
}

export async function adminSyncPayment(token: string, orderCode: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/payments/sync/${orderCode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Payment reconciliation failed');
  }
  return response.json();
}

export async function adminCollectCOD(
  token: string,
  orderId: number,
  staffNotes?: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/payments/cod-collect/${orderId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ staff_notes: staffNotes }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to record COD collection');
  }
  return response.json();
}

export async function adminListShipments(
  token: string,
  tab: string = 'all',
  search?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (tab) params.append('tab', tab);
  if (search) params.append('search', search);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/shipping${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load shipments');
  }
  return response.json();
}

export async function adminListInventory(
  token: string,
  filter: string = 'all',
  search?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (filter) params.append('filter', filter);
  if (search) params.append('search', search);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/inventory${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load inventory');
  }
  return response.json();
}

export async function adminAdjustStock(
  token: string,
  payload: { variant_id: number; new_stock: number; reason: string; note?: string }
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/inventory/adjust`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to adjust stock');
  }
  return response.json();
}

export async function adminListStockAdjustments(
  token: string,
  variantId?: number
): Promise<any[]> {
  const query = variantId ? `?variant_id=${variantId}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/inventory/adjustments${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load stock adjustments');
  }
  return response.json();
}

export async function adminListReturns(
  token: string,
  status?: string,
  requestType?: string,
  search?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (status && status !== 'ALL') params.append('status', status);
  if (requestType && requestType !== 'ALL') params.append('request_type', requestType);
  if (search) params.append('search', search);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/returns${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load returns');
  }
  return response.json();
}

export async function adminCreateReturn(token: string, payload: any): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/returns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create return request');
  }
  return response.json();
}

export async function adminUpdateReturnStatus(
  token: string,
  id: number,
  payload: any
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/returns/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update return status');
  }
  return response.json();
}

export async function adminGetCustomerDetail(token: string, phone: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/customers/${encodeURIComponent(phone)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load customer dossier');
  }
  return response.json();
}

export async function adminListInquiries(token: string, status?: string): Promise<any[]> {
  const query = status && status !== 'ALL' ? `?status=${status}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/inquiries${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load inquiries');
  }
  return response.json();
}

export async function adminReplyInquiry(
  token: string,
  id: number,
  replyText: string,
  status: string = 'RESPONDED'
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/inquiries/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reply_text: replyText, status }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to reply to inquiry');
  }
  return response.json();
}

export async function adminGetReports(token: string, period: string = '30d'): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/reports?period=${period}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load reports summary');
  }
  return response.json();
}

export async function adminExportOrdersCsv(token: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/admin/reports/export-orders-csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to export orders CSV');
  }
  return response.blob();
}

export async function adminListMedia(
  token: string,
  params?: { resource_type?: string; search?: string; product_id?: number }
): Promise<MediaAsset[]> {
  const searchParams = new URLSearchParams();
  if (params?.resource_type) searchParams.set('resource_type', params.resource_type);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.product_id) searchParams.set('product_id', String(params.product_id));
  const queryString = searchParams.toString();
  const url = `${API_BASE_URL}/admin/media${queryString ? `?${queryString}` : ''}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load media library');
  }
  return response.json();
}

export async function adminUploadMedia(token: string, file: File, folder?: string): Promise<MediaAsset> {
  const formData = new FormData();
  formData.append('file', file);
  const q = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/media/upload${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to upload media');
  }
  return response.json();
}

export async function adminUploadMediaBatch(
  token: string,
  items: File[] | Array<{ file: File; clientId: string }>,
  folder?: string
): Promise<MediaUploadBatchResponse> {
  const formData = new FormData();
  const clientIds: string[] = [];
  let hasClientIds = false;

  for (const item of items) {
    if ('file' in item && 'clientId' in item) {
      formData.append('files', item.file);
      formData.append('client_ids', item.clientId);
      clientIds.push(item.clientId);
      hasClientIds = true;
    } else {
      formData.append('files', item as File);
    }
  }

  if (hasClientIds) {
    formData.append('client_ids_json', JSON.stringify(clientIds));
  }

  const q = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/media/upload-batch${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to upload media batch');
  }
  return response.json();
}

export async function adminDeleteMedia(
  token: string,
  id: number,
  force?: boolean
): Promise<{ status: string; message: string }> {
  const url = `${API_BASE_URL}/admin/media/${id}${force ? '?force=true' : ''}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to delete media asset');
  }
  return response.json();
}

export async function adminAttachProductMedia(
  token: string,
  productId: number,
  mediaIds: number[]
): Promise<Product> {
  const response = await fetch(`${API_BASE_URL}/admin/products/${productId}/attach-media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mediaIds),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to attach media to product');
  }
  return response.json();
}

export async function adminListSizeCharts(token: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/admin/size-charts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load size charts');
  }
  return response.json();
}

export async function adminCreateSizeChart(token: string, payload: any): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/size-charts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create size chart');
  }
  return response.json();
}

export async function adminUpdateSizeChart(
  token: string,
  id: number,
  payload: any
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/size-charts/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update size chart');
  }
  return response.json();
}

export async function adminDeleteSizeChart(token: string, id: number): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/size-charts/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to delete size chart');
  }
  return response.json();
}

export async function adminListStaff(token: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/admin/staff`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load staff list');
  }
  return response.json();
}

export async function adminCreateStaff(token: string, payload: any): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/staff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create staff account');
  }
  return response.json();
}

export async function adminUpdateStaff(token: string, id: number, payload: any): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/staff/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update staff member');
  }
  return response.json();
}

export async function adminListActivityLogs(
  token: string,
  action?: string,
  targetType?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (action && action !== 'ALL') params.append('action', action);
  if (targetType && targetType !== 'ALL') params.append('target_type', targetType);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/activity-logs${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to load activity logs');
  }
  return response.json();
}

export async function adminUpdateOrderNotes(
  token: string,
  orderId: number,
  notes: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/notes`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ notes }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update order notes');
  }
  return response.json();
}

export async function adminDeleteProduct(token: string, id: number): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/admin/products/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to delete product');
  }
  return response.json();
}

export interface CustomerExchangePayload {
  order_code: string;
  phone?: string;
  token?: string;
  order_item_id?: number;
  reason: string;
  requested_size?: string;
  customer_notes?: string;
}

export interface CustomerExchangeResponse {
  success: boolean;
  return_code: string;
  status: string;
  message: string;
  created_at: string;
}

export async function submitCustomerExchange(payload: CustomerExchangePayload): Promise<CustomerExchangeResponse> {
  const response = await fetch(`${API_BASE_URL}/orders/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to submit exchange request.');
  }

  return response.json();
}
