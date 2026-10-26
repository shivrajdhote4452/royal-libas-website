import os
import sys
from decimal import Decimal
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.database import Base, get_db
from app.models import Admin, Product, ProductVariant
from app.auth import hash_password
from app.schemas import ProductVariantCreate

# Use isolated test SQLite database file
TEST_DB_FILE = Path(backend_dir) / "test_royal_libas.db"
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


def test_admin_creation_and_auth():
    """Verify admin login with correct/incorrect passwords and GET /admin/me."""
    print("Testing admin creation and auth...")
    db = TestingSessionLocal()
    admin_email = "owner@royallibas.com"
    admin_pass = "RoyalOwner2026!"

    admin = Admin(
        email=admin_email,
        password_hash=hash_password(admin_pass),
    )
    db.add(admin)
    db.commit()
    db.close()

    # 1. Login with WRONG password -> should fail with 401
    bad_login_res = client.post(
        "/admin/login",
        json={"email": admin_email, "password": "WrongPassword123"},
    )
    assert bad_login_res.status_code == 401, f"Expected 401, got {bad_login_res.status_code}"
    assert "access_token" not in bad_login_res.json()
    print("  [OK] Login with wrong password rejected with 401")

    # 2. Login with CORRECT password -> should succeed with token
    good_login_res = client.post(
        "/admin/login",
        json={"email": admin_email, "password": admin_pass},
    )
    assert good_login_res.status_code == 200, f"Expected 200, got {good_login_res.status_code}"
    data = good_login_res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    token = data["access_token"]
    print("  [OK] Login with correct password succeeded and returned JWT")

    # 3. GET /admin/me without token -> should fail with 401
    no_auth_res = client.get("/admin/me")
    assert no_auth_res.status_code == 401
    print("  [OK] GET /admin/me without token rejected with 401")

    # 4. GET /admin/me with invalid token -> should fail with 401
    bad_token_res = client.get(
        "/admin/me",
        headers={"Authorization": "Bearer invalid.fake.token"},
    )
    assert bad_token_res.status_code == 401
    print("  [OK] GET /admin/me with invalid token rejected with 401")

    # 5. GET /admin/me with valid token -> should succeed
    me_res = client.get(
        "/admin/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == admin_email
    print(f"  [OK] GET /admin/me with valid token succeeded: {me_data['email']}")


def test_product_with_variants_stock_and_price():
    """Verify creating a product with sizes S, M, L creates exactly 3 variant rows with stock & price."""
    print("Testing product with variants (sizes S, M, L)...")
    db = TestingSessionLocal()

    product = Product(
        name="Festive Anarkali Kurti Set",
        slug="festive-anarkali-kurti-set",
        description="Silk festive set with hand embroidery",
        fabric="Raw Silk",
        care="Dry clean only",
        category="Festive Sets",
        is_bestseller=True,
        is_active=True,
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    # Add 3 variants: S, M, L
    variants_data = [
        {"size": "S", "stock": 5, "price": Decimal("3499.00"), "mrp": Decimal("4999.00")},
        {"size": "M", "stock": 10, "price": Decimal("3499.00"), "mrp": Decimal("4999.00")},
        {"size": "L", "stock": 7, "price": Decimal("3499.00"), "mrp": Decimal("4999.00")},
    ]

    for v in variants_data:
        variant = ProductVariant(
            product_id=product.id,
            size=v["size"],
            selling_price=v["price"],
            mrp=v["mrp"],
            stock=v["stock"],
        )
        db.add(variant)

    db.commit()

    # Query variants back from database
    variants = db.query(ProductVariant).filter(ProductVariant.product_id == product.id).all()
    assert len(variants) == 3, f"Expected exactly 3 variants, found {len(variants)}"
    sizes_found = {v.size: (v.stock, v.selling_price) for v in variants}
    assert "S" in sizes_found and sizes_found["S"] == (5, Decimal("3499.00"))
    assert "M" in sizes_found and sizes_found["M"] == (10, Decimal("3499.00"))
    assert "L" in sizes_found and sizes_found["L"] == (7, Decimal("3499.00"))
    db.close()
    print("  [OK] Exactly 3 variants created with independent stock and prices")


def test_negative_stock_rejection():
    """Verify that negative stock is rejected at schema level and DB level."""
    print("Testing negative stock rejection...")
    # 1. Schema-level validation rejects stock < 0
    schema_rejected = False
    try:
        ProductVariantCreate(
            size="M",
            selling_price=Decimal("1999.00"),
            stock=-1,
        )
    except ValueError as e:
        schema_rejected = True
        print(f"  [OK] Pydantic schema validation rejected negative stock: {e}")
    assert schema_rejected, "Schema did not reject negative stock!"

    # 2. Database check constraint rejects stock < 0
    db = TestingSessionLocal()
    product = Product(name="Test Kurti", slug="test-kurti-negative-stock")
    db.add(product)
    db.commit()

    bad_variant = ProductVariant(
        product_id=product.id,
        size="XL",
        selling_price=Decimal("1999.00"),
        stock=-5,
    )
    db.add(bad_variant)
    db_rejected = False
    try:
        db.commit()
    except IntegrityError as e:
        db_rejected = True
        db.rollback()
        print(f"  [OK] Database check constraint rejected negative stock: {e.orig}")
    assert db_rejected, "Database constraint did not reject negative stock!"
    db.close()


def run_all():
    print("=== STARTING PHASE 1 VERIFICATION TESTS ===")
    if TEST_DB_FILE.exists():
        TEST_DB_FILE.unlink()
    Base.metadata.create_all(bind=test_engine)
    try:
        test_admin_creation_and_auth()
        test_product_with_variants_stock_and_price()
        test_negative_stock_rejection()
        print("\n===========================================")
        print(">>> ALL PHASE 1 VERIFICATION CHECKS PASSED!")
        print("===========================================")
    finally:
        test_engine.dispose()
        if TEST_DB_FILE.exists():
            TEST_DB_FILE.unlink()


if __name__ == "__main__":
    run_all()
