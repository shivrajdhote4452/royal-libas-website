import sys
import os
import io
import json
import tempfile
from unittest.mock import patch, MagicMock

# Insert backend directory into sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.models import Admin, MediaAsset, Product, ProductImage, StoreSetting
from app.auth import create_access_token
from app.services.cloudinary_service import (
    validate_media_file,
    inspect_media_content_type,
    validate_file_content_signature,
    detect_resource_type,
    MAX_IMAGE_SIZE_BYTES,
    MAX_VIDEO_SIZE_BYTES,
    MAX_BATCH_FILES,
)


def run_isolated_media_safety_tests():
    print("=================================================================")
    print(">>> RUNNING ISOLATED CLOUDINARY MEDIA & SAFETY SUITE <<<")
    print("=================================================================")

    # 1. Create an isolated temporary test database to guarantee safety
    temp_fd, temp_db_path = tempfile.mkstemp(prefix="royal_libas_test_", suffix=".db")
    os.close(temp_fd)

    test_engine = create_engine(
        f"sqlite:///{temp_db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    # Create all tables in isolated database
    Base.metadata.create_all(bind=test_engine)

    # Override get_db in FastAPI app
    from app.main import app

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    try:
        # Seed initial test fixtures in isolated database
        db = TestingSessionLocal()
        try:
            admin = Admin(
                id=1,
                email="owner@royallibas.com",
                password_hash="fakehash",
                role="OWNER",
                is_active=True,
            )
            store_mgr = Admin(
                id=2,
                email="manager@royallibas.com",
                password_hash="fakehash",
                role="STORE_MANAGER",
                is_active=True,
            )
            setting = StoreSetting(
                id=1,
                hero_image_url="https://res.cloudinary.com/demo/image/upload/v1/hero_banner.jpg",
            )
            prod = Product(
                id=1,
                name="Test Banarasi Silk Saree",
                slug="test-banarasi-silk-saree",
                is_active=True,
            )
            db.add_all([admin, store_mgr, setting, prod])
            db.commit()
        finally:
            db.close()

        admin_token = create_access_token({"sub": "1", "role": "OWNER"})
        headers = {"Authorization": f"Bearer {admin_token}"}

        # -------------------------------------------------------------
        # SUITE 1: STRICT SERVER-SIDE CONTENT & EXTENSION VALIDATION
        # -------------------------------------------------------------
        print("\n[SUITE 1] Strict Server-Side Content & Magic Bytes Validation...")

        # 1.1 Renamed invalid file (text file renamed to .jpg)
        fake_text_renamed = b"Hello, this is just plain text content masquerading as JPEG!"
        try:
            validate_media_file(fake_text_renamed, "malicious.jpg")
            assert False, "Should reject text content with .jpg extension"
        except Exception as e:
            assert "does not match supported image or video signatures" in str(e.detail)
        print("  [PASS] Renamed text file (.jpg) strictly rejected by magic bytes inspection")

        # 1.2 Binary signature mismatch (MP4 video named with .jpg extension)
        mp4_fake_jpg = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 30
        try:
            validate_media_file(mp4_fake_jpg, "video_as_image.jpg")
            assert False, "Should reject video content with .jpg extension"
        except Exception as e:
            assert "incompatible extension" in str(e.detail)
        print("  [PASS] Incompatible extension (MP4 data named .jpg) rejected with HTTP 400")

        # 1.3 Empty file (0 bytes)
        empty_upload = client.post(
            "/admin/media/upload",
            headers=headers,
            files={"file": ("empty.jpg", b"", "image/jpeg")},
        )
        assert empty_upload.status_code == 400
        assert "empty" in empty_upload.json()["detail"].lower()
        print("  [PASS] Empty file (0 bytes) rejected with HTTP 400")

        # 1.4 Valid files: JPEG, PNG, WebP, AVIF, MP4, WebM
        valid_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 50
        r_type, fmt, mime = validate_media_file(valid_jpeg, "valid.jpg")
        assert r_type == "image" and fmt == "jpg" and mime == "image/jpeg"

        valid_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
        r_type, fmt, mime = validate_media_file(valid_png, "valid.png")
        assert r_type == "image" and fmt == "png" and mime == "image/png"

        valid_mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 50
        r_type, fmt, mime = validate_media_file(valid_mp4, "valid.mp4")
        assert r_type == "video" and fmt == "mp4" and mime == "video/mp4"
        print("  [PASS] Valid JPEG, PNG, and MP4 binary streams recognized accurately")

        # 1.5 Image upload size limit (10MB Free plan limit)
        assert MAX_IMAGE_SIZE_BYTES == 10 * 1024 * 1024
        try:
            oversized_image = b"\xff\xd8\xff\xe0" + b"\x00" * (10 * 1024 * 1024 + 10)
            validate_media_file(oversized_image, "large_photo.jpg")
            assert False, "Should reject image > 10MB"
        except Exception as e:
            assert "exceeds maximum size of 10MB" in str(e.detail)
        print("  [PASS] Image exceeding 10MB limit rejected with HTTP 400 (Cloudinary Free limit)")

        # 1.6 Video upload size limit (60MB limit)
        assert MAX_VIDEO_SIZE_BYTES == 60 * 1024 * 1024
        try:
            oversized_video = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * (60 * 1024 * 1024 + 10)
            validate_media_file(oversized_video, "large_video.mp4")
            assert False, "Should reject video > 60MB"
        except Exception as e:
            assert "exceeds maximum size of 60MB" in str(e.detail)
        print("  [PASS] Video exceeding 60MB limit rejected with HTTP 400")

        # 1.7 Server-side batch file limit (20 files)
        assert MAX_BATCH_FILES == 20
        over_batch_files = [("files", (f"file_{i}.jpg", valid_jpeg, "image/jpeg")) for i in range(21)]
        over_batch_resp = client.post("/admin/media/upload-batch", headers=headers, files=over_batch_files)
        assert over_batch_resp.status_code == 400
        assert "Maximum batch size exceeded" in over_batch_resp.json()["detail"]
        print("  [PASS] Batch upload exceeding 20 files rejected with HTTP 400")

        # 1.8 Role authentication protection
        unauth_resp = client.post("/admin/media/upload", files={"file": ("test.jpg", valid_jpeg, "image/jpeg")})
        assert unauth_resp.status_code == 401
        print("  [PASS] Unauthenticated upload rejected with HTTP 401")

        # -------------------------------------------------------------
        # SUITE 2: TRANSACTION BOUNDARIES & CLEANUP REPORTING
        # -------------------------------------------------------------
        print("\n[SUITE 2] Transaction Boundaries & Cleanup Reporting...")

        mock_cloudinary_upload = {
            "public_id": "royal_libas/products/test_asset_cleanup",
            "secure_url": "https://res.cloudinary.com/zkgaklhl/image/upload/v1/test_asset_cleanup.jpg",
            "url": "https://res.cloudinary.com/zkgaklhl/image/upload/v1/test_asset_cleanup.jpg",
            "resource_type": "image",
            "format": "jpg",
            "width": 800,
            "height": 1000,
            "duration": None,
            "bytes": 2048,
        }

        # 2.1 DB failure + Successful Remote Cleanup
        with patch("cloudinary.uploader.upload", return_value=mock_cloudinary_upload):
            with patch("cloudinary.uploader.destroy", return_value={"result": "ok"}) as destroy_mock:
                with patch.object(Session, "commit", side_effect=Exception("DB connection dropped")):
                    resp = client.post(
                        "/admin/media/upload",
                        headers=headers,
                        files={"file": ("kurti_test.jpg", valid_jpeg, "image/jpeg")},
                    )
                    assert resp.status_code == 500
                    # Checked and confirmed rollback
                    assert "Remote upload was rolled back" in resp.json()["detail"]
                    assert destroy_mock.called
        print("  [PASS] DB error with successful cleanup: session rolled back and report confirmed")

        # 2.2 DB failure + Failed Remote Cleanup
        with patch("cloudinary.uploader.upload", return_value=mock_cloudinary_upload):
            # Cloudinary destroy returns error
            with patch("cloudinary.uploader.destroy", return_value={"result": "error", "error": "Cloudinary timeout"}) as destroy_mock:
                with patch.object(Session, "commit", side_effect=Exception("DB deadlock")):
                    resp_fail = client.post(
                        "/admin/media/upload",
                        headers=headers,
                        files={"file": ("kurti_orphan.jpg", valid_jpeg, "image/jpeg")},
                    )
                    assert resp_fail.status_code == 500
                    detail = resp_fail.json()["detail"]
                    # CRITICAL: API must NEVER claim remote upload was rolled back if cleanup failed!
                    assert "was rolled back" not in detail
                    assert "cleanup could not be confirmed" in detail
                    assert "royal_libas/products/test_asset_cleanup" in detail
                    # No secrets exposed in error
                    assert "CLOUDINARY_API_SECRET" not in detail
                    assert "api_secret" not in detail
        print("  [PASS] DB error with failed cleanup: API accurately reports unconfirmed cleanup and asset ID")

        # 2.3 Post-Commit Error (Activity logging failure must NOT trigger remote deletion)
        destroy_post_mock = MagicMock(return_value={"result": "ok"})
        with patch("cloudinary.uploader.upload", return_value=mock_cloudinary_upload):
            with patch("cloudinary.uploader.destroy", destroy_post_mock):
                with patch("app.routers.admin.log_activity", side_effect=Exception("Audit log failure")):
                    post_commit_resp = client.post(
                        "/admin/media/upload",
                        headers=headers,
                        files={"file": ("anarkali_saved.jpg", valid_jpeg, "image/jpeg")},
                    )
                    # Upload must succeed because DB was already committed!
                    assert post_commit_resp.status_code == 200
                    saved_asset_id = post_commit_resp.json()["id"]
                    # Ensure compensating destroy was NOT called
                    assert not destroy_post_mock.called, "Must not destroy remote asset after DB commit!"
        print("  [PASS] Post-commit logging error does NOT delete committed Cloudinary asset")

        # 2.4 Batch Upload: Partial failure with duplicate filenames and unique client IDs
        batch_mock_return_1 = dict(mock_cloudinary_upload, public_id="royal_libas/prod_alpha")
        batch_mock_return_2 = dict(mock_cloudinary_upload, public_id="royal_libas/prod_beta")

        upload_seq = [batch_mock_return_1, batch_mock_return_2]
        with patch("cloudinary.uploader.upload", side_effect=upload_seq):
            real_add = Session.add

            def mock_batch_add(self_sess, instance):
                if isinstance(instance, MediaAsset) and getattr(instance, "public_id", "") == "royal_libas/prod_beta":
                    raise Exception("DB unique constraint violation on item 2")
                return real_add(self_sess, instance)

            with patch.object(Session, "add", mock_batch_add):
                with patch("cloudinary.uploader.destroy", return_value={"result": "ok"}):
                    batch_resp = client.post(
                        "/admin/media/upload-batch",
                        headers=headers,
                        files=[
                            ("files", ("dup_photo.jpg", valid_jpeg, "image/jpeg")),
                            ("files", ("dup_photo.jpg", valid_jpeg, "image/jpeg")),  # Duplicate filename!
                        ],
                        data={
                            "client_ids": ["cid_101", "cid_102"],
                            "client_ids_json": json.dumps(["cid_101", "cid_102"]),
                        },
                    )
                    assert batch_resp.status_code == 200
                    b_data = batch_resp.json()
                    assert b_data["status"] == "partial"
                    assert len(b_data["uploaded"]) == 1
                    assert b_data["uploaded"][0]["client_id"] == "cid_101"
                    assert len(b_data["failed"]) == 1
                    assert b_data["failed"][0]["client_id"] == "cid_102"
                    assert "rolled back" in b_data["failed"][0]["error"]
        print("  [PASS] Batch upload safely continues across files; handles duplicate filenames via client_id")

        # 2.5 Post-Commit Error (db.refresh failure after successful commit must NOT delete Cloudinary asset)
        destroy_refresh_mock = MagicMock(return_value={"result": "ok"})
        with patch("cloudinary.uploader.upload", return_value=dict(mock_cloudinary_upload, public_id="royal_libas/refresh_safe_asset")):
            with patch("cloudinary.uploader.destroy", destroy_refresh_mock):
                with patch.object(Session, "refresh", side_effect=Exception("Connection drop on refresh")):
                    refresh_fail_resp = client.post(
                        "/admin/media/upload",
                        headers=headers,
                        files={"file": ("refresh_safe.jpg", valid_jpeg, "image/jpeg")},
                    )
                    # Upload must succeed with HTTP 200 because DB commit was already successful!
                    assert refresh_fail_resp.status_code == 200, f"Expected 200 but got {refresh_fail_resp.status_code}"
                    resp_json = refresh_fail_resp.json()
                    assert resp_json["public_id"] == "royal_libas/refresh_safe_asset"
                    assert not destroy_refresh_mock.called, "Cloudinary asset MUST NOT be deleted when post-commit refresh fails!"

                    # Verify record exists in DB
                    verify_sess = TestingSessionLocal()
                    committed_record = verify_sess.query(MediaAsset).filter(MediaAsset.public_id == "royal_libas/refresh_safe_asset").first()
                    assert committed_record is not None, "Database record must be preserved!"
                    verify_sess.close()
        print("  [PASS] Post-commit refresh error does NOT delete committed Cloudinary asset and preserves DB record")

        # 2.6 Product Image Upload: Post-commit refresh failure preserves Cloudinary and DB record
        destroy_prod_refresh_mock = MagicMock(return_value={"result": "ok"})
        with patch("cloudinary.uploader.upload", return_value=dict(mock_cloudinary_upload, public_id="royal_libas/prod_refresh_safe")):
            with patch("cloudinary.uploader.destroy", destroy_prod_refresh_mock):
                with patch.object(Session, "refresh", side_effect=Exception("DB cursor reset")):
                    prod_upload_resp = client.post(
                        "/admin/products/upload-image",
                        headers=headers,
                        files={"file": ("product_shot.jpg", valid_jpeg, "image/jpeg")},
                    )
                    assert prod_upload_resp.status_code == 200
                    assert prod_upload_resp.json()["public_id"] == "royal_libas/prod_refresh_safe"
                    assert not destroy_prod_refresh_mock.called, "Product asset MUST NOT be deleted when post-commit refresh fails!"
        print("  [PASS] Product image post-commit refresh error preserves Cloudinary and DB record")

        # -------------------------------------------------------------
        # SUITE 3: SAFE DELETION & METADATA PRESERVATION
        # -------------------------------------------------------------
        print("\n[SUITE 3] Safe Deletion & Metadata Verification...")

        # 3.1 Editorial conflict (hero banner reference blocks deletion)
        hero_asset = MediaAsset(
            filename="hero_banner.jpg",
            public_id="royal_libas/hero_banner",
            url="https://res.cloudinary.com/demo/image/upload/v1/hero_banner.jpg",
            file_size=1024,
            mime_type="image/jpeg",
        )
        db_sess = TestingSessionLocal()
        db_sess.add(hero_asset)
        db_sess.commit()
        hero_id = hero_asset.id
        db_sess.close()

        del_hero_conflict = client.delete(f"/admin/media/{hero_id}", headers=headers)
        assert del_hero_conflict.status_code == 409
        assert "Homepage Hero Banner" in del_hero_conflict.json()["detail"]
        print("  [PASS] Asset used in Homepage Hero Banner blocks deletion with HTTP 409")

        # 3.2 Product reference conflict blocks deletion without force
        prod_asset = MediaAsset(
            filename="saree_view.jpg",
            public_id="royal_libas/saree_view",
            url="https://res.cloudinary.com/demo/image/upload/v1/saree_view.jpg",
            file_size=2048,
            mime_type="image/jpeg",
        )
        db_sess = TestingSessionLocal()
        db_sess.add(prod_asset)
        db_sess.commit()
        prod_asset_id = prod_asset.id
        prod_asset_public_id = prod_asset.public_id

        # Attach to product 1
        p_img = ProductImage(
            product_id=1,
            url=prod_asset.url,
            public_id=prod_asset.public_id,
            sort_order=1,
        )
        db_sess.add(p_img)
        db_sess.commit()
        db_sess.close()

        del_prod_conflict = client.delete(f"/admin/media/{prod_asset_id}", headers=headers)
        assert del_prod_conflict.status_code == 409
        assert "Test Banarasi Silk Saree" in del_prod_conflict.json()["detail"]
        print("  [PASS] Asset attached to product blocks deletion with HTTP 409")

        # 3.3 Provider failure preserves DB record
        with patch("cloudinary.uploader.destroy", return_value={"result": "error", "error": "API unreachable"}):
            del_prov_err = client.delete(f"/admin/media/{prod_asset_id}?force=true", headers=headers)
            assert del_prov_err.status_code == 502
            # Verify DB record is preserved
            verify_sess = TestingSessionLocal()
            assert verify_sess.query(MediaAsset).filter(MediaAsset.id == prod_asset_id).first() is not None
            assert verify_sess.query(ProductImage).filter(ProductImage.public_id == prod_asset_public_id).first() is not None
            verify_sess.close()
        print("  [PASS] Cloudinary provider error preserves DB record and product associations (502)")

        # 3.4 Remote already missing (result == 'not found') cleans up DB record
        with patch("cloudinary.uploader.destroy", return_value={"result": "not found"}):
            del_missing = client.delete(f"/admin/media/{prod_asset_id}?force=true", headers=headers)
            assert del_missing.status_code == 200
            verify_sess = TestingSessionLocal()
            assert verify_sess.query(MediaAsset).filter(MediaAsset.id == prod_asset_id).first() is None
            verify_sess.close()
        print("  [PASS] Remote already-missing asset cleans up database record successfully (200)")

    finally:
        # Tear down isolated test database
        app.dependency_overrides.clear()
        test_engine.dispose()
        if os.path.exists(temp_db_path):
            try:
                os.remove(temp_db_path)
            except Exception:
                pass

    print("\n=================================================================")
    print(">>> ALL ISOLATED CLOUDINARY MEDIA & SAFETY CHECKS PASSED! <<<")
    print("=================================================================")


if __name__ == "__main__":
    run_isolated_media_safety_tests()
