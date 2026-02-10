#!/bin/bash
# DotAI Installation Script for Linux/macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/bajinzhi/dotai/main/scripts/install.sh | bash
# Requires: bash 4.0+, Node.js 18+, git

set -e

DOTAI_VERSION="${DOTAI_VERSION:-latest}"
DOTAI_REPO_URL="${DOTAI_REPO_URL:-https://github.com/bajinzhi/dotai.git}"
DOTAI_REF="${DOTAI_REF:-main}"
DOTAI_SRC_DIR="${DOTAI_SRC_DIR:-$HOME/.dotai-src}"
DOTAI_EXTENSION_ID="${DOTAI_EXTENSION_ID:-len.dotai-vscode}"
DOTAI_DOCS_URL="${DOTAI_DOCS_URL:-https://github.com/bajinzhi/dotai#readme}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Installing DotAI...${NC}"

# Check bash version (need 4.0+ for associative arrays if needed later)
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
    echo -e "${YELLOW}⚠️  Warning: Bash version ${BASH_VERSION} detected. Some features may not work correctly.${NC}"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed.${NC}"
    echo -e "${YELLOW}   Please install Node.js >= 18 from https://nodejs.org/${NC}"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
REQUIRED_VERSION="18.0.0"

# Version comparison function (works on both Linux and macOS)
version_ge() {
    # Returns 0 if $1 >= $2
    [ "$(printf '%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)" = "$2" ]
}

if ! version_ge "$NODE_VERSION" "$REQUIRED_VERSION"; then
    echo -e "${RED}❌ Node.js version $NODE_VERSION is too old. Required: >= 18.0.0${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $NODE_VERSION detected${NC}"

# Detect platform
PLATFORM=$(uname -s)
if [ "$PLATFORM" = "Darwin" ]; then
    echo -e "${GRAY}   Platform: macOS${NC}"
elif [ "$PLATFORM" = "Linux" ]; then
    echo -e "${GRAY}   Platform: Linux${NC}"
else
    echo -e "${YELLOW}⚠️  Unknown platform: $PLATFORM. Proceeding anyway...${NC}"
fi

# Detect shell and profile file
SHELL_NAME=$(basename "$SHELL")
if [ "$SHELL_NAME" = "bash" ]; then
    PROFILE_FILE="$HOME/.bashrc"
    [ "$(uname -s)" = "Darwin" ] && PROFILE_FILE="$HOME/.bash_profile"
elif [ "$SHELL_NAME" = "zsh" ]; then
    PROFILE_FILE="$HOME/.zshrc"
elif [ "$SHELL_NAME" = "fish" ]; then
    PROFILE_FILE="$HOME/.config/fish/config.fish"
else
    PROFILE_FILE="$HOME/.profile"
fi

# Check git
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ git is required but not installed.${NC}"
    exit 1
fi

# Check npm global permissions
NPM_PREFIX=$(npm config get prefix 2>/dev/null || true)
NPM_GLOBAL_BIN="$NPM_PREFIX/bin"
NEEDS_SUDO=false
if [ -n "$NPM_PREFIX" ] && [ ! -w "$NPM_PREFIX" ] && [ "$NPM_PREFIX" != "$HOME/.npm-global" ]; then
    NEEDS_SUDO=true
    echo -e "${YELLOW}⚠️  npm global directory is not writable: $NPM_PREFIX${NC}"
    echo -e "${YELLOW}   You may need to run with sudo, or configure npm to use a user directory:${NC}"
    echo -e "${YELLOW}   mkdir ~/.npm-global && npm config set prefix '~/.npm-global'${NC}"
fi

run_pnpm() {
    if command -v pnpm &> /dev/null; then
        pnpm "$@"
    else
        npm exec --yes pnpm@8.15.9 -- "$@"
    fi
}

echo -e "${CYAN}📦 Installing DotAI CLI from source...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install Node.js (which includes npm).${NC}"
    exit 1
fi

if [ -d "$DOTAI_SRC_DIR/.git" ]; then
    echo -e "${GRAY}   Updating source in $DOTAI_SRC_DIR${NC}"
    git -C "$DOTAI_SRC_DIR" fetch --tags --prune
