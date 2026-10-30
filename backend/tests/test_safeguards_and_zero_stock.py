#!/usr/bin/env python3
"""Automated Test Suite for Royal Libas Safeguards, Draft Protection & Non-Destructive Seeding.

Required Checks:
1. Anonymous GET /products?include_inactive=true CANNOT expose draft, inactive, or archived products.
2. Authenticated admin can manage unpublished products (preview, list, publish, unpublish).
3. Seed execution preserves existing dummy-named products, collections, coupons, stock, and media.
4. Newly seeded sample products default to DRAFT and are NOT publicly visible to customers.
5. Zero stock persistence (stock=0, is_available=False), negative stock rejection (<0), and media deletion protection (409 on active use, clean unlinking on force-delete).
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
from app.models import Admin, Product, ProductVariant, ProductImage, Collection, Coupon, StoreSetting, MediaAsset
from app.auth import hash_password, create_access_token
from seed import seed_database

# Isolated test database
TEST_DB_FILE = backend_dir / "test_safeguards_comprehensive.db"
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


def reset_test_db():
    """Reset isolated test database and create initial admin user."""
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


def test_1_anonymous_cannot_expose_draft_or_inactive(admin_token: str):
    """Verify that unauthenticated customers calling GET /products?include_inactive=true CANNOT see draft or inactive products."""
    print("\n[TEST 1] Testing anonymous draft/inactive product lockdown...")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create 1 published product and 2 unpublished products (1 DRAFT, 1 INACTIVE)
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
            "name": "Secret Unpublished Draft",
            "slug": "secret-unpublished-draft",
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
            "name": "Deactivated Archived Dress",
            "slug": "deactivated-archived-dress",
            "category": "HEAVY DRESS",
            "status": "ARCHIVED",
            "is_active": False,
            "variants": [{"size": "Free Size", "selling_price": "7999.00", "mrp": "9999.00", "stock": 2}],
        },
    )

    # 1. Anonymous standard call: only published products
    res_normal = client.get("/products")
    assert res_normal.status_code == 200
    slugs_normal = [p["slug"] for p in res_normal.json()]
    assert slugs_normal == ["published-summer-kurti"]
    assert "secret-unpublished-draft" not in slugs_normal
    assert "deactivated-archived-dress" not in slugs_normal

    # 2. Anonymous attempt with include_inactive=true: MUST STILL return only published products!
    res_exploit = client.get("/products?include_inactive=true")
    assert res_exploit.status_code == 200
    slugs_exploit = [p["slug"] for p in res_exploit.json()]
    assert slugs_exploit == ["published-summer-kurti"], f"Draft or inactive products were leaked! Got {slugs_exploit}"
    assert "secret-unpublished-draft" not in slugs_exploit
    assert "deactivated-archived-dress" not in slugs_exploit

    # 3. Anonymous direct URL access to draft/archived: Must return 404 Not Found
    res_draft_url = client.get("/products/secret-unpublished-draft")
    assert res_draft_url.status_code == 404, f"Anonymous visitor could view draft direct URL: {res_draft_url.status_code}"

    res_archived_url = client.get("/products/deactivated-archived-dress")
    assert res_archived_url.status_code == 404, f"Anonymous visitor could view archived direct URL: {res_archived_url.status_code}"

    print("  -> PASSED: Anonymous GET /products?include_inactive=true strictly returns only active, published products.")


def test_2_authenticated_admin_can_manage_unpublished(admin_token: str):
    """Verify that authenticated admin can manage, preview, list, publish, and unpublish products."""
    print("\n[TEST 2] Testing authenticated admin management and preview flow...")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Admin can preview draft via GET /products/{slug} with Bearer token
    admin_preview = client.get("/products/secret-unpublished-draft", headers=headers)
    assert admin_preview.status_code == 200, f"Admin was blocked from preview: {admin_preview.text}"
    assert admin_preview.json()["name"] == "Secret Unpublished Draft"

    # 2. Admin can list all products including drafts via GET /admin/products
    admin_list = client.get("/admin/products", headers=headers)
    assert admin_list.status_code == 200
    admin_slugs = [p["slug"] for p in admin_list.json()]
    assert "secret-unpublished-draft" in admin_slugs
    assert "published-summer-kurti" in admin_slugs

    # 3. Admin can list via GET /products?include_inactive=true with admin token
    admin_inc_list = client.get("/products?include_inactive=true", headers=headers)
    assert admin_inc_list.status_code == 200
    admin_inc_slugs = [p["slug"] for p in admin_inc_list.json()]
    assert "secret-unpublished-draft" in admin_inc_slugs

    # 4. Admin publishes the draft product -> immediately visible to anonymous customers
    draft_id = next(p["id"] for p in admin_list.json() if p["slug"] == "secret-unpublished-draft")
    pub_res = client.patch(
        f"/admin/products/{draft_id}",
        headers=headers,
        json={"status": "PUBLISHED"},
    )
    assert pub_res.status_code == 200

    # Verify public customer can now see it
    customer_view = client.get("/products/secret-unpublished-draft")
    assert customer_view.status_code == 200

    # 5. Admin moves it back to DRAFT -> immediately hidden from customers with 404
    unpub_res = client.patch(
        f"/admin/products/{draft_id}",
        headers=headers,
        json={"status": "DRAFT"},
    )
    assert unpub_res.status_code == 200

    customer_view_hidden = client.get("/products/secret-unpublished-draft")
    assert customer_view_hidden.status_code == 404

    print("  -> PASSED: Admin preview, listing, publishing, and unpublishing work seamlessly.")


def test_3_safe_seed_preserves_dummy_products_and_business_data():
    """Verify that routine seed execution NEVER deletes dummy-named products or overwrites collections/coupons/stock/photos."""
    print("\n[TEST 3] Testing that routine seed preserves dummy products, collections, coupons, stock, and media...")
    db = TestingSessionLocal()

    # 1. Create a dummy-named product
    dummy_prod = Product(
        name="dummy-testing-silhouettes",
        slug="dummy-testing-silhouettes",
        category="TWO PIECES",
        status="DRAFT",
        is_active=False,
    )
    db.add(dummy_prod)

    # 2. Create custom collection with customized description
    custom_col = Collection(
        name="Festive Edit",
        slug="festive-edit",
        description="Custom Client Description: Exclusive Handcrafted Zari edit for festive 2026.",
    )
    db.add(custom_col)

    # 3. Create custom coupon with non-default values
    custom_coupon = Coupon(
        code="ROYAL10",
        type="PERCENT",
        value=Decimal("25.00"),  # Custom 25% discount
        min_order_value=Decimal("4999.00"),
        is_active=True,
    )
    db.add(custom_coupon)

    # 4. Create an existing product sharing a sample slug with customized stock, price, and Cloudinary photo
    sample_slug = "noorani-chanderi-kurti-set"
    client_product = Product(
        name="Real Tanya Noorani Heirloom",
        slug=sample_slug,
        fabric="100% Pure Katan Silk",
        category="Kurti Sets",
        status="PUBLISHED",
        is_active=True,
    )
    db.add(client_product)
    db.flush()

    client_variant = ProductVariant(
        product_id=client_product.id,
        size="M",
        colour="Maroon",
        sku="RL-NOOR-CUST-M",
        mrp=Decimal("8999.00"),
        selling_price=Decimal("6999.00"),
        stock=3,
    )
    db.add(client_variant)

    client_photo = ProductImage(
        product_id=client_product.id,
        url="https://res.cloudinary.com/royallibas/image/upload/v1234/tanya_real_photo.jpg",
        public_id="royal_libas/tanya_real_photo",
        sort_order=1,
        alt_text="Real Client Shot",
    )
    db.add(client_photo)

    db.commit()
    db.close()

    # 5. Execute routine seed script
    seed_database(session_factory=TestingSessionLocal)

    # 6. Verify that dummy product was NOT deleted!
    db2 = TestingSessionLocal()
    found_dummy = db2.query(Product).filter(Product.slug == "dummy-testing-silhouettes").first()
    assert found_dummy is not None, "Routine seed deleted product matching 'dummy'!"

    # 7. Verify collection description was NOT overwritten!
    col = db2.query(Collection).filter(Collection.slug == "festive-edit").first()
    assert col.description == "Custom Client Description: Exclusive Handcrafted Zari edit for festive 2026.", "Routine seed overwritten collection description!"

    # 8. Verify coupon value was NOT overwritten!
    cp = db2.query(Coupon).filter(Coupon.code == "ROYAL10").first()
    assert cp.value == Decimal("25.00"), f"Routine seed overwrote coupon value! Got {cp.value}"
    assert cp.min_order_value == Decimal("4999.00")

    # 9. Verify client product, variant stock, and Cloudinary photos were 100% preserved!
    prod = db2.query(Product).filter(Product.slug == sample_slug).first()
    assert prod.name == "Real Tanya Noorani Heirloom"
    assert prod.fabric == "100% Pure Katan Silk"
    assert len(prod.variants) == 1
    assert prod.variants[0].stock == 3
    assert prod.variants[0].selling_price == Decimal("6999.00")

    images = db2.query(ProductImage).filter(ProductImage.product_id == prod.id).all()
    assert len(images) == 1
    assert images[0].public_id == "royal_libas/tanya_real_photo"

    db2.close()
    print("  -> PASSED: Routine seed safely preserved dummy products, custom collections, coupons, stock, and media.")


def test_4_newly_seeded_sample_products_not_publicly_visible():
    """Verify that newly seeded sample products default to DRAFT, stock=0, and are completely invisible to customers."""
    print("\n[TEST 4] Testing that newly seeded sample products are invisible to customers...")

    # Run seed on fresh isolated database
    new_admin_token = reset_test_db()
    seed_database(session_factory=TestingSessionLocal)

    # 1. Anonymous customer lists products: must return 0 products
    pub_res = client.get("/products")
    assert pub_res.status_code == 200
    assert len(pub_res.json()) == 0, f"Expected 0 public products from fresh seed, got {len(pub_res.json())}"

    # 2. Anonymous customer with include_inactive=true: must still return 0 products
    exploit_res = client.get("/products?include_inactive=true")
    assert exploit_res.status_code == 200
    assert len(exploit_res.json()) == 0

    # 3. Anonymous direct URL access to seeded sample: must return 404
    direct_res = client.get("/products/noorani-chanderi-kurti-set")
    assert direct_res.status_code == 404

    # 4. In database: verify all 16 sample products are DRAFT, inactive, and have stock=0
    db = TestingSessionLocal()
    products = db.query(Product).all()
    assert len(products) == 16
    for p in products:
        assert p.status == "DRAFT"
        assert p.is_active is False
        assert len(p.images) == 0  # No demo images
        for v in p.variants:
            assert v.stock == 0
    db.close()

    print("  -> PASSED: Newly seeded sample products default to DRAFT, stock=0, and return 404 to customers.")
    return new_admin_token


def test_5_zero_stock_and_media_deletion_protection(admin_token: str):
    """Verify that zero-stock adding/editing and media deletion safeguards continue working."""
    print("\n[TEST 5] Testing zero stock and media deletion protection...")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a published product
    create_res = client.post(
        "/admin/products",
        headers=headers,
        json={
            "name": "Regression Test Suit",
            "slug": "regression-test-suit",
            "category": "SUIT SET",
            "status": "PUBLISHED",
            "is_active": True,
            "variants": [{"size": "S", "selling_price": "3999.00", "mrp": "4999.00", "stock": 5}],
        },
    )
    product_id = create_res.json()["id"]

    # 2. Add size with stock 0 -> must save exactly 0, is_available=False
    add_v_res = client.post(
        f"/admin/products/{product_id}/variants",
        headers=headers,
        json={"size": "M", "selling_price": "3999.00", "mrp": "4999.00", "stock": 0},
    )
    assert add_v_res.status_code == 201
    assert add_v_res.json()["stock"] == 0
    assert add_v_res.json()["is_available"] is False

    # 3. Add size with negative stock -> rejected
    neg_res = client.post(
        f"/admin/products/{product_id}/variants",
        headers=headers,
        json={"size": "L", "selling_price": "3999.00", "mrp": "4999.00", "stock": -2},
    )
    assert neg_res.status_code in (400, 422)

    # 4. Media deletion protection: Create media asset and attach to hero and category card
    db = TestingSessionLocal()
    asset = MediaAsset(
        filename="hero_campaign.jpg",
        public_id="royal_libas/hero_campaign",
        url="https://res.cloudinary.com/royallibas/image/upload/hero_campaign.jpg",
        file_size=102400,
        mime_type="image/jpeg",
        folder="royal_libas",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    asset_id = asset.id

    setting = db.query(StoreSetting).first()
    setting.hero_image_url = asset.url
    setting.category_suit_set_image = asset.url
    db.commit()
    db.close()

    # Attempt delete without force -> 409 Conflict
    del_res = client.delete(f"/admin/media/{asset_id}", headers=headers)
    assert del_res.status_code == 409
    assert "Homepage Hero Banner" in del_res.json()["detail"]
    assert "Category Card: Suit Set" in del_res.json()["detail"]

    # Delete with force=True -> cleans up references safely
    force_res = client.delete(f"/admin/media/{asset_id}?force=true", headers=headers)
    assert force_res.status_code == 200

    db2 = TestingSessionLocal()
    setting_after = db2.query(StoreSetting).first()
    assert setting_after.hero_image_url is None
    assert setting_after.category_suit_set_image is None
    db2.close()

    print("  -> PASSED: Stock=0 preserved, negative stock rejected, and media deletion protection verified.")


def run_all_comprehensive_tests():
    print("=" * 75)
    print("ROYAL LIBAS - COMPREHENSIVE SAFEGUARD & PROTECTION VERIFICATION")
    print("=" * 75)

    admin_token = reset_test_db()
    try:
        test_1_anonymous_cannot_expose_draft_or_inactive(admin_token)
        test_2_authenticated_admin_can_manage_unpublished(admin_token)
        test_3_safe_seed_preserves_dummy_products_and_business_data()
        token_after_fresh_db = test_4_newly_seeded_sample_products_not_publicly_visible()
        test_5_zero_stock_and_media_deletion_protection(token_after_fresh_db)

        print("\n" + "=" * 75)
        print("ALL 5 COMPREHENSIVE TESTS PASSED WITH 100% SUCCESS!")
        print("=" * 75)
    finally:
        test_engine.dispose()
        if TEST_DB_FILE.exists():
            try:
                TEST_DB_FILE.unlink()
            except Exception:
                pass


if __name__ == "__main__":
    run_all_comprehensive_tests()
