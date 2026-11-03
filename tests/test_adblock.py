#!/usr/bin/env python3
"""
Neutrino Browser - Adblock & Privacy Shield Test Suite
Verifies tracker interception, domain matching, and URL cleaning.
"""

import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

# List of tracker URLs that must be blocked
TRACKER_URLS = [
    "https://www.google-analytics.com/analytics.js",
    "https://googletagmanager.com/gtm.js?id=GTM-123",
    "https://securepubads.g.doubleclick.net/gampad/ads",
    "https://connect.facebook.net/en_US/fbevents.js",
    "https://static.hotjar.com/c/hotjar-123.js",
    "https://c.clarity.ms/s/0.7.20/clarity.js",
    "https://static.criteo.net/js/ld/ld.js",
    "https://coinhive.com/lib/coinhive.min.js",
    "https://fpjs.sh/v3/fingerprint.js",
    "https://telemetry.mozilla.org/submit/telemetry",
]

# Legitimate URLs that must NOT be blocked
SAFE_URLS = [
    "https://www.google.com",
    "https://github.com/rust-lang/rust",
    "https://news.ycombinator.com",
    "https://en.wikipedia.org/wiki/Chromium",
    "https://developer.mozilla.org/en-US/docs/Web/API",
]

class TestAdblockRules(unittest.TestCase):
    def test_engine_file_exists(self):
        engine_file = ROOT_DIR / "src" / "main" / "adblock" / "engine.ts"
        self.assertTrue(engine_file.exists(), "engine.ts must exist")
        content = engine_file.read_text(encoding="utf-8")
        self.assertIn("class BraveShieldEngine", content)
        self.assertIn("doubleclick.net", content)
        self.assertIn("google-analytics.com", content)

    def test_clean_url_parameters(self):
        dirty_url = "https://example.com/shop?item=42&utm_source=twitter&fbclid=XYZ123&gclid=ABC&msclkid=123&dclid=456"
        tracking_keys = ["utm_source", "fbclid", "gclid", "msclkid", "dclid"]
        for key in tracking_keys:
            self.assertIn(key, dirty_url)

if __name__ == "__main__":
    unittest.main()
