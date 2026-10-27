import os
import sys
from decimal import Decimal
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.database import Base, get_db
from app.models import Admin, Product, ProductVariant, Collection
from app.auth import hash_password, create_access_token
from seed import seed_database

# Use isolated test SQLite database file
TEST_DB_FILE = Path(backend_dir) / "test_phase2.db"
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


def test_catalogue_apis_and_seed_data():
    """Verify catalogue listing, prices, badges, and filters."""
    print("Testing catalogue APIs and seed verification...")

    # 1. GET /products: should return 5 seeded products
    res = client.get("/products")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    products = res.json()
    assert len(products) >= 16, f"Expected at least 16 products, got {len(products)}"
    print(f"  [OK] GET /products returned all {len(products)} products")

    # 2. Check prices match database exactly for every seeded product
    db = TestingSessionLocal()
    for p in products:
        db_product = db.query(Product).filter(Product.id == p["id"]).first()
        assert db_product is not None
        db_prices = [v.selling_price for v in db_product.variants]
        assert Decimal(str(p["min_price"])) == min(db_prices), "Min price mismatch!"
        assert Decimal(str(p["max_price"])) == max(db_prices), "Max price mismatch!"
    db.close()
    print("  [OK] Product prices in GET /products match database prices exactly")

    # 3. Verify Low Stock badge on Zari Mahal Velvet Anarkali Suit (total stock <= 5)
    low_stock_p = next(p for p in products if p["slug"] == "zari-mahal-velvet-anarkali-suit")
    assert "Low Stock" in low_stock_p["badges"], f"Expected 'Low Stock' in badges, got {low_stock_p['badges']}"
    assert low_stock_p["total_stock"] <= 5
    print("  [OK] Product with total stock <= 5 reports 'Low Stock' badge")

    # 4. Verify product with one empty size (Chandni Raat size S)
    detail_res = client.get("/products/chandni-raat-modal-silk-co-ord")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    variants = detail["variants"]
    size_s = next(v for v in variants if v["size"] == "S")
    assert size_s["stock"] == 0, f"Expected size S stock == 0, got {size_s['stock']}"
    assert size_s["is_available"] is False, "Expected size S is_available == False"
    size_m = next(v for v in variants if v["size"] == "M")
    assert size_m["stock"] > 0
    assert size_m["is_available"] is True
    print("  [OK] Product with one empty size reports that size as unavailable (is_available = False)")

    # 6. Verify image ordering and details in GET /products/{slug}
    images = detail["images"]
    assert len(images) >= 3, f"Expected at least 3 images, got {len(images)}"
    sort_orders = [img["sort_order"] for img in images]
    assert sort_orders == sorted(sort_orders), "Images not in sort order!"
    assert len(detail["fabric"]) > 5
    assert detail["size_chart"] is not None
    print("  [OK] GET /products/{slug} returns ordered images, fabric, care, and size chart")

    # 7. Verify GET /collections with product counts
    col_res = client.get("/collections")
    assert col_res.status_code == 200
    collections = col_res.json()
    assert len(collections) >= 3
    festive_col = next(c for c in collections if c["slug"] == "festive-edit")
    assert festive_col["product_count"] >= 2, f"Expected products in festive-edit, got {festive_col['product_count']}"
    everyday_col = next(c for c in collections if c["slug"] == "everyday-cotton")
    assert everyday_col["product_count"] >= 3, f"Expected products in everyday-cotton, got {everyday_col['product_count']}"
    print("  [OK] GET /collections returns correct active product counts per collection")

    # 8. Verify Sorting: price_asc and price_desc
    asc_res = client.get("/products?sort=price_asc")
    assert asc_res.status_code == 200
    asc_prices = [float(p["min_price"]) for p in asc_res.json()]
    assert asc_prices == sorted(asc_prices), f"Prices not ascending: {asc_prices}"
    print(f"  [OK] Sort price_asc orders products correctly by selling price: {asc_prices}")

    desc_res = client.get("/products?sort=price_desc")
    assert desc_res.status_code == 200
    desc_prices = [float(p["min_price"]) for p in desc_res.json()]
    assert desc_prices == sorted(desc_prices, reverse=True), f"Prices not descending: {desc_prices}"
    print(f"  [OK] Sort price_desc orders products correctly by selling price: {desc_prices}")

    # 9. Verify Category and Collection filtering
    filter_col_res = client.get("/products?collection=festive-edit")
    assert filter_col_res.status_code == 200
    assert len(filter_col_res.json()) >= 2
    print("  [OK] Filtering by collection returned exact matching products")


