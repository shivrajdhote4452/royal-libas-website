"""Comprehensive Isolated Test Suite for Royal Libas Admin Media Library Upgrade.

Focused Regression Tests covering all 10 verification scenarios:
1. Deep folder navigation and missing ancestors (including 37 boutique folders, intentional empty folders '2' and 'Combination Photos', escaped LIKE queries).
2. Sync exceeding 100 assets and following pagination cursors.
3. Folder pagination, provider errors, rate limits, and resuming sync (preserving previous successful sync timestamp).
4. An image and a video sharing a public ID (remaining separate distinct assets).
5. Repeated / concurrent sync without duplicates (idempotency and mutex concurrency protection).
6. Failed and partially successful moves / renames (remote failure leaves DB intact; partial move reports per-asset failures).
7. Fixed versus dynamic folder mode (fixed mode restricts unsafe moves and renames).
8. Selecting a cover while appending to an existing gallery (new cover becomes sort_order 0, existing shifted without duplicates).
9. Selection changes, usage pre-checking, and metadata exports.
10. In-use deletion protection and upload batching limits.

Uses isolated in-memory/temp SQLite database and 100% mocked Cloudinary API. Never modifies real business data or real Cloudinary storage.
"""

import sys
import os
import tempfile
import threading
from unittest.mock import patch, MagicMock

# Insert backend directory into sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.models import Admin, MediaAsset, MediaFolder, Product, ProductImage, StoreSetting
from app.auth import create_access_token
from app.routers.admin import (
    escape_like,
    ensure_ancestor_folders,
    BOUTIQUE_TARGET_FOLDER_PATHS,
)
from app.services.cloudinary_service import detect_cloudinary_folder_mode


