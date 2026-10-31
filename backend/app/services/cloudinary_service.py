"""Cloudinary Media Service for Royal Libas Admin and Storefront.
Handles secure uploads, content validation, video & image transformations,
metadata extraction, bounded memory reads, and safe deletion from Cloudinary storage.

Precedence:
If CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are all
configured and non-placeholder, they take precedence.
Otherwise, CLOUDINARY_URL is parsed and used.
Credentials remain strictly on the backend server.
"""

import os
import re
import logging
from typing import Optional, Dict, Any, Tuple, List
from fastapi import HTTPException, status, UploadFile
import cloudinary
import cloudinary.uploader
import cloudinary.api
from app.config import (
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_URL,
    is_cloudinary_configured,
)

logger = logging.getLogger("royal_libas.cloudinary")


def init_cloudinary():
    """Initialize Cloudinary SDK with validated credentials following documented precedence."""
    if CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and CLOUDINARY_CLOUD_NAME:
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True,
        )
    elif CLOUDINARY_URL:
        os.environ["CLOUDINARY_URL"] = CLOUDINARY_URL
        cloudinary.reset_config()
        cloudinary.config(secure=True)


init_cloudinary()

# Allowed media formats & constraints
# Aligned with Cloudinary Free plan limit (10 MB per image) and video limit (60 MB)
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB Free plan limit
MAX_VIDEO_SIZE_BYTES = 60 * 1024 * 1024  # 60MB
MAX_BATCH_FILES = 20

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
}

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".ogg", ".mkv"}
ALLOWED_VIDEO_MIME_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/ogg",
    "video/x-matroska",
}


async def read_bounded_file(file: UploadFile, max_bytes: int = MAX_VIDEO_SIZE_BYTES) -> bytes:
    """Read an UploadFile up to max_bytes without buffering unbounded streams into memory.
    
    Prevents denial-of-service from massive file streaming.
    """
    chunk_size = 512 * 1024  # 512KB chunks
    buffer = bytearray()
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{file.filename}' exceeds the maximum allowed file size of {max_bytes // (1024 * 1024)}MB.",
            )
    return bytes(buffer)


def inspect_media_content_type(file_bytes: bytes, filename: str) -> Tuple[str, str, str]:
    """Inspect binary magic bytes to verify file integrity and content type server-side.
    
    Does NOT fall back to file extension; strictly inspects byte signatures.
    
    Returns:
        (resource_type, detected_format, mime_type) e.g. ('image', 'jpg', 'image/jpeg')
    Raises:
        HTTPException if the content does not match allowed media signatures.
    """
    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is empty (0 bytes).",
        )

    # Magic byte checks
    # JPEG (\xff\xd8\xff)
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return "image", "jpg", "image/jpeg"

    # PNG (\x89PNG\r\n\x1a\n)
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", "png", "image/png"

    # WebP (RIFF....WEBP)
    if file_bytes.startswith(b"RIFF") and len(file_bytes) >= 12 and file_bytes[8:12] == b"WEBP":
        return "image", "webp", "image/webp"

    # GIF (GIF87a or GIF89a)
    if file_bytes.startswith(b"GIF87a") or file_bytes.startswith(b"GIF89a"):
        return "image", "gif", "image/gif"

    # AVIF (ftypavif / ftypmif1)
    if len(file_bytes) >= 16 and b"ftyp" in file_bytes[4:12] and (b"avif" in file_bytes[4:24] or b"mif1" in file_bytes[4:24]):
        return "image", "avif", "image/avif"

    # MP4 / MOV (ftyp, moov, wide, mdat)
    if len(file_bytes) >= 12 and (
        b"ftyp" in file_bytes[4:16]
        or b"moov" in file_bytes[:32]
        or b"wide" in file_bytes[4:16]
        or b"mdat" in file_bytes[4:16]
    ):
        if b"qt  " in file_bytes[4:16] or filename.lower().endswith(".mov"):
            return "video", "mov", "video/quicktime"
        return "video", "mp4", "video/mp4"

    # WebM / MKV (\x1a\x45\xdf\xa3)
    if file_bytes.startswith(b"\x1a\x45\xdf\xa3"):
        if filename.lower().endswith(".mkv"):
            return "video", "mkv", "video/x-matroska"
        return "video", "webm", "video/webm"

    # OGG (OggS)
    if file_bytes.startswith(b"OggS"):
        return "video", "ogg", "video/ogg"

    # Strict rejection: no unrecognized signatures allowed, even if filename claims an allowed extension!
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"File '{filename}' does not match supported image or video signatures. Allowed formats: JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, MOV.",
    )