else
    echo -e "${GRAY}   Cloning source to $DOTAI_SRC_DIR${NC}"
    git clone "$DOTAI_REPO_URL" "$DOTAI_SRC_DIR"
fi

if [ "$DOTAI_VERSION" = "latest" ]; then
    TARGET_REF="$DOTAI_REF"
else
    TARGET_REF="$DOTAI_VERSION"
fi

git -C "$DOTAI_SRC_DIR" checkout "$TARGET_REF"
git -C "$DOTAI_SRC_DIR" pull --ff-only origin "$TARGET_REF" 2>/dev/null || true

run_pnpm --dir "$DOTAI_SRC_DIR" install
run_pnpm --dir "$DOTAI_SRC_DIR" run build
run_pnpm --dir "$DOTAI_SRC_DIR/packages/cli" link --global

echo -e "${GREEN}✓ CLI installed successfully from source${NC}"

# Add npm global bin to PATH if needed
if [ -n "$NPM_GLOBAL_BIN" ] && [[ ":$PATH:" != *":$NPM_GLOBAL_BIN:"* ]]; then
    mkdir -p "$(dirname "$PROFILE_FILE")"
    if [ "$SHELL_NAME" = "fish" ]; then
        echo "set -gx PATH \"$NPM_GLOBAL_BIN\" \$PATH" >> "$PROFILE_FILE"
    else
        echo "export PATH=\"$NPM_GLOBAL_BIN:\$PATH\"" >> "$PROFILE_FILE"
    fi
    echo -e "${GREEN}✓ Added $NPM_GLOBAL_BIN to PATH in $PROFILE_FILE${NC}"
    echo -e "${YELLOW}⚠️  Please run 'source $PROFILE_FILE' or restart your terminal to use the 'dotai' command${NC}"
fi

# Verify CLI is runnable
if command -v dotai &> /dev/null; then
    echo -e "${GREEN}✓ dotai command is available${NC}"
else
    echo -e "${YELLOW}⚠️  dotai command not found in current shell.${NC}"
    if [ -n "$NPM_GLOBAL_BIN" ]; then
        echo -e "${YELLOW}   Try: export PATH=\"$NPM_GLOBAL_BIN:\$PATH\"${NC}"
    fi
fi

# Check if VSCode is installed and offer to install extension
if command -v code &> /dev/null; then
    echo ""
    echo -e "${CYAN}📝 VSCode detected. Install DotAI extension?${NC}"
    # Use /dev/tty for interactive input when piped
    if [ -t 0 ]; then
        read -p "   (Y/n) " -n 1 -r
        echo
    else
        REPLY="y"  # Default to yes if non-interactive
    fi
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        echo -e "${CYAN}📦 Installing DotAI VSCode extension...${NC}"
        if code --install-extension "$DOTAI_EXTENSION_ID" 2>/dev/null; then
            echo -e "${GREEN}✓ VSCode extension installed${NC}"
        else
            echo -e "${YELLOW}⚠️  Failed to install VSCode extension (may not be published yet)${NC}"
        fi
    fi
fi

# Check if Cursor is installed and offer to install extension
if command -v cursor &> /dev/null; then
    echo ""
    echo -e "${CYAN}📝 Cursor detected. Install DotAI extension?${NC}"
    if [ -t 0 ]; then
        read -p "   (Y/n) " -n 1 -r
        echo
    else
        REPLY="y"
    fi
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        echo -e "${CYAN}📦 Installing DotAI Cursor extension...${NC}"
        if cursor --install-extension "$DOTAI_EXTENSION_ID" 2>/dev/null; then
            echo -e "${GREEN}✓ Cursor extension installed${NC}"
        else
            echo -e "${YELLOW}⚠️  Failed to install Cursor extension${NC}"
        fi
    fi
fi

echo ""
echo -e "${GREEN}🎉 DotAI installation complete!${NC}"
echo ""
echo -e "${CYAN}Getting started:${NC}"
echo "  dotai init    # Initialize configuration"
echo "  dotai sync    # Sync AI tool configurations"
echo "  dotai status  # Check status"
echo ""
echo -e "${GRAY}Documentation: $DOTAI_DOCS_URL${NC}"
