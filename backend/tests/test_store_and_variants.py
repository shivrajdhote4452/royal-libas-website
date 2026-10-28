import sys
import os
import io

# Set path so app can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db, Base, engine
from app.models import Product, ProductVariant, StoreSetting, ContactInquiry, NewsletterSubscriber
from app.auth import create_access_token

client = TestClient(app)

def test_store_and_variants():
    print("Testing Store Settings, Variant Stock, Contact, and Newsletter APIs...")

    # 1. Test GET /settings public endpoint
    resp = client.get("/settings")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    settings_data = resp.json()
    assert "free_shipping_threshold" in settings_data
    assert settings_data["free_shipping_threshold"] >= 1500
    assert settings_data["standard_shipping_fee"] == 99
    print("  [OK] Public GET /settings returns 200 with free_shipping_threshold >= 1500")

    # 2. Test Contact Inquiry submission
    contact_payload = {
        "name": "Maharani Gayatri",
        "email": "gayatri@jaipur.in",
        "message": "Inquiry regarding custom sizing for the festive collection."
    }
    resp = client.post("/contact", json=contact_payload)
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data["status"] == "success"
    assert "message" in data
    print("  [OK] POST /contact saves inquiry and returns HTTP 201")

    # 3. Test Newsletter Subscription
    sub_payload = {"email": "subscriber@royallibas.in"}
    resp = client.post("/newsletter", json=sub_payload)
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    # Duplicate subscription should handle gracefully without error
    resp_dup = client.post("/newsletter", json=sub_payload)
    assert resp_dup.status_code in [200, 201], f"Expected 200/201 for duplicate, got {resp_dup.status_code}: {resp_dup.text}"
    print("  [OK] POST /newsletter creates subscriber and handles duplicate gracefully")

    # 4. Test Variant selection and stock logic
    # Fetch catalogue products to inspect variants
    resp = client.get("/products")
    assert resp.status_code == 200
    products = resp.json()
    assert len(products) > 0

    # Find a product with multiple variants
    multi_variant_product = None
    for p in products:
        if len(p.get("variants", [])) > 1:
            multi_variant_product = p
            break

    assert multi_variant_product is not None, "At least one product must have multiple variants"
    variants = multi_variant_product["variants"]
    # Check that variants have colour, size, stock, and pricing
    for v in variants:
        assert "stock" in v
        assert "size" in v
        assert "selling_price" in v
        assert v["stock"] >= 0

    print(f"  [OK] Product '{multi_variant_product['name']}' has {len(variants)} verified structured variants")

    # 5. Test Admin Settings update
    token = create_access_token({"sub": "1", "role": "admin"})
    auth_header = {"Authorization": f"Bearer {token}"}

    update_payload = {
        "free_shipping_threshold": 1500,
        "standard_shipping_fee": 99,
        "announcement_text": "COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹1,500",
        "whatsapp_number": "+91 98112 23344",
        "support_email": "concierge@royallibas.com",
        "instagram_handle": "@royal_libas_by_tanya"
    }
    resp = client.put("/admin/settings", json=update_payload, headers=auth_header)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    assert resp.json()["free_shipping_threshold"] == 1500
    assert resp.json()["standard_shipping_fee"] == 99
    print("  [OK] Admin PUT /admin/settings updates live store settings successfully")

    # 6. Test Admin image upload endpoint with file type validation
    # Allowed image: dummy JPEG
    dummy_jpeg = io.BytesIO(b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xFF\xDB")
    files = {"file": ("test_artisan.jpg", dummy_jpeg, "image/jpeg")}
    resp = client.post("/admin/products/upload-image", files=files, headers=auth_header)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    upload_res = resp.json()
    assert upload_res["status"] == "success"
    assert upload_res["url"].startswith("/uploads/products/")
    print(f"  [OK] Admin POST /admin/products/upload-image returned valid path: {upload_res['url']}")

    # Disallowed file type: text/plain or executable
    bad_file = {"file": ("script.sh", io.BytesIO(b"echo 'malicious'"), "text/plain")}
    resp_bad = client.post("/admin/products/upload-image", files=bad_file, headers=auth_header)
    assert resp_bad.status_code == 400, f"Expected 400 for bad extension, got {resp_bad.status_code}"
    print("  [OK] Admin image upload strictly rejects non-image files with HTTP 400")

    print("\nALL STORE & VARIANT TESTS PASSED!")

if __name__ == "__main__":
    test_store_and_variants()