def validate_file_content_signature(file_bytes: bytes, filename: str) -> str:
    """Convenience wrapper for backward compatibility. Returns 'image' or 'video'."""
    res_type, _, _ = inspect_media_content_type(file_bytes, filename)
    return res_type


def validate_media_file(file_bytes: bytes, filename: str) -> Tuple[str, str, str]:
    """Strictly validate file signature, extension consistency, and size limits.

    Returns:
        (resource_type, detected_format, mime_type)
    """
    res_type, detected_fmt, mime_type = inspect_media_content_type(file_bytes, filename)
    _, ext = os.path.splitext(filename.lower())

    # Verify extension consistency
    if ext:
        if res_type == "image" and ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{filename}' contains image content but has incompatible extension '{ext}'.",
            )
        elif res_type == "video" and ext not in ALLOWED_VIDEO_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{filename}' contains video content but has incompatible extension '{ext}'.",
            )

    # Validate size limits against Cloudinary Free plan thresholds
    validate_file_size(len(file_bytes), res_type)

    return res_type, detected_fmt, mime_type


def detect_resource_type(filename: str, mime_type: Optional[str] = None) -> Tuple[str, str]:
    """Detect whether a file is an image or video by extension and MIME type.

    Returns:
        (resource_type, normalized_extension) e.g. ('image', '.jpg') or ('video', '.mp4')
    Raises:
        HTTPException if the format is unsupported.
    """
    _, ext = os.path.splitext(filename.lower())
    normalized_mime = (mime_type or "").lower().strip()

    if ext in ALLOWED_IMAGE_EXTENSIONS or normalized_mime in ALLOWED_IMAGE_MIME_TYPES:
        return "image", ext or ".jpg"
    elif ext in ALLOWED_VIDEO_EXTENSIONS or normalized_mime in ALLOWED_VIDEO_MIME_TYPES:
        return "video", ext or ".mp4"
    else:
        allowed_all = ", ".join(sorted(ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext or normalized_mime}'. Allowed formats: {allowed_all}",
        )


def validate_file_size(file_size: int, resource_type: str) -> None:
    """Validate that file size does not exceed specified thresholds."""
    if resource_type == "image" and file_size > MAX_IMAGE_SIZE_BYTES:
        max_mb = MAX_IMAGE_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image exceeds maximum size of {max_mb}MB for Cloudinary Free plan.",
        )
    if resource_type == "video" and file_size > MAX_VIDEO_SIZE_BYTES:
        max_mb = MAX_VIDEO_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Video exceeds maximum size of {max_mb}MB.",
        )


