import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Copy,
  Check,
  Search,
  RefreshCw,
  X,
} from 'lucide-react';
import { adminListMedia, adminUploadMedia, adminDeleteMedia } from '../../lib/api';

interface MediaAsset {
  id: number;
  filename: string;
  url: string;
  file_size: number;
  mime_type: string;
  alt_text?: string;
  created_at: string;
}

export const AdminMedia: React.FC = () => {
  const token = localStorage.getItem('royal_libas_admin_token') || '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotification({ type: 'error', message: 'Only JPEG, PNG, and WebP images are allowed.' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setNotification({ type: 'error', message: 'Image size exceeds maximum 10MB limit.' });
      return;
    }

    setUploading(true);
    setNotification(null);
    try {
      const newAsset = await adminUploadMedia(token, file);
      setNotification({ type: 'success', message: `Uploaded ${newAsset.filename} successfully.` });
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchMedia();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to upload image' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (!window.confirm(`Permanently remove ${asset.filename} from media storage?`)) return;

    try {
      await adminDeleteMedia(token, asset.id);
      setNotification({ type: 'success', message: 'Image removed from library.' });
      await fetchMedia();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete image' });
    }
  };

  const handleCopyUrl = (asset: MediaAsset) => {
    const fullUrl = asset.url.startsWith('http') ? asset.url : `${API_BASE_URL}${asset.url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filteredAssets = assets.filter(
    (a) =>
      a.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.alt_text && a.alt_text.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-wide flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-[#B58A3C]" />
            Media & Asset Library
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Store high-resolution luxury product photographs, banners, and lookbook imagery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-[#5E1224] text-white rounded-lg text-xs font-semibold hover:bg-[#4A0E1C] transition-colors shadow-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Upload className={`w-4 h-4 ${uploading ? 'animate-bounce' : ''}`} />
            {uploading ? 'Uploading...' : 'Upload Image'}
          </button>
          <button
            onClick={fetchMedia}
            disabled={loading}
            className="p-2 bg-white border border-[#E5D9C5] rounded-lg text-gray-600 hover:bg-[#FCF8F0] transition-colors disabled:opacity-50"
            title="Refresh assets"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search / Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-[#E5D9C5]/80 shadow-sm flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by filename or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[#FCF8F0]/40 border border-[#E5D9C5] rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#5E1224]"
          />
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
        </div>
        <span className="text-xs text-gray-500 font-medium">
          {filteredAssets.length} {filteredAssets.length === 1 ? 'file' : 'files'}
        </span>
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
          <RefreshCw className="w-6 h-6 text-[#5E1224] animate-spin" />
          Loading media library...
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="p-16 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-[#E5D9C5]/80">
          <ImageIcon className="w-10 h-10 text-gray-300" />
          <p className="font-semibold text-gray-700">No media assets in library</p>
          <p className="text-[11px] text-gray-400">Click &quot;Upload Image&quot; above to store persistent product and editorial photographs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredAssets.map((asset) => {
            const displayUrl = asset.url.startsWith('http') ? asset.url : `${API_BASE_URL}${asset.url}`;
            return (
              <div
                key={asset.id}
                className="bg-white rounded-xl border border-[#E5D9C5]/80 overflow-hidden shadow-sm hover:border-[#5E1224]/50 transition-all flex flex-col justify-between group"
              >
                <div className="relative aspect-square bg-[#FCF8F0] overflow-hidden flex items-center justify-center">
                  <img
                    src={displayUrl}
                    alt={asset.alt_text || asset.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as any).src = 'https://placehold.co/400x400?text=Preview+Error';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
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
                      onClick={() => handleDelete(asset)}
                      className="p-2 bg-rose-600/90 text-white rounded-lg hover:bg-rose-600 transition-colors"
                      title="Delete Image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-white border-t border-gray-100 text-xs">
                  <div className="font-semibold text-gray-900 truncate" title={asset.filename}>
                    {asset.filename}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                    <span>{formatFileSize(asset.file_size)}</span>
                    <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
