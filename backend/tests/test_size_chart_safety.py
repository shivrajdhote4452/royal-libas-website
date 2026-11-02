import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

import sys
sys.path.insert(0, 'backend')

from app.models import Base, SizeChart, Product, Admin
from app.routers.admin import admin_list_size_charts, admin_delete_size_chart

class TestSizeChartSafety(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.admin = Admin(
            id=1,
            email="owner@royallibas.com",
            name="Owner",
            role="OWNER",
            password_hash="hash"
        )
        self.db.add(self.admin)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_list_size_charts_reports_product_count(self):
        # Create chart
        chart1 = SizeChart(id=1, name="Standard Anarkali Chart", category="Suit Set", measurements="[]")
        chart2 = SizeChart(id=2, name="Co-ord Chart", category="Two Pieces", measurements="[]")
        self.db.add_all([chart1, chart2])
        self.db.commit()

        # Link product to chart 1
        prod = Product(
            id=10,
            name="Sample Suit",
            slug="sample-suit",
            category="Suit Set",
            size_chart_id=1
        )
        self.db.add(prod)
        self.db.commit()

        res = admin_list_size_charts(db=self.db, current_admin=self.admin)
        self.assertEqual(len(res), 2)
        
        c1 = next(c for c in res if c.id == 1)
        c2 = next(c for c in res if c.id == 2)
        self.assertEqual(c1.product_count, 1)
        self.assertEqual(c2.product_count, 0)

    def test_delete_chart_with_linked_products_is_blocked(self):
        chart = SizeChart(id=1, name="Standard Anarkali Chart", category="Suit Set", measurements="[]")
        prod = Product(id=10, name="Sample Suit", slug="sample-suit", category="Suit Set", size_chart_id=1)
        self.db.add_all([chart, prod])
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            admin_delete_size_chart(id=1, db=self.db, current_admin=self.admin)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("cannot be deleted because it is currently linked to 1 product", ctx.exception.detail)

        # Verify chart still exists
        self.assertIsNotNone(self.db.query(SizeChart).filter(SizeChart.id == 1).first())

    def test_delete_unlinked_chart_succeeds(self):
        chart = SizeChart(id=2, name="Unused Chart", category="Suit Set", measurements="[]")
        self.db.add(chart)
        self.db.commit()

        res = admin_delete_size_chart(id=2, db=self.db, current_admin=self.admin)
        self.assertEqual(res["status"], "success")
        self.assertIsNone(self.db.query(SizeChart).filter(SizeChart.id == 2).first())

if __name__ == '__main__':
    unittest.main()
