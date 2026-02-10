#!/bin/bash
# DotAI Local Development Installation Script for Linux/macOS
# This script installs from local build (for development)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CLI_DIR="$REPO_ROOT/packages/cli"
EXTENSION_DIR="$REPO_ROOT/packages/extension"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

# Version comparison function (works on both Linux and macOS)
version_ge() {
    [ "$(printf '%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)" = "$2" ]
}

echo -e "${CYAN}🔧 Installing DotAI from local build...${NC}"
echo -e "${GRAY}   Repository: $REPO_ROOT${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed.${NC}"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
if ! version_ge "$NODE_VERSION" "18.0.0"; then
    echo -e "${RED}❌ Node.js version $NODE_VERSION is too old. Required: >= 18.0.0${NC}"
    exit 1
fi

# Check if pnpm is installed, fallback to corepack if available
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm not found. Trying corepack...${NC}"
    if command -v corepack &> /dev/null; then
        if corepack enable && corepack prepare pnpm@8.15.9 --activate; then
            echo -e "${GREEN}✓ pnpm activated via corepack${NC}"
        else
            echo -e "${RED}❌ Failed to activate pnpm with corepack.${NC}"
            echo -e "${YELLOW}   Install with: npm install -g pnpm${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ pnpm is required but not installed, and corepack is unavailable.${NC}"
        echo -e "${YELLOW}   Install with: npm install -g pnpm${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Node.js $NODE_VERSION and pnpm detected${NC}"

# Save original directory
ORIGINAL_DIR=$(pwd)

# Function to cleanup and return to original directory
cleanup() {
    cd "$ORIGINAL_DIR" || true
}
trap cleanup EXIT

# Check npm global permissions
NPM_PREFIX=$(npm config get prefix 2>/dev/null || true)
NEEDS_SUDO=false
if [ -n "$NPM_PREFIX" ] && [ ! -w "$NPM_PREFIX" ] && [ "$NPM_PREFIX" != "$HOME/.npm-global" ]; then
    NEEDS_SUDO=true
    echo -e "${YELLOW}⚠️  npm global directory is not writable: $NPM_PREFIX${NC}"
    echo -e "${YELLOW}   You may need to run with sudo for 'npm link'${NC}"
fi

# Install dependencies
echo ""
echo -e "${CYAN}📦 Installing dependencies...${NC}"
cd "$REPO_ROOT"
if ! pnpm install; then
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

# Build all packages
echo ""
echo -e "${CYAN}🔨 Building packages...${NC}"
if ! pnpm run build; then
    echo -e "${RED}❌ Failed to build packages${NC}"
    exit 1
fi

# Link CLI globally
echo ""
echo -e "${CYAN}🔗 Linking CLI globally...${NC}"
cd "$CLI_DIR"
if ! npm link; then
    echo -e "${RED}❌ Failed to link CLI globally${NC}"
    if [ "$NEEDS_SUDO" = true ]; then
        echo -e "${YELLOW}   Try running with sudo, or fix npm permissions${NC}"
    fi
    exit 1
fi

# Verify installation
echo ""
echo -e "${CYAN}🔍 Verifying installation...${NC}"
if command -v dotai &> /dev/null; then
    DOTAI_VERSION=$(dotai --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✓ CLI installed: $DOTAI_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  CLI not yet available in PATH. Try restarting your terminal.${NC}"
fi

# Install VSCode extension if VSCode is available
if command -v code &> /dev/null; then
    echo ""
    echo -e "${CYAN}📝 Installing VSCode extension...${NC}"
    
    cd "$EXTENSION_DIR"
    
    # Package the extension using workspace-installed vsce
    if ! pnpm exec vsce package --no-git-tag-version --no-update-package-json 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Failed to package VSCode extension${NC}"
    else
        # Find the generated .vsix file
        VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)
        
        if [ -n "$VSIX_FILE" ]; then
            if code --install-extension "$VSIX_FILE" --force 2>/dev/null; then
                echo -e "${GREEN}✓ VSCode extension installed${NC}"
            else
                echo -e "${YELLOW}⚠️  Failed to install VSCode extension${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  No .vsix file found after packaging${NC}"
        fi
    fi
else
    echo ""
    echo -e "${YELLOW}⚠️  VSCode not found. Extension not installed.${NC}"
fi

# Check if Cursor is installed
if command -v cursor &> /dev/null; then
    echo ""
    echo -e "${CYAN}📝 Cursor detected. Installing extension...${NC}"
    
    VSIX_FILE=$(ls -t "$EXTENSION_DIR"/*.vsix 2>/dev/null | head -1)
    if [ -n "$VSIX_FILE" ]; then
        if cursor --install-extension "$VSIX_FILE" --force 2>/dev/null; then
            echo -e "${GREEN}✓ Cursor extension installed${NC}"
        else
            echo -e "${YELLOW}⚠️  Failed to install Cursor extension${NC}"
        fi
    fi
fi

echo ""
echo -e "${GREEN}🎉 Local installation complete!${NC}"
echo ""
echo -e "${CYAN}Development commands:${NC}"
echo "  pnpm run build     # Build all packages"
echo "  pnpm run test      # Run tests"
echo "  pnpm run clean     # Clean build artifacts"
echo ""
echo -e "${CYAN}CLI commands:${NC}"
echo "  dotai init         # Initialize configuration"
echo "  dotai sync         # Sync configurations"
echo "  dotai status       # Check status"
echo ""
echo -e "${GRAY}To uninstall:${NC}"
echo "  npm uninstall -g @dotai/cli"
