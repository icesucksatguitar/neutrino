<#
.SYNOPSIS
    Convenience wrapper for Neutrino Browser multi-environment build orchestrator.

.DESCRIPTION
    Builds, versions, and stages standalone releases for Electron and Rust (Tauri v2).

.PARAMETER env
    Environment to build: 'rust', 'electron', or 'all' (default: 'all')

.PARAMETER bump
    Version bump increment: 'major', 'minor', 'patch', or 'none' (default: 'none')

.PARAMETER clean
    Clean build artifacts before building

.PARAMETER run
    Launch the executable after building

.EXAMPLE
    .\build.ps1 -env rust -bump none
    .\build.ps1 -env electron -bump minor
    .\build.ps1 -env all -bump patch -clean
#>

[CmdletBinding()]
param (
    [ValidateSet("rust", "electron", "all", "both")]
    [string]$env = "all",

    [ValidateSet("major", "minor", "patch", "none")]
    [string]$bump = "none",

    [switch]$clean,
    [switch]$run
)

$scriptPath = Join-Path $PSScriptRoot "build.py"
$pythonArgs = @($scriptPath, "--env", $env, "--bump", $bump)

if ($clean) {
    $pythonArgs += "--clean"
}
if ($run) {
    $pythonArgs += "--run"
}

python @pythonArgs
exit $LASTEXITCODE
