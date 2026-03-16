#!/bin/bash

# Always run from the directory containing this script
cd "$(dirname "$0")"

echo ""
echo " ========================================="
echo "   Forge Junction - powered by Graydient.ai"
echo " ========================================="
echo ""

# ── Homebrew path bootstrap ────────────────────────────────────────────────────
# Homebrew isn't always on PATH in script context; add known locations first.
if [ -f "/opt/homebrew/bin/brew" ]; then          # Apple Silicon
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -f "/usr/local/bin/brew" ]; then           # Intel
    eval "$(/usr/local/bin/brew shellenv)"
fi

# ── nvm bootstrap ─────────────────────────────────────────────────────────────
# nvm is typically only loaded in interactive shells; source it manually here.
if ! command -v node &> /dev/null; then
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        source "$HOME/.nvm/nvm.sh"
        nvm use default 2>/dev/null || nvm use node 2>/dev/null
    fi
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo " Node.js not found — installing automatically..."
    echo ""

    # Install Homebrew if needed (it will also prompt for Xcode CLT if required)
    if ! command -v brew &> /dev/null; then
        echo " Homebrew not found — installing Homebrew first..."
        echo " You may be prompted for your Mac password."
        echo ""
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [ $? -ne 0 ]; then
            echo ""
            echo " [ERROR] Homebrew installation failed."
            echo "         Please install it manually from https://brew.sh, then re-run this script."
            read -p " Press Enter to exit..."
            exit 1
        fi
        # Re-evaluate Homebrew PATH after install
        if [ -f "/opt/homebrew/bin/brew" ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -f "/usr/local/bin/brew" ]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
        echo ""
        echo " Homebrew installed."
        echo ""
    fi

    echo " Installing Node.js via Homebrew..."
    brew install node
    if [ $? -ne 0 ]; then
        echo ""
        echo " [ERROR] Node.js installation failed."
        echo "         Please install it manually from https://nodejs.org (LTS version),"
        echo "         then re-run this script."
        read -p " Press Enter to exit..."
        exit 1
    fi

    # Refresh PATH so the newly installed node is visible
    eval "$(brew shellenv)"
    echo ""
fi

# Final guard — something may still be wrong with PATH after install
if ! command -v node &> /dev/null; then
    echo " [ERROR] Node.js still not accessible after installation."
    echo "         Try opening a new terminal window and running launch.sh again."
    echo "         If the problem persists, install Node.js manually: https://nodejs.org"
    echo ""
    open https://nodejs.org 2>/dev/null
    read -p " Press Enter to exit..."
    exit 1
fi

NODE_VER=$(node --version)
echo " Node.js $NODE_VER  |  npm $(npm --version)"
echo ""

# ── npm dependencies ───────────────────────────────────────────────────────────
# Always run npm install — it's a no-op when everything is up to date and
# ensures any new packages added after a git pull are present.
echo " Checking dependencies..."
npm install --loglevel error
if [ $? -ne 0 ]; then
    echo ""
    echo " [ERROR] npm install failed."
    echo "         Check your internet connection and try again."
    read -p " Press Enter to exit..."
    exit 1
fi
echo " Dependencies ready."
echo ""

# ── Launch ────────────────────────────────────────────────────────────────────
echo " Starting Forge Junction..."
echo " (Close this window or press Ctrl+C to quit)"
echo ""

npm run dev

if [ $? -ne 0 ]; then
    echo ""
    echo " [ERROR] The app exited with an error."
    echo " Check the output above for details."
    read -p " Press Enter to exit..."
fi
