#!/usr/bin/env python3
"""
Neutrino Browser - Profile & Native Messaging Registration Tool
Configures a dedicated Firefox profile and registers the Native Messaging Host
in the Windows Registry (HKCU) so Firefox and the React UI can communicate.
"""

import os
import sys
import shutil
import winreg
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
CONFIG_DIR = ROOT_DIR / "engine" / "config"
MANIFEST_DIR = ROOT_DIR / "engine" / "manifests"
ACTIVE_PROFILE_DIR = ROOT_DIR / "engine" / "profiles" / "active"
HOST_EXE = ROOT_DIR / "native" / "target" / "release" / "neutrino-host.exe"

def setup_isolated_profile():
    print(f"[Neutrino] Creating isolated hardened profile at: {ACTIVE_PROFILE_DIR}")
    ACTIVE_PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    # Copy hardened user.js
    shutil.copy2(CONFIG_DIR / "user.js", ACTIVE_PROFILE_DIR / "user.js")

    # Copy distribution policies.json
    distribution_dir = ACTIVE_PROFILE_DIR / "distribution"
    distribution_dir.mkdir(exist_ok=True)
    shutil.copy2(CONFIG_DIR / "policies.json", distribution_dir / "policies.json")

    print("[Neutrino] Hardened user.js and enterprise policies.json deployed successfully.")

def register_native_messaging_host():
    if os.name != "nt":
        print("[Neutrino] Skipping Windows Registry registration on non-Windows OS.")
        return

    print("[Neutrino] Registering Native Messaging Host in Windows Registry...")
    manifest_path = MANIFEST_DIR / "neutrino_host.json"

    # Write absolute path in manifest for Firefox registration
    manifest_data = {
        "name": "neutrino.host",
        "description": "Neutrino Browser Native Privacy and IPC Host",
        "path": str(HOST_EXE.resolve()),
        "type": "stdio",
        "allowed_extensions": [
            "shield@neutrino.local",
            "ui@neutrino.local"
        ]
    }

    import json
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    # Register in HKCU\Software\Mozilla\NativeMessagingHosts\neutrino.host
    reg_key_path = r"Software\Mozilla\NativeMessagingHosts\neutrino.host"
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_key_path) as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path.resolve()))
        print(f"[Neutrino] Successfully registered HKCU\\{reg_key_path} -> {manifest_path}")
    except Exception as e:
        print(f"[Neutrino] Registry registration note: {e}")

if __name__ == "__main__":
    setup_isolated_profile()
    register_native_messaging_host()
    print("[Neutrino] Environment preparation complete!")
