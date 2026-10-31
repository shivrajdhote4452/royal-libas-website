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

    def test_11_image_and_video_sharing_same_public_id_coexist_in_gallery_and_persist_after_reload(self):
        """11. Image and video sharing same public_id coexist in gallery and persist after reload."""
        db = self.TestingSessionLocal()
        try:
            shared_pub_id = "royal_libas/products/shared_twin_id"
            twin_image = MediaAsset(
                filename="twin.jpg",
                display_name="Twin Photo",
                public_id=shared_pub_id,
                url="http://res.cloudinary.com/test/image/upload/v1/royal_libas/products/twin.jpg",
                secure_url="https://res.cloudinary.com/test/image/upload/v1/royal_libas/products/twin.jpg",
                resource_type="image",
                format="jpg",
                width=1000,
                height=1200,
                file_size=250000,
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            twin_video = MediaAsset(
                filename="twin.mp4",
                display_name="Twin Video",
                public_id=shared_pub_id,
                url="http://res.cloudinary.com/test/video/upload/v1/royal_libas/products/twin.mp4",
                secure_url="https://res.cloudinary.com/test/video/upload/v1/royal_libas/products/twin.mp4",
                resource_type="video",
                format="mp4",
                width=1080,
                height=1920,
                duration=12.0,
                file_size=3500000,
                mime_type="video/mp4",
                folder="royal_libas/products",
            )
            db.add_all([twin_image, twin_video])
            db.commit()
            db.refresh(twin_image)
            db.refresh(twin_video)
            img_id = twin_image.id
            vid_id = twin_video.id
        finally:
            db.close()

        # 1. Create product with BOTH twin image and twin video
        create_payload = {
            "name": "Twin Asset Suit",
            "slug": "twin-asset-suit",
            "category": "SUIT SET",
            "status": "DRAFT",
            "variants": [{"size": "M", "selling_price": 3499.00, "mrp": 4499.00, "stock": 5}],
            "images": [
                {"media_asset_id": img_id, "url": twin_image.url, "sort_order": 1, "alt_text": "Twin Image"},
                {"media_asset_id": vid_id, "url": twin_video.url, "sort_order": 2, "alt_text": "Twin Video"},
            ],
        }
        res_create = self.client.post("/admin/products", json=create_payload, headers=self.owner_headers)
        self.assertEqual(res_create.status_code, 201)
        created_data = res_create.json()
        self.assertEqual(len(created_data["images"]), 2)
        prod_id = created_data["id"]

        # Check first image is image, second is video
        self.assertEqual(created_data["images"][0]["resource_type"], "image")
        self.assertEqual(created_data["images"][0]["public_id"], shared_pub_id)
        self.assertEqual(created_data["images"][0]["media_asset_id"], img_id)

        self.assertEqual(created_data["images"][1]["resource_type"], "video")
        self.assertEqual(created_data["images"][1]["public_id"], shared_pub_id)
        self.assertEqual(created_data["images"][1]["media_asset_id"], vid_id)

        # 2. Reload from GET /products/{prod_id} with admin credentials
        res_get = self.client.get(f"/products/{prod_id}", headers=self.owner_headers)
        self.assertEqual(res_get.status_code, 200)
        get_data = res_get.json()
        self.assertEqual(len(get_data["images"]), 2)
        self.assertEqual(get_data["images"][0]["media_asset_id"], img_id)
        self.assertEqual(get_data["images"][0]["resource_type"], "image")
        self.assertEqual(get_data["images"][1]["media_asset_id"], vid_id)
        self.assertEqual(get_data["images"][1]["resource_type"], "video")

        # 3. Save reloaded gallery back (simulating admin saving unchanged product)
        # Verify deduplication does NOT collapse the image and video
        res_update = self.client.patch(
            f"/admin/products/{prod_id}",
            json={
                "images": [
                    {
                        "media_asset_id": get_data["images"][0]["media_asset_id"],
                        "url": get_data["images"][0]["url"],
                        "sort_order": 1,
                        "alt_text": get_data["images"][0]["alt_text"],
                    },
                    {
                        "media_asset_id": get_data["images"][1]["media_asset_id"],
                        "url": get_data["images"][1]["url"],
                        "sort_order": 2,
                        "alt_text": get_data["images"][1]["alt_text"],
                    },
                ]
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res_update.status_code, 200)
        updated_data = res_update.json()
        self.assertEqual(len(updated_data["images"]), 2)
        self.assertEqual(updated_data["images"][0]["resource_type"], "image")
        self.assertEqual(updated_data["images"][1]["resource_type"], "video")

    def test_12_legacy_fallback_matches_public_id_and_resource_type(self):
        """12. Legacy payload without media_asset_id matches on (public_id, resource_type)."""
        db = self.TestingSessionLocal()
        try:
            combo_pub_id = "royal_libas/products/combo_legacy"
            c_img = MediaAsset(
                filename="c_img.jpg",
                display_name="Legacy Combo Image",
                public_id=combo_pub_id,
                url="http://res.cloudinary.com/test/image/upload/v1/royal_libas/products/c_img.jpg",
                secure_url="https://res.cloudinary.com/test/image/upload/v1/royal_libas/products/c_img.jpg",
                resource_type="image",
                format="jpg",
                file_size=200000,
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            c_vid = MediaAsset(
                filename="c_vid.mp4",
                display_name="Legacy Combo Video",
                public_id=combo_pub_id,
                url="http://res.cloudinary.com/test/video/upload/v1/royal_libas/products/c_vid.mp4",
                secure_url="https://res.cloudinary.com/test/video/upload/v1/royal_libas/products/c_vid.mp4",
                resource_type="video",
                format="mp4",
                duration=10.0,
                file_size=2000000,
                mime_type="video/mp4",
                folder="royal_libas/products",
            )
            db.add_all([c_img, c_vid])
            db.commit()
            db.refresh(c_img)
            db.refresh(c_vid)
            img_id = c_img.id
            vid_id = c_vid.id
        finally:
            db.close()

        # Submit without media_asset_id, relying on public_id + url/extension matching
        payload = {
            "name": "Legacy Combo Suit",
            "slug": "legacy-combo-suit",
            "category": "TWO PIECES",
            "status": "DRAFT",
            "variants": [{"size": "XL", "selling_price": 2899.00, "mrp": 3899.00, "stock": 3}],
            "images": [
                {"public_id": combo_pub_id, "url": c_img.url, "resource_type": "image", "sort_order": 1},
                {"public_id": combo_pub_id, "url": c_vid.url, "resource_type": "video", "sort_order": 2},
            ],
        }
        res = self.client.post("/admin/products", json=payload, headers=self.owner_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(len(data["images"]), 2)
        # Resolved correctly to respective asset IDs
        self.assertEqual(data["images"][0]["media_asset_id"], img_id)
        self.assertEqual(data["images"][0]["resource_type"], "image")
        self.assertEqual(data["images"][1]["media_asset_id"], vid_id)
        self.assertEqual(data["images"][1]["resource_type"], "video")

    def test_13_migration_backfill_behavior(self):
        """13. Migration backfill links unambiguous matches and leaves ambiguous/unmatched null."""
        from app.migrations import run_migrations
        import sqlite3

        temp_mig_fd, temp_mig_path = tempfile.mkstemp(prefix="royal_libas_mig_test_", suffix=".db")
        os.close(temp_mig_fd)

        try:
            conn = sqlite3.connect(temp_mig_path)
            cur = conn.cursor()
            # Create schema without media_asset_id column in product_images
            cur.execute("""
                CREATE TABLE media_assets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    public_id VARCHAR(255),
                    resource_type VARCHAR(20),
                    url VARCHAR(500),
                    secure_url VARCHAR(500),
                    filename VARCHAR(255),
                    is_active BOOLEAN DEFAULT 1
                )
            """)
            cur.execute("""
                CREATE TABLE product_images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER,
                    url VARCHAR(500),
                    sort_order INTEGER,
                    public_id VARCHAR(255),
                    resource_type VARCHAR(20)
                )
            """)

            # 1. Unambiguous match: single image asset
            cur.execute("INSERT INTO media_assets (id, public_id, resource_type, url) VALUES (1, 'royal/unique_img', 'image', 'http://example.com/1.jpg')")
            cur.execute("INSERT INTO product_images (id, product_id, public_id, resource_type, url) VALUES (1, 10, 'royal/unique_img', 'image', 'http://example.com/1.jpg')")

            # 2. Shared public_id across different resource types (1 image, 1 video)
            cur.execute("INSERT INTO media_assets (id, public_id, resource_type, url) VALUES (2, 'royal/twin_item', 'image', 'http://example.com/twin.jpg')")
            cur.execute("INSERT INTO media_assets (id, public_id, resource_type, url) VALUES (3, 'royal/twin_item', 'video', 'http://example.com/twin.mp4')")
            cur.execute("INSERT INTO product_images (id, product_id, public_id, resource_type, url) VALUES (2, 10, 'royal/twin_item', 'image', 'http://example.com/twin.jpg')")
            cur.execute("INSERT INTO product_images (id, product_id, public_id, resource_type, url) VALUES (3, 10, 'royal/twin_item', 'video', 'http://example.com/twin.mp4')")

            # 3. Ambiguous match: duplicate assets with same public_id and same resource_type
            cur.execute("INSERT INTO media_assets (id, public_id, resource_type, url) VALUES (4, 'royal/dup_img', 'image', 'http://example.com/dup1.jpg')")
            cur.execute("INSERT INTO media_assets (id, public_id, resource_type, url) VALUES (5, 'royal/dup_img', 'image', 'http://example.com/dup2.jpg')")
            cur.execute("INSERT INTO product_images (id, product_id, public_id, resource_type, url) VALUES (4, 10, 'royal/dup_img', 'image', 'http://example.com/dup1.jpg')")

            # 4. Unmatched entry: no media asset in registry
            cur.execute("INSERT INTO product_images (id, product_id, public_id, resource_type, url) VALUES (5, 10, 'royal/ghost_img', 'image', 'http://example.com/ghost.jpg')")

            conn.commit()
            conn.close()

            # Now run migrations via SQLAlchemy engine
            mig_engine = create_engine(f"sqlite:///{temp_mig_path}")
            run_migrations(mig_engine)

            # Check results
            conn = sqlite3.connect(temp_mig_path)
            cur = conn.cursor()
            cur.execute("SELECT id, media_asset_id FROM product_images ORDER BY id")
            rows = dict(cur.fetchall())
            conn.close()
            mig_engine.dispose()

            # Row 1: unambiguous -> linked to asset 1
            self.assertEqual(rows[1], 1)
            # Row 2: image twin -> linked to asset 2
            self.assertEqual(rows[2], 2)
            # Row 3: video twin -> linked to asset 3
            self.assertEqual(rows[3], 3)
            # Row 4: ambiguous (count = 2) -> left NULL
            self.assertEqual(rows[4], None)
            self.assertIsNone(rows[4])
            # Row 5: unmatched -> left NULL
            self.assertIsNone(rows[5])

        finally:
            if os.path.exists(temp_mig_path):
                try:
                    os.remove(temp_mig_path)
                except Exception:
                    pass

    def test_14_ambiguous_legacy_save_does_not_replace_photos_or_collapse(self):
        """14. Ambiguous legacy entries resolve by unique URL match or preserve original URL without replacing photo."""
        db = self.TestingSessionLocal()
        try:
            shared_ambig_pub = "royal_libas/products/ambig_duo"
            asset_duo_a = MediaAsset(
                filename="duo_a.jpg",
                display_name="Duo A Photo",
                public_id=shared_ambig_pub,
                url="http://res.cloudinary.com/test/image/upload/v1/royal_libas/products/duo_a.jpg",
                secure_url="https://res.cloudinary.com/test/image/upload/v1/royal_libas/products/duo_a.jpg",
                resource_type="image",
                format="jpg",
                width=1000,
                height=1200,
                file_size=250000,
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            asset_duo_b = MediaAsset(
                filename="duo_b.jpg",
                display_name="Duo B Photo",
                public_id=shared_ambig_pub,
                url="http://res.cloudinary.com/test/image/upload/v1/royal_libas/products/duo_b.jpg",
                secure_url="https://res.cloudinary.com/test/image/upload/v1/royal_libas/products/duo_b.jpg",
                resource_type="image",
                format="jpg",
                width=1000,
                height=1200,
                file_size=260000,
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            db.add_all([asset_duo_a, asset_duo_b])
            db.commit()
            db.refresh(asset_duo_a)
            db.refresh(asset_duo_b)
            duo_a_id = asset_duo_a.id
            duo_b_id = asset_duo_b.id
        finally:
            db.close()

        # Legacy payload without media_asset_id:
        # Item 1 matches URL of Duo B (must resolve to Duo B, NEVER arbitrarily to Duo A)
        # Item 2 has a custom legacy URL (must NOT be replaced with Duo A or Duo B)
        custom_legacy_url = "https://custom-cdn.example.com/legacy_custom_photo.jpg"
        payload = {
            "name": "Ambiguous Legacy Test Suit",
            "slug": "ambiguous-legacy-test-suit",
            "category": "TWO PIECES",
            "status": "DRAFT",
            "variants": [{"size": "M", "selling_price": 2799.00, "mrp": 3799.00, "stock": 4}],
            "images": [
                {
                    "public_id": shared_ambig_pub,
                    "url": asset_duo_b.secure_url,
                    "resource_type": "image",
                    "sort_order": 1,
                    "alt_text": "Duo B Match",
                },
                {
                    "public_id": shared_ambig_pub,
                    "url": custom_legacy_url,
                    "resource_type": "image",
                    "sort_order": 2,
                    "alt_text": "Legacy Unmatched Photo",
                },
            ],
        }

        res_create = self.client.post("/admin/products", json=payload, headers=self.owner_headers)
        self.assertEqual(res_create.status_code, 201)
        created_data = res_create.json()
        self.assertEqual(len(created_data["images"]), 2)
        prod_id = created_data["id"]

        # Item 1: resolved by exact URL match to Duo B
        self.assertEqual(created_data["images"][0]["media_asset_id"], duo_b_id)
        self.assertEqual(created_data["images"][0]["url"], asset_duo_b.secure_url)

        # Item 2: unresolved ambiguity preserved original URL and left media_asset_id None
        self.assertIsNone(created_data["images"][1]["media_asset_id"])
        self.assertEqual(created_data["images"][1]["url"], custom_legacy_url)

        # Subsequent save / reload: verify both remain intact and are not collapsed
        res_patch = self.client.patch(
            f"/admin/products/{prod_id}",
            json={
                "images": [
                    {
                        "media_asset_id": created_data["images"][0]["media_asset_id"],
                        "url": created_data["images"][0]["url"],
                        "public_id": created_data["images"][0]["public_id"],
                        "resource_type": "image",
                        "sort_order": 1,
                    },
                    {
                        "media_asset_id": created_data["images"][1]["media_asset_id"],
                        "url": created_data["images"][1]["url"],
                        "public_id": created_data["images"][1]["public_id"],
                        "resource_type": "image",
                        "sort_order": 2,
                    },
                ]
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res_patch.status_code, 200)
        patched_data = res_patch.json()
        self.assertEqual(len(patched_data["images"]), 2)
        self.assertEqual(patched_data["images"][0]["media_asset_id"], duo_b_id)
        self.assertEqual(patched_data["images"][0]["url"], asset_duo_b.secure_url)
        self.assertIsNone(patched_data["images"][1]["media_asset_id"])
        self.assertEqual(patched_data["images"][1]["url"], custom_legacy_url)

    def test_15_migration_rerun_idempotency(self):
        """15. Re-running migrations is idempotent and preserves existing data."""
        from app.migrations import run_migrations

        temp_rerun_fd, temp_rerun_path = tempfile.mkstemp(prefix="royal_libas_rerun_test_", suffix=".db")
        os.close(temp_rerun_fd)

        try:
            mig_engine = create_engine(f"sqlite:///{temp_rerun_path}")
            # First migration run on empty DB
            Base.metadata.create_all(bind=mig_engine)
            run_migrations(mig_engine)

            # Insert test records
            Session = sessionmaker(bind=mig_engine)
            db = Session()
            prod = Product(name="Idempotent Test", slug="idempotent-test", category="TWO PIECES")
            db.add(prod)
            db.commit()
            db.refresh(prod)

            img = ProductImage(
                product_id=prod.id,
                url="https://example.com/test.jpg",
                sort_order=1,
                media_asset_id=None,
            )
            db.add(img)
            db.commit()
            db.close()

            # Second and third migration runs should succeed cleanly without errors
            run_migrations(mig_engine)
            run_migrations(mig_engine)

            # Verify records intact
            db = Session()
            p = db.query(Product).filter(Product.slug == "idempotent-test").first()
            self.assertIsNotNone(p)
            self.assertEqual(len(p.images), 1)
            self.assertEqual(p.images[0].url, "https://example.com/test.jpg")
            db.close()
            mig_engine.dispose()
        finally:
            if os.path.exists(temp_rerun_path):
                try:
                    os.remove(temp_rerun_path)
                except Exception:
                    pass

    def test_16_legacy_url_resolution_full_equality_and_no_prefix_matching(self):
        """16. Legacy URL matching enforces full URL equality, forbids prefix matching, and separates types."""
        db = self.TestingSessionLocal()
        try:
            # 1. Seed candidate assets
            asset_sample_webp = MediaAsset(
                filename="sample_dress.jpg.webp",
                display_name="Sample Dress WebP",
                public_id="royal_libas/products/sample_dress_webp",
                url="https://example.com/sample_dress.jpg.webp",
                secure_url="https://example.com/sample_dress.jpg.webp",
                resource_type="image",
                format="webp",
                mime_type="image/webp",
                folder="royal_libas/products",
            )
            asset_webp = MediaAsset(
                filename="dress.jpg.webp",
                display_name="Dress WebP",
                public_id="royal_libas/products/dress_webp",
                url="https://example.com/dress.jpg.webp",
                secure_url="https://example.com/dress.jpg.webp",
                resource_type="image",
                format="webp",
                mime_type="image/webp",
                folder="royal_libas/products",
            )
            asset_dress10 = MediaAsset(
                filename="dress10.jpg",
                display_name="Dress 10",
                public_id="royal_libas/products/dress10",
                url="https://example.com/dress10.jpg",
                secure_url="https://example.com/dress10.jpg",
                resource_type="image",
                format="jpg",
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            asset_exact = MediaAsset(
                filename="exact_target.jpg",
                display_name="Exact Target",
                public_id="royal_libas/products/exact_target",
                url="http://example.com/exact_target.jpg",
                secure_url="https://example.com/exact_target.jpg",
                resource_type="image",
                format="jpg",
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            asset_query = MediaAsset(
                filename="query_target.jpg",
                display_name="Query Target",
                public_id="royal_libas/products/query_target",
                url="http://example.com/query_target.jpg",
                secure_url="https://example.com/query_target.jpg",
                resource_type="image",
                format="jpg",
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            asset_dup1 = MediaAsset(
                filename="dup_target1.jpg",
                display_name="Dup Target 1",
                public_id="royal_libas/products/dup_target1",
                url="http://example.com/dup_target.jpg",
                secure_url="https://example.com/dup_target.jpg",
                resource_type="image",
                format="jpg",
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            asset_dup2 = MediaAsset(
                filename="dup_target2.jpg",
                display_name="Dup Target 2",
                public_id="royal_libas/products/dup_target2",
                url="http://example.com/dup_target.jpg",
                secure_url="https://example.com/dup_target.jpg",
                resource_type="image",
                format="jpg",
                mime_type="image/jpeg",
                folder="royal_libas/products",
            )
            asset_video = MediaAsset(
                filename="motion_clip.mp4",
                display_name="Motion Clip",
                public_id="royal_libas/products/motion_clip",
                url="http://example.com/motion_clip.mp4",
                secure_url="https://example.com/motion_clip.mp4",
                resource_type="video",
                format="mp4",
                duration=8.5,
                mime_type="video/mp4",
                folder="royal_libas/products",
            )
            db.add_all([asset_sample_webp, asset_webp, asset_dress10, asset_exact, asset_query, asset_dup1, asset_dup2, asset_video])
            db.commit()
            for a in [asset_sample_webp, asset_webp, asset_dress10, asset_exact, asset_query, asset_dup1, asset_dup2, asset_video]:
                db.refresh(a)
            exact_id = asset_exact.id
            query_id = asset_query.id
            video_id = asset_video.id
        finally:
            db.close()

        with patch("cloudinary.uploader.upload") as mock_upload, \
             patch("cloudinary.uploader.destroy") as mock_destroy, \
             patch("cloudinary.api.delete_resources") as mock_del:

            # Create product with legacy URL entries
            payload = {
                "name": "URL Matching Regression Product",
                "slug": "url-matching-regression-product",
                "category": "TWO PIECES",
                "status": "DRAFT",
                "variants": [{"size": "M", "selling_price": 2999.00, "mrp": 3999.00, "stock": 5}],
                "images": [
                    # 1. dress.jpg must NOT match dress.jpg.webp
                    {
                        "url": "https://example.com/dress.jpg",
                        "sort_order": 1,
                        "resource_type": "image",
                    },
                    # 2. dress1 must NOT match dress10
                    {
                        "url": "https://example.com/dress1.jpg",
                        "sort_order": 2,
                        "resource_type": "image",
                    },
                    # 3. Exact secure_url match resolves correctly
                    {
                        "url": "https://example.com/exact_target.jpg",
                        "sort_order": 3,
                        "resource_type": "image",
                    },
                    # 4. Query normalization matches base URL without prefix match
                    {
                        "url": "https://example.com/query_target.jpg?v=version2",
                        "sort_order": 4,
                        "resource_type": "image",
                    },
                    # 5. Query normalization cannot match a prefix (sample_dress.jpg?v=1 does NOT match sample_dress.jpg.webp)
                    {
                        "url": "https://example.com/sample_dress.jpg?v=1",
                        "sort_order": 5,
                        "resource_type": "image",
                    },
                    # 6. Multiple matching records leave original URL unchanged and media_asset_id None
                    {
                        "url": "http://example.com/dup_target.jpg",
                        "sort_order": 6,
                        "resource_type": "image",
                    },
                    # 7. Video candidate matches video type
                    {
                        "url": "https://example.com/motion_clip.mp4",
                        "sort_order": 7,
                        "resource_type": "video",
                    },
                ],
            }

            resp = self.client.post("/admin/products", json=payload, headers=self.owner_headers)
            self.assertEqual(resp.status_code, 201)
            created_data = resp.json()
            images = created_data["images"]
            self.assertEqual(len(images), 7)
            prod_id = created_data["id"]

            # 1. dress.jpg -> NOT linked to dress.jpg.webp, original URL preserved
            self.assertIsNone(images[0]["media_asset_id"])
            self.assertEqual(images[0]["url"], "https://example.com/dress.jpg")

            # 2. dress1.jpg -> NOT linked to dress10.jpg, original URL preserved
            self.assertIsNone(images[1]["media_asset_id"])
            self.assertEqual(images[1]["url"], "https://example.com/dress1.jpg")

            # 3. Exact match -> linked to asset_exact
            self.assertEqual(images[2]["media_asset_id"], exact_id)
            self.assertEqual(images[2]["url"], asset_exact.secure_url)

            # 4. Query target with params -> linked to asset_query
            self.assertEqual(images[3]["media_asset_id"], query_id)
            self.assertEqual(images[3]["url"], asset_query.secure_url)

            # 5. Query prefix -> NOT linked to sample_dress.jpg.webp, original URL preserved
            self.assertIsNone(images[4]["media_asset_id"])
            self.assertEqual(images[4]["url"], "https://example.com/sample_dress.jpg?v=1")

            # 6. Multiple matches -> NOT linked, original URL preserved
            self.assertIsNone(images[5]["media_asset_id"])
            self.assertEqual(images[5]["url"], "http://example.com/dup_target.jpg")

            # 7. Video match -> linked to video_target
            self.assertEqual(images[6]["media_asset_id"], video_id)
            self.assertEqual(images[6]["resource_type"], "video")

            # Verify reload through fresh session via GET
            reload_res = self.client.get(f"/products/{prod_id}", headers=self.owner_headers)
            self.assertEqual(reload_res.status_code, 200)
            reloaded_images = reload_res.json()["images"]
            self.assertEqual(len(reloaded_images), 7)
            self.assertIsNone(reloaded_images[0]["media_asset_id"])
            self.assertEqual(reloaded_images[0]["url"], "https://example.com/dress.jpg")
            self.assertIsNone(reloaded_images[1]["media_asset_id"])
            self.assertEqual(reloaded_images[1]["url"], "https://example.com/dress1.jpg")
            self.assertEqual(reloaded_images[2]["media_asset_id"], exact_id)
            self.assertEqual(reloaded_images[3]["media_asset_id"], query_id)
            self.assertIsNone(reloaded_images[4]["media_asset_id"])
            self.assertEqual(reloaded_images[4]["url"], "https://example.com/sample_dress.jpg?v=1")
            self.assertIsNone(reloaded_images[5]["media_asset_id"])
            self.assertEqual(reloaded_images[5]["url"], "http://example.com/dup_target.jpg")
            self.assertEqual(reloaded_images[6]["media_asset_id"], video_id)

            # Re-saving unchanged reloaded gallery retains every image and link without duplicate collapse
            res_patch = self.client.patch(
                f"/admin/products/{prod_id}",
                json={
                    "images": [
                        {
                            "media_asset_id": img["media_asset_id"],
                            "url": img["url"],
                            "public_id": img.get("public_id"),
                            "resource_type": img.get("resource_type", "image"),
                            "sort_order": img["sort_order"],
                        }
                        for img in reloaded_images
                    ]
                },
                headers=self.owner_headers,
            )
            self.assertEqual(res_patch.status_code, 200)
            patched_images = res_patch.json()["images"]
            self.assertEqual(len(patched_images), 7)
            self.assertIsNone(patched_images[0]["media_asset_id"])
            self.assertEqual(patched_images[0]["url"], "https://example.com/dress.jpg")
            self.assertIsNone(patched_images[1]["media_asset_id"])
            self.assertEqual(patched_images[1]["url"], "https://example.com/dress1.jpg")
            self.assertEqual(patched_images[2]["media_asset_id"], exact_id)
            self.assertEqual(patched_images[3]["media_asset_id"], query_id)
            self.assertIsNone(patched_images[4]["media_asset_id"])
            self.assertEqual(patched_images[4]["url"], "https://example.com/sample_dress.jpg?v=1")
            self.assertIsNone(patched_images[5]["media_asset_id"])
            self.assertEqual(patched_images[5]["url"], "http://example.com/dup_target.jpg")
            self.assertEqual(patched_images[6]["media_asset_id"], video_id)

            # Ensure zero Cloudinary uploads, moves, or destroys were triggered
            mock_upload.assert_not_called()
            mock_destroy.assert_not_called()
            mock_del.assert_not_called()


if __name__ == "__main__":
    unittest.main()
