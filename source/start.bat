@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title StartPro Launcher

rem Full Windows package: launch the bundled app directly (no Node.js needed)
if exist "StartPro Launcher.exe" (
  start "" "StartPro Launcher.exe"
  exit /b 0
)

rem Source package fallback: install dependencies and run with Electron
rem Use China mirrors for npm and the Electron runtime zip
set "npm_config_registry=https://registry.npmmirror.com"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
set "npm_config_fetch_retries=5"
set "npm_config_fetch_retry_mintimeout=20000"
set "npm_config_fetch_retry_maxtimeout=120000"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo.
  echo [StartPro] Node.js was not found.
  echo Please install Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

set "NEED_INSTALL=0"
if not exist "node_modules\electron\dist\electron.exe" set "NEED_INSTALL=1"
if not exist "node_modules\adm-zip\package.json" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="1" (
  echo [StartPro] Installing dependencies from npmmirror, please wait...
  call npm.cmd install --include=dev --no-audit --no-fund
  if errorlevel 1 (
    echo [StartPro] First attempt failed, cleaning npm cache and retrying...
    call npm.cmd cache clean --force >nul 2>nul
    call npm.cmd install --include=dev --no-audit --no-fund
  )
)

rem npm may skip electron postinstall when the package exists; run install.js directly
if not exist "node_modules\electron\dist\electron.exe" if exist "node_modules\electron\install.js" (
  echo [StartPro] Repairing Electron runtime...
  call node "node_modules\electron\install.js"
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo [StartPro] Electron runtime is still missing.
  echo This usually means the download was interrupted or node_modules is locked.
  echo.
  echo Fix: close this window, delete the "node_modules" folder,
  echo move the project to a local path such as C:\StartPro, then run start.bat again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\adm-zip\package.json" (
  echo.
  echo [StartPro] Dependency "adm-zip" is missing.
  echo Close this window, delete the "node_modules" folder, then run start.bat again.
  echo.
  pause
  exit /b 1
)

rem Create desktop shortcut once (after dependencies are ready)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcut.ps1" >nul 2>nul

echo [StartPro] Starting...
call npm.cmd start
if errorlevel 1 (
  echo.
  echo [StartPro] The launcher exited with an error. See the message above.
  pause
)
endlocal