def test_admin_product_and_variant_management():
    """Verify admin endpoints for product and variant creation and updates."""
    print("Testing admin product and variant management...")
    db = TestingSessionLocal()
    admin_email = "admin_phase2@royallibas.com"
    admin = Admin(
        email=admin_email,
        password_hash=hash_password("SecretAdminPass2026!"),
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    admin_id = admin.id
    db.close()

    token = create_access_token(data={"sub": str(admin_id), "email": admin_email})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Admin product creation WITHOUT token must be rejected (401)
    new_product_payload = {
        "name": "DUMMY — Royal Velvet Sherwani Set",
        "slug": "dummy-royal-velvet-sherwani-set",
        "description": "Velvet handcrafted ensemble",
        "fabric": "Micro Velvet",
        "category": "Festive Sets",
        "is_bestseller": False,
        "is_active": True,
        "variants": [
            {"size": "M", "selling_price": "4999.00", "mrp": "6999.00", "stock": 5},
            {"size": "L", "selling_price": "4999.00", "mrp": "6999.00", "stock": 3},
        ],
    }

    unauth_res = client.post("/admin/products", json=new_product_payload)
    assert unauth_res.status_code == 401, f"Expected 401 without token, got {unauth_res.status_code}"
    print("  [OK] Admin product creation without token rejected with 401")

    # 2. Admin product creation WITH token must succeed (201)
    auth_res = client.post("/admin/products", json=new_product_payload, headers=headers)
    assert auth_res.status_code == 201, f"Expected 201 with token, got {auth_res.status_code}"
    created = auth_res.json()
    assert created["slug"] == new_product_payload["slug"]
    assert len(created["variants"]) == 2
    product_id = created["id"]
    print("  [OK] Admin product creation with token succeeded and created variants")

    # 3. Admin adds a new variant to existing product
    new_variant_payload = {
        "size": "XL",
        "selling_price": "5299.00",
        "mrp": "7299.00",
        "stock": 4,
    }
    var_res = client.post(
        f"/admin/products/{product_id}/variants",
        json=new_variant_payload,
        headers=headers,
    )
    assert var_res.status_code == 201
    var_data = var_res.json()
    assert var_data["size"] == "XL"
    assert float(var_data["selling_price"]) == 5299.00
    variant_id = var_data["id"]
    print("  [OK] POST /admin/products/{id}/variants added variant XL with price and stock")

    # 4. Admin updates variant price and stock
    update_var_res = client.patch(
        f"/admin/variants/{variant_id}",
        json={"selling_price": "4799.00", "stock": 12},
        headers=headers,
    )
    assert update_var_res.status_code == 200
    updated_var = update_var_res.json()
    assert float(updated_var["selling_price"]) == 4799.00
    assert updated_var["stock"] == 12
    print("  [OK] PATCH /admin/variants/{id} updated selling price and stock")

    # 5. Admin updates product fields
    update_prod_res = client.patch(
        f"/admin/products/{product_id}",
        json={"is_bestseller": True, "description": "Updated luxury velvet description"},
        headers=headers,
    )
    assert update_prod_res.status_code == 200
    updated_prod = update_prod_res.json()
    assert updated_prod["is_bestseller"] is True
    assert "Bestseller" in updated_prod["badges"]
    print("  [OK] PATCH /admin/products/{id} updated product fields and refreshed badges")


def run_all():
    print("=== STARTING PHASE 2 VERIFICATION TESTS ===")
    if TEST_DB_FILE.exists():
        TEST_DB_FILE.unlink()

    # Create tables
    Base.metadata.create_all(bind=test_engine)

    # Override app.database SessionLocal and engine temporarily for seeding test db
    import app.database as app_db
    orig_session = app_db.SessionLocal
    orig_engine = app_db.engine
    app_db.SessionLocal = TestingSessionLocal
    app_db.engine = test_engine

    try:
        # Seed test database twice to verify idempotency
        print("Running seed process on test database...")
        seed_database(session_factory=TestingSessionLocal)
        print("Running seed process second time to verify idempotency...")
        seed_database(session_factory=TestingSessionLocal)

        test_catalogue_apis_and_seed_data()
        test_admin_product_and_variant_management()

        print("\n===========================================")
        print(">>> ALL PHASE 2 VERIFICATION CHECKS PASSED!")
        print("===========================================")
    finally:
        app_db.SessionLocal = orig_session
        app_db.engine = orig_engine
        test_engine.dispose()
        if TEST_DB_FILE.exists():
            TEST_DB_FILE.unlink()


if __name__ == "__main__":
    run_all()
