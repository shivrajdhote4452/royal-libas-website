#!/usr/bin/env python3
"""
Seed Verified Deployments Ledger for Royal Libas VPS.

Populates .deployments_ledger.tsv with audited historical deployments
from independently verified production activation evidence, strictly verified
against physical release directories and git commit metadata on disk.

Safety Invariants:
1. Matching Git commit on disk alone does NOT prove successful production activation.
2. Independent verifiable evidence (e.g. database dump logs, audit logs) is REQUIRED
   to mark historical entries as trusted 'activated' records.
3. When independent evidence is missing, automatic historical seeding and deletion
   authorization are DISABLED. All uncertain releases are preserved.
4. Genuinely read-only in dry-run mode (never touches or creates lock or ledger).
5. Chronological ordering: existing entries and historical backfill entries are
   merged and strictly sorted chronologically by ISO 8601 timestamp.
6. Atomic update under exclusive pipeline lock.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

# Try fcntl for POSIX locking
try:
    import fcntl
    HAS_FCNTL = True
except ImportError:
    HAS_FCNTL = False

RELEASE_NAME_RE = re.compile(r"^release-[A-Za-z0-9]{8}$")
COMMIT_SHA_RE = re.compile(r"^[0-9a-f]{40}$")

# Candidate historical releases from git commit history
# Note: These are candidates only; they MUST be supported by independent activation
# evidence before being admitted into the trusted 'activated' retention lineage.
CANDIDATE_HISTORICAL_LINEAGE = [
    ("2026-11-01T14:28:52Z", "release-huDNUmEb", "805e7a93091e8f073ad3d629fc4d952d46cd454b"),
    ("2026-11-01T14:36:34Z", "release-CPCGzuLG", "d9e7507cd1b8f820e44c9644fc460bb50902c6f1"),
    ("2026-11-01T17:46:46Z", "release-tHmKpYTN", "e2bd0a4c27d23574c3ac323edf7c4070c576eb20"),
    ("2026-11-02T08:16:09Z", "release-WF0rJVqS", "8a71c821deb6cb36cee868e535b2c0924ee114c7"),
    ("2026-11-02T10:27:55Z", "release-nhKRvmAd", "9c41227852571ba8b2d47e605821ddc3200f801a"),
    ("2026-11-02T10:51:09Z", "release-uXFXM8EL", "57352a3e3da16f023e3dd7d90f5ade1eb21c104e"),
    ("2026-11-02T13:00:46Z", "release-E66XdkE0", "1cfa9d693f1d4cc6a70652653f77d2a7ced4ac36"),
    ("2026-11-02T20:09:08Z", "release-ZRTuDbQi", "4d173af0bec121bb701d0cb64dba268bb4800e35"),
    ("2026-11-03T08:21:13Z", "release-5j4xvcke", "1be2722ae23f20f4707b237b31cdc37ec649147b"),
    ("2026-11-03T11:57:12Z", "release-SWr5ReQx", "564741fd8576cb3df9a4b6f6f6aeb908baf068d8"),
    ("2026-11-03T19:47:41Z", "release-GyuopHsQ", "3644fb8cc4cf8a7b52436ed24cba1df3b9726e2f"),
    ("2026-11-04T06:13:59Z", "release-boHz00xc", "5c685c1a7e406c2d97fd5532cea40aab964f24a4"),
    ("2026-11-04T07:57:19Z", "release-RTuyby3U", "ab04b86ec82e0a1224574a9a0ed78bdff2ca742d"),
    ("2026-11-04T08:56:51Z", "release-uYOraQbp", "78ffebe8f4e8d276eb722a85f8f5fda1d9a6db17"),
    ("2026-11-04T10:23:26Z", "release-Uf7UYjUy", "d82eae0a3cf59294cbd5edcdfa0888f9bbc2e033"),
    ("2026-11-04T11:51:06Z", "release-6eIbw7Gt", "19e78593c4013aaef2e43fa7c67b48442d8f531a"),
]


def get_commit_sha(release_path: str) -> Optional[str]:
    """Inspect git repository inside release directory to get actual commit SHA."""
    git_dir = os.path.join(release_path, ".git")
    if not os.path.isdir(git_dir):
        return None

    try:
        import subprocess
        res = subprocess.run(
            ["git", "-c", f"safe.directory={release_path}", "-C", release_path, "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if res.returncode == 0:
            sha = res.stdout.strip()
            if COMMIT_SHA_RE.match(sha):
                return sha
    except Exception:
        pass

    try:
        head_file = os.path.join(git_dir, "HEAD")
        if os.path.isfile(head_file):
            with open(head_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if COMMIT_SHA_RE.match(content):
                return content
            if content.startswith("ref: "):
                ref_subpath = content[5:].strip()
                ref_path = os.path.join(git_dir, ref_subpath)
                if os.path.isfile(ref_path):
                    with open(ref_path, "r", encoding="utf-8") as rf:
                        ref_sha = rf.read().strip()
                    if COMMIT_SHA_RE.match(ref_sha):
                        return ref_sha
                packed_path = os.path.join(git_dir, "packed-refs")
                if os.path.isfile(packed_path):
                    with open(packed_path, "r", encoding="utf-8") as pf:
                        for line in pf:
                            parts = line.strip().split()
                            if len(parts) >= 2 and parts[1] == ref_subpath:
                                if COMMIT_SHA_RE.match(parts[0]):
                                    return parts[0]
    except Exception:
        pass

    return None


def load_independent_evidence(evidence_path: Optional[str]) -> Tuple[Dict[str, Dict[str, any]], List[str]]:
    """
    Load independently verified production activation evidence from file.
    
    Supports JSON or TSV formats containing release name, commit SHA, and proof source.
    """
    evidence: Dict[str, Dict[str, any]] = {}
    warnings: List[str] = []

    if not evidence_path:
        return evidence, warnings

    if not os.path.isfile(evidence_path):
        warnings.append(f"Independent evidence file '{evidence_path}' does not exist.")
        return evidence, warnings

    try:
        if evidence_path.endswith(".json"):
            with open(evidence_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    for item in data:
                        rel = item.get("release")
                        if rel:
                            evidence[rel] = item
                elif isinstance(data, dict):
                    evidence = data
        else:
            # TSV format: RELEASE_NAME \t COMMIT_SHA \t EVIDENCE_SOURCE
            with open(evidence_path, "r", encoding="utf-8") as f:
                for line_no, raw_line in enumerate(f, 1):
                    line = raw_line.strip()
                    if not line or line.startswith("#"):
                        continue
                    parts = line.split("\t")
                    if len(parts) >= 2:
                        rel = parts[0].strip()
                        sha = parts[1].strip()
                        source = parts[2].strip() if len(parts) >= 3 else "audit_record"
                        evidence[rel] = {"release": rel, "commit": sha, "source": source}
    except Exception as exc:
        warnings.append(f"Failed to parse evidence file '{evidence_path}': {exc}")

    return evidence, warnings


def seed_ledger(
    ledger_path: str,
    builds_dir: str = "/var/www/royal-libas-releases/builds",
    pipeline_lock_file: str = "/var/www/royal-libas-releases/builds/.deploy-pipeline.lock",
    evidence_file: Optional[str] = None,
    mark_uncertain: bool = True,
    dry_run: bool = True
) -> int:
    """
    Seed deployments ledger for audit/tracking while enforcing the Authoritative Evidence Policy.
    
    Invariants:
    1. A release name appearing in an arbitrary evidence file or matching disk commits
       is NOT authoritative proof of successful production activation.
    2. Historical seeding for deletion purposes is STRICTLY DISABLED.
    3. Historical releases are untrusted for rollback deletion lineage and are preserved
       as uncertain ('uncertain_historical').
    4. Only forward-running deployments verified live by the pipeline will be recorded
       as 'activated'.
    """
    print("=" * 72)
    print("Royal Libas Deployments Ledger Seeding Utility")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"Mode: {'DRY-RUN (Genuine Read-Only Inspection)' if dry_run else 'EXECUTE (Writing Ledger)'}")
    print(f"Target ledger file: {ledger_path}")
    print(f"Builds directory:  {builds_dir}")
    print("=" * 72)

    print("\n" + "=" * 72)
    print("[AUTHORITATIVE EVIDENCE POLICY: HISTORICAL DELETION DISABLED]")
    print("A release name appearing in an arbitrary evidence file or matching disk Git")
    print("commits does not constitute authoritative proof of successful activation.")
    print("Because historical activations cannot be independently audited against an")
    print("authoritative, tamper-proof system source, HISTORICAL SEEDING FOR DELETION")
    print("PURPOSES IS DISABLED.")
    print("All pre-existing releases will be preserved safely as uncertain releases.")
    print("Automatic retention pruning operates strictly forward-only on new activations")
    print("verified directly by the deployment pipeline.")
    print("=" * 72)

    # 1. Parse existing ledger entries if present
    existing_records: List[Dict[str, any]] = []
    seen_releases: Set[str] = set()

    if os.path.isfile(ledger_path):
        with open(ledger_path, "r", encoding="utf-8") as f:
            for line_no, raw_line in enumerate(f, 1):
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) >= 4:
                    ts_raw, rel_raw, sha_raw, status_raw = parts[0].strip(), parts[1].strip(), parts[2].strip(), parts[3].strip()
                    try:
                        parsed_ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                        if RELEASE_NAME_RE.match(rel_raw) and COMMIT_SHA_RE.match(sha_raw):
                            existing_records.append({
                                "timestamp": parsed_ts.isoformat(),
                                "parsed_ts": parsed_ts,
                                "release": rel_raw,
                                "sha": sha_raw.lower(),
                                "status": status_raw
                            })
                            seen_releases.add(rel_raw)
                    except Exception:
                        pass

    # 2. Validate historical candidates against physical disk AND independent evidence
    verified_historical: List[Dict[str, any]] = []
    excluded_candidates: List[Tuple[str, str]] = []

    for ts_raw, rel, expected_sha in CANDIDATE_HISTORICAL_LINEAGE:
        if rel in seen_releases:
            continue

        rel_path = os.path.join(builds_dir, rel)
        if not os.path.isdir(rel_path):
            excluded_candidates.append((rel, f"Directory missing on disk at '{rel_path}'"))
            continue

        disk_sha = get_commit_sha(rel_path)
        if disk_sha is None:
            excluded_candidates.append((rel, "Missing git commit metadata on disk"))
            continue

        if disk_sha.lower() != expected_sha.lower():
            excluded_candidates.append(
                (rel, f"Commit mismatch on disk: expected '{expected_sha}', found '{disk_sha}'")
            )
            continue

        # Under Authoritative Evidence Policy, historical entries cannot be trusted as
        # 'activated' for deletion purposes. They are strictly marked 'uncertain_historical'.
        parsed_ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        verified_historical.append({
            "timestamp": parsed_ts.isoformat(),
            "parsed_ts": parsed_ts,
            "release": rel,
            "sha": expected_sha.lower(),
            "status": "uncertain_historical"
        })

    # 3. Combine and sort strictly in chronological order
    all_records = existing_records + verified_historical
    all_records.sort(key=lambda r: r["parsed_ts"])

    print(f"\nExisting ledger records found:        {len(existing_records)}")
    print(f"Independently verified activations:   {sum(1 for r in verified_historical if r['status'] == 'activated')}")
    print(f"Uncertain historical records added:   {sum(1 for r in verified_historical if r['status'] != 'activated')}")
    print(f"Excluded candidates (mismatched/missing): {len(excluded_candidates)}")
    print(f"Total merged chronological count:     {len(all_records)}")

    if excluded_candidates:
        print("\n--- [EXCLUDED HISTORICAL CANDIDATES (PRESERVED AS UNCERTAIN)] ---")
        for rel, reason in excluded_candidates:
            print(f" - {rel}: {reason}")

    if dry_run:
        print("\n--- [DRY-RUN: CHRONOLOGICAL LEDGER PREVIEW] ---")
        for r in all_records:
            print(f"  {r['timestamp']}\t{r['release']}\t{r['sha'][:8]}...\t{r['status']}")
        print("\n[DRY-RUN COMPLETE] Genuine read-only: No files were touched or written to disk.")
        print("To execute ledger write, re-run with --execute.")
        return 0

    if not verified_historical and not existing_records:
        print("\n[EXECUTION NOTICE] No verified records to write. Ledger unchanged.")
        return 0

    # 4. EXECUTE MODE: Write atomically under exclusive pipeline lock
    lock_fd = None
    if HAS_FCNTL and pipeline_lock_file:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(pipeline_lock_file)), exist_ok=True)
            lock_fd = os.open(pipeline_lock_file, os.O_RDWR | os.O_CREAT, 0o644)
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, BlockingIOError) as exc:
            print(f"CRITICAL: Cannot acquire pipeline lock '{pipeline_lock_file}': {exc}", file=sys.stderr)
            return 1

    try:
        parent_dir = os.path.dirname(os.path.abspath(ledger_path))
        os.makedirs(parent_dir, exist_ok=True)
        tmp_ledger = f"{ledger_path}.tmp.{os.getpid()}"

        with open(tmp_ledger, "w", encoding="utf-8") as f:
            for r in all_records:
                f.write(f"{r['timestamp']}\t{r['release']}\t{r['sha']}\t{r['status']}\n")
            f.flush()
            os.fsync(f.fileno())

        os.replace(tmp_ledger, ledger_path)
        print(f"\n[EXECUTION COMPLETE] Successfully wrote {len(all_records)} chronologically sorted records to '{ledger_path}'.")
        return 0
    finally:
        if lock_fd is not None:
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
                os.close(lock_fd)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Seed deployments ledger with audited, verified lineage")
    parser.add_argument(
        "--ledger-file",
        default="/var/www/royal-libas-releases/builds/.deployments_ledger.tsv",
        help="Path to ledger TSV"
    )
    parser.add_argument(
        "--builds-dir",
        default="/var/www/royal-libas-releases/builds",
        help="Path to builds directory"
    )
    parser.add_argument(
        "--pipeline-lock-file",
        default="/var/www/royal-libas-releases/builds/.deploy-pipeline.lock",
        help="Path to pipeline lock"
    )
    parser.add_argument(
        "--evidence-file",
        default=None,
        help="Path to independent activation evidence (JSON or TSV)"
    )
    parser.add_argument(
        "--mark-uncertain",
        action="store_true",
        help="Record historical releases with matching commits as 'uncertain_historical' (preserved against deletion)"
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually write records (default is genuine read-only dry-run)"
    )
    args = parser.parse_args()

    sys.exit(seed_ledger(
        ledger_path=args.ledger_file,
        builds_dir=args.builds_dir,
        pipeline_lock_file=args.pipeline_lock_file,
        evidence_file=args.evidence_file,
        mark_uncertain=args.mark_uncertain,
        dry_run=not args.execute
    ))


if __name__ == "__main__":
    main()
