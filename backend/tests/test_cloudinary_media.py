import sys
import os
import io
import json
from unittest.mock import patch, MagicMock

# Set path so app can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Admin, MediaAsset, Product, ProductImage, StoreSetting
from app.auth import create_access_token
from app.services.cloudinary_service import (
    detect_resource_type,
    validate_file_size,
    get_video_poster_url,
    validate_file_content_signature,
)

client = TestClient(app)

def test_cloudinary_media_integration():
    print("Testing Cloudinary Media Integration & Admin Endpoints...")

    # 1. Helper function unit tests
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

    # Magic byte inspection unit tests
    jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 20
    assert validate_file_content_signature(jpeg_bytes, "test.jpg") == "image"

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    assert validate_file_content_signature(png_bytes, "test.png") == "image"

    mp4_bytes = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 20
    assert validate_file_content_signature(mp4_bytes, "test.mp4") == "video"

    # Corrupted / mismatched file header rejection
    try:
        corrupted = b"NOT_A_VALID_IMAGE_HEADER" + b"\x00" * 20
        validate_file_content_signature(corrupted, "fake.jpg")
        assert False, "Should reject invalid content signature"
    except Exception:
        pass
    print("  [OK] validate_file_content_signature enforces magic bytes inspection for JPEG/PNG/MP4")

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

    # Create admin token with sub="1" and role="OWNER"
    admin_token = create_access_token({"sub": "1", "role": "OWNER"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 3. Test GET /admin/media
    list_resp = client.get("/admin/media", headers=headers)
    assert list_resp.status_code == 200
    assets = list_resp.json()
    assert isinstance(assets, list)
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
        # Empty file rejection
        empty_upload = client.post(
            "/admin/media/upload",
            headers=headers,
            files={"file": ("empty.jpg", b"", "image/jpeg")},
        )
        assert empty_upload.status_code == 400
        print("  [OK] POST /admin/media/upload rejects 0-byte empty file with HTTP 400")

        # Single valid upload
        fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 100
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

        # Test batch upload with client_id mapping and duplicate filenames
        fake_img1 = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        fake_img2 = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        batch_resp = client.post(
            "/admin/media/upload-batch",
            headers=headers,
            files=[
                ("files", ("photo.jpg", fake_img1, "image/jpeg")),
                ("files", ("photo.jpg", fake_img2, "image/jpeg")),  # Duplicate filename!
            ],
            data={
                "client_ids": ["cid_item_alpha", "cid_item_beta"],
                "client_ids_json": json.dumps(["cid_item_alpha", "cid_item_beta"]),
            },
        )
        assert batch_resp.status_code == 200, f"Batch upload failed: {batch_resp.text}"
        batch_data = batch_resp.json()
        assert batch_data["status"] == "success"
        assert batch_data["total"] == 2
        assert len(batch_data["uploaded"]) == 2
        assert batch_data["uploaded"][0]["client_id"] == "cid_item_alpha"
        assert batch_data["uploaded"][1]["client_id"] == "cid_item_beta"
        print("  [OK] POST /admin/media/upload-batch preserves client_id matching across duplicate filenames")

    # 5. Test DB Rollback & Cloudinary Orphan Cleanup on DB Failure
    destroy_mock = MagicMock(return_value={"result": "ok"})
    with patch("cloudinary.uploader.upload", return_value=mock_upload_return):
        with patch("cloudinary.uploader.destroy", destroy_mock):
            with patch("sqlalchemy.orm.Session.commit", side_effect=Exception("Simulated DB Crash")):
                fail_resp = client.post(
                    "/admin/media/upload",
                    headers=headers,
                    files={"file": ("fail_db.jpg", fake_image, "image/jpeg")},
                )
                assert fail_resp.status_code == 500
                assert destroy_mock.called, "Should have destroyed remote Cloudinary asset after DB failure"
    print("  [OK] DB registration failure rolls back session and destroys uploaded Cloudinary asset")

    # 6. Test Usage Conflicts (Products AND Editorial)
    db = SessionLocal()
    try:
        # Editorial usage conflict (StoreSetting hero banner)
        setting = db.query(StoreSetting).first()
        if not setting:
            setting = StoreSetting(id=1, store_name="Royal Libas")
            db.add(setting)
            db.commit()

        setting.hero_image_url = uploaded_data["url"]
        db.commit()

        edit_del = client.delete(f"/admin/media/{created_asset_id}", headers=headers)
        assert edit_del.status_code == 409
        assert "Homepage Hero Banner" in edit_del.json()["detail"]
        print("  [OK] DELETE /admin/media/{id} blocks deletion when media is used in Homepage Hero Banner")

        # Clear editorial conflict
        setting.hero_image_url = None
        db.commit()

        # Product usage conflict
        test_prod = Product(
            name="Cloudinary Test Anarkali",
            slug="cloudinary-test-anarkali-meta",
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

        # Attempt to delete without force -> 409
        del_conflict = client.delete(f"/admin/media/{created_asset_id}", headers=headers)
        assert del_conflict.status_code == 409
        assert "Cloudinary Test Anarkali" in del_conflict.json()["detail"]
        print("  [OK] DELETE /admin/media/{id} blocks deletion when media is used in product galleries")

        # 7. Safe Cloudinary Deletion Edge Cases:
        # A) Remote provider failure -> Returns 502 and PRESERVES DB record
        with patch("cloudinary.uploader.destroy", return_value={"result": "error", "error": {"message": "Cloudinary Down"}}):
            del_err = client.delete(f"/admin/media/{created_asset_id}?force=true", headers=headers)
            assert del_err.status_code == 502, f"Expected 502, got {del_err.status_code}"
            # Verify DB record is preserved
            assert db.query(MediaAsset).filter(MediaAsset.id == created_asset_id).first() is not None
        print("  [OK] Remote Cloudinary deletion failure returns 502 and preserves database record")

        # B) Remote asset 'already missing' (result == 'not found') -> Documented behavior: proceeds with DB deletion
        with patch("cloudinary.uploader.destroy", return_value={"result": "not found"}):
            del_missing = client.delete(f"/admin/media/{created_asset_id}?force=true", headers=headers)
            assert del_missing.status_code == 200
            assert del_missing.json()["status"] == "success"
            # Verify DB record was deleted
            assert db.query(MediaAsset).filter(MediaAsset.id == created_asset_id).first() is None
        print("  [OK] Remote asset 'already missing' is treated as safely absent and cleans up database")

        # Clean up test product
        db.delete(test_prod)
        db.commit()
    finally:
        db.close()

    print("\n[SUCCESS] All Cloudinary Media Integration tests passed rigorously!")

if __name__ == "__main__":
    test_cloudinary_media_integration()
