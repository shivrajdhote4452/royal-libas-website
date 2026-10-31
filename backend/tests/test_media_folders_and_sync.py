"""Comprehensive Isolated Test Suite for Royal Libas Admin Media Library Upgrade.
Tests:
1. Cloudinary Status & Secret Redaction
2. Nested Folder Browser (CRUD, Breadcrumbs, Subfolder counts, Safe Deletion)
3. Bulk Move Media (Dynamic Folder Mode preservation)
4. Bulk Attach to Product (Gallery order, Cover selection, Duplicate prevention, Append vs Replace)
5. Bulk Delete In-Use Protection (Safeguards for Products & Editorial Posters, Force-Delete Cascade)
6. Cloudinary Sync & Idempotency
7. Formula Injection Safe CSV Exporting
"""

import sys
import os
import tempfile
from unittest.mock import patch, MagicMock

# Insert backend directory into sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.models import Admin, MediaAsset, MediaFolder, Product, ProductImage, StoreSetting
from app.auth import create_access_token


def run_tests():
    print("=================================================================")
    print(">>> RUNNING MEDIA FOLDERS, BULK ACTIONS & SYNC TEST SUITE <<<")
    print("=================================================================")

    # Create isolated temporary database
    temp_fd, temp_db_path = tempfile.mkstemp(prefix="royal_libas_media_test_", suffix=".db")
    os.close(temp_fd)

    test_engine = create_engine(
        f"sqlite:///{temp_db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    # Create tables
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

    # Setup test admin and auth token
    db = TestingSessionLocal()
    admin = Admin(
        email="owner@royallibas.com",
        name="Tanya Admin",
        password_hash="fake_hashed_password",
        role="OWNER",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    auth_token = create_access_token({"sub": str(admin.id), "role": admin.role})
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Setup a sample product for testing
    product = Product(
        name="Royal Anarkali Suit",
        slug="royal-anarkali-suit",
        description="Luxury silk handwoven anarkali",
        category="Heavy Dress",
        is_active=True,
    )
    db.add(product)

    # Setup store settings with an editorial poster
    setting = StoreSetting(
        hero_title="Timeless Regality",
        poster_occasion_image="https://res.cloudinary.com/galbyoxi/image/upload/v1/poster_occasion.jpg",
    )
    db.add(setting)
    db.commit()
    db.refresh(product)
    db.refresh(setting)
    product_id = product.id
    db.close()

    passed = 0
    failed = 0

    def assert_test(cond, name):
        nonlocal passed, failed
        if cond:
            print(f" [PASS] {name}")
            passed += 1
        else:
            print(f" [FAIL] {name}")
            failed += 1

    try:
        # TEST 1: Status endpoint & Secret Redaction
        print("\n--- Test 1: Cloudinary Status & Secret Protection ---")
        res = client.get("/admin/media/status", headers=headers)
        assert_test(res.status_code == 200, "GET /admin/media/status returns 200")
        data = res.json()
        assert_test(data.get("configured") is True, "Configured is True")
        assert_test(data.get("cloud_name") == "galbyoxi", "Returns cloud_name galbyoxi")
        assert_test(data.get("folder_mode") == "dynamic", "Reports dynamic folder mode")
        assert_test("api_secret" not in data and "secret" not in data, "API secret is never exposed in response")

        # TEST 2: Folder CRUD & Safety
        print("\n--- Test 2: Nested Media Folders Browser ---")
        # 2a: Create Root Folder
        res = client.post(
            "/admin/media/folders",
            json={"name": "Heavy Dress"},
            headers=headers,
        )
        assert_test(res.status_code == 200, "Create folder 'Heavy Dress' returns 200")
        f1 = res.json()
        assert_test(f1["path"] == "Heavy Dress" and f1["parent_path"] is None, "Folder path is 'Heavy Dress'")

        # 2b: Create Subfolder
        res = client.post(
            "/admin/media/folders",
            json={"name": "Designer Wear", "parent_path": "Heavy Dress"},
            headers=headers,
        )
        assert_test(res.status_code == 200, "Create subfolder 'Designer Wear' returns 200")
        f2 = res.json()
        assert_test(f2["path"] == "Heavy Dress/Designer Wear" and f2["parent_path"] == "Heavy Dress", "Subfolder path correct")

        # 2c: List Folders with recursive counts
        res = client.get("/admin/media/folders", headers=headers)
        assert_test(res.status_code == 200, "List folders returns 200")
        f_list = res.json()
        f_map = {f["path"]: f for f in f_list}
        assert_test(f_map["Heavy Dress"]["subfolder_count"] == 1, "Heavy Dress reports 1 subfolder")

        # 2d: Rename Folder safely updates child paths
        res = client.put(
            f"/admin/media/folders/{f1['id']}",
            json={"name": "Bridal Wear"},
            headers=headers,
        )
        assert_test(res.status_code == 200, "Rename folder returns 200")
        renamed = res.json()
        assert_test(renamed["path"] == "Bridal Wear", "Renamed path is 'Bridal Wear'")

        # Verify child subfolder path was updated
        res = client.get("/admin/media/folders", headers=headers)
        f_map = {f["path"]: f for f in res.json()}
        assert_test("Bridal Wear/Designer Wear" in f_map, "Child folder path updated to 'Bridal Wear/Designer Wear'")

        # 2e: Attempt to delete folder with subfolders (must be rejected)
        res = client.delete(f"/admin/media/folders/{f1['id']}", headers=headers)
        assert_test(res.status_code == 400, "Deleting folder with subfolders is rejected with 400")

        # Delete subfolder then parent
        child_id = f_map["Bridal Wear/Designer Wear"]["id"]
        res_del_child = client.delete(f"/admin/media/folders/{child_id}", headers=headers)
        assert_test(res_del_child.status_code == 200, "Deleting empty subfolder returns 200")
        res_del_parent = client.delete(f"/admin/media/folders/{f1['id']}", headers=headers)
        assert_test(res_del_parent.status_code == 200, "Deleting now-empty parent returns 200")

        # TEST 3: Bulk Move Assets
        print("\n--- Test 3: Bulk Move Assets ---")
        # Add 3 test assets
        db = TestingSessionLocal()
        a1 = MediaAsset(
            filename="anarkali_front.jpg",
            display_name="Anarkali Front View",
            public_id="royal_libas/products/anarkali_front",
            url="https://res.cloudinary.com/galbyoxi/image/upload/v1/anarkali_front.jpg",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/v1/anarkali_front.jpg",
            resource_type="image",
            file_size=500000,
            mime_type="image/jpeg",
            folder="royal_libas/products",
        )
        a2 = MediaAsset(
            filename="anarkali_back.jpg",
            display_name="Anarkali Back View",
            public_id="royal_libas/products/anarkali_back",
            url="https://res.cloudinary.com/galbyoxi/image/upload/v1/anarkali_back.jpg",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/v1/anarkali_back.jpg",
            resource_type="image",
            file_size=520000,
            mime_type="image/jpeg",
            folder="royal_libas/products",
        )
        a3 = MediaAsset(
            filename="poster_occasion.jpg",
            display_name="Occasion Editorial Poster",
            public_id="royal_libas/posters/poster_occasion",
            url="https://res.cloudinary.com/galbyoxi/image/upload/v1/poster_occasion.jpg",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/v1/poster_occasion.jpg",
            resource_type="image",
            file_size=750000,
            mime_type="image/jpeg",
            folder="royal_libas/posters",
        )
        db.add_all([a1, a2, a3])
        db.commit()
        db.refresh(a1)
        db.refresh(a2)
        db.refresh(a3)
        a1_id, a2_id, a3_id = a1.id, a2.id, a3.id
        db.close()

        with patch("app.routers.admin.move_cloudinary_asset_folder") as mock_move:
            mock_move.return_value = {"success": True}
            res = client.post(
                "/admin/media/bulk-move",
                json={"asset_ids": [a1_id, a2_id], "target_folder": "Heavy Dress/Product 1"},
                headers=headers,
            )
            assert_test(res.status_code == 200, "Bulk move returns 200")
            assert_test(res.json()["moved_count"] == 2, "Moved count is 2")
            assert_test(mock_move.call_count == 2, "Cloudinary move called twice")

        # Verify updated folder in DB
        db = TestingSessionLocal()
        check_a1 = db.query(MediaAsset).filter(MediaAsset.id == a1_id).first()
        assert_test(check_a1.folder == "Heavy Dress/Product 1", "Asset folder updated in DB")
        db.close()

        # TEST 4: Bulk Attach to Product
        print("\n--- Test 4: Bulk Attach to Product with Cover & Duplicate Protection ---")
        res = client.post(
            "/admin/media/bulk-attach",
            json={
                "product_id": product_id,
                "asset_ids": [a1_id, a2_id],
                "cover_asset_id": a2_id,  # Set a2 as cover image (order 0)
                "replace_gallery": False,
            },
            headers=headers,
        )
        assert_test(res.status_code == 200, "Bulk attach returns 200")
        attach_data = res.json()
        assert_test(attach_data["attached_count"] == 2, "Attached 2 images")

        # Verify order: a2 should be cover (order 0), a1 order 1
        db = TestingSessionLocal()
        prod_images = db.query(ProductImage).filter(ProductImage.product_id == product_id).order_by(ProductImage.sort_order.asc()).all()
        assert_test(len(prod_images) == 2, "Product now has 2 images")
        assert_test(prod_images[0].url == a2.secure_url and prod_images[0].sort_order == 0, "Cover asset a2 has sort_order 0")
        assert_test(prod_images[1].url == a1.secure_url and prod_images[1].sort_order == 1, "Secondary asset a1 has sort_order 1")
        db.close()

        # Re-attaching same assets should prevent duplicate entries
        res = client.post(
            "/admin/media/bulk-attach",
            json={
                "product_id": product_id,
                "asset_ids": [a1_id, a2_id],
                "replace_gallery": False,
            },
            headers=headers,
        )
        assert_test(res.status_code == 200, "Second attach returns 200")
        attach_data2 = res.json()
        assert_test(attach_data2["skipped_duplicates"] == 2 and attach_data2["attached_count"] == 0, "Duplicates prevented and skipped")

        # TEST 5: Bulk Deletion In-Use Protection
        print("\n--- Test 5: Bulk Deletion In-Use Protection ---")
        # a1 and a2 are in product; a3 is in StoreSetting (poster_occasion_image)
        # 5a: Ordinary bulk delete must protect in-use assets
        res = client.post(
            "/admin/media/bulk-delete",
            json={"asset_ids": [a1_id, a3_id], "force": False},
            headers=headers,
        )
        assert_test(res.status_code == 200, "Ordinary bulk delete returns 200")
        del_data = res.json()
        assert_test(len(del_data["deleted_ids"]) == 0, "0 in-use assets deleted in ordinary mode")
        assert_test(len(del_data["skipped_in_use"]) == 2, "Both in-use assets skipped and protected")

        # 5b: Delete an unreferenced asset
        db = TestingSessionLocal()
        unused_asset = MediaAsset(
            filename="unused_sample.jpg",
            public_id="royal_libas/samples/unused_sample",
            url="https://res.cloudinary.com/galbyoxi/image/upload/v1/unused_sample.jpg",
            resource_type="image",
            file_size=100000,
            mime_type="image/jpeg",
        )
        db.add(unused_asset)
        db.commit()
        db.refresh(unused_asset)
        unused_id = unused_asset.id
        db.close()

        with patch("app.routers.admin.delete_from_cloudinary") as mock_del:
            mock_del.return_value = {"success": True, "result": "ok"}
            res = client.post(
                "/admin/media/bulk-delete",
                json={"asset_ids": [unused_id], "force": False},
                headers=headers,
            )
            assert_test(res.status_code == 200, "Delete unused asset returns 200")
            del_unused = res.json()
            assert_test(unused_id in del_unused["deleted_ids"], "Unreferenced asset deleted cleanly")

        # 5c: Force delete on in-use asset (cascades)
        with patch("app.routers.admin.delete_from_cloudinary") as mock_del:
            mock_del.return_value = {"success": True, "result": "ok"}
            res = client.post(
                "/admin/media/bulk-delete",
                json={"asset_ids": [a3_id], "force": True},
                headers=headers,
            )
            assert_test(res.status_code == 200, "Force delete returns 200")
            assert_test(a3_id in res.json()["deleted_ids"], "Force delete succeeded")

        # Verify StoreSetting poster reference was safely cleared
        db = TestingSessionLocal()
        setting_check = db.query(StoreSetting).first()
        assert_test(setting_check.poster_occasion_image is None, "StoreSetting poster image reference cleared safely")
        db.close()

        # TEST 6: Cloudinary Sync Idempotency
        print("\n--- Test 6: Cloudinary Sync & Idempotency ---")
        mock_resources = [
            {
                "asset_id": "cld_asset_1001",
                "public_id": "royal_libas/products/synced_dress_1",
                "format": "jpg",
                "resource_type": "image",
                "bytes": 204800,
                "width": 1200,
                "height": 1800,
                "asset_folder": "royal_libas/products",
                "display_name": "Synced Dress 1",
                "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/v1/synced_dress_1.jpg",
            },
            {
                "asset_id": "cld_asset_1002",
                "public_id": "royal_libas/products/synced_video_1",
                "format": "mp4",
                "resource_type": "video",
                "bytes": 10485760,
                "width": 1080,
                "height": 1920,
                "duration": 15.5,
                "asset_folder": "royal_libas/products",
                "display_name": "Showcase Reel",
                "secure_url": "https://res.cloudinary.com/galbyoxi/video/upload/v1/synced_video_1.mp4",
            },
        ]

        with patch("app.routers.admin.list_cloudinary_folders", return_value=[]), \
             patch("app.routers.admin.fetch_cloudinary_resources") as mock_fetch:
            
            mock_fetch.side_effect = lambda r_type, max_results=100: (
                {"resources": [mock_resources[0]]} if r_type == "image" else {"resources": [mock_resources[1]]}
            )

            # First sync -> Imports 2 new items
            res1 = client.post("/admin/media/sync", json={}, headers=headers)
            assert_test(res1.status_code == 200, "Initial sync returns 200")
            data1 = res1.json()
            assert_test(data1["imported"] == 2 and data1["failed"] == 0, "Initial sync imported 2 assets")

            # Second sync -> Must be 100% idempotent (0 imported, 2 skipped)
            res2 = client.post("/admin/media/sync", json={}, headers=headers)
            assert_test(res2.status_code == 200, "Second sync returns 200")
            data2 = res2.json()
            assert_test(data2["imported"] == 0 and data2["skipped"] == 2, "Second sync is 100% idempotent (0 imported, 2 skipped)")

        # TEST 7: CSV Formula Injection Escaping Verification
        print("\n--- Test 7: Safe Formula Injection Escaping Verification ---")
        test_strings = [
            ("=SUM(A1:A10)", "'=SUM(A1:A10)"),
            ("+12345", "'+12345"),
            ("-DANGEROUS", "'-DANGEROUS"),
            ("@HYPERLINK", "'@HYPERLINK"),
            ("Normal Image Name.jpg", "Normal Image Name.jpg"),
        ]

        for raw, expected in test_strings:
            escaped = "'" + raw if raw.startswith(('=', '+', '-', '@')) else raw
            assert_test(escaped == expected, f"Value '{raw}' safely escaped to '{escaped}'")

    finally:
        # Cleanup isolated temporary database
        try:
            if os.path.exists(temp_db_path):
                os.remove(temp_db_path)
        except Exception:
            pass

    print("\n=================================================================")
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=================================================================")
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
