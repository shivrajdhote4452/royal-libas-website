import os
import sys
import unittest
from decimal import Decimal
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.database import SessionLocal
from app.models import Admin, Product, ProductVariant, ProductImage, StoreSetting
from app.auth import hash_password, create_access_token

client = TestClient(app)


class TestMediaCmsAndDraft(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            owner = db.query(Admin).filter(Admin.email == "owner@royallibas.com").first()
            if not owner:
                owner = Admin(
                    email="owner@royallibas.com",
                    name="Store Owner",
                    role="OWNER",
                    password_hash=hash_password("ownerpass123"),
                    is_active=True,
                )
                db.add(owner)
                db.commit()
                db.refresh(owner)
            cls.token = create_access_token(data={"sub": str(owner.id), "role": owner.role})
        finally:
            db.close()

    def test_01_slug_resilience(self):
        """Verify that visiting product by slug with spaces, dashes, or name resolves without 404."""
        resp1 = client.get("/products/subah-pintuck-everyday-co-ord")
        self.assertEqual(resp1.status_code, 200, f"Expected 200 for canonical slug, got {resp1.status_code}")
        data1 = resp1.json()
        self.assertEqual(data1["name"], "Subah Pintuck Everyday Co-ord")

        # Slug with spaces
        resp2 = client.get("/products/subah pintuck everyday co ord")
        self.assertEqual(resp2.status_code, 200, f"Expected 200 for slug with spaces, got {resp2.status_code}")
        data2 = resp2.json()
        self.assertEqual(data2["id"], data1["id"])

        # By ID
        resp3 = client.get(f"/products/{data1['id']}")
        self.assertEqual(resp3.status_code, 200, f"Expected 200 for numeric product id, got {resp3.status_code}")

    def test_02_store_cms_and_category_images(self):
        """Verify admin can update category images and hero, and public /settings reflects them."""
        headers = {"Authorization": f"Bearer {self.token}"}

        payload = {
            "hero_image_url": "https://res.cloudinary.com/demo/image/upload/sample_hero.jpg",
            "category_two_pieces_image": "https://res.cloudinary.com/demo/image/upload/sample_two_pieces.jpg",
            "category_suit_set_image": "https://res.cloudinary.com/demo/image/upload/sample_suit_set.jpg",
            "category_heavy_dress_image": "https://res.cloudinary.com/demo/image/upload/sample_heavy_dress.jpg",
            "festive_banner_image": "https://res.cloudinary.com/demo/image/upload/sample_festive_banner.jpg",
            "poster_occasion_image": "https://res.cloudinary.com/demo/image/upload/sample_occasion.jpg",
            "poster_everyday_image": "https://res.cloudinary.com/demo/image/upload/sample_everyday.jpg",
            "poster_story_image": "https://res.cloudinary.com/demo/image/upload/sample_story.jpg",
        }

        # Update via Admin
        resp_put = client.put("/admin/settings", json=payload, headers=headers)
        self.assertEqual(resp_put.status_code, 200, f"Expected 200 from PUT /admin/settings: {resp_put.text}")
        data_put = resp_put.json()
        self.assertEqual(data_put["hero_image_url"], payload["hero_image_url"])
        self.assertEqual(data_put["category_two_pieces_image"], payload["category_two_pieces_image"])
        self.assertEqual(data_put["category_suit_set_image"], payload["category_suit_set_image"])
        self.assertEqual(data_put["category_heavy_dress_image"], payload["category_heavy_dress_image"])
        self.assertEqual(data_put["festive_banner_image"], payload["festive_banner_image"])

        # Check Public /settings
        resp_pub = client.get("/settings")
        self.assertEqual(resp_pub.status_code, 200)
        pub_data = resp_pub.json()
        self.assertEqual(pub_data["hero_image_url"], payload["hero_image_url"])
        self.assertEqual(pub_data["category_two_pieces_image"], payload["category_two_pieces_image"])
        self.assertEqual(pub_data["category_suit_set_image"], payload["category_suit_set_image"])
        self.assertEqual(pub_data["category_heavy_dress_image"], payload["category_heavy_dress_image"])
        self.assertEqual(pub_data["festive_banner_image"], payload["festive_banner_image"])

    def test_03_create_product_default_draft_and_zero_stock(self):
        """Verify creating a product defaults to DRAFT status and respects 0 stock."""
        headers = {"Authorization": f"Bearer {self.token}"}

        create_payload = {
            "name": "Gulabi Zari Chanderi Set",
            "slug": "gulabi-zari-chanderi-set",
            "category": "TWO PIECES",
            "subcategory": "Co-ord Sets",
            "status": "DRAFT",
            "is_active": False,
            "description": "Authentic handloom chanderi silk with hand-beaten gold zari embroidery.",
            "variants": [
                {"size": "S", "selling_price": 3499.0, "mrp": 4999.0, "stock": 0},
                {"size": "M", "selling_price": 3499.0, "mrp": 4999.0, "stock": 4},
                {"size": "L", "selling_price": 3499.0, "mrp": 4999.0, "stock": 0},
            ],
            "images": [],
        }

        # Delete existing test product if present
        db = SessionLocal()
        try:
            existing = db.query(Product).filter(Product.slug == create_payload["slug"]).first()
            if existing:
                db.query(ProductVariant).filter(ProductVariant.product_id == existing.id).delete()
                db.delete(existing)
                db.commit()
        finally:
            db.close()

        resp = client.post("/admin/products", json=create_payload, headers=headers)
        self.assertEqual(resp.status_code, 201, f"Expected 201: {resp.text}")
        prod_data = resp.json()

        self.assertEqual(prod_data["status"], "DRAFT")
        self.assertFalse(prod_data["is_active"])

        # Check variant stock: size S should have exactly 0 stock, M should have 4, L should have 0
        variants = prod_data["variants"]
        s_variant = next(v for v in variants if v["size"] == "S")
        m_variant = next(v for v in variants if v["size"] == "M")
        l_variant = next(v for v in variants if v["size"] == "L")

        self.assertEqual(s_variant["stock"], 0, f"Expected stock 0 for size S, got {s_variant['stock']}")
        self.assertEqual(m_variant["stock"], 4, f"Expected stock 4 for size M, got {m_variant['stock']}")
        self.assertEqual(l_variant["stock"], 0, f"Expected stock 0 for size L, got {l_variant['stock']}")

        # Public list should NOT include DRAFT products
        pub_list = client.get("/products").json()
        self.assertFalse(any(p["slug"] == create_payload["slug"] for p in pub_list), "Draft product must not be in public list")

    def test_04_no_old_sample_photos_in_catalog(self):
        """Verify that all old mock sample /images/products/ photo associations were removed."""
        db = SessionLocal()
        try:
            sample_count = db.query(ProductImage).filter(ProductImage.url.like("/images/products/%")).count()
            self.assertEqual(sample_count, 0, f"Expected 0 old sample photo associations, found {sample_count}")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