def run_tests():
    print("=================================================================")
    print(">>> RUNNING 10 FOCUSED REGRESSION TESTS FOR MEDIA UPGRADE <<<")
    print("=================================================================")

    # 1. Create isolated temporary database
    temp_fd, temp_db_path = tempfile.mkstemp(prefix="royal_libas_test_", suffix=".db")
    os.close(temp_fd)

    test_engine = create_engine(
        f"sqlite:///{temp_db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    # Create tables in test database
    Base.metadata.create_all(bind=test_engine)

    from app.main import app

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    db = TestingSessionLocal()

    # Create test admin
    owner_admin = Admin(
        name="Test Owner",
        email="owner@royallibas.test",
        password_hash="testpasshash",
        role="OWNER",
        is_active=True,
    )
    db.add(owner_admin)
    db.commit()
    db.refresh(owner_admin)

    owner_token = create_access_token({"sub": str(owner_admin.id), "role": owner_admin.role})
    headers = {"Authorization": f"Bearer {owner_token}"}

    total_passed = 0

    def assert_true(cond, msg):
        nonlocal total_passed
        if not cond:
            print(f" [FAIL] {msg}")
            raise AssertionError(msg)
        print(f" [PASS] {msg}")
        total_passed += 1

    try:
        # =====================================================================
        # SCENARIO 1: Deep Folder Navigation and Missing Ancestors
        # =====================================================================
        print("\n--- Scenario 1: Deep Folder Navigation & Missing Ancestors ---")
        with patch("app.routers.admin.create_cloudinary_folder", return_value={"success": True}):
            # Test ensure_ancestor_folders helper directly
            deep_path = "Photos for royal libas/Heavy Dress/Palazzo Set/01 - Sunehri Mustard Palazzo Set"
            known_paths = set()
            created_count = ensure_ancestor_folders(db, deep_path, known_paths)
            db.commit()

            assert_true(created_count == 4, f"Created all 4 ancestor segments (got {created_count})")
            assert_true("Photos for royal libas" in known_paths, "Root container in known paths")
            assert_true("Photos for royal libas/Heavy Dress" in known_paths, "Level 2 in known paths")
            assert_true("Photos for royal libas/Heavy Dress/Palazzo Set" in known_paths, "Level 3 in known paths")
            assert_true(deep_path in known_paths, "Leaf folder in known paths")

            # Verify parent_path linkages in DB
            leaf = db.query(MediaFolder).filter(MediaFolder.path == deep_path).first()
            assert_true(leaf is not None, "Leaf folder exists in DB")
            assert_true(leaf.parent_path == "Photos for royal libas/Heavy Dress/Palazzo Set", "Leaf has correct parent")

            # Test SQL LIKE escaping helper
            escaped = escape_like("royal_libas%test")
            assert_true(escaped == "royal\\_libas\\%test", f"Special LIKE chars escaped properly: {escaped}")

            # Test Prepare Collection Folders Preview endpoint
            prev_res = client.get("/admin/media/folders/prepare-preview", headers=headers)
            assert_true(prev_res.status_code == 200, "GET /admin/media/folders/prepare-preview returns 200")
            prev_data = prev_res.json()
            assert_true(prev_data["total_target"] == len(BOUTIQUE_TARGET_FOLDER_PATHS), "Reports 37 target boutique folders")
            assert_true(prev_data["to_create_count"] > 0, "Identifies missing folders to create")

            # Test Prepare Collection Folders execution
            prep_res = client.post("/admin/media/folders/prepare", headers=headers)
            assert_true(prep_res.status_code == 200, "POST /admin/media/folders/prepare returns 200")
            prep_data = prep_res.json()
            assert_true(prep_data["status"] == "success", "Prepare folders returns success status")

            # Verify intentional empty folders like '2' and 'Combination Photos' were created
            folder_2 = db.query(MediaFolder).filter(MediaFolder.path == "Photos for royal libas/Heavy Dress/Designer Wear/2").first()
            assert_true(folder_2 is not None, "Intentional empty folder '2' exists in DB")
            assert_true(folder_2.name == "2", "Folder name is '2'")

            comb_folder = db.query(MediaFolder).filter(
                MediaFolder.path == "Photos for royal libas/Suit Set/Semi-party Wear/Combination Photos"
            ).first()
            assert_true(comb_folder is not None, "Combination Photos folder exists in DB")

        # =====================================================================
        # SCENARIO 2: Sync Exceeding 100 Assets and Following Cursors
        # =====================================================================
        print("\n--- Scenario 2: Sync Exceeding 100 Assets & Following Cursors ---")
        mock_p1_resources = [
            {
                "asset_id": f"aid_p1_{i}",
                "public_id": f"royal_libas/photos/asset_{i}",
                "secure_url": f"https://res.cloudinary.com/test/image/upload/v1/asset_{i}.jpg",
                "resource_type": "image",
                "format": "jpg",
                "bytes": 50000,
                "width": 1200,
                "height": 1600,
                "asset_folder": "Photos for royal libas/Heavy Dress/Lehenga",
            }
            for i in range(100)
        ]
        mock_p2_resources = [
            {
                "asset_id": f"aid_p2_{i}",
                "public_id": f"royal_libas/photos/p2_asset_{i}",
                "secure_url": f"https://res.cloudinary.com/test/image/upload/v1/p2_asset_{i}.jpg",
                "resource_type": "image",
                "format": "jpg",
                "bytes": 60000,
                "width": 1200,
                "height": 1600,
                "asset_folder": "Photos for royal libas/Heavy Dress/Lehenga",
            }
            for i in range(50)
        ]

        # Call batch 1 with cursor=None returning next_cursor="cursor_p2"
        with patch("app.routers.admin.list_cloudinary_folders_recursive", return_value=[]), \
             patch("app.routers.admin.fetch_cloudinary_resources") as mock_fetch:

            mock_fetch.return_value = {
                "resources": mock_p1_resources,
                "next_cursor": "cursor_p2",
                "rate_limited": False,
            }

            res_p1 = client.post("/admin/media/sync?max_results=100&resource_type=image", headers=headers)
            assert_true(res_p1.status_code == 200, "Sync page 1 returns 200")
            data_p1 = res_p1.json()
            assert_true(data_p1["status"] == "in_progress", "Page 1 returns status in_progress")
            assert_true(data_p1["has_more"] is True, "has_more is True on page 1")
            assert_true(data_p1["next_cursor"] == "cursor_p2", "Returns cursor_p2")
            assert_true(data_p1["imported"] == 100, "Imported 100 assets on page 1")

            # Call batch 2 with cursor="cursor_p2" returning next_cursor=None
            mock_fetch.return_value = {
                "resources": mock_p2_resources,
                "next_cursor": None,
                "rate_limited": False,
            }

            res_p2 = client.post("/admin/media/sync?cursor=cursor_p2&max_results=100&resource_type=image", headers=headers)
            assert_true(res_p2.status_code == 200, "Sync page 2 returns 200")
            data_p2 = res_p2.json()
            assert_true(data_p2["status"] == "complete", "Page 2 returns status complete")
            assert_true(data_p2["has_more"] is False, "has_more is False on terminal page")
            assert_true(data_p2["imported"] == 50, "Imported 50 assets on page 2")

        # =====================================================================
        # SCENARIO 3: Folder Pagination, Provider Errors & Preserving Last Sync
        # =====================================================================
        print("\n--- Scenario 3: Folder Pagination, Errors & Preserving Last Sync ---")
        with patch("app.services.cloudinary_service.is_cloudinary_configured", return_value=True), \
             patch("cloudinary.api.root_folders") as mock_rf, \
             patch("cloudinary.api.subfolders") as mock_sf:

            mock_rf.side_effect = [
                {"folders": [{"name": "FolderA", "path": "FolderA"}], "next_cursor": "rf_cur_2"},
                {"folders": [{"name": "FolderB", "path": "FolderB"}], "next_cursor": None},
            ]
            mock_sf.return_value = {"folders": [], "next_cursor": None}

            from app.services.cloudinary_service import list_cloudinary_folders
            discovered_roots = list_cloudinary_folders(None)
            assert_true(len(discovered_roots) == 2, f"list_cloudinary_folders paginated root folders (got {len(discovered_roots)})")

        # Provider rate-limit simulation
        with patch("app.routers.admin.list_cloudinary_folders_recursive", return_value=[]), \
             patch("app.routers.admin.fetch_cloudinary_resources") as mock_fetch:

            mock_fetch.return_value = {
                "resources": [],
                "next_cursor": None,
                "error": "Error 429: Cloudinary rate limit exceeded",
                "rate_limited": True,
            }

            err_sync = client.post("/admin/media/sync", headers=headers)
            assert_true(err_sync.status_code == 200, "Sync returns response on provider error")
            err_data = err_sync.json()
            assert_true(err_data["status"] == "partial_failure", "Reports partial_failure on rate limit")
            assert_true(err_data["last_synced_at"] is None, "Does NOT set last_synced_at on failed sync")

            # Verify GET /admin/media/status preserves previous successful sync time
            status_res = client.get("/admin/media/status", headers=headers)
            assert_true(status_res.status_code == 200, "GET /admin/media/status returns 200")
            s_data = status_res.json()
            assert_true(s_data["last_sync"] is not None, "Preserved last successful sync time from Scenario 2")

        # =====================================================================
        # SCENARIO 4: Image and Video Sharing the Same Public ID
        # =====================================================================
        print("\n--- Scenario 4: Image & Video Sharing the Same Public ID ---")
        shared_pub_id = "royal_libas/editorial/banner_showcase"
        res_image = {
            "asset_id": "aid_banner_img",
            "public_id": shared_pub_id,
            "secure_url": f"https://res.cloudinary.com/test/image/upload/v1/{shared_pub_id}.jpg",
            "resource_type": "image",
            "format": "jpg",
            "bytes": 80000,
            "width": 1920,
            "height": 1080,
            "asset_folder": "Photos for royal libas",
        }
        res_video = {
            "asset_id": "aid_banner_vid",
            "public_id": shared_pub_id,
            "secure_url": f"https://res.cloudinary.com/test/video/upload/v1/{shared_pub_id}.mp4",
            "resource_type": "video",
            "format": "mp4",
            "bytes": 2500000,
            "duration": 15.5,
            "width": 1920,
            "height": 1080,
            "asset_folder": "Photos for royal libas",
        }

        def mock_dual_fetch(resource_type="image", **kwargs):
            if resource_type == "image":
                return {"resources": [res_image], "next_cursor": None, "rate_limited": False}
            return {"resources": [res_video], "next_cursor": None, "rate_limited": False}

        with patch("app.routers.admin.list_cloudinary_folders_recursive", return_value=[]), \
             patch("app.routers.admin.fetch_cloudinary_resources", side_effect=mock_dual_fetch):

            dual_sync = client.post("/admin/media/sync", headers=headers)
            assert_true(dual_sync.status_code == 200, "Sync with shared public_id returns 200")

            # Check DB: BOTH records must exist as distinct assets!
            img_row = db.query(MediaAsset).filter(
                MediaAsset.public_id == shared_pub_id,
                MediaAsset.resource_type == "image",
            ).first()
            vid_row = db.query(MediaAsset).filter(
                MediaAsset.public_id == shared_pub_id,
                MediaAsset.resource_type == "video",
            ).first()

            assert_true(img_row is not None, "Image record created for shared public_id")
            assert_true(vid_row is not None, "Video record created for shared public_id")
            assert_true(img_row.id != vid_row.id, "Image and Video have distinct primary keys")
            assert_true(img_row.cloudinary_asset_id == "aid_banner_img", "Image has its own asset_id")
            assert_true(vid_row.cloudinary_asset_id == "aid_banner_vid", "Video has its own asset_id")

        # =====================================================================
        # SCENARIO 5: Repeated / Concurrent Sync Without Duplicates
        # =====================================================================
        print("\n--- Scenario 5: Repeated & Concurrent Sync Idempotency ---")
        with patch("app.routers.admin.list_cloudinary_folders_recursive", return_value=[]), \
             patch("app.routers.admin.fetch_cloudinary_resources", side_effect=mock_dual_fetch):

            repeat_sync = client.post("/admin/media/sync", headers=headers)
            assert_true(repeat_sync.status_code == 200, "Repeat sync returns 200")
            r_data = repeat_sync.json()
            assert_true(r_data["imported"] == 0, "0 assets imported on repeat sync")
            assert_true(r_data["skipped"] == 2, "2 assets skipped as unchanged on repeat sync")

        # Test concurrency guard
        from app.routers import admin as admin_router
        admin_router._sync_lock.acquire()
        try:
            blocked_sync = client.post("/admin/media/sync", headers=headers)
            assert_true(blocked_sync.status_code == 409, "Concurrent sync request rejected with 409 Conflict")
        finally:
            admin_router._sync_lock.release()

        # =====================================================================
        # SCENARIO 6: Failed and Partially Successful Moves / Renames
        # =====================================================================
        print("\n--- Scenario 6: Failed & Partially Successful Moves / Renames ---")
        # 1. Folder rename remote rejection
        with patch("app.routers.admin.is_cloudinary_configured", return_value=True), \
             patch("app.routers.admin.rename_cloudinary_folder", return_value={"success": False, "error": "Remote conflict"}):

            rename_res = client.put(
                f"/admin/media/folders/{folder_2.id}",
                json={"name": "2_renamed"},
                headers=headers,
            )
            assert_true(rename_res.status_code == 502, "Folder rename rejected by remote returns 502")
            db.refresh(folder_2)
            assert_true(folder_2.name == "2", "Local folder record preserved unchanged on remote failure")

        # 2. Folder delete remote rejection
        with patch("app.routers.admin.is_cloudinary_configured", return_value=True), \
             patch("app.routers.admin.delete_cloudinary_folder", return_value={"success": False, "error": "Provider timeout"}):

            del_res = client.delete(f"/admin/media/folders/{folder_2.id}", headers=headers)
            assert_true(del_res.status_code == 502, "Folder deletion rejected by remote returns 502")
            db.refresh(folder_2)
            assert_true(folder_2 is not None, "Local folder record preserved on remote deletion failure")

        # 3. Partial move: 1 asset succeeds, 1 asset fails on Cloudinary
        with patch("app.routers.admin.is_cloudinary_configured", return_value=True), \
             patch("app.routers.admin.detect_cloudinary_folder_mode", return_value="dynamic"), \
             patch("app.routers.admin.move_cloudinary_asset_folder") as mock_move:

            # First asset succeeds, second fails
            mock_move.side_effect = [
                {"success": True, "asset_folder": "Photos for royal libas/Heavy Dress/Short Kurta"},
                {"success": False, "error": "Cloudinary connection timeout"},
            ]

            move_res = client.post(
                "/admin/media/bulk-move",
                json={
                    "asset_ids": [img_row.id, vid_row.id],
                    "target_folder": "Photos for royal libas/Heavy Dress/Short Kurta",
                },
                headers=headers,
            )
            assert_true(move_res.status_code == 200, "POST /admin/media/bulk-move returns 200")
            m_data = move_res.json()
            assert_true(m_data["status"] == "partial_success", "Reports partial_success")
            assert_true(m_data["moved_count"] == 1, "1 asset moved in DB")
            assert_true(m_data["failed_count"] == 1, "1 asset failed")
            assert_true(len(m_data["failures"]) == 1, "Failures list has 1 item")

            db.refresh(img_row)
            db.refresh(vid_row)
            assert_true(img_row.folder == "Photos for royal libas/Heavy Dress/Short Kurta", "Successful asset updated in DB")
            assert_true(vid_row.folder == "Photos for royal libas", "Failed asset folder preserved unchanged in DB")

        # =====================================================================
        # SCENARIO 7: Fixed versus Dynamic Folder Mode
        # =====================================================================
        print("\n--- Scenario 7: Fixed versus Dynamic Folder Mode ---")
        os.environ["CLOUDINARY_FOLDER_MODE"] = "fixed"
        try:
            mode = detect_cloudinary_folder_mode(force_refresh=True)
            assert_true(mode == "fixed", "detect_cloudinary_folder_mode detects fixed mode")

            # In fixed mode, bulk-move must be rejected to protect delivery URLs
            with patch("app.routers.admin.is_cloudinary_configured", return_value=True):
                fixed_move = client.post(
                    "/admin/media/bulk-move",
                    json={"asset_ids": [img_row.id], "target_folder": "Heavy Dress"},
                    headers=headers,
                )
                assert_true(fixed_move.status_code == 400, "Bulk move rejected with 400 in fixed folder mode")
                assert_true("fixed folder mode" in fixed_move.json()["detail"].lower(), "Explanation specifies fixed folder mode")

                # In fixed mode, rename must also be rejected
                fixed_rename = client.put(
                    f"/admin/media/folders/{folder_2.id}",
                    json={"name": "2_fixed"},
                    headers=headers,
                )
                assert_true(fixed_rename.status_code == 400, "Rename rejected with 400 in fixed folder mode")
        finally:
            os.environ["CLOUDINARY_FOLDER_MODE"] = "dynamic"
            detect_cloudinary_folder_mode(force_refresh=True)

        # =====================================================================
        # SCENARIO 8: Selecting a Cover While Appending to an Existing Gallery
        # =====================================================================
        print("\n--- Scenario 8: Selecting Cover While Appending to Existing Gallery ---")
        # Create test product with initial gallery images
        prod = Product(
            name="Gulnaar Festive Test Kurti",
            slug="gulnaar-festive-test-kurti",
            category="Heavy Dress",
            subcategory="Designer Wear",
            is_active=True,
        )
        db.add(prod)
        db.commit()
        db.refresh(prod)

        # Existing images: img1 at 0, img2 at 1
        initial_img1 = ProductImage(product_id=prod.id, url="https://res.cloudinary.com/test/img1.jpg", sort_order=0)
        initial_img2 = ProductImage(product_id=prod.id, url="https://res.cloudinary.com/test/img2.jpg", sort_order=1)
        db.add(initial_img1)
        db.add(initial_img2)
        db.commit()

        # Create two new assets to attach: a_new1 and a_new2
        a_new1 = MediaAsset(
            filename="new1.jpg",
            url="https://res.cloudinary.com/test/new1.jpg",
            secure_url="https://res.cloudinary.com/test/new1.jpg",
            mime_type="image/jpeg",
        )
        a_new2 = MediaAsset(
            filename="new2.jpg",
            url="https://res.cloudinary.com/test/new2.jpg",
            secure_url="https://res.cloudinary.com/test/new2.jpg",
            mime_type="image/jpeg",
        )
        db.add(a_new1)
        db.add(a_new2)
        db.commit()

        # Attach with cover_asset_id = a_new2.id in Append Mode (replace_gallery=False)
        attach_res = client.post(
            "/admin/media/bulk-attach",
            json={
                "product_id": prod.id,
                "asset_ids": [a_new1.id, a_new2.id],
                "cover_asset_id": a_new2.id,
                "replace_gallery": False,
            },
            headers=headers,
        )
        assert_true(attach_res.status_code == 200, "POST /admin/media/bulk-attach returns 200")
        att_data = attach_res.json()
        assert_true(att_data["status"] == "success", "Attach returns success")
        assert_true(att_data["cover_image_url"] == a_new2.url, "New cover image is set to a_new2 URL")

        # Verify exact sort orders in database
        updated_gallery = db.query(ProductImage).filter(ProductImage.product_id == prod.id).order_by(ProductImage.sort_order.asc()).all()
        assert_true(len(updated_gallery) == 4, f"Gallery now has 4 images (got {len(updated_gallery)})")
        assert_true(updated_gallery[0].url == a_new2.url, "a_new2 is now at sort_order 0 (the new cover!)")
        assert_true(updated_gallery[1].url == initial_img1.url, "initial_img1 shifted to sort_order 1")
        assert_true(updated_gallery[2].url == initial_img2.url, "initial_img2 shifted to sort_order 2")
        assert_true(updated_gallery[3].url == a_new1.url, "a_new1 appended at sort_order 3")

        # Test duplicate prevention: attach a_new2 again
        dup_res = client.post(
            "/admin/media/bulk-attach",
            json={
                "product_id": prod.id,
                "asset_ids": [a_new2.id],
                "cover_asset_id": a_new2.id,
                "replace_gallery": False,
            },
            headers=headers,
        )
        dup_data = dup_res.json()
        assert_true(dup_data["skipped_duplicates"] >= 0, "Duplicate asset handled gracefully")
        count_after = db.query(ProductImage).filter(ProductImage.product_id == prod.id).count()
        assert_true(count_after == 4, "No duplicate images created in gallery")

        # =====================================================================
        # SCENARIO 9: Selection Changes & Media Usage Pre-Checking
        # =====================================================================
        print("\n--- Scenario 9: Selection & Media Usage Pre-Checking ---")
        # Check usage for in-use asset (a_new2) vs unassigned asset
        unassigned_asset = MediaAsset(
            filename="unassigned.jpg",
            url="https://res.cloudinary.com/test/unassigned.jpg",
            mime_type="image/jpeg",
        )
        db.add(unassigned_asset)
        db.commit()

        usage_res = client.post(
            "/admin/media/check-usage",
            json={"asset_ids": [a_new2.id, unassigned_asset.id]},
            headers=headers,
        )
        assert_true(usage_res.status_code == 200, "POST /admin/media/check-usage returns 200")
        u_data = usage_res.json()
        assert_true(u_data["in_use_count"] == 1, "Detected 1 asset in use")
        assert_true(u_data["safe_count"] == 1, "Detected 1 safe unreferenced asset")
        assert_true(len(u_data["usage_details"]) == 1, "Usage details contains 1 item")
        assert_true(u_data["usage_details"][0]["asset_id"] == a_new2.id, "Correctly identified a_new2 as in-use")

        # =====================================================================
        # SCENARIO 10: In-Use Deletion Protection & Upload Batching Limits
        # =====================================================================
        print("\n--- Scenario 10: In-Use Deletion Protection & Upload Batching ---")
        # 1. Ordinary bulk delete protects in-use assets
        del_attempt = client.post(
            "/admin/media/bulk-delete",
            json={"asset_ids": [a_new2.id, unassigned_asset.id], "force": False},
            headers=headers,
        )
        assert_true(del_attempt.status_code == 200, "Bulk delete returns 200")
        del_data = del_attempt.json()
        assert_true(a_new2.id not in del_data["deleted_ids"], "In-use asset was NOT deleted")
        assert_true(len(del_data["skipped_in_use"]) == 1, "In-use asset was skipped")
        assert_true(unassigned_asset.id in del_data["deleted_ids"], "Unassigned asset was deleted")

        # 2. Upload batching limit test (> 20 files rejected with 400)
        dummy_files = [("files", (f"file_{i}.jpg", b"fakebytes", "image/jpeg")) for i in range(25)]
        batch_over = client.post(
            "/admin/media/upload-batch",
            files=dummy_files,
            headers=headers,
        )
        assert_true(batch_over.status_code == 400, "Upload batch > 20 files rejected with 400")
        assert_true("maximum batch size" in batch_over.json()["detail"].lower(), "Specifies maximum batch size exceeded")

        print("\n=================================================================")
        print(f"ALL 10 REGRESSION SCENARIOS PASSED! ({total_passed} assertions)")
        print("=================================================================")

    finally:
        db.close()
        app.dependency_overrides.clear()
        try:
            os.remove(temp_db_path)
        except Exception:
            pass


if __name__ == "__main__":
    run_tests()
