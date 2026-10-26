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
  return `Rs. ${Math.round(amount).toLocaleString('en-IN')}`;
}

import {
  CartItemValidate,
  CartValidateResponse,
  OrderCreatePayload,
  OrderResponse,
  RazorpayOrderResponse,
  CouponValidateResponse,
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

export async function fetchOrderByCode(orderCode: string): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE_URL}/orders/${orderCode}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Order #${orderCode} not found.`);
    }
    throw new Error('Failed to retrieve order details.');
  }
  return response.json();
}

export async function createRazorpayOrder(orderCode: string): Promise<RazorpayOrderResponse> {
  const response = await fetch(`${API_BASE_URL}/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_code: orderCode }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to initiate Razorpay payment');
  }
  return response.json();
}
