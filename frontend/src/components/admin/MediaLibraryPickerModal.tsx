import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Folder,
  FolderOpen,
  ChevronRight,
  Check,
  Play,
  Film,
  Image as ImageIcon,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { adminListMedia, adminListMediaFolders } from '../../lib/api';
import { MediaAsset, MediaFolder } from '../../types/product';

export function getVideoPoster(url?: string | null): string {
  if (!url) return '';
  if (url.includes('cloudinary.com') && url.includes('/video/upload/')) {
    let p = url.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg');
    if (!p.includes('/so_0')) {
      p = p.replace('/video/upload/', '/video/upload/so_0,f_jpg,q_auto/');
    }
    return p;
  }
  return url.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg');
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || isNaN(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function getAssetKey(asset: {
  resource_type?: string | null;
  filename?: string;
  url: string;
  secure_url?: string | null;
  public_id?: string | null;
}): string {
  const isVid =
    asset.resource_type === 'video' ||
    /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(asset.filename || asset.url);
  const rType = isVid ? 'video' : 'image';
  if (asset.public_id) {
    return `${rType}:${asset.public_id}`;
  }
  const rawUrl = asset.secure_url || asset.url;
  return `${rType}:${rawUrl.split('?')[0]}`;
}

interface MediaLibraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedAssets: MediaAsset[]) => void;
  targetId?: string | number | null;
  alreadySelectedKeys?: Set<string>;
  title?: string;
}

