r"""Import Royal Libas New Arrivals (2026-10-31) into Cloudinary and Catalogue.

Source: Royal_Libas_New_Arrivals_20261031\Cleaned_Products
Target: Cloudinary (galbyoxi) & royal_libas.db

Safety & Business Requirements:
- Strictly imports only the 10 named design folders in Cleaned_Products.
- Ignores sibling Originals, preview sheets, documents, and ZIP files.
- Preserves the existing 22 real boutique dresses, their IDs, variants, stock, and owner edits.
- Preserves the 18 legacy sample products (status=ARCHIVED), orders, and order items intact.
- Video product 'Naqsh Ivory Mocha Three-Piece Suit' has 1 video and 1 cover image:
  together they form ONE product, with cover image at sort_order=1 and video at sort_order=2.
- Creates new products with status='DRAFT' and is_active=False.
- Canonical collections are synchronized (TWO PIECES -> two-pieces, SUIT SET -> suit-set, HEAVY DRESS -> heavy-dress).
- Specifications (fabric, care, fit, description) remain blank (None) for owner completion.
- Creates 5 variants (S, M, L, XL, XXL) with stock 5 (total 25 units/product), selling_price ₹1,999, MRP ₹2,499.
- Generates unique SKUs following RL-{CAT}-{SUBCAT}-{NUM}-{SIZE}.
- Records initial stock in StockAdjustment with reason 'INITIAL_SETUP'.
- Full manifest tracking for idempotent, safe re-runs.

Changed-Photo Detection & Asset Replacement Guarantees:
- Reuses registered MediaAsset or manifest upload ONLY when content_hash, resource_type,
  cloud_name, and folder mapping match.
- Path match alone does NOT prove content is unchanged.
- When a file has changed:
  * Uploads replacement as a new uniquely identified Cloudinary asset/version.
  * Leaves previous MediaAsset intact for other products and history.
  * Registers new MediaAsset with trusted metadata and new content hash.
  * Replaces ONLY the corresponding importer-managed ProductImage association.
  * Preserves sort_order, cover position, unrelated gallery items, and other products.
  * Failure keeps the existing working gallery association intact.
  * Unchanged reruns produce zero duplicate uploads and zero duplicate gallery items.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy.orm import Session
from app.config import (
    CLOUDINARY_CLOUD_NAME,
    is_cloudinary_configured,
)

CLOUDINARY_CUSTOM_DOMAIN = os.getenv("CLOUDINARY_CUSTOM_DOMAIN", "").strip() or None
from app.database import SessionLocal
from app.models import (
    Collection,
    MediaAsset,
    MediaFolder,
    Product,
    ProductImage,
    ProductVariant,
    StockAdjustment,
)
from app.services.cloudinary_service import (
    create_cloudinary_folder,
    init_cloudinary,
)
from app.services.product_service import (
    CANONICAL_TAXONOMY,
    CATEGORY_TO_COLLECTION_SLUG,
    sync_product_category_and_collections,
)
import cloudinary
import cloudinary.uploader
import cloudinary.api

DEFAULT_SOURCE_DIR = os.path.abspath(
    r"Royal_Libas_New_Arrivals_20261031\Cleaned_Products"
)
DEFAULT_MANIFEST_PATH = os.path.abspath("backend/new_arrivals_manifest_20261031.json")
ROOT_MEDIA_FOLDER = "Photos for royal libas"

TOP_CATEGORY_MAP: Dict[str, str] = {
    "two pieces": "TWO PIECES",
    "two-pieces": "TWO PIECES",
    "two_pieces": "TWO PIECES",
    "suit set": "SUIT SET",
    "suit-set": "SUIT SET",
    "suit_set": "SUIT SET",
    "heavy dress": "HEAVY DRESS",
    "heavy-dress": "HEAVY DRESS",
    "heavy_dress": "HEAVY DRESS",
}

CATEGORY_FOLDER_MAP: Dict[str, str] = {
    "TWO PIECES": "Two Pieces",
    "SUIT SET": "Suit Set",
    "HEAVY DRESS": "Heavy Dress",
}

SUBCATEGORY_MAP: Dict[str, str] = {
    "co-ord sets": "Co-ord Sets",
    "coord sets": "Co-ord Sets",
    "co ord sets": "Co-ord Sets",
    "kurta pant": "Kurta Pant",
    "kurta-pant": "Kurta Pant",
    "three pieces": "Three Pieces",
    "three-pieces": "Three Pieces",
    "semi-party wear": "Semi-party Wear",
    "semi party wear": "Semi-party Wear",
    "party wear": "Party Wear",
    "designer wear": "Designer Wear",
    "lehenga": "Lehenga",
    "short kurta": "Short Kurta",
    "palazzo set": "Palazzo Set",
    "sharara / gharara": "Sharara / Gharara",
    "sharara gharara": "Sharara / Gharara",
}

CAT_CODE_MAP = {
    "TWO PIECES": "TP",
    "SUIT SET": "SS",
    "HEAVY DRESS": "HD",
}

SUBCAT_CODE_MAP = {
    "Co-ord Sets": "CS",
    "Kurta Pant": "KP",
    "Three Pieces": "3P",
    "Semi-party Wear": "SPW",
    "Party Wear": "PW",
    "Lehenga": "LH",
    "Short Kurta": "SK",
    "Palazzo Set": "PS",
    "Designer Wear": "DW",
    "Sharara / Gharara": "SG",
}

DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL"]
DEFAULT_PRICE = Decimal("1999.00")
DEFAULT_MRP = Decimal("2499.00")
DEFAULT_STOCK = 5


def compute_sha256(filepath: str) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def normalize_path(p: Optional[str]) -> str:
    """Normalize path by replacing backslashes and stripping whitespace/slashes."""
    if not p:
        return ""
    return p.replace("\\", "/").strip().strip("/")


APPROVED_CLOUDINARY_HOSTS = {
    "res.cloudinary.com",
    "api.cloudinary.com",
}


def is_approved_delivery_host(hostname: Optional[str], custom_domain: Optional[str] = None) -> bool:
    """Check if hostname is an approved Cloudinary CDN host or configured custom domain."""
    if not hostname:
        return False
    host = hostname.lower().strip()
    if host in APPROVED_CLOUDINARY_HOSTS:
        return True
    if re.match(r"^res(-\d+)?\.cloudinary\.com$", host):
        return True
    effective_custom = custom_domain or CLOUDINARY_CUSTOM_DOMAIN
    if effective_custom and effective_custom.strip():
        if host == effective_custom.lower().strip():
            return True
    return False


def validate_cloudinary_delivery_url(
    url: Optional[str],
    expected_cloud_name: str,
    expected_resource_type: str,
    expected_public_id: str,
    expected_delivery_type: str = "upload",
    custom_domain: Optional[str] = None,
) -> Tuple[bool, str]:
    """Perform structured, Cloudinary-aware validation of a delivery URL.

    Validates:
    - HTTPS scheme
    - Approved host (res.cloudinary.com, shard domains, or explicitly configured custom domain)
    - Cloud environment matches expected_cloud_name
    - Resource type matches expected_resource_type ('image' or 'video')
    - Delivery type matches expected_delivery_type ('upload', etc.)
    - Path remainder resolves to the expected public_id (handling version segments,
      transformations, nested folders, and URL decoding).
    """
    if not url or not isinstance(url, str):
        return False, "Missing delivery URL"

    url_str = url.strip()
    try:
        parsed = urllib.parse.urlsplit(url_str)
    except Exception as e:
        return False, f"Failed to parse delivery URL: {e}"

    # 1. Scheme check: HTTPS required
    if parsed.scheme.lower() != "https":
        return False, f"Delivery URL must use HTTPS scheme, got: {parsed.scheme}"

    # 2. Host check: Approved Cloudinary CDN host or configured custom domain
    hostname = parsed.hostname
    if not hostname or not is_approved_delivery_host(hostname, custom_domain):
        return False, f"Delivery URL hostname '{hostname}' is not an approved Cloudinary delivery host"

    # 3. Path segmentation check
    raw_path = parsed.path.lstrip("/")
    decoded_path = urllib.parse.unquote(raw_path)
    segments = [s.strip() for s in decoded_path.split("/") if s.strip()]

    # Cloudinary path format: /{cloud_name}/{resource_type}/{delivery_type}/[transformations...]/[v{version}/]{public_id}[.{format}]
    if len(segments) < 4:
        return False, f"Delivery URL path has too few segments ({len(segments)}): {decoded_path}"

    url_cloud = segments[0]
    if url_cloud != expected_cloud_name:
        return False, f"Delivery URL cloud name '{url_cloud}' does not match expected '{expected_cloud_name}'"

    url_res_type = segments[1]
    if url_res_type != expected_resource_type:
        return False, f"Delivery URL resource type '{url_res_type}' does not match expected '{expected_resource_type}'"

    url_del_type = segments[2]
    if url_del_type != expected_delivery_type:
        return False, f"Delivery URL delivery type '{url_del_type}' does not match expected '{expected_delivery_type}'"

    # 4. Public ID matching in remaining segments
    remaining = segments[3:]
    norm_expected_pid = urllib.parse.unquote(expected_public_id).replace("\\", "/").strip().strip("/")
    expected_pid_segments = [s for s in norm_expected_pid.split("/") if s]

    if len(remaining) < len(expected_pid_segments):
        return False, f"Delivery URL does not contain enough segments for public_id '{norm_expected_pid}'"

    # The public_id must occupy the tail of the remaining segments
    pid_tail = remaining[-len(expected_pid_segments):]
    prefix_segments = remaining[:-len(expected_pid_segments)]

    # Validate prefix segments: each must be an optional version segment or valid transformation
    version_count = 0
    for seg in prefix_segments:
        if re.match(r"^v\d+$", seg):
            version_count += 1
            if version_count > 1:
                return False, f"Delivery URL contains multiple version segments in prefix: {prefix_segments}"
            continue

        is_named_transform = bool(re.match(r"^t_[a-zA-Z0-9_-]+$", seg))
        is_param_transform = all(
            bool(re.match(r"^[a-z]{1,4}_", param.strip()))
            for param in seg.split(",")
            if param.strip()
        )
        if not (is_named_transform or is_param_transform):
            return False, f"Delivery URL contains invalid prefix segment '{seg}' before public_id"

    # Compare tail segments with expected_pid_segments
    for i in range(len(expected_pid_segments) - 1):
        if pid_tail[i] != expected_pid_segments[i]:
            return False, f"Delivery URL public_id folder segment '{pid_tail[i]}' does not match expected '{expected_pid_segments[i]}'"

    final_url_seg = pid_tail[-1]
    final_expected_seg = expected_pid_segments[-1]

    if final_url_seg == final_expected_seg:
        pass
    else:
        url_base, _ = os.path.splitext(final_url_seg)
        expected_base, _ = os.path.splitext(final_expected_seg)
        if url_base == final_expected_seg or url_base == expected_base:
            pass
        else:
            return False, f"Delivery URL public_id '{'/'.join(pid_tail)}' does not match declared public_id '{norm_expected_pid}'"

    return True, "Valid Cloudinary delivery URL"


def validate_manifest_recovery_entry(
    entry: Optional[Dict[str, Any]],
    current_hash: str,
    expected_resource_type: str,
    target_folder: str,
    expected_rel_path: str,
    expected_filename: str,
    expected_cloud_name: str,
    custom_domain: Optional[str] = None,
) -> Tuple[bool, str]:
    """Validate manifest recovery entry against current source file identity, folder, environment, and delivery URL.

    Returns (is_valid, failure_reason).
    """
    if not entry or not isinstance(entry, dict):
        return False, "No manifest entry found"

    # Status check: must represent a completed upload or registration
    status = entry.get("status")
    if status not in ("uploaded", "registered"):
        return False, f"Invalid manifest status: {status}"

    # Content hash check
    entry_hash = entry.get("content_hash")
    if not entry_hash or entry_hash != current_hash:
        return False, f"Content hash mismatch (entry: {entry_hash}, current: {current_hash})"

    # Resource type check
    entry_res_type = entry.get("resource_type")
    if not entry_res_type or entry_res_type != expected_resource_type:
        return False, f"Resource type mismatch (entry: {entry_res_type}, expected: {expected_resource_type})"

    # Cloudinary environment check
    entry_cloud = entry.get("cloud_name")
    if not entry_cloud or entry_cloud != expected_cloud_name:
        return False, f"Cloud name mismatch (entry: {entry_cloud}, expected: {expected_cloud_name})"

    # Target folder check
    entry_folder = normalize_path(entry.get("folder"))
    norm_target = normalize_path(target_folder)
    if not entry_folder or entry_folder != norm_target:
        return False, f"Folder mismatch (entry: '{entry_folder}', target: '{norm_target}')"

    # Relative source path check
    entry_rel = normalize_path(entry.get("relative_source_path"))
    norm_rel = normalize_path(expected_rel_path)
    if not entry_rel or entry_rel != norm_rel:
        return False, f"Relative path mismatch (entry: '{entry_rel}', expected: '{norm_rel}')"

    # Filename check
    entry_fname = entry.get("filename")
    if not entry_fname or entry_fname.lower() != expected_filename.lower():
        return False, f"Filename mismatch (entry: '{entry_fname}', expected: '{expected_filename}')"

    # Public ID check (non-empty string; does not assume folder prefix equals asset_folder)
    public_id = entry.get("public_id")
    if not public_id or not isinstance(public_id, str) or not public_id.strip():
        return False, "Missing or invalid public_id"

    # Structured Cloudinary delivery URL & identity validation
    delivery_type = entry.get("delivery_type") or "upload"
    url = entry.get("secure_url") or entry.get("url")
    is_valid_url, url_reason = validate_cloudinary_delivery_url(
        url=url,
        expected_cloud_name=expected_cloud_name,
        expected_resource_type=expected_resource_type,
        expected_public_id=public_id,
        expected_delivery_type=delivery_type,
        custom_domain=custom_domain,
    )
    if not is_valid_url:
        return False, url_reason

    return True, "Valid recovery entry"


def detect_file_type(filename: str) -> Tuple[str, str, str]:
    """Return (resource_type, format, mime_type)."""
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if ext == "mp4":
        return "video", "mp4", "video/mp4"
    elif ext in ("jpg", "jpeg"):
        return "image", "jpg", "image/jpeg"
    elif ext == "png":
        return "image", "png", "image/png"
    elif ext == "webp":
        return "image", "webp", "image/webp"
    else:
        return "image", ext, "application/octet-stream"


def slugify(text: str) -> str:
    """Generate URL-friendly slug."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s.strip("-")


