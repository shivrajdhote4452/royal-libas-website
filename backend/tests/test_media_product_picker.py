import os
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from decimal import Decimal

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.models import Admin, Product, ProductVariant, ProductImage, MediaAsset, MediaFolder, StoreSetting
from app.auth import hash_password, create_access_token
from app.main import app


class TestMediaProductPicker(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # 1. Create completely isolated test database to protect production/dev DB
        cls.temp_fd, cls.temp_db_path = tempfile.mkstemp(prefix="royal_libas_picker_test_", suffix=".db")
        os.close(cls.temp_fd)

        cls.engine = create_engine(
            f"sqlite:///{cls.temp_db_path}",
            connect_args={"check_same_thread": False},
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

        # 2. Seed test admin users
        db = cls.TestingSessionLocal()
        try:
            owner = Admin(
                email="owner_picker@royallibas.com",
                name="Store Owner",
                role="OWNER",
                password_hash=hash_password("ownerpass123"),
                is_active=True,
            )
            viewer = Admin(
                email="viewer_picker@royallibas.com",
                name="Store Viewer",
                role="VIEWER",
                password_hash=hash_password("viewerpass123"),
                is_active=True,
            )
            db.add_all([owner, viewer])
            db.commit()
            db.refresh(owner)
            db.refresh(viewer)

            cls.owner_token = create_access_token(data={"sub": str(owner.id), "role": owner.role})
            cls.viewer_token = create_access_token(data={"sub": str(viewer.id), "role": viewer.role})
            cls.owner_headers = {"Authorization": f"Bearer {cls.owner_token}"}
            cls.viewer_headers = {"Authorization": f"Bearer {cls.viewer_token}"}

            # 3. Seed boutique curated media assets
            cls.asset_photo1 = MediaAsset(
                filename="anarkali_front.jpg",
                display_name="Anarkali Front View",
                public_id="royal_libas/products/anarkali_front",
                url="http://res.cloudinary.com/test/image/upload/v1/royal_libas/products/anarkali_front.jpg",
                secure_url="https://res.cloudinary.com/test/image/upload/v1/royal_libas/products/anarkali_front.jpg",
                resource_type="image",
                format="jpg",
                width=1200,
                height=1500,
                file_size=350000,
                mime_type="image/jpeg",
                alt_text="Royal Indigo Silk Anarkali Set Front",
                folder="royal_libas/products",
            )
            cls.asset_photo2 = MediaAsset(
                filename="anarkali_detail.jpg",
                display_name="Anarkali Embroidery Detail",
                public_id="royal_libas/products/anarkali_detail",
                url="http://res.cloudinary.com/test/image/upload/v1/royal_libas/products/anarkali_detail.jpg",
                secure_url="https://res.cloudinary.com/test/image/upload/v1/royal_libas/products/anarkali_detail.jpg",
                resource_type="image",
                format="jpg",
                width=1200,
                height=1500,
                file_size=420000,
                mime_type="image/jpeg",
                alt_text="Embroidery Detail",
                folder="royal_libas/products",
            )
            cls.asset_video1 = MediaAsset(
                filename="anarkali_spin.mp4",
                display_name="Anarkali Fabric Motion Video",
                public_id="royal_libas/products/anarkali_spin",
                url="http://res.cloudinary.com/test/video/upload/v1/royal_libas/products/anarkali_spin.mp4",
                secure_url="https://res.cloudinary.com/test/video/upload/v1/royal_libas/products/anarkali_spin.mp4",
                resource_type="video",
                format="mp4",
                width=1080,
                height=1920,
                duration=14.5,
                file_size=4500000,
                mime_type="video/mp4",
                alt_text="Fabric Motion Video",
                folder="royal_libas/products",
            )
            db.add_all([cls.asset_photo1, cls.asset_photo2, cls.asset_video1])
            db.commit()
            db.refresh(cls.asset_photo1)
            db.refresh(cls.asset_photo2)
            db.refresh(cls.asset_video1)
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        if os.path.exists(cls.temp_db_path):
            try:
                os.remove(cls.temp_db_path)
            except Exception:
                pass

    def test_01_draft_product_creation_with_selected_library_photos_and_video(self):
        """1. Draft product creation with selected library photos & video."""
        payload = {
            "name": "Royal Indigo Zari Anarkali",
            "slug": "royal-indigo-zari-anarkali",
            "category": "HEAVY DRESS",
            "subcategory": "Designer Wear",
            "fabric": "Pure Silk",
            "status": "DRAFT",
            "is_active": False,
            "variants": [
                {"size": "M", "selling_price": 4999.00, "mrp": 6999.00, "stock": 5},
                {"size": "L", "selling_price": 4999.00, "mrp": 6999.00, "stock": 0},
            ],
            "images": [
                {
                    "media_asset_id": self.asset_photo1.id,
                    "url": self.asset_photo1.url,
                    "sort_order": 1,
                    "alt_text": "Cover Image",
                },
                {
                    "media_asset_id": self.asset_video1.id,
                    "url": self.asset_video1.url,
                    "sort_order": 2,
                    "alt_text": "Motion Video",
                },
            ],
        }

        resp = self.client.post("/admin/products", json=payload, headers=self.owner_headers)
        self.assertEqual(resp.status_code, 201, f"Expected 201 Created, got {resp.status_code}: {resp.text}")
        data = resp.json()

        # Status must be DRAFT and inactive
        self.assertEqual(data["status"], "DRAFT")
        self.assertFalse(data["is_active"])

        # Images must reflect authoritative MediaAsset registry values
        images = data["images"]
        self.assertEqual(len(images), 2)
        # First image: photo 1
        self.assertEqual(images[0]["url"], self.asset_photo1.secure_url)
        self.assertEqual(images[0]["public_id"], self.asset_photo1.public_id)
        self.assertEqual(images[0]["resource_type"], "image")
        self.assertEqual(images[0]["sort_order"], 1)

        # Second image: video 1
        self.assertEqual(images[1]["url"], self.asset_video1.secure_url)
        self.assertEqual(images[1]["public_id"], self.asset_video1.public_id)
        self.assertEqual(images[1]["resource_type"], "video")
        self.assertEqual(images[1]["duration"], 14.5)

    def test_02_zero_cloudinary_uploads_for_library_selections(self):
        """2. Zero Cloudinary uploads for library selections."""
        with patch("cloudinary.uploader.upload") as mock_upload:
            payload = {
                "name": "Chanderi Gold Kurta",
                "slug": "chanderi-gold-kurta",
                "category": "TWO PIECES",
                "subcategory": "Kurta Pant",
                "status": "DRAFT",
                "variants": [{"size": "Free Size", "selling_price": 2999.00, "mrp": 3999.00, "stock": 10}],
                "images": [
                    {
                        "media_asset_id": self.asset_photo2.id,
                        "url": self.asset_photo2.url,
                        "sort_order": 1,
                    }
                ],
            }
            resp = self.client.post("/admin/products", json=payload, headers=self.owner_headers)
            self.assertEqual(resp.status_code, 201)
            # Reusing library media MUST NEVER call Cloudinary upload
            mock_upload.assert_not_called()

    def test_03_form_cancellation_creates_no_product_and_deletes_no_media(self):
        """3. Form cancellation creates no product and deletes no media."""
        db = self.TestingSessionLocal()
        try:
            initial_asset_count = db.query(MediaAsset).count()
            # Owner browses and picks media, but cancels the modal / form without submitting
            cancelled_slug = "cancelled-draft-suit"
            existing = db.query(Product).filter(Product.slug == cancelled_slug).first()
            self.assertIsNone(existing)

            # Assets in media library must remain completely intact
            after_count = db.query(MediaAsset).count()
            self.assertEqual(initial_asset_count, after_count)
        finally:
            db.close()

    def test_04_failed_creation_retry_leaves_no_partial_duplicate_records(self):
        """4. Failed creation / retry leaves no partial/duplicate records."""
        db = self.TestingSessionLocal()
        test_slug = "retry-test-sharara"
        try:
            # Attempt 1: invalid payload where selling_price > mrp
            invalid_payload = {
                "name": "Retry Test Sharara",
                "slug": test_slug,
                "category": "HEAVY DRESS",
                "subcategory": "Sharara / Gharara",
                "status": "DRAFT",
                "variants": [{"size": "M", "selling_price": 8999.00, "mrp": 6999.00, "stock": 2}],
                "images": [
                    {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 1}
                ],
            }
            resp1 = self.client.post("/admin/products", json=invalid_payload, headers=self.owner_headers)
            self.assertEqual(resp1.status_code, 400)
            self.assertIn("cannot exceed MRP", resp1.text)

            # Ensure no partial product or orphan image was saved
            prod_check = db.query(Product).filter(Product.slug == test_slug).first()
            self.assertIsNone(prod_check)
            orphan_imgs = db.query(ProductImage).filter(ProductImage.public_id == self.asset_photo1.public_id).all()
            # None from this failed product
            self.assertTrue(all(img.product_id != getattr(prod_check, "id", -1) for img in orphan_imgs))

            # Attempt 2: retry with valid pricing
            valid_payload = {
                "name": "Retry Test Sharara",
                "slug": test_slug,
                "category": "HEAVY DRESS",
                "subcategory": "Sharara / Gharara",
                "status": "DRAFT",
                "variants": [{"size": "M", "selling_price": 5999.00, "mrp": 6999.00, "stock": 2}],
                "images": [
                    {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 1}
                ],
            }
            resp2 = self.client.post("/admin/products", json=valid_payload, headers=self.owner_headers)
            self.assertEqual(resp2.status_code, 201)
            prod_success = db.query(Product).filter(Product.slug == test_slug).first()
            self.assertIsNotNone(prod_success)
            self.assertEqual(len(prod_success.images), 1)
        finally:
            db.close()

    def test_05_append_media_to_existing_gallery_while_preserving_current_photos(self):
        """5. Append media to existing gallery while preserving current photos."""
        # 1. Create a product with photo 1
        p_res = self.client.post(
            "/admin/products",
            json={
                "name": "Multi Gallery Lehengas",
                "slug": "multi-gallery-lehengas",
                "category": "HEAVY DRESS",
                "subcategory": "Lehenga",
                "status": "DRAFT",
                "variants": [{"size": "Free Size", "selling_price": 9999.00, "mrp": 12999.00, "stock": 3}],
                "images": [
                    {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 1}
                ],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(p_res.status_code, 201)
        prod_id = p_res.json()["id"]

        # 2. Append photo 2 and video 1
        update_res = self.client.patch(
            f"/admin/products/{prod_id}",
            json={
                "images": [
                    {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 1},
                    {"media_asset_id": self.asset_photo2.id, "url": self.asset_photo2.url, "sort_order": 2},
                    {"media_asset_id": self.asset_video1.id, "url": self.asset_video1.url, "sort_order": 3},
                ]
            },
            headers=self.owner_headers,
        )
        self.assertEqual(update_res.status_code, 200)
        imgs = update_res.json()["images"]
        self.assertEqual(len(imgs), 3)
        self.assertEqual(imgs[0]["public_id"], self.asset_photo1.public_id)
        self.assertEqual(imgs[1]["public_id"], self.asset_photo2.public_id)
        self.assertEqual(imgs[2]["public_id"], self.asset_video1.public_id)

    def test_06_prevent_duplicate_gallery_entries(self):
        """6. Prevent duplicate gallery entries."""
        # 1. Submit duplicate images in admin_create_product
        payload = {
            "name": "Duplicate Prevent Kurta",
            "slug": "duplicate-prevent-kurta",
            "category": "TWO PIECES",
            "status": "DRAFT",
            "variants": [{"size": "L", "selling_price": 2499.00, "mrp": 3499.00, "stock": 4}],
            "images": [
                {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 1},
                {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 2}, # Duplicate!
                {"media_asset_id": self.asset_photo2.id, "url": self.asset_photo2.url, "sort_order": 3},
            ],
        }
        res = self.client.post("/admin/products", json=payload, headers=self.owner_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        # Photo 1 must be deduplicated
        self.assertEqual(len(data["images"]), 2)
        public_ids = [img["public_id"] for img in data["images"]]
        self.assertEqual(public_ids, [self.asset_photo1.public_id, self.asset_photo2.public_id])

        # 2. Test attach-media endpoint does not re-add existing asset
        attach_res = self.client.post(
            f"/admin/products/{data['id']}/attach-media",
            json=[self.asset_photo1.id, self.asset_photo2.id],
            headers=self.owner_headers,
        )
        self.assertEqual(attach_res.status_code, 200)
        # Count should still be 2
        self.assertEqual(len(attach_res.json()["images"]), 2)

    def test_07_cover_image_appears_first_sort_order_after_save_and_reload(self):
        """7. Cover image appears first (sort_order: 0/1) after saving and reloading."""
        # Create product with photo 1 at index 0 and photo 2 at index 1
        p_res = self.client.post(
            "/admin/products",
            json={
                "name": "Cover Test Suit",
                "slug": "cover-test-suit",
                "category": "SUIT SET",
                "subcategory": "Party Wear",
                "status": "PUBLISHED",
                "is_active": True,
                "variants": [{"size": "M", "selling_price": 3999.00, "mrp": 4999.00, "stock": 5}],
                "images": [
                    {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 1},
                    {"media_asset_id": self.asset_photo2.id, "url": self.asset_photo2.url, "sort_order": 2},
                ],
            },
            headers=self.owner_headers,
        )
        prod_id = p_res.json()["id"]

        # Reorder so photo 2 is Set as Cover (moved to sort_order: 1)
        reorder_res = self.client.patch(
            f"/admin/products/{prod_id}",
            json={
                "images": [
                    {"media_asset_id": self.asset_photo2.id, "url": self.asset_photo2.url, "sort_order": 1},
                    {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 2},
                ]
            },
            headers=self.owner_headers,
        )
        self.assertEqual(reorder_res.status_code, 200)

        # Reload from public storefront detail endpoint
        pub_res = self.client.get("/products/cover-test-suit")
        self.assertEqual(pub_res.status_code, 200)
        pub_data = pub_res.json()

        # Cover image (first image in product.images) must be photo 2
        self.assertEqual(pub_data["images"][0]["url"], self.asset_photo2.secure_url)
        self.assertEqual(pub_data["images"][0]["public_id"], self.asset_photo2.public_id)

        # Reload from public storefront catalog listing
        catalog_res = self.client.get("/products")
        self.assertEqual(catalog_res.status_code, 200)
        matched_item = next((p for p in catalog_res.json() if p["slug"] == "cover-test-suit"), None)
        self.assertIsNotNone(matched_item)
        self.assertEqual(matched_item["primary_image"], self.asset_photo2.secure_url)

    def test_08_reorder_and_remove_associations_without_deleting_cloudinary_files(self):
        """8. Reorder and remove associations without deleting Cloudinary files."""
        # Product with photo 1 and photo 2
        p_res = self.client.post(
            "/admin/products",
            json={
                "name": "Remove Test Velvet",
                "slug": "remove-test-velvet",
                "category": "SUIT SET",
                "status": "DRAFT",
                "variants": [{"size": "L", "selling_price": 4500.00, "mrp": 5500.00, "stock": 2}],
                "images": [
                    {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 1},
                    {"media_asset_id": self.asset_photo2.id, "url": self.asset_photo2.url, "sort_order": 2},
                ],
            },
            headers=self.owner_headers,
        )
        prod_id = p_res.json()["id"]

        with patch("cloudinary.uploader.destroy") as mock_destroy, \
             patch("cloudinary.api.delete_resources") as mock_del_resources:
            # Remove photo 2 from product gallery by saving gallery with only photo 1
            update_res = self.client.patch(
                f"/admin/products/{prod_id}",
                json={
                    "images": [
                        {"media_asset_id": self.asset_photo1.id, "url": self.asset_photo1.url, "sort_order": 1}
                    ]
                },
                headers=self.owner_headers,
            )
            self.assertEqual(update_res.status_code, 200)
            self.assertEqual(len(update_res.json()["images"]), 1)

            # Cloudinary deletion must NEVER be called when disassociating gallery images
            mock_destroy.assert_not_called()
            mock_del_resources.assert_not_called()

            # Underlying MediaAsset must still exist in DB
            db = self.TestingSessionLocal()
            try:
                asset_still_exists = db.query(MediaAsset).filter(MediaAsset.id == self.asset_photo2.id).first()
                self.assertIsNotNone(asset_still_exists)
            finally:
                db.close()

    def test_09_reject_missing_invalid_media_asset_id_and_unauthorized_roles(self):
        """9. Reject missing/invalid media_asset_id with 400 and reject unauthorized roles."""
        # 1. Invalid media asset id
        invalid_id_payload = {
            "name": "Invalid Asset Suit",
            "slug": "invalid-asset-suit",
            "category": "SUIT SET",
            "status": "DRAFT",
            "variants": [{"size": "S", "selling_price": 1999.00, "mrp": 2999.00, "stock": 1}],
            "images": [
                {"media_asset_id": 999999, "url": "https://example.com/fake.jpg", "sort_order": 1}
            ],
        }
        res_invalid = self.client.post("/admin/products", json=invalid_id_payload, headers=self.owner_headers)
        self.assertEqual(res_invalid.status_code, 400)
        self.assertIn("999999", res_invalid.text)

        # 2. Unauthorized role (VIEWER)
        res_viewer = self.client.post("/admin/products", json=invalid_id_payload, headers=self.viewer_headers)
        self.assertEqual(res_viewer.status_code, 403)

        # 3. Anonymous (no token)
        res_anon = self.client.post("/admin/products", json=invalid_id_payload)
        self.assertEqual(res_anon.status_code, 401)

    def test_10_media_usage_information_updates_correctly(self):
        """10. Media usage information (used_in_products) updates correctly."""
        # Create an asset not yet in any product
        db = self.TestingSessionLocal()
        try:
            solo_asset = MediaAsset(
                filename="solo_palazzo.jpg",
                display_name="Solo Palazzo",
                public_id="royal_libas/products/solo_palazzo",
                url="http://res.cloudinary.com/test/image/upload/v1/royal_libas/products/solo_palazzo.jpg",
                secure_url="https://res.cloudinary.com/test/image/upload/v1/royal_libas/products/solo_palazzo.jpg",
                resource_type="image",
                format="jpg",
                width=1000,
                height=1200,
                file_size=200000,
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            db.add(solo_asset)
            db.commit()
            db.refresh(solo_asset)
            solo_id = solo_asset.id
        finally:
            db.close()

        # Before attaching: query /admin/media
        res_before = self.client.get(f"/admin/media?search=solo_palazzo", headers=self.owner_headers)
        self.assertEqual(res_before.status_code, 200)
        items_before = res_before.json()
        self.assertEqual(len(items_before), 1)
        self.assertEqual(len(items_before[0]["used_in_products"]), 0)

        # Attach to a new product
        create_res = self.client.post(
            "/admin/products",
            json={
                "name": "Solo Palazzo Set",
                "slug": "solo-palazzo-set",
                "category": "HEAVY DRESS",
                "subcategory": "Palazzo Set",
                "status": "DRAFT",
                "variants": [{"size": "Free Size", "selling_price": 3299.00, "mrp": 4299.00, "stock": 8}],
                "images": [
                    {"media_asset_id": solo_id, "url": solo_asset.url, "sort_order": 1}
                ],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(create_res.status_code, 201)
        prod_id = create_res.json()["id"]

        # After attaching: query /admin/media
        res_after = self.client.get(f"/admin/media?search=solo_palazzo", headers=self.owner_headers)
        self.assertEqual(res_after.status_code, 200)
        items_after = res_after.json()
        self.assertEqual(len(items_after), 1)
        usages = items_after[0]["used_in_products"]
        self.assertEqual(len(usages), 1)
        self.assertEqual(usages[0]["id"], prod_id)
        self.assertEqual(usages[0]["name"], "Solo Palazzo Set")
        self.assertEqual(usages[0]["slug"], "solo-palazzo-set")


if __name__ == "__main__":
    unittest.main()
