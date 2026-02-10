#!/usr/bin/env pwsh
# DotAI Installation Script for Windows
# Usage: iwr -useb https://raw.githubusercontent.com/bajinzhi/dotai/main/scripts/install.ps1 | iex
# Requires: PowerShell 5.1+ or PowerShell Core 7+

$ErrorActionPreference = "Stop"

# Detect if running on Windows
$IsWindowsOS = $PSVersionTable.Platform -eq 'Win32NT' -or $env:OS -eq 'Windows_NT'
if (-not $IsWindowsOS) {
    Write-Host "❌ This script is for Windows only. For Linux/macOS, use install.sh" -ForegroundColor Red
    exit 1
}

$DotAIVersion = if ($env:DOTAI_VERSION) { $env:DOTAI_VERSION } else { "latest" }
$DotAIRepoUrl = if ($env:DOTAI_REPO_URL) { $env:DOTAI_REPO_URL } else { "https://github.com/bajinzhi/dotai.git" }
$DotAIRef = if ($env:DOTAI_REF) { $env:DOTAI_REF } else { "main" }
$DotAISrcDir = if ($env:DOTAI_SRC_DIR) { $env:DOTAI_SRC_DIR } else { (Join-Path $HOME ".dotai-src") }
$DotAIExtensionId = if ($env:DOTAI_EXTENSION_ID) { $env:DOTAI_EXTENSION_ID } else { "len.dotai-vscode" }
$DotAIDocsUrl = if ($env:DOTAI_DOCS_URL) { $env:DOTAI_DOCS_URL } else { "https://github.com/bajinzhi/dotai#readme" }

Write-Host "🚀 Installing DotAI..." -ForegroundColor Cyan

# Check if Node.js is installed
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is required but not installed." -ForegroundColor Red
    Write-Host "   Please install Node.js >= 18 from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

$NodeVersion = (node --version).Substring(1)
$RequiredVersion = [Version]"18.0.0"
$CurrentVersion = [Version]$NodeVersion

if ($CurrentVersion -lt $RequiredVersion) {
    Write-Host "❌ Node.js version $NodeVersion is too old. Required: >= 18.0.0" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Node.js $NodeVersion detected" -ForegroundColor Green

# Check if npm global install requires admin (Windows-specific)
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
    Write-Host "⚠️  Administrator privileges may be required for global npm install" -ForegroundColor Yellow
    Write-Host "   Alternatively, you can:" -ForegroundColor Yellow
    Write-Host "   1. Run this script as Administrator" -ForegroundColor Yellow
    Write-Host "   2. Configure npm to use a user directory: npm config set prefix ~/.npm-global" -ForegroundColor Yellow
}

if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ git is required but not installed." -ForegroundColor Red
    exit 1
}

function Invoke-Pnpm {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $Args
    )

    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        & pnpm @Args
    } else {
        & npm exec --yes pnpm@8.15.9 -- @Args
    }
}

Write-Host "📦 Installing DotAI CLI from source..." -ForegroundColor Cyan
try {
    if (Test-Path (Join-Path $DotAISrcDir ".git")) {
        Write-Host "   Updating source in $DotAISrcDir" -ForegroundColor Gray
        git -C $DotAISrcDir fetch --tags --prune
    } else {
        Write-Host "   Cloning source to $DotAISrcDir" -ForegroundColor Gray
        git clone $DotAIRepoUrl $DotAISrcDir
    }

    $targetRef = if ($DotAIVersion -eq "latest") { $DotAIRef } else { $DotAIVersion }
    git -C $DotAISrcDir checkout $targetRef
    try {
        git -C $DotAISrcDir pull --ff-only origin $targetRef 2>$null | Out-Null
    } catch {
        # Ignore pull failures for tag/detached HEAD installs.
    }

    Invoke-Pnpm --dir $DotAISrcDir install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE" }

    Invoke-Pnpm --dir $DotAISrcDir run build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed with exit code $LASTEXITCODE" }

    Invoke-Pnpm --dir (Join-Path $DotAISrcDir "packages\\cli") link --global
    if ($LASTEXITCODE -ne 0) { throw "pnpm link --global failed with exit code $LASTEXITCODE" }

    Write-Host "✓ CLI installed successfully from source" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install CLI from source: $_" -ForegroundColor Red
    Write-Host "   Please check network access and local permissions." -ForegroundColor Yellow
    exit 1
}

# Add npm global bin to PATH if not already present
$npmGlobalBin = $npmPrefix
if ($npmPrefix -and (Test-Path (Join-Path $npmPrefix "bin"))) {
    $npmGlobalBin = Join-Path $npmPrefix "bin"
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($npmGlobalBin -and $UserPath -notlike "*$npmGlobalBin*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$npmGlobalBin", "User")
    Write-Host "✓ Added $npmGlobalBin to PATH" -ForegroundColor Green
    Write-Host "⚠️  Please restart your terminal to use the 'dotai' command" -ForegroundColor Yellow
}

# Verify CLI is runnable
if (Get-Command dotai -ErrorAction SilentlyContinue) {
    Write-Host "✓ dotai command is available" -ForegroundColor Green
} else {
    Write-Host "⚠️  dotai command not found in current shell." -ForegroundColor Yellow
    if ($npmGlobalBin) {
        Write-Host "   You can run: `$env:Path = `"$npmGlobalBin;`$env:Path`"" -ForegroundColor Yellow
    }
}

# Check if VSCode is installed and offer to install extension
if (Get-Command code -ErrorAction SilentlyContinue) {
    Write-Host ""
    Write-Host "📝 VSCode detected. Install DotAI extension?" -ForegroundColor Cyan
    $response = Read-Host "   (Y/n)"
    if ($response -eq '' -or $response -eq 'Y' -or $response -eq 'y') {
        Write-Host "📦 Installing DotAI VSCode extension..." -ForegroundColor Cyan
        try {
            code --install-extension $DotAIExtensionId 2>&1 | Out-Null
            Write-Host "✓ VSCode extension installed" -ForegroundColor Green
        } catch {
            Write-Host "⚠️  Failed to install VSCode extension: $_" -ForegroundColor Yellow
        }
    }
}

# Check if Cursor is installed and offer to install extension
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
    Write-Host "📝 Cursor detected. Install DotAI extension?" -ForegroundColor Cyan
    $response = Read-Host "   (Y/n)"
    if ($response -eq '' -or $response -eq 'Y' -or $response -eq 'y') {
        Write-Host "📦 Installing DotAI Cursor extension..." -ForegroundColor Cyan
        try {
            & $CursorPath --install-extension $DotAIExtensionId 2>&1 | Out-Null
            Write-Host "✓ Cursor extension installed" -ForegroundColor Green
        } catch {
            Write-Host "⚠️  Failed to install Cursor extension: $_" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "🎉 DotAI installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Getting started:" -ForegroundColor Cyan
Write-Host "  dotai init    # Initialize configuration"
Write-Host "  dotai sync    # Sync AI tool configurations"
Write-Host "  dotai status  # Check status"
Write-Host ""
Write-Host "Documentation: $DotAIDocsUrl" -ForegroundColor Gray
