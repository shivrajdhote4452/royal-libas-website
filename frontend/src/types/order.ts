export interface CartItemValidate {
  variant_id: number;
  quantity: number;
}

export interface CartValidatedItem {
  variant_id: number;
  product_id: number;
  product_name: string;
  slug: string;
  size: string;
  colour: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  available_stock: number;
  is_available: boolean;
  error?: string | null;
}

export interface CartValidateResponse {
  items: CartValidatedItem[];
  subtotal: number;
  is_valid: boolean;
  unavailable_lines: string[];
}

export interface OrderAddress {
  name: string;
  phone: string;
  pincode: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
}

export interface OrderItemCreate {
  variant_id: number;
  quantity: number;
}

export interface OrderCreatePayload {
  customer_name: string;
  phone: string;
  payment_method: 'PREPAID' | 'COD';
  coupon_code?: string;
  items: OrderItemCreate[];
  address: OrderAddress;
}

export interface OrderItemResponse {
  id: number;
  variant_id: number | null;
  product_name_snapshot: string;
  size_snapshot: string;
  colour_snapshot: string | null;
  quantity: number;
  unit_price_snapshot: number;
  line_total: number;
}

export interface OrderResponse {
  id: number;
  order_code: string;
  customer_name: string;
  phone: string;
  status: string;
  payment_method: string;
  payment_status: string;
  razorpay_order_id: string | null;
  subtotal: number;
  shipping_charge: number;
  discount: number;
  total: number;
  created_at: string;
  items: OrderItemResponse[];
  address: OrderAddress & { id: number };
}

export interface RazorpayOrderResponse {
  razorpay_order_id: string;
  order_code: string;
  amount: number;
  currency: string;
  key_id: string;
}

export interface CouponValidateResponse {
  valid: boolean;
  code: string;
  discount: number;
  message: string;
}
