@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
if not exist "%~dp0runtime\electron.exe" (
  echo Missing runtime. Copy the entire pet folder.
  pause
  exit /b 1
)
start "" "%~dp0runtime\electron.exe" "%~dp0app\main.js"
endlocal
