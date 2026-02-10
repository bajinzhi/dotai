#!/usr/bin/env pwsh
# DotAI VSCode Extension Packaging Script for Windows

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExtensionDir = Join-Path $RepoRoot "packages\extension"

Write-Host "📦 Packaging DotAI VSCode extension..." -ForegroundColor Cyan
Write-Host "   Repository: $RepoRoot" -ForegroundColor Gray

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is required but not installed." -ForegroundColor Red
    exit 1
}

if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  pnpm not found. Trying corepack..." -ForegroundColor Yellow
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        corepack enable
        corepack prepare pnpm@8.15.9 --activate
    } else {
        Write-Host "❌ pnpm is required but not installed." -ForegroundColor Red
        exit 1
    }
}

$OriginalLocation = Get-Location
Push-Location $RepoRoot

try {
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

    pnpm --filter dotai-vscode run package
    if ($LASTEXITCODE -ne 0) { throw "extension package failed" }

    $vsixFile = Get-ChildItem -Path $ExtensionDir -Filter "*.vsix" |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1

    if ($vsixFile) {
        Write-Host "✓ VSIX generated: $($vsixFile.FullName)" -ForegroundColor Green
    } else {
        Write-Host "❌ Packaging finished but no .vsix found." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
    Set-Location $OriginalLocation
}
