"""Isolated Disposable Test Suite for Admin Product-Wise Bulk Inventory Adjustments.

CRITICAL ISOLATION DESIGN:
1. Creates a dedicated temporary SQLite database file BEFORE any app module import.
2. Injects os.environ["DATABASE_URL"] BEFORE app.config, app.database, or app.main are imported.
3. Startup migrations (run_migrations) and table creation (Base.metadata.create_all) execute
   EXCLUSIVELY within this temporary disposable database.
4. Includes strict security guards that immediately abort if any production, VPS, or existing
   business database URL is detected.
5. Injects failures to verify atomic transaction rollback.
6. Cleans up and deletes the temporary database file upon completion.
"""

import os
import sys
import tempfile
from decimal import Decimal
from unittest.mock import patch

# =====================================================================
# STEP 1: CREATE DEDICATED TEMPORARY TEST DATABASE BEFORE ANY APP IMPORT
# =====================================================================
temp_fd, temp_db_path = tempfile.mkstemp(prefix="royal_libas_disposable_test_", suffix=".db")
os.close(temp_fd)

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Override DATABASE_URL in environment BEFORE any app module loads
os.environ["DATABASE_URL"] = f"sqlite:///{temp_db_path}"
os.environ["JWT_SECRET"] = "isolated-test-secret-key-phase6-test"

# =====================================================================
# STEP 2: STRICT SAFETY GUARD
# =====================================================================
resolved_env_url = os.environ.get("DATABASE_URL", "").lower()
assert "royal_libas_disposable_test_" in resolved_env_url, (
    f"Safety guard triggered: unexpected test DB URL '{resolved_env_url}'"
)
for forbidden_word in ["postgres", "postgresql", "royal_libas.db", "neon", "hostinger"]:
    assert forbidden_word not in resolved_env_url, (
        f"CRITICAL SAFETY ABORT: Forbidden target keyword '{forbidden_word}' detected in DATABASE_URL!"
    )

# =====================================================================
# STEP 3: IMPORT APPLICATION MODULES (Now binding exclusively to temp DB)
# =====================================================================
from fastapi.testclient import TestClient
from app.config import DATABASE_URL as APP_DATABASE_URL
from app.database import engine, Base, SessionLocal
from app.models import Admin, Product, ProductVariant, StockAdjustment, ActivityLog
from app.auth import hash_password, create_access_token
from app.main import app

client = TestClient(app)


