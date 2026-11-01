"""
Regression test suite for Issue 3:
Safety, non-destructive behavior, and idempotence of restore_owner_reviews.py.
Tested exclusively on isolated temporary databases.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import Base
from app.models import StoreSetting
from scripts.restore_owner_reviews import restore_reviews


class TestRestoreScriptSafety(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="rl_restore_safety_")
        self.temp_db_path = os.path.join(self.temp_dir, "test_restore.db")
        self.engine = create_engine(
            f"sqlite:///{self.temp_db_path}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

        # Create mock backup file containing 5 baseline reviews
        self.mock_backup_path = os.path.join(self.temp_dir, "mock_backup.json")
        backup_reviews = [
            {
                "id": "rev-1",
                "author_name": "Pooja Agarwal",
                "rating": 5,
                "review_text": "Original backup text from October 2026.",
                "review_date": "October 2026",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_published": True,
                "sort_order": 0,
            },
            {
                "id": "rev-2",
                "author_name": "Neha Sengar",
                "rating": 5,
                "review_text": "Original backup text for Neha.",
                "review_date": "September 2026",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_published": True,
                "sort_order": 1,
            },
        ]
        with open(self.mock_backup_path, "w", encoding="utf-8") as f:
            json.dump({
                "timestamp": "20261101_120000",
                "boutique_reviews_json": json.dumps(backup_reviews),
            }, f)

    def tearDown(self):
        self.engine.dispose()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_dry_run_is_default_and_makes_zero_database_writes(self):
        """1. Dry-run mode produces a preview report and does not write to the database."""
        db = self.Session()
        initial_reviews = [
            {
                "id": "rev-1",
                "author_name": "Pooja Agarwal",
                "rating": 5,
                "review_text": "Owner edited text that differs from backup.",
                "source": "unverified_sample",  # Damaged by cleanup
                "is_published": False,
            }
        ]
        setting = StoreSetting(
            boutique_reviews_json=json.dumps(initial_reviews),
            boutique_reviews_visible=False,
            boutique_gallery_json="[]",
        )
        db.add(setting)
        db.commit()

        # Execute restore_reviews with apply=False (default dry-run)
        res = restore_reviews(
            db_session=db,
            apply=False,
            backup_file_path=self.mock_backup_path,
        )

        self.assertFalse(res["applied"])
        self.assertEqual(res["repaired"], 1)
        self.assertEqual(res["added"], 1)

        # Confirm DB still has the UNMODIFIED initial state
        db_check = self.Session()
        s = db_check.query(StoreSetting).first()
        self.assertEqual(s.boutique_reviews_json, json.dumps(initial_reviews))
        self.assertFalse(s.boutique_reviews_visible)
        db_check.close()
        db.close()

    def test_02_apply_preserves_newer_owner_text_order_and_publication(self):
        """2. When applied, existing owner text, ratings, ordering, and publication are NOT overwritten."""
        db = self.Session()
        initial_reviews = [
            {
                "id": "rev-1",
                "author_name": "Pooja Agarwal",
                "rating": 5,
                "review_text": "Owner custom edited text - must NOT be overwritten by backup!",
                "source": "google",
                "owner_approved": True,
                "is_published": True,
                "sort_order": 1,  # Owner moved it to second position
            },
            {
                "id": "rev-2",
                "author_name": "Neha Sengar",
                "rating": 4,  # Owner adjusted rating
                "review_text": "Owner custom text for Neha.",
                "source": "google",
                "owner_approved": True,
                "is_published": False,  # Owner intentionally unpublished rev-2
                "sort_order": 0,  # Owner moved it to first position
            },
            {
                "id": "rev-custom-99",  # Brand new review added by owner
                "author_name": "Aaradhya Joshi",
                "rating": 5,
                "review_text": "New review added recently.",
                "source": "google",
                "owner_approved": True,
                "is_published": True,
                "sort_order": 2,
            },
        ]
        setting = StoreSetting(
            boutique_reviews_json=json.dumps(initial_reviews),
            boutique_reviews_visible=True,
            boutique_gallery_json="[]",  # Intentionally empty gallery
        )
        db.add(setting)
        db.commit()

        # Run with apply=True
        res = restore_reviews(
            db_session=db,
            apply=True,
            backup_file_path=self.mock_backup_path,
            backup_output_dir=self.temp_dir,
        )

        self.assertTrue(res["applied"])
        self.assertEqual(res["preserved"], 3)  # All 3 existing records preserved
        self.assertEqual(res["added"], 0)

        # Check DB directly
        db_check = self.Session()
        s = db_check.query(StoreSetting).first()
        saved_reviews = json.loads(s.boutique_reviews_json)
        rev_map = {r["id"]: r for r in saved_reviews}

        # Verify rev-1 owner text was preserved
        self.assertEqual(
            rev_map["rev-1"]["review_text"],
            "Owner custom edited text - must NOT be overwritten by backup!",
        )
        self.assertEqual(rev_map["rev-1"]["sort_order"], 1)

        # Verify rev-2 owner publication choice (False) was preserved
        self.assertFalse(rev_map["rev-2"]["is_published"])
        self.assertEqual(rev_map["rev-2"]["sort_order"], 0)
        self.assertEqual(rev_map["rev-2"]["rating"], 4)

        # Verify newer review rev-custom-99 was not deleted
        self.assertIn("rev-custom-99", rev_map)
        self.assertTrue(rev_map["rev-custom-99"]["is_published"])

        # Safety Check: Intentionally empty gallery was NOT populated
        self.assertEqual(s.boutique_gallery_json, "[]")

        # Verify pre-apply backup was created
        backups = [f for f in os.listdir(self.temp_dir) if f.startswith("settings_pre_apply_backup_")]
        self.assertGreaterEqual(len(backups), 1)

        db_check.close()
        db.close()

    def test_03_repeated_execution_is_idempotent(self):
        """3. Running restore multiple times produces identical state with 0 duplicate records."""
        db = self.Session()
        setting = StoreSetting(
            boutique_reviews_json="[]",
            boutique_reviews_visible=False,
            boutique_gallery_json="[]",
        )
        db.add(setting)
        db.commit()

        # Run 1: adds 2 missing records from mock backup
        res1 = restore_reviews(
            db_session=db,
            apply=True,
            backup_file_path=self.mock_backup_path,
            backup_output_dir=self.temp_dir,
        )
        self.assertEqual(res1["added"], 2)

        # Run 2: idempotent, 0 additions, 0 repairs
        res2 = restore_reviews(
            db_session=db,
            apply=True,
            backup_file_path=self.mock_backup_path,
            backup_output_dir=self.temp_dir,
        )
        self.assertEqual(res2["added"], 0)
        self.assertEqual(res2["repaired"], 0)
        self.assertEqual(res2["preserved"], 2)
        self.assertEqual(res2["total"], 2)
        db.close()


if __name__ == "__main__":
    unittest.main()