def upload_to_cloudinary(
    file_bytes: bytes,
    original_filename: str,
    folder: str = "royal_libas/products",
    resource_type_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Upload a file buffer directly to Cloudinary with content verification and return metadata."""
    init_cloudinary()
    if not is_cloudinary_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary media storage is not configured on this server.",
        )

    # 1. Strictly inspect content signature and extension consistency
    res_type, detected_fmt, mime_type = validate_media_file(file_bytes, original_filename)
    if resource_type_override and resource_type_override in ("image", "video"):
        res_type = resource_type_override

    # 2. Perform upload
    try:
        upload_result = cloudinary.uploader.upload(
            file_bytes,
            folder=folder,
            resource_type=res_type,
            overwrite=True,
            unique_filename=True,
            use_filename=False,
        )
    except Exception as e:
        logger.error(f"Cloudinary upload failed for {original_filename}: {e}", exc_info=True)
        # Never leak secrets or raw internal SDK traces in the response
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cloudinary upload failed: {str(e)}",
        )

    public_id = upload_result.get("public_id")
    secure_url = upload_result.get("secure_url") or upload_result.get("url")
    detected_res_type = upload_result.get("resource_type", res_type)
    asset_id = upload_result.get("asset_id")
    delivery_type = upload_result.get("type", "upload")

    if not public_id or not secure_url:
        logger.error(f"Unconfirmed Cloudinary upload for {original_filename}: missing public_id or delivery URL in response: {upload_result}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unconfirmed Cloudinary upload for '{original_filename}': missing public_id or delivery URL in response.",
        )

    return {
        "public_id": public_id,
        "asset_id": asset_id,
        "cloud_name": CLOUDINARY_CLOUD_NAME,
        "delivery_type": delivery_type,
        "url": secure_url,
        "secure_url": secure_url,
        "resource_type": detected_res_type,
        "format": upload_result.get("format") or detected_fmt,
        "width": upload_result.get("width"),
        "height": upload_result.get("height"),
        "duration": upload_result.get("duration"),
        "file_size": upload_result.get("bytes", len(file_bytes)),
        "folder": upload_result.get("asset_folder", folder),
    }


def delete_from_cloudinary(public_id: str, resource_type: str = "image") -> Dict[str, Any]:
    """Safely destroy an asset on Cloudinary by its public_id.

    Returns:
        Dict with keys:
          - success: bool
          - result: str ('ok', 'not found', 'not_configured', 'error')
          - already_missing: bool
          - error: Optional[str]
    """
    init_cloudinary()
    if not is_cloudinary_configured():
        logger.warning("Cloudinary not configured; remote asset deletion cannot proceed.")
        return {
            "success": False,
            "result": "not_configured",
            "already_missing": False,
            "error": "Cloudinary is not configured on this server.",
        }

    clean_res_type = "video" if resource_type == "video" else "image"
    try:
        res = cloudinary.uploader.destroy(
            public_id,
            resource_type=clean_res_type,
            invalidate=True,
        )
        res_status = res.get("result", "")
        if res_status == "ok":
            return {"success": True, "result": "ok", "already_missing": False, "error": None}
        elif res_status == "not found":
            # Cloudinary reports asset is already missing remotely.
            # Documented behavior: Considered successfully absent from remote storage.
            logger.info(f"Asset '{public_id}' is already missing on Cloudinary (result='not found').")
            return {"success": True, "result": "not found", "already_missing": True, "error": None}
        else:
            logger.error(f"Cloudinary destroy returned unexpected status for {public_id}: {res}")
            return {
                "success": False,
                "result": res_status or "error",
                "already_missing": False,
                "error": f"Remote deletion rejected by Cloudinary ({res_status}).",
            }
    except Exception as e:
        logger.error(f"Failed to delete Cloudinary asset {public_id}: {e}", exc_info=True)
        return {
            "success": False,
            "result": "error",
            "already_missing": False,
            "error": f"Cloudinary deletion failed: {str(e)}",
        }


def get_video_poster_url(video_url: str) -> str:
    """Generate a Cloudinary thumbnail/poster image URL from a Cloudinary video URL."""
    if not video_url:
        return ""
    if "cloudinary.com" in video_url and "/video/upload/" in video_url:
        poster_url = re.sub(r"\.(mp4|webm|mov|ogg|mkv)(\?.*)?$", ".jpg", video_url, flags=re.IGNORECASE)
        if "/video/upload/" in poster_url and "/so_0" not in poster_url:
            poster_url = poster_url.replace("/video/upload/", "/video/upload/so_0,f_jpg,q_auto/")
        return poster_url
    return video_url


_detected_folder_mode: Optional[str] = None


def detect_cloudinary_folder_mode(force_refresh: bool = False) -> str:
    """Detect whether Cloudinary is operating in 'dynamic' (Asset Folders) or 'fixed' folder mode.
    
    In dynamic mode, moving an asset updates its organizational asset_folder while
    preserving delivery URLs and public_id. In fixed mode, public_id incorporates
    the folder path and cannot be moved without changing delivery URLs.
    """
    global _detected_folder_mode
    if not force_refresh and _detected_folder_mode:
        return _detected_folder_mode

    # Explicit environment override (e.g. for testing fixed/unknown mode)
    env_mode = os.environ.get("CLOUDINARY_FOLDER_MODE", "").strip().lower()
    if env_mode in ("dynamic", "fixed", "unknown"):
        _detected_folder_mode = env_mode
        return env_mode

    init_cloudinary()
    if not is_cloudinary_configured():
        return "dynamic"

    try:
        # Check resources: in dynamic mode, resources carry an 'asset_folder' key
        sample = cloudinary.api.resources(max_results=1)
        res_list = sample.get("resources", [])
        if res_list:
            first_res = res_list[0]
            if "asset_folder" in first_res:
                _detected_folder_mode = "dynamic"
                return "dynamic"
            else:
                _detected_folder_mode = "fixed"
                return "fixed"
        
        # Probe root folders if no resources exist
        try:
            root_probe = cloudinary.api.root_folders()
            if "folders" in root_probe:
                _detected_folder_mode = "dynamic"
                return "dynamic"
        except Exception:
            pass

        _detected_folder_mode = "unknown"
        return "unknown"
    except Exception as e:
        err_msg = str(e).lower()
        if "asset folders are not supported" in err_msg or "fixed" in err_msg:
            _detected_folder_mode = "fixed"
            return "fixed"
        logger.warning(f"Error probing Cloudinary folder mode ({e}): reporting unknown")
        _detected_folder_mode = "unknown"
        return "unknown"


def list_cloudinary_folders(parent_folder: Optional[str] = None) -> list:
    """List root folders or immediate subfolders from Cloudinary Admin API with pagination."""
    init_cloudinary()
    if not is_cloudinary_configured():
        return []
    folders = []
    cursor = None
    try:
        while True:
            kwargs: Dict[str, Any] = {"max_results": 100}
            if cursor:
                kwargs["next_cursor"] = cursor

            if parent_folder:
                res = cloudinary.api.subfolders(parent_folder, **kwargs)
            else:
                res = cloudinary.api.root_folders(**kwargs)

            batch = res.get("folders", [])
            folders.extend(batch)
            cursor = res.get("next_cursor")
            if not cursor or not batch:
                break
        return folders
    except Exception as e:
        logger.warning(f"Failed to list Cloudinary folders (parent={parent_folder}): {e}")
        return []


def list_cloudinary_folders_recursive(parent_folder: Optional[str] = None) -> List[Dict[str, Any]]:
    """Recursively discover all folders and subfolders from Cloudinary, following cursors at each level."""
    init_cloudinary()
    if not is_cloudinary_configured():
        return []

    discovered: List[Dict[str, Any]] = []
    top_folders = list_cloudinary_folders(parent_folder)
    for tf in top_folders:
        t_path = tf.get("path")
        t_name = tf.get("name") or (t_path.split("/")[-1] if t_path else "")
        if t_path:
            discovered.append({
                "name": t_name,
                "path": t_path,
                "parent_path": parent_folder,
            })
            # Recursively fetch subfolders
            sub_folders = list_cloudinary_folders_recursive(t_path)
            discovered.extend(sub_folders)
    return discovered


def create_cloudinary_folder(folder_path: str) -> Dict[str, Any]:
    """Create a folder or subfolder in Cloudinary."""
    init_cloudinary()
    if not is_cloudinary_configured():
        return {"success": False, "error": "Cloudinary not configured"}
    try:
        res = cloudinary.api.create_folder(folder_path)
        return {"success": True, "path": res.get("path", folder_path), "name": res.get("name", "")}
    except Exception as e:
        logger.error(f"Failed to create Cloudinary folder '{folder_path}': {e}")
        return {"success": False, "error": str(e)}


def rename_cloudinary_folder(from_path: str, to_path: str) -> Dict[str, Any]:
    """Rename an asset folder using Cloudinary Admin API."""
    init_cloudinary()
    if not is_cloudinary_configured():
        return {"success": False, "error": "Cloudinary not configured"}

    mode = detect_cloudinary_folder_mode()
    if mode != "dynamic":
        return {
            "success": False,
            "error": f"Cloudinary is in {mode} folder mode. Renaming folders is restricted to prevent breaking delivery URLs.",
            "mode": mode,
        }

    try:
        res = cloudinary.api.rename_folder(from_path, to_path)
        return {"success": True, "from_path": from_path, "to_path": to_path, "result": res}
    except Exception as e:
        logger.error(f"Failed to rename Cloudinary folder '{from_path}' to '{to_path}': {e}")
        return {"success": False, "error": str(e)}


def delete_cloudinary_folder(folder_path: str) -> Dict[str, Any]:
    """Safely delete an empty folder in Cloudinary."""
    init_cloudinary()
    if not is_cloudinary_configured():
        return {"success": False, "error": "Cloudinary not configured"}
    try:
        res = cloudinary.api.delete_folder(folder_path)
        return {"success": True, "result": res}
    except Exception as e:
        err_str = str(e)
        if "404" in err_str or "can't find folder" in err_str.lower():
            return {"success": True, "already_missing": True}
        logger.error(f"Failed to delete Cloudinary folder '{folder_path}': {e}")
        return {"success": False, "error": err_str}


def move_cloudinary_asset_folder(public_id: str, new_folder: str, resource_type: str = "image") -> Dict[str, Any]:
    """Safely move an asset to a target folder using Dynamic Asset Folder API.
    
    In dynamic mode, this preserves delivery URLs and public_id while updating asset organization.
    In fixed mode, moving is restricted to prevent breaking live URLs.
    """
    init_cloudinary()
    if not is_cloudinary_configured():
        return {"success": False, "error": "Cloudinary not configured"}

    mode = detect_cloudinary_folder_mode()
    if mode != "dynamic":
        return {
            "success": False,
            "error": f"Cloudinary is in {mode} folder mode. Moving assets dynamically without changing public IDs is not supported.",
            "mode": mode,
        }

    clean_res_type = "video" if resource_type == "video" else "image"
    try:
        # Dynamic asset folder mode update; empty string moves to root
        target_folder = new_folder if new_folder else ""
        res = cloudinary.api.update(public_id, asset_folder=target_folder, resource_type=clean_res_type)
        return {
            "success": True,
            "public_id": public_id,
            "asset_folder": res.get("asset_folder", target_folder),
            "mode": "dynamic",
        }
    except Exception as e:
        logger.warning(f"Dynamic asset_folder move failed for {public_id}: {e}")
        return {"success": False, "error": str(e)}


def update_cloudinary_asset_metadata(
    public_id: str,
    display_name: Optional[str] = None,
    resource_type: str = "image",
) -> Dict[str, Any]:
    """Update asset display name in Cloudinary."""
    init_cloudinary()
    if not is_cloudinary_configured():
        return {"success": False, "error": "Cloudinary not configured"}
    clean_res_type = "video" if resource_type == "video" else "image"
    params = {}
    if display_name is not None:
        params["display_name"] = display_name
    if not params:
        return {"success": True}
    try:
        res = cloudinary.api.update(public_id, resource_type=clean_res_type, **params)
        return {"success": True, "display_name": res.get("display_name")}
    except Exception as e:
        logger.warning(f"Failed to update metadata on Cloudinary for {public_id}: {e}")
        return {"success": False, "error": str(e)}


def fetch_cloudinary_resources(
    resource_type: str = "image",
    max_results: int = 100,
    next_cursor: Optional[str] = None,
    max_retries: int = 3,
) -> Dict[str, Any]:
    """Fetch paginated resources from Cloudinary Admin API with rate limit and retry handling."""
    init_cloudinary()
    if not is_cloudinary_configured():
        return {"resources": [], "next_cursor": None}
    clean_res_type = "video" if resource_type == "video" else "image"

    kwargs = {"resource_type": clean_res_type, "max_results": max_results}
    if next_cursor:
        kwargs["next_cursor"] = next_cursor

    for attempt in range(max_retries):
        try:
            return cloudinary.api.resources(**kwargs)
        except Exception as e:
            err_msg = str(e).lower()
            is_rate_limit = "429" in err_msg or "rate limit" in err_msg
            if is_rate_limit and attempt < max_retries - 1:
                sleep_seconds = 2 ** attempt
                logger.warning(f"Cloudinary rate limited for {resource_type}. Retrying in {sleep_seconds}s...")
                time.sleep(sleep_seconds)
                continue
            elif attempt < max_retries - 1 and ("timeout" in err_msg or "connection" in err_msg):
                time.sleep(1)
                continue
            else:
                logger.error(f"Failed to fetch Cloudinary resources ({resource_type}) after {attempt + 1} tries: {e}")
                return {
                    "resources": [],
                    "next_cursor": None,
                    "error": str(e),
                    "rate_limited": is_rate_limit,
                }
    return {"resources": [], "next_cursor": None}


def get_cloudinary_status() -> Dict[str, Any]:
    """Return non-sensitive Cloudinary configuration and connection status."""
    configured = is_cloudinary_configured()
    cloud_name = CLOUDINARY_CLOUD_NAME if configured else None
    folder_mode = detect_cloudinary_folder_mode() if configured else "dynamic"
    return {
        "configured": configured,
        "cloud_name": cloud_name,
        "folder_mode": folder_mode,
    }

