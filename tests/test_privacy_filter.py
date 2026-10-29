#!/usr/bin/env python3
"""
Neutrino Browser - End-to-End Native Messaging Protocol Test
Spawns neutrino-host.exe and performs live IPC roundtrip over stdin/stdout.
"""

import unittest
import subprocess
import struct
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
HOST_BIN = ROOT_DIR / "native" / "target" / "release" / "neutrino-host.exe"

class TestNativeMessagingHost(unittest.TestCase):
    def setUp(self):
        self.assertTrue(HOST_BIN.exists(), f"Binary must exist at {HOST_BIN}")

    def test_ipc_communication(self):
        proc = subprocess.Popen(
            [str(HOST_BIN)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        def send_msg(action: str, payload=None):
            req = {"action": action}
            if payload is not None:
                req["payload"] = payload
            data = json.dumps(req).encode("utf-8")
            # 32-bit native length prefix
            prefix = struct.pack("=I", len(data))
            proc.stdin.write(prefix + data)
            proc.stdin.flush()

            # Read response prefix
            resp_prefix = proc.stdout.read(4)
            self.assertEqual(len(resp_prefix), 4, "Must receive 4-byte length prefix")
            resp_len = struct.unpack("=I", resp_prefix)[0]
            resp_body = proc.stdout.read(resp_len)
            return json.loads(resp_body.decode("utf-8"))

        try:
            # 1. Ping
            pong = send_msg("Ping")
            self.assertEqual(pong.get("status"), "Pong")
            self.assertIn("timestamp", pong.get("data", {}))

            # 2. Check tracker URL
            tracker_resp = send_msg("CheckUrl", {"url": "https://www.google-analytics.com/collect", "tab_id": 1})
            self.assertEqual(tracker_resp.get("status"), "UrlChecked")
            self.assertTrue(tracker_resp.get("data", {}).get("blocked"))

            # 3. Check safe URL
            safe_resp = send_msg("CheckUrl", {"url": "https://rust-lang.org/learn", "tab_id": 1})
            self.assertEqual(safe_resp.get("status"), "UrlChecked")
            self.assertFalse(safe_resp.get("data", {}).get("blocked"))

            # 4. Get stats
            stats_resp = send_msg("GetStats")
            self.assertEqual(stats_resp.get("status"), "Stats")
            stats = stats_resp.get("data", {})
            self.assertEqual(stats.get("total_inspected"), 2)
            self.assertEqual(stats.get("total_blocked"), 1)

        finally:
            proc.stdin.close()
            proc.stdout.close()
            proc.stderr.close()
            proc.terminate()
            proc.wait(timeout=2)

if __name__ == "__main__":
    unittest.main()
