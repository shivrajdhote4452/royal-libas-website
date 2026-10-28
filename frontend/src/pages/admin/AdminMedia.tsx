import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Video as VideoIcon,
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
} from 'lucide-react';
import {
  adminListMedia,
  adminUploadMediaBatch,
  adminDeleteMedia,
} from '../../lib/api';
import { MediaAsset } from '../../types/product';

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  resourceType: 'image' | 'video';
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export const AdminMedia: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');

  // Multi-upload queue state
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Interaction feedback states
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Video preview modal
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);

  // Delete confirmation modal
  const [deleteConfirmAsset, setDeleteConfirmAsset] = useState<MediaAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const data = await adminListMedia(token);
      setAssets(data);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load media assets' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, [token]);

  // Handle files selected via file input or drag-and-drop
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

      // Check sizes: 10MB images (Cloudinary Free limit), 60MB videos
      if (isImage && file.size > 10 * 1024 * 1024) {
        setNotification({ type: 'error', message: `Photo ${file.name} exceeds maximum 10MB limit for images.` });
        continue;
      }
      if (isVideo && file.size > 60 * 1024 * 1024) {
        setNotification({ type: 'error', message: `Video ${file.name} exceeds maximum 60MB limit.` });
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      newItems.push({
        id: `${file.name}_${file.size}_${Date.now()}_${Math.random()}`,
        file,
        previewUrl,
        resourceType: isVideo ? 'video' : 'image',
        status: 'pending',
      });
    }

    if (newItems.length > 0) {
      setUploadQueue((prev) => [...prev, ...newItems]);
      setNotification(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const removeFromQueue = (id: string) => {
    setUploadQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearCompletedQueue = () => {
    setUploadQueue((prev) => {
      prev.filter((i) => i.status === 'success').forEach((i) => URL.revokeObjectURL(i.previewUrl));
      return prev.filter((i) => i.status !== 'success');
    });
  };

  // Process the queue: upload files in batches or sequentially
  const startUpload = async () => {
    const pendingItems = uploadQueue.filter((i) => i.status === 'pending' || i.status === 'error');
    if (!pendingItems.length) return;

    setIsUploading(true);
    setNotification(null);

    // Mark as uploading
    setUploadQueue((prev) =>
      prev.map((item) =>
        item.status === 'pending' || item.status === 'error'
          ? { ...item, status: 'uploading', error: undefined }
          : item
      )
    );

    try {
      const itemsToUpload = pendingItems.map((i) => ({ file: i.file, clientId: i.id }));
      const batchRes = await adminUploadMediaBatch(token, itemsToUpload);

      // Map results back to queue items using clientId first for precise duplicate handling
      const successCids = new Set(
        batchRes.uploaded
          .map((u) => u.client_id)
          .filter((cid): cid is string => Boolean(cid))
      );
      const failureMap = new Map<string, string>();
      batchRes.failed.forEach((f) => {
        if (f.client_id) {
          failureMap.set(f.client_id, f.error);
        } else {
          failureMap.set(f.filename, f.error);
        }
      });

      const successFilenames = new Set(batchRes.uploaded.map((u) => u.filename));

      setUploadQueue((prev) =>
        prev.map((item) => {
          if (item.status === 'uploading') {
            if (successCids.has(item.id)) {
              return { ...item, status: 'success' };
            }
            if (failureMap.has(item.id)) {
              return { ...item, status: 'error', error: failureMap.get(item.id) };
            }
            // Fallback to filename matching if server did not echo client_id
            if (successFilenames.has(item.file.name) && !failureMap.has(item.file.name)) {
              return { ...item, status: 'success' };
            }
            if (failureMap.has(item.file.name)) {
              return { ...item, status: 'error', error: failureMap.get(item.file.name) };
            }
            // Never assume success if result could not be confirmed
            return { ...item, status: 'error', error: 'Upload status unconfirmed by server.' };
          }
          return item;
        })
      );

      if (batchRes.success_count > 0) {
        setNotification({
          type: 'success',
          message: `Successfully uploaded ${batchRes.success_count} media file${batchRes.success_count > 1 ? 's' : ''} to Cloudinary.`,
        });
        await fetchMedia();
      }
      if (batchRes.failure_count > 0) {
        setNotification({
          type: 'error',
          message: `${batchRes.failure_count} file${batchRes.failure_count > 1 ? 's' : ''} failed to upload. See error details in queue.`,
        });
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

  const handleDeleteRequest = (asset: MediaAsset) => {
    setDeleteConfirmAsset(asset);
  };

  const confirmDelete = async (force: boolean = false) => {
    if (!deleteConfirmAsset) return;
    setIsDeleting(true);
    try {
      await adminDeleteMedia(token, deleteConfirmAsset.id, force);
      setNotification({
        type: 'success',
        message: `Asset ${deleteConfirmAsset.filename} permanently deleted from Cloudinary.`,
      });
      setDeleteConfirmAsset(null);
      await fetchMedia();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete asset' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyUrl = (asset: MediaAsset) => {
    const fullUrl = asset.url.startsWith('http') ? asset.url : `${API_BASE_URL}${asset.url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Filtered Assets
  const filteredAssets = assets.filter((asset) => {
    // Type Filter
    const assetType = asset.resource_type || (asset.url.match(/\.(mp4|webm|mov|ogg)$/i) ? 'video' : 'image');
    if (typeFilter !== 'all' && assetType !== typeFilter) return false;

    // Usage Filter
    const isUsed = asset.used_in_products && asset.used_in_products.length > 0;
    if (usageFilter === 'used' && !isUsed) return false;
    if (usageFilter === 'unused' && isUsed) return false;

    // Search Query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = asset.filename.toLowerCase().includes(q);
      const matchAlt = asset.alt_text ? asset.alt_text.toLowerCase().includes(q) : false;
      const matchPublicId = asset.public_id ? asset.public_id.toLowerCase().includes(q) : false;
      if (!matchName && !matchAlt && !matchPublicId) return false;
    }

    return true;
  });

  const photoCount = assets.filter((a) => (a.resource_type || 'image') === 'image').length;
  const videoCount = assets.filter((a) => (a.resource_type || '') === 'video').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-[#B58A3C]" />
            Cloudinary Media Library
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Store and deliver ultra-fast, high-resolution luxury product photography and showcase videos powered by Cloudinary.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
            className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C] transition-colors shadow-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            Select Files (Photos & Videos)
          </button>
          <button
            onClick={fetchMedia}
            disabled={loading}
            className="p-2 bg-white border border-[#E5D9C5] rounded-lg text-gray-600 hover:bg-[#FCF8F0] transition-colors disabled:opacity-50"
            title="Refresh library"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between shadow-sm ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
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
          <button onClick={() => setNotification(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all text-center flex flex-col items-center justify-center gap-2 ${
          isDragging
            ? 'border-[#5E1224] bg-[#5E1224]/5 scale-[1.01]'
            : 'border-[#E5D9C5] bg-[#FCF8F0]/30 hover:bg-[#FCF8F0]/60 hover:border-[#B58A3C]'
        }`}
      >
        <div className="w-12 h-12 rounded-full bg-[#5E1224]/10 flex items-center justify-center text-[#5E1224] mb-1">
          <Upload className="w-6 h-6" />
        </div>
        <div className="font-semibold text-gray-900 text-sm">
          Drag & drop multiple photos or videos here, or <span className="text-[#5E1224] underline">browse</span>
        </div>
        <p className="text-[11px] text-gray-500 max-w-md">
          Supports multi-file uploads: JPEG, PNG, WebP (up to 10MB) and MP4, MOV, WebM videos (up to 60MB).
          Assets are uploaded and optimized via Cloudinary CDN.
        </p>
      </div>

      {/* Upload Queue Section (shown when files are in queue) */}
      {uploadQueue.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E5D9C5] shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-900">Upload Queue ({uploadQueue.length})</span>
              <span className="text-[11px] text-gray-500">
                {uploadQueue.filter((i) => i.status === 'success').length} done,{' '}
                {uploadQueue.filter((i) => i.status === 'pending' || i.status === 'uploading').length} pending
              </span>
            </div>
            <div className="flex items-center gap-2">
              {uploadQueue.some((i) => i.status === 'success') && (
                <button
                  type="button"
                  onClick={clearCompletedQueue}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto pr-1">
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
                    {item.status === 'pending' && (
                      <span className="text-[10px] text-gray-500 font-medium">Ready</span>
                    )}
                    {item.status === 'uploading' && (
                      <span className="text-[10px] text-[#5E1224] font-medium flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Uploading...
                      </span>
                    )}
                    {item.status === 'success' && (
                      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Uploaded
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
                    onClick={() => removeFromQueue(item.id)}
                    className="absolute top-1.5 right-1.5 p-1 text-gray-400 hover:text-rose-600 rounded"
                    title="Remove from queue"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Type & Usage Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-[#FCF8F0] p-1 rounded-lg border border-[#E5D9C5]/60 text-xs">
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
              <ImageIcon className="w-3.5 h-3.5" />
              Photos ({photoCount})
            </button>
            <button
              onClick={() => setTypeFilter('video')}
              className={`px-3 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                typeFilter === 'video' ? 'bg-[#5E1224] text-white shadow-xs' : 'text-gray-700 hover:text-black'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Videos ({videoCount})
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
              In Products
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
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Search by name or tag..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
          />
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Assets Grid */}
      {loading ? (
        <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
          <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
          Loading media library...
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
          <ImageIcon className="w-10 h-10 text-gray-300" />
          <p className="font-semibold text-gray-700">No media assets match your criteria</p>
          <p className="text-[11px] text-gray-400">
            {assets.length === 0
              ? 'Drop or select files above to store product photos and lookbook videos in Cloudinary.'
              : 'Try clearing the search or switching filter tabs.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredAssets.map((asset) => {
            const isVideo = asset.resource_type === 'video' || asset.url.match(/\.(mp4|webm|mov|ogg)$/i);
            const displayUrl = asset.url.startsWith('http') ? asset.url : `${API_BASE_URL}${asset.url}`;
            const posterUrl = isVideo
              ? asset.url.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg')
              : displayUrl;
            const hasUsage = asset.used_in_products && asset.used_in_products.length > 0;

            return (
              <div
                key={asset.id}
                className="bg-white rounded-xl border border-[#E5D9C5]/80 overflow-hidden shadow-sm hover:border-[#5E1224]/50 hover:shadow-md transition-all flex flex-col justify-between group"
              >
                {/* Visual Thumbnail */}
                <div className="relative aspect-square bg-[#FCF8F0] overflow-hidden flex items-center justify-center">
                  <img
                    src={posterUrl}
                    alt={asset.alt_text || asset.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as any).src = 'https://placehold.co/400x400?text=Asset+Preview';
                    }}
                  />

                  {/* Video Play Badge overlay */}
                  {isVideo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center shadow-lg backdrop-blur-xs group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </div>
                    </div>
                  )}

                  {/* Resource Type Tag */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs tracking-wider uppercase ${
                        isVideo
                          ? 'bg-amber-600 text-white'
                          : 'bg-[#5E1224] text-white'
                      }`}
                    >
                      {isVideo ? 'VIDEO' : 'IMAGE'}
                    </span>
                  </div>

                  {/* Product Usage Badge */}
                  {hasUsage ? (
                    <div className="absolute top-2 right-2 bg-emerald-700/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1 backdrop-blur-xs">
                      <Tag className="w-2.5 h-2.5" />
                      In {asset.used_in_products!.length} {asset.used_in_products!.length === 1 ? 'Product' : 'Products'}
                    </div>
                  ) : (
                    <div className="absolute top-2 right-2 bg-gray-600/75 text-white text-[9px] px-1.5 py-0.5 rounded shadow-xs">
                      Unused
                    </div>
                  )}

                  {/* Hover Action Bar */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                    {isVideo && (
                      <button
                        onClick={() => setPreviewVideo({ url: displayUrl, title: asset.filename })}
                        className="p-2 bg-white/90 text-gray-900 rounded-lg hover:bg-white transition-colors"
                        title="Play video"
                      >
                        <Play className="w-4 h-4 fill-gray-900" />
                      </button>
                    )}
                    <button
                      onClick={() => handleCopyUrl(asset)}
                      className="p-2 bg-white/90 text-gray-800 rounded-lg hover:bg-white transition-colors"
                      title="Copy URL"
                    >
                      {copiedId === asset.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteRequest(asset)}
                      className="p-2 bg-rose-600/90 text-white rounded-lg hover:bg-rose-600 transition-colors"
                      title="Delete asset"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="p-2.5 bg-white border-t border-gray-100 text-xs">
                  <div className="font-semibold text-gray-900 truncate" title={asset.filename}>
                    {asset.filename}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                    <span>{formatFileSize(asset.file_size)}</span>
                    {asset.width && asset.height && (
                      <span>{asset.width}×{asset.height}</span>
                    )}
                    {asset.duration && (
                      <span>{Math.round(asset.duration)}s</span>
                    )}
                  </div>

                  {/* Product Usage Pill List if any */}
                  {hasUsage && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-50 flex flex-wrap gap-1">
                      {asset.used_in_products!.slice(0, 2).map((p) => (
                        <span
                          key={p.id}
                          className="text-[9px] bg-[#FCF8F0] text-[#5E1224] px-1.5 py-0.5 rounded border border-[#E5D9C5]/50 truncate max-w-[120px]"
                          title={p.name}
                        >
                          {p.name}
                        </span>
                      ))}
                      {asset.used_in_products!.length > 2 && (
                        <span className="text-[9px] text-gray-400">
                          +{asset.used_in_products!.length - 2} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Player Modal */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl border border-gray-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-3 bg-gray-900 text-white flex items-center justify-between">
              <span className="text-xs font-semibold truncate flex items-center gap-2">
                <VideoIcon className="w-4 h-4 text-[#B58A3C]" />
                {previewVideo.title}
              </span>
              <button
                onClick={() => setPreviewVideo(null)}
                className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-black aspect-video flex items-center justify-center">
              <video
                src={previewVideo.url}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
            <div className="p-3 bg-gray-50 text-right">
              <button
                onClick={() => setPreviewVideo(null)}
                className="px-4 py-1.5 bg-gray-800 text-white rounded text-xs hover:bg-gray-700"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmAsset && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900">Delete Media Asset</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Are you sure you want to permanently delete <strong className="text-gray-900">{deleteConfirmAsset.filename}</strong> from Cloudinary?
                </p>

                {deleteConfirmAsset.used_in_products && deleteConfirmAsset.used_in_products.length > 0 && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      Notice: Asset in active use
                    </div>
                    <p className="text-[11px] text-amber-800">
                      This asset is currently displayed in {deleteConfirmAsset.used_in_products.length} product(s):
                    </p>
                    <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5 max-h-24 overflow-y-auto">
                      {deleteConfirmAsset.used_in_products.map((p) => (
                        <li key={p.id}>{p.name}</li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-amber-700 font-medium pt-1">
                      Deleting will also remove this asset from the product galleries above.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmAsset(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(Boolean(deleteConfirmAsset.used_in_products?.length))}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting from Cloudinary...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    {deleteConfirmAsset.used_in_products?.length ? 'Force Delete & Remove' : 'Delete Permanently'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
