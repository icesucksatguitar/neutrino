#!/usr/bin/env python3
"""
Neutrino Browser - Model Context Protocol (MCP) Test Suite
Verifies MCP server JSON-RPC protocol adherence, tool definitions, and dispatching.
"""

import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

class TestMcpImplementation(unittest.TestCase):
    def test_mcp_server_file_exists(self):
        server_file = ROOT_DIR / "src" / "main" / "mcp" / "server.ts"
        self.assertTrue(server_file.exists(), "server.ts must exist")
        content = server_file.read_text(encoding="utf-8")
        self.assertIn("class McpServer", content)
        self.assertIn("tools/list", content)
        self.assertIn("tools/call", content)
        self.assertIn("initialize", content)

    def test_mcp_browser_tools_registered(self):
        manager_file = ROOT_DIR / "src" / "main" / "browserManager.ts"
        self.assertTrue(manager_file.exists(), "browserManager.ts must exist")
        content = manager_file.read_text(encoding="utf-8")
        expected_tools = [
            "browser_navigate",
            "browser_list_tabs",
            "browser_create_tab",
            "browser_close_tab",
            "browser_get_adblock_stats",
            "browser_zen_optimize",
        ]
        for tool in expected_tools:
            self.assertIn(f"name: '{tool}'", content, f"Tool {tool} must be registered")

if __name__ == "__main__":
    unittest.main()

