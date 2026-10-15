@echo off
setlocal
cd /d "%~dp0.."
set "ELECTRON_RUN_AS_NODE=1"
"runtime\electron.exe" "tools\test-core.cjs"
if errorlevel 1 exit /b 1
"runtime\electron.exe" "tools\run-runtime-qa.cjs"
exit /b %errorlevel%
