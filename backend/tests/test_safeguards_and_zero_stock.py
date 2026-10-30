#!/usr/bin/env python3
"""Automated Safeguard & Protection Test Suite for Royal Libas by Tanya.

Key Safeguards Tested:
1. Anonymous Draft/Inactive Lockdown: Anonymous users cannot see draft, inactive, or archived products
   in listings, including with include_inactive=true, or through direct URLs (returns 404).
2. Authenticated Admin Access: Authenticated admins can manage unpublished products (preview draft
   direct URL returns 200, list all in admin panel, publish, and return to draft).
3. Zero & Negative Stock Controls: Adding a product size with stock 0 preserves exactly 0 (is_available=False);
   negative stock (< 0) is strictly rejected.
4. Non-Destructive Routine Seed: Routine seeding preserves existing product details, stock, images,
   collections, and coupons without overwriting.
5. Safe Maintenance Reset (Dry-Run by Default & Protection): Reset dry-run changes nothing. Products with
   client details, real stock, or media are strictly protected. Reset cannot run without explicit confirmation.
6. Storefront & Editorial Media Deletion Protection: Deleting in-use media returns 409 Conflict detailing
   referrers (hero, category cards, product galleries). Force delete safely clears references.
7. Product Gallery Removal Safety: Removing a photo from a product gallery does NOT delete the Cloudinary asset.

ISOLATION & RELIABILITY GUARANTEES:
- Strictly uses an isolated SQLite test database (test_safeguards_isolated.db).
- DATABASE_URL is forced before importing app, guaranteeing royal_libas.db is NEVER accessed or locked.
- Cloudinary SDK is fully mocked: zero external network calls, zero socket timeouts.
- Each test is monitored with execution timing and assertions.
"""

import os
import sys
import time
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch, MagicMock

# 1. Setup isolated environment BEFORE importing app or database modules
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

TEST_DB_FILE = backend_dir / "test_safeguards_isolated.db"
TEST_DB_URL = f"sqlite:///{TEST_DB_FILE.as_posix()}"
os.environ["DATABASE_URL"] = TEST_DB_URL

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.config as app_config
app_config.DATABASE_URL = TEST_DB_URL

from app.database import Base, get_db, engine as default_engine
from app.models import Admin, Product, ProductVariant, ProductImage, Collection, Coupon, StoreSetting, MediaAsset
from app.auth import hash_password, create_access_token
from app.main import app
from seed import seed_database, reset_sample_products

# Isolated test database engine
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def reset_test_database() -> str:
    """Reset isolated test database tables and create standard test admin."""
    test_engine.dispose()
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    db = TestingSessionLocal()
    try:
        admin = Admin(
            email="owner@royallibas.com",
            password_hash=hash_password("SuperSecretPass123!"),
            name="Tanya Royal",
            role="OWNER",
            is_active=True,
        )
        db.add(admin)

        setting = StoreSetting(
            standard_cod_free_threshold=1500,
            standard_shipping_fee=99,
            cod_enabled=False,
            online_payment_enabled=True,
        )
        db.add(setting)

        db.commit()
        db.refresh(admin)
        token = create_access_token({"sub": str(admin.id), "email": admin.email, "role": admin.role})
        return token
    finally:
        db.close()