def run_isolated_bulk_inventory_tests():
    print("=================================================================")
    print(">>> RUNNING STRICTLY ISOLATED BULK INVENTORY TEST SUITE <<<")
    print("=================================================================")

    # Verify that app engine is indeed bound to our temporary database
    assert "royal_libas_disposable_test_" in str(engine.url), (
        f"Safety failure: Engine URL '{engine.url}' is not the temporary database!"
    )
    print(f"Verified Test Isolation: Engine bound to disposable DB -> {os.path.basename(temp_db_path)}")

    try:
        # Seed isolated test fixtures inside the disposable test database
        db = SessionLocal()
        try:
            owner_admin = Admin(
                email="owner@royallibas.com",
                name="Store Owner",
                role="OWNER",
                password_hash=hash_password("ownerpass123"),
                is_active=True,
            )
            staff_admin = Admin(
                email="staff@royallibas.com",
                name="Fulfillment Staff",
                role="FULFILLMENT_STAFF",
                password_hash=hash_password("staffpass123"),
                is_active=True,
            )
            db.add_all([owner_admin, staff_admin])
            db.commit()

            owner_token = create_access_token({"sub": str(owner_admin.id), "role": "OWNER"})
            staff_token = create_access_token({"sub": str(staff_admin.id), "role": "FULFILLMENT_STAFF"})
            owner_headers = {"Authorization": f"Bearer {owner_token}"}
            staff_headers = {"Authorization": f"Bearer {staff_token}"}

            # Product 1: Published Live (3 sizes: S=8, M=2 (low), L=0 (sold out))
            p1 = Product(
                name="Festive Chanderi Kurti Set",
                slug="festive-chanderi-kurti-set",
                category="SUIT SET",
                subcategory="Three Pieces",
                status="PUBLISHED",
                is_active=True,
                description="Luxurious festive set",
            )
            db.add(p1)
            db.commit()

            v1_s = ProductVariant(
                product_id=p1.id,
                size="S",
                colour="Emerald Green",
                sku="RL-FCS-S",
                selling_price=Decimal("4999.00"),
                stock=8,
            )
            v1_m = ProductVariant(
                product_id=p1.id,
                size="M",
                colour="Emerald Green",
                sku="RL-FCS-M",
                selling_price=Decimal("4999.00"),
                stock=2,
            )
            v1_l = ProductVariant(
                product_id=p1.id,
                size="L",
                colour="Emerald Green",
                sku="RL-FCS-L",
                selling_price=Decimal("4999.00"),
                stock=0,
            )

            # Product 2: Draft Setup (1 size: M=15)
            p2 = Product(
                name="Summer Cotton Co-ord",
                slug="summer-cotton-co-ord",
                category="TWO PIECES",
                subcategory="Co-ord Sets",
                status="DRAFT",
                is_active=True,
                description="Draft co-ord set",
            )
            db.add(p2)
            db.commit()

            v2_m = ProductVariant(
                product_id=p2.id,
                size="M",
                colour="Ivory Pearl",
                sku="RL-SCC-M",
                selling_price=Decimal("2499.00"),
                stock=15,
            )
            db.add_all([v1_s, v1_m, v1_l, v2_m])
            db.commit()

            p1_id = p1.id
            p2_id = p2.id
            v1_s_id = v1_s.id
            v1_m_id = v1_m.id
            v1_l_id = v1_l.id
            v2_m_id = v2_m.id
        finally:
            db.close()

        # =====================================================================
        # Test 1: Stable Inventory Summary endpoint (GET /admin/inventory/summary)
        # =====================================================================
        res = client.get("/admin/inventory/summary", headers=owner_headers)
        assert res.status_code == 200, f"Summary failed: {res.text}"
        summary = res.json()
        assert summary["published_products"] == 1
        assert summary["published_units"] == 10  # 8 + 2 + 0
        assert summary["published_variants"] == 3
        assert summary["draft_products"] == 1
        assert summary["draft_units"] == 15
        assert summary["low_stock_products"] == 1
        assert summary["low_stock_variants"] == 1  # v1_m (stock=2)
        assert summary["out_of_stock_products"] == 1
        assert summary["out_of_stock_variants"] == 1  # v1_l (stock=0)
        assert summary["total_working_products"] == 2
        assert summary["total_working_units"] == 25
        print("  [PASS] Test 1: Stable inventory summary returns accurate baseline boutique counts")

        # =====================================================================
        # Test 2: Filtered Inventory returns complete variant matrix for product
        # =====================================================================
        res_low = client.get("/admin/inventory?filter=low_stock", headers=owner_headers)
        assert res_low.status_code == 200
        items_low = res_low.json()
        p1_variants = [it for it in items_low if it["product_id"] == p1_id]
        assert len(p1_variants) == 3, f"Expected all 3 variants for matrix, got {len(p1_variants)}"
        print("  [PASS] Test 2: Filtered queries return complete variant groups for grouped matrix display")

        # =====================================================================
        # Test 3: Strict RBAC check (FULFILLMENT_STAFF rejected with 403)
        # =====================================================================
        payload_staff = {
            "product_id": p1_id,
            "reason": "RESTOCK",
            "items": [{"variant_id": v1_s_id, "new_stock": 10, "expected_stock": 8}],
        }
        res_staff = client.post("/admin/inventory/bulk-adjust", json=payload_staff, headers=staff_headers)
        assert res_staff.status_code == 403, f"Expected 403 for fulfillment staff, got {res_staff.status_code}"
        print("  [PASS] Test 3: Unauthorized staff roles rejected with HTTP 403")

        # =====================================================================
        # Test 4: Schema validation - Negative and Decimal stock rejected
        # =====================================================================
        # Negative value
        res_neg = client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": p1_id,
                "reason": "CORRECTION",
                "items": [{"variant_id": v1_s_id, "new_stock": -4, "expected_stock": 8}],
            },
            headers=owner_headers,
        )
        assert res_neg.status_code == 422
        # Decimal value
        res_dec = client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": p1_id,
                "reason": "CORRECTION",
                "items": [{"variant_id": v1_s_id, "new_stock": 4.5, "expected_stock": 8}],
            },
            headers=owner_headers,
        )
        assert res_dec.status_code == 422
        print("  [PASS] Test 4: Negative (-4) and decimal (4.5) stock counts rejected with HTTP 422")

        # =====================================================================
        # Test 5: Schema validation - Missing expected_stock rejected with 422
        # =====================================================================
        res_no_exp = client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": p1_id,
                "reason": "RESTOCK",
                "items": [{"variant_id": v1_s_id, "new_stock": 10}],
            },
            headers=owner_headers,
        )
        assert res_no_exp.status_code == 422
        print("  [PASS] Test 5: Missing expected_stock is rejected at schema layer (422)")

        # =====================================================================
        # Test 6: Duplicate variant IDs rejected
        # =====================================================================
        res_dup = client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": p1_id,
                "reason": "RESTOCK",
                "items": [
                    {"variant_id": v1_s_id, "new_stock": 10, "expected_stock": 8},
                    {"variant_id": v1_s_id, "new_stock": 12, "expected_stock": 8},
                ],
            },
            headers=owner_headers,
        )
        assert res_dup.status_code == 422
        print("  [PASS] Test 6: Duplicate variant IDs in single request rejected (422)")

        # =====================================================================
        # Test 7: Foreign variant ID rejected (400)
        # =====================================================================
        res_foreign = client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": p1_id,
                "reason": "RESTOCK",
                "items": [
                    {"variant_id": v2_m_id, "new_stock": 20, "expected_stock": 15},
                ],
            },
            headers=owner_headers,
        )
        assert res_foreign.status_code == 400
        assert "does not belong to product" in res_foreign.json()["detail"]
        print("  [PASS] Test 7: Foreign variant IDs rejected with HTTP 400")

        # =====================================================================
        # Test 8: Stale stock concurrency conflict simulation (HTTP 409 Conflict)
        # =====================================================================
        # Admin 1 updates stock from 8 to 12
        res_admin1 = client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": p1_id,
                "reason": "RESTOCK",
                "items": [{"variant_id": v1_s_id, "new_stock": 12, "expected_stock": 8}],
            },
            headers=owner_headers,
        )
        assert res_admin1.status_code == 200

        # Admin 2 had form open with old stock (8) and tries to update to 10
        res_admin2 = client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": p1_id,
                "reason": "RESTOCK",
                "items": [{"variant_id": v1_s_id, "new_stock": 10, "expected_stock": 8}],
            },
            headers=owner_headers,
        )
        assert res_admin2.status_code == 409, f"Expected 409 Conflict, got {res_admin2.status_code}"
        assert "conflict detected" in res_admin2.json()["detail"].lower()
        print("  [PASS] Test 8: Stale stock conflict detected (HTTP 409); lost update prevented")

        # =====================================================================
        # Test 9: Deliberate zero stock saving & atomic transaction consistency
        # =====================================================================
        res_zero = client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": p1_id,
                "reason": "DAMAGED",
                "note": "Damaged pieces removed after boutique inspection",
                "items": [
                    {"variant_id": v1_s_id, "new_stock": 0, "expected_stock": 12},
                    {"variant_id": v1_m_id, "new_stock": 6, "expected_stock": 2},
                ],
            },
            headers=owner_headers,
        )
        assert res_zero.status_code == 200
        data_zero = res_zero.json()
        assert data_zero["total_stock"] == 6  # 0 + 6 + 0
        assert len(data_zero["updated_variants"]) == 2

        # Verify DB values directly
        db_check = SessionLocal()
        try:
            v1_s_db = db_check.query(ProductVariant).filter(ProductVariant.id == v1_s_id).first()
            assert v1_s_db.stock == 0
            v1_m_db = db_check.query(ProductVariant).filter(ProductVariant.id == v1_m_id).first()
            assert v1_m_db.stock == 6

            # Verify StockAdjustment rows
            s_adj = (
                db_check.query(StockAdjustment)
                .filter(StockAdjustment.variant_id == v1_s_id)
                .order_by(StockAdjustment.id.desc())
                .first()
            )
            assert s_adj.previous_stock == 12
            assert s_adj.new_stock == 0
            assert s_adj.change_amount == -12
            assert s_adj.reason == "DAMAGED"

            # Verify ActivityLog row
            log = (
                db_check.query(ActivityLog)
                .filter(ActivityLog.target_id == str(p1_id), ActivityLog.action == "BULK_STOCK_ADJUSTMENT")
                .first()
            )
            assert log is not None
        finally:
            db_check.close()
        print("  [PASS] Test 9: Deliberate zero stock saved; StockAdjustment and ActivityLog recorded atomically")

        # =====================================================================
        # Test 10: Injected failure & atomic transaction rollback verification
        # =====================================================================
        # When an error occurs during commit, the endpoint must roll back completely
        db_before = SessionLocal()
        try:
            stock_before = db_before.query(ProductVariant).filter(ProductVariant.id == v1_m_id).first().stock
            adj_count_before = db_before.query(StockAdjustment).count()
            log_count_before = db_before.query(ActivityLog).count()
        finally:
            db_before.close()

        with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("Simulated database write failure")):
            res_fail = client.post(
                "/admin/inventory/bulk-adjust",
                json={
                    "product_id": p1_id,
                    "reason": "RESTOCK",
                    "items": [{"variant_id": v1_m_id, "new_stock": 50, "expected_stock": stock_before}],
                },
                headers=owner_headers,
            )
            assert res_fail.status_code == 500
            assert "Failed to adjust stock atomically" in res_fail.json()["detail"]

        # Verify that rollback prevented ANY partial changes
        db_after = SessionLocal()
        try:
            stock_after = db_after.query(ProductVariant).filter(ProductVariant.id == v1_m_id).first().stock
            adj_count_after = db_after.query(StockAdjustment).count()
            log_count_after = db_after.query(ActivityLog).count()
            assert stock_after == stock_before, f"Stock changed despite error! {stock_before} -> {stock_after}"
            assert adj_count_after == adj_count_before, "StockAdjustment created despite rollback!"
            assert log_count_after == log_count_before, "ActivityLog created despite rollback!"
        finally:
            db_after.close()
        print("  [PASS] Test 10: Injected failure triggered atomic rollback; zero partial writes occurred")

        # =====================================================================
        # Test 11: Product-level Audit History (GET /admin/inventory/adjustments?product_id=...)
        # =====================================================================
        res_hist = client.get(f"/admin/inventory/adjustments?product_id={p1_id}", headers=owner_headers)
        assert res_hist.status_code == 200
        hist_items = res_hist.json()
        assert len(hist_items) >= 2
        assert all(h["product_name"] == "Festive Chanderi Kurti Set" for h in hist_items)
        print("  [PASS] Test 11: Product-level audit history query retrieves verified adjustments")

        # =====================================================================
        # Note on PostgreSQL Concurrency Checks
        # =====================================================================
        print("-----------------------------------------------------------------")
        print("Notice on PostgreSQL Concurrency & Row-Locking:")
        print("  SQLite verified transactional atomicity, conflict rejection (409),")
        print("  schema validation, and rollback semantics.")
        print("  Live PostgreSQL multi-session row contention (blocking wait on row lock)")
        print("  was NOT performed locally because local PostgreSQL requires password")
        print("  credentials, and the VPS database is strictly protected/forbidden from testing.")
        print("-----------------------------------------------------------------")

        print("=================================================================")
        print(">>> ALL ISOLATED INVENTORY TESTS PASSED CLEANLY (11/11) <<<")
        print("=================================================================")

    finally:
        # Tear down disposable database completely
        engine.dispose()
        try:
            if os.path.exists(temp_db_path):
                os.remove(temp_db_path)
                print(f"Safety check: Disposable test DB successfully unlinked -> {os.path.basename(temp_db_path)}")
        except Exception as e:
            print(f"Notice on temp DB removal: {e}")


if __name__ == "__main__":
    run_isolated_bulk_inventory_tests()
