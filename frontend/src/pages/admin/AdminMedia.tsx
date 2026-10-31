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
  Star,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  adminListMedia,
  adminUploadMediaBatch,
  adminListMediaFolders,
  adminCreateMediaFolder,
  adminRenameMediaFolder,
  adminDeleteMediaFolder,
  adminPreviewPrepareCollectionFolders,
  adminPrepareCollectionFolders,
  adminCheckMediaUsage,
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
  PrepareFoldersPreviewResponse,
  MediaCheckUsageResponse,
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

// Helper to extract Cloudinary video poster/thumbnail safely
function getVideoPoster(url?: string | null): string {
  if (!url) return '';
  if (url.includes('cloudinary.com') && url.includes('/video/upload/')) {
    let p = url.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg');
    if (!p.includes('/so_0')) {
      p = p.replace('/video/upload/', '/video/upload/so_0,f_jpg,q_auto/');
    }
    return p;
  }
  return url;
}

// Recursive Folder Tree Node supporting all nesting levels
interface FolderTreeNodeProps {
  folder: MediaFolder;
  level: number;
  currentFolder: string | null;
  expandedFolders: Set<string>;
  childrenMap: Map<string, MediaFolder[]>;
  onSelect: (path: string | null) => void;
  onToggleExpand: (path: string) => void;
  onOpenCreate: (parentPath: string) => void;
  onOpenRename: (folder: MediaFolder) => void;
  onDelete: (folder: MediaFolder) => void;
}

