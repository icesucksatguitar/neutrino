#!/usr/bin/env python3
"""
Neutrino Browser - Integration & Build Integrity Test Suite
Verifies engine profiles, policies, manifests, and compiled artifacts.
"""

import unittest
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

class TestNeutrinoIntegrity(unittest.TestCase):
    def test_policies_json_validity(self):
        policy_path = ROOT_DIR / "engine" / "config" / "policies.json"
        self.assertTrue(policy_path.exists(), "policies.json must exist")

        with open(policy_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        policies = data.get("policies", {})
        self.assertTrue(policies.get("DisableTelemetry"), "Telemetry must be disabled in policies.json")
        self.assertTrue(policies.get("DisableFirefoxStudies"), "Studies must be disabled")
        self.assertTrue(policies.get("DisablePocket"), "Pocket must be disabled")
        self.assertTrue(policies.get("DNSOverHTTPS", {}).get("Enabled"), "DoH must be enabled in policies")

    def test_native_manifest_validity(self):
        manifest_path = ROOT_DIR / "engine" / "manifests" / "neutrino_host.json"
        self.assertTrue(manifest_path.exists(), "neutrino_host.json must exist")

        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("name"), "neutrino.host")
        self.assertEqual(manifest.get("type"), "stdio")
        self.assertIn("shield@neutrino.local", manifest.get("allowed_extensions", []))

    def test_hardened_user_js_rules(self):
        user_js = ROOT_DIR / "engine" / "config" / "user.js"
        self.assertTrue(user_js.exists(), "user.js must exist")

        content = user_js.read_text(encoding="utf-8")
        self.assertIn('user_pref("privacy.resistFingerprinting", true);', content)
        self.assertIn('user_pref("network.cookie.cookieBehavior", 5);', content)
        self.assertIn('user_pref("media.peerconnection.enabled", false);', content)
        self.assertIn('user_pref("toolkit.telemetry.enabled", false);', content)

    def test_rust_binary_exists(self):
        release_bin = ROOT_DIR / "native" / "target" / "release" / "neutrino-host.exe"
        self.assertTrue(release_bin.exists(), "neutrino-host.exe must be compiled")
        self.assertGreater(release_bin.stat().st_size, 100_000, "neutrino-host.exe must be non-empty")

        app_bin = ROOT_DIR / "native" / "target" / "release" / "neutrino.exe"
        self.assertTrue(app_bin.exists(), "neutrino.exe must be compiled")
        self.assertGreater(app_bin.stat().st_size, 100_000, "neutrino.exe must be non-empty")

    def test_standalone_desktop_app_bundle(self):
        standalone_exe = ROOT_DIR / "dist" / "Neutrino-win32-x64" / "Neutrino.exe"
        self.assertTrue(standalone_exe.exists(), "Standalone Neutrino.exe must exist in dist/")
        self.assertGreater(standalone_exe.stat().st_size, 50_000_000, "Standalone executable must be a full desktop binary")

if __name__ == "__main__":
    unittest.main()

