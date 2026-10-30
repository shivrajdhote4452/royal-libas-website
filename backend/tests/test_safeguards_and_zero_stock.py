#!/usr/bin/env python3
"""Automated Test Suite for Royal Libas Safeguards & Zero Stock Protection.

Tests:
1. Zero stock persistence when adding or editing a product variant (stock=0 preserved, is_available=False).
2. Validation rejection for invalid/negative stock.
3. Draft product protection: public list and direct URL return 404, admin token allows preview.
4. Safe seed script: routine seeding never overwrites existing products, stocks, or image records.
5. Media library deletion protection: 409 Conflict when in use on products or storefront, clean unlinking on force-delete.
"""

import os
import sys
from decimal import Decimal
from pathlib import Path

# Setup paths
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import Admin, Product, ProductVariant, ProductImage, StoreSetting, MediaAsset
from app.auth import hash_password, create_access_token
from seed import seed_database

# Isolated test database
TEST_DB_FILE = backend_dir / "test_safeguards.db"
TEST_DB_URL = f"sqlite:///{TEST_DB_FILE.as_posix()}"

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


def setup_test_db():
    """Reset isolated test database and create an admin."""
    if TEST_DB_FILE.exists():
        try:
            TEST_DB_FILE.unlink()
        except Exception:
            pass

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


def test_zero_stock_variant_persistence(admin_token: str):
    """Verify that adding or updating a size variant with stock=0 saves exactly 0 and marks is_available=False."""
    print("\n[TEST 1] Testing zero stock persistence on variants...")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a published product
    create_res = client.post(
        "/admin/products",
        headers=headers,
        json={
            "name": "Zero Stock Test Kurti",
            "slug": "zero-stock-test-kurti",
            "category": "TWO PIECES",
            "subcategory": "Co-ord Sets",
            "status": "PUBLISHED",
            "is_active": True,
            "variants": [
                {"size": "M", "selling_price": "2499.00", "mrp": "3499.00", "stock": 5}
            ],
        },
    )
    assert create_res.status_code in (200, 201), f"Create failed: {create_res.text}"
    prod_data = create_res.json()
    product_id = prod_data["id"]

    # 2. Add a new size 'XS' with stock = 0
    add_variant_res = client.post(
        f"/admin/products/{product_id}/variants",
        headers=headers,
        json={
            "size": "XS",
            "selling_price": "2499.00",
            "mrp": "3499.00",
            "stock": 0,
        },
    )
    assert add_variant_res.status_code == 201, f"Add variant failed: {add_variant_res.text}"
    v_data = add_variant_res.json()
    assert v_data["size"] == "XS"
    assert v_data["stock"] == 0, f"Expected stock 0, got {v_data['stock']}"
    assert v_data["is_available"] is False, "Stock 0 variant must be marked unavailable"

    # 3. Update existing size 'M' to stock = 0
    m_variant_id = prod_data["variants"][0]["id"]
    update_res = client.patch(
        f"/admin/variants/{m_variant_id}",
        headers=headers,
        json={"stock": 0},
    )
    assert update_res.status_code == 200, f"Update variant failed: {update_res.text}"
    up_data = update_res.json()
    assert up_data["stock"] == 0
    assert up_data["is_available"] is False

    print("  -> PASSED: Variant stock=0 is preserved exactly and unavailable for purchase.")


def test_negative_stock_validation(admin_token: str):
    """Verify that negative stock values are rejected with 422 Unprocessable Entity."""
    print("\n[TEST 2] Testing negative stock validation...")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Try adding variant with stock = -1
    res = client.post(
        "/admin/products/1/variants",
        headers=headers,
        json={
            "size": "XXL",
            "selling_price": "2999.00",
            "mrp": "3999.00",
            "stock": -1,
        },
    )
    assert res.status_code in (400, 422), f"Expected validation error, got {res.status_code}: {res.text}"

    # 2. Try updating variant with stock = -5
    up_res = client.patch(
        "/admin/variants/1",
        headers=headers,
        json={"stock": -5},
    )
    assert up_res.status_code in (400, 422), f"Expected validation error, got {up_res.status_code}: {up_res.text}"

    print("  -> PASSED: Negative stock rejected with validation error.")