# =========================================================================
# TEST 1: Anonymous Lockdown on Draft, Inactive & Archived Products
# =========================================================================
def test_1_anonymous_lockdown(admin_token: str):
    t0 = time.time()
    print("\n[TEST 1] Testing anonymous lockdown on draft and inactive products...", flush=True)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create 1 published product and 2 unpublished products (1 DRAFT, 1 INACTIVE/ARCHIVED)
    client.post(
        "/admin/products",
        headers=headers,
        json={
            "name": "Published Summer Kurti",
            "slug": "published-summer-kurti",
            "category": "TWO PIECES",
            "status": "PUBLISHED",
            "is_active": True,
            "variants": [{"size": "M", "selling_price": "2999.00", "mrp": "3999.00", "stock": 10}],
        },
    )

    client.post(
        "/admin/products",
        headers=headers,
        json={
            "name": "Secret Draft Co-ord",
            "slug": "secret-draft-coord",
            "category": "TWO PIECES",
            "status": "DRAFT",
            "is_active": False,
            "variants": [{"size": "M", "selling_price": "4999.00", "mrp": "5999.00", "stock": 5}],
        },
    )

    client.post(
        "/admin/products",
        headers=headers,
        json={
            "name": "Deactivated Archived Suit",
            "slug": "deactivated-archived-suit",
            "category": "SUITS",
            "status": "ARCHIVED",
            "is_active": False,
            "variants": [{"size": "Free Size", "selling_price": "7999.00", "mrp": "9999.00", "stock": 2}],
        },
    )

    # 1. Anonymous standard GET /products -> only published products returned
    res_normal = client.get("/products")
    assert res_normal.status_code == 200
    slugs_normal = [p["slug"] for p in res_normal.json()]
    assert slugs_normal == ["published-summer-kurti"]
    assert "secret-draft-coord" not in slugs_normal
    assert "deactivated-archived-suit" not in slugs_normal

    # 2. Anonymous attempt with include_inactive=true -> MUST STILL return only published products!
    res_exploit = client.get("/products?include_inactive=true")
    assert res_exploit.status_code == 200
    slugs_exploit = [p["slug"] for p in res_exploit.json()]
    assert slugs_exploit == ["published-summer-kurti"], f"Drafts leaked to public: {slugs_exploit}"

    # 3. Anonymous direct URL access to draft/archived -> HTTP 404 Not Found
    res_draft_url = client.get("/products/secret-draft-coord")
    assert res_draft_url.status_code == 404, f"Public could access draft direct URL: {res_draft_url.status_code}"

    res_archived_url = client.get("/products/deactivated-archived-suit")
    assert res_archived_url.status_code == 404

    print(f"  -> PASSED: Anonymous customers strictly blocked from unpublished products. ({time.time() - t0:.2f}s)", flush=True)


# =========================================================================
# TEST 2: Authenticated Admin Draft Management & Preview
# =========================================================================
def test_2_admin_draft_management(admin_token: str):
    t0 = time.time()
    print("\n[TEST 2] Testing authenticated admin management & preview flow...", flush=True)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Admin preview of draft via direct URL -> HTTP 200 OK
    admin_preview = client.get("/products/secret-draft-coord", headers=headers)
    assert admin_preview.status_code == 200
    assert admin_preview.json()["name"] == "Secret Draft Co-ord"

    # 2. Admin list in admin panel -> shows both draft and published
    admin_list = client.get("/admin/products", headers=headers)
    assert admin_list.status_code == 200
    admin_slugs = [p["slug"] for p in admin_list.json()]
    assert "secret-draft-coord" in admin_slugs
    assert "published-summer-kurti" in admin_slugs

    # 3. Admin publishes the draft product -> becomes publicly accessible
    draft_id = next(p["id"] for p in admin_list.json() if p["slug"] == "secret-draft-coord")
    pub_res = client.patch(f"/admin/products/{draft_id}", headers=headers, json={"status": "PUBLISHED"})
    assert pub_res.status_code == 200

    public_view = client.get("/products/secret-draft-coord")
    assert public_view.status_code == 200

    # 4. Admin moves it back to DRAFT -> immediately hidden with 404
    unpub_res = client.patch(f"/admin/products/{draft_id}", headers=headers, json={"status": "DRAFT"})
    assert unpub_res.status_code == 200

    public_hidden = client.get("/products/secret-draft-coord")
    assert public_hidden.status_code == 404

    print(f"  -> PASSED: Admin preview, listing, publishing, and unpublishing work smoothly. ({time.time() - t0:.2f}s)", flush=True)


# =========================================================================
# TEST 3: Zero Stock Persistence & Negative Stock Rejection
# =========================================================================
def test_3_zero_and_negative_stock(admin_token: str):
    t0 = time.time()
    print("\n[TEST 3] Testing zero stock persistence & negative stock rejection...", flush=True)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create a product
    prod_res = client.post(
        "/admin/products",
        headers=headers,
        json={
            "name": "Stock Validation Suit",
            "slug": "stock-validation-suit",
            "category": "SUITS",
            "status": "PUBLISHED",
            "is_active": True,
            "variants": [{"size": "S", "selling_price": "3999.00", "mrp": "4999.00", "stock": 5}],
        },
    )
    product_id = prod_res.json()["id"]

    # 1. Add new size with stock=0 -> must save exactly 0 and is_available=False
    add_zero_res = client.post(
        f"/admin/products/{product_id}/variants",
        headers=headers,
        json={"size": "M", "selling_price": "3999.00", "mrp": "4999.00", "stock": 0},
    )
    assert add_zero_res.status_code == 201
    assert add_zero_res.json()["stock"] == 0
    assert add_zero_res.json()["is_available"] is False

    # 2. Update existing size to stock=0 -> preserves 0
    variant_s_id = prod_res.json()["variants"][0]["id"]
    update_zero_res = client.patch(
        f"/admin/variants/{variant_s_id}",
        headers=headers,
        json={"stock": 0},
    )
    assert update_zero_res.status_code == 200
    assert update_zero_res.json()["stock"] == 0
    assert update_zero_res.json()["is_available"] is False

    # 3. Add size with negative stock -> rejected
    neg_res = client.post(
        f"/admin/products/{product_id}/variants",
        headers=headers,
        json={"size": "L", "selling_price": "3999.00", "mrp": "4999.00", "stock": -5},
    )
    assert neg_res.status_code in (400, 422)

    print(f"  -> PASSED: Stock=0 preserved accurately, negative stock rejected. ({time.time() - t0:.2f}s)", flush=True)


