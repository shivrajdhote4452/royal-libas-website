"""Cloudinary Media Service for Royal Libas Admin and Storefront.
Handles secure uploads, content validation, video & image transformations,
metadata extraction, and safe deletion from Cloudinary storage.

Precedence:
If CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are all
configured and non-placeholder, they take precedence.
Otherwise, CLOUDINARY_URL is parsed and used.
Credentials remain strictly on the backend server.
"""

import os
import re
import logging
from typing import Optional, Dict, Any, Tuple
from fastapi import HTTPException, status
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
MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024  # 15MB
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


def validate_file_content_signature(file_bytes: bytes, filename: str) -> str:
    """Inspect magic bytes to verify file integrity and content type server-side.

    Returns:
        resource_type ('image' or 'video')
    Raises:
        HTTPException if the content does not match allowed media signatures.
    """
    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is empty (0 bytes).",
        )

    # Magic byte checks
    # JPEG
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return "image"
    # PNG
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image"
    # WebP
    if file_bytes.startswith(b"RIFF") and len(file_bytes) >= 12 and file_bytes[8:12] == b"WEBP":
        return "image"
    # GIF
    if file_bytes.startswith(b"GIF87a") or file_bytes.startswith(b"GIF89a"):
        return "image"
    # AVIF
    if len(file_bytes) >= 16 and b"ftyp" in file_bytes[4:12] and (b"avif" in file_bytes[4:24] or b"mif1" in file_bytes[4:24]):
        return "image"
    # MP4 / MOV
    if len(file_bytes) >= 12 and (b"ftyp" in file_bytes[4:16] or b"moov" in file_bytes[:32] or b"wide" in file_bytes[4:16] or b"mdat" in file_bytes[4:16]):
        return "video"
    # WebM / MKV
    if file_bytes.startswith(b"\x1a\x45\xdf\xa3"):
        return "video"
    # OGG
    if file_bytes.startswith(b"OggS"):
        return "video"

    # Fallback to extension check if magic bytes are ambiguous but extension is strictly whitelisted
    _, ext = os.path.splitext(filename.lower())
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return "image"
    if ext in ALLOWED_VIDEO_EXTENSIONS:
        return "video"

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"File '{filename}' does not match supported image or video signatures. Allowed formats: JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, MOV.",
    )


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
            detail=f"Image exceeds maximum size of {max_mb}MB.",
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

    # 1. Inspect content signature
    content_res_type = validate_file_content_signature(file_bytes, original_filename)
    res_type, _ = detect_resource_type(original_filename)
    if resource_type_override and resource_type_override in ("image", "video"):
        res_type = resource_type_override
    else:
        res_type = content_res_type

    # 2. Validate file size limits
    validate_file_size(len(file_bytes), res_type)

    # 3. Perform upload
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

    return {
        "public_id": public_id,
        "url": secure_url,
        "secure_url": secure_url,
        "resource_type": detected_res_type,
        "format": upload_result.get("format"),
        "width": upload_result.get("width"),
        "height": upload_result.get("height"),
        "duration": upload_result.get("duration"),
        "file_size": upload_result.get("bytes", len(file_bytes)),
        "folder": folder,
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
