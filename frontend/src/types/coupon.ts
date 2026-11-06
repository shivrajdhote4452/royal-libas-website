export interface AdminCoupon {
  id: number;
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  min_order_value: number;
  usage_limit: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  is_expired: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  created_at: string;
  updated_at: string | null;
}

export interface CouponCreatePayload {
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  min_order_value?: number;
  usage_limit?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active?: boolean;
}

export interface CouponUpdatePayload {
  code?: string;
  type?: 'PERCENT' | 'FLAT';
  value?: number;
  min_order_value?: number;
  usage_limit?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active?: boolean;
}