# =========================================================================
# TEST 4: Routine Seed Script Data Preservation
# =========================================================================
def test_4_routine_seed_preservation():
    t0 = time.time()
    print("\n[TEST 4] Testing routine non-destructive seed script...", flush=True)
    db = TestingSessionLocal()

    # 1. Create a dummy-named product
    dummy_prod = Product(
        name="dummy-test-item",
        slug="dummy-test-item",
        category="TWO PIECES",
        status="DRAFT",
        is_active=False,
    )
    db.add(dummy_prod)

    # 2. Create custom collection with customized description
    custom_col = Collection(
        name="Festive Edit",
        slug="festive-edit",
        description="Custom Client Copy: Authentic Zari Silks.",
    )
    db.add(custom_col)

    # 3. Create custom coupon
    custom_coupon = Coupon(
        code="ROYAL10",
        type="PERCENT",
        value=Decimal("30.00"),
        min_order_value=Decimal("5000.00"),
        is_active=True,
    )
    db.add(custom_coupon)

    # 4. Create an existing product sharing sample slug with custom client data, stock, and photo
    sample_slug = "noorani-chanderi-kurti-set"
    client_prod = Product(
        name="Real Tanya Noorani Masterpiece",
        slug=sample_slug,
        fabric="Pure Banarasi Katan",
        category="Kurti Sets",
        status="PUBLISHED",
        is_active=True,
    )
    db.add(client_prod)
    db.flush()

    variant = ProductVariant(
        product_id=client_prod.id,
        size="M",
        colour="Wine",
        sku="RL-NOOR-WINE-M",
        mrp=Decimal("9999.00"),
        selling_price=Decimal("7999.00"),
        stock=4,
    )
    db.add(variant)

    img = ProductImage(
        product_id=client_prod.id,
        url="https://res.cloudinary.com/royallibas/image/upload/v1/client_master.jpg",
        public_id="royal_libas/client_master",
        sort_order=1,
        alt_text="Real Shot",
    )
    db.add(img)
    db.commit()
    db.close()

    # Execute routine seed
    seed_database(session_factory=TestingSessionLocal)

    # Verify everything was preserved
    db2 = TestingSessionLocal()
    found_dummy = db2.query(Product).filter(Product.slug == "dummy-test-item").first()
    assert found_dummy is not None, "Routine seed deleted dummy product!"

    col = db2.query(Collection).filter(Collection.slug == "festive-edit").first()
    assert col.description == "Custom Client Copy: Authentic Zari Silks.", "Routine seed overwrote collection description!"

    cp = db2.query(Coupon).filter(Coupon.code == "ROYAL10").first()
    assert cp.value == Decimal("30.00"), f"Routine seed overwrote coupon value: {cp.value}"

    prod = db2.query(Product).filter(Product.slug == sample_slug).first()
    assert prod.name == "Real Tanya Noorani Masterpiece"
    assert prod.fabric == "Pure Banarasi Katan"
    assert len(prod.variants) == 1
    assert prod.variants[0].stock == 4
    assert len(prod.images) == 1
    assert prod.images[0].public_id == "royal_libas/client_master"

    db2.close()
    print(f"  -> PASSED: Routine seed safely preserved all dummy items, collections, coupons, stock, and media. ({time.time() - t0:.2f}s)", flush=True)


