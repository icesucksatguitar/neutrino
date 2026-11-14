#!/usr/bin/env python3
"""
==============================================================================
NEUTRINO BROWSER - MASTER BUILD & PACKAGING ORCHESTRATOR
==============================================================================
Orchestrates compilation of Rust native privacy core, React/TypeScript
Chromium UI, Electron main process, automated test suites, and standalone
native Windows executable generation.
"""

import os
import sys
import shutil
import subprocess
import argparse
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
NATIVE_DIR = ROOT_DIR / "native"
DIST_MAIN = ROOT_DIR / "dist-main"
DIST_RENDERER = ROOT_DIR / "dist-renderer"
RELEASE_DIR = ROOT_DIR / "release"
STANDALONE_DIR = RELEASE_DIR / "Neutrino-win32-x64"
STANDALONE_EXE = STANDALONE_DIR / "Neutrino.exe"

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
    log_info(f"Executing: {cmd_str}")
    try:
        proc = subprocess.run(cmd, cwd=cwd, shell=shell, check=True)
        return proc.returncode == 0
    except subprocess.CalledProcessError as e:
        log_error(f"Command failed (exit code {e.returncode}): {cmd_str}")
        return False
    except FileNotFoundError:
        log_error(f"Tool not found: {cmd[0]}")
        return False

def check_env() -> bool:
    """Verifies that all required toolchains are installed."""
    log_info("Inspecting toolchains and prerequisites...")
    checks = [
        (["git", "--version"], "Git"),
        (["node", "--version"], "Node.js"),
        (["npm.cmd" if os.name == "nt" else "npm", "--version"], "NPM"),
        (["cargo", "--version"], "Cargo"),
        (["rustc", "--version"], "Rust Compiler"),
    ]

    all_ok = True
    for cmd, name in checks:
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            log_success(f"Found {name}: {BOLD}{res.stdout.strip().splitlines()[0]}{RESET}")
        except Exception:
            log_error(f"Missing required tool: {name}")
            all_ok = False

    return all_ok

def build_rust(release: bool = True) -> bool:
    """Compile Rust native privacy core."""
    log_info("Building Rust native privacy core...")
    cargo_cmd = ["cargo", "build"]
    if release:
        cargo_cmd.append("--release")

    if not run_cmd(cargo_cmd, cwd=NATIVE_DIR):
        log_error("Rust build failed.")
        return False

    mode = "release" if release else "debug"
    bin_name = "neutrino-core.exe" if os.name == "nt" else "neutrino-core"
    out_bin = NATIVE_DIR / "target" / mode / bin_name
    if out_bin.exists():
        log_success(f"Built native binary: {out_bin} ({out_bin.stat().st_size // 1024} KB)")
        return True
    return False

def build_typescript() -> bool:
    """Compile TypeScript main process and Vite renderer bundle."""
    log_info("Building TypeScript main process and React renderer...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    # 1. Build React UI with Vite
    log_info("Building Vite React renderer UI...")
    if not run_cmd([npm_cmd, "run", "build:renderer"], cwd=ROOT_DIR):
        return False

    # 2. Build Electron Main Process with tsc
    log_info("Building Electron Main Process TypeScript...")
    if not run_cmd([npm_cmd, "run", "build:main"], cwd=ROOT_DIR):
        return False

    log_success("TypeScript & Vite builds completed successfully!")
    return True

def package_standalone_executable() -> bool:
    """Package into a real standalone Windows executable application."""
    log_info("Packaging standalone Windows executable application (like Google Chrome)...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    # Run electron-packager
    pack_cmd = [npm_cmd, "run", "package"]
    if not run_cmd(pack_cmd, cwd=ROOT_DIR):
        log_error("Packaging failed.")
        return False

    # Copy Rust core into release bundle resources
    res_bin_dir = STANDALONE_DIR / "resources" / "bin"
    res_bin_dir.mkdir(parents=True, exist_ok=True)
    rust_release = NATIVE_DIR / "target" / "release"
    for item in rust_release.glob("neutrino*"):
        if item.is_file() and not item.name.endswith(".d"):
            shutil.copy2(item, res_bin_dir / item.name)
            log_info(f"Bundled native engine binary: {item.name}")

    if STANDALONE_EXE.exists():
        size_mb = STANDALONE_EXE.stat().st_size // (1024 * 1024)
        log_success(f"Standalone Windows Browser executable created successfully!")
        log_success(f"Location: {BOLD}{STANDALONE_EXE}{RESET} ({size_mb} MB)")
        return True
    else:
        log_error(f"Expected executable not found at {STANDALONE_EXE}")
        return False

def run_tests() -> bool:
    """Execute all Rust and Python test suites."""
    log_info("Running comprehensive test suites...")

    # 1. Rust unit tests
    log_info("Running Rust unittests...")
    if not run_cmd(["cargo", "test"], cwd=NATIVE_DIR):
        return False

    # 2. Python adblock tests
    py_cmd = sys.executable
    log_info("Running Python adblock tests...")
    if not run_cmd([py_cmd, str(ROOT_DIR / "tests" / "test_adblock.py")], cwd=ROOT_DIR):
        return False

    # 3. Python MCP tests
    log_info("Running Python Model Context Protocol (MCP) tests...")
    if not run_cmd([py_cmd, str(ROOT_DIR / "tests" / "test_mcp.py")], cwd=ROOT_DIR):
        return False

    log_success("All test suites passed successfully!")
    return True

def run_app():
    """Launch the standalone Neutrino Browser executable."""
    env = os.environ.copy()
    env.pop("ELECTRON_RUN_AS_NODE", None)
    if not STANDALONE_EXE.exists():
        log_warn("Standalone executable not found. Running packaged app or launching via electron...")
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        subprocess.Popen([npm_cmd, "start"], cwd=ROOT_DIR, env=env)
        return True

    log_info(f"Launching standalone executable: {STANDALONE_EXE}")
    subprocess.Popen([str(STANDALONE_EXE)], env=env)
    log_success("Neutrino Browser desktop application launched successfully!")
    return True

def main():
    parser = argparse.ArgumentParser(description="Neutrino Browser Build & Orchestrator CLI")
    parser.add_argument(
        "action",
        choices=["check", "rust", "ui", "build", "test", "package", "run", "all"],
        default="all",
        nargs="?",
        help="Action to perform",
    )
    args = parser.parse_args()

    print(f"\n{BOLD}{CYAN}======================================================{RESET}")
    print(f"{BOLD}{CYAN}   NEUTRINO BROWSER - STANDALONE BUILD ORCHESTRATOR   {RESET}")
    print(f"{BOLD}{CYAN}======================================================{RESET}\n")

    if args.action == "check":
        ok = check_env()
    elif args.action == "rust":
        ok = build_rust()
    elif args.action == "ui":
        ok = build_typescript()
    elif args.action == "build":
        ok = build_rust() and build_typescript()
    elif args.action == "test":
        ok = run_tests()
    elif args.action == "package":
        ok = build_rust() and build_typescript() and package_standalone_executable()
    elif args.action == "run":
        ok = run_app()
    elif args.action == "all":
        ok = (
            check_env()
            and build_rust()
            and build_typescript()
            and run_tests()
            and package_standalone_executable()
        )
    else:
        parser.print_help()
        return 1

    if ok:
        log_success("Operation completed successfully!")
        return 0
    else:
        log_error("Operation failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
