#!/usr/bin/env python3
"""
Seed Verified Deployments Ledger for Royal Libas VPS.

Populates .deployments_ledger.tsv with audited historical deployments
from GitHub Actions and VPS database backups.
"""

import argparse
import os
import sys

# Audited historical lineage in chronological order
VERIFIED_PRODUCTION_LINEAGE = [
    ("2026-11-01T14:28:52Z", "release-huDNUmEb", "805e7a93091e8f073ad3d629fc4d952d46cd454b", "activated"),
    ("2026-11-01T14:36:34Z", "release-CPCGzuLG", "d9e7507cd1b8f820e44c9644fc460bb50902c6f1", "activated"),
    ("2026-11-01T17:46:46Z", "release-tHmKpYTN", "e2bd0a4c27d23574c3ac323edf7c4070c576eb20", "activated"),
    ("2026-11-02T08:16:09Z", "release-WF0rJVqS", "8a71c821deb6cb36cee868e535b2c0924ee114c7", "activated"),
    ("2026-11-02T10:27:55Z", "release-nhKRvmAd", "9c41227852571ba8b2d47e605821ddc3200f801a", "activated"),
    ("2026-11-02T10:51:09Z", "release-uXFXM8EL", "57352a3e3da16f023e3dd7d90f5ade1eb21c104e", "activated"),
    ("2026-11-02T13:00:46Z", "release-E66XdkE0", "1cfa9d693f1d4cc6a70652653f77d2a7ced4ac36", "activated"),
    ("2026-11-02T20:09:08Z", "release-ZRTuDbQi", "4d173af0bec121bb701d0cb64dba268bb4800e35", "activated"),
    ("2026-11-03T08:21:13Z", "release-5j4xvcke", "1be2722ae23f20f4707b237b31cdc37ec649147b", "activated"),
    ("2026-11-03T11:57:12Z", "release-SWr5ReQx", "564741fd8576cb3df9a4b6f6f6aeb908baf068d8", "activated"),
    ("2026-11-03T19:47:41Z", "release-GyuopHsQ", "3644fb8cc4cf8a7b52436ed24cba1df3b9726e2f", "activated"),
    ("2026-11-04T06:13:59Z", "release-boHz00xc", "5c685c1a7e406c2d97fd5532cea40aab964f24a4", "activated"),
    ("2026-11-04T07:57:19Z", "release-RTuyby3U", "ab04b86ec82e0a1224574a9a0ed78bdff2ca742d", "activated"),
    ("2026-11-04T08:56:51Z", "release-uYOraQbp", "78ffebe8f4e8d276eb722a85f8f5fda1d9a6db17", "activated"),
    ("2026-11-04T10:23:26Z", "release-Uf7UYjUy", "d82eae0a3cf59294cbd5edcdfa0888f9bbc2e033", "activated"),
    ("2026-11-04T11:51:06Z", "release-6eIbw7Gt", "19e78593c4013aaef2e43fa7c67b48442d8f531a", "activated"),
]


def seed_ledger(ledger_path: str, dry_run: bool = True) -> int:
    print(f"Target ledger file: {ledger_path}")
    print(f"Total historical records to write: {len(VERIFIED_PRODUCTION_LINEAGE)}")

    if dry_run:
        print("[DRY-RUN] Ledger entries that would be written:")
        for ts, rel, sha, status in VERIFIED_PRODUCTION_LINEAGE:
            print(f"  {ts}\t{rel}\t{sha[:8]}\t{status}")
        print("[DRY-RUN COMPLETE] No changes written to disk.")
        return 0

    # Ensure parent directory exists
    os.makedirs(os.path.dirname(os.path.abspath(ledger_path)), exist_ok=True)

    # Read existing entries to prevent duplication
    existing_releases = set()
    if os.path.exists(ledger_path):
        with open(ledger_path, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) >= 2:
                    existing_releases.add(parts[1])

    written = 0
    with open(ledger_path, "a", encoding="utf-8") as f:
        for ts, rel, sha, status in VERIFIED_PRODUCTION_LINEAGE:
            if rel not in existing_releases:
                f.write(f"{ts}\t{rel}\t{sha}\t{status}\n")
                written += 1

    print(f"Successfully appended {written} verified historical records to '{ledger_path}'.")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Seed deployments ledger with audited lineage")
    parser.add_argument("--ledger-file", default="/var/www/royal-libas-releases/builds/.deployments_ledger.tsv", help="Path to ledger TSV")
    parser.add_argument("--execute", action="store_true", help="Actually write records (default is dry-run)")
    args = parser.parse_args()

    sys.exit(seed_ledger(args.ledger_file, dry_run=not args.execute))


if __name__ == "__main__":
    main()

