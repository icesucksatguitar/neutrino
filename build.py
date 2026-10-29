#!/usr/bin/env python3
"""
==============================================================================
NEUTRINO BROWSER - MASTER BUILD & PACKAGING ORCHESTRATOR
==============================================================================
Handles compiling the Rust native core, building the React UI, assembling
Firefox engine profiles, and packaging reproducible Windows distributions.
"""

import os
import sys
import shutil
import subprocess
import argparse
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
NATIVE_DIR = ROOT_DIR / "native"
UI_DIR = ROOT_DIR / "ui"
ENGINE_DIR = ROOT_DIR / "engine"
DIST_DIR = ROOT_DIR / "dist" / "neutrino-browser"

# Terminal ANSI colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

def log_info(msg: str):
    print(f"{CYAN}{BOLD}[INFO]{RESET} {msg}")

def log_success(msg: str):
    print(f"{GREEN}{BOLD}[SUCCESS]{RESET} {msg}")

def log_warn(msg: str):
    print(f"{YELLOW}{BOLD}[WARNING]{RESET} {msg}")

def log_error(msg: str):
    print(f"{RED}{BOLD}[ERROR]{RESET} {msg}")

def run_cmd(cmd: list, cwd: Path = ROOT_DIR, shell: bool = False) -> bool:
    cmd_str = " ".join(str(c) for c in cmd)
    log_info(f"Executing: {cmd_str} (in {cwd.name}/)")
    try:
        proc = subprocess.run(cmd, cwd=cwd, shell=shell, check=True)
        return proc.returncode == 0
    except subprocess.CalledProcessError as e:
        log_error(f"Command failed with exit code {e.returncode}: {cmd_str}")
        return False
    except FileNotFoundError:
        log_error(f"Binary not found for command: {cmd[0]}")
        return False

def check_env():
    """Verify all required developer tools are installed and operational."""
    log_info("Inspecting environment dependencies...")
    all_ok = True

    checks = [
        (["git", "--version"], "Git Version Control"),
        (["node", "--version"], "Node.js JavaScript Runtime"),
        (["npm.cmd" if os.name == "nt" else "npm", "--version"], "NPM Package Manager"),
        (["cargo", "--version"], "Rust Cargo Toolchain"),
        (["rustc", "--version"], "Rust Compiler"),
    ]

    for cmd, name in checks:
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            version_line = res.stdout.strip().split("\n")[0]
            log_success(f"Found {name}: {BOLD}{version_line}{RESET}")
        except Exception:
            log_error(f"Missing required tool: {name}")
            all_ok = False

    return all_ok

def build_rust(release: bool = True) -> bool:
    """Compile the Rust native privacy engine and native host binary."""
    log_info("Compiling Rust core & native messaging host...")
    cargo_cmd = ["cargo", "build"]
    if release:
        cargo_cmd.append("--release")

    if not run_cmd(cargo_cmd, cwd=NATIVE_DIR):
        log_error("Failed to compile Rust native module.")
        return False

    binary_name = "neutrino-host.exe" if os.name == "nt" else "neutrino-host"
    mode_dir = "release" if release else "debug"
    target_bin = NATIVE_DIR / "target" / mode_dir / binary_name

    if target_bin.exists():
        log_success(f"Built native host binary: {target_bin} ({target_bin.stat().st_size // 1024} KB)")
        return True
    else:
        log_error(f"Expected binary does not exist at {target_bin}")
        return False

