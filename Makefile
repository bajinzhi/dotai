# DotAI Makefile
# Provides convenient shortcuts for common development tasks
#
# NOTE: On Windows, you need to install 'make' first:
#   - Using Chocolatey: choco install make
#   - Using winget: winget install GnuWin32.Make
#   - Or use Git Bash which includes make
#
# Alternatively, Windows users can run the PowerShell scripts directly:
#   .\scripts\install-local.ps1

.PHONY: help install install-local build test clean lint typecheck version-patch version-minor version-major publish-cli publish-ext package-ext setup

# Detect OS
ifeq ($(OS),Windows_NT)
	DETECTED_OS := Windows
else
	DETECTED_OS := $(shell uname -s)
endif

# Default target
help:
	@echo "DotAI Development Commands"
	@echo ""
	@echo "Platform: $(DETECTED_OS)"
	@echo ""
	@echo "Setup:"
	@echo "  make install         Install dependencies and build"
	@echo "  make install-local   Install CLI and extension locally (dev)"
	@echo ""
	@echo "Development:"
	@echo "  make build           Build all packages"
	@echo "  make test            Run all tests"
	@echo "  make clean           Clean build artifacts"
	@echo "  make lint            Run linter"
	@echo "  make typecheck       Run TypeScript type checking"
	@echo ""
	@echo "Release:"
	@echo "  make version-patch   Bump patch version"
	@echo "  make version-minor   Bump minor version"
	@echo "  make version-major   Bump major version"
	@echo "  make publish-cli     Publish CLI to npm"
	@echo "  make publish-ext     Publish extension to VSCode marketplace"
	@echo "  make package-ext     Package extension as .vsix"
	@echo ""
	@echo "Quick Start:"
	@echo "  make setup           Full setup for new developers"

# Setup
install:
	pnpm install
	pnpm run build

install-local:
ifeq ($(DETECTED_OS),Windows)
	@powershell -ExecutionPolicy Bypass -File scripts/install-local.ps1
else
	@bash scripts/install-local.sh
endif

# Development
build:
	pnpm run build

test:
	pnpm run test

clean:
	pnpm run clean

lint:
	pnpm run lint

typecheck:
	cd packages/core && npx tsc --noEmit && \
	cd ../cli && npx tsc --noEmit && \
	cd ../extension && npx tsc --noEmit

# Release
version-patch:
	node scripts/version-bump.js patch

version-minor:
	node scripts/version-bump.js minor

version-major:
	node scripts/version-bump.js major

publish-cli: build
	@echo "Publishing to npm..."
	cd packages/core && npm publish --access public
	cd packages/cli && npm publish --access public

publish-ext: build
	@echo "Publishing to VSCode marketplace..."
	cd packages/extension && vsce publish

package-ext: build
	@echo "Packaging extension..."
	cd packages/extension && vsce package

# Quick start for new developers
setup: install
	@echo ""
	@echo "✓ Setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Run 'make install-local' to install CLI and extension locally"
	@echo "  2. Or run 'dotai init' to initialize configuration"
	@echo ""
