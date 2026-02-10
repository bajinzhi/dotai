#!/bin/bash
# DotAI VSCode Extension Packaging Script for Linux/macOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$REPO_ROOT/packages/extension"

echo "📦 Packaging DotAI VSCode extension..."
echo "   Repository: $REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is required but not installed."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "⚠️  pnpm not found. Trying corepack..."
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@8.15.9 --activate
  else
    echo "❌ pnpm is required but not installed."
    exit 1
  fi
fi

cd "$REPO_ROOT"
pnpm install
pnpm --filter dotai-vscode run package

VSIX_FILE=$(ls -t "$EXTENSION_DIR"/*.vsix 2>/dev/null | head -1 || true)
if [ -n "$VSIX_FILE" ]; then
  echo "✓ VSIX generated: $VSIX_FILE"
else
  echo "❌ Packaging finished but no .vsix found."
  exit 1
fi
