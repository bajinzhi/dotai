#!/usr/bin/env pwsh
# DotAI Local Development Installation Script for Windows
# This script installs from local build (for development)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CliDir = "$RepoRoot\packages\cli"
$ExtensionDir = "$RepoRoot\packages\extension"

Write-Host "🔧 Installing DotAI from local build..." -ForegroundColor Cyan
Write-Host "   Repository: $RepoRoot" -ForegroundColor Gray

# Check if Node.js is installed
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is required but not installed." -ForegroundColor Red
    exit 1
}

# Check if pnpm is installed, fallback to corepack if available
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  pnpm not found. Trying corepack..." -ForegroundColor Yellow
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        try {
            corepack enable
            corepack prepare pnpm@8.15.9 --activate
            if ($LASTEXITCODE -ne 0) {
                throw "corepack failed"
            }
            Write-Host "✓ pnpm activated via corepack" -ForegroundColor Green
        } catch {
            Write-Host "❌ Failed to activate pnpm with corepack." -ForegroundColor Red
            Write-Host "   Install with: npm install -g pnpm" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "❌ pnpm is required but not installed, and corepack is unavailable." -ForegroundColor Red
        Write-Host "   Install with: npm install -g pnpm" -ForegroundColor Yellow
        exit 1
    }
}

# Save original location
$OriginalLocation = Get-Location

# Install dependencies
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm install failed"
    }
} catch {
    Write-Host "❌ Failed to install dependencies: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Build all packages
Write-Host ""
Write-Host "🔨 Building packages..." -ForegroundColor Cyan
try {
    pnpm run build
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm build failed"
    }
} catch {
    Write-Host "❌ Failed to build packages: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Check if global npm write requires admin
Write-Host ""
Write-Host "🔗 Linking CLI globally..." -ForegroundColor Cyan
$npmPrefix = npm config get prefix 2>$null
$needsAdmin = $false
if ($npmPrefix) {
    try {
        $testFile = "$npmPrefix\_write_test_"
        [IO.File]::OpenWrite($testFile).Close()
        Remove-Item $testFile -ErrorAction SilentlyContinue
    } catch {
        $needsAdmin = $true
    }
}

if ($needsAdmin) {
    Write-Host "⚠️  Administrator privileges may be required for npm link" -ForegroundColor Yellow
    Write-Host "   Please run this script as Administrator or configure npm to use a user directory" -ForegroundColor Yellow
}

Push-Location $CliDir
try {
    npm link
    if ($LASTEXITCODE -ne 0) {
        throw "npm link failed"
    }
} catch {
    Write-Host "❌ Failed to link CLI: $_" -ForegroundColor Red
    Write-Host "   You may need to run as Administrator or check npm configuration" -ForegroundColor Yellow
    Pop-Location
    Pop-Location
    exit 1
}
Pop-Location

# Verify installation
Write-Host ""
Write-Host "🔍 Verifying installation..." -ForegroundColor Cyan
try {
    $dotaiVersion = dotai --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ CLI installed: $dotaiVersion" -ForegroundColor Green
    } else {
        Write-Host "⚠️  CLI link may have failed. Try restarting your terminal." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  CLI not yet available in PATH. Try restarting your terminal." -ForegroundColor Yellow
}

# Install VSCode extension if VSCode is available
if (Get-Command code -ErrorAction SilentlyContinue) {
    Write-Host ""
    Write-Host "📝 Installing VSCode extension..." -ForegroundColor Cyan
    
    Push-Location $ExtensionDir
    try {
        # Package the extension using workspace-installed vsce
        pnpm exec vsce package --no-git-tag-version --no-update-package-json 2>&1 | Out-Null
        
        # Find the generated .vsix file
        $vsixFile = Get-ChildItem -Path $ExtensionDir -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        
        if ($vsixFile) {
            code --install-extension $vsixFile.FullName --force 2>&1 | Out-Null
            Write-Host "✓ VSCode extension installed" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Failed to package VSCode extension" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Failed to install VSCode extension: $_" -ForegroundColor Yellow
    }
    Pop-Location
} else {
    Write-Host ""
    Write-Host "⚠️  VSCode not found. Extension not installed." -ForegroundColor Yellow
}

# Check if Cursor is installed
$CursorPaths = @(
    "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe",
    "$env:PROGRAMFILES\Cursor\Cursor.exe",
    "$env:USERPROFILE\AppData\Local\Programs\cursor\Cursor.exe"
)
$CursorPath = $null
foreach ($path in $CursorPaths) {
    if (Test-Path $path) {
        $CursorPath = $path
        break
    }
}

if ($CursorPath) {
    Write-Host ""
    Write-Host "📝 Cursor detected. Installing extension..." -ForegroundColor Cyan
    
    $vsixFile = Get-ChildItem -Path $ExtensionDir -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($vsixFile) {
        try {
            & $CursorPath --install-extension $vsixFile.FullName --force 2>&1 | Out-Null
            Write-Host "✓ Cursor extension installed" -ForegroundColor Green
        } catch {
            Write-Host "⚠️  Failed to install Cursor extension: $_" -ForegroundColor Yellow
        }
    }
}

# Ensure we return to original directory
Pop-Location
Set-Location $OriginalLocation

Write-Host ""
Write-Host "🎉 Local installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Development commands:" -ForegroundColor Cyan
Write-Host "  pnpm run build     # Build all packages"
Write-Host "  pnpm run test      # Run tests"
Write-Host "  pnpm run clean     # Clean build artifacts"
Write-Host ""
Write-Host "CLI commands:" -ForegroundColor Cyan
Write-Host "  dotai init         # Initialize configuration"
Write-Host "  dotai sync         # Sync configurations"
Write-Host "  dotai status       # Check status"
Write-Host ""
Write-Host "To uninstall:" -ForegroundColor Gray
Write-Host "  npm uninstall -g @dotai/cli"