# =========================================================================
# TEST 5: Safe Maintenance Reset (Dry-Run by Default & Protection)
# =========================================================================
def test_5_safe_reset_dry_run_and_protection():
    t0 = time.time()
    print("\n[TEST 5] Testing safe maintenance reset (dry-run default & client data protection)...", flush=True)
    db = TestingSessionLocal()

    # 1. Candidate 1: Client customized product (has active stock and custom name)
    # MUST BE PROTECTED!
    client_product = db.query(Product).filter(Product.slug == "noorani-chanderi-kurti-set").first()
    assert client_product is not None

    # 2. Candidate 2: Pure unedited sample product with outdated sample placeholder fields
    # Modify placeholder fields on an unedited sample product to simulate outdated sample copy
    unedited_slug = "chandni-raat-modal-silk-co-ord"
    unedited_prod = db.query(Product).filter(Product.slug == unedited_slug).first()
    assert unedited_prod is not None
    unedited_prod.fabric = "Outdated Sample Fabric"
    unedited_prod.description = "Outdated Sample Description"
    db.commit()

    # 3. Execute reset in DRY-RUN mode (confirm=False)
    dry_result = reset_sample_products(db, confirm=False)
    assert dry_result["status"] == "dry_run"
    assert dry_result["reset"] == 0
    assert dry_result["eligible"] >= 1
    assert dry_result["protected"] >= 1, "Client product was not protected!"

    # Verify NO changes happened in DB after dry run
    db.refresh(unedited_prod)
    assert unedited_prod.fabric == "Outdated Sample Fabric"
    assert unedited_prod.description == "Outdated Sample Description"

    # 4. Execute reset with confirmation (confirm=True)
    exec_result = reset_sample_products(db, confirm=True)
    assert exec_result["status"] == "executed"
    assert exec_result["reset"] >= 1

    # Verify unedited product was updated
    db.refresh(unedited_prod)
    assert unedited_prod.fabric == "Lustrous Modal Satin Silk Blend with Natural Shell Buttons"

    # Verify protected client product was NEVER modified!
    db.refresh(client_product)
    assert client_product.name == "Real Tanya Noorani Masterpiece"
    assert client_product.fabric == "Pure Banarasi Katan"
    assert client_product.variants[0].stock == 4

    db.close()
    print(f"  -> PASSED: Reset dry-run changes nothing, client data strictly protected, confirmation required. ({time.time() - t0:.2f}s)", flush=True)


