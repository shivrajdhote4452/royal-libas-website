import subprocess
import sys
from pathlib import Path

test_files = [
    "test_phase1.py",
    "test_phase2.py",
    "test_phase4.py",
    "test_phase5.py",
    "test_phase6.py",
    "test_phase7.py",
    "test_phase8.py",
    "test_shiprocket.py",
    "test_security_reliability.py",
    "test_store_and_variants.py",
    "test_admin_upgrade.py",
    "test_cloudinary_media.py",
]

tests_dir = Path(__file__).parent / "tests"

print("=" * 65)
print(">>> RUNNING COMPLETE ROYAL LIBAS TEST SUITE (11 MODULES) <<<")
print("=" * 65)

failed = []
passed = []

def reset_test_invariants():
    try:
        import sqlite3
        db_path = Path(__file__).parent / "royal_libas.db"
        conn = sqlite3.connect(str(db_path))
        c = conn.cursor()
        c.execute("UPDATE product_variants SET stock = 0 WHERE size = 'S' AND product_id IN (SELECT id FROM products WHERE slug = 'chandni-raat-modal-silk-co-ord')")
        c.execute("UPDATE product_variants SET stock = 2 WHERE size = 'S' AND product_id IN (SELECT id FROM products WHERE slug = 'zari-mahal-velvet-anarkali-suit')")
        c.execute("UPDATE product_variants SET stock = 2 WHERE size = 'M' AND product_id IN (SELECT id FROM products WHERE slug = 'zari-mahal-velvet-anarkali-suit')")
        c.execute("UPDATE product_variants SET stock = 1 WHERE size = 'L' AND product_id IN (SELECT id FROM products WHERE slug = 'zari-mahal-velvet-anarkali-suit')")
        c.execute("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'PENDING')")
        c.execute("DELETE FROM orders WHERE status = 'PENDING'")
        c.execute("UPDATE product_variants SET stock = 10 WHERE product_id IN (SELECT id FROM products WHERE slug = 'noorani-chanderi-kurti-set')")
        conn.commit()
        conn.close()
    except Exception:
        pass

for tf in test_files:
    reset_test_invariants()
    test_path = tests_dir / tf
    if not test_path.exists():
        print(f"[ERROR] Test file {tf} does not exist!")
        failed.append(tf)
        continue

    print(f"\n[RUNNING] {tf} ...")
    res = subprocess.run([sys.executable, str(test_path)], capture_output=True, text=True, cwd=str(Path(__file__).parent))
    if res.returncode == 0:
        print(f"[PASS] {tf}")
        passed.append(tf)
    else:
        print(f"[FAIL] {tf}")
        print("--- STDERR ---")
        print(res.stderr.strip() or res.stdout.strip())
        failed.append(tf)

print("\n" + "=" * 65)
print(f"RESULTS: {len(passed)} PASSED, {len(failed)} FAILED")
print("=" * 65)

if failed:
    sys.exit(1)
