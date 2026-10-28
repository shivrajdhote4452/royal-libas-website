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
]

tests_dir = Path(__file__).parent / "tests"

print("=" * 65)
print(">>> RUNNING COMPLETE ROYAL LIBAS TEST SUITE (11 MODULES) <<<")
print("=" * 65)

failed = []
passed = []

for tf in test_files:
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
