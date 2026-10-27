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
  shipping_method?: 'STANDARD' | 'EXPRESS';
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
  cashfree_order_id?: string | null;
  subtotal: number;
  shipping_charge: number;
  discount: number;
  total: number;
  courier_name?: string | null;
  tracking_url?: string | null;
  shipment_id?: string | null;
  awb_code?: string | null;
  label_url?: string | null;
  manifest_url?: string | null;
  pickup_status?: string | null;
  created_at: string;
  updated_at?: string;
  items: OrderItemResponse[];
  address: OrderAddress & { id: number };
}

export interface CashfreeOrderResponse {
  payment_session_id: string;
  order_id: string;
  order_code: string;
  amount: number;
  currency: string;
  mode: string;
}

export interface PaymentGatewayConfigResponse {
  configured: boolean;
  mode: string;
}

export interface CouponValidateResponse {
  valid: boolean;
  code: string;
  discount: number;
  message: string;
}

export interface OrderTrackResponse {
  order_code: string;
  customer_name: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  shipping_charge: number;
  discount: number;
  total: number;
  courier_name?: string | null;
  tracking_url?: string | null;
  awb_code?: string | null;
  created_at: string;
  updated_at?: string;
  items: OrderItemResponse[];
  address: (OrderAddress & { id: number }) | null;
}

export interface OrderStatusUpdateRequest {
  status: string;
  courier_name?: string;
  tracking_url?: string;
}

export interface AdminLowStockVariant {
  variant_id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  size: string;
  colour?: string | null;
  stock: number;
  selling_price: number;
}

export interface AdminDashboardResponse {
  orders_today: number;
  to_pack_count: number;
  total_orders: number;
  low_stock_variants: AdminLowStockVariant[];
}

export interface AdminCustomerResponse {
  name: string;
  phone: string;
  order_count: number;
  total_spent: number;
  last_order_date: string;
}

export interface CouponPublic {
  id: number;
  code: string;
  type: 'FLAT' | 'PERCENT' | string;
  value: number;
  min_order_value: number;
  is_active: boolean;
}

export interface FulfillmentConfig {
  is_configured: boolean;
  provider_name: string;
  button_label: string;
  disabled_reason?: string | null;
}

export interface CourierOption {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  etd?: string | null;
  is_recommended?: boolean;
}

export interface ServiceabilityResponse {
  available_couriers: CourierOption[];
  recommended_courier_id?: number | null;
}

export interface ShipmentPayload {
  length: number;
  breadth: number;
  height: number;
  weight: number;
  courier_id?: number | null;
}

