@echo off
title Forge Junction Launcher

echo.
echo  =========================================
echo   Forge Junction - powered by Graydient.ai
echo  =========================================
echo.

:: Check for Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please download and install Node.js from:
    echo    https://nodejs.org  (download the LTS version)
    echo.
    echo  After installing, close this window and run launch.bat again.
    echo.
    pause
    start https://nodejs.org
    exit /b 1
)

:: Show Node version for diagnostics
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  Node.js %NODE_VER% found.
echo.

:: Install dependencies if node_modules is missing
if not exist node_modules (
    echo  Installing dependencies, this may take a minute...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] npm install failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo.
    echo  Dependencies installed.
    echo.
)

:: Launch the app
echo  Starting Forge Junction...
echo  (Close this window to quit the app)
echo.

call npm run dev

:: If npm run dev exits with an error, pause so the user can read it
if errorlevel 1 (
    echo.
    echo  [ERROR] The app exited with an error (code %errorlevel%).
    echo  Check the output above for details.
    pause
)