def build_ui() -> bool:
    """Compile React TypeScript UI using Vite."""
    log_info("Building React UI shell...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    # Install dependencies if node_modules is missing
    if not (UI_DIR / "node_modules").exists():
        log_info("Installing UI node_modules...")
        if not run_cmd([npm_cmd, "install"], cwd=UI_DIR):
            return False

    # Typecheck
    log_info("Running TypeScript verification...")
    if not run_cmd([npm_cmd, "run", "typecheck"], cwd=UI_DIR):
        return False

    # Build
    log_info("Building Vite production bundle...")
    if not run_cmd([npm_cmd, "run", "build"], cwd=UI_DIR):
        return False

    dist_index = UI_DIR / "dist" / "index.html"
    if dist_index.exists():
        log_success(f"React UI compiled successfully into {UI_DIR / 'dist'}")
        return True
    else:
        log_error("UI build completed but dist/index.html was not found.")
        return False

def run_tests() -> bool:
    """Execute test suites for Rust, TypeScript, and Python."""
    log_info("Running comprehensive test suites...")

    # 1. Rust tests
    log_info("Running Rust unittests...")
    if not run_cmd(["cargo", "test"], cwd=NATIVE_DIR):
        return False

    # 2. UI Typecheck
    log_info("Running TypeScript typecheck...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    if not run_cmd([npm_cmd, "run", "typecheck"], cwd=UI_DIR):
        return False

    # 3. Python verification tests
    log_info("Running Python configuration tests...")
    test_file = ROOT_DIR / "tests" / "test_build.py"
    if test_file.exists():
        py_cmd = sys.executable
        if not run_cmd([py_cmd, str(test_file)], cwd=ROOT_DIR):
            return False

    log_success("All test suites passed successfully!")
    return True

STANDALONE_DIR = ROOT_DIR / "dist" / "Neutrino-win32-x64"

def package_distribution() -> bool:
    """Assemble standalone desktop browser application distribution."""
    log_info("Packaging standalone Neutrino Desktop Application...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    # 1. Package the native desktop binary
    log_info("Running electron-packager for win32-x64...")
    if not run_cmd([npm_cmd, "run", "package:win"], cwd=UI_DIR):
        log_error("Failed to package standalone desktop application.")
        return False

    standalone_exe = STANDALONE_DIR / "Neutrino.exe"
    if not standalone_exe.exists():
        log_error(f"Expected standalone executable not found at: {standalone_exe}")
        return False

    # 2. Bundle Rust native binaries into standalone application
    res_bin_dir = STANDALONE_DIR / "resources" / "bin"
    res_bin_dir.mkdir(parents=True, exist_ok=True)
    rust_release = NATIVE_DIR / "target" / "release"
    for item in rust_release.glob("neutrino*"):
        if item.is_file() and not item.name.endswith(".d"):
            shutil.copy2(item, res_bin_dir / item.name)
            log_info(f"Bundled native engine binary: {item.name}")

    # 3. Bundle engine profiles and policies
    engine_dest = STANDALONE_DIR / "engine"
    if engine_dest.exists():
        shutil.rmtree(engine_dest)
    shutil.copytree(ENGINE_DIR / "config", engine_dest / "config")
    shutil.copytree(ENGINE_DIR / "manifests", engine_dest / "manifests")
    log_info("Bundled engine profiles and privacy policies.")

    log_success(f"Standalone Desktop Browser built successfully!")
    log_success(f"Executable: {BOLD}{standalone_exe}{RESET} ({standalone_exe.stat().st_size // (1024*1024)} MB)")
    return True

def run_app():
    """Launch the standalone Neutrino Browser desktop application."""
    standalone_exe = STANDALONE_DIR / "Neutrino.exe"
    if not standalone_exe.exists():
        log_error(f"Standalone executable not found at {standalone_exe}. Run 'package' first!")
        return False

    log_info(f"Launching Neutrino Browser: {standalone_exe}")
    subprocess.Popen([str(standalone_exe)])
    log_success("Neutrino Browser desktop application launched successfully!")
    return True

def start_dev():
    """Launch React UI in Vite dev mode."""
    log_info("Launching Vite development server for Neutrino UI...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    run_cmd([npm_cmd, "run", "dev"], cwd=UI_DIR)

def main():
    parser = argparse.ArgumentParser(description="Neutrino Browser Build & Orchestration Tool")
    parser.add_argument("action", choices=["check", "build", "test", "package", "dev", "run", "all"],
                        default="all", nargs="?", help="Action to execute")
    parser.add_argument("--debug", action="store_true", help="Build in debug mode instead of release")

    args = parser.parse_args()

    print(f"\n{BOLD}{CYAN}===================================================={RESET}")
    print(f"{BOLD}{CYAN}   NEUTRINO BROWSER - BUILD ORCHESTRATOR           {RESET}")
    print(f"{BOLD}{CYAN}===================================================={RESET}\n")

    if args.action == "check":
        success = check_env()
    elif args.action == "build":
        success = build_rust(release=not args.debug) and build_ui()
    elif args.action == "test":
        success = run_tests()
    elif args.action == "package":
        success = package_distribution()
    elif args.action == "dev":
        start_dev()
        return 0
    elif args.action == "run":
        return 0 if run_app() else 1
    elif args.action == "all":
        success = (
            check_env()
            and build_rust(release=not args.debug)
            and build_ui()
            and run_tests()
            and package_distribution()
        )
    else:
        parser.print_help()
        return 1

    if success:
        log_success("Operation completed successfully!")
        return 0
    else:
        log_error("Operation failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())

