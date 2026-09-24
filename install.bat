@echo off
REM ==============================================================================
REM   ⚡ NYX PROXY GRID — WINDOWS ONE-CLICK INSTALLER & LAUNCHER
REM   Repository: https://github.com/Erfan-Fazeli/NyxProxyList
REM   Author: Erfan Fazeli (NyxAgent.dev Developer Studio)
REM ==============================================================================

title NYX Proxy Grid Launcher
cls
echo ==============================================================================
echo   ⚡ NYX PROXY GRID ENGINE  •  WINDOWS SETUP & LAUNCHER
echo ==============================================================================
echo.

where go >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Golang is not installed or not in PATH.
    echo Please download and install Go from: https://go.dev/dl/
    pause
    exit /b 1
)

echo [*] Resolving Go module dependencies...
go mod tidy

echo [*] Compiling nyxProxy.exe...
go build -ldflags="-s -w" -o nyxProxy.exe ./src
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

if not exist data mkdir data
if not exist data\config.json (
    echo { "port": "8080", "domain": "", "email": "", "auto_ssl": false } > data\config.json
)

echo [✓] Build successful! Starting NyxProxy Grid Engine...
echo.
nyxProxy.exe
pause
