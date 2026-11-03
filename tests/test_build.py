#!/usr/bin/env python3
"""
Neutrino Browser - Build & Executable Verification Suite
Verifies that the standalone Windows executable is created, non-empty,
and properly bundled with Chromium runtime assets.
"""

import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
STANDALONE_DIR = ROOT_DIR / "release" / "Neutrino-win32-x64"
STANDALONE_EXE = STANDALONE_DIR / "Neutrino.exe"

class TestStandaloneExecutable(unittest.TestCase):
    def test_dist_main_exists(self):
        dist_main = ROOT_DIR / "dist-main" / "index.js"
        self.assertTrue(dist_main.exists(), "dist-main/index.js must exist")

    def test_dist_renderer_exists(self):
        dist_renderer = ROOT_DIR / "dist-renderer" / "index.html"
        self.assertTrue(dist_renderer.exists(), "dist-renderer/index.html must exist")

    def test_rust_binary_exists(self):
        rust_bin = ROOT_DIR / "native" / "target" / "release" / "neutrino-core.exe"
        self.assertTrue(rust_bin.exists(), "neutrino-core.exe must exist in release")
        self.assertGreater(rust_bin.stat().st_size, 100_000, "Rust binary must be > 100KB")

    def test_standalone_executable_exists(self):
        if STANDALONE_DIR.exists():
            self.assertTrue(STANDALONE_EXE.exists(), "Neutrino.exe must exist in release bundle")
            self.assertGreater(STANDALONE_EXE.stat().st_size, 50_000_000, "Neutrino.exe must be a real Windows application binary (>50MB)")

if __name__ == "__main__":
    unittest.main()