def test_draft_product_protection(admin_token: str):
    """Verify that Draft and Inactive products are completely hidden from public (404), while accessible to Admin."""
    print("\n[TEST 3] Testing draft product protection...")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a Draft product
    create_res = client.post(
        "/admin/products",
        headers=headers,
        json={
            "name": "Secret Royal Bridal Anarkali",
            "slug": "secret-royal-bridal-anarkali",
            "category": "HEAVY DRESS",
            "subcategory": "Designer Wear",
            "status": "DRAFT",
            "is_active": False,
            "variants": [
                {"size": "Free Size", "selling_price": "9999.00", "mrp": "14999.00", "stock": 1}
            ],
        },
    )
    assert create_res.status_code in (200, 201), f"Create draft failed: {create_res.text}"
    draft_slug = "secret-royal-bridal-anarkali"

    # 2. Public product list: Must NOT include draft product
    pub_list = client.get("/products")
    assert pub_list.status_code == 200
    listed_slugs = [p["slug"] for p in pub_list.json()]
    assert draft_slug not in listed_slugs, "Draft product was leaked in public product listing!"

    # 3. Public direct URL: Must return 404 Not Found
    pub_detail = client.get(f"/products/{draft_slug}")
    assert pub_detail.status_code == 404, f"Public visitor saw draft product! Status: {pub_detail.status_code}"

    # 4. Admin preview: Must return 200 OK with details
    admin_detail = client.get(f"/products/{draft_slug}", headers=headers)
    assert admin_detail.status_code == 200, f"Admin was blocked from previewing draft: {admin_detail.text}"
    assert admin_detail.json()["name"] == "Secret Royal Bridal Anarkali"

    # 5. Publish the product -> now public can view it
    pub_update = client.patch(
        f"/admin/products/{create_res.json()['id']}",
        headers=headers,
        json={"status": "PUBLISHED"},
    )
    assert pub_update.status_code == 200

    pub_detail_after = client.get(f"/products/{draft_slug}")
    assert pub_detail_after.status_code == 200, "Published product should be visible publicly"

    # 6. Unpublish back to DRAFT -> immediately hidden with 404
    client.patch(
        f"/admin/products/{create_res.json()['id']}",
        headers=headers,
        json={"status": "DRAFT"},
    )
    pub_detail_hidden = client.get(f"/products/{draft_slug}")
    assert pub_detail_hidden.status_code == 404, "Draft product must return 404 after unpublishing"

    print("  -> PASSED: Draft products return 404 to customers, full preview available to authenticated admin.")


def test_safe_seed_script_preserves_data():
    """Verify that routine seed.py execution preserves existing products, variant stock, and image records."""
    print("\n[TEST 4] Testing safe routine seed script execution...")

    # 1. Run initial seed
    seed_database(session_factory=TestingSessionLocal)

    # 2. Pick a seeded product and customize it (change price, set stock to 0, attach a custom image)
    db = TestingSessionLocal()
    target_slug = "noorani-chanderi-kurti-set"
    product = db.query(Product).filter(Product.slug == target_slug).first()
    assert product is not None

    custom_name = "Tanya Custom Noorani Exclusive"
    product.name = custom_name
    product.fabric = "Custom Pure Mulberry Silk"

    # Modify variant stock
    for v in product.variants:
        v.selling_price = Decimal("12999.00")
        v.stock = 0  # Set stock to 0

    # Attach a Cloudinary image record
    custom_img = ProductImage(
        product_id=product.id,
        url="https://res.cloudinary.com/royallibas/image/upload/v1/custom_client_photo.jpg",
        public_id="royal_libas/custom_client_photo",
        sort_order=1,
        alt_text="Real Client Shot",
    )
    db.add(custom_img)
    db.commit()
    db.close()

    # 3. Run routine seed again (second time)
    seed_database(session_factory=TestingSessionLocal)

    # 4. Verify that ALL customizations and images were preserved and NOT overwritten
    db2 = TestingSessionLocal()
    checked_product = db2.query(Product).filter(Product.slug == target_slug).first()
    assert checked_product.name == custom_name, f"Seed overwrote custom name! Got '{checked_product.name}'"
    assert checked_product.fabric == "Custom Pure Mulberry Silk", "Seed overwrote custom fabric!"

    for v in checked_product.variants:
        assert v.selling_price == Decimal("12999.00"), f"Seed overwrote custom price! Got {v.selling_price}"
        assert v.stock == 0, f"Seed overwrote stock 0! Got {v.stock}"

    # Verify image record was NOT deleted
    images = db2.query(ProductImage).filter(ProductImage.product_id == checked_product.id).all()
    assert len(images) == 1, f"Expected 1 image preserved, got {len(images)}"
    assert images[0].public_id == "royal_libas/custom_client_photo"
    db2.close()

    print("  -> PASSED: Routine seed 100% preserved existing product name, custom fabric, stock=0, and photos.")


