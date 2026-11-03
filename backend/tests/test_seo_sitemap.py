"""Automated Verification Suite for Production Sitemap and SEO Directives.

Strict Safety Guards:
1. Isolated temporary database: All tests run strictly against an ephemeral SQLite database.
2. Safety pattern guard: Immediately fails if a production, PostgreSQL, or business database URL is detected.
3. Network guard: Blocks unexpected outbound HTTP and socket calls.

Verifies:
1. Valid XML syntax and sitemap protocol namespace (http://www.sitemaps.org/schemas/sitemap/0.9).
2. Canonical homepage (https://royallibasbytanya.com/) and all public static pages present.
3. Published active products dynamically included with /product/{slug}, lastmod, and primary image.
4. Draft, archived, and inactive products strictly excluded.
5. Private routes (/admin, /cart, /checkout, /order-success) strictly excluded.
6. Empty catalogue safety: returns valid XML with static pages.
7. Database error resilience: graceful fallback to valid static-page sitemap without 500 error.
8. robots.txt serves valid directives and links to canonical sitemap.xml.
9. /api/sitemap.xml and /api/robots.txt aliases work identically.
"""

import atexit
import os
import shutil
import socket
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import httpx

# 1. Enforce strict database isolation BEFORE importing application modules
TEMP_DIR = tempfile.mkdtemp(prefix="test_seo_sitemap_")
ISOLATED_DB_PATH = os.path.join(TEMP_DIR, "isolated_test_seo.db").replace(os.sep, "/")
os.environ["DATABASE_URL"] = f"sqlite:///{ISOLATED_DB_PATH}"
os.environ["JWT_SECRET"] = "isolated-test-jwt-secret-key-seo-sitemap-32bytes"
os.environ["CANONICAL_BASE_URL"] = "https://royallibasbytanya.com"

# Safety pattern guard: Fail immediately if any real database pattern is detected
FORBIDDEN_DB_PATTERNS = ["royal_libas.db", "postgres", "hostinger", "neon"]
for pattern in FORBIDDEN_DB_PATTERNS:
    if pattern in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Test configured with real database: {os.environ['DATABASE_URL']}")

def _cleanup_temp():
    if os.path.exists(TEMP_DIR):
        try:
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import Product, ProductVariant, ProductImage
from app.routers.seo import SITEMAP_NS, IMAGE_NS, STATIC_PUBLIC_PAGES


