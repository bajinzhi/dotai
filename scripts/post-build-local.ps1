#!/usr/bin/env pwsh
# Post-build local setup:
# 1) Re-link dotai CLI globally
# 2) Generate VS Code extension package (.vsix)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CliDir = Join-Path $RepoRoot "packages\cli"
$ExtensionDir = Join-Path $RepoRoot "packages\extension"
$OriginalLocation = Get-Location

function Ensure-Command([string]$name) {
    if (!(Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $name"
    }
}

try {
    Ensure-Command "node"
    Ensure-Command "pnpm"

    Write-Host ""
    Write-Host "🔁 Re-linking dotai CLI..." -ForegroundColor Cyan
    Push-Location $CliDir
    try {
        npm unlink -g @dotai/cli 2>$null | Out-Null
    } catch {
        # Ignore unlink failures to keep relink idempotent.
    }
    npm link
    if ($LASTEXITCODE -ne 0) {
        throw "npm link failed"
    }
    Pop-Location

    Write-Host ""
    Write-Host "📦 Packaging VS Code extension..." -ForegroundColor Cyan
    Push-Location $ExtensionDir
    pnpm run package
    if ($LASTEXITCODE -ne 0) {
        throw "extension package failed"
    }
    $vsix = Get-ChildItem -Path $ExtensionDir -Filter "*.vsix" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    Pop-Location

    if ($vsix) {
        Write-Host "✓ VSIX generated: $($vsix.FullName)" -ForegroundColor Green
    } else {
        throw "VSIX file was not generated"
    }
} finally {
    Set-Location $OriginalLocation
}