def load_or_create_manifest(manifest_path: str) -> Dict[str, Any]:
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                data.setdefault("files", {})
                data.setdefault("folders", [])
                return data
        except Exception as e:
            print(f"[WARN] Failed to load existing manifest ({e}), starting fresh.")
    return {
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "cloud_name": CLOUDINARY_CLOUD_NAME,
        "files": {},
        "folders": [],
    }


def save_manifest_atomic(manifest: Dict[str, Any], manifest_path: str):
    """Save manifest to disk atomically using a temporary file and fsync."""
    manifest["updated_at"] = datetime.now().isoformat()
    manifest_dir = os.path.dirname(os.path.abspath(manifest_path))
    os.makedirs(manifest_dir, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(
        prefix="manifest_tmp_",
        suffix=".json",
        dir=manifest_dir,
    )
    try:
        with open(fd, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, manifest_path)
    except Exception as e:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise e


def save_manifest(manifest: Dict[str, Any], manifest_path: str):
    """Backwards-compatible alias for atomic manifest persistence."""
    save_manifest_atomic(manifest, manifest_path)


def get_next_subcat_num(db: Session, cat: str, subcat: str) -> int:
    """Find the next sequential 2-digit number for SKUs in this subcategory."""
    cat_code = CAT_CODE_MAP.get(cat, "RL")
    subcat_code = SUBCAT_CODE_MAP.get(subcat, "GEN")
    prefix = f"RL-{cat_code}-{subcat_code}-"

    variants = db.query(ProductVariant.sku).filter(ProductVariant.sku.like(f"{prefix}%")).all()
    nums: Set[int] = set()
    for (sku,) in variants:
        parts = sku.split("-")
        if len(parts) >= 5 and parts[3].isdigit():
            nums.add(int(parts[3]))

    return max(nums, default=0) + 1


def scan_new_arrivals(source_dir: str) -> List[Dict[str, Any]]:
    """Scan and parse design folders in Cleaned_Products."""
    if not os.path.exists(source_dir):
        raise FileNotFoundError(f"Source directory does not exist: {source_dir}")

    designs: List[Dict[str, Any]] = []

    for root, dirs, files in os.walk(source_dir):
        if not files:
            continue

        rel_path = os.path.relpath(root, source_dir).replace("\\", "/")
        parts = [p.strip() for p in rel_path.split("/") if p.strip()]

        if len(parts) != 3:
            continue

        raw_cat, raw_subcat, design_name = parts[0], parts[1], parts[2]
        cat = TOP_CATEGORY_MAP.get(raw_cat.lower())
        subcat = SUBCATEGORY_MAP.get(raw_subcat.lower())

        if not cat or not subcat:
            print(f"[SKIP] Non-canonical taxonomy: {rel_path}")
            continue

        folder_cat = CATEGORY_FOLDER_MAP.get(cat, cat)
        target_folder = f"{ROOT_MEDIA_FOLDER}/{folder_cat}/{subcat}/{design_name}"
        
        # Sort files: cover PNG first, other images second, video last
        design_files = []
        for f in files:
            full_path = os.path.join(root, f)
            res_type, fmt, mime = detect_file_type(f)
            is_cover = "cover" in f.lower()
            design_files.append({
                "filename": f,
                "full_path": full_path,
                "relative_path": f"{rel_path}/{f}",
                "resource_type": res_type,
                "format": fmt,
                "mime_type": mime,
                "is_cover": is_cover,
                "size": os.path.getsize(full_path),
            })

        def file_sort_key(item):
            if item["is_cover"]:
                return 0
            if item["resource_type"] == "image":
                return 1
            return 2

        design_files.sort(key=file_sort_key)

        designs.append({
            "design_name": design_name,
            "category": cat,
            "subcategory": subcat,
            "target_folder": target_folder,
            "source_rel_dir": rel_path,
            "files": design_files,
        })

    designs.sort(key=lambda d: (d["category"], d["subcategory"], d["design_name"]))
    return designs


def import_new_arrivals(
    dry_run: bool = True,
    confirm: bool = False,
    mock_upload: bool = False,
    source_dir: str = DEFAULT_SOURCE_DIR,
    manifest_path: str = DEFAULT_MANIFEST_PATH,
    db_session: Optional[Session] = None,
    reconcile_taxonomy: bool = False,
    custom_domain: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute import workflow with full safety checks, changed-photo detection, and idempotency."""
    print("=" * 70)
    print(">>> ROYAL LIBAS NEW ARRIVALS IMPORT & CATALOGUE RECONCILIATION <<<")
    print(f"Source Directory:    {source_dir}")
    print(f"Manifest Path:       {manifest_path}")
    print(f"Mode:                {'DRY-RUN (Simulated)' if dry_run else 'LIVE EXECUTION'}")
    print(f"Mock Uploads:        {mock_upload}")
    print(f"Reconcile Taxonomy:  {reconcile_taxonomy}")
    if custom_domain:
        print(f"Custom CDN Domain:   {custom_domain}")
    print("=" * 70)

    if not dry_run and not confirm:
        print("[ERROR] Must specify either --dry-run or --confirm")
        sys.exit(1)

    if not mock_upload:
        init_cloudinary()
        if not is_cloudinary_configured():
            print("[ERROR] Cloudinary credentials not configured!")
            sys.exit(1)
        try:
            ping = cloudinary.api.ping()
            print(f"[Cloudinary] Connection verified: ping={ping.get('status')}")
        except Exception as e:
            print(f"[ERROR] Cloudinary API connection failed: {e}")
            sys.exit(1)

    manifest = load_or_create_manifest(manifest_path)
    db = db_session or SessionLocal()
    close_db = db_session is None

    summary: Dict[str, Any] = {
        "designs_discovered": 0,
        "media_files_discovered": 0,
        "cloudinary_folders_created": 0,
        "media_folders_created": 0,
        "media_assets_uploaded": 0,
        "media_assets_reused": 0,
        "media_assets_replaced": 0,
        "products_created": 0,
        "products_reused": 0,
        "variants_created": 0,
        "variants_reused": 0,
        "stock_adjustments_recorded": 0,
        "images_attached": 0,
        "images_replaced": 0,
        "errors": [],
        "created_products": [],
    }

    try:
        designs = scan_new_arrivals(source_dir)
        summary["designs_discovered"] = len(designs)
        total_files = sum(len(d["files"]) for d in designs)
        summary["media_files_discovered"] = total_files

        print(f"\n[Step 1] Discovered {len(designs)} design folders with {total_files} media files.")
        for idx, d in enumerate(designs, 1):
            f_types = [f["resource_type"] for f in d["files"]]
            print(f"  {idx:2d}. [{d['category']} › {d['subcategory']}] {d['design_name']} ({len(d['files'])} files: {f_types})")

        # Step 2: Ensure Media Folders (Cloudinary & DB)
        print("\n[Step 2] Synchronizing Media Folders...")
        for d in designs:
            folder_path = d["target_folder"]
            db_folder = db.query(MediaFolder).filter(MediaFolder.path == folder_path).first()
            if not db_folder:
                parts = folder_path.rsplit("/", 1)
                parent_p = parts[0] if len(parts) > 1 else None
                dir_n = parts[1] if len(parts) > 1 else folder_path
                
                if parent_p:
                    parent_db = db.query(MediaFolder).filter(MediaFolder.path == parent_p).first()
                    if not parent_db and not dry_run:
                        p_parts = parent_p.rsplit("/", 1)
                        db.add(MediaFolder(name=p_parts[1] if len(p_parts) > 1 else parent_p, path=parent_p, parent_path=p_parts[0] if len(p_parts) > 1 else None))
                        db.flush()

                if not dry_run:
                    db_folder = MediaFolder(
                        name=dir_n,
                        path=folder_path,
                        parent_path=parent_p,
                    )
                    db.add(db_folder)
                    db.flush()
                summary["media_folders_created"] += 1
                print(f"  + Created DB folder: {folder_path}")

            if not dry_run and not mock_upload:
                try:
                    c_res = create_cloudinary_folder(folder_path)
                    if c_res.get("success"):
                        summary["cloudinary_folders_created"] += 1
                except Exception as e:
                    print(f"  [WARN] Cloudinary folder creation failed for {folder_path}: {e}")

        # Step 3: Upload & Register Media Assets with Strict Changed-Photo Detection
        print("\n[Step 3] Uploading & Registering Media Assets...")
        asset_map: Dict[str, MediaAsset] = {}  # full_path -> MediaAsset
        pending_manifest_registrations: List[Tuple[str, MediaAsset]] = []

        # Distinguish previously committed assets from assets created in this transaction
        committed_asset_ids: Set[int] = {row[0] for row in db.query(MediaAsset.id).all()}
        newly_flushed_asset_ids: Set[int] = set()

        for d in designs:
            target_folder = d["target_folder"]
            for f_info in d["files"]:
                full_path = f_info["full_path"]
                rel_path = f_info["relative_path"]
                filename = f_info["filename"]
                res_type = f_info["resource_type"]
                fmt = f_info["format"]
                mime = f_info["mime_type"]
                file_size = f_info["size"]
                content_hash = compute_sha256(full_path)

                # Strict Content-Hash & Environment Check:
                # Reuse a registered asset ONLY when its content hash, resource type,
                # Cloudinary environment, and intended folder mapping are compatible.
                # Matching relative_source_path alone DOES NOT prove the content is unchanged!
                db_asset = db.query(MediaAsset).filter(
                    MediaAsset.content_hash == content_hash,
                    MediaAsset.resource_type == res_type,
                    MediaAsset.cloud_name == CLOUDINARY_CLOUD_NAME,
                    MediaAsset.folder == target_folder,
                ).first()

                if db_asset:
                    asset_map[full_path] = db_asset
                    summary["media_assets_reused"] += 1

                    asset_meta = {
                        "asset_id": db_asset.cloudinary_asset_id,
                        "public_id": db_asset.public_id,
                        "cloud_name": db_asset.cloud_name or CLOUDINARY_CLOUD_NAME,
                        "secure_url": db_asset.secure_url or db_asset.url,
                        "url": db_asset.url,
                        "resource_type": db_asset.resource_type,
                        "format": db_asset.format or fmt,
                        "width": db_asset.width,
                        "height": db_asset.height,
                        "duration": float(db_asset.duration) if db_asset.duration is not None else None,
                        "file_size": db_asset.file_size or file_size,
                        "delivery_type": db_asset.delivery_type or "upload",
                        "content_hash": content_hash,
                        "folder": target_folder,
                        "filename": filename,
                        "relative_source_path": rel_path,
                    }

                    # Distinguish previously committed assets from assets created in current transaction
                    if db_asset.id in committed_asset_ids:
                        print(f"  [Reused Committed Asset] #{db_asset.id} {filename} (hash match: {content_hash[:12]})")
                        manifest.setdefault("files", {})[rel_path] = {
                            "status": "registered",
                            "db_id": db_asset.id,
                            **asset_meta,
                        }
                        save_manifest_atomic(manifest, manifest_path)
                    else:
                        # Asset is uncommitted in current transaction: preserve as 'uploaded' until commit
                        print(f"  [Reused Uncommitted Asset] #{db_asset.id} {filename} (hash match: {content_hash[:12]}, pending commit)")
                        manifest.setdefault("files", {})[rel_path] = {
                            "status": "uploaded",
                            **asset_meta,
                        }
                        save_manifest_atomic(manifest, manifest_path)
                        pending_manifest_registrations.append((rel_path, db_asset))

                    continue

                # Check if this source file path had a previous asset with a DIFFERENT hash
                old_db_asset = db.query(MediaAsset).filter(
                    MediaAsset.relative_source_path == rel_path,
                    MediaAsset.folder == target_folder,
                ).order_by(MediaAsset.id.desc()).first()

                is_changed_file = bool(old_db_asset and old_db_asset.content_hash != content_hash)
                if is_changed_file:
                    print(f"  [Changed Photo Detected] {filename} changed content hash (old: {old_db_asset.content_hash[:8]}... -> new: {content_hash[:8]}...)")
                    summary["media_assets_replaced"] += 1

                # Check manifest for previous upload metadata:
                # VALIDATE manifest entries against CURRENT source hash, folder, relative path,
                # filename, environment, and delivery URL before recovering an upload!
                manifest_entry = manifest.get("files", {}).get(rel_path, {})
                is_valid_recovery, recovery_reason = validate_manifest_recovery_entry(
                    entry=manifest_entry,
                    current_hash=content_hash,
                    expected_resource_type=res_type,
                    target_folder=target_folder,
                    expected_rel_path=rel_path,
                    expected_filename=filename,
                    expected_cloud_name=CLOUDINARY_CLOUD_NAME,
                    custom_domain=custom_domain,
                )

                upload_meta = None
                if is_valid_recovery:
                    upload_meta = manifest_entry
                    print(f"  [Recovered Upload] {filename} from manifest (hash: {content_hash[:12]})")
                else:
                    if manifest_entry:
                        print(f"  [Recovery Skipped] {filename}: {recovery_reason}. Proceeding with standard upload path.")
                    if dry_run:
                        tag = "[Replacement Upload]" if is_changed_file else "[New Upload]"
                        print(f"  [Dry-Run Would Upload] {filename} -> {target_folder} ({res_type}) {tag}")
                        summary["media_assets_uploaded"] += 1
                        continue
                    elif mock_upload:
                        mock_pid = f"mock_{content_hash[:16]}"
                        mock_url = f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/{res_type}/upload/{mock_pid}.{fmt}"
                        upload_meta = {
                            "public_id": mock_pid,
                            "asset_id": f"asset_{content_hash[:12]}",
                            "secure_url": mock_url,
                            "url": mock_url,
                            "resource_type": res_type,
                            "format": fmt,
                            "width": 1080,
                            "height": 1350,
                            "duration": 15.0 if res_type == "video" else None,
                            "file_size": file_size,
                            "delivery_type": "upload",
                            "cloud_name": CLOUDINARY_CLOUD_NAME,
                        }
                        manifest["files"][rel_path] = {
                            "status": "uploaded",
                            **upload_meta,
                            "content_hash": content_hash,
                            "folder": target_folder,
                            "filename": filename,
                            "relative_source_path": rel_path,
                        }
                        save_manifest_atomic(manifest, manifest_path)
                    else:
                        # Live Cloudinary upload: upload as a new uniquely identified version
                        max_retries = 3
                        uploaded_res = None
                        for attempt in range(max_retries):
                            try:
                                with open(full_path, "rb") as f_obj:
                                    file_bytes = f_obj.read()

                                uploaded_res = cloudinary.uploader.upload(
                                    file_bytes,
                                    folder=target_folder,
                                    resource_type=res_type,
                                    overwrite=False,
                                    unique_filename=True,
                                    use_filename=True,
                                )
                                break
                            except Exception as up_err:
                                err_str = str(up_err).lower()
                                if "429" in err_str or "rate limit" in err_str:
                                    time.sleep(2 ** attempt + 1)
                                elif attempt < max_retries - 1:
                                    time.sleep(1)
                                else:
                                    print(f"  [ERROR] Upload failed for {filename}: {up_err}")
                                    summary["errors"].append({"file": filename, "error": str(up_err)})
                                    uploaded_res = None

                        if not uploaded_res:
                            continue

                        public_id = uploaded_res.get("public_id")
                        secure_url = uploaded_res.get("secure_url") or uploaded_res.get("url")
                        asset_id = uploaded_res.get("asset_id")

                        upload_meta = {
                            "public_id": public_id,
                            "asset_id": asset_id,
                            "secure_url": secure_url,
                            "url": uploaded_res.get("url", secure_url),
                            "resource_type": uploaded_res.get("resource_type", res_type),
                            "format": uploaded_res.get("format", fmt),
                            "width": uploaded_res.get("width"),
                            "height": uploaded_res.get("height"),
                            "duration": uploaded_res.get("duration"),
                            "file_size": uploaded_res.get("bytes", file_size),
                            "delivery_type": uploaded_res.get("type", "upload"),
                            "cloud_name": CLOUDINARY_CLOUD_NAME,
                        }

                        # Persist upload result to manifest immediately for recovery
                        manifest["files"][rel_path] = {
                            "status": "uploaded",
                            **upload_meta,
                            "content_hash": content_hash,
                            "folder": target_folder,
                            "filename": filename,
                            "relative_source_path": rel_path,
                        }
                        save_manifest_atomic(manifest, manifest_path)

                # Register MediaAsset in DB transactionally
                if not dry_run and upload_meta:
                    display_name = os.path.splitext(filename)[0]
                    new_asset = MediaAsset(
                        filename=filename,
                        display_name=display_name,
                        public_id=upload_meta["public_id"],
                        cloudinary_asset_id=upload_meta.get("asset_id"),
                        cloud_name=upload_meta.get("cloud_name", CLOUDINARY_CLOUD_NAME),
                        delivery_type=upload_meta.get("delivery_type", "upload"),
                        content_hash=content_hash,
                        relative_source_path=rel_path,
                        url=upload_meta["secure_url"],
                        secure_url=upload_meta["secure_url"],
                        resource_type=upload_meta.get("resource_type", res_type),
                        format=upload_meta.get("format", fmt),
                        width=upload_meta.get("width"),
                        height=upload_meta.get("height"),
                        duration=upload_meta.get("duration"),
                        file_size=upload_meta.get("file_size", file_size),
                        mime_type=mime,
                        alt_text=display_name,
                        folder=target_folder,
                    )
                    db.add(new_asset)
                    db.flush()
                    newly_flushed_asset_ids.add(new_asset.id)
                    asset_map[full_path] = new_asset
                    summary["media_assets_uploaded"] += 1

                    # Queue registration update for after successful DB commit (Two-Phase Commit Safety)
                    pending_manifest_registrations.append((rel_path, new_asset))
                    action_tag = "Replacement" if is_changed_file else "New"
                    print(f"  + Registered {action_tag} MediaAsset #{new_asset.id}: {filename} (hash: {content_hash[:12]}) (pending commit)")

        # Step 4: Integrate Dresses into Products, Inventory, and Collections
        print("\n[Step 4] Integrating Dresses into Products, Variants, and Collections...")
        subcat_counters: Dict[Tuple[str, str], int] = {}

        for d in designs:
            design_name = d["design_name"]
            cat = d["category"]
            subcat = d["subcategory"]
            target_folder = d["target_folder"]
            base_slug = slugify(design_name)

            # Stable Source Identity: match by target_folder
            existing_prod = db.query(Product).filter(Product.source_folder == target_folder).first()

            if existing_prod:
                print(f"  [Existing Product] #{existing_prod.id} '{existing_prod.name}' (status={existing_prod.status})")
                summary["products_reused"] += 1
                if not dry_run:
                    # Issue 2: Preserve owner-edited category, subcategory, and collections
                    if reconcile_taxonomy:
                        if existing_prod.category != cat or existing_prod.subcategory != subcat:
                            print(f"  [Taxonomy Reconciled] Product #{existing_prod.id} '{existing_prod.name}': updated taxonomy from '{existing_prod.category} › {existing_prod.subcategory}' to folder taxonomy '{cat} › {subcat}'")
                        sync_product_category_and_collections(
                            product=existing_prod,
                            category=cat,
                            subcategory=subcat,
                            explicit_collection_ids=None,
                            db=db,
                        )
                    else:
                        if existing_prod.category != cat or existing_prod.subcategory != subcat:
                            print(f"  [Owner Taxonomy Preserved] Product #{existing_prod.id} '{existing_prod.name}': preserved owner-edited taxonomy '{existing_prod.category} › {existing_prod.subcategory}' (folder is '{cat} › {subcat}')")
                        sync_product_category_and_collections(
                            product=existing_prod,
                            category=existing_prod.category,
                            subcategory=existing_prod.subcategory,
                            explicit_collection_ids=None,
                            db=db,
                        )

                    # Issue 1: Preserve owner-selected product images, custom covers, gallery order,
                    # and owner-removed associations.
                    existing_images = (
                        db.query(ProductImage)
                        .filter(ProductImage.product_id == existing_prod.id)
                        .order_by(ProductImage.sort_order.asc())
                        .all()
                    )

                    for f_info in d["files"]:
                        full_path = f_info["full_path"]
                        rel_path = f_info["relative_path"]
                        filename = f_info["filename"]
                        res_type = f_info["resource_type"]
                        file_hash = compute_sha256(full_path)

                        current_asset = asset_map.get(full_path)
                        if not current_asset:
                            current_asset = db.query(MediaAsset).filter(
                                MediaAsset.content_hash == file_hash,
                                MediaAsset.resource_type == res_type,
                                MediaAsset.cloud_name == CLOUDINARY_CLOUD_NAME,
                                MediaAsset.folder == target_folder,
                            ).first()

                        if not current_asset:
                            # Keep working gallery intact if new asset is not registered
                            continue

                        # Check if this exact asset is already linked to the product
                        already_linked = any(img.media_asset_id == current_asset.id for img in existing_images)
                        if already_linked:
                            # Already attached: preserve owner's existing sort_order and gallery position
                            continue

                        # Determine if this file genuinely changed compared to previous asset for this source path
                        old_source_asset = db.query(MediaAsset).filter(
                            MediaAsset.relative_source_path == rel_path,
                            MediaAsset.folder == target_folder,
                            MediaAsset.id != current_asset.id,
                        ).order_by(MediaAsset.id.desc()).first()

                        is_changed_source = bool(old_source_asset and old_source_asset.content_hash != file_hash)

                        if not is_changed_source:
                            # UNCHANGED SOURCE:
                            # If not already attached to this product, the owner deliberately
                            # replaced the cover or removed this photo from the gallery.
                            # NEVER restore or overwrite owner choices on unchanged source reruns!
                            print(f"  [Owner Gallery Preserved] Product #{existing_prod.id} '{design_name}': unchanged source asset #{current_asset.id} ({filename}) is not in gallery (deliberately removed or replaced by owner); skipping gallery modification.")
                            continue

                        # GENUINELY CHANGED SOURCE:
                        # Find the corresponding ProductImage STILL managed by this import source.
                        # Provenance match: linked MediaAsset must match target_folder and relative_source_path.
                        # NEVER match by sort_order, filename alone, or resource_type!
                        matched_img = None
                        for img in existing_images:
                            if not img.media_asset_id:
                                continue
                            linked_asset = db.query(MediaAsset).filter(MediaAsset.id == img.media_asset_id).first()
                            if not linked_asset:
                                continue
                            if (
                                normalize_path(linked_asset.folder) == normalize_path(target_folder)
                                and normalize_path(linked_asset.relative_source_path) == normalize_path(rel_path)
                            ):
                                matched_img = img
                                break

                        if matched_img:
                            # Replace old asset association transactionally while strictly preserving sort_order
                            old_asset_id = matched_img.media_asset_id
                            matched_img.media_asset_id = current_asset.id
                            matched_img.url = current_asset.secure_url or current_asset.url
                            matched_img.public_id = current_asset.public_id
                            matched_img.resource_type = current_asset.resource_type
                            matched_img.width = current_asset.width
                            matched_img.height = current_asset.height
                            matched_img.duration = current_asset.duration
                            matched_img.alt_text = f"{design_name} - {current_asset.display_name or current_asset.filename}"
                            summary["images_replaced"] += 1
                            print(f"  [Gallery Replaced] Product #{existing_prod.id} '{design_name}' slot {matched_img.sort_order}: asset #{old_asset_id} -> #{current_asset.id} (updated changed photo)")
                        else:
                            # The owner had previously replaced or removed this slot with an owner-chosen asset.
                            # Do NOT replace an unrelated image or inject into slot 1.
                            print(f"  [Owner Gallery Preserved] Product #{existing_prod.id} '{design_name}': source photo '{filename}' changed, but its previous asset association is no longer in gallery (replaced or removed by owner); preserving owner gallery without modification.")

                continue

            # Allocate sequential subcategory index for SKU
            key = (cat, subcat)
            if key not in subcat_counters:
                subcat_counters[key] = get_next_subcat_num(db, cat, subcat)
            num_code = f"{subcat_counters[key]:02d}"
            subcat_counters[key] += 1

            cat_code = CAT_CODE_MAP.get(cat, "RL")
            subcat_code = SUBCAT_CODE_MAP.get(subcat, "GEN")

            # Check for slug conflict
            candidate_slug = base_slug
            slug_conflict = db.query(Product).filter(Product.slug == candidate_slug).first()
            if slug_conflict:
                candidate_slug = f"{base_slug}-{num_code}"
                print(f"  [Slug Collision Resolved] {candidate_slug}")

            if dry_run:
                summary["products_created"] += 1
                summary["variants_created"] += len(DEFAULT_SIZES)
                summary["images_attached"] += len(d["files"])
                summary["created_products"].append({
                    "name": design_name,
                    "slug": candidate_slug,
                    "category": cat,
                    "subcategory": subcat,
                    "status": "DRAFT",
                    "files_count": len(d["files"]),
                    "sku_prefix": f"RL-{cat_code}-{subcat_code}-{num_code}",
                })
                print(f"  [Dry-Run Create Product] '{design_name}' ({cat} › {subcat}) | 5 variants | {len(d['files'])} assets")
                continue

            # Live Product Creation: Default to DRAFT and is_active=False
            new_prod = Product(
                name=design_name,
                slug=candidate_slug,
                description=None,  # Leave unverified specifications blank (None)
                fabric=None,
                care=None,
                fit=None,
                category=cat,
                subcategory=subcat,
                source_folder=target_folder,
                status="DRAFT",    # New products default to DRAFT
                is_active=False,
                is_bestseller=False,
            )
            # Sync canonical collection membership
            sync_product_category_and_collections(
                product=new_prod,
                category=cat,
                subcategory=subcat,
                explicit_collection_ids=None,
                db=db,
            )
            db.add(new_prod)
            db.flush()
            summary["products_created"] += 1

            # Attach Images & Videos
            # Cover image MUST be sort_order=1, video MUST be sort_order=2
            sort_order = 1
            for f_info in d["files"]:
                full_path = f_info["full_path"]
                asset = asset_map.get(full_path)
                if not asset:
                    content_hash = compute_sha256(full_path)
                    asset = db.query(MediaAsset).filter(
                        MediaAsset.content_hash == content_hash,
                        MediaAsset.resource_type == f_info["resource_type"],
                        MediaAsset.cloud_name == CLOUDINARY_CLOUD_NAME,
                        MediaAsset.folder == target_folder,
                    ).first()

                if asset:
                    p_img = ProductImage(
                        product_id=new_prod.id,
                        media_asset_id=asset.id,
                        url=asset.secure_url or asset.url,
                        public_id=asset.public_id,
                        resource_type=asset.resource_type,
                        width=asset.width,
                        height=asset.height,
                        duration=asset.duration,
                        sort_order=sort_order,
                        alt_text=f"{design_name} - {asset.display_name or asset.filename}",
                    )
                    db.add(p_img)
                    sort_order += 1
                    summary["images_attached"] += 1

            # Create 5 Variants with Temporary Setup Values
            for size in DEFAULT_SIZES:
                sku = f"RL-{cat_code}-{subcat_code}-{num_code}-{size}"
                variant = ProductVariant(
                    product_id=new_prod.id,
                    size=size,
                    colour=None,
                    sku=sku,
                    selling_price=DEFAULT_PRICE,
                    mrp=DEFAULT_MRP,
                    stock=DEFAULT_STOCK,
                )
                db.add(variant)
                db.flush()
                summary["variants_created"] += 1

                # Record Initial Stock Audit Log
                adj = StockAdjustment(
                    variant_id=variant.id,
                    previous_stock=0,
                    new_stock=DEFAULT_STOCK,
                    change_amount=DEFAULT_STOCK,
                    reason="INITIAL_SETUP",
                    note="Catalogue setup initial temporary stock",
                    actor_email="system",
                )
                db.add(adj)
                summary["stock_adjustments_recorded"] += 1

            db.flush()
            summary["created_products"].append({
                "id": new_prod.id,
                "name": design_name,
                "slug": candidate_slug,
                "category": cat,
                "subcategory": subcat,
                "status": "DRAFT",
                "files_count": len(d["files"]),
                "sku_prefix": f"RL-{cat_code}-{subcat_code}-{num_code}",
            })
            print(f"  + Created Product #{new_prod.id} '{design_name}' ({cat} › {subcat}) [DRAFT] | 5 variants | {len(d['files'])} assets")

        if not dry_run:
            db.commit()
            print("\n[DB] Successfully committed all database transactions.")

            # Two-Phase Manifest Commit Safety:
            # Only record 'registered' and 'db_id' in manifest AFTER DB commit succeeds
            for p_rel, p_asset in pending_manifest_registrations:
                if p_rel in manifest.get("files", {}):
                    manifest["files"][p_rel]["status"] = "registered"
                    manifest["files"][p_rel]["db_id"] = p_asset.id
            if pending_manifest_registrations:
                save_manifest(manifest, manifest_path)
                print(f"[Manifest] Updated {len(pending_manifest_registrations)} entries to registered status.")

    except Exception as e:
        if not dry_run:
            db.rollback()
        print(f"\n[ERROR] Transaction aborted: {e}")
        import traceback
        traceback.print_exc()
        raise e
    finally:
        if close_db:
            db.close()

    print("\n" + "=" * 70)
    print(">>> IMPORT SUMMARY <<<")
    print("=" * 70)
    print(f"Designs Discovered:        {summary['designs_discovered']}")
    print(f"Media Files Discovered:    {summary['media_files_discovered']}")
    print(f"Media Folders Created:     {summary['media_folders_created']}")
    print(f"Cloudinary Folders Made:   {summary['cloudinary_folders_created']}")
    print(f"Media Assets Uploaded:     {summary['media_assets_uploaded']}")
    print(f"Media Assets Reused:       {summary['media_assets_reused']}")
    print(f"Media Assets Replaced:     {summary['media_assets_replaced']}")
    print(f"Products Created:          {summary['products_created']}")
    print(f"Products Reused:           {summary['products_reused']}")
    print(f"Variants Created:          {summary['variants_created']}")
    print(f"Stock Adjustments Logged:  {summary['stock_adjustments_recorded']}")
    print(f"Images/Videos Attached:    {summary['images_attached']}")
    print(f"Images Replaced:           {summary['images_replaced']}")
    print("=" * 70)
    return summary


def main():
    parser = argparse.ArgumentParser(description="Import Royal Libas New Arrivals")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Simulate import without Cloudinary upload or DB writes")
    parser.add_argument("--confirm", action="store_true", default=False, help="Confirm live execution")
    parser.add_argument("--mock-upload", action="store_true", default=False, help="Mock Cloudinary uploads for local testing")
    parser.add_argument("--reconcile-taxonomy", action="store_true", default=False, help="Opt-in to overwrite owner-edited category and subcategory on existing products with folder taxonomy")
    parser.add_argument("--custom-domain", default=CLOUDINARY_CUSTOM_DOMAIN, help="Custom delivery domain for Cloudinary")
    parser.add_argument("--source-dir", default=DEFAULT_SOURCE_DIR, help="Source folder path")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST_PATH, help="Manifest file path")

    args = parser.parse_args()

    if not args.dry_run and not args.confirm:
        print("Please provide either --dry-run or --confirm")
        sys.exit(1)

    import_new_arrivals(
        dry_run=args.dry_run,
        confirm=args.confirm,
        mock_upload=args.mock_upload,
        source_dir=args.source_dir,
        manifest_path=args.manifest,
        reconcile_taxonomy=args.reconcile_taxonomy,
        custom_domain=args.custom_domain,
    )


if __name__ == "__main__":
    main()
