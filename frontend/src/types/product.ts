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
  resource_type?: 'image' | 'video';
  public_id?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}

export interface MediaAssetProductUsage {
  id: number;
  name: string;
  slug: string;
}

export interface MediaAsset {
  id: number;
  filename: string;
  display_name?: string | null;
  client_id?: string | null;
  public_id?: string | null;
  cloudinary_asset_id?: string | null;
  url: string;
  secure_url?: string | null;
  resource_type: 'image' | 'video';
  format?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  file_size: number;
  mime_type: string;
  alt_text?: string | null;
  folder?: string | null;
  created_at: string;
  used_in_products?: MediaAssetProductUsage[];
  used_editorial?: string[];
  is_test_record?: boolean;
  test_reason?: string | null;
}

export interface MediaFolder {
  id: number;
  name: string;
  path: string;
  parent_path?: string | null;
  asset_count: number;
  subfolder_count: number;
  created_at: string;
  updated_at: string;
}

export interface MediaStatusResponse {
  configured: boolean;
  cloud_name?: string | null;
  total_assets: number;
  total_folders: number;
  folder_mode: string;
  last_sync?: string | null;
}

export interface MediaSyncResponse {
  status: string;
  cloud_name: string;
  total_scanned: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  folders_discovered: number;
  last_synced_at: string;
}

export interface BulkDeleteResponse {
  status: string;
  deleted_ids: number[];
  skipped_in_use: Array<{ id: number; filename: string; locations: string[] }>;
  failed: Array<{ id: number; filename: string; error: string }>;
  message: string;
}

export interface MediaUploadFailure {
  filename: string;
  client_id?: string | null;
  error: string;
}

export interface MediaUploadBatchResponse {
  status: 'success' | 'partial' | 'failure';
  uploaded: MediaAsset[];
  failed: MediaUploadFailure[];
  total: number;
  success_count: number;
  failure_count: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  fabric: string | null;
  care?: string | null;
  fit?: string | null;
  size_chart?: string | null;
  size_chart_id?: number | null;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string;
  category: string | null;
  subcategory?: string | null;
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
