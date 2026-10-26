export interface ProductVariant {
  id: number;
  product_id: number;
  size: string;
  colour: string | null;
  sku: string | null;
  mrp: number | null;
  selling_price: number;
  stock: number;
  is_available: boolean;
}

export interface ProductImage {
  id: number;
  url: string;
  sort_order: number;
  alt_text: string | null;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  fabric: string | null;
  care?: string | null;
  size_chart?: string | null;
  category: string | null;
  is_bestseller: boolean;
  is_active: boolean;
  min_price: number | null;
  max_price: number | null;
  total_stock: number;
  badges: string[];
  primary_image: string | null;
  images?: ProductImage[];
  variants: ProductVariant[];
  collections: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  product_count: number;
}
