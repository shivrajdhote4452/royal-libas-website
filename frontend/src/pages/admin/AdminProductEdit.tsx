import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link, useBlocker } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Save,
  Trash2,
  Plus,
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  Home,
  Star,
  CheckCircle2,
  MoveLeft,
  MoveRight,
  Edit2,
  X,
} from 'lucide-react';
import {
  fetchAdminProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminAddVariant,
  adminUpdateVariant,
  adminBulkUpdateVariants,
  adminUploadProductImage,
  fetchCollections,
} from '../../lib/api';
import {
  Product,
  ProductVariant,
  ProductMediaItem,
  Collection,
  CATEGORY_GROUPS,
  MediaAsset,
} from '../../types/product';
import { MediaLibraryPickerModal, getAssetKey } from '../../components/admin/MediaLibraryPickerModal';

export const AdminProductEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem('royal_libas_admin_token') || '';

  // Data Loading State
  const [product, setProduct] = useState<Product | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('TWO PIECES');
  const [subcategory, setSubcategory] = useState('Co-ord Sets');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [sku, setSku] = useState('');
  const [fabric, setFabric] = useState('');
  const [fit, setFit] = useState('');
  const [care, setCare] = useState('');
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT' | 'ARCHIVED'>('DRAFT');
  const [isBestseller, setIsBestseller] = useState(false);

  // Non-destructive collections and initial snapshot tracking
  const [collectionsFetchError, setCollectionsFetchError] = useState(false);
  const [initialCollectionIds, setInitialCollectionIds] = useState<number[]>([]);
  const initialStateRef = useRef<{
    name: string;
    slug: string;
    description: string;
    category: string;
    subcategory: string;
    fabric: string;
    fit: string;
    care: string;
    status: string;
    isBestseller: boolean;
    selectedCollectionId: string;
    sku: string;
    photosJson: string;
    priceEditsJson: string;
    initialVariantDetails: Record<number, { selling_price: string; mrp: string; sku: string; is_active: boolean; size: string }>;
  } | null>(null);

  // Media / Gallery State
  const [photos, setPhotos] = useState<ProductMediaItem[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Variants State
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isEditingAllPrices, setIsEditingAllPrices] = useState(false);
  const [variantPriceEdits, setVariantPriceEdits] = useState<
    Record<number, { selling_price: string; mrp: string; sku: string }>
  >({});
  const [updatingVariantId, setUpdatingVariantId] = useState<number | null>(null);

  // Add Size Modal State
  const [addSizeModalOpen, setAddSizeModalOpen] = useState(false);
  const [newSize, setNewSize] = useState('XL');
  const [newSizePrice, setNewSizePrice] = useState('3490');
  const [newSizeMrp, setNewSizeMrp] = useState('4999');
  const [newSizeStock, setNewSizeStock] = useState('10');
  const [newSizeSku, setNewSizeSku] = useState('');
  const [addingSizeLoading, setAddingSizeLoading] = useState(false);
  const [addSizeError, setAddSizeError] = useState<string | null>(null);

  // Save / Action State
  const [savingProduct, setSavingProduct] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch Product & Collections
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!id) return;
      const productId = parseInt(id, 10);
      if (isNaN(productId)) {
        setError('Invalid product ID');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        let cols: Collection[] = [];
        try {
          cols = await fetchCollections();
        } catch {
          setCollectionsFetchError(true);
        }

        const prod = await fetchAdminProduct(token, productId);

        if (!isMounted) return;
        setProduct(prod);
        setCollections(cols);

        // Populate Form Fields (preserve untouched values without fake defaults)
        const initName = prod.name || '';
        const initSlug = prod.slug || '';
        const initDesc = prod.description || '';
        const cat = prod.category?.toUpperCase() || 'TWO PIECES';
        const initSub = prod.subcategory || (CATEGORY_GROUPS[cat]?.[0] || '');
        const initFabric = prod.fabric ?? '';
        const initFit = prod.fit ?? '';
        const initCare = prod.care ?? '';
        const initStatus = (prod.status as 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') || (prod.is_active ? 'PUBLISHED' : 'DRAFT');
        const initBestseller = !!prod.is_bestseller;

        setName(initName);
        setSlug(initSlug);
        setDescription(initDesc);
        setCategory(cat);
        setSubcategory(initSub);
        setFabric(initFabric);
        setFit(initFit);
        setCare(initCare);
        setStatus(initStatus);
        setIsBestseller(initBestseller);

        // Preserve collections: store exact collection IDs from backend
        const existingColIds = prod.collection_ids || [];
        setInitialCollectionIds(existingColIds);
        let matchedColId = '';
        if (cols.length > 0) {
          if (existingColIds.length > 0) {
            const matched = cols.find((c) => existingColIds.includes(c.id));
            if (matched) matchedColId = String(matched.id);
          } else if (prod.collections && prod.collections.length > 0) {
            const matched = cols.find((c) => prod.collections.includes(c.name));
            if (matched) matchedColId = String(matched.id);
          }
        }
        setSelectedCollectionId(matchedColId);

        // Derive Base SKU from variants
        let initialBaseSku = '';
        if (prod.variants && prod.variants.length > 0) {
          const firstSku = prod.variants[0].sku || '';
          if (firstSku) {
            initialBaseSku = firstSku.replace(/-[A-Za-z0-9]+$/, '');
          }
        }
        setSku(initialBaseSku);

        // Populate Media: preserve media_asset_id and metadata
        const mediaList: ProductMediaItem[] = (prod.images || []).map((img, idx) => ({
          id: img.id,
          media_asset_id: img.media_asset_id ?? null,
          url: img.url,
          sort_order: img.sort_order ?? idx,
          alt_text: img.alt_text ?? null,
          resource_type: img.resource_type || 'image',
          public_id: img.public_id ?? null,
          width: img.width ?? null,
          height: img.height ?? null,
          duration: img.duration ?? null,
        }));
        setPhotos(mediaList);
        setSelectedPhotoIndex(0);

        // Populate Variants
        setVariants(prod.variants || []);

        // Initialize variant price edits and initial snapshot
        const editsMap: Record<number, { selling_price: string; mrp: string; sku: string }> = {};
        const initVariantDetails: Record<number, { selling_price: string; mrp: string; sku: string; is_active: boolean; size: string }> = {};
        (prod.variants || []).forEach((v) => {
          editsMap[v.id] = {
            selling_price: String(v.selling_price || ''),
            mrp: v.mrp ? String(v.mrp) : '',
            sku: v.sku || '',
          };
          initVariantDetails[v.id] = {
            selling_price: String(v.selling_price || ''),
            mrp: v.mrp ? String(v.mrp) : '',
            sku: v.sku || '',
            is_active: v.is_active !== false,
            size: v.size || '',
          };
        });
        setVariantPriceEdits(editsMap);

        const photosJson = JSON.stringify(mediaList.map((p, idx) => ({ url: p.url, sort_order: idx, media_asset_id: p.media_asset_id })));
        const priceEditsJson = JSON.stringify(editsMap);
        initialStateRef.current = {
          name: initName,
          slug: initSlug,
          description: initDesc,
          category: cat,
          subcategory: initSub,
          fabric: initFabric,
          fit: initFit,
          care: initCare,
          status: initStatus,
          isBestseller: initBestseller,
          selectedCollectionId: matchedColId,
          sku: initialBaseSku,
          photosJson,
          priceEditsJson,
          initialVariantDetails: initVariantDetails,
        };
        setIsDirty(false);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load product');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [id, token]);

  // Dynamic Unsaved Changes Detection
  useEffect(() => {
    if (!initialStateRef.current) return;
    const init = initialStateRef.current;
    const currentPhotosJson = JSON.stringify(
      photos.map((p, idx) => ({ url: p.url, sort_order: idx, media_asset_id: p.media_asset_id }))
    );
    const currentPriceEditsJson = JSON.stringify(variantPriceEdits);

    const dirty =
      name.trim() !== init.name.trim() ||
      slug.trim() !== init.slug.trim() ||
      description.trim() !== init.description.trim() ||
      category !== init.category ||
      subcategory !== init.subcategory ||
      fabric.trim() !== init.fabric.trim() ||
      fit.trim() !== init.fit.trim() ||
      care.trim() !== init.care.trim() ||
      status !== init.status ||
      isBestseller !== init.isBestseller ||
      selectedCollectionId !== init.selectedCollectionId ||
      sku.trim() !== init.sku.trim() ||
      currentPhotosJson !== init.photosJson ||
      currentPriceEditsJson !== init.priceEditsJson;

    setIsDirty(dirty);
  }, [
    name,
    slug,
    description,
    category,
    subcategory,
    fabric,
    fit,
    care,
    status,
    isBestseller,
    selectedCollectionId,
    sku,
    photos,
    variantPriceEdits,
  ]);

  // 1. Browser refresh & tab close guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // 2. Official React Router navigation blocker (browser Back/Forward, sidebar navigation, breadcrumbs)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      const confirmed = window.confirm(
        'You have unsaved changes in Product Details, Photos, or Prices. Are you sure you want to leave without saving?'
      );
      if (confirmed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);

  // Available subcategories for current category
  const availableSubcategories = useMemo(() => {
    return CATEGORY_GROUPS[category] || [];
  }, [category]);

  // Handle Category Change
  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    const subcats = CATEGORY_GROUPS[newCat] || [];
    setSubcategory(subcats[0] || '');
    setIsDirty(true);
  };

  // Stock Summary calculations
  const { totalStock, totalSizes, priceRange } = useMemo(() => {
    const totalSizes = variants.length;
    const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    const prices = variants.map((v) => v.selling_price).filter((p) => p > 0);
    let priceRange = '₹0';
    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      priceRange = min === max ? `₹${min.toLocaleString('en-IN')}` : `₹${min.toLocaleString('en-IN')} – ₹${max.toLocaleString('en-IN')}`;
    }
    return { totalStock, totalSizes, priceRange };
  }, [variants]);

  // Immediate Stock Step (+ / -) with Concurrency Protection
  const handleStockStep = async (variantId: number, delta: number) => {
    const target = variants.find((v) => v.id === variantId);
    if (!target || !token || !product) return;

    const nextStock = target.stock + delta;
    if (nextStock < 0 || delta === 0) return;

    setUpdatingVariantId(variantId);
    setSaveErrorMessage(null);
    try {
      // Send atomic stock_delta and expected_stock to prevent overwriting orders or concurrent admin edits
      const updated = await adminUpdateVariant(token, variantId, {
        stock_delta: delta,
        expected_stock: target.stock,
      });

      // Update local state with authoritative server stock
      setVariants((prev) =>
        prev.map((v) =>
          v.id === variantId
            ? {
                ...v,
                stock: updated.stock,
                is_available: updated.is_available,
              }
            : v
        )
      );
    } catch (err: any) {
      const isConflict = err.status === 409 || (err.message && err.message.toLowerCase().includes('conflict'));
      if (isConflict) {
        // Reload fresh product inventory from server
        try {
          const fresh = await fetchAdminProduct(token, product.id);
          setProduct(fresh);
          setVariants(fresh.variants || []);
          const freshVar = fresh.variants?.find((v) => v.id === variantId);
          const liveStock = freshVar ? freshVar.stock : 'updated';
          setSaveErrorMessage(
            `Stock conflict detected: Inventory was changed by a customer order or another administrator (live stock is now ${liveStock}). Latest inventory reloaded.`
          );
        } catch {
          setSaveErrorMessage(err.message || 'Stock conflict detected. Please reload.');
        }
      } else {
        setSaveErrorMessage(err.message || 'Failed to update stock');
      }
    } finally {
      setUpdatingVariantId(null);
    }
  };

  // Immediate Variant Status Toggle (ON/OFF)
  const handleToggleVariantActive = async (variant: ProductVariant) => {
    if (!token) return;
    const nextActive = !variant.is_active;

    // Optimistic UI Update
    setVariants((prev) =>
      prev.map((v) =>
        v.id === variant.id
          ? {
              ...v,
              is_active: nextActive,
              is_available: nextActive && v.stock > 0,
            }
          : v
      )
    );
    setUpdatingVariantId(variant.id);
    try {
      await adminUpdateVariant(token, variant.id, { is_active: nextActive });
    } catch (err: any) {
      // Revert on error
      setVariants((prev) =>
        prev.map((v) =>
          v.id === variant.id
            ? {
                ...v,
                is_active: variant.is_active,
                is_available: variant.is_available,
              }
            : v
        )
      );
      setSaveErrorMessage(err.message || 'Failed to update size availability');
    } finally {
      setUpdatingVariantId(null);
    }
  };

  // Save All Variant Prices & MRPs with Pre-flight Validation & Atomic DB Execution
  const handleSaveAllVariantPrices = async () => {
    if (!token || !product) return;
    setSavingProduct(true);
    setSaveErrorMessage(null);

    // Step 1: Pre-flight validation on every changed variant BEFORE writing to server
    const itemsToUpdate: Array<{
      variant_id: number;
      selling_price: number;
      mrp?: number;
      sku?: string;
    }> = [];

    for (const v of variants) {
      const edits = variantPriceEdits[v.id];
      if (!edits) continue;

      const p = parseFloat(edits.selling_price);
      const m = edits.mrp ? parseFloat(edits.mrp) : undefined;
      const s = edits.sku.trim() || undefined;

      if (isNaN(p) || p <= 0) {
        setSaveErrorMessage(`Validation error: Size '${v.size}' selling price must be greater than 0.`);
        setSavingProduct(false);
        return;
      }
      if (m !== undefined && (isNaN(m) || m <= 0)) {
        setSaveErrorMessage(`Validation error: Size '${v.size}' MRP must be greater than 0.`);
        setSavingProduct(false);
        return;
      }
      if (m !== undefined && p > m) {
        setSaveErrorMessage(`Validation error: Size '${v.size}' selling price (₹${p}) cannot exceed MRP (₹${m}).`);
        setSavingProduct(false);
        return;
      }

      itemsToUpdate.push({
        variant_id: v.id,
        selling_price: p,
        mrp: m,
        sku: s,
      });
    }

    if (itemsToUpdate.length === 0) {
      setIsEditingAllPrices(false);
      setSavingProduct(false);
      return;
    }

    // Step 2: Atomic bulk update in single transaction
    try {
      const res = await adminBulkUpdateVariants(token, product.id, itemsToUpdate);
      setVariants(res.updated_variants);

      // Refresh edit map with server truth
      const updatedEdits: Record<number, { selling_price: string; mrp: string; sku: string }> = {};
      const updatedInitDetails: Record<number, { selling_price: string; mrp: string; sku: string; is_active: boolean; size: string }> = {};
      res.updated_variants.forEach((v: any) => {
        updatedEdits[v.id] = {
          selling_price: String(v.selling_price),
          mrp: v.mrp ? String(v.mrp) : '',
          sku: v.sku || '',
        };
        updatedInitDetails[v.id] = {
          selling_price: String(v.selling_price),
          mrp: v.mrp ? String(v.mrp) : '',
          sku: v.sku || '',
          is_active: v.is_active !== false,
          size: v.size || '',
        };
      });
      setVariantPriceEdits(updatedEdits);
      if (initialStateRef.current) {
        initialStateRef.current.initialVariantDetails = updatedInitDetails;
        initialStateRef.current.priceEditsJson = JSON.stringify(updatedEdits);
      }
      setIsEditingAllPrices(false);
      setSaveSuccessMessage('All variant prices and SKUs updated atomically!');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: any) {
      setSaveErrorMessage(err.message || 'Failed to update variant prices. No partial changes were applied.');
      // Reload server state so user sees true server state
      try {
        const fresh = await fetchAdminProduct(token, product.id);
        setVariants(fresh.variants || []);
      } catch {}
    } finally {
      setSavingProduct(false);
    }
  };

  // Add Size Submit
  const handleAddSizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !token) return;

    setAddingSizeLoading(true);
    setAddSizeError(null);

    const price = parseFloat(newSizePrice);
    const mrp = newSizeMrp ? parseFloat(newSizeMrp) : undefined;
    const stock = parseInt(newSizeStock, 10) || 0;

    if (!newSize.trim()) {
      setAddSizeError('Please enter a size name.');
      setAddingSizeLoading(false);
      return;
    }
    if (isNaN(price) || price <= 0) {
      setAddSizeError('Selling price must be greater than 0.');
      setAddingSizeLoading(false);
      return;
    }
    if (mrp !== undefined && (isNaN(mrp) || mrp <= 0)) {
      setAddSizeError('MRP must be greater than 0.');
      setAddingSizeLoading(false);
      return;
    }
    if (mrp !== undefined && price > mrp) {
      setAddSizeError(`Selling price (₹${price}) cannot exceed MRP (₹${mrp}).`);
      setAddingSizeLoading(false);
      return;
    }

    try {
      const added = await adminAddVariant(token, product.id, {
        size: newSize.trim().toUpperCase(),
        selling_price: price,
        mrp: mrp || null,
        stock: stock,
        sku: newSizeSku.trim() || `${sku ? `${sku}-` : ''}${newSize.trim().toUpperCase()}`,
        is_active: true,
      });

      setVariants((prev) => [...prev, added]);
      setVariantPriceEdits((prev) => ({
        ...prev,
        [added.id]: {
          selling_price: String(added.selling_price),
          mrp: added.mrp ? String(added.mrp) : '',
          sku: added.sku || '',
        },
      }));
      setAddSizeModalOpen(false);
      setNewSize('');
      setNewSizeStock('10');
      setNewSizeSku('');
      setSaveSuccessMessage(`Size ${added.size} added successfully!`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: any) {
      setAddSizeError(err.message || 'Failed to add size variant');
    } finally {
      setAddingSizeLoading(false);
    }
  };

  // Media Operations
  const handleUploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0 || !token) return;
    setUploadingPhotos(true);
    setSaveErrorMessage(null);

    try {
      const uploadedItems: ProductMediaItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await adminUploadProductImage(token, file, 'royal_libas/products');
        uploadedItems.push({
          media_asset_id: res.id,
          url: res.secure_url || res.url,
          public_id: res.public_id,
          resource_type: res.resource_type || 'image',
          width: res.width,
          height: res.height,
          duration: res.duration,
          alt_text: file.name.replace(/\.[^/.]+$/, ''),
          sort_order: photos.length + uploadedItems.length,
        });
      }

      setPhotos((prev) => [...prev, ...uploadedItems]);
      setIsDirty(true);
      setSaveSuccessMessage(`${uploadedItems.length} media file(s) uploaded. Remember to save product to persist gallery changes.`);
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setSaveErrorMessage(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddUrlPhoto = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const isVid = /\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(trimmed);
    const newItem: ProductMediaItem = {
      url: trimmed,
      resource_type: isVid ? 'video' : 'image',
      sort_order: photos.length,
      alt_text: name || 'Garment photo',
    };
    setPhotos((prev) => [...prev, newItem]);
    setUrlInput('');
    setUrlModalOpen(false);
    setIsDirty(true);
  };

  const handleSelectFromLibrary = (selectedAssets: MediaAsset[]) => {
    const existingKeys = new Set(photos.map(getAssetKey));
    const newItems: ProductMediaItem[] = [];

    selectedAssets.forEach((asset) => {
      const key = getAssetKey(asset);
      if (!existingKeys.has(key)) {
        newItems.push({
          media_asset_id: asset.id,
          url: asset.secure_url || asset.url,
          public_id: asset.public_id,
          resource_type: asset.resource_type || 'image',
          width: asset.width,
          height: asset.height,
          duration: asset.duration,
          alt_text: asset.alt_text || asset.display_name || name,
          sort_order: photos.length + newItems.length,
        });
      }
    });

    if (newItems.length > 0) {
      setPhotos((prev) => [...prev, ...newItems]);
      setIsDirty(true);
      setSaveSuccessMessage(`${newItems.length} media asset(s) attached. Remember to save product.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    }
    setMediaPickerOpen(false);
  };

  const handleSetCoverPhoto = (index: number) => {
    if (index === 0 || index >= photos.length) return;
    const updated = [...photos];
    const [moved] = updated.splice(index, 1);
    updated.unshift(moved);
    setPhotos(updated);
    setSelectedPhotoIndex(0);
    setIsDirty(true);
  };

  const handleMovePhoto = (fromIndex: number, direction: 'left' | 'right') => {
    const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= photos.length) return;
    const updated = [...photos];
    const temp = updated[fromIndex];
    updated[fromIndex] = updated[toIndex];
    updated[toIndex] = temp;
    setPhotos(updated);
    setSelectedPhotoIndex(toIndex);
    setIsDirty(true);
  };

  const handleRemovePhoto = (index: number) => {
    const updated = photos.filter((_, idx) => idx !== index);
    setPhotos(updated);
    if (selectedPhotoIndex >= updated.length) {
      setSelectedPhotoIndex(Math.max(0, updated.length - 1));
    }
    setIsDirty(true);
  };

  // Main Save Product Handler (Non-destructive: preserves collections, untouched fabric/fit/care, and media_asset_id)
  const handleSaveProduct = async () => {
    if (!product || !token) return;

    if (!name.trim()) {
      setSaveErrorMessage('Product name is required.');
      return;
    }
    if (!category) {
      setSaveErrorMessage('Product category is required.');
      return;
    }

    setSavingProduct(true);
    setSaveErrorMessage(null);

    try {
      // Preserve untouched fabric/fit/care values without blanking
      const effectiveFabric = fabric.trim() ? fabric.trim() : (initialStateRef.current?.fabric === '' ? null : product.fabric);
      const effectiveFit = fit.trim() ? fit.trim() : (initialStateRef.current?.fit === '' ? null : product.fit);
      const effectiveCare = care.trim() ? care.trim() : (initialStateRef.current?.care === '' ? null : product.care);

      const payload: any = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || null,
        category,
        subcategory: subcategory || null,
        fabric: effectiveFabric,
        fit: effectiveFit,
        care: effectiveCare,
        status,
        is_bestseller: isBestseller,
        images: photos.map((p, idx) => ({
          media_asset_id: p.media_asset_id ?? null,
          url: p.url,
          sort_order: idx,
          alt_text: p.alt_text || name.trim(),
          resource_type: p.resource_type || 'image',
          public_id: p.public_id || null,
          width: p.width ?? null,
          height: p.height ?? null,
          duration: p.duration ?? null,
        })),
      };

      // Non-destructive collection preservation:
      // If collection fetch failed, DO NOT pass collection_ids (backend leaves existing collections intact)
      // If user did not change collection selection, pass initialCollectionIds or omit to prevent wipeout
      if (!collectionsFetchError) {
        const initialCol = initialStateRef.current?.selectedCollectionId || '';
        if (selectedCollectionId !== initialCol) {
          payload.collection_ids = selectedCollectionId ? [parseInt(selectedCollectionId, 10)] : [];
        } else if (initialCollectionIds.length > 0) {
          payload.collection_ids = initialCollectionIds;
        }
      }

      // 1. Transactional Variant Price & SKU updates:
      // - If Base Design SKU was modified, only rewrite variants whose initial SKU matched the standard pattern
      // - Custom variant SKUs (e.g. RL-CUSTOM-XL) are preserved unless user explicitly edited that variant's SKU
      // - Validate all changed variants (selling_price > 0, mrp > 0, selling_price <= mrp)
      const initialSku = initialStateRef.current?.sku || '';
      const baseSkuChanged = sku.trim() && sku.trim() !== initialSku;
      const variantUpdates: any[] = [];

      for (const v of variants) {
        const initV = initialStateRef.current?.initialVariantDetails?.[v.id];
        const edit = variantPriceEdits[v.id];

        const spStr = edit?.selling_price !== undefined ? edit.selling_price : (initV?.selling_price || String(v.selling_price || ''));
        const mrpStr = edit?.mrp !== undefined ? edit.mrp : (initV?.mrp || (v.mrp ? String(v.mrp) : ''));
        const p = parseFloat(spStr);
        const m = mrpStr.trim() ? parseFloat(mrpStr) : undefined;

        // Determine target SKU
        let targetSku = edit?.sku !== undefined ? edit.sku.trim() : (initV?.sku || v.sku || '');
        if (baseSkuChanged) {
          const wasDefaultPattern = initV ? initV.sku === `${initialSku}-${v.size}` : false;
          // Only update standard pattern variants; preserve custom variant SKUs
          if (wasDefaultPattern && (!edit?.sku || edit.sku.trim() === initV?.sku)) {
            targetSku = `${sku.trim()}-${v.size}`;
          }
        }

        // Validate price and MRP
        if (isNaN(p) || p <= 0) {
          setSaveErrorMessage(`Validation error: Size '${v.size}' selling price must be greater than 0.`);
          setSavingProduct(false);
          return;
        }
        if (m !== undefined && (isNaN(m) || m <= 0)) {
          setSaveErrorMessage(`Validation error: Size '${v.size}' MRP must be greater than 0.`);
          setSavingProduct(false);
          return;
        }
        if (m !== undefined && p > m) {
          setSaveErrorMessage(`Validation error: Size '${v.size}' selling price (₹${p}) cannot exceed MRP (₹${m}).`);
          setSavingProduct(false);
          return;
        }

        // Detect if this variant has any change from initial snapshot
        const priceDiff = initV ? Math.abs(parseFloat(initV.selling_price || '0') - p) > 0.001 : true;
        const mrpDiff = initV ? (initV.mrp || '') !== (m !== undefined ? String(m) : '') : true;
        const skuDiff = initV ? (initV.sku || '') !== targetSku : true;
        const activeDiff = initV ? initV.is_active !== (v.is_active !== false) : false;

        if (priceDiff || mrpDiff || skuDiff || activeDiff) {
          variantUpdates.push({
            variant_id: v.id,
            selling_price: p,
            mrp: m || null,
            sku: targetSku || null,
            is_active: v.is_active !== false,
          });
        }
      }

      if (variantUpdates.length > 0) {
        payload.variants = variantUpdates;
      }

      const updated = await adminUpdateProduct(token, product.id, payload);
      setProduct(updated);
      setVariants(updated.variants || []);
      setInitialCollectionIds(updated.collection_ids || []);

      // Refresh edit map and snapshot with server truth
      const updatedEdits: Record<number, { selling_price: string; mrp: string; sku: string }> = {};
      const updatedInitDetails: Record<number, { selling_price: string; mrp: string; sku: string; is_active: boolean; size: string }> = {};
      (updated.variants || []).forEach((v: any) => {
        updatedEdits[v.id] = {
          selling_price: String(v.selling_price || ''),
          mrp: v.mrp ? String(v.mrp) : '',
          sku: v.sku || '',
        };
        updatedInitDetails[v.id] = {
          selling_price: String(v.selling_price || ''),
          mrp: v.mrp ? String(v.mrp) : '',
          sku: v.sku || '',
          is_active: v.is_active !== false,
          size: v.size || '',
        };
      });
      setVariantPriceEdits(updatedEdits);

      // Refresh snapshot
      const currentPhotosJson = JSON.stringify(
        photos.map((p, idx) => ({ url: p.url, sort_order: idx, media_asset_id: p.media_asset_id }))
      );
      const currentPriceEditsJson = JSON.stringify(updatedEdits);
      initialStateRef.current = {
        name: updated.name,
        slug: updated.slug,
        description: updated.description || '',
        category: updated.category || category,
        subcategory: updated.subcategory || subcategory,
        fabric: updated.fabric || '',
        fit: updated.fit || '',
        care: updated.care || '',
        status: (updated.status as any) || status,
        isBestseller: !!updated.is_bestseller,
        selectedCollectionId,
        sku: sku.trim(),
        photosJson: currentPhotosJson,
        priceEditsJson: currentPriceEditsJson,
        initialVariantDetails: updatedInitDetails,
      };

      setIsDirty(false);
      setIsEditingAllPrices(false);
      setSaveSuccessMessage('Product and variants saved successfully!');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setSaveErrorMessage(err.message || 'Failed to save product changes');
    } finally {
      setSavingProduct(false);
    }
  };

  // Delete Product Handler
  const handleDeleteProduct = async () => {
    if (!product || !token) return;
    setDeleting(true);
    try {
      await adminDeleteProduct(token, product.id);
      navigate('/admin/products');
    } catch (err: any) {
      setSaveErrorMessage(err.message || 'Failed to delete product');
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  // Guard navigation with unsaved changes
  const handleBackToProducts = () => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes in Product Details. Are you sure you want to leave without saving?');
      if (!confirmed) return;
    }
    navigate('/admin/products');
  };

  // Loading Skeleton
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-8 h-8 bg-amber-100 rounded"></div>
          <div className="w-48 h-6 bg-amber-100 rounded"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 h-96 bg-white rounded-2xl border border-[#E8DFD0] animate-pulse"></div>
          <div className="lg:col-span-7 space-y-4">
            <div className="h-64 bg-white rounded-2xl border border-[#E8DFD0] animate-pulse"></div>
            <div className="h-64 bg-white rounded-2xl border border-[#E8DFD0] animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !product) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-red-100 text-red-700 rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-gray-900">Product Not Found</h2>
        <p className="text-sm text-gray-600">{error || 'Unable to retrieve the requested product.'}</p>
        <Link
          to="/admin/products"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#5E1224] text-white text-xs font-semibold rounded-lg hover:bg-[#4A0E1C]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Products Catalogue
        </Link>
      </div>
    );
  }

  const activePhoto = photos[selectedPhotoIndex] || photos[0];
  const isCover = selectedPhotoIndex === 0;

  return (
    <div className="min-h-screen pb-24 text-gray-900">
      {/* ========================================================
          1. TOP BREADCRUMBS & ACTION HEADER
          ======================================================== */}
      <div className="bg-white border-b border-[#E8DFD0] sticky top-0 z-20 px-4 sm:px-6 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Breadcrumb Trail */}
          <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
            <button
              onClick={handleBackToProducts}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition-colors border border-gray-200"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <span className="text-gray-300">/</span>
            <Link to="/admin/products" className="hover:text-[#5E1224] flex items-center gap-1">
              <Home className="w-3.5 h-3.5 text-gray-400" />
              <span>Products</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 truncate max-w-[200px] sm:max-w-[320px]">
              {name || product.name}
            </span>
            <span className="text-gray-300">/</span>
            <span className="text-[#5E1224] font-bold">Edit Product</span>
          </div>

          {/* Right Header Status & Storefront Link */}
          <div className="flex items-center gap-2.5">
            {/* Status Pill */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                status === 'PUBLISHED'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : status === 'DRAFT'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status === 'PUBLISHED' ? 'bg-emerald-600' : status === 'DRAFT' ? 'bg-amber-600' : 'bg-gray-400'
                }`}
              />
              {status}
            </span>

            {/* View Product on Storefront */}
            {status === 'PUBLISHED' && product.slug && (
              <a
                href={`/product/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-[#E8DFD0] text-gray-700 hover:text-[#5E1224] hover:border-[#5E1224] text-xs font-semibold rounded-lg shadow-sm transition-all"
              >
                <span>View Product</span>
                <ExternalLink className="w-3 h-3 text-[#B58A3C]" />
              </a>
            )}

            {/* Delete Product */}
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="p-1.5 text-gray-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
              title="Delete Product"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Save Notification Banners */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
        {saveSuccessMessage && (
          <div data-testid="save-success-banner" className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-between mb-4 shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
            <button onClick={() => setSaveSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {saveErrorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center justify-between mb-4 shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{saveErrorMessage}</span>
            </div>
            <button onClick={() => setSaveErrorMessage(null)} className="text-red-600 hover:text-red-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ========================================================
          2. TWO-COLUMN EDIT WORKSPACE (Visual 2)
          ======================================================== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-2">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
          Edit Product
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ----------------------------------------------------
              LEFT COLUMN: Media Preview, Thumbnails & Media Panel
              ---------------------------------------------------- */}
          <div className="lg:col-span-5 space-y-5">
            {/* Primary Large Photo Preview Card */}
            <div className="bg-white rounded-2xl border border-[#E8DFD0] overflow-hidden shadow-sm p-3 bg-gradient-to-b from-white to-[#FAF6F0]">
              <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                {activePhoto?.url ? (
                  activePhoto.resource_type === 'video' ? (
                    <video
                      src={activePhoto.url}
                      controls
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={activePhoto.url}
                      alt={activePhoto.alt_text || name}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="text-center p-6 space-y-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-[#5E1224]/10 text-[#5E1224] flex items-center justify-center font-serif text-xl font-bold">
                      RL
                    </div>
                    <p className="text-xs text-gray-500 font-serif">No images uploaded for this garment.</p>
                  </div>
                )}

                {/* Cover Photo Badge */}
                {isCover && activePhoto?.url && (
                  <div className="absolute top-3 left-3 bg-[#5E1224] text-[#E6C687] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-md flex items-center gap-1 border border-[#B58A3C]/40">
                    <Star className="w-3 h-3 fill-[#E6C687]" />
                    <span>Cover Photo</span>
                  </div>
                )}

                {/* Photo Counter */}
                {photos.length > 0 && (
                  <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[11px] font-medium px-2.5 py-0.5 rounded-full shadow">
                    {selectedPhotoIndex + 1} / {photos.length}
                  </div>
                )}
              </div>

              {/* Thumbnail Strip */}
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {photos.map((item, idx) => {
                  const isSelected = selectedPhotoIndex === idx;
                  return (
                    <button
                      key={item.id || idx}
                      type="button"
                      onClick={() => setSelectedPhotoIndex(idx)}
                      className={`relative w-16 h-20 rounded-lg overflow-hidden border shrink-0 transition-all ${
                        isSelected
                          ? 'ring-2 ring-[#5E1224] border-transparent scale-105 shadow-md'
                          : 'border-gray-300 opacity-70 hover:opacity-100 hover:border-gray-400'
                      }`}
                    >
                      {item.resource_type === 'video' ? (
                        <div className="w-full h-full bg-gray-900 text-white flex items-center justify-center text-[9px] font-bold">
                          VIDEO
                        </div>
                      ) : (
                        <img src={item.url} alt={item.alt_text || ''} className="w-full h-full object-cover" />
                      )}
                      {idx === 0 && (
                        <span className="absolute top-1 left-1 bg-[#5E1224] text-white p-0.5 rounded-full shadow text-[8px]">
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Add Image Button in Strip */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-20 rounded-lg border-2 border-dashed border-[#B58A3C]/50 hover:border-[#5E1224] bg-amber-50/40 hover:bg-amber-50 text-[#5E1224] flex flex-col items-center justify-center gap-1 shrink-0 transition-all"
                  title="Upload New Photo"
                >
                  <Plus className="w-5 h-5 text-[#5E1224]" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#5E1224]">Add</span>
                </button>
              </div>
            </div>

            {/* Media Library & Actions Card */}
            <div className="bg-white rounded-2xl border border-[#E8DFD0] p-4 sm:p-5 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-gray-900 border-b border-[#E8DFD0] pb-2">
                Media Library & Photos
              </h3>

              <div className="divide-y divide-gray-100">
                {/* 1. Choose from Media Library */}
                <button
                  type="button"
                  onClick={() => setMediaPickerOpen(true)}
                  className="w-full py-2.5 flex items-center justify-between text-left hover:text-[#5E1224] group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#5E1224] flex items-center justify-center border border-amber-200/60 group-hover:bg-[#5E1224] group-hover:text-white transition-colors">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900 group-hover:text-[#5E1224]">Media Library</p>
                      <p className="text-[11px] text-gray-500">Choose from existing boutique assets</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#5E1224] transition-colors" />
                </button>

                {/* 2. Upload New Photos */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhotos}
                  className="w-full py-2.5 flex items-center justify-between text-left hover:text-[#5E1224] group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#5E1224] flex items-center justify-center border border-amber-200/60 group-hover:bg-[#5E1224] group-hover:text-white transition-colors">
                      {uploadingPhotos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900 group-hover:text-[#5E1224]">Upload Photos</p>
                      <p className="text-[11px] text-gray-500">
                        {uploadingPhotos ? 'Uploading media assets...' : 'Upload new product images or video'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#5E1224] transition-colors" />
                </button>

                {/* 3. Add via URL */}
                <button
                  type="button"
                  onClick={() => setUrlModalOpen(true)}
                  className="w-full py-2.5 flex items-center justify-between text-left hover:text-[#5E1224] group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#5E1224] flex items-center justify-center border border-amber-200/60 group-hover:bg-[#5E1224] group-hover:text-white transition-colors">
                      <LinkIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900 group-hover:text-[#5E1224]">Add via URL</p>
                      <p className="text-[11px] text-gray-500">Attach external Cloudinary or web image</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#5E1224] transition-colors" />
                </button>

                {/* 4. Photo Specific Controls (for currently active thumbnail) */}
                {photos.length > 0 && (
                  <div className="pt-3 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Selected Photo Actions (Photo #{selectedPhotoIndex + 1})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetCoverPhoto(selectedPhotoIndex)}
                        disabled={isCover}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50/60 text-[#5E1224] hover:bg-amber-100 disabled:opacity-50 transition-colors"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>Set as Cover</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(selectedPhotoIndex)}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Photo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMovePhoto(selectedPhotoIndex, 'left')}
                        disabled={selectedPhotoIndex === 0}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                      >
                        <MoveLeft className="w-3.5 h-3.5" />
                        <span>Move Left</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMovePhoto(selectedPhotoIndex, 'right')}
                        disabled={selectedPhotoIndex === photos.length - 1}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                      >
                        <MoveRight className="w-3.5 h-3.5" />
                        <span>Move Right</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden file upload input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleUploadPhotos(e.target.files)}
              />
            </div>
          </div>

          {/* ----------------------------------------------------
              RIGHT COLUMN: Product Details & Sizes/Stock/Pricing
              ---------------------------------------------------- */}
          <div className="lg:col-span-7 space-y-6">
            {/* Card 1: Product Details */}
            <div className="bg-white rounded-2xl border border-[#E8DFD0] p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-[#E8DFD0] pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif font-bold text-base sm:text-lg text-gray-900 text-[#5E1224]">
                    Product Details
                  </h2>
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-semibold inline-flex items-center gap-1">
                    💾 Requires Save
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 font-medium cursor-pointer flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={isBestseller}
                      onChange={(e) => {
                        setIsBestseller(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="rounded border-gray-300 text-[#5E1224] focus:ring-[#5E1224]"
                    />
                    <span>Bestseller</span>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                {/* Product Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="e.g. Neel Slate Blue Floral Kurta Pant Set"
                    className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#5E1224] focus:bg-white transition-all"
                  />
                </div>

                {/* Category & Collection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#5E1224] focus:bg-white transition-all"
                    >
                      {Object.keys(CATEGORY_GROUPS).map((catKey) => (
                        <option key={catKey} value={catKey}>
                          {catKey}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Collection
                    </label>
                    <select
                      value={selectedCollectionId}
                      onChange={(e) => {
                        setSelectedCollectionId(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#5E1224] focus:bg-white transition-all"
                    >
                      <option value="">None / Standalone Design</option>
                      {collections.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                    {collectionsFetchError && (
                      <p className="text-[11px] text-amber-700 mt-1">
                        ⚠️ Collections list could not be loaded. Existing assignments will be preserved on save.
                      </p>
                    )}
                  </div>
                </div>

                {/* Subcategory & SKU */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Subcategory
                    </label>
                    <select
                      value={subcategory}
                      onChange={(e) => {
                        setSubcategory(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#5E1224] focus:bg-white transition-all"
                    >
                      {availableSubcategories.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Base Design SKU
                    </label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => {
                        setSku(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="e.g. RLB-CS-1047"
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#5E1224] focus:bg-white transition-all font-mono"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Base design code persisted to variant SKUs (e.g. {sku || 'SKU'}-S)
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Artisanal garment details, embroidery, fabric drape, and styling suggestions..."
                    className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#5E1224] focus:bg-white transition-all"
                  />
                </div>

                {/* Artisanal Attributes: Fabric, Fit & Care */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Fabric
                    </label>
                    <input
                      type="text"
                      value={fabric}
                      onChange={(e) => {
                        setFabric(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="e.g. Pure Chanderi Silk"
                      className="w-full px-3 py-2 bg-gray-50/50 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-[#5E1224] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Fit
                    </label>
                    <input
                      type="text"
                      value={fit}
                      onChange={(e) => {
                        setFit(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="e.g. Tailored Regular Fit"
                      className="w-full px-3 py-2 bg-gray-50/50 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-[#5E1224] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Care
                    </label>
                    <input
                      type="text"
                      value={care}
                      onChange={(e) => {
                        setCare(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="e.g. Dry clean only"
                      className="w-full px-3 py-2 bg-gray-50/50 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-[#5E1224] focus:bg-white"
                    />
                  </div>
                </div>

                {/* Status Toggle & Slug */}
                <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Publication:
                    </span>
                    <div className="flex items-center gap-2">
                      {(['PUBLISHED', 'DRAFT', 'ARCHIVED'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setStatus(st);
                            setIsDirty(true);
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                            status === st
                              ? st === 'PUBLISHED'
                                ? 'bg-emerald-600 text-white shadow'
                                : st === 'DRAFT'
                                ? 'bg-amber-600 text-white shadow'
                                : 'bg-gray-700 text-white shadow'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-400 font-mono truncate max-w-full">
                    slug: /{slug || product.slug}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Sizes, Stock & Pricing (Visual 2 Table) */}
            <div className="bg-white rounded-2xl border border-[#E8DFD0] p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8DFD0] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif font-bold text-base sm:text-lg text-gray-900 text-[#5E1224]">
                      Sizes, Stock & Pricing
                    </h2>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold inline-flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> ⚡ Saved Live
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Live stock stepper and availability toggles save instantly to server with concurrency protection.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {isEditingAllPrices ? (
                    <button
                      type="button"
                      onClick={handleSaveAllVariantPrices}
                      disabled={savingProduct}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5E1224] text-white text-xs font-semibold rounded-lg hover:bg-[#4A0E1C] transition-colors shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingProduct ? 'Saving...' : 'Save Prices'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingAllPrices(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg border border-gray-300 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-[#5E1224]" />
                      <span>Edit Prices</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setAddSizeModalOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-[#5E1224] border border-amber-300 text-xs font-bold rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Size</span>
                  </button>
                </div>
              </div>

              {/* Sizes Table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF6F0] text-gray-700 uppercase tracking-wider text-[11px] font-bold border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3 text-center">Stock</th>
                      <th className="py-2.5 px-3 text-right">Price (₹)</th>
                      <th className="py-2.5 px-3 text-right">MRP (₹)</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {variants.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-gray-400">
                          No size variants created yet. Click "+ Add Size" to add garment sizes.
                        </td>
                      </tr>
                    ) : (
                      variants.map((v) => {
                        const isUpdating = updatingVariantId === v.id;
                        const edits = variantPriceEdits[v.id] || {
                          selling_price: String(v.selling_price),
                          mrp: v.mrp ? String(v.mrp) : '',
                          sku: v.sku || '',
                        };

                        return (
                          <tr key={v.id} className="hover:bg-amber-50/20 transition-colors">
                            {/* Size Name & SKU */}
                            <td className="py-3 px-3 font-bold text-gray-900">
                              <span className="font-serif text-sm">{v.size}</span>
                              {v.sku && <span className="block text-[10px] text-gray-400 font-mono">{v.sku}</span>}
                            </td>

                            {/* Stock Stepper (- qty +) */}
                            <td className="py-3 px-3 text-center">
                              <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleStockStep(v.id, -1)}
                                  disabled={v.stock <= 0 || isUpdating}
                                  className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 font-bold transition-colors"
                                >
                                  −
                                </button>
                                <span className="px-3 py-1 font-bold text-gray-900 min-w-[32px] text-center">
                                  {isUpdating ? <Loader2 className="w-3 h-3 animate-spin mx-auto text-[#5E1224]" /> : v.stock}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleStockStep(v.id, 1)}
                                  disabled={isUpdating}
                                  className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 font-bold transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </td>

                            {/* Price (₹) */}
                            <td className="py-3 px-3 text-right">
                              {isEditingAllPrices ? (
                                <input
                                  type="number"
                                  value={edits.selling_price}
                                  onChange={(e) =>
                                    setVariantPriceEdits((prev) => ({
                                      ...prev,
                                      [v.id]: { ...edits, selling_price: e.target.value },
                                    }))
                                  }
                                  className="w-20 px-2 py-1 text-right text-xs border border-gray-300 rounded font-semibold focus:ring-1 focus:ring-[#5E1224]"
                                />
                              ) : (
                                <span className="font-semibold text-gray-900">
                                  ₹{v.selling_price.toLocaleString('en-IN')}
                                </span>
                              )}
                            </td>

                            {/* MRP (₹) */}
                            <td className="py-3 px-3 text-right">
                              {isEditingAllPrices ? (
                                <input
                                  type="number"
                                  value={edits.mrp}
                                  placeholder="MRP"
                                  onChange={(e) =>
                                    setVariantPriceEdits((prev) => ({
                                      ...prev,
                                      [v.id]: { ...edits, mrp: e.target.value },
                                    }))
                                  }
                                  className="w-20 px-2 py-1 text-right text-xs border border-gray-300 rounded text-gray-600 focus:ring-1 focus:ring-[#5E1224]"
                                />
                              ) : (
                                <span className="text-gray-500">
                                  {v.mrp ? `₹${v.mrp.toLocaleString('en-IN')}` : '—'}
                                </span>
                              )}
                            </td>

                            {/* ON/OFF Switch */}
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleVariantActive(v)}
                                disabled={isUpdating}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm ${
                                  v.is_active
                                    ? 'bg-[#5E1224] text-white hover:bg-[#4A0E1C]'
                                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                }`}
                              >
                                {v.is_active ? 'ON' : 'OFF'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary Bar (Visual 2 bottom) */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-[#FAF6F0] rounded-xl border border-[#E8DFD0] text-center">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    Total Sizes
                  </span>
                  <span className="font-serif text-base font-bold text-gray-900">{totalSizes}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    Total Stock
                  </span>
                  <span
                    className={`font-serif text-base font-bold ${
                      totalStock === 0 ? 'text-red-700' : totalStock < 10 ? 'text-amber-700' : 'text-emerald-800'
                    }`}
                  >
                    {totalStock}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    Price Range
                  </span>
                  <span className="font-serif text-base font-bold text-[#5E1224]">{priceRange}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. STICKY BOTTOM SAVE & BACK ACTION BAR
          ======================================================== */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8DFD0] px-4 sm:px-8 py-3.5 shadow-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBackToProducts}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Products</span>
          </button>

          <div className="flex items-center gap-3">
            {isDirty ? (
              <span className="hidden sm:inline-flex items-center gap-2 text-xs text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes in Product Details / Photos / Pricing
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 font-semibold">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                All changes saved
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveProduct}
              disabled={savingProduct}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#5E1224] hover:bg-[#4A0E1C] text-white text-xs sm:text-sm font-bold rounded-xl shadow-md disabled:opacity-50 transition-all hover:scale-[1.02]"
            >
              {savingProduct ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Product...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Product</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          4. MODALS & PICKERS
          ======================================================== */}

      {/* Media Library Picker Modal */}
      <MediaLibraryPickerModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={handleSelectFromLibrary}
        targetId={product.id}
        alreadySelectedKeys={new Set(photos.map(getAssetKey))}
        title={`Attach Media to ${name || product.name}`}
      />

      {/* Add URL Photo Modal */}
      {urlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E8DFD0] space-y-4">
            <h3 className="font-serif font-bold text-lg text-gray-900">Add Media via Web URL</h3>
            <p className="text-xs text-gray-500">
              Enter an absolute image or video URL (supports Cloudinary, HTTPS image paths, and MP4/WebM videos).
            </p>
            <input
              type="url"
              required
              placeholder="https://res.cloudinary.com/..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-[#5E1224] focus:outline-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setUrlInput('');
                  setUrlModalOpen(false);
                }}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddUrlPhoto}
                disabled={!urlInput.trim()}
                className="px-5 py-2 bg-[#5E1224] text-white rounded-xl text-xs font-semibold hover:bg-[#4A0E1C] disabled:opacity-50"
              >
                Add to Gallery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Size Modal */}
      {addSizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E8DFD0] space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="font-serif font-bold text-lg text-gray-900">Add Garment Size</h3>
              <button
                onClick={() => setAddSizeModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addSizeError && (
              <div className="p-3 bg-red-50 text-red-800 rounded-lg text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{addSizeError}</span>
              </div>
            )}

            <form onSubmit={handleAddSizeSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Size Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. XS, S, M, L, XL, XXL, 3XL, Custom"
                  value={newSize}
                  onChange={(e) => setNewSize(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#5E1224] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="3490"
                    value={newSizePrice}
                    onChange={(e) => setNewSizePrice(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#5E1224] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    MRP (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="4999"
                    value={newSizeMrp}
                    onChange={(e) => setNewSizeMrp(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#5E1224] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Initial Stock Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="10"
                    value={newSizeStock}
                    onChange={(e) => setNewSizeStock(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#5E1224] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    SKU (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={newSizeSku}
                    onChange={(e) => setNewSizeSku(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#5E1224] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setAddSizeModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingSizeLoading}
                  className="px-5 py-2 bg-[#5E1224] text-white rounded-xl text-xs font-semibold hover:bg-[#4A0E1C] disabled:opacity-50"
                >
                  {addingSizeLoading ? 'Adding...' : 'Add Size Variant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center gap-3 text-red-700">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-gray-900">Delete Product</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-gray-700">
              Are you sure you want to permanently delete <strong>{name || product.name}</strong> and all associated size variants?
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                disabled={deleting}
                className="px-5 py-2 bg-red-700 text-white rounded-xl text-xs font-semibold hover:bg-red-800 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