export const MediaLibraryPickerModal: React.FC<MediaLibraryPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  targetId,
  alreadySelectedKeys = new Set(),
  title = 'Select from Media Library',
}) => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Folder navigation state: null = all media, "" = root uncategorized, or folder path
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 18;

  // Selected assets state map (assetId -> MediaAsset)
  const [selectedMap, setSelectedMap] = useState<Map<number, MediaAsset>>(new Map());

  // Session tracking: reset temporary selection when modal opens or target product switches.
  // Preserves selection across folder navigation, search, filters, and pagination within the same session.
  const prevTargetRef = React.useRef<string | number | null | undefined>(undefined);
  const prevOpenRef = React.useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && (!prevOpenRef.current || prevTargetRef.current !== targetId)) {
      setSelectedMap(new Map());
    }
    prevOpenRef.current = isOpen;
    prevTargetRef.current = targetId;
  }, [isOpen, targetId]);

  const handleCancel = () => {
    setSelectedMap(new Map());
    onClose();
  };

  const handleConfirm = () => {
    const chosen = Array.from(selectedMap.values());
    setSelectedMap(new Map());
    onSelect(chosen);
    onClose();
  };

  // ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Load media and folders on open
  useEffect(() => {
    if (!isOpen) return;
    const loadMediaData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [mediaList, folderList] = await Promise.all([
          adminListMedia(token, { sort_by: 'newest', hide_samples: false }),
          adminListMediaFolders(token).catch(() => []),
        ]);
        setAssets(mediaList);
        setFolders(folderList);
      } catch (err: any) {
        setError(err.message || 'Failed to load media assets');
      } finally {
        setLoading(false);
      }
    };
    loadMediaData();
  }, [isOpen, token]);

  // Reset pagination when folder, filter, or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [currentFolder, searchTerm, typeFilter]);

  // Compute subfolders of the current folder
  const currentSubfolders = useMemo(() => {
    if (currentFolder === null) {
      // At root view, show top-level folders (those without '/' in path)
      return folders.filter((f) => !f.path.includes('/'));
    }
    const prefix = currentFolder + '/';
    return folders.filter((f) => {
      if (!f.path.startsWith(prefix)) return false;
      const remainder = f.path.slice(prefix.length);
      return !remainder.includes('/');
    });
  }, [folders, currentFolder]);

  // Breadcrumbs breakdown
  const breadcrumbSegments = useMemo(() => {
    if (!currentFolder) return [];
    const parts = currentFolder.split('/');
    const accum: { name: string; path: string }[] = [];
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      accum.push({ name: part, path: cur });
    }
    return accum;
  }, [currentFolder]);

  // Filtered assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Folder filter
      if (currentFolder !== null) {
        const assetFolder = (asset.folder || '').trim();
        const inThisFolder =
          assetFolder === currentFolder || assetFolder.startsWith(currentFolder + '/');
        if (!inThisFolder) return false;
      }

      // Resource type filter
      if (typeFilter !== 'all') {
        const isVideo =
          asset.resource_type === 'video' ||
          /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(asset.filename || asset.url);
        if (typeFilter === 'video' && !isVideo) return false;
        if (typeFilter === 'image' && isVideo) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const fn = (asset.filename || '').toLowerCase();
        const dn = (asset.display_name || '').toLowerCase();
        const fol = (asset.folder || '').toLowerCase();
        const pid = (asset.public_id || '').toLowerCase();
        if (!fn.includes(q) && !dn.includes(q) && !fol.includes(q) && !pid.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [assets, currentFolder, typeFilter, searchTerm]);

  // Pagination calculation
  const totalItems = filteredAssets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssets.slice(start, start + pageSize);
  }, [filteredAssets, currentPage, pageSize]);

  // Selection toggles
  const toggleSelectAsset = (asset: MediaAsset) => {
    const key = getAssetKey(asset);
    if (alreadySelectedKeys.has(key)) {
      return;
    }
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.set(asset.id, asset);
      }
      return next;
    });
  };

  const handleSelectPage = () => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      paginatedAssets.forEach((a) => {
        const key = getAssetKey(a);
        if (!alreadySelectedKeys.has(key)) {
          next.set(a.id, a);
        }
      });
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedMap(new Map());
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-picker-title"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-[#E8DFD0] flex flex-col w-full max-w-5xl h-[92vh] max-h-[820px] overflow-hidden text-gray-800">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E8DFD0] bg-[#FAF5EC] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#5E1224] text-white flex items-center justify-center shadow-xs">
              <ImageIcon className="w-4 h-4 text-[#E8DFD0]" />
            </div>
            <div>
              <h2 id="media-picker-title" className="font-serif font-bold text-base text-[#5E1224] leading-tight">
                {title}
              </h2>
              <p className="text-[11px] text-gray-500">
                Browse curated boutique folders, select photos & videos to attach without duplicate uploads.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-lg transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-4 py-2.5 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {/* Breadcrumbs & Navigation */}
          <div className="flex items-center gap-1.5 text-xs text-gray-600 overflow-x-auto py-1 max-w-full">
            <button
              type="button"
              onClick={() => setCurrentFolder(null)}
              className={`px-2 py-1 rounded font-medium transition-colors shrink-0 ${
                currentFolder === null
                  ? 'bg-[#5E1224]/10 text-[#5E1224] font-semibold'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              All Media ({assets.length})
            </button>
            {breadcrumbSegments.map((seg, i) => (
              <React.Fragment key={seg.path}>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => setCurrentFolder(seg.path)}
                  className={`px-2 py-1 rounded font-medium transition-colors shrink-0 ${
                    i === breadcrumbSegments.length - 1
                      ? 'bg-[#5E1224]/10 text-[#5E1224] font-semibold'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {seg.name}
                </button>
              </React.Fragment>
            ))}
            {currentFolder && (
              <button
                type="button"
                onClick={() => {
                  const parts = currentFolder.split('/');
                  parts.pop();
                  setCurrentFolder(parts.length > 0 ? parts.join('/') : null);
                }}
                className="ml-1 inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-50"
                title="Go up one folder"
              >
                <ArrowLeft className="w-3 h-3" /> Up
              </button>
            )}
          </div>

          {/* Search, Type Filter & Quick Selection */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* Filter Tabs */}
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  typeFilter === 'all' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('image')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  typeFilter === 'image' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Photos
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('video')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  typeFilter === 'video' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Videos
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search filename or folder..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs border border-gray-300 rounded-lg w-44 sm:w-56 focus:outline-none focus:border-[#5E1224] focus:ring-1 focus:ring-[#5E1224]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Select This Page & Clear */}
            <button
              type="button"
              onClick={handleSelectPage}
              className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs"
              title="Select all items visible on this page"
            >
              Select Page
            </button>
            {selectedMap.size > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Subfolders Quick Drilldown Bar */}
        {currentSubfolders.length > 0 && (
          <div className="px-4 py-2 bg-stone-50/70 border-b border-stone-200 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Folder className="w-3.5 h-3.5 text-[#B58A3C]" /> Subfolders:
              </span>
              {currentSubfolders.map((folder) => {
                const folderName = folder.path.split('/').pop() || folder.path;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setCurrentFolder(folder.path)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-stone-200 hover:border-[#B58A3C] hover:bg-[#FAF5EC] text-stone-700 transition-colors shrink-0 shadow-2xs"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#B58A3C]" />
                    <span>{folderName}</span>
                    <span className="text-[10px] text-stone-400 bg-stone-100 px-1 rounded-full">
                      {folder.asset_count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Media Grid Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#FCF8F0]/30 min-h-0">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-gray-500 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-[#5E1224]" />
              <p className="text-xs">Loading media library assets...</p>
            </div>
          ) : error ? (
            <div className="h-64 flex flex-col items-center justify-center text-red-600 gap-2">
              <AlertCircle className="w-8 h-8" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          ) : paginatedAssets.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
              <ImageIcon className="w-10 h-10 stroke-1 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No media found</p>
              <p className="text-xs text-gray-400">
                {searchTerm
                  ? `No assets match "${searchTerm}" in this folder.`
                  : 'This folder does not contain any media matching the selected filter.'}
              </p>
              {currentFolder && (
                <button
                  type="button"
                  onClick={() => setCurrentFolder(null)}
                  className="mt-2 text-xs text-[#5E1224] hover:underline font-semibold"
                >
                  View All Media
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {paginatedAssets.map((asset) => {
                const assetKey = getAssetKey(asset);
                const isAlreadyInGallery = alreadySelectedKeys.has(assetKey);
                const isSelected = selectedMap.has(asset.id);
                const isVideo =
                  asset.resource_type === 'video' ||
                  /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(asset.filename || asset.url);
                const posterUrl = isVideo ? getVideoPoster(asset.url) : asset.secure_url || asset.url;

                return (
                  <div
                    key={asset.id}
                    onClick={() => {
                      if (!isAlreadyInGallery) {
                        toggleSelectAsset(asset);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === ' ' || e.key === 'Enter') && !isAlreadyInGallery) {
                        e.preventDefault();
                        toggleSelectAsset(asset);
                      }
                    }}
                    tabIndex={isAlreadyInGallery ? -1 : 0}
                    role="checkbox"
                    aria-checked={isSelected || isAlreadyInGallery}
                    aria-disabled={isAlreadyInGallery}
                    title={
                      isAlreadyInGallery
                        ? 'Already attached to this product gallery'
                        : asset.display_name || asset.filename
                    }
                    className={`group relative bg-white rounded-lg border overflow-hidden flex flex-col transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#5E1224] ${
                      isAlreadyInGallery
                        ? 'border-[#B58A3C]/40 bg-[#FAF5EC]/40 opacity-75 cursor-default'
                        : isSelected
                        ? 'border-[#5E1224] ring-2 ring-[#5E1224]/30 shadow-md scale-[1.01] cursor-pointer'
                        : 'border-gray-200 hover:border-gray-400 hover:shadow-xs cursor-pointer'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[4/5] bg-gray-100 relative overflow-hidden">
                      <img
                        src={posterUrl}
                        alt={asset.display_name || asset.filename}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />

                      {/* Video Indicator */}
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-2xs shadow">
                            <Play className="w-4 h-4 fill-white ml-0.5" />
                          </span>
                        </div>
                      )}

                      {/* Top Checkbox Overlay */}
                      <div className="absolute top-1.5 right-1.5">
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center transition-colors shadow-xs ${
                            isAlreadyInGallery
                              ? 'bg-[#B58A3C] text-white'
                              : isSelected
                              ? 'bg-[#5E1224] text-white'
                              : 'bg-white/90 text-gray-400 border border-gray-300 group-hover:border-gray-500'
                          }`}
                        >
                          {(isSelected || isAlreadyInGallery) && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>

                      {/* Video Duration / Type Badge */}
                      {isVideo && (
                        <span className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 backdrop-blur-2xs">
                          <Film className="w-2.5 h-2.5" />
                          {asset.duration ? formatDuration(asset.duration) : 'VIDEO'}
                        </span>
                      )}

                      {/* Already in gallery indicator */}
                      {isAlreadyInGallery && (
                        <span className="absolute top-1.5 left-1.5 bg-[#B58A3C] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                          In Gallery
                        </span>
                      )}
                    </div>

                    {/* Metadata Footer */}
                    <div className="p-2 bg-white flex flex-col justify-between flex-1">
                      <p
                        className="text-[11px] font-medium text-gray-800 truncate"
                        title={asset.display_name || asset.filename}
                      >
                        {asset.display_name || asset.filename}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">
                        {asset.folder ? asset.folder.split('/').pop() : 'Root'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-gray-200 bg-white flex items-center justify-between text-xs text-gray-600 shrink-0">
            <span>
              Showing {Math.min(totalItems, (currentPage - 1) * pageSize + 1)}-
              {Math.min(totalItems, currentPage * pageSize)} of {totalItems} items
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none"
              >
                Previous
              </button>
              <span className="px-2 font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Selected Items Tray & Action Footer */}
        <div className="px-5 py-3 border-t border-[#E8DFD0] bg-[#FAF5EC] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="shrink-0 text-xs font-semibold text-gray-800">
              {selectedMap.size === 0 ? (
                <span className="text-gray-500 font-normal">No items selected</span>
              ) : (
                <span className="text-[#5E1224] font-bold">
                  {selectedMap.size} {selectedMap.size === 1 ? 'item' : 'items'} selected
                </span>
              )}
            </div>

            {/* Thumbnail Strip of Selected Items */}
            {selectedMap.size > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-thin max-w-md">
                {Array.from(selectedMap.values()).map((asset) => {
                  const isVideo =
                    asset.resource_type === 'video' ||
                    /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(asset.filename || asset.url);
                  const thumb = isVideo ? getVideoPoster(asset.url) : asset.secure_url || asset.url;
                  return (
                    <div
                      key={asset.id}
                      className="relative w-9 h-9 rounded border border-gray-300 overflow-hidden shrink-0 group"
                      title={asset.display_name || asset.filename}
                    >
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectAsset(asset);
                        }}
                        className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Deselect"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedMap.size === 0}
              onClick={handleConfirm}
              className="px-5 py-2 bg-[#5E1224] hover:bg-[#4A0E1C] disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Use Selected ({selectedMap.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
