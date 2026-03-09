#!/bin/bash

# Always run from the directory containing this script
cd "$(dirname "$0")"

echo ""
echo " ========================================="
echo "   Forge Junction - powered by Graydient.ai"
echo " ========================================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo " [ERROR] Node.js is not installed."
    echo ""
    echo " Please download and install Node.js from:"
    echo "   https://nodejs.org  (download the LTS version)"
    echo ""
    echo " After installing, close this window and run launch.sh again."
    echo ""
    open https://nodejs.org
    read -p " Press Enter to exit..."
    exit 1
fi

# Show Node version for diagnostics
NODE_VER=$(node --version)
echo " Node.js $NODE_VER found."
echo ""

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo " Installing dependencies, this may take a minute..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo " [ERROR] npm install failed. Check your internet connection and try again."
        read -p " Press Enter to exit..."
        exit 1
    fi
    echo ""
    echo " Dependencies installed."
    echo ""
fi

# Launch the app
echo " Starting Forge Junction..."
echo " (Close this window to quit the app)"
echo ""

npm run dev

# If npm run dev exits with an error, pause so the user can read it
if [ $? -ne 0 ]; then
    echo ""
    echo " [ERROR] The app exited with an error."
    echo " Check the output above for details."
    read -p " Press Enter to exit..."
fi
