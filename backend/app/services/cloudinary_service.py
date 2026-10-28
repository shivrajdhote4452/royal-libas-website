"""Cloudinary Media Service for Royal Libas Admin and Storefront.
Handles secure uploads, video & image transformations, metadata extraction,
and deletion from Cloudinary storage.
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
    """Initialize Cloudinary SDK with validated credentials."""
    if CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and CLOUDINARY_CLOUD_NAME:
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True,
        )
    elif CLOUDINARY_URL:
        # Use config_from_url or set environment variable
        os.environ["CLOUDINARY_URL"] = CLOUDINARY_URL
        cloudinary.reset_config()
        cloudinary.config(secure=True)


init_cloudinary()

# Allowed media formats & constraints
MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024  # 15MB
MAX_VIDEO_SIZE_BYTES = 60 * 1024 * 1024  # 60MB

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


def detect_resource_type(filename: str, mime_type: Optional[str] = None) -> Tuple[str, str]:
    """Detect whether a file is an image or video and validate its extension.

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
    """Upload a file buffer directly to Cloudinary and return normalized metadata."""
    init_cloudinary()
    if not is_cloudinary_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary is not configured on this server. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
        )

    res_type, _ = detect_resource_type(original_filename)
    if resource_type_override and resource_type_override in ("image", "video"):
        res_type = resource_type_override

    validate_file_size(len(file_bytes), res_type)

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
    """Safely destroy an asset on Cloudinary by its public_id."""
    init_cloudinary()
    if not is_cloudinary_configured():
        logger.warning("Cloudinary not configured; skipping remote asset deletion.")
        return {"result": "skipped_not_configured"}

    clean_res_type = "video" if resource_type == "video" else "image"
    try:
        res = cloudinary.uploader.destroy(
            public_id,
            resource_type=clean_res_type,
            invalidate=True,
        )
        return res
    except Exception as e:
        logger.error(f"Failed to delete Cloudinary asset {public_id}: {e}", exc_info=True)
        return {"result": "error", "error": str(e)}


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
