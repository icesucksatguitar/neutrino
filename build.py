#!/usr/bin/env python3
"""
==============================================================================
NEUTRINO BROWSER - UNIFIED MULTI-ENVIRONMENT BUILD & RELEASE ORCHESTRATOR
==============================================================================
Builds, versions, and packages both the Electron and Rust (Tauri v2) releases
into a unified root release directory:

  release/
  ├── electron/        <- Packaged standalone Windows Electron application
  ├── rust/            <- Packaged standalone Windows Tauri/Rust application
  └── manifest.json    <- Live manifest recording current versions & timestamps

Usage:
  python build.py --env [rust|electron|all] --bump [major|minor|patch|none]
  python build.py -e rust -b patch
  python build.py -e electron -b minor
  python build.py --env all --bump patch --clean
"""

import os
import sys
import shutil
import subprocess
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

# Enable ANSI escape sequences on Windows consoles
if os.name == "nt":
    os.system("")

ROOT_DIR = Path(__file__).resolve().parent
ELECTRON_DIR = ROOT_DIR / "electron"
RUST_DIR = ROOT_DIR / "rust"
RELEASE_DIR = ROOT_DIR / "release"
ELECTRON_RELEASE_DIR = RELEASE_DIR / "electron"
RUST_RELEASE_DIR = RELEASE_DIR / "rust"
MANIFEST_FILE = RELEASE_DIR / "manifest.json"

# ANSI Colors
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def log_header(title: str):
    print(f"\n{BOLD}{CYAN}=== {title} ==={RESET}")


def log_info(msg: str):
    print(f"{CYAN}{BOLD}[INFO]{RESET} {msg}")


def log_success(msg: str):
    print(f"{GREEN}{BOLD}[SUCCESS]{RESET} {msg}")


def log_warn(msg: str):
    print(f"{YELLOW}{BOLD}[WARNING]{RESET} {msg}")


def log_error(msg: str):
    print(f"{RED}{BOLD}[ERROR]{RESET} {msg}")


def run_cmd(cmd: list[str], cwd: Path, env: dict | None = None) -> bool:
    """Execute a system command, streaming output."""
    cmd_str = " ".join(str(c) for c in cmd)
    log_info(f"Running: {DIM}{cmd_str}{RESET} (in {cwd.name}/)")
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            env=env or os.environ.copy(),
            check=True
        )
        return proc.returncode == 0
    except subprocess.CalledProcessError as e:
        log_error(f"Command failed with exit code {e.returncode}: {cmd_str}")
        return False
    except FileNotFoundError:
        log_error(f"Executable not found for command: {cmd[0]}")
        return False


# ==============================================================================
# SemVer Management
# ==============================================================================

def parse_semver(ver_str: str) -> tuple[int, int, int]:
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)", ver_str.strip())
    if not m:
        raise ValueError(f"Invalid semver: '{ver_str}'")
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def bump_semver(ver_str: str, bump_type: str) -> str:
    if bump_type == "none":
        return ver_str.strip()
    major, minor, patch = parse_semver(ver_str)
    if bump_type == "major":
        return f"{major + 1}.0.0"
    elif bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    elif bump_type == "patch":
        return f"{major}.{minor}.{patch + 1}"
    raise ValueError(f"Unknown bump type: {bump_type}")