def test_media_deletion_protection(admin_token: str):
    """Verify that deleting a media asset in active editorial or product use returns 409 Conflict, and force delete cleans references."""
    print("\n[TEST 5] Testing media deletion protection across storefront sections...")
    headers = {"Authorization": f"Bearer {admin_token}"}
    db = TestingSessionLocal()

    # 1. Create a MediaAsset in DB
    asset = MediaAsset(
        filename="festive_banner_test.jpg",
        public_id="royal_libas/festive_banner_test",
        url="https://res.cloudinary.com/royallibas/image/upload/festive_banner_test.jpg",
        file_size=204800,
        mime_type="image/jpeg",
        folder="royal_libas",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    asset_id = asset.id

    # 2. Attach it to StoreSetting category card and festive banner
    setting = db.query(StoreSetting).first()
    setting.category_two_pieces_image = asset.url
    setting.festive_banner_image = asset.url
    db.commit()
    db.close()

    # 3. Attempt simple DELETE /admin/media/{id} -> must be rejected with 409 Conflict
    del_res = client.delete(f"/admin/media/{asset_id}", headers=headers)
    assert del_res.status_code == 409, f"Expected 409 Conflict for in-use asset, got {del_res.status_code}: {del_res.text}"
    detail_msg = del_res.json()["detail"]
    assert "Category Card: Two Pieces" in detail_msg
    assert "Festive Announcement Banner" in detail_msg

    # 4. Attempt DELETE with force=True -> succeeds and clears StoreSetting references
    force_del = client.delete(f"/admin/media/{asset_id}?force=true", headers=headers)
    assert force_del.status_code == 200, f"Force delete failed: {force_del.text}"

    # Verify StoreSetting references are safely unlinked to None
    db3 = TestingSessionLocal()
    setting_after = db3.query(StoreSetting).first()
    assert setting_after.category_two_pieces_image is None, "Force delete did not clean up category_two_pieces_image"
    assert setting_after.festive_banner_image is None, "Force delete did not clean up festive_banner_image"
    db3.close()

    print("  -> PASSED: In-use media asset deletion blocked with 409 Conflict, force delete safely unlinks references.")


def run_all_tests():
    print("=" * 70)
    print("ROYAL LIBAS BY TANYA - SAFEGUARD & ZERO-STOCK VERIFICATION SUITE")
    print("=" * 70)

    admin_token = setup_test_db()
    try:
        test_zero_stock_variant_persistence(admin_token)
        test_negative_stock_validation(admin_token)
        test_draft_product_protection(admin_token)
        test_safe_seed_script_preserves_data()
        test_media_deletion_protection(admin_token)

        print("\n" + "=" * 70)
        print("ALL 5 SAFEGUARD & PROTECTION TESTS PASSED SUCCESSFULLY! (100% GREEN)")
        print("=" * 70)
    finally:
        if TEST_DB_FILE.exists():
            try:
                TEST_DB_FILE.unlink()
            except Exception:
                pass


if __name__ == "__main__":
    run_all_tests()
