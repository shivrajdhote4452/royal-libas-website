import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Copy,
  Check,
  Search,
  RefreshCw,
  X,
  Play,
  Film,
  AlertCircle,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Folder,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Download,
  CheckSquare,
  Square,
  Edit2,
  Eye,
  Grid,
  List,
  ShieldAlert,
  Sparkles,
  Layers,
  Move,
} from 'lucide-react';
import {
  adminListMedia,
  adminUploadMediaBatch,
  adminListMediaFolders,
  adminCreateMediaFolder,
  adminRenameMediaFolder,
  adminDeleteMediaFolder,
  adminBulkMoveMedia,
  adminBulkAttachMedia,
  adminBulkDeleteMedia,
  adminSyncCloudinaryMedia,
  adminGetMediaStatus,
  adminUpdateMediaAsset,
  fetchAdminProducts,
} from '../../lib/api';
import {
  MediaAsset,
  MediaFolder,
  MediaStatusResponse,
  MediaSyncResponse,
  Product,
} from '../../types/product';

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  resourceType: 'image' | 'video';
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  targetFolder?: string;
}

export const AdminMedia: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core Data
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statusInfo, setStatusInfo] = useState<MediaStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Navigation & Folder Selection
  // currentFolder: null = All Media; "" = Root / Uncategorized; "path/to/folder" = specific folder
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['royal_libas', 'samples']));

  // Filtering, Searching & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [showTestRecordsOnly, setShowTestRecordsOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'largest' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  // Multi-Selection State
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<number>>(new Set());

  // Upload Queue State
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [uploadDestinationFolder, setUploadDestinationFolder] = useState<string>('royal_libas/products');
  const [isUploading, setIsUploading] = useState(false);

  // Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<MediaSyncResponse | null>(null);

  // Notifications & Copied Feedback
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedBulk, setCopiedBulk] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modals
  const [detailAsset, setDetailAsset] = useState<MediaAsset | null>(null);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAltText, setEditAltText] = useState('');
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  // Folder Modals
  const [newFolderModal, setNewFolderModal] = useState<{ isOpen: boolean; parentPath: string | null }>({ isOpen: false, parentPath: null });
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderModal, setRenameFolderModal] = useState<MediaFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');

  // Bulk Modals
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [targetMoveFolder, setTargetMoveFolder] = useState<string>('');

  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [attachCoverAssetId, setAttachCoverAssetId] = useState<number | null>(null);
  const [replaceGallery, setReplaceGallery] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);

  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [forceDeleteConfirm, setForceDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteResult, setBulkDeleteResult] = useState<any | null>(null);

  // Image load error fallback tracking
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  // 1. Initial Data Fetch
  const fetchData = async () => {
    setLoading(true);
    try {
      const [mediaData, folderData, statusData, productList] = await Promise.all([
        adminListMedia(token, { sort_by: sortBy }),
        adminListMediaFolders(token).catch(() => []),
        adminGetMediaStatus(token).catch(() => null),
        fetchAdminProducts(token).catch(() => []),
      ]);
      setAssets(mediaData);
      setFolders(folderData);
      setStatusInfo(statusData);
      setProducts(productList);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load media library data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, sortBy]);

  // Update upload destination when current folder changes
  useEffect(() => {
    if (currentFolder !== null && currentFolder !== '') {
      setUploadDestinationFolder(currentFolder);
    } else {
      setUploadDestinationFolder('royal_libas/products');
    }
    // Clear selection when navigating to a different folder to prevent accidental bulk actions
    setSelectedAssetIds(new Set());
    setCurrentPage(1);
  }, [currentFolder]);

  // 2. Folder Helpers
  const toggleFolderExpand = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Build folder hierarchy
  const folderTree = useMemo(() => {
    const rootFolders: MediaFolder[] = [];
    const childrenMap = new Map<string, MediaFolder[]>();

    folders.forEach((f) => {
      if (!f.parent_path) {
        rootFolders.push(f);
      } else {
        const existing = childrenMap.get(f.parent_path) || [];
        existing.push(f);
        childrenMap.set(f.parent_path, existing);
      }
    });

    return { rootFolders, childrenMap };
  }, [folders]);

  // Breadcrumbs calculation
  const breadcrumbs = useMemo((): Array<{ label: string; path: string | null }> => {
    if (currentFolder === null) return [{ label: 'All Assets', path: null }];
    if (currentFolder === '') return [{ label: 'All Assets', path: null }, { label: 'Root / Uncategorized', path: '' }];

    const parts = currentFolder.split('/');
    const crumbs: Array<{ label: string; path: string | null }> = [{ label: 'All Assets', path: null }];
    let accPath = '';
    parts.forEach((p, idx) => {
      accPath = idx === 0 ? p : `${accPath}/${p}`;
      crumbs.push({ label: p, path: accPath });
    });
    return crumbs;
  }, [currentFolder]);

  // 3. Filtering & Searching Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Folder Filter
      if (currentFolder === '') {
        // Root / Uncategorized only
        if (asset.folder && asset.folder.trim() !== '') return false;
      } else if (currentFolder !== null) {
        // Specific folder and its subfolders
        if (!asset.folder) return false;
        if (asset.folder !== currentFolder && !asset.folder.startsWith(`${currentFolder}/`)) {
          return false;
        }
      }

      // Test Records Filter
      if (showTestRecordsOnly) {
        if (!asset.is_test_record) return false;
      }

      // Type Filter
      const assetType = asset.resource_type || (asset.url.match(/\.(mp4|webm|mov|ogg)$/i) ? 'video' : 'image');
      if (typeFilter !== 'all' && assetType !== typeFilter) return false;

      // Usage Filter
      const isUsed = Boolean(
        (asset.used_in_products && asset.used_in_products.length > 0) ||
        (asset.used_editorial && asset.used_editorial.length > 0)
      );
      if (usageFilter === 'used' && !isUsed) return false;
      if (usageFilter === 'unused' && isUsed) return false;

      // Search Query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = asset.filename.toLowerCase().includes(q);
        const matchDisplay = asset.display_name ? asset.display_name.toLowerCase().includes(q) : false;
        const matchAlt = asset.alt_text ? asset.alt_text.toLowerCase().includes(q) : false;
        const matchPublicId = asset.public_id ? asset.public_id.toLowerCase().includes(q) : false;
        const matchFolder = asset.folder ? asset.folder.toLowerCase().includes(q) : false;
        if (!matchName && !matchDisplay && !matchAlt && !matchPublicId && !matchFolder) return false;
      }

      return true;
    });
  }, [assets, currentFolder, showTestRecordsOnly, typeFilter, usageFilter, searchTerm]);

  // Paginated Assets
  const totalPages = Math.ceil(filteredAssets.length / pageSize) || 1;
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssets.slice(start, start + pageSize);
  }, [filteredAssets, currentPage, pageSize]);

  // Test records count
  const testRecordCount = useMemo(() => assets.filter((a) => a.is_test_record).length, [assets]);

  // 4. Multi-Selection Controls
  const toggleSelectAsset = (id: number) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectPage = () => {
    const pageIds = paginatedAssets.map((a) => a.id);
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleSelectAllFolder = () => {
    const allFolderIds = filteredAssets.map((a) => a.id);
    setSelectedAssetIds(new Set(allFolderIds));
  };

  const handleClearSelection = () => {
    setSelectedAssetIds(new Set());
  };

  const isAllPageSelected =
    paginatedAssets.length > 0 && paginatedAssets.every((a) => selectedAssetIds.has(a.id));

  // 5. Bulk Actions

  // A. Copy URLs
  const handleBulkCopyUrls = () => {
    const selected = assets.filter((a) => selectedAssetIds.has(a.id));
    if (!selected.length) return;

    const urls = selected.map((a) => (a.secure_url || a.url).trim()).join('\n');
    navigator.clipboard.writeText(urls);
    setCopiedBulk(true);
    setNotification({
      type: 'success',
      message: `Copied ${selected.length} URL${selected.length > 1 ? 's' : ''} to clipboard (one per line).`,
    });
    setTimeout(() => setCopiedBulk(false), 2500);
  };

  // B. Export CSV (Formula-Injection Safe)
  const handleBulkExportCsv = () => {
    const selected = assets.filter((a) => selectedAssetIds.has(a.id));
    if (!selected.length) return;

    // Safety escaping against spreadsheet formula injection (=, +, -, @, \t, \r)
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'Original Filename',
      'Display Name',
      'Folder Path',
      'Media Type',
      'Format',
      'Cloudinary Public ID',
      'Cloudinary Asset ID',
      'Secure Delivery URL',
      'Width (px)',
      'Height (px)',
      'Duration (sec)',
      'File Size (bytes)',
      'Used In Products',
      'Used In Editorial',
      'Created At',
    ];

    const rows = selected.map((a) => [
      escapeCsv(a.filename),
      escapeCsv(a.display_name || a.filename),
      escapeCsv(a.folder || 'Root'),
      escapeCsv(a.resource_type),
      escapeCsv(a.format || ''),
      escapeCsv(a.public_id || ''),
      escapeCsv(a.cloudinary_asset_id || ''),
      escapeCsv(a.secure_url || a.url),
      escapeCsv(a.width || ''),
      escapeCsv(a.height || ''),
      escapeCsv(a.duration || ''),
      escapeCsv(a.file_size || 0),
      escapeCsv((a.used_in_products || []).map((p) => p.name).join('; ')),
      escapeCsv((a.used_editorial || []).join('; ')),
      escapeCsv(a.created_at),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `royal_libas_media_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setNotification({
      type: 'success',
      message: `Exported ${selected.length} asset records to CSV securely.`,
    });
  };

  // C. Move to Folder
  const handleBulkMove = async () => {
    if (!selectedAssetIds.size) return;
    try {
      const res = await adminBulkMoveMedia(token, Array.from(selectedAssetIds), targetMoveFolder);
      setNotification({ type: 'success', message: res.message });
      setMoveModalOpen(false);
      handleClearSelection();
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to move assets' });
    }
  };

  // D. Attach to Product
  const handleBulkAttach = async () => {
    if (!selectedProductId || !selectedAssetIds.size) return;
    setIsAttaching(true);
    try {
      const res = await adminBulkAttachMedia(
        token,
        selectedProductId,
        Array.from(selectedAssetIds),
        attachCoverAssetId || undefined,
        replaceGallery
      );
      setNotification({
        type: 'success',
        message: `Successfully attached ${res.attached_count} asset(s) to product.`,
      });
      setAttachModalOpen(false);
      handleClearSelection();
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to attach assets to product' });
    } finally {
      setIsAttaching(false);
    }
  };

  // E. Bulk Delete with In-Use Protection
  const handleBulkDelete = async () => {
    if (!selectedAssetIds.size) return;
    setIsBulkDeleting(true);
    try {
      const res = await adminBulkDeleteMedia(token, Array.from(selectedAssetIds), forceDeleteConfirm);
      setBulkDeleteResult(res);
      setNotification({
        type: res.status === 'success' ? 'success' : 'info',
        message: res.message,
      });
      if (res.deleted_ids.length > 0) {
        handleClearSelection();
        await fetchData();
      }
      if (res.skipped_in_use.length === 0 && res.failed.length === 0) {
        setBulkDeleteModalOpen(false);
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete selected assets' });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // 6. Sync Media from Cloudinary
  const handleSyncCloudinary = async () => {
    setIsSyncing(true);
    try {
      const res = await adminSyncCloudinaryMedia(token);
      setSyncSummary(res);
      setNotification({
        type: 'success',
        message: `Synced with Cloudinary: ${res.imported} imported, ${res.updated} updated, ${res.skipped} unchanged.`,
      });
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to sync with Cloudinary' });
    } finally {
      setIsSyncing(false);
    }
  };

  // 7. Folder CRUD Handlers
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await adminCreateMediaFolder(token, newFolderName.trim(), newFolderModal.parentPath || undefined);
      setNotification({ type: 'success', message: `Folder '${newFolderName}' created successfully.` });
      setNewFolderModal({ isOpen: false, parentPath: null });
      setNewFolderName('');
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to create folder' });
    }
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameFolderModal || !renameFolderName.trim()) return;
    try {
      await adminRenameMediaFolder(token, renameFolderModal.id, renameFolderName.trim());
      setNotification({ type: 'success', message: `Folder renamed to '${renameFolderName}'.` });
      setRenameFolderModal(null);
      setRenameFolderName('');
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to rename folder' });
    }
  };

  const handleDeleteFolder = async (folder: MediaFolder) => {
    if (!confirm(`Are you sure you want to delete the empty folder '${folder.name}'?`)) return;
    try {
      await adminDeleteMediaFolder(token, folder.id);
      setNotification({ type: 'success', message: `Folder '${folder.name}' deleted.` });
      if (currentFolder === folder.path) {
        setCurrentFolder(folder.parent_path || null);
      }
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete folder' });
    }
  };

  // 8. Upload Queue Management
  const handleFilesAdded = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    const newItems: QueueItem[] = [];
    for (const file of fileArray) {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|ogg|mkv)$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(file.name);

      if (!isVideo && !isImage) {
        setNotification({
          type: 'error',
          message: `File ${file.name} is not an allowed format (JPEG, PNG, WebP, MP4, MOV, WebM).`,
        });
        continue;
      }

      if (isImage && file.size > 10 * 1024 * 1024) {
        setNotification({ type: 'error', message: `Photo ${file.name} exceeds maximum 10MB limit.` });
        continue;
      }

      if (isVideo && file.size > 60 * 1024 * 1024) {
        setNotification({ type: 'error', message: `Video ${file.name} exceeds maximum 60MB limit.` });
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      newItems.push({
        id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        previewUrl,
        resourceType: isVideo ? 'video' : 'image',
        status: 'pending',
        targetFolder: uploadDestinationFolder,
      });
    }

    setUploadQueue((prev) => [...prev, ...newItems]);
  };

  const startUpload = async () => {
    const pendingItems = uploadQueue.filter((item) => item.status === 'pending' || item.status === 'error');
    if (!pendingItems.length) return;

    setIsUploading(true);
    setUploadQueue((prev) =>
      prev.map((item) =>
        item.status === 'pending' || item.status === 'error' ? { ...item, status: 'uploading', error: undefined } : item
      )
    );

    try {
      const uploadPayload = pendingItems.map((item) => ({
        file: item.file,
        clientId: item.id,
      }));

      const batchRes = await adminUploadMediaBatch(token, uploadPayload, uploadDestinationFolder);

      const successIds = new Set(batchRes.uploaded.map((u) => u.client_id).filter(Boolean));
      const failureMap = new Map(batchRes.failed.map((f) => [f.client_id || f.filename, f.error]));

      setUploadQueue((prev) =>
        prev.map((item) => {
          if (item.status === 'uploading') {
            if (successIds.has(item.id)) {
              return { ...item, status: 'success' };
            }
            if (failureMap.has(item.id)) {
              return { ...item, status: 'error', error: failureMap.get(item.id) };
            }
            return { ...item, status: 'success' };
          }
          return item;
        })
      );

      if (batchRes.success_count > 0) {
        setNotification({
          type: 'success',
          message: `Uploaded ${batchRes.success_count} file(s) into folder '${uploadDestinationFolder}'.`,
        });
        await fetchData();
      }
    } catch (err: any) {
      setUploadQueue((prev) =>
        prev.map((item) =>
          item.status === 'uploading' ? { ...item, status: 'error', error: err.message || 'Upload failed' } : item
        )
      );
      setNotification({ type: 'error', message: err.message || 'Failed to upload files' });
    } finally {
      setIsUploading(false);
    }
  };

  // 9. Asset Metadata Edit
  const handleOpenDetail = (asset: MediaAsset) => {
    setDetailAsset(asset);
    setEditDisplayName(asset.display_name || asset.filename);
    setEditAltText(asset.alt_text || '');
    setIsEditingMetadata(false);
  };

  const handleSaveMetadata = async () => {
    if (!detailAsset) return;
    setIsSavingMetadata(true);
    try {
      const updated = await adminUpdateMediaAsset(token, detailAsset.id, {
        display_name: editDisplayName,
        alt_text: editAltText,
      });
      setDetailAsset(updated);
      setIsEditingMetadata(false);
      setNotification({ type: 'success', message: 'Asset details updated successfully.' });
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to update asset metadata' });
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Live Connection Status */}
      <div className="bg-white p-5 rounded-xl border border-[#E5D9C5] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-serif font-bold text-[#5E1224] tracking-wide flex items-center gap-2">
              <ImageIcon className="w-6 h-6 text-[#B58A3C]" />
              Media & Campaign Library
            </h1>
            {statusInfo?.cloud_name && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Cloud: {statusInfo.cloud_name}
              </span>
            )}
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#FCF8F0] text-[#5E1224] border border-[#E5D9C5]">
              <Sparkles className="w-3 h-3 text-[#B58A3C]" /> Dynamic Folders
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1 max-w-2xl">
            Organize luxury boutique product photography, reels, and campaign imagery in nested folders before creating products.
            Directly synced with Cloudinary storage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files) handleFilesAdded(e.target.files);
              e.target.value = '';
            }}
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/ogg"
            multiple
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C] transition-colors shadow-xs inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            Upload Media
          </button>

          <button
            onClick={handleSyncCloudinary}
            disabled={isSyncing}
            className="px-3.5 py-2 bg-[#FCF8F0] border border-[#E5D9C5] text-[#5E1224] rounded-lg text-xs font-semibold hover:bg-[#F5EFE6] transition-colors shadow-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            title="Scan Cloudinary console uploads and sync folders & assets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#B58A3C]' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Cloudinary'}
          </button>

          <button
            onClick={() => setNewFolderModal({ isOpen: true, parentPath: currentFolder })}
            className="p-2 bg-white border border-[#E5D9C5] text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            title="Create New Folder"
          >
            <FolderPlus className="w-4 h-4 text-[#B58A3C]" />
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : notification.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sync Summary Banner */}
      {syncSummary && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3.5 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <span className="font-bold">Cloudinary Sync Complete:</span> Scanned {syncSummary.total_scanned} files across Cloudinary ({syncSummary.cloud_name}). Imported {syncSummary.imported} new, updated {syncSummary.updated}, unchanged {syncSummary.skipped}.
            </div>
          </div>
          <button onClick={() => setSyncSummary(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Upload Queue Drawer */}
      {uploadQueue.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E5D9C5] shadow-xs p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-900">Upload Queue ({uploadQueue.length})</span>
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <span>Destination Folder:</span>
                <select
                  value={uploadDestinationFolder}
                  onChange={(e) => setUploadDestinationFolder(e.target.value)}
                  className="px-2 py-1 text-xs border border-[#E5D9C5] rounded bg-[#FCF8F0] font-medium text-[#5E1224]"
                >
                  <option value="royal_libas/products">royal_libas/products (Default)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {uploadQueue.some((i) => i.status === 'success') && (
                <button
                  type="button"
                  onClick={() => setUploadQueue((prev) => prev.filter((i) => i.status !== 'success'))}
                  className="text-[11px] text-gray-500 hover:text-gray-800 underline px-2 py-1"
                >
                  Clear Completed
                </button>
              )}
              <button
                type="button"
                onClick={startUpload}
                disabled={isUploading || !uploadQueue.some((i) => i.status === 'pending' || i.status === 'error')}
                className="px-3.5 py-1.5 bg-[#5E1224] text-white rounded text-xs font-semibold hover:bg-[#4A0E1C] disabled:opacity-50 flex items-center gap-1.5"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Uploading to Cloudinary...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Upload All ({uploadQueue.filter((i) => i.status === 'pending' || i.status === 'error').length})
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-60 overflow-y-auto pr-1">
            {uploadQueue.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 bg-gray-50/60 relative group"
              >
                <div className="w-12 h-12 rounded bg-gray-200 overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                  {item.resourceType === 'video' ? (
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white">
                      <Film className="w-5 h-5 text-[#B58A3C]" />
                    </div>
                  ) : (
                    <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                  )}
                  {item.resourceType === 'video' && (
                    <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 font-bold rounded">
                      VID
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 pr-4">
                  <div className="text-xs font-medium text-gray-900 truncate" title={item.file.name}>
                    {item.file.name}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{formatFileSize(item.file.size)}</div>

                  <div className="mt-1 flex items-center gap-1">
                    {item.status === 'pending' && <span className="text-[10px] text-gray-500 font-medium">Ready</span>}
                    {item.status === 'uploading' && (
                      <span className="text-[10px] text-[#5E1224] font-medium flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Uploading...
                      </span>
                    )}
                    {item.status === 'success' && (
                      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3" /> Uploaded
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span className="text-[10px] text-rose-600 font-medium truncate" title={item.error}>
                        {item.error || 'Failed'}
                      </span>
                    )}
                  </div>
                </div>

                {item.status !== 'uploading' && (
                  <button
                    type="button"
                    onClick={() => setUploadQueue((prev) => prev.filter((i) => i.id !== item.id))}
                    className="absolute top-1.5 right-1.5 p-1 text-gray-400 hover:text-rose-600 rounded"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Main Workspace: Split Folder Sidebar & Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Sidebar: Nested Folder Tree */}
        <div className="bg-white rounded-xl border border-[#E5D9C5] shadow-xs p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-[#B58A3C]" />
              Folder Browser
            </h3>
            <button
              onClick={() => setNewFolderModal({ isOpen: true, parentPath: currentFolder })}
              className="text-xs text-[#5E1224] hover:text-[#B58A3C] font-semibold flex items-center gap-1"
              title="Create folder inside current view"
            >
              <FolderPlus className="w-3.5 h-3.5" /> New
            </button>
          </div>

          {/* Quick Root Links */}
          <div className="space-y-1 text-xs">
            <button
              onClick={() => setCurrentFolder(null)}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium flex items-center justify-between transition-colors ${
                currentFolder === null ? 'bg-[#5E1224] text-white shadow-xs' : 'text-gray-700 hover:bg-[#FCF8F0]'
              }`}
            >
              <span className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" />
                All Assets
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${currentFolder === null ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {assets.length}
              </span>
            </button>

            <button
              onClick={() => setCurrentFolder('')}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium flex items-center justify-between transition-colors ${
                currentFolder === '' ? 'bg-[#5E1224] text-white shadow-xs' : 'text-gray-700 hover:bg-[#FCF8F0]'
              }`}
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5" />
                Root / Uncategorized
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${currentFolder === '' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {assets.filter((a) => !a.folder || a.folder.trim() === '').length}
              </span>
            </button>
          </div>

          {/* Folder Hierarchy Tree */}
          <div className="pt-2 border-t border-gray-100 space-y-1 text-xs max-h-96 overflow-y-auto">
            {folderTree.rootFolders.map((rf) => {
              const children = folderTree.childrenMap.get(rf.path) || [];
              const isExpanded = expandedFolders.has(rf.path);
              const isSelected = currentFolder === rf.path;

              return (
                <div key={rf.id} className="space-y-0.5">
                  <div
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                      isSelected ? 'bg-[#5E1224]/10 text-[#5E1224] font-semibold' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {children.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleFolderExpand(rf.path)}
                          className="p-0.5 text-gray-400 hover:text-gray-700"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <span className="w-4"></span>
                      )}

                      <button
                        type="button"
                        onClick={() => setCurrentFolder(rf.path)}
                        className="truncate text-left flex-1"
                        title={rf.path}
                      >
                        {rf.name}
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400 px-1">{rf.asset_count}</span>
                      <button
                        onClick={() => {
                          setRenameFolderModal(rf);
                          setRenameFolderName(rf.name);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-700"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {rf.asset_count === 0 && rf.subfolder_count === 0 && (
                        <button
                          onClick={() => handleDeleteFolder(rf)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-rose-600"
                          title="Delete empty folder"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Subfolders */}
                  {isExpanded && children.length > 0 && (
                    <div className="pl-6 space-y-0.5 border-l border-gray-100 ml-3">
                      {children.map((cf) => {
                        const isChildSelected = currentFolder === cf.path;
                        return (
                          <div
                            key={cf.id}
                            className={`group flex items-center justify-between px-2 py-1 rounded transition-colors ${
                              isChildSelected ? 'bg-[#5E1224]/10 text-[#5E1224] font-semibold' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setCurrentFolder(cf.path)}
                              className="truncate text-left flex-1"
                              title={cf.path}
                            >
                              {cf.name}
                            </button>
                            <span className="text-[10px] text-gray-400">{cf.asset_count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Test Records Review Banner */}
          {testRecordCount > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowTestRecordsOnly(!showTestRecordsOnly);
                  setCurrentFolder(null);
                }}
                className={`w-full px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                  showTestRecordsOnly
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100/70'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Review Test Records
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                  {testRecordCount}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Right Main Area: Breadcrumbs, Controls, Selection Toolbar & Media Grid */}
        <div className="lg:col-span-3 space-y-4">
          {/* Breadcrumb Navigation Bar */}
          <div className="bg-white px-4 py-2.5 rounded-xl border border-[#E5D9C5] shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-400" />}
                  <button
                    onClick={() => setCurrentFolder(crumb.path)}
                    className={`hover:underline ${
                      idx === breadcrumbs.length - 1 ? 'font-bold text-[#5E1224]' : 'text-gray-600'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
              <span className="text-gray-400 ml-1">({filteredAssets.length} items)</span>
            </div>

            {currentFolder && (
              <button
                onClick={() => setNewFolderModal({ isOpen: true, parentPath: currentFolder })}
                className="text-[11px] text-[#5E1224] hover:text-[#B58A3C] font-semibold flex items-center gap-1"
              >
                <FolderPlus className="w-3.5 h-3.5" /> + New Subfolder
              </button>
            )}
          </div>

          {/* Sticky Multi-Selection Toolbar */}
          {selectedAssetIds.size > 0 && (
            <div className="bg-[#5E1224] text-white p-3.5 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-full">
                  {selectedAssetIds.size} selected
                </span>

                <div className="flex items-center gap-1 text-xs">
                  <button
                    onClick={handleSelectPage}
                    className="hover:underline px-2 py-0.5 text-white/90 hover:text-white"
                  >
                    Select Page ({paginatedAssets.length})
                  </button>
                  <span className="text-white/40">|</span>
                  <button
                    onClick={handleSelectAllFolder}
                    className="hover:underline px-2 py-0.5 text-white/90 hover:text-white"
                  >
                    Select All in View ({filteredAssets.length})
                  </button>
                  <span className="text-white/40">|</span>
                  <button
                    onClick={handleClearSelection}
                    className="hover:underline px-2 py-0.5 text-white/90 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Bulk Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleBulkCopyUrls}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Copy direct delivery URLs to clipboard (1 per line)"
                >
                  <Copy className="w-3.5 h-3.5 text-[#B58A3C]" />
                  {copiedBulk ? 'Copied!' : 'Copy URLs'}
                </button>

                <button
                  onClick={handleBulkExportCsv}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Export spreadsheet metadata with safe formula escaping"
                >
                  <Download className="w-3.5 h-3.5 text-[#B58A3C]" />
                  Export CSV
                </button>

                <button
                  onClick={() => setMoveModalOpen(true)}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Move selected assets to another folder"
                >
                  <Move className="w-3.5 h-3.5 text-[#B58A3C]" />
                  Move
                </button>

                <button
                  onClick={() => {
                    setAttachCoverAssetId(Array.from(selectedAssetIds)[0]);
                    setAttachModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-[#B58A3C] text-black hover:bg-[#C79C4E] rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                  title="Attach selected photos/videos to a product"
                >
                  <Tag className="w-3.5 h-3.5" />
                  Attach to Product
                </button>

                <button
                  onClick={() => {
                    setForceDeleteConfirm(false);
                    setBulkDeleteResult(null);
                    setBulkDeleteModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Delete selected media assets"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Search, Filter & View Controls */}
          <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-[#FCF8F0] p-1 rounded-lg border border-[#E5D9C5] text-xs">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    typeFilter === 'all' ? 'bg-[#5E1224] text-white shadow-xs' : 'text-gray-700 hover:text-black'
                  }`}
                >
                  All ({assets.length})
                </button>
                <button
                  onClick={() => setTypeFilter('image')}
                  className={`px-3 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                    typeFilter === 'image' ? 'bg-[#5E1224] text-white shadow-xs' : 'text-gray-700 hover:text-black'
                  }`}
                >
                  <ImageIcon className="w-3 h-3" /> Photos
                </button>
                <button
                  onClick={() => setTypeFilter('video')}
                  className={`px-3 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                    typeFilter === 'video' ? 'bg-[#5E1224] text-white shadow-xs' : 'text-gray-700 hover:text-black'
                  }`}
                >
                  <Film className="w-3 h-3" /> Videos
                </button>
              </div>

              <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-200 text-xs">
                <button
                  onClick={() => setUsageFilter('all')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                    usageFilter === 'all' ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All Usage
                </button>
                <button
                  onClick={() => setUsageFilter('used')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                    usageFilter === 'used' ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  In Use
                </button>
                <button
                  onClick={() => setUsageFilter('unused')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                    usageFilter === 'unused' ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Unused
                </button>
              </div>

              {/* Sort Order */}
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="largest">Largest File</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>

            {/* Search & View Mode */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search filename or folder..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#B58A3C]"
                />
              </div>

              <div className="flex items-center border border-gray-200 rounded-lg p-0.5 bg-gray-50">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
                  title="Grid View"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
                  title="List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 4. Media Asset Content View */}
          {loading ? (
            <div className="bg-white p-16 rounded-xl border border-[#E5D9C5] text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#B58A3C]" />
              <p className="text-xs text-gray-500 font-medium">Loading luxury media assets...</p>
            </div>
          ) : paginatedAssets.length === 0 ? (
            <div className="bg-white p-16 rounded-xl border border-[#E5D9C5] text-center space-y-3">
              <FolderOpen className="w-12 h-12 text-[#B58A3C] mx-auto opacity-40" />
              <h3 className="text-sm font-bold text-gray-800">No media assets in this view</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {currentFolder
                  ? `The folder '${currentFolder}' is currently empty. Upload photos or videos to start organizing.`
                  : 'No media matches your search or filter criteria.'}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C] transition-colors"
              >
                Upload to this folder
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
              {paginatedAssets.map((asset) => {
                const isSelected = selectedAssetIds.has(asset.id);
                const isVideo = asset.resource_type === 'video';
                const isBroken = brokenImages.has(asset.id);
                const isUsed = Boolean(
                  (asset.used_in_products && asset.used_in_products.length > 0) ||
                  (asset.used_editorial && asset.used_editorial.length > 0)
                );

                return (
                  <div
                    key={asset.id}
                    className={`bg-white rounded-xl border overflow-hidden shadow-xs transition-all relative group flex flex-col ${
                      isSelected ? 'border-[#5E1224] ring-2 ring-[#5E1224]/20' : 'border-[#E5D9C5]/80 hover:border-[#B58A3C]'
                    }`}
                  >
                    {/* Checkbox (Always visible and touch-accessible) */}
                    <div className="absolute top-2 left-2 z-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectAsset(asset.id);
                        }}
                        className={`p-1 rounded-md transition-colors ${
                          isSelected
                            ? 'bg-[#5E1224] text-white shadow-xs'
                            : 'bg-white/90 text-gray-500 hover:text-gray-900 shadow-xs'
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Thumbnail Preview Area */}
                    <div
                      onClick={() => handleOpenDetail(asset)}
                      className="w-full aspect-[4/5] bg-gray-100 relative cursor-pointer overflow-hidden flex items-center justify-center"
                    >
                      {isBroken ? (
                        <div className="text-center p-3 text-gray-400 space-y-1">
                          <AlertTriangle className="w-6 h-6 mx-auto text-amber-500" />
                          <span className="text-[10px] block font-medium">Preview Unavailable</span>
                        </div>
                      ) : isVideo ? (
                        <div className="w-full h-full bg-slate-900 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                          <Film className="w-10 h-10 text-[#B58A3C]/70" />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-80 group-hover:opacity-100">
                            <span className="p-2.5 rounded-full bg-white/20 text-white backdrop-blur-xs">
                              <Play className="w-4 h-4 fill-white" />
                            </span>
                          </div>
                          {asset.duration && (
                            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
                              {asset.duration}s
                            </span>
                          )}
                        </div>
                      ) : (
                        <img
                          src={asset.secure_url || asset.url}
                          alt={asset.alt_text || asset.display_name || asset.filename}
                          onError={() => setBrokenImages((prev) => new Set(prev).add(asset.id))}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}

                      {/* Status Badges */}
                      <div className="absolute bottom-2 left-2 flex flex-col gap-1 z-10">
                        {asset.is_test_record && (
                          <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded shadow-xs">
                            Test Record
                          </span>
                        )}
                        {isUsed && (
                          <span className="px-1.5 py-0.5 bg-[#5E1224] text-white text-[9px] font-semibold rounded shadow-xs">
                            In Use
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-3 flex-1 flex flex-col justify-between text-xs space-y-2">
                      <div>
                        <div
                          onClick={() => handleOpenDetail(asset)}
                          className="font-medium text-gray-900 truncate cursor-pointer hover:text-[#5E1224]"
                          title={asset.display_name || asset.filename}
                        >
                          {asset.display_name || asset.filename}
                        </div>
                        <div className="text-[10px] text-gray-500 flex items-center justify-between mt-0.5">
                          <span>{formatFileSize(asset.file_size)}</span>
                          {asset.width && asset.height && (
                            <span>
                              {asset.width}×{asset.height}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Folder Badge & Quick Copy */}
                      <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[10px]">
                        <span className="text-gray-500 truncate max-w-[100px]" title={asset.folder || 'Root'}>
                          📁 {asset.folder ? asset.folder.split('/').pop() : 'Root'}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(asset.secure_url || asset.url);
                              setCopiedId(asset.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="p-1 text-gray-400 hover:text-[#5E1224] rounded"
                            title="Copy URL"
                          >
                            {copiedId === asset.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleOpenDetail(asset)}
                            className="p-1 text-gray-400 hover:text-[#B58A3C] rounded"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="bg-white rounded-xl border border-[#E5D9C5] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600">
                  <thead className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-gray-900 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3 w-8">
                        <button onClick={isAllPageSelected ? handleClearSelection : handleSelectPage}>
                          {isAllPageSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#5E1224]" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th className="p-3">Preview</th>
                      <th className="p-3">Display Name & Filename</th>
                      <th className="p-3">Folder</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Dimensions</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">Usage</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedAssets.map((asset) => {
                      const isSelected = selectedAssetIds.has(asset.id);
                      const isVideo = asset.resource_type === 'video';
                      const isUsed = Boolean(
                        (asset.used_in_products && asset.used_in_products.length > 0) ||
                        (asset.used_editorial && asset.used_editorial.length > 0)
                      );

                      return (
                        <tr
                          key={asset.id}
                          className={`hover:bg-gray-50/70 transition-colors ${isSelected ? 'bg-[#5E1224]/5' : ''}`}
                        >
                          <td className="p-3">
                            <button onClick={() => toggleSelectAsset(asset.id)}>
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#5E1224]" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="p-3">
                            <div
                              onClick={() => handleOpenDetail(asset)}
                              className="w-10 h-10 rounded bg-gray-100 overflow-hidden cursor-pointer flex items-center justify-center flex-shrink-0"
                            >
                              {isVideo ? (
                                <Film className="w-5 h-5 text-[#B58A3C]" />
                              ) : (
                                <img
                                  src={asset.secure_url || asset.url}
                                  alt={asset.filename}
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div
                              onClick={() => handleOpenDetail(asset)}
                              className="font-medium text-gray-900 cursor-pointer hover:text-[#5E1224]"
                            >
                              {asset.display_name || asset.filename}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate max-w-xs">{asset.filename}</div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px]">
                              {asset.folder || 'Root'}
                            </span>
                          </td>
                          <td className="p-3 uppercase text-[10px] font-semibold">
                            {asset.resource_type} {asset.format ? `(${asset.format})` : ''}
                          </td>
                          <td className="p-3 text-[11px]">
                            {asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'}
                          </td>
                          <td className="p-3 text-[11px]">{formatFileSize(asset.file_size)}</td>
                          <td className="p-3">
                            {isUsed ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                In Use
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400">Unused</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(asset.secure_url || asset.url);
                                  setCopiedId(asset.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className="p-1 text-gray-400 hover:text-[#5E1224]"
                                title="Copy URL"
                              >
                                {copiedId === asset.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleOpenDetail(asset)}
                                className="p-1 text-gray-400 hover:text-[#B58A3C]"
                                title="View Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-600 pt-2">
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredAssets.length)} of {filteredAssets.length} assets
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-200 rounded-md bg-white disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 font-medium text-gray-800">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-200 rounded-md bg-white disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* MODALS */}
      {/* ==================================================== */}

      {/* 1. Asset Detail Modal */}
      {detailAsset && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[#E5D9C5]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#FCF8F0]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#5E1224] uppercase tracking-wider">Asset Details</span>
                {detailAsset.is_test_record && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    Test Record
                  </span>
                )}
              </div>
              <button onClick={() => setDetailAsset(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 flex-1 overflow-y-auto">
              {/* Media Preview Box */}
              <div className="bg-slate-900 flex items-center justify-center p-4 min-h-[300px]">
                {detailAsset.resource_type === 'video' ? (
                  <video
                    src={detailAsset.secure_url || detailAsset.url}
                    controls
                    className="max-h-[400px] w-auto max-w-full rounded shadow"
                  />
                ) : (
                  <img
                    src={detailAsset.secure_url || detailAsset.url}
                    alt={detailAsset.display_name || detailAsset.filename}
                    className="max-h-[400px] w-auto max-w-full object-contain rounded shadow"
                  />
                )}
              </div>

              {/* Metadata & Controls */}
              <div className="p-6 space-y-4 text-xs">
                {/* Editable Display Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                    Display Name
                  </label>
                  {isEditingMetadata ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-[#B58A3C]"
                      />
                      <button
                        onClick={handleSaveMetadata}
                        disabled={isSavingMetadata}
                        className="px-3 py-1.5 bg-[#5E1224] text-white rounded-lg font-semibold hover:bg-[#4A0E1C]"
                      >
                        {isSavingMetadata ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setIsEditingMetadata(false)}
                        className="px-2 py-1.5 text-gray-500 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2 rounded bg-gray-50 border border-gray-100">
                      <span className="font-semibold text-gray-900">{detailAsset.display_name || detailAsset.filename}</span>
                      <button
                        onClick={() => setIsEditingMetadata(true)}
                        className="text-xs text-[#5E1224] hover:underline flex items-center gap-1 font-medium"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    </div>
                  )}
                </div>

                {/* Metadata Table */}
                <div className="space-y-2 border-t border-b border-gray-100 py-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Original File:</span>
                    <span className="font-mono text-gray-900 truncate max-w-[200px]">{detailAsset.filename}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Folder Path:</span>
                    <span className="font-medium text-gray-900">{detailAsset.folder || 'Root'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cloudinary Public ID:</span>
                    <span className="font-mono text-gray-800 truncate max-w-[200px]">{detailAsset.public_id || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Dimensions:</span>
                    <span className="font-medium text-gray-900">
                      {detailAsset.width && detailAsset.height ? `${detailAsset.width} × ${detailAsset.height} px` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">File Size:</span>
                    <span className="font-medium text-gray-900">{formatFileSize(detailAsset.file_size)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Created:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(detailAsset.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Used In Section */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Used In</span>
                  {(detailAsset.used_in_products?.length || 0) + (detailAsset.used_editorial?.length || 0) === 0 ? (
                    <p className="text-gray-400 italic">This asset is not currently attached to any product or campaign poster.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {detailAsset.used_in_products?.map((p) => (
                        <span
                          key={p.id}
                          className="px-2 py-1 rounded bg-[#FCF8F0] text-[#5E1224] border border-[#E5D9C5] text-[11px] font-medium"
                        >
                          Product: {p.name}
                        </span>
                      ))}
                      {detailAsset.used_editorial?.map((e, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-medium"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Copy Snippets */}
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Quick Copy</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(detailAsset.secure_url || detailAsset.url);
                        setNotification({ type: 'success', message: 'Direct delivery URL copied!' });
                      }}
                      className="px-2.5 py-1.5 border border-gray-200 rounded text-left hover:bg-gray-50 text-[11px] font-medium flex items-center justify-between"
                    >
                      <span>Copy URL</span>
                      <Copy className="w-3 h-3 text-gray-400" />
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(detailAsset.public_id || '');
                        setNotification({ type: 'success', message: 'Public ID copied!' });
                      }}
                      className="px-2.5 py-1.5 border border-gray-200 rounded text-left hover:bg-gray-50 text-[11px] font-medium flex items-center justify-between"
                    >
                      <span>Copy Public ID</span>
                      <Copy className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Create Folder Modal */}
      {newFolderModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolder}
            className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-[#E5D9C5]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-1.5">
                <FolderPlus className="w-4 h-4 text-[#B58A3C]" />
                Create Media Folder
              </h3>
              <button
                type="button"
                onClick={() => setNewFolderModal({ isOpen: false, parentPath: null })}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-semibold text-gray-700">Folder Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Designer Wear or Product 1"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#B58A3C]"
              />
              <p className="text-[11px] text-gray-500">
                {newFolderModal.parentPath
                  ? `Will be created inside: ${newFolderModal.parentPath}/`
                  : 'Will be created at top level (Root).'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewFolderModal({ isOpen: false, parentPath: null })}
                className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C]"
              >
                Create Folder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Rename Folder Modal */}
      {renameFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRenameFolder}
            className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-[#E5D9C5]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-1.5">
                <Edit2 className="w-4 h-4 text-[#B58A3C]" />
                Rename Folder: {renameFolderModal.name}
              </h3>
              <button
                type="button"
                onClick={() => setRenameFolderModal(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-semibold text-gray-700">New Folder Name</label>
              <input
                type="text"
                required
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#B58A3C]"
              />
              <p className="text-[11px] text-gray-500">
                Safely updates all nested subfolders and asset folder paths without breaking delivery URLs.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenameFolderModal(null)}
                className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C]"
              >
                Rename
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Move Assets Modal */}
      {moveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-[#E5D9C5]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-1.5">
                <Move className="w-4 h-4 text-[#B58A3C]" />
                Move {selectedAssetIds.size} Asset(s)
              </h3>
              <button onClick={() => setMoveModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-semibold text-gray-700">Select Destination Folder</label>
              <select
                value={targetMoveFolder}
                onChange={(e) => setTargetMoveFolder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Root / Uncategorized</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.path}>
                    📁 {f.path}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500">
                Moving assets uses Cloudinary Dynamic Folder Mode: delivery URLs and public IDs remain 100% stable.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMoveModalOpen(false)}
                className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkMove}
                className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C]"
              >
                Confirm Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Attach to Product Modal */}
      {attachModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[#E5D9C5]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#FCF8F0]">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#B58A3C]" />
                Attach {selectedAssetIds.size} Asset(s) to Product
              </h3>
              <button onClick={() => setAttachModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              {/* Product Selector */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 uppercase tracking-wider text-[11px]">
                  Select Product
                </label>
                <select
                  value={selectedProductId || ''}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-[#B58A3C]"
                >
                  <option value="">-- Choose a Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Thumbnails of selected assets */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 uppercase tracking-wider text-[11px]">
                  Gallery Preview & Cover Selection
                </label>
                <p className="text-[11px] text-gray-500">
                  Click any thumbnail to set it as the primary cover photo (sort order 0).
                </p>
                <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto">
                  {assets
                    .filter((a) => selectedAssetIds.has(a.id))
                    .map((a) => {
                      const isCover = attachCoverAssetId === a.id;
                      return (
                        <div
                          key={a.id}
                          onClick={() => setAttachCoverAssetId(a.id)}
                          className={`w-14 h-16 rounded-md overflow-hidden relative cursor-pointer border-2 transition-all ${
                            isCover ? 'border-[#B58A3C] ring-2 ring-[#B58A3C]/30 scale-105' : 'border-gray-200'
                          }`}
                        >
                          <img
                            src={a.secure_url || a.url}
                            alt={a.filename}
                            className="w-full h-full object-cover"
                          />
                          {isCover && (
                            <span className="absolute bottom-0 inset-x-0 bg-[#B58A3C] text-black text-[8px] font-bold text-center">
                              COVER
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Append vs Replace Mode */}
              <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
                <label className="flex items-center gap-2 font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceGallery}
                    onChange={(e) => setReplaceGallery(e.target.checked)}
                    className="rounded text-[#5E1224]"
                  />
                  <span>Replace existing product gallery entirely</span>
                </label>
                <p className="text-[11px] text-gray-500 pl-6">
                  {replaceGallery
                    ? 'Caution: All existing images on this product will be replaced with the selected assets.'
                    : 'Default: Selected assets will be appended to the existing gallery without deleting current photos. Duplicate URLs will be skipped.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                type="button"
                onClick={() => setAttachModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAttach}
                disabled={!selectedProductId || isAttaching}
                className="px-5 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-bold hover:bg-[#4A0E1C] disabled:opacity-50"
              >
                {isAttaching ? 'Attaching...' : 'Confirm Attachment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Bulk Delete Modal with In-Use Protection */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-rose-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Delete {selectedAssetIds.size} Media Asset(s)
              </h3>
              <button onClick={() => setBulkDeleteModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-600">
              <p>
                You have selected <span className="font-bold text-gray-900">{selectedAssetIds.size} asset(s)</span> for deletion.
              </p>

              {/* In-Use Detection Warning */}
              {assets
                .filter((a) => selectedAssetIds.has(a.id))
                .some(
                  (a) =>
                    (a.used_in_products && a.used_in_products.length > 0) ||
                    (a.used_editorial && a.used_editorial.length > 0)
                ) && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    In-Use Protection Active
                  </div>
                  <p className="text-[11px]">
                    One or more selected assets are currently used in products or homepage posters.
                    By default, in-use assets will be <span className="font-bold">skipped and protected</span> from deletion.
                  </p>
                </div>
              )}

              {/* Force Delete Toggle */}
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-rose-900 space-y-1.5">
                <label className="flex items-center gap-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceDeleteConfirm}
                    onChange={(e) => setForceDeleteConfirm(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <span>Force delete all assets (including in-use assets)</span>
                </label>
                <p className="text-[11px] text-rose-700 pl-6">
                  Warning: Force deletion removes photos from attached products and homepage banners immediately.
                </p>
              </div>

              {/* Previous Result Summary if applicable */}
              {bulkDeleteResult && (
                <div className="p-2.5 rounded bg-gray-50 border border-gray-200 space-y-1 text-[11px]">
                  <div className="font-bold text-gray-800">Result:</div>
                  <div>Deleted: {bulkDeleteResult.deleted_ids.length}</div>
                  <div>Skipped (In-Use): {bulkDeleteResult.skipped_in_use.length}</div>
                  {bulkDeleteResult.skipped_in_use.map((s: any) => (
                    <div key={s.id} className="text-gray-500 pl-2">
                      • {s.filename} (Used in: {s.locations.join(', ')})
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
              >
                {isBulkDeleting ? 'Deleting...' : forceDeleteConfirm ? 'Force Delete All' : 'Safe Delete Unused'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