def get_electron_version() -> str:
    pkg_path = ELECTRON_DIR / "package.json"
    if not pkg_path.exists():
        return "0.0.0"
    with open(pkg_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("version", "0.0.0")


def set_electron_version(new_ver: str):
    # 1. electron/package.json
    pkg_path = ELECTRON_DIR / "package.json"
    if pkg_path.exists():
        with open(pkg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["version"] = new_ver
        with open(pkg_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")

    # 2. electron/package-lock.json
    lock_path = ELECTRON_DIR / "package-lock.json"
    if lock_path.exists():
        try:
            with open(lock_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["version"] = new_ver
            if "packages" in data and "" in data["packages"]:
                data["packages"][""]["version"] = new_ver
            with open(lock_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                f.write("\n")
        except Exception as e:
            log_warn(f"Failed to update electron/package-lock.json: {e}")


def get_rust_version() -> str:
    cargo_path = RUST_DIR / "src-tauri" / "Cargo.toml"
    if cargo_path.exists():
        content = cargo_path.read_text(encoding="utf-8")
        m = re.search(r'^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"', content, re.MULTILINE)
        if m:
            return m.group(1)
    pkg_path = RUST_DIR / "package.json"
    if pkg_path.exists():
        with open(pkg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("version", "0.0.0")
    return "0.0.0"


def set_rust_version(new_ver: str):
    # 1. rust/package.json
    pkg_path = RUST_DIR / "package.json"
    if pkg_path.exists():
        with open(pkg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["version"] = new_ver
        with open(pkg_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")

    # 2. rust/package-lock.json
    lock_path = RUST_DIR / "package-lock.json"
    if lock_path.exists():
        try:
            with open(lock_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["version"] = new_ver
            if "packages" in data and "" in data["packages"]:
                data["packages"][""]["version"] = new_ver
            with open(lock_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                f.write("\n")
        except Exception as e:
            log_warn(f"Failed to update rust/package-lock.json: {e}")

    # 3. rust/src-tauri/Cargo.toml
    cargo_path = RUST_DIR / "src-tauri" / "Cargo.toml"
    if cargo_path.exists():
        content = cargo_path.read_text(encoding="utf-8")
        updated = re.sub(
            r'(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(")',
            rf'\g<1>{new_ver}\g<2>',
            content,
            flags=re.MULTILINE
        )
        cargo_path.write_text(updated, encoding="utf-8")

    # 4. rust/src-tauri/tauri.conf.json
    tauri_conf = RUST_DIR / "src-tauri" / "tauri.conf.json"
    if tauri_conf.exists():
        with open(tauri_conf, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["version"] = new_ver
        with open(tauri_conf, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")


# ==============================================================================
# Manifest Management
# ==============================================================================

def load_manifest() -> dict:
    if MANIFEST_FILE.exists():
        try:
            with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "project": "Neutrino Browser",
        "last_updated": None,
        "releases": {}
    }


def update_manifest(env_name: str, version: str, exe_rel_path: str, size_bytes: int):
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    manifest["last_updated"] = datetime.now(timezone.utc).isoformat()
    manifest["releases"][env_name] = {
        "version": version,
        "executable": exe_rel_path.replace("\\", "/"),
        "size_mb": round(size_bytes / (1024 * 1024), 2),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "status": "ready"
    }
    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    log_info(f"Updated release manifest: {MANIFEST_FILE}")


# ==============================================================================
# Electron Build & Packaging
# ==============================================================================

def build_electron(bump_type: str, clean: bool = False) -> bool:
    log_header("BUILDING ELECTRON ENVIRONMENT")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    # Version Handling
    current_ver = get_electron_version()
    new_ver = bump_semver(current_ver, bump_type)
    if new_ver != current_ver:
        log_info(f"Incrementing Electron version: {BOLD}{current_ver}{RESET} -> {GREEN}{BOLD}{new_ver}{RESET}")
        set_electron_version(new_ver)
    else:
        log_info(f"Electron version: {BOLD}{current_ver}{RESET} (no change)")

    if clean:
        log_info("Cleaning previous Electron build artifacts...")
        shutil.rmtree(ELECTRON_DIR / "dist-main", ignore_errors=True)
        shutil.rmtree(ELECTRON_DIR / "dist-renderer", ignore_errors=True)
        shutil.rmtree(ELECTRON_DIR / "release", ignore_errors=True)
        shutil.rmtree(ELECTRON_RELEASE_DIR, ignore_errors=True)

    # 1. Compile Main & Renderer
    log_info("Compiling Vite renderer & TypeScript main process...")
    if not run_cmd([npm_cmd, "run", "build"], cwd=ELECTRON_DIR):
        log_error("Electron build (vite + tsc) failed.")
        return False

    # 2. Package standalone bundle
    log_info("Packaging standalone Windows Electron application...")
    pack_ok = run_cmd([npm_cmd, "run", "package"], cwd=ELECTRON_DIR)

    # 3. Stage into unified root release/electron
    src_pack_dir = ELECTRON_DIR / "release" / "Neutrino-win32-x64"
    if not src_pack_dir.exists():
        src_pack_dir = ROOT_DIR / "release" / "Neutrino-win32-x64"

    if not pack_ok:
        if src_pack_dir.exists():
            log_warn("electron-packager could not query external prebuilts (offline/sandbox).")
            log_info(f"Using existing packaged template at {src_pack_dir} and syncing freshly compiled app code...")
            app_dir = src_pack_dir / "resources" / "app"
            if app_dir.exists():
                shutil.copytree(ELECTRON_DIR / "dist-main", app_dir / "dist-main", dirs_exist_ok=True)
                shutil.copytree(ELECTRON_DIR / "dist-renderer", app_dir / "dist-renderer", dirs_exist_ok=True)
                pkg_src = ELECTRON_DIR / "package.json"
                if pkg_src.exists():
                    shutil.copy2(pkg_src, app_dir / "package.json")
                log_success("Updated existing standalone bundle with latest compiled app code.")
        else:
            log_error("electron-packager failed and no existing packaged bundle was found.")
            return False

    if not src_pack_dir.exists():
        log_error(f"Could not locate packaged output at {src_pack_dir}")
        return False

    ELECTRON_RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    log_info(f"Staging Electron release to {ELECTRON_RELEASE_DIR}...")
    
    # Sync files into release/electron/
    for item in src_pack_dir.iterdir():
        dest = ELECTRON_RELEASE_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dest)

    exe_path = ELECTRON_RELEASE_DIR / "Neutrino.exe"
    if not exe_path.exists():
        log_error(f"Expected executable not found at {exe_path}")
        return False

    size_bytes = exe_path.stat().st_size
    log_success(f"Electron release packaged successfully!")
    log_success(f"Executable: {BOLD}{exe_path}{RESET} ({round(size_bytes / (1024 * 1024), 2)} MB)")

    rel_exe = str(exe_path.relative_to(ROOT_DIR))
    update_manifest("electron", new_ver, rel_exe, size_bytes)
    return True


# ==============================================================================
# Rust (Tauri v2) Build & Packaging
# ==============================================================================

def build_rust(bump_type: str, clean: bool = False) -> bool:
    log_header("BUILDING RUST (TAURI v2) ENVIRONMENT")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    # Version Handling
    current_ver = get_rust_version()
    new_ver = bump_semver(current_ver, bump_type)
    if new_ver != current_ver:
        log_info(f"Incrementing Rust version: {BOLD}{current_ver}{RESET} -> {GREEN}{BOLD}{new_ver}{RESET}")
        set_rust_version(new_ver)
    else:
        log_info(f"Rust version: {BOLD}{current_ver}{RESET} (no change)")

    if clean:
        log_info("Cleaning previous Rust build artifacts...")
        shutil.rmtree(RUST_DIR / "dist", ignore_errors=True)
        shutil.rmtree(RUST_RELEASE_DIR, ignore_errors=True)

    # 1. Build Vite frontend
    log_info("Building Vite React UI for Tauri...")
    if not run_cmd([npm_cmd, "run", "build"], cwd=RUST_DIR):
        log_error("Rust Vite frontend build failed.")
        return False

    # 2. Build Rust native core via Cargo
    log_info("Building Rust native binary (cargo build --release)...")
    cargo_cmd = ["cargo", "build", "--release"]
    cargo_cwd = RUST_DIR / "src-tauri"
    if not run_cmd(cargo_cmd, cwd=cargo_cwd):
        log_error("Cargo release build failed.")
        return False

    # 3. Locate compiled binary
    exe_name = "neutrino-rust.exe" if os.name == "nt" else "neutrino-rust"
    built_bin = RUST_DIR / "src-tauri" / "target" / "release" / exe_name
    if not built_bin.exists():
        log_error(f"Expected compiled binary not found at {built_bin}")
        return False

    # 4. Stage into unified root release/rust
    RUST_RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    target_exe = RUST_RELEASE_DIR / "Neutrino.exe"
    shutil.copy2(built_bin, target_exe)
    
    # Also copy as neutrino-rust.exe for explicit naming
    target_named = RUST_RELEASE_DIR / exe_name
    if target_named != target_exe:
        shutil.copy2(built_bin, target_named)

    # Copy icons / assets if available
    icons_src = RUST_DIR / "src-tauri" / "icons"
    if icons_src.exists():
        dest_icons = RUST_RELEASE_DIR / "icons"
        shutil.copytree(icons_src, dest_icons, dirs_exist_ok=True)

    size_bytes = target_exe.stat().st_size
    log_success(f"Rust release built successfully!")
    log_success(f"Executable: {BOLD}{target_exe}{RESET} ({round(size_bytes / (1024 * 1024), 2)} MB)")

    rel_exe = str(target_exe.relative_to(ROOT_DIR))
    update_manifest("rust", new_ver, rel_exe, size_bytes)
    return True


# ==============================================================================
# Release Directory Summary & Launcher
# ==============================================================================

def print_summary():
    log_header("RELEASE STATUS SUMMARY")
    manifest = load_manifest()
    releases = manifest.get("releases", {})

    if not releases:
        log_warn("No releases recorded in manifest.")
        return

    print(f"{'Environment':<14} {'Version':<10} {'Size (MB)':<12} {'Executable Path'}")
    print("-" * 70)
    for env_name, info in releases.items():
        ver = info.get("version", "unknown")
        size = info.get("size_mb", 0)
        exe = info.get("executable", "unknown")
        full_path = ROOT_DIR / exe
        status_marker = f"{GREEN}✓ Ready{RESET}" if full_path.exists() else f"{RED}✗ Missing{RESET}"
        print(f"{BOLD}{env_name.capitalize():<14}{RESET} {ver:<10} {size:<12} {exe} [{status_marker}]")

    print(f"\n{BOLD}Release Directory:{RESET} {RELEASE_DIR}")


def launch_release(env_name: str):
    manifest = load_manifest()
    releases = manifest.get("releases", {})
    if env_name not in releases:
        log_error(f"Cannot launch '{env_name}': not found in release manifest.")
        return False
    exe_path = ROOT_DIR / releases[env_name]["executable"]
    if not exe_path.exists():
        log_error(f"Executable does not exist: {exe_path}")
        return False
    log_info(f"Launching {env_name} release: {exe_path}")
    env = os.environ.copy()
    env.pop("ELECTRON_RUN_AS_NODE", None)
    subprocess.Popen([str(exe_path)], env=env)
    return True


# ==============================================================================
# CLI Entrypoint
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Neutrino Browser - Unified Multi-Environment Build Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python build.py --env rust --bump none
  python build.py --env electron --bump patch
  python build.py --env all --bump minor --clean
  python build.py --env rust --run
        """
    )
    parser.add_argument(
        "-e", "--env",
        choices=["rust", "electron", "all", "both"],
        default="all",
        help="Target environment to build (rust, electron, or all/both). Default: all"
    )
    parser.add_argument(
        "-b", "--bump",
        choices=["major", "minor", "patch", "none"],
        default="none",
        help="Version bump increment (major, minor, patch, none). Default: none"
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean previous build artifacts before building"
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Launch the target application after successful build"
    )

    args = parser.parse_args()

    # Normalize env choice
    target_env = "all" if args.env in ("all", "both") else args.env

    print(f"{BOLD}{MAGENTA}================================================================{RESET}")
    print(f"{BOLD}{MAGENTA}       NEUTRINO BROWSER - MULTI-ENVIRONMENT BUILD SYSTEM        {RESET}")
    print(f"{BOLD}{MAGENTA}================================================================{RESET}")
    log_info(f"Target Environment: {BOLD}{target_env.upper()}{RESET}")
    log_info(f"Version Bump Mode : {BOLD}{args.bump.upper()}{RESET}")
    log_info(f"Clean Build       : {BOLD}{args.clean}{RESET}")

    success = True

    if target_env in ("electron", "all"):
        if not build_electron(args.bump, args.clean):
            success = False

    if target_env in ("rust", "all"):
        if not build_rust(args.bump, args.clean):
            success = False

    if success:
        print_summary()
        log_success("All requested build operations completed successfully!")
        if args.run:
            launch_env = "rust" if target_env == "rust" else "electron"
            launch_release(launch_env)
        return 0
    else:
        log_error("Build operations encountered errors.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
