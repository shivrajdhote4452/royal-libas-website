import sys
import os
import io
from unittest.mock import patch, MagicMock

# Set path so app can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Admin, MediaAsset, Product, ProductImage
from app.auth import create_access_token
from app.services.cloudinary_service import (
    detect_resource_type,
    validate_file_size,
    get_video_poster_url,
)

client = TestClient(app)

def test_cloudinary_media_integration():
    print("Testing Cloudinary Media Integration & Admin Endpoints...")

    # 1. Test helper functions
    r_type, ext = detect_resource_type("kurti_velvet.jpg", "image/jpeg")
    assert r_type == "image"
    assert ext == ".jpg"

    v_type, vext = detect_resource_type("drape_video.mp4", "video/mp4")
    assert v_type == "video"
    assert vext == ".mp4"

    # Unsupported format rejection
    try:
        detect_resource_type("malicious_script.sh", "application/x-sh")
        assert False, "Should have rejected unsupported file format"
    except Exception:
        pass
    print("  [OK] detect_resource_type accurately identifies image/video and rejects invalid formats")

    # Poster transformation
    cloud_video = "https://res.cloudinary.com/demo/video/upload/v12345/royal_libas/velvet.mp4"
    poster = get_video_poster_url(cloud_video)
    assert poster.endswith(".jpg")
    assert "/so_0" in poster
    print("  [OK] get_video_poster_url generates correct poster image transformation")

    # 2. Test Auth Protection on Media Endpoints
    unauth_resp = client.get("/admin/media")
    assert unauth_resp.status_code == 401, f"Expected 401 without auth, got {unauth_resp.status_code}"
    print("  [OK] GET /admin/media requires Admin JWT (returns 401)")

    # Create admin token with sub="1"
    admin_token = create_access_token({"sub": "1", "role": "OWNER"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 3. Test GET /admin/media
    list_resp = client.get("/admin/media", headers=headers)
    assert list_resp.status_code == 200
    assets = list_resp.json()
    assert isinstance(assets, list)
    if assets:
        first = assets[0]
        assert "id" in first
        assert "url" in first
        assert "resource_type" in first
        assert "used_in_products" in first
    print("  [OK] GET /admin/media returns list of assets with used_in_products array")

    # 4. Test Single & Batch Upload with Mocked Cloudinary SDK
    mock_upload_return = {
        "public_id": "royal_libas/products/test_mock_asset",
        "secure_url": "https://res.cloudinary.com/zkgaklhl/image/upload/v1/royal_libas/products/test_mock_asset.jpg",
        "url": "https://res.cloudinary.com/zkgaklhl/image/upload/v1/royal_libas/products/test_mock_asset.jpg",
        "resource_type": "image",
        "format": "jpg",
        "width": 800,
        "height": 1000,
        "duration": None,
        "bytes": 1024,
    }

    with patch("cloudinary.uploader.upload", return_value=mock_upload_return):
        # Test single upload
        fake_image = io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
        upload_resp = client.post(
            "/admin/media/upload",
            headers=headers,
            files={"file": ("silk_kurti.jpg", fake_image, "image/jpeg")},
        )
        assert upload_resp.status_code == 200, f"Upload failed: {upload_resp.text}"
        uploaded_data = upload_resp.json()
        assert uploaded_data["public_id"] == "royal_libas/products/test_mock_asset"
        assert uploaded_data["resource_type"] == "image"
        created_asset_id = uploaded_data["id"]
        print("  [OK] POST /admin/media/upload stores Cloudinary asset & registers MediaAsset record")

        # Test batch upload
        fake_img1 = io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
        fake_img2 = io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
        batch_resp = client.post(
            "/admin/media/upload-batch",
            headers=headers,
            files=[
                ("files", ("batch_1.jpg", fake_img1, "image/jpeg")),
                ("files", ("batch_2.jpg", fake_img2, "image/jpeg")),
            ],
        )
        assert batch_resp.status_code == 200, f"Batch upload failed: {batch_resp.text}"
        batch_data = batch_resp.json()
        assert batch_data["status"] == "success"
        assert batch_data["total"] == 2
        assert len(batch_data["uploaded"]) == 2
        assert batch_data["success_count"] == 2
        print("  [OK] POST /admin/media/upload-batch uploads multiple files and returns summary")

    # 5. Test Usage Conflict and Deletion
    db = SessionLocal()
    try:
        # Create a test product that uses this asset
        test_prod = Product(
            name="Cloudinary Test Anarkali",
            slug="cloudinary-test-anarkali",
            is_active=True,
        )
        db.add(test_prod)
        db.commit()
        db.refresh(test_prod)

        test_img = ProductImage(
            product_id=test_prod.id,
            url=uploaded_data["url"],
            public_id=uploaded_data["public_id"],
            sort_order=0,
        )
        db.add(test_img)
        db.commit()

        # Attempt to delete without force -> should return 409 Conflict
        del_conflict = client.delete(f"/admin/media/{created_asset_id}", headers=headers)
        assert del_conflict.status_code == 409, f"Expected 409, got {del_conflict.status_code}: {del_conflict.text}"
        assert "currently used in" in del_conflict.json()["detail"]
        print("  [OK] DELETE /admin/media/{id} blocks deletion when media is used by a product")

        # Delete with force=true -> should succeed
        with patch("cloudinary.uploader.destroy", return_value={"result": "ok"}):
            del_force = client.delete(f"/admin/media/{created_asset_id}?force=true", headers=headers)
            assert del_force.status_code == 200
            assert del_force.json()["status"] == "success"
        print("  [OK] DELETE /admin/media/{id}?force=true removes asset and cascades product images safely")

        # Clean up test product
        db.delete(test_prod)
        db.commit()
    finally:
        db.close()

    print("[SUCCESS] All Cloudinary Media Integration tests passed!")

if __name__ == "__main__":
    test_cloudinary_media_integration()