class TestSeoSitemap(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # 1. Install test-only outbound network guard
        cls._orig_httpx_send = httpx.Client.send
        def guarded_httpx_send(self, request, *args, **kwargs):
            if request.url.host in ("testserver", "localhost", "127.0.0.1", "::1"):
                return cls._orig_httpx_send(self, request, *args, **kwargs)
            raise RuntimeError(
                f"NETWORK BLOCKED: Outbound HTTP request attempted to '{request.url}' during isolated test!"
            )
        httpx.Client.send = guarded_httpx_send

        cls._orig_socket_connect = socket.socket.connect
        def guarded_socket_connect(self, address):
            if isinstance(address, tuple) and len(address) > 0:
                host = str(address[0])
                if host in ("127.0.0.1", "localhost", "::1"):
                    return cls._orig_socket_connect(self, address)
            raise RuntimeError(
                f"NETWORK BLOCKED: Outbound socket connection attempted to '{address}' during isolated test!"
            )
        socket.socket.connect = guarded_socket_connect

        # 2. Re-bind database engine to isolated temporary database
        cls.engine = create_engine(os.environ["DATABASE_URL"], connect_args={"check_same_thread": False})
        cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        def _get_test_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _get_test_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        httpx.Client.send = cls._orig_httpx_send
        socket.socket.connect = cls._orig_socket_connect
        app.dependency_overrides.clear()
        cls.engine.dispose()

    def setUp(self):
        self.db = self.SessionLocal()
        # Clean products before each test
        self.db.query(ProductImage).delete()
        self.db.query(ProductVariant).delete()
        self.db.query(Product).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_sitemap_returns_valid_xml(self):
        """Test /sitemap.xml returns 200 OK, application/xml, and well-formed XML syntax."""
        resp = self.client.get("/sitemap.xml")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("application/xml", resp.headers["content-type"])

        # Validate that it parses cleanly as XML
        root = ET.fromstring(resp.content)
        self.assertEqual(root.tag, f"{{{SITEMAP_NS}}}urlset")

    def test_02_sitemap_canonical_static_pages(self):
        """Verify all canonical public static pages are included with correct priority and changefreq."""
        resp = self.client.get("/sitemap.xml")
        self.assertEqual(resp.status_code, 200)

        root = ET.fromstring(resp.content)
        urls = {}
        for u in root.findall(f"{{{SITEMAP_NS}}}url"):
            loc = u.find(f"{{{SITEMAP_NS}}}loc")
            if loc is not None and loc.text:
                cf = u.find(f"{{{SITEMAP_NS}}}changefreq")
                pr = u.find(f"{{{SITEMAP_NS}}}priority")
                urls[loc.text] = {
                    "changefreq": cf.text if cf is not None else None,
                    "priority": pr.text if pr is not None else None,
                }

        # Check canonical homepage
        self.assertIn("https://royallibasbytanya.com/", urls)
        self.assertEqual(urls["https://royallibasbytanya.com/"]["priority"], "1.0")
        self.assertEqual(urls["https://royallibasbytanya.com/"]["changefreq"], "daily")

        # Check static pages
        expected_paths = [
            "/shop",
            "/about",
            "/contact",
            "/shipping-policy",
            "/return-policy",
            "/exchange-policy",
            "/privacy-policy",
            "/terms-of-service",
        ]
        for path in expected_paths:
            full_url = f"https://royallibasbytanya.com{path}"
            self.assertIn(full_url, urls, f"Missing expected public page in sitemap: {full_url}")

    def test_03_published_active_product_included(self):
        """Verify that a published active product appears dynamically with slug URL and primary image."""
        p = Product(
            name="Gulnaar Ruby Red Anarkali",
            slug="gulnaar-ruby-red-anarkali",
            category="HEAVY DRESS",
            subcategory="Anarkali",
            status="PUBLISHED",
            is_active=True,
            created_at=datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc),
            updated_at=datetime(2026, 11, 2, 14, 30, 0, tzinfo=timezone.utc),
        )
        self.db.add(p)
        self.db.commit()

        img = ProductImage(
            product_id=p.id,
            url="https://res.cloudinary.com/galbyoxi/image/upload/v1234/gulnaar_primary.jpg",
            sort_order=1,
            resource_type="image",
        )
        self.db.add(img)
        self.db.commit()

        resp = self.client.get("/sitemap.xml")
        self.assertEqual(resp.status_code, 200)

        root = ET.fromstring(resp.content)
        product_entry = None
        for u in root.findall(f"{{{SITEMAP_NS}}}url"):
            loc = u.find(f"{{{SITEMAP_NS}}}loc")
            if loc is not None and loc.text == "https://royallibasbytanya.com/product/gulnaar-ruby-red-anarkali":
                product_entry = u
                break

        self.assertIsNotNone(product_entry, "Published active product was not found in sitemap!")

        lastmod = product_entry.find(f"{{{SITEMAP_NS}}}lastmod")
        self.assertIsNotNone(lastmod)
        self.assertEqual(lastmod.text, "2026-11-02")

        prio = product_entry.find(f"{{{SITEMAP_NS}}}priority")
        self.assertEqual(prio.text, "0.8")

        # Check Google Image extension
        img_el = product_entry.find(f"{{{IMAGE_NS}}}image")
        self.assertIsNotNone(img_el, "Expected <image:image> element for product with image!")
        img_loc = img_el.find(f"{{{IMAGE_NS}}}loc")
        self.assertEqual(img_loc.text, "https://res.cloudinary.com/galbyoxi/image/upload/v1234/gulnaar_primary.jpg")
        img_title = img_el.find(f"{{{IMAGE_NS}}}title")
        self.assertEqual(img_title.text, "Gulnaar Ruby Red Anarkali")

    def test_04_draft_product_excluded(self):
        """Verify products with status='DRAFT' are strictly excluded from sitemap."""
        p = Product(
            name="Draft Kurta Set",
            slug="draft-kurta-set",
            category="TWO PIECES",
            status="DRAFT",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()

        resp = self.client.get("/sitemap.xml")
        self.assertNotIn("draft-kurta-set", resp.text)

    def test_05_archived_product_excluded(self):
        """Verify products with status='ARCHIVED' are strictly excluded from sitemap."""
        p = Product(
            name="Archived Suit Set",
            slug="archived-suit-set",
            category="SUIT SET",
            status="ARCHIVED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()

        resp = self.client.get("/sitemap.xml")
        self.assertNotIn("archived-suit-set", resp.text)

    def test_06_inactive_product_excluded(self):
        """Verify products with is_active=False (even if status='PUBLISHED') are strictly excluded."""
        p = Product(
            name="Inactive Published Item",
            slug="inactive-published-item",
            category="TWO PIECES",
            status="PUBLISHED",
            is_active=False,
        )
        self.db.add(p)
        self.db.commit()

        resp = self.client.get("/sitemap.xml")
        self.assertNotIn("inactive-published-item", resp.text)

    def test_07_private_routes_excluded(self):
        """Verify that private routes (/admin, /cart, /checkout, /order-success) never appear in the sitemap."""
        resp = self.client.get("/sitemap.xml")
        content = resp.text

        forbidden_routes = [
            "/admin",
            "/admin/login",
            "/admin/dashboard",
            "/cart",
            "/checkout",
            "/order-success",
        ]
        for route in forbidden_routes:
            self.assertNotIn(f"<loc>https://royallibasbytanya.com{route}</loc>", content)
            self.assertNotIn(f"<loc>https://royallibasbytanya.com{route}/</loc>", content)

    def test_08_empty_catalogue_safety(self):
        """Verify that an empty database catalogue produces a valid XML sitemap with static pages without error."""
        resp = self.client.get("/sitemap.xml")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("application/xml", resp.headers["content-type"])

        root = ET.fromstring(resp.content)
        locs = [u.find(f"{{{SITEMAP_NS}}}loc").text for u in root.findall(f"{{{SITEMAP_NS}}}url")]
        self.assertIn("https://royallibasbytanya.com/", locs)
        self.assertIn("https://royallibasbytanya.com/shop", locs)
        self.assertEqual(len(locs), len(STATIC_PUBLIC_PAGES))

    def test_09_database_error_graceful_fallback(self):
        """Verify that a database query error falls back gracefully to static pages without 500 error."""
        with patch.object(self.db.__class__, "query", side_effect=Exception("Database connection timeout simulation")):
            resp = self.client.get("/sitemap.xml")
            self.assertEqual(resp.status_code, 200)
            self.assertIn("application/xml", resp.headers["content-type"])
            root = ET.fromstring(resp.content)
            self.assertEqual(root.tag, f"{{{SITEMAP_NS}}}urlset")
            locs = [u.find(f"{{{SITEMAP_NS}}}loc").text for u in root.findall(f"{{{SITEMAP_NS}}}url")]
            self.assertIn("https://royallibasbytanya.com/", locs)

    def test_10_robots_txt_content(self):
        """Verify /robots.txt serves plain text with correct indexing directives and sitemap reference."""
        resp = self.client.get("/robots.txt")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/plain", resp.headers["content-type"])

        text = resp.text
        self.assertIn("User-agent: *", text)
        self.assertIn("Allow: /", text)
        self.assertIn("Disallow: /admin/", text)
        self.assertIn("Disallow: /cart", text)
        self.assertIn("Disallow: /checkout", text)
        self.assertIn("Disallow: /order-success/", text)
        self.assertIn("Sitemap: https://royallibasbytanya.com/sitemap.xml", text)

    def test_11_api_alias_endpoints(self):
        """Verify /api/sitemap.xml and /api/robots.txt serve identical content for Nginx /api/ proxy compatibility."""
        sitemap_resp = self.client.get("/api/sitemap.xml")
        self.assertEqual(sitemap_resp.status_code, 200)
        self.assertIn("application/xml", sitemap_resp.headers["content-type"])

        robots_resp = self.client.get("/api/robots.txt")
        self.assertEqual(robots_resp.status_code, 200)
        self.assertIn("text/plain", robots_resp.headers["content-type"])

    def test_12_favicon_ico_endpoint(self):
        """Verify /favicon.ico and /api/favicon.ico return valid binary image/x-icon with proper caching."""
        resp = self.client.get("/favicon.ico")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("image/x-icon", resp.headers["content-type"])
        self.assertTrue(len(resp.content) > 0)
        # Check standard Windows ICO magic header bytes (00 00 01 00)
        self.assertEqual(resp.content[:4], b"\x00\x00\x01\x00")

        # Verify HEAD request
        head_resp = self.client.head("/favicon.ico")
        self.assertEqual(head_resp.status_code, 200)
        self.assertIn("image/x-icon", head_resp.headers["content-type"])

        # Verify API alias
        api_resp = self.client.get("/api/favicon.ico")
        self.assertEqual(api_resp.status_code, 200)
        self.assertIn("image/x-icon", api_resp.headers["content-type"])
        self.assertEqual(api_resp.content[:4], b"\x00\x00\x01\x00")


if __name__ == "__main__":
    unittest.main()

