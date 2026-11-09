"""Disposable PostgreSQL Concurrency & Row-Locking Test Suite.

Verifies:
1. Real PostgreSQL `with_for_update()` row-level locking behavior.
2. Concurrent admin stock updates against conflicting stock updates/orders.
3. Accurate detection and rejection of stale `expected_stock` (HTTP 409 Conflict).
4. Prevention of lost updates under concurrent access on PostgreSQL.
5. Atomic audit logging in PostgreSQL.

SAFETY GUARDS:
- Requires an isolated disposable PostgreSQL database (e.g. GitHub Actions PostgreSQL service container).
- NEVER connects to or tests against the VPS, production database, or existing business database.
- Strictly guards against non-localhost or production URLs.
- Skips safely if disposable PostgreSQL is not available in the local execution environment.
"""

import os
import sys
import unittest
import threading
from decimal import Decimal

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)


class TestPostgresConcurrency(unittest.TestCase):
    """PostgreSQL concurrency tests using an isolated disposable database."""

    @classmethod
    def setUpClass(cls):
        try:
            from tests.test_postgres_variant_migration import _find_or_create_disposable_postgres
            pg_url, cleanup_fn = _find_or_create_disposable_postgres()
        except Exception:
            pg_url = os.environ.get("TEST_POSTGRES_URL")
            cleanup_fn = None

        if not pg_url:
            raise unittest.SkipTest("Disposable PostgreSQL not configured and no local postgres binaries found.")

        cls.cleanup_fn = cleanup_fn

        # Strict Safety Guards
        lower_url = pg_url.lower()
        if not ("localhost" in lower_url or "127.0.0.1" in lower_url):
            raise unittest.SkipTest(f"Safety guard: TEST_POSTGRES_URL must be localhost/127.0.0.1, got: {lower_url}")

        for forbidden in ["hostinger", "neon", "prod", "vps", "royal_libas_prod"]:
            if forbidden in lower_url:
                raise unittest.SkipTest(f"Safety guard: Forbidden keyword '{forbidden}' detected in TEST_POSTGRES_URL.")

        # Ensure psycopg2 driver is used (psycopg2-binary is in requirements.txt)
        if pg_url.startswith("postgresql://") and not pg_url.startswith("postgresql+"):
            pg_url = pg_url.replace("postgresql://", "postgresql+psycopg2://", 1)

        try:
            from sqlalchemy import create_engine
            from sqlalchemy.orm import sessionmaker
            from fastapi.testclient import TestClient

            cls.engine = create_engine(pg_url, pool_pre_ping=True, connect_args={"client_encoding": "utf8"})
            # Test connection
            with cls.engine.connect() as conn:
                pass
            cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)

            # Create tables and migrations on disposable PostgreSQL
            import app.config as app_cfg
            import app.database as app_db
            cls._orig_config_url = getattr(app_cfg, "DATABASE_URL", None)
            cls._orig_db_engine = getattr(app_db, "engine", None)
            cls._orig_db_sessionlocal = getattr(app_db, "SessionLocal", None)

            app_cfg.DATABASE_URL = pg_url
            app_db.engine = cls.engine
            app_db.SessionLocal = cls.SessionLocal

            from app.database import Base, get_db
            Base.metadata.create_all(bind=cls.engine)
            from app.migrations import run_migrations
            run_migrations(cls.engine)

            import app.main as app_main
            from app.main import app
            app_main.engine = cls.engine

            def override_get_db():
                db = cls.SessionLocal()
                try:
                    yield db
                finally:
                    db.close()

            app.dependency_overrides[get_db] = override_get_db
            cls.app = app
            cls.client = TestClient(app)

            # Seed isolated test fixtures
            from app.models import Admin, Product, ProductVariant, StoreSetting, Order, OrderItem
            from app.auth import hash_password, create_access_token

            db = cls.SessionLocal()
            try:
                # Clean up any residual test records from prior runs
                db.query(OrderItem).delete()
                db.query(Order).delete()
                db.query(ProductVariant).delete()
                db.query(Product).delete()
                db.query(StoreSetting).delete()
                db.query(Admin).filter(Admin.email == "pg_owner@royallibas.com").delete()
                db.commit()

                # Seed store setting for valid order checkout
                setting = StoreSetting(
                    online_payment_enabled=True,
                    cod_enabled=True,
                    standard_cod_free_threshold=Decimal("1500.00"),
                    standard_shipping_fee=Decimal("99.00"),
                    express_shipping_fee=Decimal("199.00"),
                    announcement_text="COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE RS 1500",
                )
                db.add(setting)
                db.commit()

                owner = Admin(
                    email="pg_owner@royallibas.com",
                    name="PG Store Owner",
                    role="OWNER",
                    password_hash=hash_password("ownerpass123"),
                    is_active=True,
                )
                db.add(owner)
                db.commit()

                cls.owner_token = create_access_token({"sub": str(owner.id), "role": "OWNER"})
                cls.owner_headers = {"Authorization": f"Bearer {cls.owner_token}"}

                product = Product(
                    name="Postgres Silk Anarkali",
                    slug="postgres-silk-anarkali",
                    category="SUIT SET",
                    subcategory="Party Wear",
                    status="PUBLISHED",
                    is_active=True,
                )
                db.add(product)
                db.commit()

                variant = ProductVariant(
                    product_id=product.id,
                    size="M",
                    colour="Royal Navy",
                    sku="PG-PSA-M",
                    selling_price=Decimal("5999.00"),
                    stock=10,
                )
                db.add(variant)
                db.commit()

                cls.product_id = product.id
                cls.variant_id = variant.id
            finally:
                db.close()

        except Exception as e:
            cls._cleanup()
            print(f"PostgreSQL disposable test setup failed: {type(e).__name__}: {e}", file=sys.stderr)
            raise

    @classmethod
    def _cleanup(cls):
        try:
            if hasattr(cls, "app") and cls.app:
                from app.database import get_db
                cls.app.dependency_overrides.pop(get_db, None)
        except Exception:
            pass

        try:
            import app.database as app_db
            if hasattr(cls, "_orig_db_engine") and cls._orig_db_engine:
                app_db.engine = cls._orig_db_engine
            if hasattr(cls, "_orig_db_sessionlocal") and cls._orig_db_sessionlocal:
                app_db.SessionLocal = cls._orig_db_sessionlocal
        except Exception:
            pass

        try:
            import app.config as app_cfg
            if hasattr(cls, "_orig_config_url") and cls._orig_config_url:
                app_cfg.DATABASE_URL = cls._orig_config_url
        except Exception:
            pass

        try:
            if hasattr(cls, "engine") and cls.engine:
                from app.database import Base
                Base.metadata.drop_all(bind=cls.engine)
                cls.engine.dispose()
        except Exception:
            pass

    @classmethod
    def tearDownClass(cls):
        cls._cleanup()
        if hasattr(cls, "cleanup_fn") and cls.cleanup_fn:
            try:
                cls.cleanup_fn()
            except Exception:
                pass

    def test_postgres_concurrent_stock_adjustment_conflict_resolution(self):
        """Verify two concurrent sessions on PostgreSQL: one succeeds, one gets 409 Conflict.

        Both start from initial stock 10 with expected_stock=10.
        Due to with_for_update() row locking, one transaction serializes before the other.
        The first commits new_stock=15.
        The second wakes up, inspects live stock, sees 15 != expected 10, and raises 409 Conflict.
        No lost update occurs.
        """
        from fastapi.testclient import TestClient
        from app.models import ProductVariant, StockAdjustment

        # Ensure isolated clean state with stock=10
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 10
            db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).delete()
            db.commit()
        finally:
            db.close()

        results = []
        barrier = threading.Barrier(2)

        def session_a():
            c = TestClient(self.app)
            barrier.wait()
            res = c.post(
                "/admin/inventory/bulk-adjust",
                json={
                    "product_id": self.product_id,
                    "reason": "RESTOCK",
                    "items": [{"variant_id": self.variant_id, "new_stock": 15, "expected_stock": 10}],
                },
                headers=self.owner_headers,
            )
            results.append(("session_a", res.status_code, res.json()))

        def session_b():
            c = TestClient(self.app)
            barrier.wait()
            res = c.post(
                "/admin/inventory/bulk-adjust",
                json={
                    "product_id": self.product_id,
                    "reason": "RESTOCK",
                    "items": [{"variant_id": self.variant_id, "new_stock": 20, "expected_stock": 10}],
                },
                headers=self.owner_headers,
            )
            results.append(("session_b", res.status_code, res.json()))

        t1 = threading.Thread(target=session_a)
        t2 = threading.Thread(target=session_b)

        t1.start()
        t2.start()

        t1.join()
        t2.join()

        status_codes = sorted([r[1] for r in results])
        self.assertEqual(status_codes, [200, 409], f"Expected one 200 and one 409, got: {status_codes}")

        # Verify final stock in PostgreSQL matches the winner's new_stock
        winner = [r for r in results if r[1] == 200][0]
        expected_final_stock = 15 if winner[0] == "session_a" else 20

        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(v.stock, expected_final_stock, "PostgreSQL stock must match winner update without lost updates!")

            # Verify only 1 StockAdjustment audit entry was committed
            adjustments = db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).all()
            self.assertEqual(len(adjustments), 1, "Only the winning concurrent transaction should commit an audit entry!")
            self.assertEqual(adjustments[0].new_stock, expected_final_stock)
            self.assertEqual(adjustments[0].previous_stock, 10)
        finally:
            db.close()


    def test_postgres_concurrent_order_and_admin_stock_update(self):
        """Verify concurrency between customer order placement and admin stock update.

        Initial stock = 5.
        Thread A: Customer places order via POST /orders for 2 units (stock 5 -> 3).
        Thread B: Admin adjusts stock with expected_stock=5 (to 6 units).
        Because row-level locking (with_for_update) is held, one transaction serializes before the other.
        - If customer order commits first: variant stock becomes 3. Admin attempt detects stock changed (3 != 5) and raises 409 Conflict. The order is preserved.
        - If admin commits first: stock becomes 6. Customer order sees 6 >= 2, deducts 2 -> final stock is 4.
        In BOTH outcomes, customer order MUST succeed (201 Created), admin gets either 200 or 409, and final stock is either 3 or 4.
        """
        from fastapi.testclient import TestClient
        from app.models import ProductVariant, StockAdjustment, Order, OrderItem

        # Reset variant stock to 5 and clean previous orders/adjustments
        db = self.SessionLocal()
        try:
            db.query(OrderItem).delete()
            db.query(Order).delete()
            db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).delete()
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 5
            v.is_active = True
            db.commit()
        finally:
            db.close()

        results = []
        barrier = threading.Barrier(2)

        def customer_order():
            c = TestClient(self.app)
            barrier.wait()
            res = c.post(
                "/orders",
                json={
                    "customer_name": "Priya Sharma",
                    "phone": "9876543210",
                    "payment_method": "PREPAID",
                    "shipping_method": "STANDARD",
                    "address": {
                        "name": "Priya Sharma",
                        "phone": "9876543210",
                        "pincode": "400001",
                        "line1": "Flat 402, Royal Residency",
                        "line2": "Opposite Regal",
                        "city": "Mumbai",
                        "state": "Maharashtra",
                    },
                    "items": [{"variant_id": self.variant_id, "quantity": 2}],
                },
            )
            results.append(("order", res.status_code, res.json() if res.status_code < 500 else res.text))

        def admin_adjust():
            c = TestClient(self.app)
            barrier.wait()
            # Uses patch with expected_stock=5
            res = c.patch(
                f"/admin/variants/{self.variant_id}",
                json={
                    "stock": 6,
                    "expected_stock": 5,
                },
                headers=self.owner_headers,
            )
            results.append(("admin", res.status_code, res.json() if res.status_code < 500 else res.text))

        t1 = threading.Thread(target=customer_order)
        t2 = threading.Thread(target=admin_adjust)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        admin_res = [r for r in results if r[0] == "admin"][0]
        order_res = [r for r in results if r[0] == "order"][0]

        # Customer order MUST succeed with 201 Created (never 404, 400, or 500)
        self.assertEqual(order_res[1], 201, f"Customer order must return 201 Created: {order_res}")
        self.assertIn(admin_res[1], [200, 409], f"Admin update must return either 200 OK or 409 Conflict: {admin_res}")

        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            if admin_res[1] == 409:
                # Order won race, admin was rejected with 409 Conflict: stock is 5 - 2 = 3
                self.assertEqual(v.stock, 3, "Customer reservation of 2 units must be preserved!")
                adj_count = db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).count()
                self.assertEqual(adj_count, 0, "Failed admin adjustment must not leave audit entry!")
            else:
                # Admin won race (5 -> 6), then order placed (6 -> 4): stock is 4
                self.assertEqual(admin_res[1], 200)
                self.assertEqual(v.stock, 4, "Admin 6 minus order 2 units must equal 4!")
                adj_count = db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).count()
                self.assertEqual(adj_count, 1, "Successful admin adjustment must log exactly 1 audit entry!")

            # In no case can stock be negative or stale overwritten
            self.assertGreaterEqual(v.stock, 0)
        finally:
            db.close()

    def test_postgres_order_first_admin_gets_409(self):
        """Explicit lock outcome A: Customer order commits first, admin gets 409 Conflict."""
        from fastapi.testclient import TestClient
        from app.models import ProductVariant, StockAdjustment, Order, OrderItem

        db = self.SessionLocal()
        try:
            db.query(OrderItem).delete()
            db.query(Order).delete()
            db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).delete()
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 5
            v.is_active = True
            db.commit()
        finally:
            db.close()

        c = TestClient(self.app)

        # 1. Customer order for 2 units
        order_res = c.post(
            "/orders",
            json={
                "customer_name": "Kavita Rao",
                "phone": "9812345678",
                "payment_method": "PREPAID",
                "shipping_method": "STANDARD",
                "address": {
                    "name": "Kavita Rao",
                    "phone": "9812345678",
                    "pincode": "560001",
                    "line1": "Flat 101, Palm Grove",
                    "city": "Bengaluru",
                    "state": "Karnataka",
                },
                "items": [{"variant_id": self.variant_id, "quantity": 2}],
            },
        )
        self.assertEqual(order_res.status_code, 201, f"Expected 201 Created, got: {order_res.text}")
        order_data = order_res.json()
        self.assertIn("order_code", order_data)

        # 2. Admin attempts update expecting stock 5
        admin_res = c.patch(
            f"/admin/variants/{self.variant_id}",
            json={"stock": 6, "expected_stock": 5},
            headers=self.owner_headers,
        )
        self.assertEqual(admin_res.status_code, 409)
        self.assertIn("Stock conflict detected", admin_res.json().get("detail", ""))

        # 3. Verify final stock is 3 and no admin audit entry was committed
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(v.stock, 3)
            adj = db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).all()
            self.assertEqual(len(adj), 0)
        finally:
            db.close()

    def test_postgres_admin_first_order_succeeds(self):
        """Explicit lock outcome B: Admin commits first, customer order commits second."""
        from fastapi.testclient import TestClient
        from app.models import ProductVariant, StockAdjustment, Order, OrderItem

        db = self.SessionLocal()
        try:
            db.query(OrderItem).delete()
            db.query(Order).delete()
            db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).delete()
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 5
            v.is_active = True
            db.commit()
        finally:
            db.close()

        c = TestClient(self.app)

        # 1. Admin updates stock 5 -> 6 expecting 5
        admin_res = c.patch(
            f"/admin/variants/{self.variant_id}",
            json={"stock": 6, "expected_stock": 5},
            headers=self.owner_headers,
        )
        self.assertEqual(admin_res.status_code, 200)

        # 2. Customer order for 2 units
        order_res = c.post(
            "/orders",
            json={
                "customer_name": "Ananya Sen",
                "phone": "9834567890",
                "payment_method": "PREPAID",
                "shipping_method": "STANDARD",
                "address": {
                    "name": "Ananya Sen",
                    "phone": "9834567890",
                    "pincode": "700001",
                    "line1": "Flat 3A, Park Mansion",
                    "city": "Kolkata",
                    "state": "West Bengal",
                },
                "items": [{"variant_id": self.variant_id, "quantity": 2}],
            },
        )
        self.assertEqual(order_res.status_code, 201, f"Expected 201 Created, got: {order_res.text}")

        # 3. Verify final stock is 4 (6 - 2) and exactly 1 admin audit entry exists
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(v.stock, 4)
            adj = db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).all()
            self.assertEqual(len(adj), 1)
            self.assertEqual(adj[0].previous_stock, 5)
            self.assertEqual(adj[0].new_stock, 6)
        finally:
            db.close()

    def test_postgres_relative_stock_delta_and_negative_prevention(self):
        """Verify relative stock delta and negative stock prevention under row lock."""
        from fastapi.testclient import TestClient
        from app.models import ProductVariant

        c = TestClient(self.app)

        # Set stock to 1
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 1
            db.commit()
        finally:
            db.close()

        # Step +1 via stock_delta
        res_plus = c.patch(
            f"/admin/variants/{self.variant_id}",
            json={"stock_delta": 1},
            headers=self.owner_headers,
        )
        self.assertEqual(res_plus.status_code, 200)
        self.assertEqual(res_plus.json()["stock"], 2)

        # Step -5 should be rejected with 400 because 2 - 5 < 0
        res_neg = c.patch(
            f"/admin/variants/{self.variant_id}",
            json={"stock_delta": -5},
            headers=self.owner_headers,
        )
        self.assertEqual(res_neg.status_code, 400)
        self.assertIn("negative", res_neg.json()["detail"].lower())

        # Verify stock in DB remains 2
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(v.stock, 2)
        finally:
            db.close()

    def test_postgres_atomic_bulk_variant_update(self):
        """Verify atomic bulk variant price, MRP, and SKU update on PostgreSQL."""
        from fastapi.testclient import TestClient
        from app.models import ProductVariant
        from decimal import Decimal

        c = TestClient(self.app)

        # Create a second variant on same product
        db = self.SessionLocal()
        try:
            v2 = ProductVariant(
                product_id=self.product_id,
                size="L",
                colour="Royal Navy",
                sku="PG-PSA-L",
                selling_price=Decimal("5999.00"),
                mrp=Decimal("7999.00"),
                stock=5,
            )
            db.add(v2)
            db.commit()
            v2_id = v2.id
        finally:
            db.close()

        # 1. Successful atomic update for both variants
        res = c.patch(
            f"/admin/products/{self.product_id}/variants/bulk-update",
            json={
                "items": [
                    {"variant_id": self.variant_id, "selling_price": "6499.00", "mrp": "8999.00", "sku": "PG-PSA-M-NEW"},
                    {"variant_id": v2_id, "selling_price": "6499.00", "mrp": "8999.00", "sku": "PG-PSA-L-NEW"},
                ]
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(len(data["updated_variants"]), 2)

        # 2. Rejection test: if variant 2 has invalid price > mrp, entire transaction rolls back
        res_fail = c.patch(
            f"/admin/products/{self.product_id}/variants/bulk-update",
            json={
                "items": [
                    {"variant_id": self.variant_id, "selling_price": "7000.00", "mrp": "9999.00"},
                    {"variant_id": v2_id, "selling_price": "10000.00", "mrp": "5000.00"},  # Invalid: price > mrp
                ]
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn("cannot exceed mrp", res_fail.json()["detail"].lower())

        # Verify variant 1 selling_price was NOT updated to 7000 (atomic rollback preserved 6499)
        db = self.SessionLocal()
        try:
            v1 = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(float(v1.selling_price), 6499.0)
        finally:
            db.close()

    def test_postgres_concurrent_coupon_redemption_final_use(self):
        """Verify two concurrent orders on PostgreSQL competing for the final coupon use:

        At most ONE order receives the discount; the other is rejected with HTTP 400.
        Ensure coupon row locking with with_for_update() prevents over-usage or race conditions.
        """
        from fastapi.testclient import TestClient
        from app.models import Coupon, ProductVariant

        db = self.SessionLocal()
        try:
            # Clean up / create test coupon with usage_limit = 1
            db.query(Coupon).filter(Coupon.code == "PGCONCUR1").delete()
            coupon = Coupon(
                code="PGCONCUR1",
                type="FLAT",
                value=Decimal("200.00"),
                min_order_value=Decimal("1000.00"),
                usage_limit=1,
                used_count=0,
                is_active=True,
            )
            db.add(coupon)
            # Ensure sufficient stock
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 50
            db.commit()
        finally:
            db.close()

        barrier = threading.Barrier(2)
        results = []

        def place_order(client_num: int):
            c = TestClient(self.app)
            payload = {
                "customer_name": f"Concurrent Shopper {client_num}",
                "phone": f"987654321{client_num}",
                "payment_method": "COD",
                "shipping_method": "STANDARD",
                "coupon_code": "PGCONCUR1",
                "items": [{"variant_id": self.variant_id, "quantity": 1}],
                "address": {
                    "name": f"Concurrent Shopper {client_num}",
                    "phone": f"987654321{client_num}",
                    "pincode": "110001",
                    "line1": "Barakhamba Road",
                    "city": "New Delhi",
                    "state": "Delhi",
                },
            }
            barrier.wait()
            res = c.post("/orders", json=payload)
            results.append((client_num, res.status_code, res.json()))

        t1 = threading.Thread(target=place_order, args=(1,))
        t2 = threading.Thread(target=place_order, args=(2,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(len(results), 2)
        status_codes = [r[1] for r in results]

        # Exactly one must succeed (201) and exactly one must fail (400)
        self.assertIn(201, status_codes)
        self.assertIn(400, status_codes)

        # The failed response must explain the usage limit was reached
        failed_res = next(r[2] for r in results if r[1] == 400)
        self.assertIn("maximum usage limit", failed_res.get("detail", ""))

        # Verify PostgreSQL database state: used_count is exactly 1, never exceeded
        db = self.SessionLocal()
        try:
            c_db = db.query(Coupon).filter(Coupon.code == "PGCONCUR1").first()
            self.assertEqual(c_db.used_count, 1)
        finally:
            db.close()

    def test_postgres_concurrent_coupon_unlimited_no_lost_updates(self):
        """Verify multiple concurrent orders using an unlimited coupon on PostgreSQL:

        with_for_update() serializes updates and prevents lost updates, resulting in exact used_count matching order count.
        """
        from fastapi.testclient import TestClient
        from app.models import Coupon, ProductVariant

        num_threads = 4
        db = self.SessionLocal()
        try:
            db.query(Coupon).filter(Coupon.code == "PGUNLIMITED").delete()
            coupon = Coupon(
                code="PGUNLIMITED",
                type="PERCENT",
                value=Decimal("10.00"),
                min_order_value=Decimal("500.00"),
                usage_limit=None,  # Unlimited
                used_count=0,
                is_active=True,
            )
            db.add(coupon)
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 50
            db.commit()
        finally:
            db.close()

        barrier = threading.Barrier(num_threads)
        results = []

        def place_order(client_num: int):
            c = TestClient(self.app)
            payload = {
                "customer_name": f"Shopper {client_num}",
                "phone": f"987654320{client_num}",
                "payment_method": "COD",
                "shipping_method": "STANDARD",
                "coupon_code": "PGUNLIMITED",
                "items": [{"variant_id": self.variant_id, "quantity": 1}],
                "address": {
                    "name": f"Shopper {client_num}",
                    "phone": f"987654320{client_num}",
                    "pincode": "400001",
                    "line1": "Nariman Point",
                    "city": "Mumbai",
                    "state": "Maharashtra",
                },
            }
            barrier.wait()
            res = c.post("/orders", json=payload)
            results.append((client_num, res.status_code, res.json()))

        threads = [threading.Thread(target=place_order, args=(i,)) for i in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(results), num_threads)
        for r in results:
            self.assertEqual(r[1], 201, f"Expected 201 Created but got {r[1]}: {r[2]}")

        # Verify exact count on PostgreSQL with zero lost updates
        db = self.SessionLocal()
        try:
            c_db = db.query(Coupon).filter(Coupon.code == "PGUNLIMITED").first()
            self.assertEqual(c_db.used_count, num_threads)
        finally:
            db.close()

    def test_postgres_coupon_order_rollback_no_leak(self):
        """Verify transaction rollback on PostgreSQL: if order creation fails, coupon use is NOT consumed."""
        from fastapi.testclient import TestClient
        from app.models import Coupon, ProductVariant

        c = TestClient(self.app)
        db = self.SessionLocal()
        try:
            db.query(Coupon).filter(Coupon.code == "PGROLLBACK").delete()
            coupon = Coupon(
                code="PGROLLBACK",
                type="FLAT",
                value=Decimal("100.00"),
                min_order_value=Decimal("1000.00"),
                usage_limit=1,
                used_count=0,
                is_active=True,
            )
            db.add(coupon)
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 5
            db.commit()
        finally:
            db.close()

        # Place order requesting 99 units (exceeding stock 5) -> must fail
        failing_payload = {
            "customer_name": "Rollback Test",
            "phone": "9812345678",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "coupon_code": "PGROLLBACK",
            "items": [{"variant_id": self.variant_id, "quantity": 99}],
            "address": {
                "name": "Rollback Test",
                "phone": "9812345678",
                "pincode": "110001",
                "line1": "Janpath",
                "city": "New Delhi",
                "state": "Delhi",
            },
        }
        res_fail = c.post("/orders", json=failing_payload)
        self.assertEqual(res_fail.status_code, 400)

        # Verify rollback on PostgreSQL: used_count is still 0
        db = self.SessionLocal()
        try:
            c_db = db.query(Coupon).filter(Coupon.code == "PGROLLBACK").first()
            self.assertEqual(c_db.used_count, 0)
        finally:
            db.close()

        # Subsequent valid order should successfully consume the coupon
        valid_payload = dict(failing_payload)
        valid_payload["items"] = [{"variant_id": self.variant_id, "quantity": 1}]
        res_ok = c.post("/orders", json=valid_payload)
        self.assertEqual(res_ok.status_code, 201)

        db = self.SessionLocal()
        try:
            c_db = db.query(Coupon).filter(Coupon.code == "PGROLLBACK").first()
            self.assertEqual(c_db.used_count, 1)
        finally:
            db.close()

    def test_postgres_concurrent_active_owner_deactivation_serialized(self):
        """Verify PostgreSQL row-level locking serializes concurrent active owner deactivations.
        
        When exactly 2 active owners exist, 2 concurrent deactivation/demotion requests
        must be serialized so that exactly one succeeds and the other is rejected with 400 Bad Request,
        guaranteeing that 0 active owners can never occur.
        """
        from fastapi.testclient import TestClient
        from app.models import Admin
        from app.auth import hash_password, create_access_token

        c = TestClient(self.app)
        db = self.SessionLocal()
        try:
            # Clean up test owners
            db.query(Admin).filter(Admin.email.in_([
                "pg_co_owner_a@royallibas.com",
                "pg_co_owner_b@royallibas.com",
                "pg_controller@royallibas.com",
            ])).delete(synchronize_session=False)
            db.commit()

            # Seed a controlling owner (to authenticate the requests) and 2 co-owners to test concurrent deactivation
            controller = Admin(
                email="pg_controller@royallibas.com",
                name="PG Controller",
                role="OWNER",
                password_hash=hash_password("controller123"),
                is_active=True,
            )
            owner_a = Admin(
                email="pg_co_owner_a@royallibas.com",
                name="PG Co-Owner A",
                role="OWNER",
                password_hash=hash_password("ownera123"),
                is_active=True,
            )
            owner_b = Admin(
                email="pg_co_owner_b@royallibas.com",
                name="PG Co-Owner B",
                role="OWNER",
                password_hash=hash_password("ownerb123"),
                is_active=True,
            )
            db.add_all([controller, owner_a, owner_b])
            db.commit()
            db.refresh(controller)
            db.refresh(owner_a)
            db.refresh(owner_b)

            controller_id = controller.id
            owner_a_id = owner_a.id
            owner_b_id = owner_b.id
        finally:
            db.close()

        # Keep exactly 2 active owners in the entire database: controller (id1) and owner_b (id2)
        db = self.SessionLocal()
        try:
            pg_owner = db.query(Admin).filter(Admin.email == "pg_owner@royallibas.com").first()
            if pg_owner:
                pg_owner.is_active = False

            ctrl = db.query(Admin).filter(Admin.id == controller_id).first()
            ctrl.is_active = True
            oa = db.query(Admin).filter(Admin.id == owner_a_id).first()
            oa.is_active = False
            ob = db.query(Admin).filter(Admin.id == owner_b_id).first()
            ob.is_active = True
            db.commit()

            # Baseline check: precisely 2 active owners in PostgreSQL
            total_active = db.query(Admin).filter(Admin.role == "OWNER", Admin.is_active == True).count()
            self.assertEqual(total_active, 2)
        finally:
            db.close()

        token_ctrl = create_access_token({"sub": str(controller_id), "role": "OWNER"})
        token_b = create_access_token({"sub": str(owner_b_id), "role": "OWNER"})

        results = {}

        def deactivate_req(admin_token, target_id, key):
            th_client = TestClient(self.app)
            res = th_client.patch(
                f"/admin/staff/{target_id}",
                json={"is_active": False},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            results[key] = (res.status_code, res.json())

        try:
            t1 = threading.Thread(target=deactivate_req, args=(token_ctrl, owner_b_id, "ctrl_deactivates_b"))
            t2 = threading.Thread(target=deactivate_req, args=(token_b, controller_id, "b_deactivates_ctrl"))

            t1.start()
            t2.start()
            t1.join()
            t2.join()

            # In PostgreSQL, with row-level locks on active owners, exactly one transaction must succeed
            # and the other transaction must observe that only 1 active owner remains and be rejected with 400.
            statuses = [r[0] for r in results.values()]
            self.assertIn(200, statuses, f"Expected one 200 OK, got: {results}")
            self.assertIn(400, statuses, f"Expected one 400 Bad Request (last owner guard), got: {results}")

            rejected_detail = [r[1].get("detail", "") for r in results.values() if r[0] == 400][0]
            self.assertIn("only active owner", rejected_detail.lower())

            # Verify PostgreSQL database state: exactly 1 active owner remains!
            db = self.SessionLocal()
            try:
                active_owners_in_db = db.query(Admin).filter(
                    Admin.id.in_([controller_id, owner_b_id]),
                    Admin.role == "OWNER",
                    Admin.is_active == True,
                ).all()
                self.assertEqual(len(active_owners_in_db), 1, "Exactly 1 active owner must remain in PostgreSQL!")
            finally:
                db.close()
        finally:
            restore_db = self.SessionLocal()
            try:
                pg_owner = restore_db.query(Admin).filter(Admin.email == "pg_owner@royallibas.com").first()
                if pg_owner:
                    pg_owner.is_active = True
                restore_db.commit()
            finally:
                restore_db.close()

if __name__ == "__main__":
    unittest.main(verbosity=2)