const FolderTreeNode: React.FC<FolderTreeNodeProps> = ({
  folder,
  level,
  currentFolder,
  expandedFolders,
  childrenMap,
  onSelect,
  onToggleExpand,
  onOpenCreate,
  onOpenRename,
  onDelete,
}) => {
  const children = childrenMap.get(folder.path) || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedFolders.has(folder.path);
  const isSelected = currentFolder === folder.path;

  return (
    <div className="flex flex-col">
      <div
        className={`group flex items-center justify-between py-1 px-2 rounded-md cursor-pointer text-xs transition-colors ${
          isSelected
            ? 'bg-[#5E1224]/10 text-[#5E1224] font-semibold border-l-2 border-[#5E1224]'
            : 'text-stone-700 hover:bg-stone-50'
        }`}
        style={{ paddingLeft: `${6 + level * 14}px` }}
      >
        <div
          className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5"
          onClick={() => onSelect(folder.path)}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(folder.path);
              }}
              className="p-0.5 text-stone-400 hover:text-stone-700 rounded transition-colors"
              aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-stone-600" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-stone-500" />
              )}
            </button>
          ) : (
            <span className="w-3.5" />
          )}

          {isSelected ? (
            <FolderOpen className="w-3.5 h-3.5 text-[#B58A3C] shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          )}

          <span className="truncate" title={folder.path}>
            {folder.name}
          </span>
          <span className="ml-auto text-[10px] text-stone-400 font-normal px-1 py-0.2 bg-stone-100 rounded">
            {folder.asset_count}
          </span>
        </div>

        {/* Action controls accessible on mobile/touch without hover */}
        <div className="flex items-center gap-0.5 ml-1 opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCreate(folder.path);
            }}
            title="Create subfolder"
            className="p-1 text-stone-400 hover:text-stone-800 hover:bg-stone-200/60 rounded"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenRename(folder);
            }}
            title="Rename folder"
            className="p-1 text-stone-400 hover:text-stone-800 hover:bg-stone-200/60 rounded"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          {folder.asset_count === 0 && folder.subfolder_count === 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(folder);
              }}
              title="Delete empty folder"
              className="p-1 text-stone-400 hover:text-red-700 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              level={level + 1}
              currentFolder={currentFolder}
              expandedFolders={expandedFolders}
              childrenMap={childrenMap}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onOpenCreate={onOpenCreate}
              onOpenRename={onOpenRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['Photos for royal libas', 'Heavy Dress', 'royal_libas', 'samples'])
  );
  const [folderSearchTerm, setFolderSearchTerm] = useState('');

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

  // Notifications & Feedback
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
  const [newFolderModal, setNewFolderModal] = useState<{ isOpen: boolean; parentPath: string | null }>({
    isOpen: false,
    parentPath: null,
  });
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderModal, setRenameFolderModal] = useState<MediaFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');

  // Prepare Collection Folders Modal
  const [prepareModalOpen, setPrepareModalOpen] = useState(false);
  const [preparePreview, setPreparePreview] = useState<PrepareFoldersPreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  // Bulk Modals
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [targetMoveFolder, setTargetMoveFolder] = useState<string>('');

  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [orderedAttachIds, setOrderedAttachIds] = useState<number[]>([]);
  const [attachCoverAssetId, setAttachCoverAssetId] = useState<number | null>(null);
  const [replaceGallery, setReplaceGallery] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);

  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [usageCheckData, setUsageCheckData] = useState<MediaCheckUsageResponse | null>(null);
  const [isCheckingUsage, setIsCheckingUsage] = useState(false);
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
    // Reset pagination when navigating folders
    setCurrentPage(1);
  }, [currentFolder]);

  // Expand ancestors when navigating to a deep folder
  const navigateToFolder = (path: string | null) => {
    setCurrentFolder(path);
    if (path) {
      const parts = path.split('/');
      let acc = '';
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        parts.forEach((p, idx) => {
          acc = idx === 0 ? p : `${acc}/${p}`;
          next.add(acc);
        });
        return next;
      });
    }
  };

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

  // Build folder hierarchy supporting arbitrary nesting levels
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

    // Sort folders alphabetically
    rootFolders.sort((a, b) => a.name.localeCompare(b.name));
    childrenMap.forEach((list) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
    });

    return { rootFolders, childrenMap };
  }, [folders]);

  // Filtered folders by sidebar search term
  const filteredRootFolders = useMemo(() => {
    if (!folderSearchTerm.trim()) return folderTree.rootFolders;
    const term = folderSearchTerm.toLowerCase();
    return folders.filter((f) => f.name.toLowerCase().includes(term) || f.path.toLowerCase().includes(term));
  }, [folderSearchTerm, folderTree.rootFolders, folders]);

  // Breadcrumbs calculation
  const breadcrumbs = useMemo((): Array<{ label: string; path: string | null }> => {
    if (currentFolder === null) return [{ label: 'All Media', path: null }];
    if (currentFolder === '') return [{ label: 'All Media', path: null }, { label: 'Root / Uncategorized', path: '' }];

    const parts = currentFolder.split('/');
    const crumbs: Array<{ label: string; path: string | null }> = [{ label: 'All Media', path: null }];
    let accPath = '';
    parts.forEach((p, idx) => {
      accPath = idx === 0 ? p : `${accPath}/${p}`;
      crumbs.push({ label: p, path: accPath });
    });
    return crumbs;
  }, [currentFolder]);

  // Parent path calculation
  const parentFolder = useMemo((): string | null => {
    if (!currentFolder || currentFolder === '') return null;
    const parts = currentFolder.split('/');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('/');
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

  // Paginated Assets & Clamped Page
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedAssets = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAssets.slice(start, start + pageSize);
  }, [filteredAssets, safeCurrentPage, pageSize]);

  // Multi-Selection Scope Metrics
  const visibleSelectedCount = useMemo(() => {
    const visibleIds = new Set(filteredAssets.map((a) => a.id));
    return Array.from(selectedAssetIds).filter((id) => visibleIds.has(id)).length;
  }, [filteredAssets, selectedAssetIds]);

  const hiddenSelectedCount = selectedAssetIds.size - visibleSelectedCount;

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

  const handleSelectAllInView = () => {
    const allIds = filteredAssets.map((a) => a.id);
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedAssetIds(new Set());
  };

  const handleDeselectHidden = () => {
    const visibleIds = new Set(filteredAssets.map((a) => a.id));
    setSelectedAssetIds(new Set(Array.from(selectedAssetIds).filter((id) => visibleIds.has(id))));
  };

  const isAllPageSelected =
    paginatedAssets.length > 0 && paginatedAssets.every((a) => selectedAssetIds.has(a.id));

  // 5. Bulk Actions

  // A. Copy URLs
  const handleBulkCopyUrls = async () => {
    const selected = assets.filter((a) => selectedAssetIds.has(a.id));
    if (!selected.length) return;

    const urls = selected.map((a) => (a.secure_url || a.url).trim()).join('\n');
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(urls);
        setCopiedBulk(true);
        setNotification({
          type: 'success',
          message: `Copied ${selected.length} URL${selected.length > 1 ? 's' : ''} to clipboard (one per line).`,
        });
        setTimeout(() => setCopiedBulk(false), 2500);
      } else {
        throw new Error('Clipboard API unavailable in this browser');
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: 'Failed to write to clipboard. Please check browser permissions.',
      });
    }
  };

  const handleCopySingleUrl = async (asset: MediaAsset) => {
    const urlToCopy = (asset.secure_url || asset.url).trim();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
        setCopiedId(asset.id);
        setNotification({
          type: 'success',
          message: `Copied URL for "${asset.display_name || asset.filename}" to clipboard.`,
        });
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: 'Failed to copy URL to clipboard.',
      });
    }
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
      if (res.status === 'success') {
        setNotification({ type: 'success', message: res.message });
      } else {
        setNotification({ type: 'info', message: `${res.message} (${res.failed_count} failed)` });
      }
      setMoveModalOpen(false);
      handleClearSelection();
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to move assets' });
    }
  };

  // D. Attach to Product with Cover Selection & Ordering
  const handleOpenAttachModal = () => {
    const ids = Array.from(selectedAssetIds);
    setOrderedAttachIds(ids);
    setAttachCoverAssetId(ids.length > 0 ? ids[0] : null);
    setSelectedProductId(null);
    setReplaceGallery(false);
    setAttachModalOpen(true);
  };

  const handleMoveAttachAsset = (index: number, direction: 'up' | 'down') => {
    setOrderedAttachIds((prev) => {
      const copy = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= copy.length) return prev;
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleBulkAttach = async () => {
    if (!selectedProductId || !orderedAttachIds.length) return;
    setIsAttaching(true);
    try {
      const res = await adminBulkAttachMedia(
        token,
        selectedProductId,
        orderedAttachIds,
        attachCoverAssetId || undefined,
        replaceGallery
      );
      setNotification({
        type: 'success',
        message: `Successfully attached ${res.added_count} media file(s) to "${res.product_name}". Cover image set at sort order 0.`,
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

  // E. Bulk Delete with In-Use Pre-check
  const handleOpenBulkDeleteModal = async () => {
    if (!selectedAssetIds.size) return;
    setIsCheckingUsage(true);
    try {
      const checkRes = await adminCheckMediaUsage(token, Array.from(selectedAssetIds));
      setUsageCheckData(checkRes);
      setForceDeleteConfirm(false);
      setBulkDeleteResult(null);
      setBulkDeleteModalOpen(true);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to verify media references' });
    } finally {
      setIsCheckingUsage(false);
    }
  };

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

  // 6. Complete Resumable Cloudinary Sync
  const handleSyncCloudinary = async () => {
    setIsSyncing(true);
    let cursor: string | undefined = undefined;
    let totalScanned = 0;
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let foldersDiscovered = 0;
    let finalStatus = 'complete';

    try {
      while (true) {
        const res: MediaSyncResponse = await adminSyncCloudinaryMedia(token, cursor, 100, 'all');
        totalScanned += res.total_scanned;
        imported += res.imported;
        updated += res.updated;
        skipped += res.skipped;
        failed += res.failed;
        foldersDiscovered += res.folders_discovered;

        setSyncSummary({
          status: res.status,
          cloud_name: res.cloud_name,
          total_scanned: totalScanned,
          imported,
          updated,
          skipped,
          failed,
          folders_discovered: foldersDiscovered,
          last_synced_at: res.last_synced_at || new Date().toISOString(),
          has_more: res.has_more,
          next_cursor: res.next_cursor,
        });

        if (res.status === 'partial_failure' || res.failed > 0) {
          finalStatus = 'partial_failure';
        }

        if (!res.has_more || !res.next_cursor) {
          break;
        }
        cursor = res.next_cursor;
      }

      await fetchData();
      if (finalStatus === 'complete' && failed === 0) {
        setNotification({
          type: 'success',
          message: `Cloudinary sync complete! Imported ${imported}, updated ${updated}, unchanged ${skipped}.`,
        });
      } else {
        setNotification({
          type: 'info',
          message: `Cloudinary sync completed with ${failed} failure(s). Imported ${imported}, updated ${updated}.`,
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Cloudinary sync failed.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // 7. Prepare Collection Folders Actions
  const handleOpenPrepareModal = async () => {
    setIsLoadingPreview(true);
    try {
      const preview = await adminPreviewPrepareCollectionFolders(token);
      setPreparePreview(preview);
      setPrepareModalOpen(true);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to preview folder structure' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirmPrepareFolders = async () => {
    setIsPreparing(true);
    try {
      const res = await adminPrepareCollectionFolders(token);
      setNotification({
        type: 'success',
        message: `Successfully prepared ${res.created_count} boutique collection and product folders!`,
      });
      setPrepareModalOpen(false);
      await fetchData();
      // Expand root container and navigate to "Photos for royal libas"
      setExpandedFolders(
        (prev) =>
          new Set([
            ...prev,
            'Photos for royal libas',
            'Photos for royal libas/Heavy Dress',
            'Photos for royal libas/Suit Set',
            'Photos for royal libas/Two Pieces',
          ])
      );
      setCurrentFolder('Photos for royal libas');
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to create collection folders' });
    } finally {
      setIsPreparing(false);
    }
  };

  // 8. Folder CRUD Handlers
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

  // 9. Upload Queue Management with Chunking
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

      if (isVideo && file.size > 100 * 1024 * 1024) {
        setNotification({ type: 'error', message: `Video ${file.name} exceeds maximum 100MB limit.` });
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
    const CHUNK_SIZE = 20; // Matches backend MAX_BATCH_FILES
    let totalUploaded = 0;
    let totalFailed = 0;

    try {
      for (let i = 0; i < pendingItems.length; i += CHUNK_SIZE) {
        const chunk = pendingItems.slice(i, i + CHUNK_SIZE);
        const chunkIds = new Set(chunk.map((c) => c.id));

        // Mark current chunk as uploading
        setUploadQueue((prev) =>
          prev.map((item) => (chunkIds.has(item.id) ? { ...item, status: 'uploading', error: undefined } : item))
        );

        try {
          const uploadPayload = chunk.map((item) => ({
            file: item.file,
            clientId: item.id,
          }));

          const batchRes = await adminUploadMediaBatch(token, uploadPayload, uploadDestinationFolder);

          const successIds = new Set(batchRes.uploaded.map((u) => u.client_id).filter(Boolean));
          const failureMap = new Map(batchRes.failed.map((f) => [f.client_id || f.filename, f.error]));

          setUploadQueue((prev) =>
            prev.map((item) => {
              if (chunkIds.has(item.id)) {
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

          totalUploaded += batchRes.success_count;
          totalFailed += batchRes.failure_count;
        } catch (chunkErr: any) {
          setUploadQueue((prev) =>
            prev.map((item) =>
              chunkIds.has(item.id) ? { ...item, status: 'error', error: chunkErr.message || 'Upload failed' } : item
            )
          );
          totalFailed += chunk.length;
        }
      }

      if (totalUploaded > 0) {
        setNotification({
          type: 'success',
          message: `Uploaded ${totalUploaded} file(s) into folder '${uploadDestinationFolder || 'root'}'.`,
        });
        await fetchData();
      }
      if (totalFailed > 0) {
        setNotification({
          type: 'error',
          message: `${totalFailed} file(s) failed upload. You can retry them below.`,
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Batch upload encountered an error' });
    } finally {
      setIsUploading(false);
    }
  };

  // 10. Asset Metadata Edit
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
              <Sparkles className="w-3 h-3 text-[#B58A3C]" />{' '}
              {statusInfo?.folder_mode === 'fixed' ? 'Fixed Folders Mode' : 'Dynamic Asset Folders'}
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
            type="button"
            onClick={handleOpenPrepareModal}
            disabled={isLoadingPreview || isPreparing}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg shadow-2xs transition-colors"
            title="Prepare Royal Libas standard folder structure"
          >
            <Sparkles className="w-4 h-4 text-amber-700" />
            <span>Prepare Boutique Folders</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#5E1224] hover:bg-[#4A0E1C] rounded-lg shadow-2xs transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Photos / Videos</span>
          </button>

          <button
            type="button"
            onClick={handleSyncCloudinary}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-2xs transition-colors disabled:opacity-50"
            title="Scan and reconcile assets uploaded directly to Cloudinary"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#B58A3C] ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Cloudinary'}</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 shadow-xs ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : notification.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {notification.type === 'info' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/5 rounded text-gray-500 hover:text-gray-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sync Summary Progress Banner */}
      {syncSummary && (
        <div className="p-3.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-4 h-4 text-blue-600" />
            <div>
              <span className="font-bold">Sync Status: </span>
              {syncSummary.status === 'complete' ? (
                <span className="text-emerald-700 font-bold">Complete</span>
              ) : syncSummary.status === 'in_progress' ? (
                <span className="text-blue-700 font-bold">Processing batches...</span>
              ) : (
                <span className="text-amber-700 font-bold">Finished with errors</span>
              )}
              <span className="mx-2 text-blue-300">|</span>
              <span>Scanned: {syncSummary.total_scanned}</span>
              <span className="mx-1"></span>
              <span>Imported: {syncSummary.imported}</span>
              <span className="mx-1"></span>
              <span>Updated: {syncSummary.updated}</span>
              <span className="mx-1"></span>
              <span>Unchanged: {syncSummary.skipped}</span>
              {syncSummary.failed > 0 && (
                <>
                  <span className="mx-1"></span>
                  <span className="text-rose-600 font-bold">Failed: {syncSummary.failed}</span>
                </>
              )}
            </div>
          </div>
          <button onClick={() => setSyncSummary(null)} className="text-blue-500 hover:text-blue-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Upload Queue Bar */}
      {uploadQueue.length > 0 && (
        <div className="p-4 bg-white rounded-xl border border-[#E5D9C5] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#B58A3C]" />
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Upload Queue ({uploadQueue.length} files)
              </h3>
              <span className="text-[11px] text-gray-500">
                Destination: <span className="font-semibold text-gray-800">{uploadDestinationFolder || 'Root'}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startUpload}
                disabled={isUploading || !uploadQueue.some((i) => i.status === 'pending' || i.status === 'error')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#5E1224] hover:bg-[#4A0E1C] rounded-lg disabled:opacity-50 transition-colors"
              >
                {isUploading ? 'Uploading in Batches...' : 'Start Upload'}
              </button>
              <button
                type="button"
                onClick={() => setUploadQueue([])}
                disabled={isUploading}
                className="px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Clear Queue
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
            {uploadQueue.map((item) => (
              <div
                key={item.id}
                className="w-20 shrink-0 border border-gray-200 rounded-lg p-1.5 bg-gray-50 relative flex flex-col items-center gap-1"
              >
                <div className="w-full h-14 bg-gray-200 rounded overflow-hidden relative flex items-center justify-center">
                  {item.resourceType === 'video' ? (
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <Film className="w-5 h-5 text-gray-600" />
                      <span className="text-[8px] font-bold">VIDEO</span>
                    </div>
                  ) : (
                    <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                  )}

                  {item.status === 'uploading' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                  {item.status === 'success' && (
                    <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-0.5">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div
                      className="absolute inset-0 bg-rose-500/80 text-white flex items-center justify-center text-center p-1"
                      title={item.error}
                    >
                      <AlertCircle className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <p className="text-[9px] text-gray-700 truncate w-full text-center" title={item.file.name}>
                  {item.file.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Main Work Area: Folder Sidebar + Media Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Recursive Folder Browser */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5] shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <span className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-[#B58A3C]" />
                Boutique Folders
              </span>
              <button
                type="button"
                onClick={() => setNewFolderModal({ isOpen: true, parentPath: currentFolder })}
                className="p-1 text-gray-500 hover:text-[#5E1224] hover:bg-stone-100 rounded-md transition-colors"
                title="Create new folder"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>

            {/* Folder Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter folders..."
                value={folderSearchTerm}
                onChange={(e) => setFolderSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:border-[#B58A3C]"
              />
              {folderSearchTerm && (
                <button
                  type="button"
                  onClick={() => setFolderSearchTerm('')}
                  className="absolute right-2 top-2 text-stone-400 hover:text-stone-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Top Navigation: All Media & Root */}
            <div className="space-y-1 text-xs">
              <button
                type="button"
                onClick={() => navigateToFolder(null)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md font-medium flex items-center justify-between transition-colors ${
                  currentFolder === null
                    ? 'bg-[#5E1224] text-white shadow-2xs font-semibold'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5" />
                  All Library Assets
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    currentFolder === null ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {assets.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => navigateToFolder('')}
                className={`w-full text-left px-2.5 py-1.5 rounded-md font-medium flex items-center justify-between transition-colors ${
                  currentFolder === ''
                    ? 'bg-[#5E1224] text-white shadow-2xs font-semibold'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FolderOpen className="w-3.5 h-3.5" />
                  Root / Uncategorized
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    currentFolder === '' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {assets.filter((a) => !a.folder || a.folder.trim() === '').length}
                </span>
              </button>
            </div>

            {/* Recursive Folder Hierarchy Tree */}
            <div className="pt-2 border-t border-gray-100 space-y-0.5 text-xs max-h-[550px] overflow-y-auto">
              {filteredRootFolders.map((rf) => (
                <FolderTreeNode
                  key={rf.id}
                  folder={rf}
                  level={0}
                  currentFolder={currentFolder}
                  expandedFolders={expandedFolders}
                  childrenMap={folderTree.childrenMap}
                  onSelect={navigateToFolder}
                  onToggleExpand={toggleFolderExpand}
                  onOpenCreate={(parentPath) => setNewFolderModal({ isOpen: true, parentPath })}
                  onOpenRename={(folder) => {
                    setRenameFolderModal(folder);
                    setRenameFolderName(folder.name);
                  }}
                  onDelete={handleDeleteFolder}
                />
              ))}

              {filteredRootFolders.length === 0 && (
                <p className="text-center py-4 text-stone-400 text-xs italic">
                  {folderSearchTerm ? 'No matching folders' : 'No folders created yet'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Breadcrumbs, Filter Bar, Selection Toolbar & Media Grid */}
        <div className="lg:col-span-3 space-y-4">
          {/* Breadcrumbs & Parent Navigation */}
          <div className="bg-white px-4 py-2.5 rounded-xl border border-[#E5D9C5] shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 text-stone-600">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-stone-400" />}
                  <button
                    type="button"
                    onClick={() => navigateToFolder(crumb.path)}
                    className={`hover:text-[#5E1224] transition-colors ${
                      idx === breadcrumbs.length - 1 ? 'font-bold text-[#5E1224]' : 'font-normal'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {parentFolder !== null && (
              <button
                type="button"
                onClick={() => navigateToFolder(parentFolder)}
                className="flex items-center gap-1 text-[11px] font-semibold text-stone-600 hover:text-[#5E1224] bg-stone-100 hover:bg-stone-200/80 px-2.5 py-1 rounded-md transition-colors"
              >
                <ArrowUp className="w-3 h-3" />
                Up to Parent
              </button>
            )}
          </div>

          {/* Filters & Search Toolbar */}
          <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5] shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search filename, title, alt text, public ID..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-[#B58A3C]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-[#B58A3C]"
              >
                <option value="all">All Media Types</option>
                <option value="image">Photos Only</option>
                <option value="video">Videos Only</option>
              </select>

              {/* Usage Filter */}
              <select
                value={usageFilter}
                onChange={(e) => {
                  setUsageFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-[#B58A3C]"
              >
                <option value="all">All Usage Status</option>
                <option value="used">Attached to Products / Storefront</option>
                <option value="unused">Unassigned Only</option>
              </select>

              {/* Sort Order */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-[#B58A3C]"
              >
                <option value="newest">Sort: Newest First</option>
                <option value="oldest">Sort: Oldest First</option>
                <option value="largest">Sort: Largest Size</option>
                <option value="name">Sort: Filename (A-Z)</option>
              </select>
            </div>

            {/* Test records toggle & View mode */}
            <div className="flex items-center gap-2">
              {testRecordCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowTestRecordsOnly(!showTestRecordsOnly)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    showTestRecordsOnly
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  Review Test Records ({testRecordCount})
                </button>
              )}

              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 ${viewMode === 'grid' ? 'bg-[#5E1224] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Grid View"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 ${viewMode === 'list' ? 'bg-[#5E1224] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Multi-Selection Scope Alert (if hidden selections exist) */}
          {hiddenSelectedCount > 0 && (
            <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>
                  <span className="font-bold">{hiddenSelectedCount} selected asset(s)</span> are outside the current folder or search filter.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeselectHidden}
                  className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-semibold text-[11px]"
                >
                  Deselect Hidden
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-2 py-1 bg-white hover:bg-amber-50 border border-amber-300 text-amber-900 rounded font-medium text-[11px]"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}

          {/* Selection Toolbar (when assets are selected) */}
          {selectedAssetIds.size > 0 && (
            <div className="bg-[#FCF8F0] p-3 rounded-xl border border-[#B58A3C]/40 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-[#5E1224] flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-[#B58A3C]" />
                  {selectedAssetIds.size} asset(s) selected
                </span>
                <span className="text-gray-400">|</span>
                <button
                  type="button"
                  onClick={handleSelectPage}
                  className="text-gray-600 hover:text-gray-900 underline font-medium"
                >
                  Select Page ({paginatedAssets.length})
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllInView}
                  className="text-gray-600 hover:text-gray-900 underline font-medium"
                >
                  Select All in View ({filteredAssets.length})
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-rose-700 hover:text-rose-900 font-semibold"
                >
                  Clear
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleBulkCopyUrls}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg font-semibold text-gray-700 shadow-2xs"
                  title="Copy direct delivery URLs to clipboard (one per line)"
                >
                  {copiedBulk ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedBulk ? 'Copied!' : 'Copy URLs'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleBulkExportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg font-semibold text-gray-700 shadow-2xs"
                  title="Export metadata to spreadsheet CSV safely"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMoveModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg font-semibold text-gray-700 shadow-2xs"
                  title="Move selected assets to another folder"
                >
                  <Move className="w-3.5 h-3.5 text-blue-600" />
                  <span>Move</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenAttachModal}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#5E1224] hover:bg-[#4A0E1C] text-white rounded-lg font-semibold shadow-2xs"
                  title="Attach to a product gallery with custom cover selection"
                >
                  <Tag className="w-3.5 h-3.5 text-[#B58A3C]" />
                  <span>Attach to Product</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenBulkDeleteModal}
                  disabled={isCheckingUsage}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-300 hover:bg-rose-100 text-rose-800 rounded-lg font-semibold shadow-2xs disabled:opacity-50"
                  title="Delete assets with in-use protection"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>{isCheckingUsage ? 'Checking...' : 'Delete'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Media Grid / List Content */}
          {loading ? (
            <div className="bg-white rounded-xl border border-[#E5D9C5] p-12 text-center text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#B58A3C] mb-2" />
              <p className="text-xs">Loading media assets...</p>
            </div>
          ) : paginatedAssets.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5D9C5] p-12 text-center text-gray-500 space-y-3">
              <ImageIcon className="w-10 h-10 mx-auto text-gray-300" />
              <p className="text-sm font-semibold text-gray-700">No media assets in this view</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                {currentFolder
                  ? `Folder "${currentFolder}" is currently empty. You can upload photos/videos directly into this folder.`
                  : 'No assets match your search or filter criteria.'}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-[#5E1224] text-white text-xs font-semibold rounded-lg hover:bg-[#4A0E1C]"
              >
                Upload to {currentFolder || 'Root'}
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* GRID VIEW */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3.5">
              {paginatedAssets.map((asset) => {
                const isSelected = selectedAssetIds.has(asset.id);
                const isVideo =
                  asset.resource_type === 'video' || /\.(mp4|webm|mov|ogg)$/i.test(asset.filename);
                const posterUrl = isVideo ? getVideoPoster(asset.secure_url || asset.url) : asset.secure_url || asset.url;
                const isBroken = brokenImages.has(asset.id);

                return (
                  <div
                    key={asset.id}
                    onClick={() => toggleSelectAsset(asset.id)}
                    className={`group bg-white rounded-xl border overflow-hidden shadow-2xs hover:shadow-md transition-all cursor-pointer relative flex flex-col ${
                      isSelected
                        ? 'border-[#B58A3C] ring-2 ring-[#B58A3C]/40 bg-[#FCF8F0]/30'
                        : 'border-[#E5D9C5] hover:border-gray-400'
                    }`}
                  >
                    {/* Media Thumbnail */}
                    <div className="w-full aspect-square bg-gray-100 relative overflow-hidden flex items-center justify-center">
                      {isBroken ? (
                        <div className="flex flex-col items-center justify-center p-2 text-center text-gray-400">
                          <AlertTriangle className="w-5 h-5 text-amber-500 mb-1" />
                          <span className="text-[10px]">Preview unavailable</span>
                        </div>
                      ) : (
                        <img
                          src={posterUrl}
                          alt={asset.alt_text || asset.filename}
                          onError={() => setBrokenImages((prev) => new Set([...prev, asset.id]))}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      )}

                      {/* Video Indicator */}
                      {isVideo && (
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-bold flex items-center gap-1 backdrop-blur-xs">
                          <Play className="w-2.5 h-2.5 fill-white" />
                          {asset.duration ? `${Math.round(Number(asset.duration))}s` : 'VIDEO'}
                        </span>
                      )}

                      {/* Checkbox Overlay */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectAsset(asset.id);
                        }}
                        className={`absolute top-1.5 left-1.5 p-1 rounded-md transition-colors ${
                          isSelected
                            ? 'bg-[#B58A3C] text-black shadow-xs'
                            : 'bg-black/40 text-white hover:bg-black/60 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      </button>

                      {/* Detail Inspection Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(asset);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/40 hover:bg-black/70 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        title="View details & metadata"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Metadata Footer */}
                    <div className="p-2 space-y-1 text-left flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-900 truncate" title={asset.filename}>
                          {asset.display_name || asset.filename}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate" title={asset.folder || 'Root'}>
                          📁 {asset.folder || 'Root'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-100">
                        <span>
                          {asset.width && asset.height ? `${asset.width}${asset.height}` : `${Math.round(asset.file_size / 1024)} KB`}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopySingleUrl(asset);
                          }}
                          className="hover:text-[#5E1224] p-0.5"
                          title="Copy delivery URL"
                        >
                          {copiedId === asset.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* LIST VIEW */
            <div className="bg-white rounded-xl border border-[#E5D9C5] shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FCF8F0] border-b border-[#E5D9C5] text-stone-700 uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3 w-8">
                      <button type="button" onClick={handleSelectPage}>
                        {isAllPageSelected ? <CheckSquare className="w-4 h-4 text-[#B58A3C]" /> : <Square className="w-4 h-4 text-stone-400" />}
                      </button>
                    </th>
                    <th className="py-2.5 px-3">Asset</th>
                    <th className="py-2.5 px-3">Folder</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Dimensions / Size</th>
                    <th className="py-2.5 px-3">Usage</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedAssets.map((asset) => {
                    const isSelected = selectedAssetIds.has(asset.id);
                    const isVideo = asset.resource_type === 'video' || /\.(mp4|webm|mov|ogg)$/i.test(asset.filename);
                    const posterUrl = isVideo ? getVideoPoster(asset.secure_url || asset.url) : asset.secure_url || asset.url;

                    return (
                      <tr
                        key={asset.id}
                        onClick={() => toggleSelectAsset(asset.id)}
                        className={`hover:bg-stone-50 cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#FCF8F0]/40' : ''
                        }`}
                      >
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectAsset(asset.id);
                            }}
                          >
                            {isSelected ? <CheckSquare className="w-4 h-4 text-[#B58A3C]" /> : <Square className="w-4 h-4 text-stone-300" />}
                          </button>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden relative shrink-0">
                              <img src={posterUrl} alt="" className="w-full h-full object-cover" />
                              {isVideo && (
                                <span className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                  <Play className="w-3 h-3 fill-white text-white" />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate" title={asset.filename}>
                                {asset.display_name || asset.filename}
                              </p>
                              <p className="text-[10px] text-gray-400 truncate">{asset.public_id || 'local'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-stone-600 truncate max-w-[150px]" title={asset.folder || 'Root'}>
                          📁 {asset.folder || 'Root'}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isVideo ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                            {isVideo ? 'VIDEO' : (asset.format || 'IMAGE').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-600">
                          {asset.width && asset.height ? `${asset.width}${asset.height} px` : '-'}
                          <span className="text-gray-400 ml-1">({Math.round((asset.file_size || 0) / 1024)} KB)</span>
                        </td>
                        <td className="py-2 px-3">
                          {asset.used_in_products && asset.used_in_products.length > 0 ? (
                            <span className="text-emerald-700 font-semibold" title={asset.used_in_products.map((p) => p.name).join(', ')}>
                              {asset.used_in_products.length} product(s)
                            </span>
                          ) : (
                            <span className="text-gray-400">Unassigned</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopySingleUrl(asset);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-700 rounded"
                              title="Copy URL"
                            >
                              {copiedId === asset.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetail(asset);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-700 rounded"
                              title="Details"
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
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-[#E5D9C5] shadow-xs text-xs text-gray-600">
              <span>
                Showing page <span className="font-bold text-gray-900">{safeCurrentPage}</span> of{' '}
                <span className="font-bold text-gray-900">{totalPages}</span> ({filteredAssets.length} total assets)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  className="px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODALS & OVERLAYS */}
      {/* ========================================================= */}

      {/* 1. Prepare Boutique Collection & Product Folders Modal */}
      {prepareModalOpen && preparePreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-amber-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#FCF8F0]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#B58A3C]" />
                <h3 className="text-sm font-bold text-[#5E1224]">
                  Prepare Boutique Collection & Product Folders
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPrepareModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              <p className="text-gray-600">
                This automated action configures the standard Royal Libas boutique folder structure
                (Heavy Dress, Suit Set, and Two Pieces) in both your database and Cloudinary storage.
                Photos and reels can be organized into these product folders before the product records are created.
              </p>

              {/* Status summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-center">
                  <span className="text-[10px] text-stone-500 uppercase font-semibold">Target Total</span>
                  <p className="text-lg font-bold text-stone-800">{preparePreview.total_target}</p>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <span className="text-[10px] text-emerald-700 uppercase font-semibold">Already Existing</span>
                  <p className="text-lg font-bold text-emerald-800">{preparePreview.existing_count}</p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <span className="text-[10px] text-amber-700 uppercase font-semibold">To Be Created</span>
                  <p className="text-lg font-bold text-amber-800">{preparePreview.to_create_count}</p>
                </div>
              </div>

              {/* Conflicts and Mappings Safety Alert */}
              {preparePreview.conflicts_and_mappings.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    Existing Cloudinary Folders Preserved
                  </div>
                  {preparePreview.conflicts_and_mappings.map((c, i) => (
                    <p key={i} className="text-[11px]">
                       {c.message}
                    </p>
                  ))}
                </div>
              )}

              {/* Missing Folders List Preview */}
              <div className="space-y-1.5">
                <span className="font-bold text-gray-700 uppercase tracking-wider text-[11px]">
                  Folders to Create ({preparePreview.missing_folders.length}):
                </span>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2.5 bg-gray-50 space-y-1 font-mono text-[11px]">
                  {preparePreview.missing_folders.length > 0 ? (
                    preparePreview.missing_folders.map((f, i) => (
                      <div key={i} className="text-stone-700 flex items-center gap-1.5">
                        <FolderPlus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-emerald-700 font-semibold font-sans">
                      All standard boutique folders already exist. No missing folders!
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                type="button"
                onClick={() => setPrepareModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPrepareFolders}
                disabled={isPreparing || preparePreview.to_create_count === 0}
                className="px-5 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-bold hover:bg-[#4A0E1C] disabled:opacity-50"
              >
                {isPreparing ? 'Creating Folders...' : 'Confirm & Create Missing Folders'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Create Folder Modal */}
      {newFolderModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-[#E5D9C5]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-1.5">
                <FolderPlus className="w-4 h-4 text-[#B58A3C]" />
                {newFolderModal.parentPath ? `New Subfolder in "${newFolderModal.parentPath}"` : 'New Top-Level Folder'}
              </h3>
              <button
                onClick={() => setNewFolderModal({ isOpen: false, parentPath: null })}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-gray-700">Folder Name</label>
                <input
                  type="text"
                  placeholder="e.g. 01 - Gulnaar Ruby Red Designer Set"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#B58A3C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewFolderModal({ isOpen: false, parentPath: null })}
                  className="px-3.5 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-4 py-1.5 bg-[#5E1224] text-white rounded-lg font-bold hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Rename Folder Modal */}
      {renameFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-[#E5D9C5]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-1.5">
                <Edit2 className="w-4 h-4 text-[#B58A3C]" />
                Rename Folder
              </h3>
              <button onClick={() => setRenameFolderModal(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRenameFolder} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-gray-700">New Folder Name</label>
                <input
                  type="text"
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  autoFocus
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#B58A3C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameFolderModal(null)}
                  className="px-3.5 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!renameFolderName.trim()}
                  className="px-4 py-1.5 bg-[#5E1224] text-white rounded-lg font-bold hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  Save Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Move Assets Modal */}
      {moveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-[#E5D9C5]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-1.5">
                <Move className="w-4 h-4 text-[#B58A3C]" />
                Move {selectedAssetIds.size} Asset(s)
              </h3>
              <button onClick={() => setMoveModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-gray-600">
                Select the target folder to organize these assets. In dynamic folder mode, moving preserves delivery URLs.
              </p>

              <div>
                <label className="font-semibold text-gray-700">Target Folder</label>
                <select
                  value={targetMoveFolder}
                  onChange={(e) => setTargetMoveFolder(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-[#B58A3C]"
                >
                  <option value="">Root / Uncategorized</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.path}>
                      📁 {f.path}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMoveModalOpen(false)}
                  className="px-3.5 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkMove}
                  className="px-4 py-1.5 bg-[#5E1224] text-white rounded-lg font-bold hover:bg-[#4A0E1C]"
                >
                  Move Assets
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Attach to Product Modal with Ordering & Cover Selection */}
      {attachModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[#E5D9C5]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#FCF8F0]">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#B58A3C]" />
                Attach {orderedAttachIds.length} Asset(s) to Product
              </h3>
              <button onClick={() => setAttachModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              {/* Product Selector with Search */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 uppercase tracking-wider text-[11px]">
                  Select Product
                </label>
                <input
                  type="text"
                  placeholder="Filter product list..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md mb-1.5 focus:outline-none focus:border-[#B58A3C]"
                />
                <select
                  value={selectedProductId || ''}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-[#B58A3C]"
                >
                  <option value="">-- Choose a Product --</option>
                  {products
                    .filter((p) =>
                      productSearchTerm.trim()
                        ? p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                          (p.category || '').toLowerCase().includes(productSearchTerm.toLowerCase())
                        : true
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.category ? `(${p.category})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Gallery Preview, Reordering & Cover Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-gray-700 uppercase tracking-wider text-[11px]">
                    Gallery Order & Primary Cover Selection
                  </label>
                  <span className="text-[10px] text-stone-500">
                    Click Star or card to set primary cover photo
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
                  {orderedAttachIds.map((id, index) => {
                    const a = assets.find((item) => item.id === id);
                    if (!a) return null;
                    const isCover = attachCoverAssetId === a.id;
                    const isVideo = a.resource_type === 'video';
                    const posterUrl = isVideo ? getVideoPoster(a.secure_url || a.url) : a.secure_url || a.url;

                    return (
                      <div
                        key={a.id}
                        className={`p-2 rounded-lg border-2 relative flex flex-col items-center gap-1.5 transition-all ${
                          isCover ? 'border-[#B58A3C] bg-amber-50/50 ring-2 ring-[#B58A3C]/30' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div
                          className="w-full h-20 rounded overflow-hidden relative cursor-pointer"
                          onClick={() => setAttachCoverAssetId(a.id)}
                        >
                          <img src={posterUrl} alt={a.filename} className="w-full h-full object-cover" />
                          {isVideo && (
                            <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/70 text-white text-[8px] font-bold flex items-center gap-0.5">
                              <Film className="w-2.5 h-2.5" /> VIDEO
                            </span>
                          )}
                          {isCover && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-[#B58A3C] text-black text-[9px] font-bold rounded flex items-center gap-1">
                              <Star className="w-3 h-3 fill-black text-black" /> COVER (0)
                            </span>
                          )}
                        </div>

                        <div className="w-full flex items-center justify-between text-[10px] text-gray-600">
                          <span className="truncate flex-1 font-medium" title={a.filename}>
                            {a.display_name || a.filename}
                          </span>
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            <button
                              type="button"
                              onClick={() => handleMoveAttachAsset(index, 'up')}
                              disabled={index === 0}
                              className="p-0.5 text-gray-500 hover:text-black disabled:opacity-20"
                              title="Move left"
                            >
                              <ArrowUp className="w-3 h-3 -rotate-90" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveAttachAsset(index, 'down')}
                              disabled={index === orderedAttachIds.length - 1}
                              className="p-0.5 text-gray-500 hover:text-black disabled:opacity-20"
                              title="Move right"
                            >
                              <ArrowDown className="w-3 h-3 -rotate-90" />
                            </button>
                          </div>
                        </div>
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
                    ? 'Caution: All existing images on this product will be replaced with these selected assets.'
                    : 'Default (Append Mode): Selected cover photo will become the product cover (sort order 0). Existing photos will be preserved and shifted sequentially without creating duplicates.'}
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

      {/* 6. Bulk Delete Modal with In-Use Reference Verification */}
      {bulkDeleteModalOpen && usageCheckData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-rose-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Delete {usageCheckData.total_checked} Media Asset(s)
              </h3>
              <button onClick={() => setBulkDeleteModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-600">
              <p>
                You have requested deletion for <span className="font-bold text-gray-900">{usageCheckData.total_checked} asset(s)</span>.
              </p>

              {/* In-Use Usage Warning */}
              {usageCheckData.in_use_count > 0 ? (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    In-Use Protection Active ({usageCheckData.in_use_count} asset(s) in use)
                  </div>
                  <p className="text-[11px]">
                    The following selected asset(s) are actively displayed on live products or homepage posters:
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1 pl-2 text-[11px]">
                    {usageCheckData.usage_details.map((u) => (
                      <div key={u.asset_id}>
                        <span className="font-semibold">{u.filename}</span>: Used in {u.locations.join(', ')}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold text-emerald-800 pt-1">
                    Ordinary safe delete will protect these {usageCheckData.in_use_count} in-use items and delete only the {usageCheckData.safe_count} unreferenced asset(s).
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900">
                  <p className="text-[11px] font-medium">
                    All {usageCheckData.total_checked} selected assets are unreferenced and completely safe to delete.
                  </p>
                </div>
              )}

              {/* Force Delete Toggle */}
              {usageCheckData.in_use_count > 0 && (
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
                    Warning: Force deletion permanently clears image references from active products and boutique banners.
                  </p>
                </div>
              )}

              {/* Previous Result Summary if applicable */}
              {bulkDeleteResult && (
                <div className="p-2.5 rounded bg-gray-50 border border-gray-200 space-y-1 text-[11px]">
                  <div className="font-bold text-gray-800">Result:</div>
                  <div>Deleted: {bulkDeleteResult.deleted_ids.length}</div>
                  <div>Skipped (In-Use): {bulkDeleteResult.skipped_in_use.length}</div>
                  {bulkDeleteResult.skipped_in_use.map((s: any) => (
                    <div key={s.id} className="text-gray-500 pl-2">
                       {s.filename} (Used in: {s.locations.join(', ')})
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
                {isBulkDeleting
                  ? 'Deleting...'
                  : forceDeleteConfirm
                  ? 'Force Delete All'
                  : `Safe Delete (${usageCheckData.safe_count} Unused)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Asset Detail & Metadata Modal */}
      {detailAsset && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[#E5D9C5]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#FCF8F0]">
              <h3 className="text-sm font-bold text-[#5E1224] flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#B58A3C]" />
                Media Details: {detailAsset.display_name || detailAsset.filename}
              </h3>
              <button onClick={() => setDetailAsset(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="flex flex-col sm:flex-row gap-5">
                {/* Preview */}
                <div className="w-full sm:w-1/2 aspect-square bg-gray-100 rounded-xl overflow-hidden relative flex items-center justify-center border border-gray-200">
                  {detailAsset.resource_type === 'video' ? (
                    <video
                      src={detailAsset.secure_url || detailAsset.url}
                      poster={getVideoPoster(detailAsset.secure_url || detailAsset.url)}
                      controls
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={detailAsset.secure_url || detailAsset.url}
                      alt={detailAsset.alt_text || detailAsset.filename}
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                {/* Metadata Fields */}
                <div className="w-full sm:w-1/2 space-y-3">
                  {isEditingMetadata ? (
                    <div className="space-y-3">
                      <div>
                        <label className="font-bold text-gray-700 uppercase tracking-wider text-[10px]">
                          Display Title
                        </label>
                        <input
                          type="text"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:border-[#B58A3C]"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-gray-700 uppercase tracking-wider text-[10px]">
                          Alt Text
                        </label>
                        <input
                          type="text"
                          value={editAltText}
                          onChange={(e) => setEditAltText(e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:border-[#B58A3C]"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleSaveMetadata}
                          disabled={isSavingMetadata}
                          className="px-3.5 py-1.5 bg-[#5E1224] text-white rounded font-bold hover:bg-[#4A0E1C] disabled:opacity-50"
                        >
                          {isSavingMetadata ? 'Saving...' : 'Save Details'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingMetadata(false)}
                          className="px-3.5 py-1.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-700">Display Title:</span>
                        <button
                          type="button"
                          onClick={() => setIsEditingMetadata(true)}
                          className="text-[#5E1224] hover:underline flex items-center gap-1 font-semibold text-[11px]"
                        >
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                      </div>
                      <p className="font-semibold text-gray-900 bg-gray-50 p-2 rounded border border-gray-200">
                        {detailAsset.display_name || detailAsset.filename}
                      </p>

                      <span className="font-bold text-gray-700">Folder Path:</span>
                      <p className="text-gray-800 font-mono text-[11px]">📁 {detailAsset.folder || 'Root'}</p>

                      <span className="font-bold text-gray-700">Cloudinary Public ID:</span>
                      <p className="text-gray-800 font-mono text-[11px] truncate" title={detailAsset.public_id || ''}>
                        {detailAsset.public_id || 'Not assigned'}
                      </p>

                      <span className="font-bold text-gray-700">Dimensions & Format:</span>
                      <p className="text-gray-800">
                        {detailAsset.width && detailAsset.height ? `${detailAsset.width}  ${detailAsset.height} px` : 'N/A'}{' '}
                         {detailAsset.format?.toUpperCase() || detailAsset.resource_type.toUpperCase()}
                      </p>

                      <span className="font-bold text-gray-700">File Size:</span>
                      <p className="text-gray-800">{Math.round((detailAsset.file_size || 0) / 1024)} KB</p>

                      {detailAsset.duration && (
                        <>
                          <span className="font-bold text-gray-700">Duration:</span>
                          <p className="text-gray-800">{detailAsset.duration} seconds</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Delivery URL */}
                  <div className="pt-2 border-t border-gray-100 space-y-1">
                    <span className="font-bold text-gray-700 text-[10px] uppercase">Direct Delivery URL:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        readOnly
                        value={detailAsset.secure_url || detailAsset.url}
                        className="w-full px-2 py-1 bg-gray-50 border border-gray-200 rounded font-mono text-[10px] truncate"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopySingleUrl(detailAsset)}
                        className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded shrink-0"
                        title="Copy URL"
                      >
                        {copiedId === detailAsset.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end px-6 py-3 border-t border-gray-100 bg-gray-50">
              <button
                type="button"
                onClick={() => setDetailAsset(null)}
                className="px-4 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminMedia;
