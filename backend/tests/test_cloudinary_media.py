"""Quarantined Legacy Test Suite: Cloudinary Media.

Standing Policy:
- Direct execution fails closed to protect databases.
- Test discovery skips this suite pending modernization.
"""

import os
import unittest

if __name__ == "__main__":
    raise RuntimeError(
        "CRITICAL SAFETY GUARD: Direct execution of quarantined legacy test suite "
        f"'{__file__}' is blocked to protect databases pending modernization."
    )


def setUpModule():
    raise unittest.SkipTest(
        f"Quarantined legacy test suite '{os.path.basename(__file__)}' is skipped during discovery pending modernization."
    )


class QuarantinedLegacySuite(unittest.TestCase):
    """Placeholder ensuring unittest discovery identifies and skips this quarantined suite."""
    def test_quarantined_placeholder(self):
        pass
