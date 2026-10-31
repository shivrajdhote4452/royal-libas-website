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
  last_sync_status?: string | null;
  last_failed_sync?: string | null;
}

export interface MediaSyncResponse {
  status: string;
  cloud_name: string;
  total_scanned: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  remaining?: number;
  folders_discovered: number;
  has_more?: boolean;
  next_cursor?: string | null;
  last_synced_at?: string | null;
  error_message?: string | null;
}

export interface BulkMoveResponse {
  status: string;
  moved_count: number;
  failed_count: number;
  target_folder?: string | null;
  message: string;
  failures?: Array<{ asset_id: number; error: string }>;
}

export interface BulkAttachResponse {
  status: string;
  product_id: number;
  product_name: string;
  added_count: number;
  skipped_duplicates: number;
  unavailable_asset_ids?: number[];
  cover_image_url?: string | null;
  total_gallery_images: number;
}

export interface FolderConflictMapping {
  folder: string;
  status: string;
  message: string;
}

export interface PrepareFoldersPreviewResponse {
  total_target: number;
  existing_count: number;
  to_create_count: number;
  missing_folders: string[];
  existing_matching_folders: string[];
  conflicts_and_mappings: FolderConflictMapping[];
}

export interface PrepareFoldersResponse {
  status: string;
  created_count: number;
  created_folders: string[];
  message: string;
}

export interface MediaUsageItem {
  asset_id: number;
  filename: string;
  display_name?: string | null;
  url: string;
  locations: string[];
}

export interface MediaCheckUsageResponse {
  total_checked: number;
  in_use_count: number;
  safe_count: number;
  usage_details: MediaUsageItem[];
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