# =========================================================================
# TEST 6: Storefront & Editorial Media Deletion Protection
# =========================================================================
def test_6_media_deletion_protection(admin_token: str):
    t0 = time.time()
    print("\n[TEST 6] Testing editorial & storefront media deletion protection...", flush=True)
    headers = {"Authorization": f"Bearer {admin_token}"}
    db = TestingSessionLocal()

    # Create MediaAsset
    asset = MediaAsset(
        filename="hero_editorial_festive.jpg",
        public_id="royal_libas/hero_editorial_festive",
        url="https://res.cloudinary.com/royallibas/image/upload/hero_editorial_festive.jpg",
        file_size=307200,
        mime_type="image/jpeg",
        folder="royal_libas",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    asset_id = asset.id

    # Attach to StoreSetting hero image and category card
    setting = db.query(StoreSetting).first()
    setting.hero_image_url = asset.url
    setting.category_two_pieces_image = asset.url
    db.commit()
    db.close()

    # 1. Attempt delete without force -> 409 Conflict
    del_res = client.delete(f"/admin/media/{asset_id}", headers=headers)
    assert del_res.status_code == 409, f"Expected 409 for in-use asset, got {del_res.status_code}"
    detail = del_res.json()["detail"]
    assert "Homepage Hero Banner" in detail
    assert "Category Card: Two Pieces" in detail

    # 2. Attempt delete with force=True -> succeeds and unlinks references
    with patch("app.routers.admin.delete_from_cloudinary") as mock_del:
        mock_del.return_value = {"result": "ok", "success": True}
        force_res = client.delete(f"/admin/media/{asset_id}?force=true", headers=headers)
        assert force_res.status_code == 200

    db2 = TestingSessionLocal()
    setting_after = db2.query(StoreSetting).first()
    assert setting_after.hero_image_url is None
    assert setting_after.category_two_pieces_image is None
    db2.close()

    print(f"  -> PASSED: In-use media asset blocked with 409 Conflict, force-delete clears references. ({time.time() - t0:.2f}s)", flush=True)


# =========================================================================
# TEST 7: Gallery Photo Removal Safety (Cloudinary Asset Untouched)
# =========================================================================
def test_7_gallery_removal_does_not_delete_cloudinary(admin_token: str):
    t0 = time.time()
    print("\n[TEST 7] Testing that removing a photo from product gallery does NOT delete Cloudinary asset...", flush=True)
    headers = {"Authorization": f"Bearer {admin_token}"}
    db = TestingSessionLocal()

    # 1. Create a MediaAsset in library
    media_asset = MediaAsset(
        filename="chanderi_gallery_shot.jpg",
        public_id="royal_libas/chanderi_gallery_shot",
        url="https://res.cloudinary.com/royallibas/image/upload/chanderi_gallery_shot.jpg",
        file_size=204800,
        mime_type="image/jpeg",
        folder="royal_libas/products",
    )
    db.add(media_asset)

    # 2. Create a Product with this image in its gallery
    prod = Product(
        name="Gallery Test Anarkali",
        slug="gallery-test-anarkali",
        category="SUITS",
        status="PUBLISHED",
        is_active=True,
    )
    db.add(prod)
    db.flush()

    p_img = ProductImage(
        product_id=prod.id,
        url=media_asset.url,
        public_id=media_asset.public_id,
        sort_order=1,
        alt_text="Front Shot",
    )
    db.add(p_img)
    db.commit()
    prod_id = prod.id
    asset_id = media_asset.id
    db.close()

    # 3. Admin updates the product to remove the photo from the gallery (images=[])
    with patch("app.services.cloudinary_service.delete_from_cloudinary") as mock_del_cloud:
        patch_res = client.patch(
            f"/admin/products/{prod_id}",
            headers=headers,
            json={"images": []},
        )
        assert patch_res.status_code == 200

        # Assert delete_from_cloudinary was NEVER called!
        assert mock_del_cloud.call_count == 0, "delete_from_cloudinary was improperly called when removing gallery photo!"

    # 4. Verify in DB: Product has 0 gallery images, but MediaAsset is 100% intact!
    db2 = TestingSessionLocal()
    check_prod = db2.query(Product).filter(Product.id == prod_id).first()
    assert len(check_prod.images) == 0, "Gallery image was not detached from product!"

    check_asset = db2.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    assert check_asset is not None, "MediaAsset was deleted when gallery photo was detached!"
    assert check_asset.public_id == "royal_libas/chanderi_gallery_shot"
    db2.close()

    print(f"  -> PASSED: Gallery detachment leaves Cloudinary asset and media library 100% intact. ({time.time() - t0:.2f}s)", flush=True)


# =========================================================================
# RUN ALL VERIFICATIONS
# =========================================================================
def run_all_safeguard_tests():
    start_total = time.time()
    print("=" * 80, flush=True)
    print("ROYAL LIBAS - SAFEGUARD, DRAFT LOCKDOWN & SEED INTEGRITY TEST SUITE", flush=True)
    print("=" * 80, flush=True)

    # Verify real database is protected
    real_db = backend_dir / "royal_libas.db"
    real_db_mtime_before = real_db.stat().st_mtime if real_db.exists() else None

    # Patch Cloudinary SDK globally so NO external network requests are made
    with patch("cloudinary.uploader.destroy") as mock_destroy, \
         patch("cloudinary.uploader.upload") as mock_upload, \
         patch("app.services.cloudinary_service.is_cloudinary_configured", return_value=True):

        mock_destroy.return_value = {"result": "ok"}
        mock_upload.return_value = {
            "public_id": "royal_libas/mocked_test_asset",
            "secure_url": "https://res.cloudinary.com/royallibas/image/upload/mocked_test_asset.jpg",
            "resource_type": "image",
            "format": "jpg",
            "width": 1000,
            "height": 1400,
            "duration": None,
            "file_size": 150000,
        }

        admin_token = reset_test_database()

        try:
            test_1_anonymous_lockdown(admin_token)
            test_2_admin_draft_management(admin_token)
            test_3_zero_and_negative_stock(admin_token)
            test_4_routine_seed_preservation()
            test_5_safe_reset_dry_run_and_protection()
            test_6_media_deletion_protection(admin_token)
            test_7_gallery_removal_does_not_delete_cloudinary(admin_token)

            print("\n" + "=" * 80, flush=True)
            print(f"ALL 7 TARGETED SAFEGUARD TESTS PASSED WITH 100% SUCCESS in {time.time() - start_total:.2f}s!", flush=True)
            print("=" * 80, flush=True)

        finally:
            test_engine.dispose()
            if TEST_DB_FILE.exists():
                try:
                    TEST_DB_FILE.unlink()
                except Exception:
                    pass

    # Verify real database was NOT touched
    if real_db.exists() and real_db_mtime_before is not None:
        real_db_mtime_after = real_db.stat().st_mtime
        assert real_db_mtime_before == real_db_mtime_after, "SECURITY ALERT: Real royal_libas.db was touched during testing!"
        print("[ISOLATION VERIFIED] Real project database 'royal_libas.db' was NOT touched (mtime untouched).", flush=True)


if __name__ == "__main__":
    run_all_safeguard_tests()
